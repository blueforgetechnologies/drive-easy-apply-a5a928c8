import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, CheckCircle2, XCircle, AlertCircle, Mail, Shield, Inbox, Filter, Database, Recycle, TrendingUp, Layers, AlertTriangle, Users, Search, Lock, Loader2 } from "lucide-react";
import { format, formatDistanceToNow, subDays, subHours } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import QuarantineFixHelper from "@/components/QuarantineFixHelper";

// Routing Debug interfaces
interface RoutingDebugEmail {
  gmail_message_id: string;
  received_at: string;
  extracted_alias: string | null;
  routing_method: string | null;
  resolved_tenant_name: string | null;
  outcome: 'routed' | 'quarantined';
  failure_reason: string | null;
}

interface RoutingDebugResponse {
  summary: {
    time_window_hours: number;
    total_emails: number;
    routed: number;
    quarantined: number;
  };
  emails: RoutingDebugEmail[];
}

// Tenant Isolation Check interfaces
interface TenantIsolationCounts {
  tenant_id: string;
  tenant_name: string;
  email_queue_count: number;
  unroutable_emails_count: number;
  load_emails_count: number;
  matches_count: number;
  hunt_plans_count: number;
}

interface IsolationCheckResponse {
  summary: {
    time_window_hours: number;
    cutoff_time: string;
    total_tenants: number;
    total_routed_emails: number;
    total_quarantined: number;
    total_load_emails: number;
    total_matches: number;
    null_tenant_issues: {
      email_queue_null: number;
      load_emails_null: number;
      hunt_plans_null: number;
    };
    cross_tenant_issues: string[];
    isolation_status: 'PASS' | 'FAIL';
  };
  by_tenant: TenantIsolationCounts[];
}

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
  content_id: string | null;
  receipt_id: string | null;
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

interface ContentDedupStats {
  uniqueContent24h: number;
  receipts24h: number;
  uniqueContent7d: number;
  receipts7d: number;
  reuseRate24h: number;
  reuseRate7d: number;
  byProvider: {
    provider: string;
    uniqueContent: number;
    receipts: number;
    reuseRate: number;
  }[];
  featureFlagStatus: {
    tenantSlug: string;
    enabled: boolean;
  }[];
}

interface LoadContentMetrics {
  receipts_24h: number;
  eligible_receipts_24h: number;
  eligible_with_fk_24h: number;
  unique_content_24h: number;
  coverage_rate_24h: number;
  reuse_rate_24h: number;
  missing_fk_24h: number;
  eligible_1h: number;
  missing_fk_1h: number;
  missing_parsed_fp_1h: number;
}

interface LoadContentProviderBreakdown {
  provider: string;
  receipts: number;
  eligible: number;
  eligible_with_fk: number;
  unique_content: number;
  coverage_rate: number;
  reuse_rate: number;
}

interface LoadContentTop10 {
  fingerprint: string;
  provider: string;
  receipt_count: number;
  first_seen_at: string;
  last_seen_at: string;
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
          content_id, receipt_id,
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

