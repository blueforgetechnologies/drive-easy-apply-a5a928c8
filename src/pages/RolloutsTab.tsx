import { useState, useEffect } from 'react';
import { 
  RefreshCw, Check, X, Settings2, Shield, 
  ChevronDown, ChevronRight, ToggleLeft, ToggleRight,
  Building2, Zap, AlertTriangle, Info, Trash2, Power, GitBranch
} from 'lucide-react';
import V2PromptGenerator from '@/components/V2PromptGenerator';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Fragment } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useTenantContext } from '@/contexts/TenantContext';

interface FeatureFlag {
  id: string;
  key: string;
  name: string;
  description: string | null;
  default_enabled: boolean;
  is_killswitch: boolean;
}

interface ChannelDefault {
  id: string;
  feature_flag_id: string;
  release_channel: string;
  enabled: boolean;
}

interface TenantOverride {
  id: string;
  tenant_id: string;
  feature_flag_id: string;
  enabled: boolean;
}

interface Tenant {
  id: string;
  name: string;
  slug: string;
  release_channel: string;
  status: string;
}

interface RolloutData {
  flags: FeatureFlag[];
  channelDefaults: ChannelDefault[];
  tenantOverrides: TenantOverride[];
  tenants: Tenant[];
}

export default function RolloutsTab() {
  const { isPlatformAdmin } = useTenantContext();
  const [data, setData] = useState<RolloutData | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  
  // Channel change dialog
  const [channelDialogOpen, setChannelDialogOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [newChannel, setNewChannel] = useState('');
  
  // Bulk action dialogs
  const [allOffDialogOpen, setAllOffDialogOpen] = useState(false);
  
  // Expanded sections
  const [expandedFlags, setExpandedFlags] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isPlatformAdmin) {
      loadData();
    }
  }, [isPlatformAdmin]);

  async function loadData(isInitial = true) {
    // Only show loading spinner on initial load, not on refreshes
    if (isInitial && !data) {
      setLoading(true);
    }
    try {
      const [flagsRes, channelDefaultsRes, tenantOverridesRes, tenantsRes] = await Promise.all([
        supabase.from('feature_flags').select('*').order('key'),
        supabase.from('release_channel_feature_flags').select('*'),
        supabase.from('tenant_feature_flags').select('*'),
        supabase.from('tenants').select('id, name, slug, release_channel, status').order('name'),
      ]);

      if (flagsRes.error) throw flagsRes.error;
      if (channelDefaultsRes.error) throw channelDefaultsRes.error;
      if (tenantOverridesRes.error) throw tenantOverridesRes.error;
      if (tenantsRes.error) throw tenantsRes.error;

      setData({
        flags: flagsRes.data || [],
        channelDefaults: channelDefaultsRes.data || [],
        tenantOverrides: tenantOverridesRes.data || [],
        tenants: tenantsRes.data || [],
      });
    } catch (err) {
      console.error('Error loading rollout data:', err);
      toast.error('Failed to load rollout data');
    } finally {
      setLoading(false);
    }
  }

  // Optimistic update helpers
  function optimisticUpdateGlobalDefault(flagId: string, enabled: boolean) {
    setData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        flags: prev.flags.map(f => 
          f.id === flagId ? { ...f, default_enabled: enabled } : f
        ),
      };
    });
  }

  function optimisticUpdateChannelDefault(flagId: string, channel: string, enabled: boolean) {
    setData(prev => {
      if (!prev) return prev;
      const existingIndex = prev.channelDefaults.findIndex(
        cd => cd.feature_flag_id === flagId && cd.release_channel === channel
      );
      
      if (existingIndex >= 0) {
        // Update existing
        return {
          ...prev,
          channelDefaults: prev.channelDefaults.map((cd, i) => 
            i === existingIndex ? { ...cd, enabled } : cd
          ),
        };
      } else {
        // Add new
        return {
          ...prev,
          channelDefaults: [
            ...prev.channelDefaults,
            {
              id: `temp-${Date.now()}`,
              feature_flag_id: flagId,
              release_channel: channel,
              enabled,
            },
          ],
        };
      }
    });
  }

  function optimisticUpdateTenantOverride(flagId: string, tenantId: string, enabled: boolean) {
    setData(prev => {
      if (!prev) return prev;
      const existingIndex = prev.tenantOverrides.findIndex(
        to => to.feature_flag_id === flagId && to.tenant_id === tenantId
      );
      
      if (existingIndex >= 0) {
        return {
          ...prev,
          tenantOverrides: prev.tenantOverrides.map((to, i) => 
            i === existingIndex ? { ...to, enabled } : to
          ),
        };
      } else {
        return {
          ...prev,
          tenantOverrides: [
            ...prev.tenantOverrides,
            {
              id: `temp-${Date.now()}`,
              feature_flag_id: flagId,
              tenant_id: tenantId,
              enabled,
            },
          ],
        };
      }
    });
  }

  function optimisticRemoveTenantOverride(flagId: string, tenantId: string) {
    setData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        tenantOverrides: prev.tenantOverrides.filter(
          to => !(to.feature_flag_id === flagId && to.tenant_id === tenantId)
        ),
      };
    });
  }

  function getChannelDefault(flagId: string, channel: string): boolean | null {
    const cd = data?.channelDefaults.find(
      d => d.feature_flag_id === flagId && d.release_channel === channel
    );
    return cd ? cd.enabled : null;
  }

  function getTenantOverride(flagId: string, tenantId: string): boolean | null {
    const override = data?.tenantOverrides.find(
      o => o.feature_flag_id === flagId && o.tenant_id === tenantId
    );
    return override ? override.enabled : null;
  }

  function getEffectiveValue(flag: FeatureFlag, channel: string): boolean {
    // Killswitch takes priority
    if (flag.is_killswitch && !flag.default_enabled) return false;
    
    // Channel default
    const channelDefault = getChannelDefault(flag.id, channel);
    if (channelDefault !== null) return channelDefault;
    
    // Global default
    return flag.default_enabled;
  }

  // ==================== GLOBAL DEFAULT CONTROLS ====================
  async function toggleGlobalDefault(flagId: string, currentValue: boolean) {
    const newValue = !currentValue;
    
    // Optimistic update - instant UI response
    optimisticUpdateGlobalDefault(flagId, newValue);
    setUpdating(`global-${flagId}`);
    
    try {
      const { data: result, error } = await supabase.functions.invoke('platform-rollout-control', {
        body: {
          action: 'set_global_default',
          feature_flag_id: flagId,
          enabled: newValue,
        },
      });

      if (error || result?.error) {
        // Revert optimistic update on failure
        optimisticUpdateGlobalDefault(flagId, currentValue);
        toast.error(error?.message || result?.error || 'Failed to update global default');
        return;
      }
      
      toast.success(`Global default ${newValue ? 'enabled' : 'disabled'}`);
      // Background sync to ensure consistency
      loadData(false);
    } catch (err) {
      // Revert optimistic update on error
      optimisticUpdateGlobalDefault(flagId, currentValue);
      console.error('Error updating global default:', err);
      toast.error('Failed to update global default');
    } finally {
      setUpdating(null);
    }
  }

  async function setAllGlobalDefaultsOff() {
    setUpdating('all-off');
    
    // Optimistic update - set all flags to off immediately
    setData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        flags: prev.flags.map(f => ({ ...f, default_enabled: false })),
      };
    });
    
    try {
      const { data: result, error } = await supabase.functions.invoke('platform-rollout-control', {
        body: { action: 'set_all_global_defaults_off' },
      });

      if (error || result?.error) {
        toast.error(error?.message || result?.error || 'Failed to set all global defaults OFF');
        loadData(false);
        return;
      }
      
      toast.success(`Set ${result.updated_count} global defaults to OFF`);
      setAllOffDialogOpen(false);
      loadData(false);
    } catch (err) {
      console.error('Error setting all global defaults OFF:', err);
      toast.error('Failed to set all global defaults OFF');
      loadData(false);
    } finally {
      setUpdating(null);
    }
  }

  // ==================== CHANNEL DEFAULT CONTROLS ====================
  async function toggleChannelDefault(flagId: string, channel: string, effectiveValue: boolean) {
    const newValue = !effectiveValue;
    
    // Optimistic update - instant UI response
    optimisticUpdateChannelDefault(flagId, channel, newValue);
    setUpdating(`${flagId}-${channel}`);
    
    try {
      const { data: result, error } = await supabase.functions.invoke('platform-rollout-control', {
        body: {
          action: 'set_channel_default',
          feature_flag_id: flagId,
          release_channel: channel,
          enabled: newValue,
        },
      });

      if (error || result?.error) {
        optimisticUpdateChannelDefault(flagId, channel, effectiveValue);
        toast.error(error?.message || result?.error || 'Failed to update channel default');
        return;
      }
      
      toast.success(`Channel default updated to ${newValue ? 'ON' : 'OFF'}`);
      loadData(false);
    } catch (err) {
      optimisticUpdateChannelDefault(flagId, channel, effectiveValue);
      console.error('Error updating channel default:', err);
      toast.error('Failed to update channel default');
    } finally {
      setUpdating(null);
    }
  }

  async function clearChannelDefault(flagId: string, channel: string) {
    // Optimistic: remove the channel default from local state
    const prevData = data;
    setData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        channelDefaults: prev.channelDefaults.filter(
          cd => !(cd.feature_flag_id === flagId && cd.release_channel === channel)
        ),
      };
    });
    setUpdating(`clear-${flagId}-${channel}`);
    
    try {
      const { data: result, error } = await supabase.functions.invoke('platform-rollout-control', {
        body: {
          action: 'clear_channel_default',
          feature_flag_id: flagId,
          release_channel: channel,
        },
      });

      if (error || result?.error) {
        setData(prevData);
        toast.error(error?.message || result?.error || 'Failed to clear channel default');
        return;
      }
      
      toast.success('Channel default cleared');
      loadData(false);
    } catch (err) {
      setData(prevData);
      console.error('Error clearing channel default:', err);
      toast.error('Failed to clear channel default');
    } finally {
      setUpdating(null);
    }
  }

  async function clearAllChannelDefaults(flagId: string) {
    const prevData = data;
    setData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        channelDefaults: prev.channelDefaults.filter(cd => cd.feature_flag_id !== flagId),
      };
    });
    setUpdating(`clear-all-channels-${flagId}`);
    
    try {
      const { data: result, error } = await supabase.functions.invoke('platform-rollout-control', {
        body: {
          action: 'clear_all_channel_defaults',
          feature_flag_id: flagId,
        },
      });

      if (error || result?.error) {
        setData(prevData);
        toast.error(error?.message || result?.error || 'Failed to clear channel defaults');
        return;
      }
      
      toast.success(`Cleared ${result.cleared_count} channel defaults`);
      loadData(false);
    } catch (err) {
      setData(prevData);
      console.error('Error clearing channel defaults:', err);
      toast.error('Failed to clear channel defaults');
    } finally {
      setUpdating(null);
    }
  }

  // ==================== TENANT OVERRIDE CONTROLS ====================
  async function toggleTenantOverride(flagId: string, tenantId: string, currentValue: boolean | null) {
    const tenantName = data?.tenants.find(t => t.id === tenantId)?.name || 'tenant';
    const newValue = currentValue === null ? true : !currentValue;
    
    // Optimistic update
    optimisticUpdateTenantOverride(flagId, tenantId, newValue);
    setUpdating(`${flagId}-${tenantId}`);
    
    try {
      const { data: result, error } = await supabase.functions.invoke('platform-rollout-control', {
        body: {
          action: 'set_tenant_override',
          feature_flag_id: flagId,
          tenant_id: tenantId,
          enabled: newValue,
        },
      });

      if (error || result?.error) {
        // Revert
        if (currentValue === null) {
          optimisticRemoveTenantOverride(flagId, tenantId);
        } else {
          optimisticUpdateTenantOverride(flagId, tenantId, currentValue);
        }
        toast.error(error?.message || result?.error || 'Failed to update tenant override');
        return;
      }
      
      toast.success(currentValue === null ? `Override created for ${tenantName}` : `Override updated for ${tenantName}`);
      loadData(false);
    } catch (err) {
      if (currentValue === null) {
        optimisticRemoveTenantOverride(flagId, tenantId);
      } else {
        optimisticUpdateTenantOverride(flagId, tenantId, currentValue);
      }
      console.error('Error updating tenant override:', err);
      toast.error('Failed to update tenant override');
    } finally {
      setUpdating(null);
    }
  }

  async function removeTenantOverride(flagId: string, tenantId: string) {
    const tenantName = data?.tenants.find(t => t.id === tenantId)?.name || 'tenant';
    const prevData = data;
    
    // Optimistic update
    optimisticRemoveTenantOverride(flagId, tenantId);
    setUpdating(`${flagId}-${tenantId}-remove`);
    
    try {
      const { data: result, error } = await supabase.functions.invoke('platform-rollout-control', {
        body: {
          action: 'remove_tenant_override',
          feature_flag_id: flagId,
          tenant_id: tenantId,
        },
      });

      if (error || result?.error) {
        setData(prevData);
        toast.error(error?.message || result?.error || 'Failed to remove override');
        return;
      }
      
      toast.success(`Override removed for ${tenantName}`);
      loadData(false);
    } catch (err) {
      setData(prevData);
      console.error('Error removing tenant override:', err);
      toast.error('Failed to remove override');
    } finally {
      setUpdating(null);
    }
  }

  async function clearAllTenantOverrides(flagId: string) {
    const prevData = data;
    setData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        tenantOverrides: prev.tenantOverrides.filter(to => to.feature_flag_id !== flagId),
      };
    });
    setUpdating(`clear-all-overrides-${flagId}`);
    
    try {
      const { data: result, error } = await supabase.functions.invoke('platform-rollout-control', {
        body: {
          action: 'clear_all_tenant_overrides',
          feature_flag_id: flagId,
        },
      });

      if (error || result?.error) {
        setData(prevData);
        toast.error(error?.message || result?.error || 'Failed to clear tenant overrides');
        return;
      }
      
      toast.success(`Cleared ${result.cleared_count} tenant overrides`);
      loadData(false);
    } catch (err) {
      setData(prevData);
      console.error('Error clearing tenant overrides:', err);
      toast.error('Failed to clear tenant overrides');
    } finally {
      setUpdating(null);
    }
  }

  function openChannelDialog(tenant: Tenant) {
    setSelectedTenant(tenant);
    setNewChannel(tenant.release_channel);
    setChannelDialogOpen(true);
  }

  async function handleChangeChannel() {
    if (!selectedTenant || !newChannel) return;
    
    setUpdating('channel');
    try {
      const { data: result, error } = await supabase.functions.invoke('inspector-release-control', {
        body: {
          tenant_id: selectedTenant.id,
          release_channel: newChannel,
        },
      });

      if (error || result?.error) {
        toast.error(error?.message || result?.error || 'Failed to update channel');
        return;
      }

      toast.success(`${selectedTenant.name} moved to ${newChannel} channel`);
      setChannelDialogOpen(false);
      await loadData();
    } catch (err) {
      console.error('Error updating channel:', err);
      toast.error('Failed to update release channel');
    } finally {
      setUpdating(null);
    }
  }

  function toggleFlagExpanded(flagId: string) {
    setExpandedFlags(prev => {
      const next = new Set(prev);
      if (next.has(flagId)) {
        next.delete(flagId);
      } else {
        next.add(flagId);
      }
      return next;
    });
  }

  function getChannelBadge(channel: string) {
    switch (channel) {
      case 'internal':
        return <Badge className="bg-red-600">Internal</Badge>;
      case 'pilot':
        return <Badge className="bg-amber-500 text-black">Pilot</Badge>;
      case 'general':
        return <Badge variant="outline" className="border-green-500 text-green-600">General</Badge>;
      default:
        return <Badge variant="outline">{channel}</Badge>;
    }
  }

  if (!isPlatformAdmin) {
    return (
      <div className="p-8 text-center">
        <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h2 className="text-lg font-semibold mb-2">Platform Admin Required</h2>
        <p className="text-muted-foreground">
          You need platform admin access to view rollout controls.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-8 text-center">
        <RefreshCw className="h-8 w-8 mx-auto text-muted-foreground animate-spin mb-4" />
        <p className="text-muted-foreground">Loading rollout data...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8 text-center">
        <AlertTriangle className="h-12 w-12 mx-auto text-destructive mb-4" />
        <p className="text-destructive">Failed to load rollout data</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => loadData()}>
          Retry
        </Button>
      </div>
    );
  }

  const channels = ['internal', 'pilot', 'general'];
  const channelDescriptions: Record<string, string> = {
    internal: 'All experimental features. Internal testing only.',
    pilot: 'Stable beta features. Selected partners.',
    general: 'Production-ready features only.',
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Rollout Controls</h1>
          <p className="text-muted-foreground mt-1">
            Manage feature flags across release channels and tenants
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="destructive" 
            size="sm" 
            onClick={() => setAllOffDialogOpen(true)}
            disabled={updating !== null}
          >
            <Power className="h-4 w-4 mr-2" />
            All Global OFF
          </Button>
          <Button variant="outline" size="sm" onClick={() => loadData()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Resolution Priority Notice */}
      <Card className="bg-muted/50">
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div>
              <p className="font-medium">Resolution Priority</p>
              <p className="text-sm text-muted-foreground">
                Killswitch OFF → Tenant Override → Channel Default → Global Default
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Channel Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {channels.map(channel => {
          const count = data.tenants.filter(t => t.release_channel === channel).length;
          return (
            <Card key={channel} className={`border-l-4 ${
              channel === 'internal' ? 'border-l-red-500' :
              channel === 'pilot' ? 'border-l-amber-500' : 'border-l-green-500'
            }`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium capitalize flex items-center gap-2">
                  {getChannelBadge(channel)}
                </CardTitle>
                <CardDescription className="text-xs">
                  {channelDescriptions[channel]}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{count} tenants</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Feature Flags Matrix */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Feature Flags by Channel
          </CardTitle>
          <CardDescription>
            Configure which features are enabled for each release channel
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[280px] min-w-[280px]">Feature</TableHead>
                <TableHead className="w-[140px] min-w-[140px] text-center">Global Default</TableHead>
                <TableHead className="w-[120px] min-w-[120px] text-center">Internal</TableHead>
                <TableHead className="w-[120px] min-w-[120px] text-center">Pilot</TableHead>
                <TableHead className="w-[120px] min-w-[120px] text-center">General</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.flags.map(flag => {
                const isExpanded = expandedFlags.has(flag.id);
                const hasOverrides = data.tenantOverrides.some(o => o.feature_flag_id === flag.id);
                const hasChannelDefaults = data.channelDefaults.some(c => c.feature_flag_id === flag.id);
                const isUpdatingGlobal = updating === `global-${flag.id}`;
                
                return (
                  <Fragment key={flag.id}>
                    <TableRow className={isExpanded ? 'bg-muted/50' : ''}>
                      <TableCell className="w-[280px] min-w-[280px]">
                        <div className="flex items-start gap-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{flag.name}</p>
                              {flag.is_killswitch && (
                                <Tooltip>
                                  <TooltipTrigger>
                                    <Badge variant="destructive" className="text-xs">Kill</Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>Killswitch: Can globally disable this feature</TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">{flag.key}</p>
                            {flag.description && (
                              <p className="text-xs text-muted-foreground/80 mt-1 leading-relaxed">
                                {flag.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="w-[140px] min-w-[140px] text-center">
                        <div className="flex flex-col items-center gap-1">
                          <Switch
                            checked={flag.default_enabled}
                            onCheckedChange={() => toggleGlobalDefault(flag.id, flag.default_enabled)}
                            disabled={isUpdatingGlobal}
                            className="data-[state=checked]:bg-green-600 transition-all duration-200"
                          />
                          <span className={`text-[10px] transition-colors duration-200 ${flag.default_enabled ? 'text-green-600 font-medium' : 'text-muted-foreground'}`}>
                            {flag.default_enabled ? 'ON' : 'OFF'}
                          </span>
                        </div>
                      </TableCell>
                      {channels.map(channel => {
                        const channelDefault = getChannelDefault(flag.id, channel);
                        const effective = getEffectiveValue(flag, channel);
                        const isUpdating = updating === `${flag.id}-${channel}`;
                        
                        return (
                          <TableCell key={channel} className="w-[120px] min-w-[120px] text-center">
                            <div className="flex flex-col items-center gap-1">
                              <Switch
                                checked={effective}
                                onCheckedChange={() => toggleChannelDefault(flag.id, channel, effective)}
                                disabled={isUpdating || (flag.is_killswitch && !flag.default_enabled)}
                                className="data-[state=checked]:bg-green-600 transition-all duration-200"
                              />
                              {channelDefault !== null && (
                                <span className={`text-[10px] transition-colors duration-200 ${effective ? 'text-green-600' : 'text-muted-foreground'}`}>Override</span>
                              )}
                            </div>
                          </TableCell>
                        );
                      })}
                      <TableCell className="w-[50px]">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8"
                          onClick={() => toggleFlagExpanded(flag.id)}
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow key={`${flag.id}-details`} className="bg-muted/30 animate-fade-in">
                        <TableCell colSpan={6} className="py-6">
                          <div className="space-y-6">
                            {/* Feature Description Section */}
                            <div className="bg-background/50 rounded-lg p-4 border">
                              <div className="flex items-start gap-3">
                                <Info className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                                <div>
                                  <h4 className="font-medium text-sm mb-1">About This Feature</h4>
                                  <p className="text-sm text-muted-foreground leading-relaxed">
                                    {flag.description || 'This feature controls specific functionality within the application. When enabled, users in the applicable release channels will have access to this feature.'}
                                  </p>
                                  <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                                    <span className="font-mono bg-muted px-2 py-1 rounded">{flag.key}</span>
                                    {flag.is_killswitch && (
                                      <Badge variant="destructive" className="text-xs">Killswitch Enabled</Badge>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* How Feature Flags Work */}
                            <div className="bg-background/50 rounded-lg p-4 border">
                              <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
                                <GitBranch className="h-4 w-4 text-primary" />
                                How Feature Resolution Works
                              </h4>
                              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                                <div className="bg-red-500/10 rounded-lg p-3 border border-red-500/20">
                                  <p className="font-semibold text-red-600 mb-1">1. Killswitch</p>
                                  <p className="text-muted-foreground">If killswitch is OFF, feature is disabled for everyone regardless of other settings.</p>
                                </div>
                                <div className="bg-purple-500/10 rounded-lg p-3 border border-purple-500/20">
                                  <p className="font-semibold text-purple-600 mb-1">2. Tenant Override</p>
                                  <p className="text-muted-foreground">Specific tenant settings override channel defaults. Use for individual customer needs.</p>
                                </div>
                                <div className="bg-blue-500/10 rounded-lg p-3 border border-blue-500/20">
                                  <p className="font-semibold text-blue-600 mb-1">3. Channel Default</p>
                                  <p className="text-muted-foreground">Settings per release channel (Internal → Pilot → General). Controls rollout stages.</p>
                                </div>
                                <div className="bg-gray-500/10 rounded-lg p-3 border border-gray-500/20">
                                  <p className="font-semibold text-foreground mb-1">4. Global Default</p>
                                  <p className="text-muted-foreground">Fallback when no channel or tenant settings exist. Usually OFF for new features.</p>
                                </div>
                              </div>
                            </div>

                            {/* Channel Defaults Section */}
                            <div className="bg-background/50 rounded-lg p-4 border">
                              <div className="flex items-start justify-between mb-3">
                                <div>
                                  <h4 className="font-medium text-sm flex items-center gap-2">
                                    <Zap className="h-4 w-4 text-primary" />
                                    Channel Defaults
                                  </h4>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Override the global default for specific release channels. Use this to gradually roll out features.
                                  </p>
                                </div>
                                {hasChannelDefaults && (
                                  <Button 
                                    variant="outline" 
                                    size="sm"
                                    onClick={() => clearAllChannelDefaults(flag.id)}
                                    disabled={updating?.startsWith('clear-')}
                                  >
                                    <Trash2 className="h-3 w-3 mr-1" />
                                    Clear All
                                  </Button>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {['internal', 'pilot', 'general'].map(channel => {
                                  const channelDefault = getChannelDefault(flag.id, channel);
                                  if (channelDefault === null) return null;
                                  return (
                                    <Badge 
                                      key={channel}
                                      variant={channelDefault ? 'default' : 'secondary'}
                                      className={`capitalize ${channelDefault ? 'bg-green-600' : ''}`}
                                    >
                                      {channel}: {channelDefault ? 'ON' : 'OFF'}
                                    </Badge>
                                  );
                                })}
                                {!hasChannelDefaults && (
                                  <span className="text-xs text-muted-foreground italic">
                                    No channel overrides set — using global default ({flag.default_enabled ? 'ON' : 'OFF'})
                                  </span>
                                )}
                              </div>
                            </div>
                            
                            {/* Tenant Overrides Section */}
                            <div className="bg-background/50 rounded-lg p-4 border">
                              <div className="flex items-start justify-between mb-3">
                                <div>
                                  <h4 className="font-medium text-sm flex items-center gap-2">
                                    <Building2 className="h-4 w-4 text-primary" />
                                    Tenant Overrides
                                  </h4>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Force enable or disable this feature for specific tenants, regardless of their channel settings.
                                  </p>
                                </div>
                                {hasOverrides && (
                                  <Button 
                                    variant="outline" 
                                    size="sm"
                                    onClick={() => clearAllTenantOverrides(flag.id)}
                                    disabled={updating?.startsWith('clear-')}
                                  >
                                    <Trash2 className="h-3 w-3 mr-1" />
                                    Clear All
                                  </Button>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {data.tenants.map(tenant => {
                                  const override = getTenantOverride(flag.id, tenant.id);
                                  const isUpdating = updating === `${flag.id}-${tenant.id}` || updating === `${flag.id}-${tenant.id}-remove`;
                                  
                                  if (override === null) return null;
                                  
                                  return (
                                    <Badge 
                                      key={tenant.id} 
                                      variant={override ? 'default' : 'secondary'}
                                      className={`gap-1 pr-1 ${override ? 'bg-green-600' : ''}`}
                                    >
                                      {tenant.name}: {override ? 'ON' : 'OFF'}
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-4 w-4 ml-1 hover:bg-destructive/20"
                                        onClick={() => removeTenantOverride(flag.id, tenant.id)}
                                        disabled={isUpdating}
                                      >
                                        <X className="h-3 w-3" />
                                      </Button>
                                    </Badge>
                                  );
                                })}
                                {!hasOverrides && (
                                  <span className="text-xs text-muted-foreground italic">
                                    No tenant overrides — all tenants follow their channel settings
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* V2 Prompt Generator */}
      <V2PromptGenerator />

      {/* Tenant List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Tenant Release Channels
          </CardTitle>
          <CardDescription>
            Manage which release channel each tenant is assigned to
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Release Channel</TableHead>
                <TableHead>Overrides</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.tenants.map(tenant => {
                const overrideCount = data.tenantOverrides.filter(o => o.tenant_id === tenant.id).length;
                
                return (
                  <TableRow key={tenant.id}>
                    <TableCell className="font-medium">{tenant.name}</TableCell>
                    <TableCell className="text-muted-foreground">{tenant.slug}</TableCell>
                    <TableCell>
                      <Badge 
                        variant={tenant.status === 'active' ? 'default' : 'secondary'}
                        className={tenant.status === 'active' ? 'bg-green-600' : ''}
                      >
                        {tenant.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{getChannelBadge(tenant.release_channel)}</TableCell>
                    <TableCell>
                      {overrideCount > 0 ? (
                        <Badge variant="outline">{overrideCount} override{overrideCount !== 1 ? 's' : ''}</Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" onClick={() => openChannelDialog(tenant)}>
                        <Settings2 className="h-3 w-3 mr-1" />
                        Change
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Channel Change Dialog */}
      <Dialog open={channelDialogOpen} onOpenChange={setChannelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Release Channel</DialogTitle>
            <DialogDescription>
              Move <strong>{selectedTenant?.name}</strong> to a different release channel.
              This affects which features are enabled by default.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <Select value={newChannel} onValueChange={setNewChannel}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {channels.map(channel => (
                  <SelectItem key={channel} value={channel}>
                    <div className="flex items-center gap-2">
                      {getChannelBadge(channel)}
                      <span className="text-xs text-muted-foreground ml-2">
                        {channelDescriptions[channel]}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setChannelDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleChangeChannel} 
              disabled={updating === 'channel' || newChannel === selectedTenant?.release_channel}
            >
              {updating === 'channel' ? 'Updating...' : 'Update Channel'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* All Global OFF Confirmation */}
      <AlertDialog open={allOffDialogOpen} onOpenChange={setAllOffDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Set All Global Defaults OFF?</AlertDialogTitle>
            <AlertDialogDescription>
              This will disable all feature flags globally. Features will only be available
              where channel defaults or tenant overrides explicitly enable them.
              <br /><br />
              <strong>This action is logged and reversible.</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={setAllGlobalDefaultsOff}
              disabled={updating === 'all-off'}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {updating === 'all-off' ? 'Updating...' : 'Set All OFF'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
