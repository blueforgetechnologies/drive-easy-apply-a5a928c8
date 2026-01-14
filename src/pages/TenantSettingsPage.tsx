import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { TenantDebugBadge } from "@/components/TenantDebugBadge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { 
  ArrowLeft,
  Building2, 
  Mail,
  BarChart3,
  Flag,
  Save,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Copy,
  Pause,
  Play
} from "lucide-react";
import InboundEmailRoutingCard from "@/components/InboundEmailRoutingCard";
import CustomInboundAddresses from "@/components/CustomInboundAddresses";

interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: string;
  release_channel: string;
  is_paused: boolean;
  rate_limit_per_minute: number;
  rate_limit_per_day: number;
  gmail_alias: string | null;
  last_email_received_at: string | null;
  created_at: string;
}

interface FeatureFlag {
  id: string;
  key: string;
  name: string;
  description: string;
  default_enabled: boolean;
  is_killswitch: boolean;
}

interface TenantFeatureFlag {
  id: string;
  tenant_id: string;
  feature_flag_id: string;
  enabled: boolean;
}

export default function TenantSettingsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [featureFlags, setFeatureFlags] = useState<FeatureFlag[]>([]);
  const [tenantFeatureFlags, setTenantFeatureFlags] = useState<TenantFeatureFlag[]>([]);
  
  // Form state
  const [gmailAlias, setGmailAlias] = useState("");
  const [rateLimitMinute, setRateLimitMinute] = useState(60);
  const [rateLimitDay, setRateLimitDay] = useState(10000);
  const [isPaused, setIsPaused] = useState(false);
  const [pendingFlagChanges, setPendingFlagChanges] = useState<Map<string, boolean>>(new Map());

  useEffect(() => {
    if (tenantId) {
      loadTenantData();
    }
  }, [tenantId]);

  const loadTenantData = async () => {
    setLoading(true);
    try {
      // Load tenant, feature flags, and tenant feature flags in parallel
      const [tenantRes, flagsRes, tenantFlagsRes] = await Promise.all([
        supabase.from("tenants").select("*").eq("id", tenantId).single(),
        supabase.from("feature_flags").select("*").order("name"),
        supabase.from("tenant_feature_flags").select("*").eq("tenant_id", tenantId)
      ]);

      if (tenantRes.error) throw tenantRes.error;
      
      const tenantData = tenantRes.data as Tenant;
      setTenant(tenantData);
      setGmailAlias(tenantData.gmail_alias || "");
      setRateLimitMinute(tenantData.rate_limit_per_minute || 60);
      setRateLimitDay(tenantData.rate_limit_per_day || 10000);
      setIsPaused(tenantData.is_paused || false);
      
      if (flagsRes.data) {
        setFeatureFlags(flagsRes.data as FeatureFlag[]);
      }
      
      if (tenantFlagsRes.data) {
        setTenantFeatureFlags(tenantFlagsRes.data as TenantFeatureFlag[]);
      }
    } catch (error: any) {
      toast.error("Failed to load tenant data: " + error.message);
      navigate("/dashboard/platform-admin");
    } finally {
      setLoading(false);
    }
  };

  const getTenantFlagEnabled = (flagId: string, defaultEnabled: boolean): boolean => {
    const override = tenantFeatureFlags.find(tf => tf.feature_flag_id === flagId);
    if (override) return override.enabled;
    
    // Check pending changes
    if (pendingFlagChanges.has(flagId)) {
      return pendingFlagChanges.get(flagId)!;
    }
    
    return defaultEnabled;
  };

  const hasOverride = (flagId: string): boolean => {
    return tenantFeatureFlags.some(tf => tf.feature_flag_id === flagId) || pendingFlagChanges.has(flagId);
  };

  const handleToggleFlag = (flagId: string, currentEnabled: boolean) => {
    const newChanges = new Map(pendingFlagChanges);
    newChanges.set(flagId, !currentEnabled);
    setPendingFlagChanges(newChanges);
  };

  const handleSave = async () => {
    if (!tenant) return;
    
    setSaving(true);
    try {
      // Update tenant settings
      const { error: tenantError } = await supabase
        .from("tenants")
        .update({
          gmail_alias: gmailAlias || null,
          rate_limit_per_minute: rateLimitMinute,
          rate_limit_per_day: rateLimitDay,
          is_paused: isPaused
        })
        .eq("id", tenant.id);

      if (tenantError) throw tenantError;

      // Apply pending flag changes
      for (const [flagId, enabled] of pendingFlagChanges) {
        const existing = tenantFeatureFlags.find(tf => tf.feature_flag_id === flagId);
        
        if (existing) {
          await supabase
            .from("tenant_feature_flags")
            .update({ enabled })
            .eq("id", existing.id);
        } else {
          await supabase
            .from("tenant_feature_flags")
            .insert({
              tenant_id: tenant.id,
              feature_flag_id: flagId,
              enabled
            });
        }
      }

      toast.success("Tenant settings saved successfully");
      setPendingFlagChanges(new Map());
      await loadTenantData(); // Refresh data
    } catch (error: any) {
      toast.error("Failed to save: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const hasUnsavedChanges = () => {
    if (!tenant) return false;
    return (
      gmailAlias !== (tenant.gmail_alias || "") ||
      rateLimitMinute !== (tenant.rate_limit_per_minute || 60) ||
      rateLimitDay !== (tenant.rate_limit_per_day || 10000) ||
      isPaused !== (tenant.is_paused || false) ||
      pendingFlagChanges.size > 0
    );
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h2 className="text-xl font-semibold">Tenant not found</h2>
          <Button className="mt-4" onClick={() => navigate("/dashboard/platform-admin")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Platform Admin
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard/platform-admin")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Building2 className="h-6 w-6" />
              {tenant.name}
            </h1>
            <p className="text-muted-foreground text-sm">{tenant.slug}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadTenantData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={handleSave} disabled={saving || !hasUnsavedChanges()}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      {/* Tenant Debug Badge - TEMPORARY for isolation testing */}
      <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
        <p className="text-xs text-yellow-700 mb-2 font-medium">🔍 Tenant Isolation Debug (temporary)</p>
        <TenantDebugBadge showFull />
      </div>

      {/* Tenant Info Card */}
      <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-6">
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <Badge variant={tenant.is_paused ? "destructive" : tenant.status === "active" ? "default" : "secondary"}>
                {tenant.is_paused ? "Paused" : tenant.status}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Release Channel</p>
              <Badge variant="outline">{tenant.release_channel}</Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Created</p>
              <p className="font-medium">{new Date(tenant.created_at).toLocaleDateString()}</p>
            </div>
            {tenant.last_email_received_at && (
              <div>
                <p className="text-xs text-muted-foreground">Last Email</p>
                <p className="font-medium text-green-600 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  {new Date(tenant.last_email_received_at).toLocaleString()}
                </p>
              </div>
            )}
            <div className="ml-auto text-xs text-muted-foreground font-mono">
              ID: {tenant.id}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pause Ingestion Toggle */}
      <Card className={isPaused ? "border-destructive bg-destructive/5" : "border-green-500/30 bg-green-50/30"}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isPaused ? (
                <Pause className="h-6 w-6 text-destructive" />
              ) : (
                <Play className="h-6 w-6 text-green-600" />
              )}
              <div>
                <h3 className="font-semibold">
                  Email Ingestion: {isPaused ? "PAUSED" : "Active"}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {isPaused 
                    ? "Incoming emails for this tenant are being skipped (not quarantined)" 
                    : "Emails are being processed normally for this tenant"}
                </p>
              </div>
            </div>
            <Switch
              checked={!isPaused}
              onCheckedChange={(checked) => setIsPaused(!checked)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Settings Grid */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Inbound Email Routing Card - Full featured */}
        <InboundEmailRoutingCard
          tenantId={tenant.id}
          tenantName={tenant.name}
          gmailAlias={gmailAlias || tenant.gmail_alias}
          lastEmailReceivedAt={tenant.last_email_received_at}
        />

        {/* Rate Limits Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BarChart3 className="h-5 w-5 text-primary" />
              Rate Limits
            </CardTitle>
            <CardDescription>
              Control email processing throughput for this tenant
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Gmail Alias Input (still needed for editing) */}
            <div>
              <Label htmlFor="gmail-alias">Gmail Alias</Label>
              <Input
                id="gmail-alias"
                value={gmailAlias}
                onChange={(e) => setGmailAlias(e.target.value)}
                placeholder="+carriername-mcnumber"
              />
              <p className="text-xs text-muted-foreground mt-1">
                This determines the carrier email address format
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="rate-minute">Per Minute</Label>
                <Input
                  id="rate-minute"
                  type="number"
                  value={rateLimitMinute}
                  onChange={(e) => setRateLimitMinute(parseInt(e.target.value) || 60)}
                  min={1}
                  max={1000}
                />
                <p className="text-xs text-blue-600 mt-1">Recommended: 60-120</p>
              </div>
              <div>
                <Label htmlFor="rate-day">Per Day</Label>
                <Input
                  id="rate-day"
                  type="number"
                  value={rateLimitDay}
                  onChange={(e) => setRateLimitDay(parseInt(e.target.value) || 10000)}
                  min={100}
                  max={100000}
                />
                <p className="text-xs text-blue-600 mt-1">Recommended: 5K-15K</p>
              </div>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <strong className="text-xs uppercase tracking-wide text-muted-foreground">Fleet Size Guidelines</strong>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                <div className="text-center p-2 bg-background rounded">
                  <p className="font-medium">Small</p>
                  <p className="text-muted-foreground">1-5 trucks</p>
                  <p className="text-primary font-mono">60/min • 5K/day</p>
                </div>
                <div className="text-center p-2 bg-background rounded">
                  <p className="font-medium">Medium</p>
                  <p className="text-muted-foreground">5-20 trucks</p>
                  <p className="text-primary font-mono">120/min • 10K/day</p>
                </div>
                <div className="text-center p-2 bg-background rounded">
                  <p className="font-medium">Large</p>
                  <p className="text-muted-foreground">20+ trucks</p>
                  <p className="text-primary font-mono">200/min • 20K/day</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Custom Inbound Addresses - Full Width */}
      <CustomInboundAddresses
        tenantId={tenant.id}
        tenantName={tenant.name}
      />

      {/* Feature Flags Card - Full Width */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Flag className="h-5 w-5 text-primary" />
            Feature Flags
          </CardTitle>
          <CardDescription>
            Enable or disable features for this tenant. Changes with "Override" badge have custom settings different from the global default.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {featureFlags.map((flag) => {
              const isEnabled = getTenantFlagEnabled(flag.id, flag.default_enabled);
              const isOverridden = hasOverride(flag.id);
              const hasPendingChange = pendingFlagChanges.has(flag.id);
              
              return (
                <div 
                  key={flag.id}
                  className={`flex items-center justify-between p-3 border rounded-lg transition-colors ${
                    hasPendingChange ? 'border-primary bg-primary/5' : ''
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">{flag.name}</span>
                      {isOverridden && (
                        <Badge variant="outline" className="text-xs shrink-0">Override</Badge>
                      )}
                      {flag.is_killswitch && (
                        <Badge variant="destructive" className="text-xs shrink-0">Killswitch</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{flag.description}</p>
                  </div>
                  <Switch
                    checked={isEnabled}
                    onCheckedChange={() => handleToggleFlag(flag.id, isEnabled)}
                    className="ml-2 shrink-0"
                  />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Sticky Save Bar when there are changes */}
      {hasUnsavedChanges() && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-background border shadow-lg rounded-full px-6 py-3 flex items-center gap-4 z-50">
          <span className="text-sm font-medium">You have unsaved changes</span>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      )}
    </div>
  );
}
