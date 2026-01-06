import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { RefreshCw, Mail, AlertTriangle, Check } from "lucide-react";
import { useTenantFilter } from "@/hooks/useTenantFilter";
import { format } from "date-fns";

interface GmailToken {
  id: string;
  user_email: string;
  tenant_id: string | null;
  created_at: string;
  updated_at: string | null;
}

interface Tenant {
  id: string;
  name: string;
  slug: string;
}

export function GmailTenantMapping() {
  const { isPlatformAdmin, isInternalChannel } = useTenantFilter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [gmailTokens, setGmailTokens] = useState<GmailToken[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [pendingChanges, setPendingChanges] = useState<Record<string, string>>({});

  // Client-side gate (server enforces the real security)
  const canAccess = isPlatformAdmin && isInternalChannel;

  useEffect(() => {
    if (canAccess) {
      loadData();
    }
  }, [canAccess]);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("gmail-tenant-mapping", {
        body: { action: "list" }
      });

      if (error) {
        console.error("Edge function error:", error);
        toast.error(`Failed to load data: ${error.message}`);
        return;
      }

      if (data?.error) {
        // Handle 401/403 from edge function
        if (data.error.includes("Forbidden") || data.error.includes("Unauthorized")) {
          toast.error("Access denied: You don't have permission to access this feature.");
        } else {
          toast.error(`Failed to load data: ${data.error}`);
        }
        return;
      }

      setGmailTokens(data?.tokens || []);
      setTenants(data?.tenants || []);
    } catch (err) {
      console.error("Unexpected error:", err);
      toast.error("Failed to load Gmail mapping data");
    } finally {
      setLoading(false);
    }
  };

  const handleTenantChange = (tokenId: string, tenantId: string) => {
    setPendingChanges(prev => ({
      ...prev,
      [tokenId]: tenantId === "none" ? "" : tenantId
    }));
  };

  const handleSave = async (token: GmailToken) => {
    const newTenantId = pendingChanges[token.id];
    if (newTenantId === undefined) return;

    setSaving(token.id);
    try {
      const { data, error } = await supabase.functions.invoke("gmail-tenant-mapping", {
        body: { 
          action: "update",
          token_id: token.id,
          tenant_id: newTenantId || null
        }
      });

      if (error) {
        console.error("Edge function error:", error);
        toast.error(`Failed to update: ${error.message}`);
        return;
      }

      if (data?.error) {
        if (data.error.includes("Forbidden")) {
          toast.error("Access denied: Platform admin in internal channel required.");
        } else if (data.error.includes("Unauthorized")) {
          toast.error("Session expired. Please refresh and try again.");
        } else {
          toast.error(`Failed to update: ${data.error}`);
        }
        return;
      }

      toast.success(`Tenant mapping updated for ${token.user_email}`);
      
      // Update local state
      setGmailTokens(prev => prev.map(t => 
        t.id === token.id ? { ...t, tenant_id: newTenantId || null } : t
      ));
      setPendingChanges(prev => {
        const next = { ...prev };
        delete next[token.id];
        return next;
      });
    } catch (err) {
      console.error("Unexpected error:", err);
      toast.error("Failed to update tenant mapping");
    } finally {
      setSaving(null);
    }
  };

  const getTenantName = (tenantId: string | null) => {
    if (!tenantId) return null;
    return tenants.find(t => t.id === tenantId)?.name;
  };

  if (!canAccess) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h3 className="font-semibold text-lg">Access Denied</h3>
          <p className="text-muted-foreground">
            This feature is only available to platform admins in the internal release channel.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Gmail Tenant Mapping
          </CardTitle>
          <CardDescription>
            Map Gmail accounts to tenants for email processing. Each Gmail token must be assigned to a tenant before fetch-gmail-loads can process emails.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : gmailTokens.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No Gmail tokens found. Connect a Gmail account first.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Gmail Account</TableHead>
                <TableHead>Current Tenant</TableHead>
                <TableHead>Assign Tenant</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {gmailTokens.map((token) => {
                const hasPendingChange = token.id in pendingChanges;
                const currentTenantName = getTenantName(token.tenant_id);
                const pendingTenantId = pendingChanges[token.id];
                const selectValue = hasPendingChange 
                  ? (pendingTenantId || "none")
                  : (token.tenant_id || "none");

                return (
                  <TableRow key={token.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{token.user_email}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {currentTenantName ? (
                        <Badge variant="default">{currentTenantName}</Badge>
                      ) : (
                        <Badge variant="destructive">Not Mapped</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Select value={selectValue} onValueChange={(v) => handleTenantChange(token.id, v)}>
                        <SelectTrigger className="w-[200px]">
                          <SelectValue placeholder="Select tenant..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">
                            <span className="text-muted-foreground">None</span>
                          </SelectItem>
                          {tenants.map((tenant) => (
                            <SelectItem key={tenant.id} value={tenant.id}>
                              {tenant.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(token.created_at), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {token.updated_at 
                        ? format(new Date(token.updated_at), "MMM d, yyyy HH:mm")
                        : "-"
                      }
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        onClick={() => handleSave(token)}
                        disabled={!hasPendingChange || saving === token.id}
                      >
                        {saving === token.id ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Check className="h-4 w-4 mr-1" />
                            Save
                          </>
                        )}
                      </Button>
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
