import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/contexts/TenantContext";
import { useTenantFilter } from "@/hooks/useTenantFilter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

interface TenantUserWithAccess {
  id: string;
  user_id: string;
  role: string;
  is_active: boolean;
  profile?: {
    id: string;
    email: string;
    full_name: string | null;
    is_platform_admin?: boolean;
  };
  analyticsAccess: boolean;
}

const FEATURE_KEYS = [
  { key: "analytics", label: "Analytics", icon: TrendingUp, description: "Access to load analytics dashboard" },
] as const;

export function FeatureAccessManager() {
  const { isPlatformAdmin, effectiveTenant } = useTenantContext();
  const { tenantId, shouldFilter } = useTenantFilter();
  const [users, setUsers] = useState<TenantUserWithAccess[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  // Only show for platform admins or tenant admins/owners
  const [canManage, setCanManage] = useState(false);

  useEffect(() => {
    checkManagePermission();
  }, [isPlatformAdmin, tenantId]);

  const checkManagePermission = async () => {
    if (isPlatformAdmin) {
      setCanManage(true);
      return;
    }

    if (!tenantId) {
      setCanManage(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setCanManage(false);
      return;
    }

    // Check if user is admin/owner in this tenant
    const { data } = await supabase
      .from("tenant_users")
      .select("role")
      .eq("tenant_id", tenantId)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    setCanManage(data?.role === "admin" || data?.role === "owner");
  };

  const loadUsers = useCallback(async () => {
    if (!tenantId && shouldFilter) {
      setUsers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Build query for tenant users
      let query = supabase
        .from("tenant_users")
        .select("id, user_id, role, is_active")
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (shouldFilter && tenantId) {
        query = query.eq("tenant_id", tenantId);
      }

      const { data: tenantUsers, error: tuError } = await query;
      if (tuError) throw tuError;

      if (!tenantUsers?.length) {
        setUsers([]);
        setLoading(false);
        return;
      }

      // Get profiles
      const userIds = tenantUsers.map(tu => tu.user_id);
      const { data: profiles, error: pError } = await supabase
        .from("profiles")
        .select("id, email, full_name, is_platform_admin")
        .in("id", userIds);

      if (pError) throw pError;

      const profilesById: Record<string, TenantUserWithAccess["profile"]> = {};
      (profiles || []).forEach(p => {
        profilesById[p.id] = p;
      });

      // Get feature access grants
      let accessQuery = supabase
        .from("tenant_feature_access")
        .select("user_id, feature_key, is_enabled")
        .eq("feature_key", "analytics")
        .eq("is_enabled", true)
        .in("user_id", userIds);

      if (shouldFilter && tenantId) {
        accessQuery = accessQuery.eq("tenant_id", tenantId);
      }

      const { data: accessGrants, error: aError } = await accessQuery;
      if (aError) throw aError;

      const usersWithAnalytics = new Set(
        (accessGrants || []).map(g => g.user_id)
      );

      const result: TenantUserWithAccess[] = tenantUsers.map(tu => ({
        ...tu,
        profile: profilesById[tu.user_id],
        analyticsAccess: usersWithAnalytics.has(tu.user_id),
      }));

      setUsers(result);
    } catch (error) {
      console.error("Error loading users:", error);
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [tenantId, shouldFilter]);

  useEffect(() => {
    if (canManage) {
      loadUsers();
    }
  }, [canManage, loadUsers]);

  const toggleAnalyticsAccess = async (user: TenantUserWithAccess) => {
    if (!tenantId) {
      toast.error("No tenant selected");
      return;
    }

    setUpdating(user.user_id);
    
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) throw new Error("Not authenticated");

      if (user.analyticsAccess) {
        // Revoke access - delete the row
        const { error } = await supabase
          .from("tenant_feature_access")
          .delete()
          .eq("tenant_id", tenantId)
          .eq("user_id", user.user_id)
          .eq("feature_key", "analytics");

        if (error) throw error;
        
        // Update local state
        setUsers(prev => prev.map(u => 
          u.user_id === user.user_id ? { ...u, analyticsAccess: false } : u
        ));
        
        toast.success(`Analytics access revoked for ${user.profile?.full_name || user.profile?.email}`);
      } else {
        // Grant access - upsert the row
        const { error } = await supabase
          .from("tenant_feature_access")
          .upsert({
            tenant_id: tenantId,
            user_id: user.user_id,
            feature_key: "analytics",
            is_enabled: true,
            created_by: currentUser.id,
          }, {
            onConflict: "tenant_id,user_id,feature_key",
          });

        if (error) throw error;
        
        // Update local state
        setUsers(prev => prev.map(u => 
          u.user_id === user.user_id ? { ...u, analyticsAccess: true } : u
        ));
        
        toast.success(`Analytics access granted to ${user.profile?.full_name || user.profile?.email}`);
      }
    } catch (error: any) {
      console.error("Error toggling access:", error);
      toast.error(`Failed to update access: ${error.message}`);
    } finally {
      setUpdating(null);
    }
  };

  if (!canManage) {
    return null;
  }

  if (!tenantId && shouldFilter) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Feature Access
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-4">
            Please select a tenant to manage feature access.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          Feature Access
        </CardTitle>
        <CardDescription>
          Grant or revoke access to premium features for users in {effectiveTenant?.name || "this tenant"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : users.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">
            No active users found in this tenant.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <TrendingUp className="h-4 w-4" />
                    Analytics
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map(user => {
                const isPlatformAdminUser = user.profile?.is_platform_admin === true;
                
                return (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          {user.profile?.full_name || "Unknown"}
                          {isPlatformAdminUser && (
                            <Badge variant="secondary" className="text-xs">
                              Platform Admin
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {user.profile?.email}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {isPlatformAdminUser ? (
                        <Badge className="bg-green-600">Always</Badge>
                      ) : (
                        <div className="flex items-center justify-center">
                          {updating === user.user_id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Switch
                              checked={user.analyticsAccess}
                              onCheckedChange={() => toggleAnalyticsAccess(user)}
                            />
                          )}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
