import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, CheckCircle2, XCircle, AlertCircle, Mail, Shield, Inbox, Filter } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface RoutedEmail {
  id: string;
  gmail_message_id: string;
  queued_at: string;
  status: string;
  routing_method: string | null;
  extracted_alias: string | null;
  delivered_to_header: string | null;
  to_email: string | null;
  tenant_id: string;
  dedupe_key: string | null;
  tenant?: {
    name: string;
    slug: string;
  };
}

interface QuarantinedEmail {
  id: string;
  gmail_message_id: string;
  received_at: string;
  status: string;
  delivered_to_header: string | null;
  x_original_to_header: string | null;
  to_header: string | null;
  from_header: string | null;
  subject: string | null;
  extracted_alias: string | null;
  extraction_source: string | null;
  failure_reason: string;
}

interface TenantAlias {
  id: string;
  name: string;
  slug: string;
  gmail_alias: string | null;
  release_channel: string | null;
}

export default function EmailRoutingHealthTab() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Fetch routed emails
  const { data: routedEmails = [], isLoading: loadingRouted } = useQuery({
    queryKey: ['email-routing-health', 'routed', refreshKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_queue')
        .select(`
          id, gmail_message_id, queued_at, status, routing_method, 
          extracted_alias, delivered_to_header, to_email, tenant_id, dedupe_key,
          tenant:tenants(name, slug)
        `)
        .order('queued_at', { ascending: false })
        .limit(100);
      
      if (error) throw error;
      return (data || []) as RoutedEmail[];
    },
  });

  // Fetch quarantined emails
  const { data: quarantinedEmails = [], isLoading: loadingQuarantined } = useQuery({
    queryKey: ['email-routing-health', 'quarantined', refreshKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('unroutable_emails')
        .select('*')
        .order('received_at', { ascending: false })
        .limit(100);
      
      if (error) throw error;
      return (data || []) as QuarantinedEmail[];
    },
  });

  // Fetch tenant aliases
  const { data: tenantAliases = [], isLoading: loadingAliases } = useQuery({
    queryKey: ['email-routing-health', 'aliases', refreshKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select('id, name, slug, gmail_alias, release_channel')
        .order('name');
      
      if (error) throw error;
      return (data || []) as TenantAlias[];
    },
  });

  // Calculate stats
  const stats = {
    totalRouted: routedEmails.length,
    totalQuarantined: quarantinedEmails.length,
    routedByMethod: {
      'Delivered-To': routedEmails.filter(e => e.routing_method === 'Delivered-To').length,
      'X-Original-To': routedEmails.filter(e => e.routing_method === 'X-Original-To').length,
      'To': routedEmails.filter(e => e.routing_method === 'To').length,
      'unknown': routedEmails.filter(e => !e.routing_method || e.routing_method === 'unknown').length,
    },
    aliasesConfigured: tenantAliases.filter(t => t.gmail_alias).length,
    aliasesMissing: tenantAliases.filter(t => !t.gmail_alias).length,
  };

  // Filter routed emails
  const filteredRouted = statusFilter === "all" 
    ? routedEmails 
    : routedEmails.filter(e => e.status === statusFilter);

  const handleRefresh = () => {
    setRefreshKey(k => k + 1);
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof CheckCircle2 }> = {
      'completed': { variant: 'default', icon: CheckCircle2 },
      'pending': { variant: 'secondary', icon: AlertCircle },
      'processing': { variant: 'outline', icon: RefreshCw },
      'failed': { variant: 'destructive', icon: XCircle },
      'quarantined': { variant: 'destructive', icon: Shield },
    };
    const config = variants[status] || { variant: 'secondary' as const, icon: AlertCircle };
    const Icon = config.icon;
    
    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {status}
      </Badge>
    );
  };

  const getRoutingMethodBadge = (method: string | null) => {
    if (!method || method === 'unknown') {
      return <Badge variant="outline" className="text-muted-foreground">unknown</Badge>;
    }
    const color = method === 'Delivered-To' 
      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100'
      : method === 'X-Original-To'
        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100'
        : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100';
    
    return <Badge className={color}>{method}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Email Routing Health</h2>
          <p className="text-muted-foreground">
            Monitor email routing, tenant aliases, deduplication, and quarantine status
          </p>
        </div>
        <Button onClick={handleRefresh} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Successfully Routed</CardTitle>
            <Inbox className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.totalRouted}</div>
            <p className="text-xs text-muted-foreground">Last 100 emails in queue</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Quarantined</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.totalQuarantined}</div>
            <p className="text-xs text-muted-foreground">Unroutable emails</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Aliases Configured</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.aliasesConfigured}</div>
            <p className="text-xs text-muted-foreground">
              {stats.aliasesMissing > 0 ? (
                <span className="text-yellow-600">{stats.aliasesMissing} missing</span>
              ) : (
                <span className="text-green-600">All tenants configured</span>
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Routing Methods</CardTitle>
            <Filter className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span>Delivered-To:</span>
                <span className="font-medium text-green-600">{stats.routedByMethod['Delivered-To']}</span>
              </div>
              <div className="flex justify-between">
                <span>X-Original-To:</span>
                <span className="font-medium text-blue-600">{stats.routedByMethod['X-Original-To']}</span>
              </div>
              <div className="flex justify-between">
                <span>To (fallback):</span>
                <span className="font-medium text-yellow-600">{stats.routedByMethod['To']}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tenant Aliases */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Tenant Alias Configuration</CardTitle>
          <CardDescription>Gmail aliases mapped to each tenant for routing</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingAliases ? (
            <div className="text-center py-4 text-muted-foreground">Loading...</div>
          ) : (
            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
              {tenantAliases.map((tenant) => (
                <div 
                  key={tenant.id} 
                  className={`p-3 rounded-lg border ${
                    tenant.gmail_alias 
                      ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950' 
                      : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{tenant.name}</p>
                      <p className="text-xs text-muted-foreground">{tenant.slug}</p>
                    </div>
                    <div className="text-right">
                      {tenant.gmail_alias ? (
                        <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                          {tenant.gmail_alias}
                        </Badge>
                      ) : (
                        <Badge variant="destructive">No alias</Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Main Tabs */}
      <Tabs defaultValue="routed" className="space-y-4">
        <TabsList>
          <TabsTrigger value="routed" className="gap-2">
            <Inbox className="h-4 w-4" />
            Routed Emails ({stats.totalRouted})
          </TabsTrigger>
          <TabsTrigger value="quarantine" className="gap-2">
            <Shield className="h-4 w-4" />
            Quarantine ({stats.totalQuarantined})
          </TabsTrigger>
        </TabsList>

        {/* Routed Emails Tab */}
        <TabsContent value="routed">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Recently Routed Emails</CardTitle>
                  <CardDescription>Emails successfully routed to tenants</CardDescription>
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Filter" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="processing">Processing</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {loadingRouted ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : filteredRouted.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No routed emails found</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Received</TableHead>
                        <TableHead>Routing Method</TableHead>
                        <TableHead>Delivered Address</TableHead>
                        <TableHead>Alias</TableHead>
                        <TableHead>Tenant</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Dedup Key</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRouted.map((email) => (
                        <TableRow key={email.id}>
                          <TableCell className="whitespace-nowrap">
                            <div className="text-sm">
                              {format(new Date(email.queued_at), 'MMM d, HH:mm')}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(email.queued_at), { addSuffix: true })}
                            </div>
                          </TableCell>
                          <TableCell>
                            {getRoutingMethodBadge(email.routing_method)}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate text-xs font-mono">
                            {email.delivered_to_header || email.to_email || '-'}
                          </TableCell>
                          <TableCell>
                            {email.extracted_alias ? (
                              <Badge variant="outline">{email.extracted_alias}</Badge>
                            ) : (
                              <span className="text-muted-foreground text-xs">none</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {email.tenant ? (
                              <div>
                                <div className="font-medium text-sm">{email.tenant.name}</div>
                                <div className="text-xs text-muted-foreground">{email.tenant.slug}</div>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>{getStatusBadge(email.status)}</TableCell>
                          <TableCell className="text-xs font-mono text-muted-foreground max-w-[150px] truncate">
                            {email.dedupe_key || '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Quarantine Tab */}
        <TabsContent value="quarantine">
          <Card>
            <CardHeader>
              <CardTitle>Quarantined Emails</CardTitle>
              <CardDescription>Emails that could not be routed to a tenant (fail-closed)</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingQuarantined ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : quarantinedEmails.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-2" />
                  <p className="text-muted-foreground">No quarantined emails - all routing successful!</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Received</TableHead>
                        <TableHead>From</TableHead>
                        <TableHead>Subject</TableHead>
                        <TableHead>Header Used</TableHead>
                        <TableHead>Extracted Alias</TableHead>
                        <TableHead>Failure Reason</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {quarantinedEmails.map((email) => (
                        <TableRow key={email.id}>
                          <TableCell className="whitespace-nowrap">
                            <div className="text-sm">
                              {format(new Date(email.received_at), 'MMM d, HH:mm')}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(email.received_at), { addSuffix: true })}
                            </div>
                          </TableCell>
                          <TableCell className="max-w-[150px] truncate text-xs">
                            {email.from_header || '-'}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {email.subject || '-'}
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1 text-xs">
                              {email.delivered_to_header && (
                                <div><span className="text-muted-foreground">Delivered-To:</span> {email.delivered_to_header}</div>
                              )}
                              {email.x_original_to_header && (
                                <div><span className="text-muted-foreground">X-Original-To:</span> {email.x_original_to_header}</div>
                              )}
                              {email.to_header && (
                                <div><span className="text-muted-foreground">To:</span> {email.to_header}</div>
                              )}
                              {!email.delivered_to_header && !email.x_original_to_header && !email.to_header && (
                                <span className="text-muted-foreground">No headers found</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {email.extracted_alias ? (
                              <div>
                                <Badge variant="outline">{email.extracted_alias}</Badge>
                                <div className="text-xs text-muted-foreground mt-1">
                                  via {email.extraction_source || 'unknown'}
                                </div>
                              </div>
                            ) : (
                              <Badge variant="destructive">None found</Badge>
                            )}
                          </TableCell>
                          <TableCell className="max-w-[200px]">
                            <div className="text-sm text-red-600 dark:text-red-400">
                              {email.failure_reason}
                            </div>
                          </TableCell>
                          <TableCell>{getStatusBadge(email.status)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