  // Fetch content dedup stats
  const { data: dedupStats, isLoading: loadingDedup } = useQuery({
    queryKey: ['email-routing-health', 'dedup', refreshKey],
    queryFn: async () => {
      const now = new Date();
      const h24Ago = subHours(now, 24).toISOString();
      const d7Ago = subDays(now, 7).toISOString();

      // Get receipts in last 24h
      const { data: receipts24h } = await supabase
        .from('email_receipts')
        .select('id, content_id, provider')
        .gte('received_at', h24Ago);

      // Get receipts in last 7d
      const { data: receipts7d } = await supabase
        .from('email_receipts')
        .select('id, content_id, provider')
        .gte('received_at', d7Ago);

      // Get unique content in last 24h
      const { data: content24h } = await supabase
        .from('email_content')
        .select('id, provider')
        .gte('first_seen_at', h24Ago);

      // Get unique content in last 7d
      const { data: content7d } = await supabase
        .from('email_content')
        .select('id, provider, receipt_count')
        .gte('first_seen_at', d7Ago);

      // Get feature flag status
      const { data: flagData } = await supabase
        .from('tenants')
        .select('slug')
        .eq('status', 'active');

      const { data: ffData } = await supabase
        .from('feature_flags')
        .select('id')
        .eq('key', 'content_dedup_enabled')
        .single();

      let featureFlagStatus: { tenantSlug: string; enabled: boolean }[] = [];
      if (ffData && flagData) {
        const { data: tffData } = await supabase
          .from('tenant_feature_flags')
          .select('tenant_id, enabled')
          .eq('feature_flag_id', ffData.id);

        const tffMap = new Map(tffData?.map(t => [t.tenant_id, t.enabled]) || []);
        
        // Need to get tenant IDs
        const { data: tenantsWithIds } = await supabase
          .from('tenants')
          .select('id, slug')
          .eq('status', 'active');

        featureFlagStatus = (tenantsWithIds || []).map(t => ({
          tenantSlug: t.slug,
          enabled: tffMap.get(t.id) || false,
        }));
      }

      // Calculate per-provider stats
      const providerMap = new Map<string, { uniqueContent: number; receipts: number }>();
      (content7d || []).forEach(c => {
        const existing = providerMap.get(c.provider) || { uniqueContent: 0, receipts: 0 };
        existing.uniqueContent++;
        existing.receipts += c.receipt_count || 0;
        providerMap.set(c.provider, existing);
      });

      const byProvider = Array.from(providerMap.entries()).map(([provider, stats]) => ({
        provider,
        uniqueContent: stats.uniqueContent,
        receipts: stats.receipts,
        reuseRate: stats.receipts > 0 ? Math.round(100 * (1 - stats.uniqueContent / stats.receipts)) : 0,
      }));

      const r24h = receipts24h?.length || 0;
      const c24h = content24h?.length || 0;
      const r7d = receipts7d?.length || 0;
      const c7d = content7d?.length || 0;

      return {
        uniqueContent24h: c24h,
        receipts24h: r24h,
        uniqueContent7d: c7d,
        receipts7d: r7d,
        reuseRate24h: r24h > 0 ? Math.round(100 * (1 - c24h / r24h)) : 0,
        reuseRate7d: r7d > 0 ? Math.round(100 * (1 - c7d / r7d)) : 0,
        byProvider,
        featureFlagStatus,
      } as ContentDedupStats;
    },
  });

  // Fetch load content metrics (from views)
  const { data: loadContentMetrics, isLoading: loadingLoadContent } = useQuery({
    queryKey: ['email-routing-health', 'load-content-metrics', refreshKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('load_content_metrics_24h')
        .select('*')
        .single();
      
      if (error) {
        console.error('Error fetching load_content_metrics_24h:', error);
        return null;
      }
      return data as LoadContentMetrics;
    },
  });

  // Fetch load content provider breakdown
  const { data: loadContentProviders = [], isLoading: loadingLoadProviders } = useQuery({
    queryKey: ['email-routing-health', 'load-content-providers', refreshKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('load_content_provider_breakdown_24h')
        .select('*')
        .order('provider');
      
      if (error) {
        console.error('Error fetching load_content_provider_breakdown_24h:', error);
        return [];
      }
      return (data || []) as LoadContentProviderBreakdown[];
    },
  });

  // Fetch load content top 10
  const { data: loadContentTop10 = [], isLoading: loadingLoadTop10 } = useQuery({
    queryKey: ['email-routing-health', 'load-content-top10', refreshKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('load_content_top10_7d')
        .select('*');
      
      if (error) {
        console.error('Error fetching load_content_top10_7d:', error);
        return [];
      }
      return (data || []) as LoadContentTop10[];
    },
  });

