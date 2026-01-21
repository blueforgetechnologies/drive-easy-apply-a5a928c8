import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Shield, Plus, X } from "lucide-react";

interface CustomRole {
  id: string;
  name: string;
  description: string | null;
  is_system_role: boolean;
  tenant_id: string | null;
}

interface UserRoleAssignmentProps {
  userId: string;
  tenantId: string | null;
  compact?: boolean;
  onRoleChange?: () => void;
}

export function UserRoleAssignment({ 
  userId, 
  tenantId, 
  compact = false,
  onRoleChange 
}: UserRoleAssignmentProps) {
  const [availableRoles, setAvailableRoles] = useState<CustomRole[]>([]);
  const [assignedRoleIds, setAssignedRoleIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRole, setSelectedRole] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, [userId, tenantId]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load available roles (global + tenant-specific)
      let rolesQuery = supabase
        .from("custom_roles")
        .select("*")
        .order("name");
      
      if (tenantId) {
        rolesQuery = rolesQuery.or(`tenant_id.is.null,tenant_id.eq.${tenantId}`);
      }

      const { data: roles } = await rolesQuery;
      setAvailableRoles(roles || []);

      // Load user's assigned roles
      const { data: assignments } = await supabase
        .from("user_custom_roles")
        .select("role_id")
        .eq("user_id", userId);

      setAssignedRoleIds((assignments || []).map(a => a.role_id));
    } catch (error) {
      console.error("Error loading role data:", error);
    } finally {
      setLoading(false);
    }
  };

  const assignRole = async () => {
    if (!selectedRole) return;
    
    setSaving(true);
    try {
      const insertData: any = {
        user_id: userId,
        role_id: selectedRole,
      };
      
      if (tenantId) {
        insertData.tenant_id = tenantId;
      }

      const { error } = await supabase
        .from("user_custom_roles")
        .insert(insertData);

      if (error) throw error;

      toast.success("Role assigned successfully");
      setSelectedRole("");
      await loadData();
      onRoleChange?.();
    } catch (error: any) {
      console.error("Error assigning role:", error);
      toast.error(error.message || "Failed to assign role");
    } finally {
      setSaving(false);
    }
  };

  const removeRole = async (roleId: string) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("user_custom_roles")
        .delete()
        .eq("user_id", userId)
        .eq("role_id", roleId);

      if (error) throw error;

      toast.success("Role removed");
      await loadData();
      onRoleChange?.();
    } catch (error: any) {
      console.error("Error removing role:", error);
      toast.error(error.message || "Failed to remove role");
    } finally {
      setSaving(false);
    }
  };

  const assignedRoles = availableRoles.filter(r => assignedRoleIds.includes(r.id));
  const unassignedRoles = availableRoles.filter(r => !assignedRoleIds.includes(r.id));

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading roles...</div>;
  }

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {assignedRoles.length === 0 ? (
          <Badge variant="outline" className="text-muted-foreground border-dashed">
            No role assigned
          </Badge>
        ) : (
          assignedRoles.map(role => (
            <Badge 
              key={role.id} 
              variant="secondary"
              className="gap-1 pr-1"
            >
              <Shield className="h-3 w-3" />
              {role.name}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeRole(role.id);
                }}
                className="ml-1 hover:bg-destructive/20 rounded p-0.5"
                disabled={saving}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))
        )}
        
        {unassignedRoles.length > 0 && (
          <Select value={selectedRole} onValueChange={setSelectedRole}>
            <SelectTrigger className="h-7 w-[140px] text-xs">
              <SelectValue placeholder="Add role..." />
            </SelectTrigger>
            <SelectContent>
              {unassignedRoles.map(role => (
                <SelectItem key={role.id} value={role.id} className="text-xs">
                  {role.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        
        {selectedRole && (
          <Button 
            size="sm" 
            variant="outline" 
            className="h-7 px-2"
            onClick={assignRole}
            disabled={saving}
          >
            <Plus className="h-3 w-3" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Shield className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Custom Roles</span>
      </div>
      
      {assignedRoles.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          No custom role assigned. User cannot access any features.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {assignedRoles.map(role => (
            <Badge 
              key={role.id} 
              variant="secondary"
              className="gap-1.5 py-1 px-2"
            >
              <Shield className="h-3.5 w-3.5" />
              {role.name}
              {role.is_system_role && (
                <span className="text-[10px] opacity-60">(System)</span>
              )}
              <button
                onClick={() => removeRole(role.id)}
                className="ml-1 hover:bg-destructive/20 rounded p-0.5"
                disabled={saving}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      
      {unassignedRoles.length > 0 && (
        <div className="flex items-center gap-2">
          <Select value={selectedRole} onValueChange={setSelectedRole}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select role to assign..." />
            </SelectTrigger>
            <SelectContent>
              {unassignedRoles.map(role => (
                <SelectItem key={role.id} value={role.id}>
                  <div className="flex items-center gap-2">
                    {role.name}
                    {role.is_system_role && (
                      <Badge variant="outline" className="text-[10px] h-4">System</Badge>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Button 
            onClick={assignRole}
            disabled={!selectedRole || saving}
            size="sm"
            className="gap-1"
          >
            <Plus className="h-4 w-4" />
            Assign
          </Button>
        </div>
      )}
    </div>
  );
}
