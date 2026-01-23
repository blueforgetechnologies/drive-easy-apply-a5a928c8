import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useTenantFilter } from "@/hooks/useTenantFilter";
import { Loader2, RefreshCw, CheckCircle2, XCircle, AlertCircle, Settings as SettingsIcon, Bell, Mail, ShieldCheck, Globe, Building2, Eye, EyeOff, Save, TestTube } from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";

// Platform integrations in scope
const PLATFORM_INTEGRATIONS = [
  { key: 'samsara', name: 'Samsara', description: 'Vehicle telematics and fleet tracking', icon: 'truck', fieldKey: 'api_key', fieldLabel: 'API Key' },
  { key: 'mapbox', name: 'Mapbox', description: 'Maps and geocoding services', icon: 'map', fieldKey: 'token', fieldLabel: 'Access Token' },
  { key: 'resend', name: 'Resend', description: 'Transactional email service', icon: 'mail', fieldKey: 'api_key', fieldLabel: 'API Key' },
  { key: 'weather', name: 'Weather API', description: 'Real-time weather data for locations', icon: 'cloud', fieldKey: 'api_key', fieldLabel: 'API Key' },
  { key: 'highway', name: 'Highway', description: 'Carrier identity verification and fraud prevention', icon: 'shield', fieldKey: 'api_key', fieldLabel: 'API Key' },
];

interface PlatformIntegration {
  id: string;
  integration_key: string;
  is_enabled: boolean;
  config: { encrypted?: string } | null;
  config_hint: string | null;
  description: string | null;
  updated_at: string;
}

interface TenantIntegrationOverride {
  id: string;
  provider: string;
  use_global: boolean;
  is_enabled: boolean;
  override_hint: string | null;
}

