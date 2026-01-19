import { useState, useEffect } from "react";
import { Loader2, RefreshCw, Check, Settings2, ArrowRight, Info, Shield, ShieldX, Eye, Play, Zap, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";

interface VerificationTestResult {
  endpoint: string;
  flagKey: string;
  status: number;
  body: any;
  elapsedMs: number;
  success: boolean;
}

interface GateTestResult {
  endpoint: string;
  status: number;
  body: any;
}

interface FlagResolution {
  flag_key: string;
  flag_name: string;
  enabled: boolean;
  source: 'tenant_override' | 'release_channel' | 'global_default' | 'killswitch';
}

interface TenantReleaseInfo {
  tenant_id: string;
  tenant_name: string;
  release_channel: string;
  status: string;
  features_from_channel: string[];
  features_from_override: string[];
  all_effective_features: string[];
  flag_resolutions: FlagResolution[];
}

interface FeatureFlagInfo {
  key: string;
  name: string;
  default_enabled: boolean;
  is_killswitch: boolean;
}

interface ChannelSummary {
  internal: number;
  pilot: number;
  general: number;
}

interface ReleaseControlData {
  tenants: TenantReleaseInfo[];
  channel_summary: ChannelSummary;
  feature_flags: FeatureFlagInfo[];
  release_channel_defaults: Record<string, Record<string, boolean>>;
}

export function ReleaseControlTab() {
  const [data, setData] = useState<ReleaseControlData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Channel change dialog
  const [changeDialogOpen, setChangeDialogOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<TenantReleaseInfo | null>(null);
  const [newChannel, setNewChannel] = useState<string>("");
  const [updating, setUpdating] = useState(false);

  // Proof section - selected tenant for detailed view
  const [proofTenantId, setProofTenantId] = useState<string>("__none__");

  // Verification section state
  const [verifyTenantId, setVerifyTenantId] = useState<string>("__none__");
  const [verificationResults, setVerificationResults] = useState<VerificationTestResult[]>([]);
  const [testingEndpoint, setTestingEndpoint] = useState<string | null>(null);

  async function fetchReleaseData() {
    setLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError("Not authenticated");
        return;
      }

      const { data: result, error: fnError } = await supabase.functions.invoke(
        "inspector-release-control",
        { 
          method: "GET",
          headers: { Authorization: `Bearer ${session.access_token}` } 
        }
      );

      if (fnError) {
        setError(fnError.message || "Failed to fetch release data");
        return;
      }

      if (result?.error) {
        setError(result.error);
        return;
      }

      setData(result);
    } catch (err) {
      console.error("Unexpected error:", err);
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchReleaseData();
  }, []);

  async function handleChangeChannel() {
    if (!selectedTenant || !newChannel) return;

    setUpdating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Not authenticated");
        return;
      }

      const { data: result, error: fnError } = await supabase.functions.invoke(
        "inspector-release-control",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: {
            tenant_id: selectedTenant.tenant_id,
            release_channel: newChannel,
          },
        }
      );

      if (fnError || result?.error) {
        toast.error(fnError?.message || result?.error || "Failed to update channel");
        return;
      }

      toast.success(`${selectedTenant.tenant_name} moved to ${newChannel} channel`);
      setChangeDialogOpen(false);
      setSelectedTenant(null);
      setNewChannel("");
      fetchReleaseData();
    } catch (err) {
      console.error("Error updating channel:", err);
      toast.error("Failed to update release channel");
    } finally {
      setUpdating(false);
    }
  }

  function openChangeDialog(tenant: TenantReleaseInfo) {
    setSelectedTenant(tenant);
    setNewChannel(tenant.release_channel);
    setChangeDialogOpen(true);
  }

  function getChannelBadge(channel: string) {
    switch (channel) {
      case "internal":
        return <Badge className="bg-gradient-to-b from-red-500 to-red-700 text-white !px-3 !py-1.5 shadow-md">Internal</Badge>;
      case "pilot":
        return <Badge className="bg-gradient-to-b from-amber-400 to-amber-600 text-black !px-3 !py-1.5 shadow-md">Pilot</Badge>;
      case "general":
        return <Badge className="bg-gradient-to-b from-green-500 to-green-700 text-white !px-3 !py-1.5 shadow-md border-0">General</Badge>;
      default:
        return <Badge variant="outline">{channel}</Badge>;
    }
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case "active":
        return <Badge variant="default" className="bg-gradient-to-b from-green-500 to-green-700 text-white !px-3 !py-1.5 shadow-md">Active</Badge>;
      case "trial":
        return <Badge variant="secondary">Trial</Badge>;
      case "suspended":
        return <Badge variant="destructive">Suspended</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  }

  function getChannelDescription(channel: string): string {
    switch (channel) {
      case "internal":
        return "Full access to all experimental features. For internal testing only.";
      case "pilot":
        return "Early access to stable beta features. Selected partners and testers.";
      case "general":
        return "Production-ready features only. Default for all tenants.";
      default:
        return "";
    }
  }

  function getSourceBadge(source: string) {
    switch (source) {
      case "tenant_override":
        return <Badge variant="outline" className="border-purple-500 text-purple-600 text-xs">Override</Badge>;
      case "release_channel":
        return <Badge variant="outline" className="border-amber-500 text-amber-600 text-xs">Channel</Badge>;
      case "global_default":
        return <Badge variant="outline" className="border-muted-foreground text-muted-foreground text-xs">Global</Badge>;
      case "killswitch":
        return <Badge variant="destructive" className="text-xs">Killed</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">{source}</Badge>;
    }
  }

  const channelOrder = ["internal", "pilot", "general"];

  // Get proof tenant data
  const proofTenant = proofTenantId !== "__none__" 
    ? data?.tenants.find(t => t.tenant_id === proofTenantId) 
    : null;

  // Separate enabled and disabled flags for proof section
  const enabledFlags = proofTenant?.flag_resolutions.filter(f => f.enabled) || [];
  const disabledFlags = proofTenant?.flag_resolutions.filter(f => !f.enabled) || [];

  // Get verification tenant data
  const verifyTenant = verifyTenantId !== "__none__"
    ? data?.tenants.find(t => t.tenant_id === verifyTenantId)
    : null;

  // Verification test endpoints
  const verificationEndpoints = [
    { name: "Geocode", endpoint: "geocode", flagKey: "geocoding_enabled", testBody: { query: "Chicago, IL" } },
    { name: "Test AI", endpoint: "test-ai", flagKey: "ai_parsing_enabled", testBody: { prompt: "Say hello" } },
    { name: "Bid Email", endpoint: "send-bid-email", flagKey: "bid_automation_enabled", testBody: { to: "test@example.com", subject: "Test" } },
  ];

  async function invokeEdgeFunctionRaw(endpoint: string, accessToken: string, body: any) {
    // Use a backend proxy that ALWAYS responds 200, and reports the *real* status in JSON.
    // This avoids Lovable's global runtime overlay being triggered by expected 403 responses.
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/inspector-invoke-proxy`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ endpoint, body }),
    });

    const text = await res.text();
    let payload: any = null;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = text;
    }

    const status = typeof payload?.status === "number" ? payload.status : res.status;
    const responseBody = payload && typeof payload === "object" && "body" in payload ? payload.body : payload;

    return { status, body: responseBody };
  }

  async function runVerificationTest(
    endpoint: string,
    flagKey: string,
    testBody: any
  ): Promise<VerificationTestResult> {
    const startTime = Date.now();

    let session: any = null;
    try {
      const { data } = await supabase.auth.getSession();
      session = data?.session ?? null;
    } catch {
      return {
        endpoint,
        flagKey,
        status: 401,
        body: { error: "Auth error" },
        elapsedMs: Date.now() - startTime,
        success: false,
      };
    }

    if (!session) {
      return {
        endpoint,
        flagKey,
        status: 401,
        body: { error: "Not authenticated" },
        elapsedMs: Date.now() - startTime,
        success: false,
      };
    }

    let status = 200;
    let payload: any = null;

    try {
      const result = await invokeEdgeFunctionRaw(endpoint, session.access_token, {
        ...testBody,
        overrideTenantId: verifyTenantId,
      });

      status = result.status;
      payload = result.body;
    } catch (err: any) {
      status = 500;
      payload = { error: err?.message || "Unknown error" };
    }

    const elapsedMs = Date.now() - startTime;
    const tenantChannel = verifyTenant?.release_channel || "general";
    const expectedStatus = tenantChannel === "general" ? 403 : 200;

    return {
      endpoint,
      flagKey,
      status,
      body: payload,
      elapsedMs,
      success: status === expectedStatus,
    };
  }

  async function runSingleTest(endpoint: string, flagKey: string, testBody: any) {
    if (verifyTenantId === "__none__") {
      toast.error("Please select a tenant first");
      return;
    }

    setTestingEndpoint(endpoint);
    
    const result = await runVerificationTest(endpoint, flagKey, testBody);
    
    setVerificationResults(prev => {
      const filtered = prev.filter(r => r.endpoint !== endpoint);
      return [...filtered, result];
    });

    // Show toast based on result
    if (result.success) {
      toast.success(`${endpoint}: ${result.status === 200 ? 'Allowed' : 'Blocked'} (${result.status}) - PASS`);
    } else if (result.status === 200 || result.status === 403) {
      // Valid response but wrong for this channel
      toast.error(`${endpoint}: Got ${result.status}, expected ${verifyTenant?.release_channel === 'general' ? 403 : 200} - FAIL`);
    } else {
      // Unexpected status (500, 401, etc.)
      toast.error(`${endpoint}: Unexpected error (${result.status})`);
    }
    
    setTestingEndpoint(null);
  }

  async function runAllVerificationTests() {
    if (verifyTenantId === "__none__") {
      toast.error("Please select a tenant first");
      return;
    }

    setVerificationResults([]);
    setTestingEndpoint("all");
    
    // Use Promise.allSettled so one failure doesn't stop others
    const promises = verificationEndpoints.map(ep => 
      runVerificationTest(ep.endpoint, ep.flagKey, ep.testBody)
    );
    
    const results = await Promise.allSettled(promises);
    
    const testResults: VerificationTestResult[] = results.map((result, idx) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        // Promise rejected (shouldn't happen, but handle gracefully)
        return {
          endpoint: verificationEndpoints[idx].endpoint,
          flagKey: verificationEndpoints[idx].flagKey,
          status: 500,
          body: { error: result.reason?.message || 'Unknown error' },
          elapsedMs: 0,
          success: false,
        };
      }
    });
    
    setVerificationResults(testResults);
    
    const passCount = testResults.filter(r => r.success).length;
    const totalCount = testResults.length;
    
    if (passCount === totalCount) {
      toast.success(`All ${totalCount} tests passed`);
    } else {
      toast.info(`${passCount}/${totalCount} tests passed`);
    }
    
    setTestingEndpoint(null);
  }

  function getResultForEndpoint(endpoint: string): VerificationTestResult | undefined {
    return verificationResults.find((r) => r.endpoint === endpoint);
  }

  function safeStringify(value: any) {
    try {
      if (value === undefined || value === null) return "—";
      if (typeof value === "string") return value;
      return JSON.stringify(value, null, 2);
    } catch (err) {
      console.error("Failed to stringify verification payload", err, value);
      try {
        return String(value);
      } catch {
        return "[unprintable]";
      }
    }
  }


  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="pt-6">
          <p className="text-destructive">{error}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={fetchReleaseData}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={fetchReleaseData} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Channel Summary */}
      {data?.channel_summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-red-500/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-red-600">Internal</CardTitle>
              <CardDescription className="text-xs">All experimental features</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{data.channel_summary.internal}</p>
            </CardContent>
          </Card>
          <Card className="border-amber-500/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-amber-600">Pilot</CardTitle>
              <CardDescription className="text-xs">Stable beta features</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{data.channel_summary.pilot}</p>
            </CardContent>
          </Card>
          <Card className="border-green-500/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-green-600">General</CardTitle>
              <CardDescription className="text-xs">Production-ready only</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{data.channel_summary.general}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Rollout Flow Diagram */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings2 className="w-5 h-5" />
            Feature Rollout Flow
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center gap-4 py-4">
            <div className="text-center">
              <div className="w-24 h-16 bg-red-600/20 border border-red-500 rounded-lg flex items-center justify-center">
                <span className="font-semibold text-red-600">Internal</span>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Test everything</p>
            </div>
            <ArrowRight className="w-6 h-6 text-muted-foreground" />
            <div className="text-center">
              <div className="w-24 h-16 bg-amber-500/20 border border-amber-500 rounded-lg flex items-center justify-center">
                <span className="font-semibold text-amber-600">Pilot</span>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Beta testing</p>
            </div>
            <ArrowRight className="w-6 h-6 text-muted-foreground" />
            <div className="text-center">
              <div className="w-24 h-16 bg-green-500/20 border border-green-500 rounded-lg flex items-center justify-center">
                <span className="font-semibold text-green-600">General</span>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Full release</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Feature Flag Proof Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5" />
            Feature Flag Proof
          </CardTitle>
          <CardDescription>
            Select a tenant to see their effective feature flags and resolution sources
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium">Select Tenant:</label>
              <Select value={proofTenantId} onValueChange={setProofTenantId}>
                <SelectTrigger className="w-[300px]">
                  <SelectValue placeholder="Select a tenant" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">-- Select a tenant --</SelectItem>
                  {data?.tenants.map((tenant) => (
                    <SelectItem key={tenant.tenant_id} value={tenant.tenant_id}>
                      {tenant.tenant_name} ({tenant.release_channel})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {proofTenant && (
                <div className="flex items-center gap-2">
                  {getChannelBadge(proofTenant.release_channel)}
                  {getStatusBadge(proofTenant.status)}
                </div>
              )}
            </div>

            {proofTenant && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                {/* Enabled Flags */}
                <Card className="border-green-500/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Shield className="w-4 h-4 text-green-600" />
                      <span className="text-green-600">Enabled Features ({enabledFlags.length})</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[200px]">
                      {enabledFlags.length === 0 ? (
                        <p className="text-muted-foreground text-sm">No enabled features</p>
                      ) : (
                        <div className="space-y-2">
                          {enabledFlags.slice(0, 10).map((flag) => (
                            <div key={flag.flag_key} className="flex items-center justify-between py-1 border-b border-border/50 last:border-0">
                              <div>
                                <p className="text-sm font-medium">{flag.flag_name}</p>
                                <p className="text-xs text-muted-foreground">{flag.flag_key}</p>
                              </div>
                              {getSourceBadge(flag.source)}
                            </div>
                          ))}
                          {enabledFlags.length > 10 && (
                            <p className="text-xs text-muted-foreground pt-2">
                              + {enabledFlags.length - 10} more...
                            </p>
                          )}
                        </div>
                      )}
                    </ScrollArea>
                  </CardContent>
                </Card>

                {/* Disabled Flags */}
                <Card className="border-red-500/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <ShieldX className="w-4 h-4 text-red-600" />
                      <span className="text-red-600">Disabled Features ({disabledFlags.length})</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[200px]">
                      {disabledFlags.length === 0 ? (
                        <p className="text-muted-foreground text-sm">No disabled features</p>
                      ) : (
                        <div className="space-y-2">
                          {disabledFlags.slice(0, 10).map((flag) => (
                            <div key={flag.flag_key} className="flex items-center justify-between py-1 border-b border-border/50 last:border-0">
                              <div>
                                <p className="text-sm font-medium">{flag.flag_name}</p>
                                <p className="text-xs text-muted-foreground">{flag.flag_key}</p>
                              </div>
                              {getSourceBadge(flag.source)}
                            </div>
                          ))}
                          {disabledFlags.length > 10 && (
                            <p className="text-xs text-muted-foreground pt-2">
                              + {disabledFlags.length - 10} more...
                            </p>
                          )}
                        </div>
                      )}
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Live Verification Section */}
      <Card className="border-blue-500/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-blue-500" />
            Live Feature Gate Verification
          </CardTitle>
          <CardDescription>
            Test edge function feature gates in real-time. Select a tenant and test each gated endpoint.
            This uses the overrideTenantId mechanism (platform admin only) to simulate requests as if from that tenant.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Tenant Selection */}
            <div className="flex items-center gap-4 flex-wrap">
              <label className="text-sm font-medium">Test as Tenant:</label>
              <Select value={verifyTenantId} onValueChange={(v) => { setVerifyTenantId(v); setVerificationResults([]); }}>
                <SelectTrigger className="w-[300px]">
                  <SelectValue placeholder="Select a tenant" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">-- Select a tenant --</SelectItem>
                  {data?.tenants.map((tenant) => (
                    <SelectItem key={tenant.tenant_id} value={tenant.tenant_id}>
                      {tenant.tenant_name} ({tenant.release_channel})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {verifyTenant && (
                <div className="flex items-center gap-2">
                  {getChannelBadge(verifyTenant.release_channel)}
                  <span className="text-xs text-muted-foreground">
                    Expected: {verifyTenant.release_channel === 'general' ? '403 Blocked' : '200 Allowed'}
                  </span>
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={runAllVerificationTests}
                disabled={verifyTenantId === "__none__" || testingEndpoint !== null}
              >
                <Play className="w-4 h-4 mr-2" />
                Run All Tests
              </Button>
            </div>

            {/* Test Buttons */}
            {verifyTenantId !== "__none__" && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                {verificationEndpoints.map((ep) => {
                  const result = getResultForEndpoint(ep.endpoint);
                  const isRunning = testingEndpoint === ep.endpoint;
                  
                  return (
                    <Card key={ep.endpoint} className={`${result ? (result.status === 200 ? 'border-green-500/50' : result.status === 403 ? 'border-amber-500/50' : 'border-red-500/50') : 'border-border'}`}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center justify-between">
                          <span>{ep.name}</span>
                          {result && (
                            result.status === 200 ? (
                              <CheckCircle2 className="w-4 h-4 text-green-500" />
                            ) : result.status === 403 ? (
                              <Shield className="w-4 h-4 text-amber-500" />
                            ) : (
                              <AlertTriangle className="w-4 h-4 text-red-500" />
                            )
                          )}
                        </CardTitle>
                        <CardDescription className="text-xs font-mono">{ep.flagKey}</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => runSingleTest(ep.endpoint, ep.flagKey, ep.testBody)}
                          disabled={isRunning}
                        >
                          {isRunning ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Testing...
                            </>
                          ) : (
                            <>
                              <Zap className="w-4 h-4 mr-2" />
                              Test {ep.name}
                            </>
                          )}
                        </Button>
                        
                        {result && (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="flex items-center gap-1">
                                <Badge variant={result.status === 200 ? "default" : result.status === 403 ? "secondary" : "destructive"} className="text-xs">
                                  {result.status}
                                </Badge>
                                {result.status === 200 && <span className="text-green-600">Allowed</span>}
                                {result.status === 403 && <span className="text-amber-600">Blocked</span>}
                                {result.status !== 200 && result.status !== 403 && <span className="text-red-600">Error</span>}
                              </span>
                              <span className="flex items-center gap-1 text-muted-foreground">
                                <Clock className="w-3 h-3" />
                                {result.elapsedMs}ms
                              </span>
                            </div>
                            
                            {result.body?.reason && (
                              <p className="text-xs text-muted-foreground">
                                Reason: <span className="font-mono">{result.body.reason}</span>
                              </p>
                            )}
                            
                            <ScrollArea className="h-[80px] mt-2">
                              <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                                {safeStringify(result.body)}
                              </pre>
                            </ScrollArea>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            {/* Expected Results Guide */}
            <div className="flex items-start gap-2 text-xs text-muted-foreground mt-4 p-3 bg-muted/50 rounded-lg">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium mb-1">Expected Results:</p>
                <ul className="space-y-0.5">
                  <li>• <span className="text-green-600 font-medium">Internal/Pilot</span> tenants → 200 (Allowed)</li>
                  <li>• <span className="text-amber-600 font-medium">General</span> tenants → 403 with reason="release_channel"</li>
                  <li>• <span className="text-purple-600 font-medium">Tenant Override</span> can enable/disable per-tenant regardless of channel</li>
                </ul>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tenant Release Status */}
      <Card>
        <CardHeader>
          <CardTitle>Tenant Release Channels</CardTitle>
          <CardDescription>
            Manage which features each tenant can access based on their release channel
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && !data ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !data?.tenants?.length ? (
            <p className="text-muted-foreground text-center py-8">No tenants found</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Features (Channel)</TableHead>
                  <TableHead>Features (Override)</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.tenants.map((tenant) => (
                  <TableRow key={tenant.tenant_id}>
                    <TableCell className="font-medium">{tenant.tenant_name}</TableCell>
                    <TableCell>{getStatusBadge(tenant.status)}</TableCell>
                    <TableCell>{getChannelBadge(tenant.release_channel)}</TableCell>
                    <TableCell>
                      {tenant.features_from_channel.length > 0 ? (
                        <Tooltip>
                          <TooltipTrigger>
                            <span className="text-sm text-amber-600">
                              {tenant.features_from_channel.length} feature{tenant.features_from_channel.length !== 1 ? 's' : ''}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="max-w-[300px]">
                            <p className="font-semibold mb-1">From release channel:</p>
                            <ul className="text-xs space-y-0.5">
                              {tenant.features_from_channel.map(f => (
                                <li key={f}>• {f}</li>
                              ))}
                            </ul>
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {tenant.features_from_override.length > 0 ? (
                        <Tooltip>
                          <TooltipTrigger>
                            <span className="text-sm text-purple-600">
                              {tenant.features_from_override.length} override{tenant.features_from_override.length !== 1 ? 's' : ''}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="max-w-[300px]">
                            <p className="font-semibold mb-1">Tenant overrides:</p>
                            <ul className="text-xs space-y-0.5">
                              {tenant.features_from_override.map(f => (
                                <li key={f}>• {f}</li>
                              ))}
                            </ul>
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openChangeDialog(tenant)}
                      >
                        <Settings2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Legend */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium mb-2">Feature Resolution Priority:</p>
              <ol className="list-decimal list-inside space-y-1 text-xs">
                <li><span className="text-red-600 font-medium">Killswitch</span> — If a feature's killswitch is active, it's OFF for everyone</li>
                <li><span className="text-purple-600 font-medium">Tenant Override</span> — Explicit per-tenant settings override channel defaults</li>
                <li><span className="text-amber-600 font-medium">Release Channel</span> — Features enabled for internal/pilot channels</li>
                <li><span className="text-muted-foreground font-medium">Global Default</span> — The feature's default enabled state</li>
              </ol>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Change Channel Dialog */}
      <Dialog open={changeDialogOpen} onOpenChange={setChangeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Release Channel</DialogTitle>
            <DialogDescription>
              Move {selectedTenant?.tenant_name} to a different release channel.
              This will immediately affect which features they can access.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Current Channel</label>
              <div>{selectedTenant && getChannelBadge(selectedTenant.release_channel)}</div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">New Channel</label>
              <Select value={newChannel} onValueChange={setNewChannel}>
                <SelectTrigger>
                  <SelectValue placeholder="Select channel" />
                </SelectTrigger>
                <SelectContent>
                  {channelOrder.map((channel) => (
                    <SelectItem key={channel} value={channel}>
                      <div className="flex items-center gap-2">
                        {getChannelBadge(channel)}
                        <span className="text-xs text-muted-foreground ml-2">
                          {getChannelDescription(channel)}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {newChannel && newChannel !== selectedTenant?.release_channel && (
              <div className="p-3 bg-muted rounded-lg text-sm">
                <p className="font-medium mb-1">Effect:</p>
                {channelOrder.indexOf(newChannel) < channelOrder.indexOf(selectedTenant?.release_channel || "general") ? (
                  <p className="text-amber-600">⚠️ This will give {selectedTenant?.tenant_name} access to more experimental features.</p>
                ) : (
                  <p className="text-green-600">✓ This will restrict {selectedTenant?.tenant_name} to more stable features only.</p>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setChangeDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleChangeChannel}
              disabled={updating || newChannel === selectedTenant?.release_channel}
            >
              {updating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Confirm Change
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
