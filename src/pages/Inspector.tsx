import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export default function Inspector() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function checkAccess() {
      // First check if user is authenticated
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        if (mounted) {
          navigate("/auth", { replace: true });
        }
        return;
      }

      // Check admin role (Platform Admin)
      const { data: roleData, error: roleError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .eq("role", "admin")
        .maybeSingle();

      if (!mounted) return;

      if (roleError) {
        console.error("Error checking admin role:", roleError);
        toast.error("Access denied");
        navigate("/dashboard", { replace: true });
        return;
      }

      if (!roleData) {
        toast.error("Platform Admin access required");
        navigate("/dashboard", { replace: true });
        return;
      }

      // User is authorized
      setAuthorized(true);
      setLoading(false);
    }

    checkAccess();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        navigate("/auth", { replace: true });
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [navigate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!authorized) {
    return null;
  }

  return (
    <div className="p-6 space-y-2">
      <div className="flex items-center gap-2">
        <Shield className="w-5 h-5" />
        <h1 className="text-2xl font-semibold">Platform Inspector</h1>
      </div>
      <p className="text-muted-foreground">
        Admin-only diagnostics. If you can see this page, routing is working.
      </p>
    </div>
  );
}
