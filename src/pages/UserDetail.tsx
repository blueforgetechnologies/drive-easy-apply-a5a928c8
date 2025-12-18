import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { format } from "date-fns";
import { ArrowLeft, KeyRound, Mail, Shield, User, Calendar, Clock } from "lucide-react";

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
}

interface LoginHistoryEntry {
  id: string;
  logged_in_at: string;
  ip_address: string | null;
  location: string | null;
}

const AVAILABLE_ROLES = [
  { id: "admin", label: "Admin", description: "Full system access, can manage all settings and users" },
  { id: "dispatcher", label: "Dispatcher", description: "Can manage loads, vehicles, and drivers" },
  { id: "driver", label: "Driver", description: "Can view assigned loads and update status" },
] as const;

export default function UserDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<Profile | null>(null);
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [loginHistory, setLoginHistory] = useState<LoginHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingRoles, setSavingRoles] = useState(false);

  useEffect(() => {
    if (id) {
      loadUserData();
    }
  }, [id]);

  const loadUserData = async () => {
    setLoading(true);
    try {
      // Load user profile
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", id)
        .single();

      if (profileError) throw profileError;
      setUser(profileData);

      // Load user roles
      const { data: rolesData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", id);

      setUserRoles(rolesData?.map((r) => r.role) || []);

      // Load login history
      const { data: historyData } = await supabase
        .from("login_history")
        .select("*")
        .eq("user_id", id)
        .order("logged_in_at", { ascending: false })
        .limit(10);

      setLoginHistory(historyData || []);
    } catch (error: any) {
      toast.error("Error loading user: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (role: string, checked: boolean) => {
    if (!id) return;
    
    setSavingRoles(true);
    try {
      if (checked) {
        // Add role
        const { error } = await supabase
          .from("user_roles")
          .insert({ user_id: id, role: role as "admin" | "dispatcher" | "driver" });
        
        if (error) throw error;
        setUserRoles((prev) => [...prev, role]);
        toast.success(`Added ${role} role`);
      } else {
        // Remove role
        const { error } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", id)
          .eq("role", role as "admin" | "dispatcher" | "driver");
        
        if (error) throw error;
        setUserRoles((prev) => prev.filter((r) => r !== role));
        toast.success(`Removed ${role} role`);
      }
    } catch (error: any) {
      toast.error("Error updating role: " + error.message);
    } finally {
      setSavingRoles(false);
    }
  };

  const handleResetPassword = async () => {
    if (!user) return;
    
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/auth?reset=true`,
      });
      if (error) throw error;
      toast.success(`Password reset email sent to ${user.email}`);
    } catch (error: any) {
      toast.error("Failed to send password reset: " + error.message);
    }
  };

  const handleSendLogin = async () => {
    if (!user) return;
    
    try {
      const { error } = await supabase.functions.invoke("send-user-login", {
        body: {
          userId: user.id,
          userEmail: user.email,
          userName: user.full_name || user.email,
        },
      });
      if (error) throw error;
      toast.success(`Login credentials sent to ${user.email}`);
    } catch (error: any) {
      toast.error("Failed to send login: " + error.message);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="h-64 bg-muted rounded" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">User not found</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{user.full_name || "Unnamed User"}</h1>
          <p className="text-muted-foreground">{user.email}</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* User Info Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              User Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-muted-foreground text-sm">Email</Label>
              <p className="font-medium">{user.email}</p>
            </div>
            <div>
              <Label className="text-muted-foreground text-sm">Full Name</Label>
              <p className="font-medium">{user.full_name || "Not set"}</p>
            </div>
            <div>
              <Label className="text-muted-foreground text-sm">Account Created</Label>
              <p className="font-medium">{format(new Date(user.created_at), "PPP")}</p>
            </div>

            <Separator />

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleSendLogin}>
                <Mail className="h-4 w-4 mr-2" />
                Send Login
              </Button>
              <Button variant="outline" size="sm" onClick={handleResetPassword}>
                <KeyRound className="h-4 w-4 mr-2" />
                Reset Password
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Roles Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Roles & Permissions
            </CardTitle>
            <CardDescription>
              Assign roles to control what this user can access
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {AVAILABLE_ROLES.map((role) => (
                <div key={role.id} className="flex items-start space-x-3">
                  <Checkbox
                    id={`role-${role.id}`}
                    checked={userRoles.includes(role.id)}
                    onCheckedChange={(checked) => handleRoleChange(role.id, !!checked)}
                    disabled={savingRoles}
                  />
                  <div className="grid gap-1.5 leading-none">
                    <Label
                      htmlFor={`role-${role.id}`}
                      className="text-sm font-medium cursor-pointer"
                    >
                      {role.label}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {role.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Login History Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Recent Login History
          </CardTitle>
          <CardDescription>
            Last 10 login sessions for this user
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loginHistory.length === 0 ? (
            <p className="text-muted-foreground text-sm">No login history available</p>
          ) : (
            <div className="space-y-3">
              {loginHistory.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex items-center gap-3">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">
                        {format(new Date(entry.logged_in_at), "PPP 'at' p")}
                      </p>
                      {entry.ip_address && (
                        <p className="text-xs text-muted-foreground">
                          IP: {entry.ip_address}
                          {entry.location && ` • ${entry.location}`}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