export default function IntegrationsTab() {
  const { tenantId, shouldFilter, isPlatformAdmin } = useTenantFilter();
  const [activeTab, setActiveTab] = useState<'platform' | 'tenant'>(isPlatformAdmin ? 'platform' : 'tenant');
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Platform admin state
  const [platformIntegrations, setPlatformIntegrations] = useState<PlatformIntegration[]>([]);
  const [platformCredentials, setPlatformCredentials] = useState<Record<string, string>>({});
  const [platformShowSecrets, setPlatformShowSecrets] = useState<Record<string, boolean>>({});
  const [savingPlatform, setSavingPlatform] = useState<string | null>(null);
  const [testingPlatform, setTestingPlatform] = useState<string | null>(null);
  
  // Tenant admin state
  const [tenantOverrides, setTenantOverrides] = useState<Record<string, TenantIntegrationOverride>>({});
  const [tenantCredentials, setTenantCredentials] = useState<Record<string, string>>({});
  const [tenantShowSecrets, setTenantShowSecrets] = useState<Record<string, boolean>>({});
  const [savingTenant, setSavingTenant] = useState<string | null>(null);
  const [testingTenant, setTestingTenant] = useState<string | null>(null);
  const [togglingGlobal, setTogglingGlobal] = useState<string | null>(null);

  // Fetch platform integrations (for platform admins)
  const loadPlatformIntegrations = useCallback(async () => {
    if (!isPlatformAdmin) return;
    
    try {
      const { data, error } = await supabase.functions.invoke('manage-platform-integration', {
        body: { action: 'list' },
      });
      
      if (error) throw error;
      setPlatformIntegrations(data?.integrations || []);
    } catch (error) {
      console.error('Error loading platform integrations:', error);
      toast.error('Failed to load platform integrations');
    }
  }, [isPlatformAdmin]);

  // Fetch tenant overrides
  const loadTenantOverrides = useCallback(async () => {
    if (!tenantId) return;
    
    try {
      const { data, error } = await supabase
        .from('tenant_integrations')
        .select('id, provider, use_global, is_enabled, override_hint')
        .eq('tenant_id', tenantId)
        .in('provider', PLATFORM_INTEGRATIONS.map(p => p.key));
      
      if (error) throw error;
      
      const overridesMap: Record<string, TenantIntegrationOverride> = {};
      (data || []).forEach((item: TenantIntegrationOverride) => {
        overridesMap[item.provider] = item;
      });
      setTenantOverrides(overridesMap);
    } catch (error) {
      console.error('Error loading tenant overrides:', error);
    }
  }, [tenantId]);

  useEffect(() => {
    loadPlatformIntegrations();
    loadTenantOverrides();
  }, [loadPlatformIntegrations, loadTenantOverrides]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([loadPlatformIntegrations(), loadTenantOverrides()]);
    setIsRefreshing(false);
    toast.success('Refreshed integration status');
  };

  // Platform admin: toggle enabled
  const handlePlatformToggle = async (integrationKey: string, enabled: boolean) => {
    try {
      const { error } = await supabase.functions.invoke('manage-platform-integration', {
        body: { action: 'update', integration_key: integrationKey, is_enabled: enabled },
      });
      
      if (error) throw error;
      
      setPlatformIntegrations(prev => 
        prev.map(i => i.integration_key === integrationKey ? { ...i, is_enabled: enabled } : i)
      );
      toast.success(`${integrationKey} ${enabled ? 'enabled' : 'disabled'} globally`);
    } catch (error) {
      console.error('Error toggling integration:', error);
      toast.error('Failed to update integration');
    }
  };

  // Platform admin: save credentials
  const handlePlatformSave = async (integrationKey: string) => {
    const cred = platformCredentials[integrationKey];
    if (!cred?.trim()) {
      toast.error('Please enter API credentials');
      return;
    }

    setSavingPlatform(integrationKey);
    try {
      const integration = PLATFORM_INTEGRATIONS.find(i => i.key === integrationKey);
      const config = { [integration?.fieldKey || 'api_key']: cred.trim() };
      
      const { error } = await supabase.functions.invoke('manage-platform-integration', {
        body: { action: 'update', integration_key: integrationKey, config },
      });
      
      if (error) throw error;
      
      toast.success(`${integrationKey} credentials saved`);
      setPlatformCredentials(prev => ({ ...prev, [integrationKey]: '' }));
      await loadPlatformIntegrations();
    } catch (error) {
      console.error('Error saving credentials:', error);
      toast.error('Failed to save credentials');
    } finally {
      setSavingPlatform(null);
    }
  };

  // Platform admin: test integration
  const handlePlatformTest = async (integrationKey: string) => {
    setTestingPlatform(integrationKey);
    try {
      const { data, error } = await supabase.functions.invoke('test-platform-integration', {
        body: { integration_key: integrationKey },
      });
      
      if (error) throw error;
      
      if (data?.status === 'healthy') {
        toast.success('Connection test successful', { description: data.message });
      } else {
        toast.error('Connection test failed', { description: data?.message });
      }
    } catch (error) {
      console.error('Error testing integration:', error);
      toast.error('Failed to test connection');
    } finally {
      setTestingPlatform(null);
    }
  };

  // Tenant admin: toggle use_global
  const handleTenantToggleGlobal = async (integrationKey: string, useGlobal: boolean) => {
    if (!tenantId) return;
    
    setTogglingGlobal(integrationKey);
    try {
      const { error } = await supabase
        .from('tenant_integrations')
        .upsert({
          tenant_id: tenantId,
          provider: integrationKey,
          use_global: useGlobal,
          is_enabled: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'tenant_id,provider' });
      
      if (error) throw error;
      
      await loadTenantOverrides();
      toast.success(useGlobal ? 'Using global defaults' : 'Ready for custom credentials');
    } catch (error) {
      console.error('Error toggling global:', error);
      toast.error('Failed to update setting');
    } finally {
      setTogglingGlobal(null);
    }
  };

  // Tenant admin: save override credentials
  const handleTenantSaveOverride = async (integrationKey: string) => {
    const cred = tenantCredentials[integrationKey];
    if (!cred?.trim()) {
      toast.error('Please enter API credentials');
      return;
    }

    setSavingTenant(integrationKey);
    try {
      const integration = PLATFORM_INTEGRATIONS.find(i => i.key === integrationKey);
      const credentials = { [integration?.fieldKey || 'api_key']: cred.trim() };
      
      const { error } = await supabase.functions.invoke('set-tenant-integration', {
        body: { 
          tenant_id: tenantId, 
          provider: integrationKey,
          is_enabled: true,
          credentials,
        },
      });
      
      if (error) throw error;
      
      // Also set use_global = false
      await supabase
        .from('tenant_integrations')
        .update({ use_global: false })
        .eq('tenant_id', tenantId)
        .eq('provider', integrationKey);
      
      toast.success(`${integrationKey} override saved`);
      setTenantCredentials(prev => ({ ...prev, [integrationKey]: '' }));
      await loadTenantOverrides();
    } catch (error) {
      console.error('Error saving override:', error);
      toast.error('Failed to save credentials');
    } finally {
      setSavingTenant(null);
    }
  };

  // Tenant admin: test integration (uses resolve-integration to get the right config)
  const handleTenantTest = async (integrationKey: string) => {
    if (!tenantId) return;
    
    setTestingTenant(integrationKey);
    try {
      const { data, error } = await supabase.functions.invoke('test-tenant-integration', {
        body: { tenant_id: tenantId, provider: integrationKey },
      });
      
      if (error) throw error;
      
      if (data?.status === 'healthy') {
        toast.success('Connection test successful', { description: data.message });
      } else {
        toast.error('Connection test failed', { description: data?.message });
      }
    } catch (error) {
      console.error('Error testing integration:', error);
      toast.error('Failed to test connection');
    } finally {
      setTestingTenant(null);
    }
  };

  const getPlatformStatus = (integrationKey: string) => {
    const integration = platformIntegrations.find(i => i.integration_key === integrationKey);
    if (!integration) return { configured: false, enabled: false, hint: null };
    return {
      configured: !!integration.config?.encrypted,
      enabled: integration.is_enabled,
      hint: integration.config_hint,
    };
  };

  const getTenantStatus = (integrationKey: string) => {
    const override = tenantOverrides[integrationKey];
    const platformStatus = getPlatformStatus(integrationKey);
    
    if (!override || override.use_global !== false) {
      // Using global
      return {
        source: 'global' as const,
        configured: platformStatus.configured,
        enabled: platformStatus.enabled,
        hint: platformStatus.hint,
      };
    }
    
    // Using override
    return {
      source: 'override' as const,
      configured: !!override.override_hint,
      enabled: override.is_enabled,
      hint: override.override_hint,
    };
  };

  if (!tenantId && shouldFilter && !isPlatformAdmin) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Please select a tenant to manage integrations.</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-xl font-bold">API Integrations</h2>
          <p className="text-sm text-muted-foreground">
            {isPlatformAdmin ? 'Manage global defaults and tenant overrides' : 'Configure integrations for your organization'}
          </p>
        </div>
        <Button onClick={handleRefresh} disabled={isRefreshing} size="sm" variant="outline">
          {isRefreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Refresh
        </Button>
      </div>

      {/* Tab switcher for platform admins */}
      {isPlatformAdmin && (
        <div className="flex gap-2 border-b pb-2">
          <Button
            variant={activeTab === 'platform' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('platform')}
            className="gap-2"
          >
            <Globe className="h-4 w-4" />
            Platform Defaults
          </Button>
          <Button
            variant={activeTab === 'tenant' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('tenant')}
            className="gap-2"
          >
            <Building2 className="h-4 w-4" />
            Tenant Overrides
          </Button>
        </div>
      )}

      {/* Platform Admin View */}
      {activeTab === 'platform' && isPlatformAdmin && (
        <div className="space-y-4">
          <Card className="border-blue-200 bg-blue-50/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Globe className="h-5 w-5 text-blue-600" />
                Global Integration Defaults
              </CardTitle>
              <CardDescription>
                These API keys are used by all tenants unless they configure their own override.
              </CardDescription>
            </CardHeader>
          </Card>

          {PLATFORM_INTEGRATIONS.map((integration) => {
            const status = getPlatformStatus(integration.key);
            const isSaving = savingPlatform === integration.key;
            const isTesting = testingPlatform === integration.key;
            
            return (
              <Card key={integration.key}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{integration.name}</CardTitle>
                      <CardDescription>{integration.description}</CardDescription>
                    </div>
                    <div className="flex items-center gap-3">
                      {status.configured ? (
                        <Badge className="bg-gradient-to-b from-green-400 to-green-600 text-white !px-3 !py-1.5 shadow-md">Configured</Badge>
                      ) : (
                        <Badge variant="secondary">Not Configured</Badge>
                      )}
                      <Switch
                        checked={status.enabled}
                        onCheckedChange={(checked) => handlePlatformToggle(integration.key, checked)}
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {status.hint && (
                      <p className="text-sm text-muted-foreground">
                        Current: <code className="bg-muted px-1.5 py-0.5 rounded">{status.hint}</code>
                      </p>
                    )}
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input
                          type={platformShowSecrets[integration.key] ? 'text' : 'password'}
                          placeholder={status.hint ? 'Enter new key to replace...' : `Enter ${integration.fieldLabel}...`}
                          value={platformCredentials[integration.key] || ''}
                          onChange={(e) => setPlatformCredentials(prev => ({ ...prev, [integration.key]: e.target.value }))}
                          className="pr-10"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-0 top-0 h-full px-3"
                          onClick={() => setPlatformShowSecrets(prev => ({ ...prev, [integration.key]: !prev[integration.key] }))}
                        >
                          {platformShowSecrets[integration.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                      <Button onClick={() => handlePlatformSave(integration.key)} disabled={isSaving}>
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      </Button>
                      {status.configured && (
                        <Button variant="outline" onClick={() => handlePlatformTest(integration.key)} disabled={isTesting}>
                          {isTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube className="h-4 w-4" />}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Tenant Admin View */}
      {activeTab === 'tenant' && (
        <div className="space-y-4">
          {!tenantId ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Select a tenant to manage integration overrides
              </CardContent>
            </Card>
          ) : (
            <>
              <Card className="border-amber-200 bg-amber-50/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-amber-600" />
                    Tenant Integration Settings
                  </CardTitle>
                  <CardDescription>
                    By default, your organization uses the global platform keys. Toggle "Use Global" off to provide your own API keys.
                  </CardDescription>
                </CardHeader>
              </Card>

              {PLATFORM_INTEGRATIONS.map((integration) => {
                const tenantStatus = getTenantStatus(integration.key);
                const override = tenantOverrides[integration.key];
                const useGlobal = !override || override.use_global !== false;
                const isToggling = togglingGlobal === integration.key;
                const isSaving = savingTenant === integration.key;
                const isTesting = testingTenant === integration.key;
                
                return (
                  <Card key={integration.key}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-base">{integration.name}</CardTitle>
                          <CardDescription>{integration.description}</CardDescription>
                        </div>
                        <div className="flex items-center gap-3">
                          {tenantStatus.source === 'global' ? (
                            <Badge variant="outline" className="gap-1">
                              <Globe className="h-3 w-3" />
                              Global
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-500 gap-1">
                              <Building2 className="h-3 w-3" />
                              Override
                            </Badge>
                          )}
                          {tenantStatus.configured ? (
                            <CheckCircle2 className="h-5 w-5 text-green-500" />
                          ) : (
                            <AlertCircle className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <Label htmlFor={`global-${integration.key}`} className="flex items-center gap-2">
                            <Globe className="h-4 w-4" />
                            Use Global Default
                          </Label>
                          <Switch
                            id={`global-${integration.key}`}
                            checked={useGlobal}
                            onCheckedChange={(checked) => handleTenantToggleGlobal(integration.key, checked)}
                            disabled={isToggling}
                          />
                        </div>

                        {!useGlobal && (
                          <div className="space-y-3 border-t pt-4">
                            {tenantStatus.hint && (
                              <p className="text-sm text-muted-foreground">
                                Current override: <code className="bg-muted px-1.5 py-0.5 rounded">{tenantStatus.hint}</code>
                              </p>
                            )}
                            <div className="flex gap-2">
                              <div className="relative flex-1">
                                <Input
                                  type={tenantShowSecrets[integration.key] ? 'text' : 'password'}
                                  placeholder={tenantStatus.hint ? 'Enter new key to replace...' : `Enter your ${integration.fieldLabel}...`}
                                  value={tenantCredentials[integration.key] || ''}
                                  onChange={(e) => setTenantCredentials(prev => ({ ...prev, [integration.key]: e.target.value }))}
                                  className="pr-10"
                                />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="absolute right-0 top-0 h-full px-3"
                                  onClick={() => setTenantShowSecrets(prev => ({ ...prev, [integration.key]: !prev[integration.key] }))}
                                >
                                  {tenantShowSecrets[integration.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </Button>
                              </div>
                              <Button onClick={() => handleTenantSaveOverride(integration.key)} disabled={isSaving}>
                                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                              </Button>
                            </div>
                          </div>
                        )}

                        <div className="flex gap-2 pt-2">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => handleTenantTest(integration.key)} 
                            disabled={isTesting || !tenantStatus.configured}
                            className="gap-1.5"
                          >
                            {isTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube className="h-4 w-4" />}
                            Test Connection
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
