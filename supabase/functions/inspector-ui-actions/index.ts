import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Known edge functions in the system
const KNOWN_EDGE_FUNCTIONS = [
  "inspector-tenants",
  "inspector-feature-flags",
  "inspector-load-hunter-health",
  "inspector-ui-actions",
  "ai-update-customers",
  "archive-old-emails",
  "backfill-customers",
  "capture-vehicle-locations",
  "check-integrations",
  "cleanup-stale-data",
  "elevenlabs-sfx",
  "fetch-carrier-data",
  "fetch-gmail-loads",
  "fetch-highway-data",
  "geocode",
  "get-mapbox-token",
  "get-vehicle-stats",
  "get-weather",
  "gmail-auth",
  "gmail-webhook",
  "optimize-route",
  "parse-freight-dimensions",
  "parse-rate-confirmation",
  "process-email-queue",
  "reparse-fullcircle-emails",
  "reparse-load-emails",
  "reset-missed-loads",
  "samsara-webhook",
  "send-application",
  "send-bid-email",
  "send-dispatcher-login",
  "send-driver-invite",
  "send-invite",
  "send-spend-alert",
  "send-user-login",
  "snapshot-email-volume",
  "snapshot-geocode-stats",
  "snapshot-monthly-usage",
  "sync-carriers-fmcsa",
  "sync-vehicles-samsara",
  "test-ai",
  "track-invite-open",
];

// Known routes in the system
const KNOWN_ROUTES = [
  "/",
  "/apply",
  "/auth",
  "/install",
  "/dashboard",
  "/dashboard/loads",
  "/dashboard/customers",
  "/dashboard/drivers",
  "/dashboard/vehicles",
  "/dashboard/dispatchers",
  "/dashboard/carriers",
  "/dashboard/invoices",
  "/dashboard/settlements",
  "/dashboard/map",
  "/dashboard/load-hunter",
  "/dashboard/inspector",
  "/dashboard/settings",
  "/dashboard/preferences",
];

interface UIAction {
  id: string;
  action_key: string;
  ui_location: string;
  action_type: string;
  backend_target: string | null;
  enabled: boolean;
  feature_flag_key: string | null;
  tenant_scope: string;
  description: string | null;
  last_verified_at: string;
}

interface ActionHealth {
  action: UIAction;
  status: "healthy" | "broken" | "disabled";
  issues: string[];
  backend_exists: boolean;
  feature_flag_enabled: boolean | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client for user auth check
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user token and get user ID
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user is platform admin
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("is_platform_admin")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.is_platform_admin) {
      console.log("Access denied - not a platform admin:", user.id);
      return new Response(
        JSON.stringify({ error: "Platform admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Platform admin verified:", user.id);

    // Fetch all registered UI actions
    const { data: actions, error: actionsError } = await supabase
      .from("ui_action_registry")
      .select("*")
      .order("ui_location", { ascending: true })
      .order("action_key", { ascending: true });

    if (actionsError) {
      console.error("Error fetching UI actions:", actionsError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch UI actions" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch all feature flags for checking
    const { data: featureFlags } = await supabase
      .from("feature_flags")
      .select("key, default_enabled, is_killswitch");

    const flagMap = new Map(featureFlags?.map(f => [f.key, f]) || []);

    // Analyze each action
    const actionHealthList: ActionHealth[] = (actions || []).map((action: UIAction) => {
      const issues: string[] = [];
      let backendExists = true;
      let featureFlagEnabled: boolean | null = null;

      // Check backend target exists
      if (action.backend_target) {
        if (action.action_type === "api_call") {
          // Check if edge function exists
          backendExists = KNOWN_EDGE_FUNCTIONS.includes(action.backend_target);
          if (!backendExists) {
            issues.push(`Edge function "${action.backend_target}" not found`);
          }
        } else if (action.action_type === "navigate") {
          // Check if route exists
          backendExists = KNOWN_ROUTES.some(route => 
            action.backend_target?.startsWith(route) || route.startsWith(action.backend_target || "")
          );
          if (!backendExists) {
            issues.push(`Route "${action.backend_target}" not found`);
          }
        } else if (action.action_type === "mutation") {
          // For mutations, assume Supabase tables exist (could be enhanced)
          backendExists = true;
        } else if (action.action_type === "external_link") {
          // External links are always "valid" from backend perspective
          backendExists = true;
        }
      } else if (action.action_type === "api_call" || action.action_type === "mutation") {
        // API calls and mutations need a backend target
        backendExists = false;
        issues.push("No backend target specified for API call/mutation");
      }

      // Check feature flag status
      if (action.feature_flag_key) {
        const flag = flagMap.get(action.feature_flag_key);
        if (flag) {
          // If killswitch is on and disabled, the action is disabled
          if (flag.is_killswitch && !flag.default_enabled) {
            featureFlagEnabled = false;
            if (action.enabled) {
              issues.push(`Action enabled but feature flag "${action.feature_flag_key}" is disabled (killswitch)`);
            }
          } else {
            featureFlagEnabled = flag.default_enabled;
          }
        } else {
          featureFlagEnabled = null;
          issues.push(`Feature flag "${action.feature_flag_key}" not found`);
        }
      }

      // Determine overall status
      let status: "healthy" | "broken" | "disabled" = "healthy";
      
      if (!action.enabled) {
        status = "disabled";
      } else if (issues.length > 0 || !backendExists) {
        status = "broken";
      } else if (featureFlagEnabled === false) {
        status = "disabled";
      }

      return {
        action,
        status,
        issues,
        backend_exists: backendExists,
        feature_flag_enabled: featureFlagEnabled,
      };
    });

    // Summary stats
    const summary = {
      total: actionHealthList.length,
      healthy: actionHealthList.filter(a => a.status === "healthy").length,
      broken: actionHealthList.filter(a => a.status === "broken").length,
      disabled: actionHealthList.filter(a => a.status === "disabled").length,
    };

    console.log(`UI Actions summary: ${summary.total} total, ${summary.healthy} healthy, ${summary.broken} broken, ${summary.disabled} disabled`);

    return new Response(
      JSON.stringify({ 
        actions: actionHealthList,
        summary,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Unexpected error in inspector-ui-actions:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
