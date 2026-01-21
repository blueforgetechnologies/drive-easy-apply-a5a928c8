import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantFilter } from "@/hooks/useTenantFilter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Shield, Users, Trash2, Edit, Save, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Permission {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: string;
  permission_type: string;
  sort_order: number;
  tenant_id: string | null;
}

interface CustomRole {
  id: string;
  name: string;
  description: string | null;
  is_system_role: boolean;
  created_at: string;
  tenant_id: string | null;
}

interface RolePermission {
  role_id: string;
  permission_id: string;
  tenant_id: string | null;
}

interface UserWithRole {
  id: string;
  user_id: string;
  role_id: string;
  assigned_at: string;
  tenant_id: string | null;
}

export default function RoleBuilderTab() {
  const { tenantId, shouldFilter } = useTenantFilter();
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [roles, setRoles] = useState<CustomRole[]>([]);
  const [rolePermissions, setRolePermissions] = useState<RolePermission[]>([]);
  const [userRoles, setUserRoles] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("roles");
  
  // Role creation/editing state
  const [isCreating, setIsCreating] = useState(false);
  const [editingRole, setEditingRole] = useState<CustomRole | null>(null);
  const [roleName, setRoleName] = useState("");
  const [roleDescription, setRoleDescription] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (tenantId || !shouldFilter) {
      loadData();
    }
  }, [tenantId, shouldFilter]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load permissions (global + tenant-specific)
      let permQuery = supabase.from("permissions").select("*").order("sort_order");
      if (shouldFilter && tenantId) {
        permQuery = permQuery.or(`tenant_id.is.null,tenant_id.eq.${tenantId}`);
      }
      
      // Load roles (global + tenant-specific)
      let roleQuery = supabase.from("custom_roles").select("*").order("name");
      if (shouldFilter && tenantId) {
        roleQuery = roleQuery.or(`tenant_id.is.null,tenant_id.eq.${tenantId}`);
      }
      
      // Load role permissions
      let rpQuery = supabase.from("role_permissions").select("*");
      if (shouldFilter && tenantId) {
        rpQuery = rpQuery.or(`tenant_id.is.null,tenant_id.eq.${tenantId}`);
      }
      
      // Load user role assignments
      let urQuery = supabase.from("user_custom_roles").select("*");
      if (shouldFilter && tenantId) {
        urQuery = urQuery.or(`tenant_id.is.null,tenant_id.eq.${tenantId}`);
      }

      const [permRes, roleRes, rpRes, urRes] = await Promise.all([
        permQuery,
        roleQuery,
        rpQuery,
        urQuery
      ]);

      if (permRes.data) setPermissions(permRes.data);
      if (roleRes.data) setRoles(roleRes.data);
      if (rpRes.data) setRolePermissions(rpRes.data);
      if (urRes.data) setUserRoles(urRes.data as UserWithRole[]);
    } catch (error) {
      console.error("Error loading role data:", error);
      toast.error("Failed to load role data");
    } finally {
      setLoading(false);
    }
  };

  const groupedPermissions = permissions.reduce((acc, perm) => {
    if (!acc[perm.category]) {
      acc[perm.category] = { tabs: [], features: [] };
    }
    if (perm.permission_type === 'tab') {
      acc[perm.category].tabs.push(perm);
    } else {
      acc[perm.category].features.push(perm);
    }
    return acc;
  }, {} as Record<string, { tabs: Permission[]; features: Permission[] }>);

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      loads: "Loads",
      business: "Business Manager",
      accounting: "Accounting",
      settings: "Settings",
      load_hunter: "Load Hunter",
      map: "Map",
      maintenance: "Maintenance",
      development: "Development",
      changelog: "Changelog",
      roles: "Roles",
      fleet_financials: "Fleet Financials",
      carrier_dashboard: "Carrier Dashboard",
      usage: "Usage & Costs",
      analytics: "Analytics",
      tools: "Tools",
      inspector: "Inspector",
      platform_admin: "Platform Admin",
      rollouts: "Rollouts"
    };
    return labels[category] || category;
  };

  const handlePermissionToggle = (permissionId: string) => {
    setSelectedPermissions(prev => {
      const next = new Set(prev);
      if (next.has(permissionId)) {
        next.delete(permissionId);
      } else {
        next.add(permissionId);
      }
      return next;
    });
  };

  const handleSelectAllInCategory = (category: string, select: boolean) => {
    const categoryPerms = permissions.filter(p => p.category === category);
    setSelectedPermissions(prev => {
      const next = new Set(prev);
      categoryPerms.forEach(p => {
        if (select) {
          next.add(p.id);
        } else {
          next.delete(p.id);
        }
      });
      return next;
    });
  };

  const startCreating = () => {
    setIsCreating(true);
    setEditingRole(null);
    setRoleName("");
    setRoleDescription("");
    setSelectedPermissions(new Set());
    // Switch to roles tab to show the editor
    setActiveTab("roles");
  };

  const startEditing = (role: CustomRole) => {
    setEditingRole(role);
    setIsCreating(false);
    setRoleName(role.name);
    setRoleDescription(role.description || "");
    
    const rolePerms = rolePermissions
      .filter(rp => rp.role_id === role.id)
      .map(rp => rp.permission_id);
    setSelectedPermissions(new Set(rolePerms));
  };

  const cancelEditing = () => {
    setIsCreating(false);
    setEditingRole(null);
    setRoleName("");
    setRoleDescription("");
    setSelectedPermissions(new Set());
  };

  const saveRole = async () => {
    if (!roleName.trim()) {
      toast.error("Role name is required");
      return;
    }

    try {
      let roleId: string;

      if (editingRole) {
        // Update existing role
        const { error } = await supabase
          .from("custom_roles")
          .update({ name: roleName, description: roleDescription })
          .eq("id", editingRole.id);
        
        if (error) throw error;
        roleId = editingRole.id;

        // Delete existing permissions for this role
        await supabase
          .from("role_permissions")
          .delete()
          .eq("role_id", roleId);
      } else {
        // Create new role with tenant_id
        const roleData: any = { name: roleName, description: roleDescription };
        if (shouldFilter && tenantId) {
          roleData.tenant_id = tenantId;
        }
        
        const { data, error } = await supabase
          .from("custom_roles")
          .insert(roleData)
          .select()
          .single();
        
        if (error) throw error;
        roleId = data.id;
      }

      // Insert new permissions
      if (selectedPermissions.size > 0) {
        const permissionInserts = Array.from(selectedPermissions).map(permId => {
          const insert: any = {
            role_id: roleId,
            permission_id: permId
          };
          if (shouldFilter && tenantId) {
            insert.tenant_id = tenantId;
          }
          return insert;
        });

        const { error: permError } = await supabase
          .from("role_permissions")
          .insert(permissionInserts);
        
        if (permError) throw permError;
      }

      toast.success(editingRole ? "Role updated" : "Role created");
      cancelEditing();
      loadData();
    } catch (error: any) {
      console.error("Error saving role:", error);
      toast.error(error.message || "Failed to save role");
    }
  };

  const deleteRole = async (role: CustomRole) => {
    if (role.is_system_role) {
      toast.error("Cannot delete system roles");
      return;
    }

    try {
      const { error } = await supabase
        .from("custom_roles")
        .delete()
        .eq("id", role.id);
      
      if (error) throw error;
      toast.success("Role deleted");
      loadData();
    } catch (error: any) {
      console.error("Error deleting role:", error);
      toast.error(error.message || "Failed to delete role");
    }
  };

  const getRolePermissionCount = (roleId: string) => {
    return rolePermissions.filter(rp => rp.role_id === roleId).length;
  };

  const getUsersWithRole = (roleId: string) => {
    return userRoles.filter(ur => ur.role_id === roleId);
  };

  if (!tenantId && shouldFilter) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Please select a tenant to manage roles.</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Role Builder</h1>
          <p className="text-muted-foreground text-sm">Create and manage custom roles with granular permissions</p>
        </div>
        <Button onClick={startCreating} className="gap-2">
          <Plus className="h-4 w-4" />
          Create Role
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="roles" className="gap-2">
            <Shield className="h-4 w-4" />
            Roles
          </TabsTrigger>
          <TabsTrigger value="permissions" className="gap-2">
            <Users className="h-4 w-4" />
            All Permissions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="roles" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Role List */}
            <Card className={cn(isCreating || editingRole ? "lg:col-span-1" : "lg:col-span-2")}>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Available Roles</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Role Name</TableHead>
                      <TableHead>Permissions</TableHead>
                      <TableHead>Users</TableHead>
                      <TableHead className="w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {roles.map(role => (
                      <TableRow key={role.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{role.name}</span>
                            {role.is_system_role && (
                              <Badge variant="secondary" className="text-xs">System</Badge>
                            )}
                            {!role.tenant_id && (
                              <Badge variant="outline" className="text-xs">Global</Badge>
                            )}
                          </div>
                          {role.description && (
                            <p className="text-xs text-muted-foreground mt-0.5">{role.description}</p>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{getRolePermissionCount(role.id)} permissions</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{getUsersWithRole(role.id).length} users</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8"
                              onClick={() => startEditing(role)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            {!role.is_system_role && (
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => deleteRole(role)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Role Editor */}
            {(isCreating || editingRole) && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">
                      {editingRole ? `Edit: ${editingRole.name}` : "Create New Role"}
                    </CardTitle>
                    <Button variant="ghost" size="icon" onClick={cancelEditing}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Role Name</label>
                    <Input 
                      value={roleName}
                      onChange={(e) => setRoleName(e.target.value)}
                      placeholder="e.g., Senior Dispatcher"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Description</label>
                    <Textarea 
                      value={roleDescription}
                      onChange={(e) => setRoleDescription(e.target.value)}
                      placeholder="Describe what this role can do..."
                      rows={2}
                    />
                  </div>

                  <div className="space-y-3">
                    <label className="text-sm font-medium">Permissions</label>
                    <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                      {Object.entries(groupedPermissions).map(([category, { tabs, features }]) => (
                        <div key={category} className="border rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium text-sm">{getCategoryLabel(category)}</span>
                            <div className="flex gap-1">
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-6 text-xs"
                                onClick={() => handleSelectAllInCategory(category, true)}
                              >
                                All
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-6 text-xs"
                                onClick={() => handleSelectAllInCategory(category, false)}
                              >
                                None
                              </Button>
                            </div>
                          </div>
                          
                          {/* Tab-level permissions */}
                          {tabs.length > 0 && (
                            <div className="mb-2">
                              {tabs.map(perm => (
                                <label 
                                  key={perm.id} 
                                  className="flex items-center gap-2 p-1.5 hover:bg-muted rounded cursor-pointer"
                                >
                                  <Checkbox 
                                    checked={selectedPermissions.has(perm.id)}
                                    onCheckedChange={() => handlePermissionToggle(perm.id)}
                                  />
                                  <span className="text-sm font-medium">{perm.name}</span>
                                  <Badge variant="secondary" className="text-[10px] h-4">Tab</Badge>
                                </label>
                              ))}
                            </div>
                          )}

                          {/* Feature-level permissions */}
                          {features.length > 0 && (
                            <div className="pl-4 space-y-0.5 border-l-2 border-muted ml-2">
                              {features.map(perm => (
                                <label 
                                  key={perm.id} 
                                  className="flex items-center gap-2 p-1.5 hover:bg-muted rounded cursor-pointer"
                                >
                                  <Checkbox 
                                    checked={selectedPermissions.has(perm.id)}
                                    onCheckedChange={() => handlePermissionToggle(perm.id)}
                                  />
                                  <div className="flex-1">
                                    <span className="text-sm">{perm.name}</span>
                                    {perm.description && (
                                      <p className="text-xs text-muted-foreground">{perm.description}</p>
                                    )}
                                  </div>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button onClick={saveRole} className="flex-1 gap-2">
                      <Save className="h-4 w-4" />
                      {editingRole ? "Update Role" : "Create Role"}
                    </Button>
                    <Button variant="outline" onClick={cancelEditing}>
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="permissions" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>All Available Permissions</CardTitle>
              <CardDescription>
                Reference list of all permissions that can be assigned to roles
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {Object.entries(groupedPermissions).map(([category, { tabs, features }]) => (
                  <div key={category}>
                    <h3 className="font-semibold text-lg mb-3">{getCategoryLabel(category)}</h3>
                    <div className="grid gap-2">
                      {[...tabs, ...features].map(perm => (
                        <div key={perm.id} className="flex items-center justify-between p-2 border rounded">
                          <div>
                            <span className="font-medium">{perm.name}</span>
                            {perm.description && (
                              <p className="text-xs text-muted-foreground">{perm.description}</p>
                            )}
                          </div>
                          <Badge variant={perm.permission_type === 'tab' ? 'default' : 'secondary'}>
                            {perm.permission_type}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}