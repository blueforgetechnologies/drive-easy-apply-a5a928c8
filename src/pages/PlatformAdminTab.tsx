import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { 
  Building2, 
  Users, 
  Truck, 
  Target,
  Mail,
  AlertTriangle,
  Plus,
  Settings,
  Pause,
  Play,
  Flag,
  RefreshCw,
  BarChart3,
  ShieldCheck,
  Copy,
  Eye
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useImpersonation } from "@/contexts/ImpersonationContext";

interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: string;
  release_channel: string;
  is_paused: boolean;
  rate_limit_per_minute: number;
  rate_limit_per_day: number;
  max_users: number;
  max_vehicles: number;
  max_hunt_plans: number;
  created_at: string;
  api_key: string | null;
  gmail_alias: string | null;
  last_email_received_at: string | null;
  // Computed counts
  user_count?: number;
  vehicle_count?: number;
  hunt_plan_count?: number;
  // Rate limit usage
  minute_usage?: number;
  day_usage?: number;
}

interface TenantFeatureFlag {
  id: string;
  tenant_id: string;
  feature_flag_id: string;
  enabled: boolean;
  feature_flag?: FeatureFlag;
}

interface FeatureFlag {
  id: string;
  key: string;
  name: string;
  description: string;
  default_enabled: boolean;
  is_killswitch: boolean;
}

interface PlatformStats {
  totalTenants: number;
  totalUsers: number;
  totalDrivers: number;
  totalVehicles: number;
  activeHuntPlans: number;
  emailsProcessedToday: number;
  emailsDeduplicatedToday: number;
}

