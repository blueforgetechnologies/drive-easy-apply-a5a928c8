import { useState, useEffect } from "react";
import { Loader2, RefreshCw, Check, Settings2, ArrowRight, Info, Shield, ShieldX, Eye } from "lucide-react";
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
        return <Badge className="bg-red-600">Internal</Badge>;
      case "pilot":
        return <Badge className="bg-amber-500 text-black">Pilot</Badge>;
      case "general":
        return <Badge variant="outline" className="border-green-500 text-green-600">General</Badge>;
      default:
        return <Badge variant="outline">{channel}</Badge>;
    }
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case "active":
        return <Badge variant="default" className="bg-green-600">Active</Badge>;
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