  // Fetch routing debug data
  const { data: routingDebugData, isLoading: loadingRoutingDebug, refetch: refetchRoutingDebug } = useQuery({
    queryKey: ['email-routing-health', 'routing-debug', refreshKey],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;

      const { data, error } = await supabase.functions.invoke('inspector-routing-debug', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { hours: 24, limit: 100 },
      });

      if (error) {
        console.error('Error fetching routing debug:', error);
        return null;
      }
      return data as RoutingDebugResponse;
    },
    enabled: false, // Manual trigger only
  });

  // Fetch tenant isolation check data
  const { data: isolationCheckData, isLoading: loadingIsolationCheck, refetch: refetchIsolationCheck } = useQuery({
    queryKey: ['email-routing-health', 'isolation-check', refreshKey],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;

      const { data, error } = await supabase.functions.invoke('inspector-tenant-isolation-check', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { hours: 24 },
      });

      if (error) {
        console.error('Error fetching isolation check:', error);
        return null;
      }
      return data as IsolationCheckResponse;
    },
    enabled: false, // Manual trigger only
  });

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

  // Check for dedup regression
  const hasDedupRegression = loadContentMetrics && (
    (loadContentMetrics.missing_fk_1h > 0) || 
    (loadContentMetrics.missing_parsed_fp_1h > 0)
  );
  const dedupRegressionLevel = loadContentMetrics ? (
    (loadContentMetrics.eligible_1h >= 20 && hasDedupRegression) ||
    loadContentMetrics.missing_fk_1h >= 3 ||
    loadContentMetrics.missing_parsed_fp_1h >= 3
      ? 'critical'
      : hasDedupRegression
        ? 'warning'
        : null
  ) : null;

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

      {/* Content Deduplication Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Database className="h-5 w-5" />
                Content Deduplication
              </CardTitle>
              <CardDescription>Global content storage with tenant-scoped receipts</CardDescription>
            </div>
            {dedupStats && (
              <div className="flex items-center gap-2">
                {dedupStats.reuseRate7d >= 50 ? (
                  <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100 gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Healthy
                  </Badge>
                ) : dedupStats.reuseRate7d >= 20 ? (
                  <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100 gap-1">
                    <AlertCircle className="h-3 w-3" />
                    Low Reuse
                  </Badge>
                ) : dedupStats.receipts7d === 0 ? (
                  <Badge variant="outline" className="gap-1">
                    <AlertCircle className="h-3 w-3" />
                    No Data
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="gap-1">
                    <XCircle className="h-3 w-3" />
                    Check Config
                  </Badge>
                )}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loadingDedup ? (
            <div className="text-center py-4 text-muted-foreground">Loading dedup stats...</div>
          ) : dedupStats ? (
            <div className="space-y-6">
              {/* Main Metrics */}
              <div className="grid gap-4 md:grid-cols-3">
                {/* 24h Stats */}
                <div className="p-4 rounded-lg border bg-muted/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Last 24 Hours</span>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total Receipts:</span>
                      <span className="font-medium">{dedupStats.receipts24h}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Unique Content:</span>
                      <span className="font-medium">{dedupStats.uniqueContent24h}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Reuse Rate:</span>
                      <span className={`font-bold ${dedupStats.reuseRate24h >= 50 ? 'text-green-600' : dedupStats.reuseRate24h >= 20 ? 'text-yellow-600' : 'text-muted-foreground'}`}>
                        {dedupStats.reuseRate24h}%
                      </span>
                    </div>
                    <Progress value={dedupStats.reuseRate24h} className="h-2" />
                  </div>
                </div>

                {/* 7d Stats */}
                <div className="p-4 rounded-lg border bg-muted/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Last 7 Days</span>
                    <Recycle className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total Receipts:</span>
                      <span className="font-medium">{dedupStats.receipts7d}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Unique Content:</span>
                      <span className="font-medium">{dedupStats.uniqueContent7d}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Reuse Rate:</span>
                      <span className={`font-bold ${dedupStats.reuseRate7d >= 50 ? 'text-green-600' : dedupStats.reuseRate7d >= 20 ? 'text-yellow-600' : 'text-muted-foreground'}`}>
                        {dedupStats.reuseRate7d}%
                      </span>
                    </div>
                    <Progress value={dedupStats.reuseRate7d} className="h-2" />
                  </div>
                </div>

                {/* Storage Savings */}
                <div className="p-4 rounded-lg border bg-muted/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Estimated Savings</span>
                    <Database className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Copies Avoided:</span>
                      <span className="font-medium text-green-600">
                        {dedupStats.receipts7d - dedupStats.uniqueContent7d}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Est. Storage Saved:</span>
                      <span className="font-medium text-green-600">
                        ~{Math.round((dedupStats.receipts7d - dedupStats.uniqueContent7d) * 15 / 1024)} MB
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-2">
                      Based on ~15KB avg per email payload
                    </div>
                  </div>
                </div>
              </div>

              {/* Provider Breakdown */}
              {dedupStats.byProvider.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-3">By Provider (7 days)</h4>
                  <div className="grid gap-2 md:grid-cols-2">
                    {dedupStats.byProvider.map((p) => (
                      <div key={p.provider} className="p-3 rounded-lg border flex items-center justify-between">
                        <div>
                          <p className="font-medium capitalize">{p.provider}</p>
                          <p className="text-xs text-muted-foreground">
                            {p.uniqueContent} unique / {p.receipts} receipts
                          </p>
                        </div>
                        <Badge 
                          className={p.reuseRate >= 50 
                            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100' 
                            : p.reuseRate >= 20 
                              ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100'
                              : 'bg-muted text-muted-foreground'
                          }
                        >
                          {p.reuseRate}% reuse
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Feature Flag Status */}
              <div>
                <h4 className="text-sm font-medium mb-3">Feature Flag: content_dedup_enabled</h4>
                <div className="flex flex-wrap gap-2">
                  {dedupStats.featureFlagStatus.map((t) => (
                    <Badge 
                      key={t.tenantSlug}
                      variant={t.enabled ? "default" : "outline"}
                      className={t.enabled ? "bg-green-600" : ""}
                    >
                      {t.tenantSlug}: {t.enabled ? "ON" : "OFF"}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-4 text-muted-foreground">
              No dedup data available. Feature may not be enabled.
            </div>
          )}
        </CardContent>
      </Card>

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
        <TabsList className="flex-wrap">
          <TabsTrigger value="routed" className="gap-2">
            <Inbox className="h-4 w-4" />
            Routed Emails ({stats.totalRouted})
          </TabsTrigger>
          <TabsTrigger value="quarantine" className="gap-2">
            <Shield className="h-4 w-4" />
            Quarantine ({stats.totalQuarantined})
          </TabsTrigger>
          <TabsTrigger value="load-dedup" className="gap-2">
            <Layers className="h-4 w-4" />
            Load Dedup
            {dedupRegressionLevel && (
              <Badge variant={dedupRegressionLevel === 'critical' ? 'destructive' : 'secondary'} className="ml-1 h-5 px-1.5">
                !
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="routing-debug" className="gap-2">
            <Search className="h-4 w-4" />
            Routing Debug
          </TabsTrigger>
          <TabsTrigger value="isolation-check" className="gap-2">
            <Lock className="h-4 w-4" />
            Isolation Check
            {isolationCheckData?.summary?.isolation_status === 'FAIL' && (
              <Badge variant="destructive" className="ml-1 h-5 px-1.5">!</Badge>
            )}
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
                        <TableHead>Failure Reason / Fix</TableHead>
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
                          <TableCell className="max-w-[250px]">
                            <div className="flex items-center gap-1">
                              <span className="text-sm text-red-600 dark:text-red-400 truncate">
                                {email.failure_reason}
                              </span>
                              <QuarantineFixHelper
                                failureReason={email.failure_reason}
                                deliveredToHeader={email.delivered_to_header}
                                extractedAlias={email.extracted_alias}
                                tenants={tenantAliases.map(t => ({
                                  id: t.id,
                                  name: t.name,
                                  slug: t.slug,
                                  gmail_alias: t.gmail_alias
                                }))}
                              />
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

        {/* Load Dedup Tab */}
        <TabsContent value="load-dedup">
          <div className="space-y-4">
            {/* Regression Alert Banner */}
            {dedupRegressionLevel && (
              <Alert variant={dedupRegressionLevel === 'critical' ? 'destructive' : 'default'}>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>
                  {dedupRegressionLevel === 'critical' ? '🔴 Dedup Regression Detected' : '🟡 Dedup Warning'}
                </AlertTitle>
                <AlertDescription>
                  {loadContentMetrics && (
                    <>
                      Last 1 hour: {loadContentMetrics.missing_fk_1h} eligible rows missing load_content_fingerprint, 
                      {loadContentMetrics.missing_parsed_fp_1h} missing parsed_load_fingerprint 
                      (eligible={loadContentMetrics.eligible_1h})
                    </>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {/* KPI Cards */}
            <div className="grid gap-4 md:grid-cols-5">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Receipts (24h)</CardTitle>
                  <Inbox className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{loadContentMetrics?.receipts_24h ?? '-'}</div>
                  <p className="text-xs text-muted-foreground">
                    {loadContentMetrics?.eligible_receipts_24h ?? 0} eligible, {loadContentMetrics?.eligible_with_fk_24h ?? 0} with FK
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Coverage Rate (24h)</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${
                    (loadContentMetrics?.coverage_rate_24h ?? 0) >= 95 
                      ? 'text-green-600' 
                      : (loadContentMetrics?.coverage_rate_24h ?? 0) >= 80 
                        ? 'text-yellow-600' 
                        : 'text-red-600'
                  }`}>
                    {loadContentMetrics?.coverage_rate_24h ?? 0}%
                  </div>
                  <Progress value={loadContentMetrics?.coverage_rate_24h ?? 0} className="h-2 mt-2" />
                  <p className="text-xs text-muted-foreground mt-1">
                    % of eligible with FK
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Unique Content (24h)</CardTitle>
                  <Database className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{loadContentMetrics?.unique_content_24h ?? '-'}</div>
                  <p className="text-xs text-muted-foreground">
                    Distinct fingerprints
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Reuse Rate (24h)</CardTitle>
                  <Recycle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${
                    (loadContentMetrics?.eligible_with_fk_24h ?? 0) === 0
                      ? ''
                      : (loadContentMetrics?.reuse_rate_24h ?? 0) >= 50 
                        ? 'text-green-600' 
                        : (loadContentMetrics?.reuse_rate_24h ?? 0) >= 20 
                          ? 'text-yellow-600' 
                          : ''
                  }`}>
                    {(loadContentMetrics?.eligible_with_fk_24h ?? 0) === 0 
                      ? 'N/A' 
                      : `${loadContentMetrics?.reuse_rate_24h ?? 0}%`}
                  </div>
                  {(loadContentMetrics?.eligible_with_fk_24h ?? 0) > 0 && (
                    <Progress value={loadContentMetrics?.reuse_rate_24h ?? 0} className="h-2 mt-2" />
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    Based on eligible w/ FK only
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Missing FK (24h)</CardTitle>
                  <AlertCircle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${
                    (loadContentMetrics?.missing_fk_24h ?? 0) > 0 ? 'text-red-600' : 'text-green-600'
                  }`}>
                    {loadContentMetrics?.missing_fk_24h ?? 0}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Should be 0 for healthy system
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Provider Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Provider Breakdown (24h)</CardTitle>
                <CardDescription>Dedup metrics by email source</CardDescription>
              </CardHeader>
              <CardContent>
                {loadingLoadProviders ? (
                  <div className="text-center py-4 text-muted-foreground">Loading...</div>
                ) : loadContentProviders.length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground">No data available</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Provider</TableHead>
                        <TableHead className="text-right">Receipts</TableHead>
                        <TableHead className="text-right">Eligible</TableHead>
                        <TableHead className="text-right">Eligible w/ FK</TableHead>
                        <TableHead className="text-right">Coverage</TableHead>
                        <TableHead className="text-right">Unique Content</TableHead>
                        <TableHead className="text-right">Reuse Rate</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadContentProviders.map((p) => (
                        <TableRow key={p.provider}>
                          <TableCell className="font-medium capitalize">{p.provider}</TableCell>
                          <TableCell className="text-right tabular-nums">{p.receipts}</TableCell>
                          <TableCell className="text-right tabular-nums">{p.eligible}</TableCell>
                          <TableCell className="text-right tabular-nums">{p.eligible_with_fk}</TableCell>
                          <TableCell>
                            <div className="flex justify-end">
                              {p.eligible === 0 ? (
                                <span className="text-muted-foreground">-</span>
                              ) : (
                                <Badge className={
                                  p.coverage_rate >= 95 
                                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100' 
                                    : p.coverage_rate >= 80 
                                      ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100'
                                      : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100'
                                }>
                                  {p.coverage_rate}%
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {p.provider === 'other' || p.eligible_with_fk === 0 ? '-' : p.unique_content}
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end">
                              {p.provider === 'other' || p.eligible_with_fk === 0 ? (
                                <span className="text-muted-foreground">N/A</span>
                              ) : (
                                <Badge className={
                                  p.reuse_rate >= 50 
                                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100' 
                                    : p.reuse_rate >= 20 
                                      ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100'
                                      : 'bg-muted text-muted-foreground'
                                }>
                                  {p.reuse_rate}%
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Top 10 Most Reused */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Top 10 Most Reused Content (7 days)</CardTitle>
                <CardDescription>Load content with highest receipt counts</CardDescription>
              </CardHeader>
              <CardContent>
                {loadingLoadTop10 ? (
                  <div className="text-center py-4 text-muted-foreground">Loading...</div>
                ) : loadContentTop10.length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground">No data available</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fingerprint</TableHead>
                        <TableHead>Provider</TableHead>
                        <TableHead className="text-right">Receipt Count</TableHead>
                        <TableHead>First Seen</TableHead>
                        <TableHead>Last Seen</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadContentTop10.map((row) => (
                        <TableRow key={row.fingerprint}>
                          <TableCell className="font-mono text-xs max-w-[200px] truncate">
                            {row.fingerprint}
                          </TableCell>
                          <TableCell className="capitalize">{row.provider}</TableCell>
                          <TableCell className="text-right font-bold">{row.receipt_count}</TableCell>
                          <TableCell className="text-xs">
                            {format(new Date(row.first_seen_at), 'MMM d, HH:mm')}
                          </TableCell>
                          <TableCell className="text-xs">
                            {format(new Date(row.last_seen_at), 'MMM d, HH:mm')}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* 1-Hour Guardrail Metrics */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">1-Hour Guardrail Metrics</CardTitle>
                <CardDescription>Used for regression detection alerts</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="p-4 rounded-lg border">
                    <div className="text-sm text-muted-foreground">Eligible (1h)</div>
                    <div className="text-2xl font-bold">{loadContentMetrics?.eligible_1h ?? 0}</div>
                  </div>
                  <div className="p-4 rounded-lg border">
                    <div className="text-sm text-muted-foreground">Missing FK (1h)</div>
                    <div className={`text-2xl font-bold ${
                      (loadContentMetrics?.missing_fk_1h ?? 0) > 0 ? 'text-red-600' : 'text-green-600'
                    }`}>
                      {loadContentMetrics?.missing_fk_1h ?? 0}
                    </div>
                  </div>
                  <div className="p-4 rounded-lg border">
                    <div className="text-sm text-muted-foreground">Missing Parsed FP (1h)</div>
                    <div className={`text-2xl font-bold ${
                      (loadContentMetrics?.missing_parsed_fp_1h ?? 0) > 0 ? 'text-red-600' : 'text-green-600'
                    }`}>
                      {loadContentMetrics?.missing_parsed_fp_1h ?? 0}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Routing Debug Tab */}
        <TabsContent value="routing-debug">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Search className="h-5 w-5" />
                    Routing Debug Inspector
                  </CardTitle>
                  <CardDescription>
                    Detailed view of email routing decisions for the last 24 hours
                  </CardDescription>
                </div>
                <Button 
                  onClick={() => refetchRoutingDebug()} 
                  variant="outline" 
                  size="sm"
                  disabled={loadingRoutingDebug}
                >
                  {loadingRoutingDebug ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Load Debug Data
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loadingRoutingDebug ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : !routingDebugData ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">Click "Load Debug Data" to fetch routing debug information</p>
                  <p className="text-xs text-muted-foreground">
                    This queries the inspector-routing-debug endpoint for detailed routing decisions
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Summary Cards */}
                  <div className="grid gap-4 md:grid-cols-4">
                    <div className="p-4 rounded-lg border bg-muted/30">
                      <div className="text-sm text-muted-foreground">Time Window</div>
                      <div className="text-2xl font-bold">{routingDebugData.summary.time_window_hours}h</div>
                    </div>
                    <div className="p-4 rounded-lg border bg-muted/30">
                      <div className="text-sm text-muted-foreground">Total Emails</div>
                      <div className="text-2xl font-bold">{routingDebugData.summary.total_emails}</div>
                    </div>
                    <div className="p-4 rounded-lg border bg-green-100 dark:bg-green-900/30">
                      <div className="text-sm text-muted-foreground">Routed</div>
                      <div className="text-2xl font-bold text-green-600">{routingDebugData.summary.routed}</div>
                    </div>
                    <div className="p-4 rounded-lg border bg-red-100 dark:bg-red-900/30">
                      <div className="text-sm text-muted-foreground">Quarantined</div>
                      <div className="text-2xl font-bold text-red-600">{routingDebugData.summary.quarantined}</div>
                    </div>
                  </div>

                  {/* Emails Table */}
                  {routingDebugData.emails?.length > 0 && (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Received</TableHead>
                            <TableHead>Gmail Message ID</TableHead>
                            <TableHead>Extracted Alias</TableHead>
                            <TableHead>Routing Method</TableHead>
                            <TableHead>Resolved Tenant</TableHead>
                            <TableHead>Outcome</TableHead>
                            <TableHead>Failure Reason</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {routingDebugData.emails.map((email, idx) => (
                            <TableRow key={idx}>
                              <TableCell className="whitespace-nowrap text-xs">
                                {format(new Date(email.received_at), 'MMM d, HH:mm')}
                              </TableCell>
                              <TableCell className="font-mono text-xs max-w-[150px] truncate">
                                {email.gmail_message_id}
                              </TableCell>
                              <TableCell>
                                {email.extracted_alias ? (
                                  <Badge variant="outline">{email.extracted_alias}</Badge>
                                ) : (
                                  <span className="text-muted-foreground text-xs">none</span>
                                )}
                              </TableCell>
                              <TableCell>
                                {email.routing_method ? (
                                  <Badge 
                                    className={
                                      email.routing_method === 'Delivered-To' 
                                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100'
                                        : email.routing_method === 'X-Original-To'
                                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100'
                                          : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100'
                                    }
                                  >
                                    {email.routing_method}
                                  </Badge>
                                ) : (
                                  <span className="text-muted-foreground text-xs">—</span>
                                )}
                              </TableCell>
                              <TableCell className="font-medium">
                                {email.resolved_tenant_name || '—'}
                              </TableCell>
                              <TableCell>
                                <Badge 
                                  variant={email.outcome === 'routed' ? 'default' : 'destructive'}
                                  className={email.outcome === 'routed' ? 'bg-green-600' : ''}
                                >
                                  {email.outcome}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                                {email.failure_reason || '—'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tenant Isolation Check Tab */}
        <TabsContent value="isolation-check">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Lock className="h-5 w-5" />
                    Tenant Isolation Smoke Test
                  </CardTitle>
                  <CardDescription>
                    Verify data is correctly isolated per tenant with no cross-tenant leakage
                  </CardDescription>
                </div>
                <Button 
                  onClick={() => refetchIsolationCheck()} 
                  variant="outline" 
                  size="sm"
                  disabled={loadingIsolationCheck}
                >
                  {loadingIsolationCheck ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Run Isolation Check
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loadingIsolationCheck ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : !isolationCheckData ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">Click "Run Isolation Check" to verify tenant data isolation</p>
                  <p className="text-xs text-muted-foreground">
                    This queries counts grouped by tenant_id for email_queue, load_emails, and matches
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Status Alert */}
                  {isolationCheckData.summary.isolation_status === 'PASS' ? (
                    <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <AlertTitle className="text-green-600">Isolation Status: PASS</AlertTitle>
                      <AlertDescription>
                        No cross-tenant data leakage detected. All tenant_id values are properly set.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Isolation Status: FAIL</AlertTitle>
                      <AlertDescription>
                        {isolationCheckData.summary.cross_tenant_issues.map((issue, idx) => (
                          <div key={idx}>• {issue}</div>
                        ))}
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Summary Cards */}
                  <div className="grid gap-4 md:grid-cols-5">
                    <div className="p-4 rounded-lg border bg-muted/30">
                      <div className="text-sm text-muted-foreground">Time Window</div>
                      <div className="text-2xl font-bold">{isolationCheckData.summary.time_window_hours}h</div>
                    </div>
                    <div className="p-4 rounded-lg border bg-muted/30">
                      <div className="text-sm text-muted-foreground">Tenants</div>
                      <div className="text-2xl font-bold">{isolationCheckData.summary.total_tenants}</div>
                    </div>
                    <div className="p-4 rounded-lg border bg-green-100 dark:bg-green-900/30">
                      <div className="text-sm text-muted-foreground">Routed Emails</div>
                      <div className="text-2xl font-bold text-green-600">{isolationCheckData.summary.total_routed_emails}</div>
                    </div>
                    <div className="p-4 rounded-lg border bg-red-100 dark:bg-red-900/30">
                      <div className="text-sm text-muted-foreground">Quarantined</div>
                      <div className="text-2xl font-bold text-red-600">{isolationCheckData.summary.total_quarantined}</div>
                    </div>
                    <div className="p-4 rounded-lg border bg-blue-100 dark:bg-blue-900/30">
                      <div className="text-sm text-muted-foreground">Total Matches</div>
                      <div className="text-2xl font-bold text-blue-600">{isolationCheckData.summary.total_matches}</div>
                    </div>
                  </div>

                  {/* NULL Tenant Issues */}
                  <Card className="border-2">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">NULL tenant_id Checks</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-4 md:grid-cols-3">
                        <div className="p-3 rounded-lg border">
                          <div className="text-xs text-muted-foreground">email_queue NULL</div>
                          <div className={`text-xl font-bold ${
                            isolationCheckData.summary.null_tenant_issues.email_queue_null > 0 ? 'text-red-600' : 'text-green-600'
                          }`}>
                            {isolationCheckData.summary.null_tenant_issues.email_queue_null}
                          </div>
                        </div>
                        <div className="p-3 rounded-lg border">
                          <div className="text-xs text-muted-foreground">load_emails NULL</div>
                          <div className={`text-xl font-bold ${
                            isolationCheckData.summary.null_tenant_issues.load_emails_null > 0 ? 'text-red-600' : 'text-green-600'
                          }`}>
                            {isolationCheckData.summary.null_tenant_issues.load_emails_null}
                          </div>
                        </div>
                        <div className="p-3 rounded-lg border">
                          <div className="text-xs text-muted-foreground">hunt_plans NULL</div>
                          <div className={`text-xl font-bold ${
                            isolationCheckData.summary.null_tenant_issues.hunt_plans_null > 0 ? 'text-red-600' : 'text-green-600'
                          }`}>
                            {isolationCheckData.summary.null_tenant_issues.hunt_plans_null}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Per-Tenant Breakdown */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-medium">Per-Tenant Counts ({isolationCheckData.summary.time_window_hours}h window)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Tenant</TableHead>
                              <TableHead className="text-right">Email Queue</TableHead>
                              <TableHead className="text-right">Load Emails</TableHead>
                              <TableHead className="text-right">Matches</TableHead>
                              <TableHead className="text-right">Active Hunt Plans</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {isolationCheckData.by_tenant.map((tenant) => (
                              <TableRow key={tenant.tenant_id}>
                                <TableCell className="font-medium">{tenant.tenant_name}</TableCell>
                                <TableCell className="text-right">{tenant.email_queue_count}</TableCell>
                                <TableCell className="text-right">{tenant.load_emails_count}</TableCell>
                                <TableCell className="text-right">{tenant.matches_count}</TableCell>
                                <TableCell className="text-right">{tenant.hunt_plans_count}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
