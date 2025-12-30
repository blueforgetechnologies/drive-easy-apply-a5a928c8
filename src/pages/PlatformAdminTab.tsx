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
  Copy
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: string;
  release_channel: string;
  is_paused: boolean;
  rate_limit_per_minute: number;
  max_users: number;
  max_vehicles: number;
  max_hunt_plans: number;
  created_at: string;
  // Computed counts
  user_count?: number;
  vehicle_count?: number;
  hunt_plan_count?: number;
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
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  
  // Form state
  const [newTenantName, setNewTenantName] = useState("");
  const [newTenantSlug, setNewTenantSlug] = useState("");

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

    // Get counts for each tenant
    const tenantsWithCounts = await Promise.all((data || []).map(async (tenant) => {
      const [userCount, vehicleCount, huntCount] = await Promise.all([
        supabase.from("tenant_users").select("id", { count: "exact" }).eq("tenant_id", tenant.id),
        // These would need tenant_id columns added - for now show 0
        Promise.resolve({ count: 0 }),
        Promise.resolve({ count: 0 })
      ]);

      return {
        ...tenant,
        user_count: userCount.count || 0,
        vehicle_count: vehicleCount.count || 0,
        hunt_plan_count: huntCount.count || 0
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

    const { data, error } = await supabase
      .from("tenants")
      .insert({
        name: newTenantName.trim(),
        slug: newTenantSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-")
      })
      .select()
      .single();

    if (error) {
      toast.error(`Failed to create tenant: ${error.message}`);
      return;
    }

    toast.success(`Tenant "${data.name}" created successfully`);
    setShowCreateTenant(false);
    setNewTenantName("");
    setNewTenantSlug("");
    await loadTenants();
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

  const handleToggleFeatureFlag = async (flag: FeatureFlag) => {
    const { error } = await supabase
      .from("feature_flags")
      .update({ default_enabled: !flag.default_enabled })
      .eq("id", flag.id);

    if (error) {
      toast.error(`Failed to update flag: ${error.message}`);
    } else {
      toast.success(`${flag.name} ${flag.default_enabled ? "disabled" : "enabled"} globally`);
      await loadFeatureFlags();
    }
  };

  const handleUpdateReleaseChannel = async (tenantId: string, channel: string) => {
    const { error } = await supabase
      .from("tenants")
      .update({ release_channel: channel as "internal" | "pilot" | "general" })
      .eq("id", tenantId);

    if (error) {
      toast.error(`Failed to update channel: ${error.message}`);
    } else {
      toast.success("Release channel updated");
      await loadTenants();
    }
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
        <Button 
          variant="outline" 
          onClick={loadAllData}
          disabled={refreshing}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
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
                <div>
                  <Label htmlFor="tenant-name">Tenant Name</Label>
                  <Input 
                    id="tenant-name"
                    value={newTenantName}
                    onChange={(e) => {
                      setNewTenantName(e.target.value);
                      setNewTenantSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
                    }}
                    placeholder="Acme Trucking"
                  />
                </div>
                <div>
                  <Label htmlFor="tenant-slug">URL Slug</Label>
                  <Input 
                    id="tenant-slug"
                    value={newTenantSlug}
                    onChange={(e) => setNewTenantSlug(e.target.value)}
                    placeholder="acme-trucking"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Used in URLs and API calls
                  </p>
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
                  <TableHead className="text-center">Vehicles</TableHead>
                  <TableHead className="text-center">Hunts</TableHead>
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
                    <TableCell className="text-center">{tenant.vehicle_count}</TableCell>
                    <TableCell className="text-center">{tenant.hunt_plan_count}</TableCell>
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
    </div>
  );
}