export default function PlatformAdminTab() {
  const navigate = useNavigate();
  const { startImpersonation, isImpersonating, loading: impersonationLoading } = useImpersonation();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [featureFlags, setFeatureFlags] = useState<FeatureFlag[]>([]);
  const [stats, setStats] = useState<PlatformStats>({
    totalTenants: 0,
    totalUsers: 0,
    totalDrivers: 0,
    totalVehicles: 0,
    activeHuntPlans: 0,
    emailsProcessedToday: 0,
    emailsDeduplicatedToday: 0
  });
  
  // Dialogs
  const [showCreateTenant, setShowCreateTenant] = useState(false);
  const [showPauseConfirm, setShowPauseConfirm] = useState(false);
  const [showTenantSettings, setShowTenantSettings] = useState(false);
  const [showFeatureFlagConfirm, setShowFeatureFlagConfirm] = useState(false);
  const [showReleaseChannelConfirm, setShowReleaseChannelConfirm] = useState(false);
  const [showImpersonateDialog, setShowImpersonateDialog] = useState(false);
  const [impersonateReason, setImpersonateReason] = useState("");
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [selectedFlag, setSelectedFlag] = useState<FeatureFlag | null>(null);
  const [pendingReleaseChannel, setPendingReleaseChannel] = useState<{ tenantId: string; channel: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tenantFeatureFlags, setTenantFeatureFlags] = useState<TenantFeatureFlag[]>([]);
  
  // Form state
  const [newTenantName, setNewTenantName] = useState("");
  const [newTenantSlug, setNewTenantSlug] = useState("");
  const [newTenantGmailAlias, setNewTenantGmailAlias] = useState("");
  const [newTenantMcNumber, setNewTenantMcNumber] = useState("");
  const [lookingUpCarrier, setLookingUpCarrier] = useState(false);
  const [editRateLimitMinute, setEditRateLimitMinute] = useState(60);
  const [editRateLimitDay, setEditRateLimitDay] = useState(10000);
  const [editGmailAlias, setEditGmailAlias] = useState("");

  // Handle impersonation start
  const handleStartImpersonation = async () => {
    if (!selectedTenant || !impersonateReason || impersonateReason.length < 10) {
      toast.error("Please provide a reason (at least 10 characters)");
      return;
    }
    
    const success = await startImpersonation(selectedTenant.id, impersonateReason, 30);
    if (success) {
      setShowImpersonateDialog(false);
      setImpersonateReason("");
      setSelectedTenant(null);
      navigate("/dashboard/loads"); // Navigate to a tenant page
    }
  };

  const openImpersonateDialog = (tenant: Tenant) => {
    setSelectedTenant(tenant);
    setImpersonateReason("");
    setShowImpersonateDialog(true);
  };

  useEffect(() => {
    checkAdminAccess();
  }, []);

  const checkAdminAccess = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
        return;
      }

      // Check if user is admin
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .eq("role", "admin")
        .maybeSingle();

      if (!roleData) {
        toast.error("Platform Admin access required");
        navigate("/dashboard");
        return;
      }

      setIsAdmin(true);
      await loadAllData();
    } catch (error: any) {
      toast.error("Error checking access");
      navigate("/dashboard");
    } finally {
      setLoading(false);
    }
  };

  const loadAllData = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        loadTenants(),
        loadFeatureFlags(),
        loadPlatformStats()
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  const loadTenants = async () => {
    const { data, error } = await supabase
      .from("tenants")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading tenants:", error);
      return;
    }

    // Get counts and rate limit usage for each tenant
    const tenantsWithCounts = await Promise.all((data || []).map(async (tenant) => {
      // Get user count
      const { count: userCount } = await supabase
        .from("tenant_users")
        .select("id", { count: "exact" })
        .eq("tenant_id", tenant.id);
      
      // Get today's rate limit usage
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      const minuteStart = new Date();
      minuteStart.setSeconds(0, 0);
      
      const { data: rateLimits } = await supabase
        .from("tenant_rate_limits")
        .select("window_type, request_count, window_start")
        .eq("tenant_id", tenant.id)
        .in("window_type", ["minute", "day"])
        .gte("window_start", dayStart.toISOString());
      
      const dayUsage = rateLimits?.find(r => r.window_type === "day")?.request_count || 0;
      // Get the most recent minute entry
      const minuteEntries = rateLimits?.filter(r => r.window_type === "minute") || [];
      const latestMinute = minuteEntries.sort((a, b) => 
        new Date(b.window_start).getTime() - new Date(a.window_start).getTime()
      )[0];
      const minuteUsage = latestMinute?.request_count || 0;

      return {
        ...tenant,
        user_count: userCount || 0,
        vehicle_count: 0,
        hunt_plan_count: 0,
        minute_usage: minuteUsage,
        day_usage: dayUsage,
      };
    }));

    setTenants(tenantsWithCounts);
  };

  const loadFeatureFlags = async () => {
    const { data, error } = await supabase
      .from("feature_flags")
      .select("*")
      .order("name");

    if (!error && data) {
      setFeatureFlags(data);
    }
  };

  const loadPlatformStats = async () => {
    // Load global stats from existing tables
    const [
      tenantsRes,
      usersRes,
      vehiclesRes,
      huntsRes,
      driversRes
    ] = await Promise.all([
      supabase.from("tenants").select("id", { count: "exact" }),
      supabase.from("profiles").select("id", { count: "exact" }),
      supabase.from("vehicles").select("id", { count: "exact" }),
      supabase.from("hunt_plans").select("id", { count: "exact" }).eq("enabled", true),
      supabase.from("applications").select("id", { count: "exact" }).eq("status", "approved")
    ]);

    // Get today's email stats
    const today = new Date().toISOString().split("T")[0];
    const { data: emailStats } = await supabase
      .from("email_volume_stats")
      .select("emails_processed, emails_received")
      .gte("hour_start", today)
      .order("hour_start", { ascending: false });

    const processedToday = emailStats?.reduce((sum, s) => sum + (s.emails_processed || 0), 0) || 0;
    const receivedToday = emailStats?.reduce((sum, s) => sum + (s.emails_received || 0), 0) || 0;
    const deduplicatedToday = receivedToday - processedToday;

    setStats({
      totalTenants: tenantsRes.count || 0,
      totalUsers: usersRes.count || 0,
      totalDrivers: driversRes.count || 0,
      totalVehicles: vehiclesRes.count || 0,
      activeHuntPlans: huntsRes.count || 0,
      emailsProcessedToday: processedToday,
      emailsDeduplicatedToday: Math.max(0, deduplicatedToday)
    });
  };

  const handleCreateTenant = async () => {
    if (!newTenantName.trim() || !newTenantSlug.trim()) {
      toast.error("Name and slug are required");
      return;
    }

    const slug = newTenantSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
    // Generate gmail_alias from carrier name + MC number
    const sanitizedName = newTenantName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const gmailAlias = newTenantGmailAlias.trim() || `+${sanitizedName}${newTenantMcNumber || ''}`;

    const { data, error } = await supabase
      .from("tenants")
      .insert({
        name: newTenantName.trim(),
        slug,
        gmail_alias: gmailAlias,
        mc_number: newTenantMcNumber || null,
        carrier_name: newTenantName.trim()
      })
      .select()
      .single();

    if (error) {
      if (error.message.includes("tenants_gmail_alias_unique")) {
        toast.error("This Gmail alias is already in use by another tenant");
      } else {
        toast.error(`Failed to create tenant: ${error.message}`);
      }
      return;
    }

    toast.success(`Tenant "${data.name}" created with alias ${gmailAlias}`);
    setShowCreateTenant(false);
    setNewTenantName("");
    setNewTenantSlug("");
    setNewTenantGmailAlias("");
    setNewTenantMcNumber("");
    await loadTenants();
  };

  const handleLookupCarrier = async () => {
    if (!newTenantMcNumber.trim()) {
      toast.error("Enter an MC number to lookup");
      return;
    }

    setLookingUpCarrier(true);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-carrier-data", {
        body: { mc: newTenantMcNumber.trim() }
      });

      if (error) throw error;

      if (data.error || !data.name) {
        toast.error(data.error || "Carrier not found");
        return;
      }

      // Populate form with carrier data
      setNewTenantName(data.dba_name || data.name);
      const slug = (data.dba_name || data.name).toLowerCase().replace(/[^a-z0-9]+/g, "-");
      setNewTenantSlug(slug);
      
      // Generate alias: sanitized name + MC number
      const sanitizedName = (data.dba_name || data.name).replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      const mcClean = data.mc_number || newTenantMcNumber.replace(/\D/g, '');
      setNewTenantGmailAlias(`+${sanitizedName}${mcClean}`);
      
      toast.success(`Found: ${data.dba_name || data.name}`);
    } catch (error: any) {
      toast.error("Lookup failed: " + error.message);
    } finally {
      setLookingUpCarrier(false);
    }
  };

  const handleTogglePause = async (tenant: Tenant) => {
    setSelectedTenant(tenant);
    setShowPauseConfirm(true);
  };

  const confirmTogglePause = async () => {
    if (!selectedTenant) return;

    const { error } = await supabase
      .from("tenants")
      .update({ is_paused: !selectedTenant.is_paused })
      .eq("id", selectedTenant.id);

    if (error) {
      toast.error(`Failed to update tenant: ${error.message}`);
    } else {
      toast.success(`Tenant ${selectedTenant.is_paused ? "resumed" : "paused"}`);
      await loadTenants();
    }

    setShowPauseConfirm(false);
    setSelectedTenant(null);
  };

  const handleToggleFeatureFlag = (flag: FeatureFlag) => {
    setSelectedFlag(flag);
    setShowFeatureFlagConfirm(true);
  };

  const confirmToggleFeatureFlag = async () => {
    if (!selectedFlag) return;

    const { error } = await supabase
      .from("feature_flags")
      .update({ default_enabled: !selectedFlag.default_enabled })
      .eq("id", selectedFlag.id);

    if (error) {
      toast.error(`Failed to update flag: ${error.message}`);
    } else {
      toast.success(`${selectedFlag.name} ${selectedFlag.default_enabled ? "disabled" : "enabled"} globally`);
      await loadFeatureFlags();
    }

    setShowFeatureFlagConfirm(false);
    setSelectedFlag(null);
  };

  const handleUpdateReleaseChannel = (tenantId: string, channel: string) => {
    const tenant = tenants.find(t => t.id === tenantId);
    if (tenant && tenant.release_channel !== channel) {
      setPendingReleaseChannel({ tenantId, channel });
      setSelectedTenant(tenant);
      setShowReleaseChannelConfirm(true);
    }
  };

  const confirmUpdateReleaseChannel = async () => {
    if (!pendingReleaseChannel) return;

    const { error } = await supabase
      .from("tenants")
      .update({ release_channel: pendingReleaseChannel.channel as "internal" | "pilot" | "general" })
      .eq("id", pendingReleaseChannel.tenantId);

    if (error) {
      toast.error(`Failed to update channel: ${error.message}`);
    } else {
      toast.success("Release channel updated");
      await loadTenants();
    }

    setShowReleaseChannelConfirm(false);
    setPendingReleaseChannel(null);
    setSelectedTenant(null);
  };

  const handleOpenTenantSettings = async (tenant: Tenant) => {
    setSelectedTenant(tenant);
    setEditRateLimitMinute(tenant.rate_limit_per_minute || 60);
    setEditRateLimitDay(tenant.rate_limit_per_day || 10000);
    setEditGmailAlias(tenant.gmail_alias || "");
    
    // Load tenant-specific feature flags
    const { data } = await supabase
      .from("tenant_feature_flags")
      .select("*, feature_flag:feature_flags(*)")
      .eq("tenant_id", tenant.id);
    
    setTenantFeatureFlags(data || []);
    setShowTenantSettings(true);
  };

  const handleSaveTenantSettings = async () => {
    if (!selectedTenant) return;

    const { error } = await supabase
      .from("tenants")
      .update({
        rate_limit_per_minute: editRateLimitMinute,
        rate_limit_per_day: editRateLimitDay,
        gmail_alias: editGmailAlias.trim() || null,
      })
      .eq("id", selectedTenant.id);

    if (error) {
      if (error.message.includes("tenants_gmail_alias_unique")) {
        toast.error("This Gmail alias is already in use by another tenant");
        return;
      }
      toast.error(`Failed to update settings: ${error.message}`);
    } else {
      toast.success("Tenant settings updated");
      setShowTenantSettings(false);
      await loadTenants();
    }
  };

  const handleToggleTenantFeatureFlag = async (flagId: string, currentlyEnabled: boolean) => {
    if (!selectedTenant) return;

    // Check if override exists
    const existing = tenantFeatureFlags.find(tf => tf.feature_flag_id === flagId);
    
    if (existing) {
      // Update existing override
      const { error } = await supabase
        .from("tenant_feature_flags")
        .update({ enabled: !currentlyEnabled })
        .eq("id", existing.id);
      
      if (error) {
        toast.error(`Failed to update: ${error.message}`);
        return;
      }
    } else {
      // Create new override
      const { error } = await supabase
        .from("tenant_feature_flags")
        .insert({
          tenant_id: selectedTenant.id,
          feature_flag_id: flagId,
          enabled: !currentlyEnabled,
        });
      
      if (error) {
        toast.error(`Failed to create override: ${error.message}`);
        return;
      }
    }

    toast.success("Feature flag updated for tenant");
    // Reload tenant feature flags
    const { data } = await supabase
      .from("tenant_feature_flags")
      .select("*, feature_flag:feature_flags(*)")
      .eq("tenant_id", selectedTenant.id);
    setTenantFeatureFlags(data || []);
  };

  const getTenantFlagEnabled = (flagId: string, defaultEnabled: boolean): boolean => {
    const override = tenantFeatureFlags.find(tf => tf.feature_flag_id === flagId);
    return override ? override.enabled : defaultEnabled;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-8 w-8 text-primary" />
            Platform Admin
          </h1>
          <p className="text-muted-foreground">Manage tenants, feature flags, and platform-wide settings</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => navigate("/dashboard/email-branding")}
          >
            <Mail className="h-4 w-4 mr-2" />
            Email Branding
          </Button>
          <Button 
            variant="outline" 
            onClick={loadAllData}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{stats.totalTenants}</p>
                <p className="text-xs text-muted-foreground">Tenants</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{stats.totalUsers}</p>
                <p className="text-xs text-muted-foreground">Users</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-purple-500" />
              <div>
                <p className="text-2xl font-bold">{stats.totalDrivers}</p>
                <p className="text-xs text-muted-foreground">Drivers</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-orange-500" />
              <div>
                <p className="text-2xl font-bold">{stats.totalVehicles}</p>
                <p className="text-xs text-muted-foreground">Vehicles</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-red-500" />
              <div>
                <p className="text-2xl font-bold">{stats.activeHuntPlans}</p>
                <p className="text-xs text-muted-foreground">Active Hunts</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-cyan-500" />
              <div>
                <p className="text-2xl font-bold">{stats.emailsProcessedToday}</p>
                <p className="text-xs text-muted-foreground">Processed Today</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              <div>
                <p className="text-2xl font-bold">{stats.emailsDeduplicatedToday}</p>
                <p className="text-xs text-muted-foreground">Deduped Today</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tenants Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Tenants
            </CardTitle>
            <CardDescription>Manage all tenant organizations</CardDescription>
          </div>
          <Dialog open={showCreateTenant} onOpenChange={setShowCreateTenant}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Tenant
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Tenant</DialogTitle>
                <DialogDescription>
                  Add a new tenant organization to the platform
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                {/* MC Number Lookup */}
                <div>
                  <Label htmlFor="tenant-mc">MC Number (optional)</Label>
                  <div className="flex gap-2">
                    <Input 
                      id="tenant-mc"
                      value={newTenantMcNumber}
                      onChange={(e) => setNewTenantMcNumber(e.target.value.replace(/\D/g, ''))}
                      placeholder="123456"
                      className="flex-1"
                    />
                    <Button 
                      type="button" 
                      variant="secondary" 
                      onClick={handleLookupCarrier}
                      disabled={lookingUpCarrier || !newTenantMcNumber}
                    >
                      {lookingUpCarrier ? "Looking up..." : "Lookup FMCSA"}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Enter MC number to auto-fill carrier info from FMCSA
                  </p>
                </div>

                <Separator />

                <div>
                  <Label htmlFor="tenant-name">Carrier/Tenant Name</Label>
                  <Input 
                    id="tenant-name"
                    value={newTenantName}
                    onChange={(e) => {
                      setNewTenantName(e.target.value);
                      const slug = e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
                      setNewTenantSlug(slug);
                      // Auto-generate alias with MC if available
                      const sanitizedName = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
                      setNewTenantGmailAlias(`+${sanitizedName}${newTenantMcNumber || ''}`);
                    }}
                    placeholder="Courier Express"
                  />
                </div>
                <div>
                  <Label htmlFor="tenant-slug">URL Slug</Label>
                  <Input 
                    id="tenant-slug"
                    value={newTenantSlug}
                    onChange={(e) => setNewTenantSlug(e.target.value)}
                    placeholder="courier-express"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Used in URLs and API calls
                  </p>
                </div>
                <div>
                  <Label htmlFor="tenant-gmail-alias">Generated Email Alias</Label>
                  <div className="flex items-center gap-2">
                    <Input 
                      id="tenant-gmail-alias"
                      value={newTenantGmailAlias}
                      onChange={(e) => setNewTenantGmailAlias(e.target.value)}
                      placeholder="+courierexpress123456"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        const fullEmail = `talbilogistics${newTenantGmailAlias}@gmail.com`;
                        navigator.clipboard.writeText(fullEmail);
                        toast.success("Email copied to clipboard!");
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="mt-2 p-2 bg-muted rounded-md">
                    <p className="text-xs font-medium">Full Email Address:</p>
                    <code className="text-xs text-primary">
                      talbilogistics{newTenantGmailAlias || "+alias"}@gmail.com
                    </code>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCreateTenant(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateTenant}>
                  Create Tenant
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {tenants.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No tenants yet. Create your first tenant to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Release Channel</TableHead>
                  <TableHead className="text-center">Users</TableHead>
                  <TableHead className="text-center">Rate Limit</TableHead>
                  <TableHead className="text-center">Usage Today</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenants.map((tenant) => (
                  <TableRow key={tenant.id} className={tenant.is_paused ? "opacity-50" : ""}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{tenant.name}</p>
                        <p className="text-xs text-muted-foreground">{tenant.slug}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={
                        tenant.is_paused ? "destructive" :
                        tenant.status === "active" ? "default" :
                        tenant.status === "trial" ? "secondary" : "outline"
                      }>
                        {tenant.is_paused ? "Paused" : tenant.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Select 
                        value={tenant.release_channel as string} 
                        onValueChange={(v) => handleUpdateReleaseChannel(tenant.id, v)}
                      >
                        <SelectTrigger className="w-28 h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="internal">Internal</SelectItem>
                          <SelectItem value="pilot">Pilot</SelectItem>
                          <SelectItem value="general">General</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-center">{tenant.user_count}</TableCell>
                    <TableCell className="text-center">
                      <div className="text-xs">
                        <span>{tenant.rate_limit_per_minute || 60}/min</span>
                        <br />
                        <span className="text-muted-foreground">{tenant.rate_limit_per_day || 10000}/day</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="text-xs">
                        <span className={tenant.minute_usage && tenant.minute_usage > (tenant.rate_limit_per_minute || 60) * 0.8 ? "text-orange-500" : ""}>
                          {tenant.minute_usage || 0}/min
                        </span>
                        <br />
                        <span className={tenant.day_usage && tenant.day_usage > (tenant.rate_limit_per_day || 10000) * 0.8 ? "text-orange-500" : "text-muted-foreground"}>
                          {tenant.day_usage || 0}/day
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(tenant.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => {
                                  navigator.clipboard.writeText(tenant.id);
                                  toast.success("Tenant ID copied to clipboard");
                                }}
                              >
                                <Copy className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs font-mono">{tenant.id}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        {/* View as Tenant button */}
                        {!isImpersonating && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => openImpersonateDialog(tenant)}
                                  disabled={impersonationLoading}
                                  className="text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>View as this tenant</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => navigate(`/dashboard/tenant/${tenant.id}/settings`)}
                        >
                          <Settings className="h-4 w-4 text-muted-foreground" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleTogglePause(tenant)}
                        >
                          {tenant.is_paused ? (
                            <Play className="h-4 w-4 text-green-500" />
                          ) : (
                            <Pause className="h-4 w-4 text-orange-500" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Feature Flags Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Flag className="h-5 w-5" />
            Feature Flags
          </CardTitle>
          <CardDescription>Control feature availability across the platform</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {featureFlags.map((flag) => (
              <div 
                key={flag.id} 
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{flag.name}</p>
                    {flag.is_killswitch && (
                      <Badge variant="destructive" className="text-xs">Killswitch</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{flag.description}</p>
                  <p className="text-xs text-muted-foreground mt-1">Key: {flag.key}</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-sm text-muted-foreground">
                    {flag.default_enabled ? "Enabled" : "Disabled"} by default
                  </div>
                  <Switch
                    checked={flag.default_enabled}
                    onCheckedChange={() => handleToggleFeatureFlag(flag)}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Pause Confirmation Dialog */}
      <AlertDialog open={showPauseConfirm} onOpenChange={setShowPauseConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {selectedTenant?.is_paused ? "Resume" : "Pause"} Tenant?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {selectedTenant?.is_paused 
                ? `This will resume all operations for "${selectedTenant?.name}". Load Hunter ingestion and matching will restart.`
                : `This will immediately pause all operations for "${selectedTenant?.name}". Load Hunter ingestion will stop and users won't be able to process loads.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmTogglePause}>
              {selectedTenant?.is_paused ? "Resume" : "Pause"} Tenant
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Feature Flag Confirmation Dialog */}
      <AlertDialog open={showFeatureFlagConfirm} onOpenChange={setShowFeatureFlagConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {selectedFlag?.default_enabled ? "Disable" : "Enable"} Feature Flag Globally?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {selectedFlag?.default_enabled 
                ? `This will disable "${selectedFlag?.name}" for ALL tenants that don't have an override. This may affect active users.`
                : `This will enable "${selectedFlag?.name}" for ALL tenants that don't have an override.`
              }
              {selectedFlag?.is_killswitch && (
                <span className="block mt-2 text-destructive font-medium">
                  ⚠️ This is a killswitch flag - changes take immediate effect.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmToggleFeatureFlag}>
              {selectedFlag?.default_enabled ? "Disable" : "Enable"} Globally
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Release Channel Confirmation Dialog */}
      <AlertDialog open={showReleaseChannelConfirm} onOpenChange={setShowReleaseChannelConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Change Release Channel?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Change "{selectedTenant?.name}" from <strong>{selectedTenant?.release_channel}</strong> to <strong>{pendingReleaseChannel?.channel}</strong>?
              {pendingReleaseChannel?.channel === "internal" && (
                <span className="block mt-2">This tenant will receive internal/beta features first.</span>
              )}
              {pendingReleaseChannel?.channel === "general" && selectedTenant?.release_channel === "internal" && (
                <span className="block mt-2 text-amber-600">Moving to general may remove access to beta features.</span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingReleaseChannel(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmUpdateReleaseChannel}>
              Change Channel
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Tenant Settings Dialog */}
      <Dialog open={showTenantSettings} onOpenChange={setShowTenantSettings}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              {selectedTenant?.name} Settings
            </DialogTitle>
            <DialogDescription>
              Configure rate limits and feature flags for this tenant
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4 overflow-y-auto flex-1">
            {/* Email Routing */}
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Email Routing
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Configure how loadboard emails are routed to this tenant. Each tenant needs a unique Gmail alias.
                </p>
              </div>
              <div>
                <Label htmlFor="gmail-alias">Gmail Alias</Label>
                <Input
                  id="gmail-alias"
                  value={editGmailAlias}
                  onChange={(e) => setEditGmailAlias(e.target.value)}
                  placeholder="+tenant-slug"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Emails to talbilogistics{editGmailAlias || "+alias"}@gmail.com route to this tenant
                </p>
                {selectedTenant?.last_email_received_at && (
                  <p className="text-xs text-green-600 mt-1">
                    ✓ Last email received: {new Date(selectedTenant.last_email_received_at).toLocaleString()}
                  </p>
                )}
                <div className="mt-2 p-2 bg-muted/50 rounded text-xs text-muted-foreground">
                  <strong>Setup:</strong> Configure Sylectus/FullCircle to send emails to <code className="bg-muted px-1 rounded">talbilogistics{editGmailAlias || "+alias"}@gmail.com</code>
                </div>
              </div>
            </div>

            <Separator />

            {/* Rate Limits */}
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Rate Limits
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Control email processing throughput. Lower limits help prevent overwhelming the system during high volume periods.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="rate-minute">Requests per Minute</Label>
                  <Input
                    id="rate-minute"
                    type="number"
                    value={editRateLimitMinute}
                    onChange={(e) => setEditRateLimitMinute(parseInt(e.target.value) || 60)}
                    min={1}
                    max={1000}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Current: {selectedTenant?.minute_usage || 0}/min • <span className="text-blue-600">Recommended: 60-120</span>
                  </p>
                </div>
                <div>
                  <Label htmlFor="rate-day">Requests per Day</Label>
                  <Input
                    id="rate-day"
                    type="number"
                    value={editRateLimitDay}
                    onChange={(e) => setEditRateLimitDay(parseInt(e.target.value) || 10000)}
                    min={100}
                    max={100000}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Current: {selectedTenant?.day_usage || 0}/day • <span className="text-blue-600">Recommended: 5,000-15,000</span>
                  </p>
                </div>
              </div>
              <div className="p-2 bg-muted/50 rounded text-xs text-muted-foreground">
                <strong>Guidelines:</strong> Small fleets (1-5 trucks): 60/min, 5K/day • Medium (5-20): 120/min, 10K/day • Large (20+): 200/min, 20K/day
              </div>
            </div>

            <Separator />

            {/* Feature Flags */}
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold flex items-center gap-2">
                  <Flag className="h-4 w-4" />
                  Feature Flags (Tenant Override)
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Enable or disable features for this tenant. Overrides inherit the global default unless explicitly set here.
                </p>
              </div>
              <div className="p-2 bg-muted/50 rounded text-xs text-muted-foreground mb-2">
                <strong>Note:</strong> Changes take effect immediately. "Override" badge means this tenant has a custom setting different from the global default.
              </div>
              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {featureFlags.map((flag) => {
                  const isEnabled = getTenantFlagEnabled(flag.id, flag.default_enabled);
                  const hasOverride = tenantFeatureFlags.some(tf => tf.feature_flag_id === flag.id);
                  
                  return (
                    <div 
                      key={flag.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{flag.name}</span>
                          {hasOverride && (
                            <Badge variant="outline" className="text-xs">Override</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{flag.description}</p>
                      </div>
                      <Switch
                        checked={isEnabled}
                        onCheckedChange={() => handleToggleTenantFeatureFlag(flag.id, isEnabled)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTenantSettings(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveTenantSettings}>
              Save Settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Impersonation Dialog */}
      <Dialog open={showImpersonateDialog} onOpenChange={setShowImpersonateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-purple-600" />
              View as Tenant
            </DialogTitle>
            <DialogDescription>
              You're about to impersonate <strong>{selectedTenant?.name}</strong>.
              This will let you see exactly what users in this tenant see.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-amber-800 dark:text-amber-200">This action is audited</p>
                  <p className="text-amber-700 dark:text-amber-300 mt-1">
                    Your impersonation session will be logged with your user ID, tenant ID, reason, and timestamps.
                  </p>
                </div>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="impersonate-reason">Reason for impersonation *</Label>
              <Input 
                id="impersonate-reason"
                value={impersonateReason}
                onChange={(e) => setImpersonateReason(e.target.value)}
                placeholder="e.g., Investigating support ticket #1234"
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Minimum 10 characters required
              </p>
            </div>
            
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Tenant</p>
                <p className="font-medium">{selectedTenant?.name}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Release Channel</p>
                <Badge variant="outline" className="capitalize">
                  {selectedTenant?.release_channel}
                </Badge>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={() => setShowImpersonateDialog(false)}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleStartImpersonation}
              disabled={impersonationLoading || impersonateReason.length < 10}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {impersonationLoading ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4 mr-2" />
                  Start Impersonation
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
