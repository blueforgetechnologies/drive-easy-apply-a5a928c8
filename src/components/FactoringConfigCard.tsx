import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  DollarSign, 
  Save, 
  TestTube, 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  Eye,
  EyeOff
} from "lucide-react";
import { cn } from "@/lib/utils";

interface FactoringConfig {
  id: string;
  provider: string;
  is_enabled: boolean;
  credentials_hint: string | null;
  settings: Record<string, unknown>;
  sync_status: string;
  error_message: string | null;
  last_checked_at: string | null;
}

interface FactoringConfigCardProps {
  tenantId: string;
}

export function FactoringConfigCard({ tenantId }: FactoringConfigCardProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [config, setConfig] = useState<FactoringConfig | null>(null);
  
  // Form state
  const [isEnabled, setIsEnabled] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    loadConfig();
  }, [tenantId]);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("tenant_factoring_config")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("provider", "otr_solutions")
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setConfig(data as FactoringConfig);
        setIsEnabled(data.is_enabled);
      }
    } catch (error: any) {
      console.error("Error loading factoring config:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.access_token) {
        throw new Error("Not authenticated");
      }

      const credentials: Record<string, string> = {};
      if (apiKey) credentials.api_key = apiKey;
      if (username) credentials.username = username;
      if (password) credentials.password = password;

      const response = await supabase.functions.invoke("set-factoring-config", {
        body: {
          tenant_id: tenantId,
          provider: "otr_solutions",
          is_enabled: isEnabled,
          credentials: Object.keys(credentials).length > 0 ? credentials : undefined,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || "Failed to save");
      }

      toast.success("Factoring configuration saved");
      
      // Clear form and reload
      setApiKey("");
      setUsername("");
      setPassword("");
      await loadConfig();
    } catch (error: any) {
      toast.error("Failed to save: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      // Use existing credentials if no new ones provided
      const credentials: Record<string, string> = {};
      if (apiKey) credentials.api_key = apiKey;
      if (username) credentials.username = username;
      if (password) credentials.password = password;

      if (Object.keys(credentials).length === 0 && !config?.credentials_hint) {
        toast.error("Please enter credentials first");
        setTesting(false);
        return;
      }

      const response = await supabase.functions.invoke("set-factoring-config", {
        body: {
          tenant_id: tenantId,
          provider: "otr_solutions",
          action: "test",
          credentials: Object.keys(credentials).length > 0 ? credentials : undefined,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || "Test failed");
      }

      const result = response.data;
      if (result.success) {
        toast.success(result.message || "Connection successful!");
      } else {
        toast.error(result.error || "Connection failed");
      }
      
      await loadConfig();
    } catch (error: any) {
      toast.error("Test failed: " + error.message);
    } finally {
      setTesting(false);
    }
  };

  const getSyncStatusBadge = () => {
    if (!config) return null;
    
    switch (config.sync_status) {
      case "healthy":
        return (
          <Badge className="bg-green-500/10 text-green-600 border-green-500/30">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Connected
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive" className="bg-red-500/10 text-red-600 border-red-500/30">
            <XCircle className="h-3 w-3 mr-1" />
            Failed
          </Badge>
        );
      case "pending":
        return (
          <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30">
            <AlertCircle className="h-3 w-3 mr-1" />
            Pending Test
          </Badge>
        );
      default:
        return (
          <Badge variant="outline">
            Not Configured
          </Badge>
        );
    }
  };

  const hasCredentialsEntered = apiKey || username || password;

  return (
    <Card className={cn(
      "transition-all",
      isEnabled && config?.sync_status === "healthy" && "border-green-500/30 bg-green-50/30 dark:bg-green-950/10"
    )}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-amber-500" />
            <CardTitle className="text-lg">Factoring Company</CardTitle>
          </div>
          {getSyncStatusBadge()}
        </div>
        <CardDescription>
          Configure OTR Solutions for invoice factoring and credit checks
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Enable Toggle */}
            <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50">
              <div>
                <Label className="font-medium">Enable OTR Solutions</Label>
                <p className="text-xs text-muted-foreground">
                  Submit invoices and check broker credit
                </p>
              </div>
              <Switch
                checked={isEnabled}
                onCheckedChange={setIsEnabled}
              />
            </div>

            {isEnabled && (
              <div className="space-y-4 pt-2">
                {/* Current Status */}
                {config?.credentials_hint && (
                  <div className="p-3 rounded-lg bg-muted/30 border">
                    <p className="text-sm text-muted-foreground">
                      Current API Key: <span className="font-mono">{config.credentials_hint}</span>
                    </p>
                    {config.last_checked_at && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Last tested: {new Date(config.last_checked_at).toLocaleString()}
                      </p>
                    )}
                    {config.error_message && (
                      <p className="text-xs text-destructive mt-1">
                        Error: {config.error_message}
                      </p>
                    )}
                  </div>
                )}

                {/* Credentials Form */}
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="otr-api-key">
                      OTR API Key (Subscription Key)
                      {!config?.credentials_hint && <span className="text-destructive ml-1">*</span>}
                    </Label>
                    <div className="relative">
                      <Input
                        id="otr-api-key"
                        type={showApiKey ? "text" : "password"}
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder={config?.credentials_hint ? "Enter new key to update" : "Enter your OTR API key"}
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="otr-username">OTR Username</Label>
                    <Input
                      id="otr-username"
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Enter OTR username"
                    />
                  </div>

                  <div>
                    <Label htmlFor="otr-password">OTR Password</Label>
                    <div className="relative">
                      <Input
                        id="otr-password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter OTR password"
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    onClick={handleTest}
                    disabled={testing || (!hasCredentialsEntered && !config?.credentials_hint)}
                    className="flex-1"
                  >
                    {testing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Testing...
                      </>
                    ) : (
                      <>
                        <TestTube className="h-4 w-4 mr-2" />
                        Test Connection
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={saving || (!hasCredentialsEntered && !config)}
                    className="flex-1"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Save Credentials
                      </>
                    )}
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground">
                  Your credentials are encrypted and stored securely. They are never exposed in the UI after saving.
                </p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
