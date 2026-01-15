import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { 
  Building2, 
  Mail, 
  Plus,
  Copy,
  CheckCircle,
  XCircle,
  Loader2,
  RefreshCw,
  Search,
  Info,
  ArrowRight,
  Pause,
  Play,
  Settings
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDistanceToNow } from "date-fns";

interface Tenant {
  id: string;
  name: string;
  slug: string;
  gmail_alias: string | null;
  is_paused: boolean;
  last_email_received_at: string | null;
  created_at: string;
  email_count?: number;
  inbound_addresses?: InboundAddress[];
}

interface InboundAddress {
  id: string;
  email_address: string;
  is_active: boolean;
  notes: string | null;
}

interface EmailConfig {
  gmail_base_email: string | null;
  email_mode: string;
}

export default function CustomerOnboardingTab() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [emailConfig, setEmailConfig] = useState<EmailConfig | null>(null);
  
  // Create tenant dialog
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [mcNumber, setMcNumber] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [customAlias, setCustomAlias] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  
  // Add custom address dialog
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [newAddress, setNewAddress] = useState("");
  const [addressNotes, setAddressNotes] = useState("");
  const [addingAddress, setAddingAddress] = useState(false);
  
  // Alias validation
  const [aliasStatus, setAliasStatus] = useState<{valid: boolean | null; message: string}>({
    valid: null, message: ""
  });

  useEffect(() => {
    checkAccess();
  }, []);

  const checkAccess = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
        return;
      }

      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .eq("role", "admin")
        .maybeSingle();

      if (!roleData) {
        toast.error("Admin access required");
        navigate("/dashboard");
        return;
      }

      setIsAdmin(true);
      await loadEmailConfig();
      await loadTenants();
    } catch (error: any) {
      toast.error("Error checking access");
      navigate("/dashboard");
    } finally {
      setLoading(false);
    }
  };

  const loadEmailConfig = async () => {
    const { data } = await supabase
      .from("platform_email_config")
      .select("gmail_base_email, email_mode")
      .single();
    
    if (data) {
      setEmailConfig(data);
    }
  };

  const loadTenants = async () => {
    setRefreshing(true);
    try {
      // Get all tenants
      const { data: tenantsData, error } = await supabase
        .from("tenants")
        .select("id, name, slug, gmail_alias, is_paused, last_email_received_at, created_at")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Get inbound addresses for each tenant
      const { data: addresses } = await supabase
        .from("tenant_inbound_addresses")
        .select("id, tenant_id, email_address, is_active, notes");

      // Get email counts
      const { data: emailCounts } = await supabase
        .from("email_queue")
        .select("tenant_id")
        .eq("status", "completed");

      // Map data
      const tenantsWithData = (tenantsData || []).map(tenant => {
        const tenantAddresses = (addresses || []).filter(a => a.tenant_id === tenant.id);
        const emailCount = (emailCounts || []).filter(e => e.tenant_id === tenant.id).length;
        return {
          ...tenant,
          inbound_addresses: tenantAddresses,
          email_count: emailCount
        };
      });

      setTenants(tenantsWithData);
    } catch (error: any) {
      toast.error("Failed to load tenants");
      console.error(error);
    } finally {
      setRefreshing(false);
    }
  };

  // Validate alias availability
  const checkAlias = useCallback(async (alias: string) => {
    if (!alias || alias.length < 2) {
      setAliasStatus({ valid: null, message: "" });
      return;
    }

    const { data } = await supabase
      .from("tenants")
      .select("id, name")
      .eq("gmail_alias", alias)
      .maybeSingle();

    if (data) {
      setAliasStatus({ valid: false, message: `Used by: ${data.name}` });
    } else {
      setAliasStatus({ valid: true, message: "Available" });
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (customAlias) checkAlias(customAlias);
    }, 300);
    return () => clearTimeout(timer);
  }, [customAlias, checkAlias]);

  // Lookup carrier by MC number
  const handleLookup = async () => {
    if (!mcNumber.trim()) {
      toast.error("Enter an MC number");
      return;
    }

    setLookingUp(true);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-carrier-data", {
        body: { mc: mcNumber.trim().replace(/\D/g, "") }
      });

      if (error || data?.error) {
        toast.error(data?.error || "Carrier not found");
        return;
      }

      const name = data.dba_name || data.name;
      setCompanyName(name);
      
      // Generate alias from name + MC
      const sanitized = name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      const mc = mcNumber.replace(/\D/g, '');
      setCustomAlias(`+${sanitized}${mc}`);
      
      toast.success(`Found: ${name}`);
    } catch (error: any) {
      toast.error("Lookup failed");
    } finally {
      setLookingUp(false);
    }
  };

  // Create new tenant (customer)
  const handleCreate = async () => {
    if (!companyName.trim()) {
      toast.error("Company name is required");
      return;
    }

    if (aliasStatus.valid === false) {
      toast.error("Gmail alias is already in use");
      return;
    }

    setCreating(true);
    try {
      const slug = companyName.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50);
      const alias = customAlias || `+${companyName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`;

      const { data, error } = await supabase
        .from("tenants")
        .insert({
          name: companyName.trim(),
          slug,
          gmail_alias: alias,
          mc_number: mcNumber.replace(/\D/g, '') || null,
          carrier_name: companyName.trim()
        })
        .select()
        .single();

      if (error) {
        if (error.message.includes("gmail_alias")) {
          toast.error("Gmail alias is already in use");
        } else {
          toast.error(error.message);
        }
        return;
      }

      toast.success(`Created: ${data.name}`);
      setShowCreate(false);
      resetForm();
      await loadTenants();
    } catch (error: any) {
      toast.error("Failed to create customer");
    } finally {
      setCreating(false);
    }
  };

  const resetForm = () => {
    setMcNumber("");
    setCompanyName("");
    setCustomAlias("");
    setAliasStatus({ valid: null, message: "" });
  };

  // Add custom inbound address
  const handleAddAddress = async () => {
    if (!selectedTenant || !newAddress.trim()) return;

    const email = newAddress.toLowerCase().trim();
    if (!email.includes("@")) {
      toast.error("Enter a valid email address");
      return;
    }

    setAddingAddress(true);
    try {
      const { error } = await supabase
        .from("tenant_inbound_addresses")
        .insert({
          tenant_id: selectedTenant.id,
          email_address: email,
          notes: addressNotes || null,
          is_active: true
        });

      if (error) {
        if (error.message.includes("duplicate") || error.message.includes("unique")) {
          toast.error("This email address is already registered");
        } else {
          toast.error(error.message);
        }
        return;
      }

      toast.success(`Added: ${email}`);
      setShowAddAddress(false);
      setNewAddress("");
      setAddressNotes("");
      await loadTenants();
    } catch (error: any) {
      toast.error("Failed to add address");
    } finally {
      setAddingAddress(false);
    }
  };

  // Toggle tenant pause
  const togglePause = async (tenant: Tenant) => {
    const { error } = await supabase
      .from("tenants")
      .update({ is_paused: !tenant.is_paused })
      .eq("id", tenant.id);

    if (error) {
      toast.error("Failed to update");
    } else {
      toast.success(tenant.is_paused ? "Resumed" : "Paused");
      await loadTenants();
    }
  };

  // Copy email to clipboard
  const copyEmail = (email: string) => {
    navigator.clipboard.writeText(email);
    toast.success("Copied to clipboard");
  };

  // Get full email address from alias
  const getFullEmail = (alias: string | null) => {
    if (!alias || !emailConfig?.gmail_base_email) return null;
    // Parse the base email
    const baseEmail = emailConfig.gmail_base_email;
    const atIndex = baseEmail.indexOf("@");
    if (atIndex === -1) return null;
    
    const localPart = baseEmail.substring(0, atIndex);
    const domain = baseEmail.substring(atIndex + 1);
    
    // Remove + if present for display
    const cleanAlias = alias.startsWith("+") ? alias : `+${alias}`;
    return `${localPart}${cleanAlias}@${domain}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Customer Onboarding</h1>
          <p className="text-muted-foreground">Add new customers and manage their email addresses</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadTenants} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Customer
          </Button>
        </div>
      </div>

      {/* How It Works */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Info className="h-5 w-5" />
            How Email Routing Works
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <div className="font-medium flex items-center gap-2">
                <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-sm">1</span>
                Create Customer
              </div>
              <p className="text-sm text-muted-foreground">
                Add a new customer with their company name. A unique Gmail alias is generated automatically.
              </p>
            </div>
            <div className="space-y-2">
              <div className="font-medium flex items-center gap-2">
                <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-sm">2</span>
                Give Them Email
              </div>
              <p className="text-sm text-muted-foreground">
                Copy the generated email address and give it to the customer to use as their loadboard email destination.
              </p>
            </div>
            <div className="space-y-2">
              <div className="font-medium flex items-center gap-2">
                <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-sm">3</span>
                Emails Route Automatically
              </div>
              <p className="text-sm text-muted-foreground">
                All loads sent to their email address will automatically route to their account.
              </p>
            </div>
          </div>
          
          <Alert>
            <AlertDescription>
              <strong>Alternative:</strong> If a customer already has their own email (e.g., <code>dispatch@acmetrucking.com</code>), 
              you can add it as a "Custom Inbound Address" instead. Any emails forwarded from that address will route to their account.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Customers List */}
      <Card>
        <CardHeader>
          <CardTitle>Customers ({tenants.length})</CardTitle>
          <CardDescription>All registered customers and their email routing</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Email Address</TableHead>
                <TableHead>Custom Addresses</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Email</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenants.map(tenant => {
                const email = getFullEmail(tenant.gmail_alias);
                return (
                  <TableRow key={tenant.id}>
                    <TableCell>
                      <div className="font-medium">{tenant.name}</div>
                      <div className="text-xs text-muted-foreground">{tenant.slug}</div>
                    </TableCell>
                    <TableCell>
                      {email ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="font-mono text-xs h-auto py-1 px-2"
                                onClick={() => copyEmail(email)}
                              >
                                <Copy className="h-3 w-3 mr-1" />
                                {email}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Click to copy</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        <span className="text-muted-foreground text-sm">Not configured</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {tenant.inbound_addresses?.map(addr => (
                          <Badge 
                            key={addr.id} 
                            variant={addr.is_active ? "default" : "secondary"}
                            className="text-xs block w-fit"
                          >
                            {addr.email_address}
                          </Badge>
                        ))}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={() => {
                            setSelectedTenant(tenant);
                            setShowAddAddress(true);
                          }}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Add
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      {tenant.is_paused ? (
                        <Badge variant="destructive">Paused</Badge>
                      ) : (
                        <Badge variant="default" className="bg-green-600">Active</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {tenant.last_email_received_at ? (
                        <span className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(tenant.last_email_received_at), { addSuffix: true })}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">Never</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => togglePause(tenant)}
                              >
                                {tenant.is_paused ? (
                                  <Play className="h-4 w-4 text-green-600" />
                                ) : (
                                  <Pause className="h-4 w-4 text-amber-600" />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {tenant.is_paused ? "Resume" : "Pause"}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => navigate(`/dashboard/admin/tenant/${tenant.id}`)}
                              >
                                <Settings className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Settings</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {tenants.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No customers yet. Click "Add Customer" to get started.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create Customer Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add New Customer</DialogTitle>
            <DialogDescription>
              Create a new customer account. They'll get a unique email address for load routing.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* MC Number Lookup */}
            <div className="space-y-2">
              <Label>MC Number (Optional)</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g., 123456"
                  value={mcNumber}
                  onChange={(e) => setMcNumber(e.target.value)}
                />
                <Button variant="outline" onClick={handleLookup} disabled={lookingUp}>
                  {lookingUp ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Enter MC number to auto-fill company information from FMCSA
              </p>
            </div>

            {/* Company Name */}
            <div className="space-y-2">
              <Label>Company Name *</Label>
              <Input
                placeholder="e.g., Acme Trucking LLC"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </div>

            {/* Gmail Alias */}
            <div className="space-y-2">
              <Label>Gmail Alias</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g., +acmetrucking"
                  value={customAlias}
                  onChange={(e) => setCustomAlias(e.target.value)}
                />
                {aliasStatus.valid !== null && (
                  aliasStatus.valid ? (
                    <CheckCircle className="h-5 w-5 text-green-600 mt-2" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-600 mt-2" />
                  )
                )}
              </div>
              {aliasStatus.message && (
                <p className={`text-xs ${aliasStatus.valid ? "text-green-600" : "text-red-600"}`}>
                  {aliasStatus.message}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Leave blank to auto-generate from company name
              </p>
            </div>

            {/* Preview */}
            {(companyName || customAlias) && (
              <Alert>
                <Mail className="h-4 w-4" />
                <AlertTitle>Email Address Preview</AlertTitle>
                <AlertDescription className="font-mono text-sm">
                  {getFullEmail(customAlias || `+${companyName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`)}
                </AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreate(false); resetForm(); }}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating || !companyName.trim()}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Create Customer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Custom Address Dialog */}
      <Dialog open={showAddAddress} onOpenChange={setShowAddAddress}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Custom Inbound Address</DialogTitle>
            <DialogDescription>
              Add an email address that will route to {selectedTenant?.name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Email Address *</Label>
              <Input
                placeholder="e.g., dispatch@acmetrucking.com"
                value={newAddress}
                onChange={(e) => setNewAddress(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Any email from this address will be routed to {selectedTenant?.name}
              </p>
            </div>
            
            <div className="space-y-2">
              <Label>Notes (Optional)</Label>
              <Input
                placeholder="e.g., Main dispatch email"
                value={addressNotes}
                onChange={(e) => setAddressNotes(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddAddress(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddAddress} disabled={addingAddress || !newAddress.trim()}>
              {addingAddress ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Add Address
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
