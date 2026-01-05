import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/contexts/TenantContext";
import { useTenantFilter } from "@/hooks/useTenantFilter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, TrendingUp, ShieldCheck, Zap, MapPin, Bot } from "lucide-react";
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
  featureAccess: Record<string, boolean>; // featureKey -> enabled
}

// All features that can be granted per-user
const GRANTABLE_FEATURES = [
  { 
    key: "analytics", 
    label: "Analytics", 
    icon: TrendingUp, 
    description: "Load analytics dashboard",
    color: "text-blue-500"
  },
  { 
    key: "ai_parsing_enabled", 
    label: "AI Parsing", 
    icon: Bot, 
    description: "AI-powered email parsing",
    color: "text-purple-500"
  },
  { 
    key: "geocoding_enabled", 
    label: "Geocoding", 
    icon: MapPin, 
    description: "Location geocoding",
    color: "text-green-500"
  },
] as const;

type FeatureKey = typeof GRANTABLE_FEATURES[number]['key'];

export function FeatureAccessManager() {
  const { isPlatformAdmin, effectiveTenant, memberships } = useTenantContext();
  const { tenantId, shouldFilter } = useTenantFilter();
  const [users, setUsers] = useState<TenantUserWithAccess[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [tenants, setTenants] = useState<Array<{ id: string; name: string; slug: string }>>([]);

  // Only show for platform admins or tenant admins/owners
  const [canManage, setCanManage] = useState(false);

  useEffect(() => {
    checkManagePermission();
  }, [isPlatformAdmin, tenantId]);

  // Load tenants for platform admins
  useEffect(() => {
    if (isPlatformAdmin) {
      loadTenants();
    }
  }, [isPlatformAdmin]);

  // Set initial selected tenant
  useEffect(() => {
    if (isPlatformAdmin && tenants.length > 0 && !selectedTenantId) {
      setSelectedTenantId(tenants[0].id);
    } else if (!isPlatformAdmin && tenantId) {
      setSelectedTenantId(tenantId);
    }
  }, [isPlatformAdmin, tenants, tenantId, selectedTenantId]);

  const loadTenants = async () => {
    const { data, error } = await supabase
      .from("tenants")
      .select("id, name, slug")
      .order("name");
    
    if (!error && data) {
      setTenants(data);
    }
  };

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
    const targetTenantId = selectedTenantId;
    
    if (!targetTenantId) {
      setUsers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Get tenant users
      const { data: tenantUsers, error: tuError } = await supabase
        .from("tenant_users")
        .select("id, user_id, role, is_active")
        .eq("tenant_id", targetTenantId)
        .eq("is_active", true)
        .order("created_at", { ascending: false });

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

      // Get all feature access grants for this tenant
      const { data: accessGrants, error: aError } = await supabase
        .from("tenant_feature_access")
        .select("user_id, feature_key, is_enabled")
        .eq("tenant_id", targetTenantId)
        .eq("is_enabled", true)
        .in("user_id", userIds);

      if (aError) throw aError;

      // Build feature access map per user
      const userFeatureAccess: Record<string, Record<string, boolean>> = {};
      (accessGrants || []).forEach(g => {
        if (!userFeatureAccess[g.user_id]) {
          userFeatureAccess[g.user_id] = {};
        }
        userFeatureAccess[g.user_id][g.feature_key] = g.is_enabled;
      });

      const result: TenantUserWithAccess[] = tenantUsers.map(tu => ({
        ...tu,
        profile: profilesById[tu.user_id],
        featureAccess: userFeatureAccess[tu.user_id] || {},
      }));

      setUsers(result);
    } catch (error) {
      console.error("Error loading users:", error);
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [selectedTenantId]);

  useEffect(() => {
    if (canManage && selectedTenantId) {
      loadUsers();
    }
  }, [canManage, selectedTenantId, loadUsers]);

  const toggleFeatureAccess = async (user: TenantUserWithAccess, featureKey: FeatureKey) => {
    if (!selectedTenantId) {
      toast.error("No tenant selected");
      return;
    }

    const updateKey = `${user.user_id}-${featureKey}`;
    setUpdating(updateKey);
    
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) throw new Error("Not authenticated");

      const currentlyEnabled = user.featureAccess[featureKey] || false;

      if (currentlyEnabled) {
        // Revoke access - delete the row
        const { error } = await supabase
          .from("tenant_feature_access")
          .delete()
          .eq("tenant_id", selectedTenantId)
          .eq("user_id", user.user_id)
          .eq("feature_key", featureKey);

        if (error) throw error;
        
        // Update local state
        setUsers(prev => prev.map(u => 
          u.user_id === user.user_id 
            ? { ...u, featureAccess: { ...u.featureAccess, [featureKey]: false } } 
            : u
        ));
        
        toast.success(`Access revoked for ${user.profile?.full_name || user.profile?.email}`);
      } else {
        // Grant access - upsert the row
        const { error } = await supabase
          .from("tenant_feature_access")
          .upsert({
            tenant_id: selectedTenantId,
            user_id: user.user_id,
            feature_key: featureKey,
            is_enabled: true,
            created_by: currentUser.id,
          }, {
            onConflict: "tenant_id,user_id,feature_key",
          });

        if (error) throw error;
        
        // Update local state
        setUsers(prev => prev.map(u => 
          u.user_id === user.user_id 
            ? { ...u, featureAccess: { ...u.featureAccess, [featureKey]: true } } 
            : u
        ));
        
        toast.success(`Access granted to ${user.profile?.full_name || user.profile?.email}`);
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

  const currentTenantName = tenants.find(t => t.id === selectedTenantId)?.name 
    || effectiveTenant?.name 
    || "this tenant";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              Feature Access Control
            </CardTitle>
            <CardDescription>
              Grant or revoke access to premium features for users
            </CardDescription>
          </div>
          
          {/* Tenant selector for platform admins */}
          {isPlatformAdmin && tenants.length > 0 && (
            <Select value={selectedTenantId || ""} onValueChange={setSelectedTenantId}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select tenant" />
              </SelectTrigger>
              <SelectContent>
                {tenants.map(tenant => (
                  <SelectItem key={tenant.id} value={tenant.id}>
                    {tenant.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!selectedTenantId ? (
          <p className="text-muted-foreground text-center py-4">
            Please select a tenant to manage feature access.
          </p>
        ) : loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : users.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">
            No active users found in {currentTenantName}.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[250px]">User</TableHead>
                <TableHead className="w-[100px]">Role</TableHead>
                {GRANTABLE_FEATURES.map(feature => (
                  <TableHead key={feature.key} className="text-center w-[120px]">
                    <div className="flex items-center justify-center gap-1.5">
                      <feature.icon className={`h-4 w-4 ${feature.color}`} />
                      <span className="text-xs">{feature.label}</span>
                    </div>
                  </TableHead>
                ))}
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
                    {GRANTABLE_FEATURES.map(feature => (
                      <TableCell key={feature.key} className="text-center">
                        {isPlatformAdminUser ? (
                          <Badge className="bg-green-600 text-xs">Always</Badge>
                        ) : (
                          <div className="flex items-center justify-center">
                            {updating === `${user.user_id}-${feature.key}` ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Switch
                                checked={user.featureAccess[feature.key] || false}
                                onCheckedChange={() => toggleFeatureAccess(user, feature.key)}
                              />
                            )}
                          </div>
                        )}
                      </TableCell>
                    ))}
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
