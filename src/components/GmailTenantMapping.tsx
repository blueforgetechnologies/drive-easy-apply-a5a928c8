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

  // Security gate
  const canAccess = isPlatformAdmin && isInternalChannel;

  useEffect(() => {
    if (canAccess) {
      loadData();
    }
  }, [canAccess]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [tokensRes, tenantsRes] = await Promise.all([
        supabase
          .from("gmail_tokens")
          .select("id, user_email, tenant_id, created_at, updated_at")
          .order("created_at", { ascending: false }),
        supabase
          .from("tenants")
          .select("id, name, slug")
          .order("name")
      ]);

      if (tokensRes.error) {
        toast.error(`Failed to load Gmail tokens: ${tokensRes.error.message}`);
        return;
      }
      if (tenantsRes.error) {
        toast.error(`Failed to load tenants: ${tenantsRes.error.message}`);
        return;
      }

      setGmailTokens(tokensRes.data || []);
      setTenants(tenantsRes.data || []);
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
      const { data: { user } } = await supabase.auth.getUser();
      const tenantIdValue = newTenantId || null;

      // Update gmail_tokens
      const { error: updateError } = await supabase
        .from("gmail_tokens")
        .update({ tenant_id: tenantIdValue })
        .eq("id", token.id);

      if (updateError) {
        toast.error(`Failed to update: ${updateError.message}`);
        return;
      }

      // Log to audit_logs
      const tenant = tenants.find(t => t.id === tenantIdValue);
      const { error: auditError } = await supabase
        .from("audit_logs")
        .insert({
          entity_type: "gmail_tokens",
          entity_id: token.id,
          action: "set_tenant",
          old_value: token.tenant_id || "null",
          new_value: tenantIdValue || "null",
          notes: `Gmail account ${token.user_email} mapped to tenant: ${tenant?.name || "None"}`,
          user_id: user?.id,
          user_name: user?.email,
          tenant_id: tenantIdValue || token.tenant_id || tenants[0]?.id // Use a valid tenant for audit
        });

      if (auditError) {
        console.warn("Audit log failed:", auditError);
      }

      toast.success(`Tenant mapping updated for ${token.user_email}`);
      
      // Update local state
      setGmailTokens(prev => prev.map(t => 
        t.id === token.id ? { ...t, tenant_id: tenantIdValue } : t
      ));
      setPendingChanges(prev => {
        const next = { ...prev };
        delete next[token.id];
        return next;
      });
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
