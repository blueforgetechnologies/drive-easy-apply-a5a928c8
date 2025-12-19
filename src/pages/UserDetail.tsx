import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { format } from "date-fns";
import { ArrowLeft, KeyRound, Mail, Shield, User, Calendar, Clock, Save, X, Pencil, Link2, Unlink } from "lucide-react";

interface Dispatcher {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  user_id: string | null;
  pay_percentage: number | null;
}

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  phone_secondary: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  notes: string | null;
  status: string | null;
  created_at: string;
  updated_at: string | null;
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

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"
];

export default function UserDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<Profile | null>(null);
  const [editedUser, setEditedUser] = useState<Profile | null>(null);
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [loginHistory, setLoginHistory] = useState<LoginHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingRoles, setSavingRoles] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dispatchers, setDispatchers] = useState<Dispatcher[]>([]);
  const [linkedDispatcher, setLinkedDispatcher] = useState<Dispatcher | null>(null);
  const [selectedDispatcherId, setSelectedDispatcherId] = useState<string>("");
  const [linkingDispatcher, setLinkingDispatcher] = useState(false);

  useEffect(() => {
    if (id) {
      loadUserData();
      loadDispatchers();
    }
  }, [id]);

  const loadUserData = async () => {
    setLoading(true);
    try {
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", id)
        .single();

      if (profileError) throw profileError;
      setUser(profileData);
      setEditedUser(profileData);

      const { data: rolesData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", id);

      setUserRoles(rolesData?.map((r) => r.role) || []);

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

  const loadDispatchers = async () => {
    try {
      // Get all dispatchers
      const { data: allDispatchers, error } = await supabase
        .from("dispatchers")
        .select("id, first_name, last_name, email, user_id, pay_percentage")
        .order("first_name");

      if (error) throw error;

      // Find if this user is already linked to a dispatcher
      const linked = allDispatchers?.find(d => d.user_id === id) || null;
      setLinkedDispatcher(linked);
      
      // Get unlinked dispatchers (user_id is null) for the dropdown
      const unlinked = allDispatchers?.filter(d => d.user_id === null) || [];
      setDispatchers(unlinked);
    } catch (error: any) {
      console.error("Error loading dispatchers:", error);
    }
  };

  const handleLinkDispatcher = async () => {
    if (!selectedDispatcherId || !id) return;
    
    setLinkingDispatcher(true);
    try {
      const { error } = await supabase
        .from("dispatchers")
        .update({ user_id: id })
        .eq("id", selectedDispatcherId);

      if (error) throw error;
      
      toast.success("Dispatcher profile linked successfully");
      setSelectedDispatcherId("");
      loadDispatchers();
    } catch (error: any) {
      toast.error("Error linking dispatcher: " + error.message);
    } finally {
      setLinkingDispatcher(false);
    }
  };

  const handleUnlinkDispatcher = async () => {
    if (!linkedDispatcher) return;
    
    setLinkingDispatcher(true);
    try {
      const { error } = await supabase
        .from("dispatchers")
        .update({ user_id: null })
        .eq("id", linkedDispatcher.id);

      if (error) throw error;
      
      toast.success("Dispatcher profile unlinked");
      loadDispatchers();
    } catch (error: any) {
      toast.error("Error unlinking dispatcher: " + error.message);
    } finally {
      setLinkingDispatcher(false);
    }
  };

  const handleSave = async () => {
    if (!editedUser || !id) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: editedUser.full_name,
          phone: editedUser.phone,
          phone_secondary: editedUser.phone_secondary,
          address: editedUser.address,
          city: editedUser.city,
          state: editedUser.state,
          zip: editedUser.zip,
          country: editedUser.country,
          notes: editedUser.notes,
          status: editedUser.status,
        })
        .eq("id", id);

      if (error) throw error;
      
      setUser(editedUser);
      setIsEditing(false);
      toast.success("User updated successfully");
    } catch (error: any) {
      toast.error("Error saving user: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditedUser(user);
    setIsEditing(false);
  };

  const handleRoleChange = async (role: string, checked: boolean) => {
    if (!id) return;
    
    setSavingRoles(true);
    try {
      if (checked) {
        const { error } = await supabase
          .from("user_roles")
          .insert({ user_id: id, role: role as "admin" | "dispatcher" | "driver" });
        
        if (error) throw error;
        setUserRoles((prev) => [...prev, role]);
        toast.success(`Added ${role} role`);
      } else {
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

  if (!user || !editedUser) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">User not found</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{user.full_name || "Unnamed User"}</h1>
            <p className="text-muted-foreground">{user.email}</p>
          </div>
        </div>
        {!isEditing ? (
          <Button onClick={() => setIsEditing(true)} size="sm">
            <Pencil className="h-4 w-4 mr-2" />
            Edit
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleCancel} disabled={saving}>
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        )}
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
            <div className="grid gap-4">
              <div>
                <Label className="text-muted-foreground text-xs">Email</Label>
                <p className="font-medium text-sm">{user.email}</p>
              </div>
              
              <div>
                <Label className="text-muted-foreground text-xs">Full Name</Label>
                {isEditing ? (
                  <Input
                    value={editedUser.full_name || ""}
                    onChange={(e) => setEditedUser({ ...editedUser, full_name: e.target.value })}
                    placeholder="Enter full name"
                    className="h-8 text-sm"
                  />
                ) : (
                  <p className="font-medium text-sm">{user.full_name || "Not set"}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-muted-foreground text-xs">Phone</Label>
                  {isEditing ? (
                    <Input
                      value={editedUser.phone || ""}
                      onChange={(e) => setEditedUser({ ...editedUser, phone: e.target.value })}
                      placeholder="Primary phone"
                      className="h-8 text-sm"
                    />
                  ) : (
                    <p className="font-medium text-sm">{user.phone || "Not set"}</p>
                  )}
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">Secondary Phone</Label>
                  {isEditing ? (
                    <Input
                      value={editedUser.phone_secondary || ""}
                      onChange={(e) => setEditedUser({ ...editedUser, phone_secondary: e.target.value })}
                      placeholder="Secondary phone"
                      className="h-8 text-sm"
                    />
                  ) : (
                    <p className="font-medium text-sm">{user.phone_secondary || "Not set"}</p>
                  )}
                </div>
              </div>

              <div>
                <Label className="text-muted-foreground text-xs">Status</Label>
                {isEditing ? (
                  <Select
                    value={editedUser.status || "active"}
                    onValueChange={(value) => setEditedUser({ ...editedUser, status: value })}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                      <SelectItem value="suspended">Suspended</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="font-medium text-sm capitalize">{user.status || "Active"}</p>
                )}
              </div>

              <div>
                <Label className="text-muted-foreground text-xs">Account Created</Label>
                <p className="font-medium text-sm">{format(new Date(user.created_at), "PPP")}</p>
              </div>
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

        {/* Address Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Address</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-muted-foreground text-xs">Street Address</Label>
              {isEditing ? (
                <Input
                  value={editedUser.address || ""}
                  onChange={(e) => setEditedUser({ ...editedUser, address: e.target.value })}
                  placeholder="123 Main St"
                  className="h-8 text-sm"
                />
              ) : (
                <p className="font-medium text-sm">{user.address || "Not set"}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-muted-foreground text-xs">City</Label>
                {isEditing ? (
                  <Input
                    value={editedUser.city || ""}
                    onChange={(e) => setEditedUser({ ...editedUser, city: e.target.value })}
                    placeholder="City"
                    className="h-8 text-sm"
                  />
                ) : (
                  <p className="font-medium text-sm">{user.city || "Not set"}</p>
                )}
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">State</Label>
                {isEditing ? (
                  <Select
                    value={editedUser.state || ""}
                    onValueChange={(value) => setEditedUser({ ...editedUser, state: value })}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {US_STATES.map((state) => (
                        <SelectItem key={state} value={state}>{state}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="font-medium text-sm">{user.state || "Not set"}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-muted-foreground text-xs">ZIP Code</Label>
                {isEditing ? (
                  <Input
                    value={editedUser.zip || ""}
                    onChange={(e) => setEditedUser({ ...editedUser, zip: e.target.value })}
                    placeholder="12345"
                    className="h-8 text-sm"
                  />
                ) : (
                  <p className="font-medium text-sm">{user.zip || "Not set"}</p>
                )}
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Country</Label>
                {isEditing ? (
                  <Input
                    value={editedUser.country || "USA"}
                    onChange={(e) => setEditedUser({ ...editedUser, country: e.target.value })}
                    placeholder="USA"
                    className="h-8 text-sm"
                  />
                ) : (
                  <p className="font-medium text-sm">{user.country || "USA"}</p>
                )}
              </div>
            </div>

            <div>
              <Label className="text-muted-foreground text-xs">Notes</Label>
              {isEditing ? (
                <Textarea
                  value={editedUser.notes || ""}
                  onChange={(e) => setEditedUser({ ...editedUser, notes: e.target.value })}
                  placeholder="Internal notes about this user..."
                  className="text-sm min-h-[80px]"
                />
              ) : (
                <p className="font-medium text-sm">{user.notes || "No notes"}</p>
              )}
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

        {/* Dispatcher Profile Link Card - Only show if user has dispatcher role */}
        {userRoles.includes("dispatcher") && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Link2 className="h-5 w-5" />
                Dispatcher Profile
              </CardTitle>
              <CardDescription>
                Link this user to a dispatcher profile to enable pay tracking
              </CardDescription>
            </CardHeader>
            <CardContent>
              {linkedDispatcher ? (
                <div className="space-y-4">
                  <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-green-800 dark:text-green-200">
                          {linkedDispatcher.first_name} {linkedDispatcher.last_name}
                        </p>
                        <p className="text-sm text-green-600 dark:text-green-400">
                          {linkedDispatcher.email}
                        </p>
                        {linkedDispatcher.pay_percentage && (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                            Pay Rate: {linkedDispatcher.pay_percentage}%
                          </p>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleUnlinkDispatcher}
                        disabled={linkingDispatcher}
                        className="text-destructive hover:text-destructive"
                      >
                        <Unlink className="h-4 w-4 mr-1" />
                        Unlink
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {dispatchers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No unlinked dispatcher profiles available. Create a dispatcher first in the Dispatchers section.
                    </p>
                  ) : (
                    <>
                      <div className="flex gap-2">
                        <Select
                          value={selectedDispatcherId}
                          onValueChange={setSelectedDispatcherId}
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Select a dispatcher profile..." />
                          </SelectTrigger>
                          <SelectContent>
                            {dispatchers.map((d) => (
                              <SelectItem key={d.id} value={d.id}>
                                {d.first_name} {d.last_name} ({d.email})
                                {d.pay_percentage && ` - ${d.pay_percentage}%`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          onClick={handleLinkDispatcher}
                          disabled={!selectedDispatcherId || linkingDispatcher}
                        >
                          <Link2 className="h-4 w-4 mr-1" />
                          Link
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Linking enables the dispatcher dashboard with pay tracking
                      </p>
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Login History Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Recent Login History
            </CardTitle>
            <CardDescription>
              Last 10 login sessions
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loginHistory.length === 0 ? (
              <p className="text-muted-foreground text-sm">No login history available</p>
            ) : (
              <div className="space-y-2">
                {loginHistory.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                      <div>
                        <p className="text-xs font-medium">
                          {format(new Date(entry.logged_in_at), "PPP 'at' p")}
                        </p>
                        {entry.ip_address && (
                          <p className="text-[10px] text-muted-foreground">
                            {entry.ip_address}
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
    </div>
  );
}