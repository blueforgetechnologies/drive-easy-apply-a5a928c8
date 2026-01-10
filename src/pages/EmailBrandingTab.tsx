import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { 
  Mail,
  Globe,
  CheckCircle2,
  AlertCircle,
  Clock,
  Settings,
  Save,
  ExternalLink,
  Copy,
  ArrowRight,
  Sparkles
} from "lucide-react";

interface EmailConfig {
  id: string;
  email_mode: 'gmail' | 'custom_domain';
  gmail_base_email: string;
  custom_domain: string | null;
  custom_domain_status: 'not_configured' | 'pending_verification' | 'active' | 'failed';
  custom_domain_verified_at: string | null;
  catch_all_forward_to: string | null;
}

export default function EmailBrandingTab() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<EmailConfig | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  
  // Form state
  const [gmailBaseEmail, setGmailBaseEmail] = useState("talbilogistics@gmail.com");
  const [customDomain, setCustomDomain] = useState("");
  const [catchAllForwardTo, setCatchAllForwardTo] = useState("");

  useEffect(() => {
    checkAdminAndLoadConfig();
  }, []);

  const checkAdminAndLoadConfig = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
        return;
      }

      // Check if user is admin
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .eq("role", "admin")
        .maybeSingle();

      if (!roleData) {
        toast.error("Platform Admin access required");
        navigate("/dashboard");
        return;
      }

      setIsAdmin(true);
      await loadConfig();
    } catch (error: any) {
      toast.error("Error checking access");
      navigate("/dashboard");
    } finally {
      setLoading(false);
    }
  };

  const loadConfig = async () => {
    const { data, error } = await supabase
      .from("platform_email_config")
      .select("*")
      .single();

    if (error) {
      console.error("Error loading email config:", error);
      return;
    }

    const configData = data as EmailConfig;
    setConfig(configData);
    setGmailBaseEmail(configData.gmail_base_email || "talbilogistics@gmail.com");
    setCustomDomain(configData.custom_domain || "");
    setCatchAllForwardTo(configData.catch_all_forward_to || "");
  };

  const handleSave = async () => {
    if (!config) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from("platform_email_config")
        .update({
          gmail_base_email: gmailBaseEmail,
          custom_domain: customDomain || null,
          catch_all_forward_to: catchAllForwardTo || null
        })
        .eq("id", config.id);

      if (error) throw error;
      toast.success("Email settings saved");
      await loadConfig();
    } catch (error: any) {
      toast.error("Failed to save: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSwitchToCustomDomain = async () => {
    if (!config || !customDomain) {
      toast.error("Please enter a custom domain first");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("platform_email_config")
        .update({
          email_mode: 'custom_domain',
          custom_domain: customDomain,
          custom_domain_status: 'pending_verification'
        })
        .eq("id", config.id);

      if (error) throw error;
      toast.success("Switched to custom domain mode. Please complete domain verification.");
      await loadConfig();
    } catch (error: any) {
      toast.error("Failed to switch: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSwitchToGmail = async () => {
    if (!config) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("platform_email_config")
        .update({
          email_mode: 'gmail'
        })
        .eq("id", config.id);

      if (error) throw error;
      toast.success("Switched back to Gmail mode");
      await loadConfig();
    } catch (error: any) {
      toast.error("Failed to switch: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const getExampleEmail = (mode: 'gmail' | 'custom_domain', carrierName = "AcmeTrucking", mcNumber = "123456") => {
    const sanitizedName = carrierName.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (mode === 'gmail') {
      const baseEmail = gmailBaseEmail || "talbilogistics@gmail.com";
      const [user, domain] = baseEmail.split('@');
      return `${user}+${sanitizedName}-${mcNumber}@${domain}`;
    } else {
      return `${sanitizedName}${mcNumber}@${customDomain || "yourdomain.com"}`;
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Mail className="h-6 w-6" />
          Email Branding & Domain Settings
        </h1>
        <p className="text-muted-foreground">
          Configure how carrier emails are generated and routed to your system
        </p>
      </div>

      {/* Current Mode Card */}
      <Card className={`border-2 ${config?.email_mode === 'gmail' ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20' : 'border-green-500 bg-green-50/50 dark:bg-green-950/20'}`}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                {config?.email_mode === 'gmail' ? (
                  <>
                    <Mail className="h-5 w-5 text-blue-600" />
                    Gmail Plus-Addressing Mode
                  </>
                ) : (
                  <>
                    <Globe className="h-5 w-5 text-green-600" />
                    Custom Domain Mode
                  </>
                )}
              </CardTitle>
              <CardDescription>
                {config?.email_mode === 'gmail' 
                  ? "Using Gmail's built-in plus-addressing for email routing (Free)"
                  : "Using your own domain for professional email addresses"
                }
              </CardDescription>
            </div>
            <Badge variant={config?.email_mode === 'gmail' ? 'default' : 'secondary'} className="text-sm">
              {config?.email_mode === 'gmail' ? 'Active' : 
               config?.custom_domain_status === 'active' ? 'Active' : 
               config?.custom_domain_status === 'pending_verification' ? 'Pending' : 'Not Configured'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="p-4 bg-background rounded-lg border">
              <p className="text-sm font-medium mb-2">Example Carrier Email:</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 p-2 bg-muted rounded text-sm font-mono">
                  {getExampleEmail(config?.email_mode || 'gmail')}
                </code>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(getExampleEmail(config?.email_mode || 'gmail'));
                    toast.success("Copied to clipboard");
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Configuration Options */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Gmail Mode Card */}
        <Card className={config?.email_mode === 'gmail' ? 'ring-2 ring-primary' : ''}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Mail className="h-5 w-5 text-blue-600" />
              Gmail Plus-Addressing
              {config?.email_mode === 'gmail' && (
                <Badge variant="default" className="ml-auto">Current</Badge>
              )}
            </CardTitle>
            <CardDescription>
              Free • Uses your existing Gmail • No setup required
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="gmail-base">Base Gmail Address</Label>
              <Input
                id="gmail-base"
                value={gmailBaseEmail}
                onChange={(e) => setGmailBaseEmail(e.target.value)}
                placeholder="talbilogistics@gmail.com"
              />
            </div>
            
            <div className="p-3 bg-muted/50 rounded-lg text-sm">
              <p className="font-medium mb-2">How it works:</p>
              <ol className="space-y-1 text-muted-foreground list-decimal list-inside">
                <li>Each carrier gets a unique email alias</li>
                <li>All emails arrive in your Gmail inbox</li>
                <li>System routes based on the +alias</li>
              </ol>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="text-muted-foreground">Already configured & working</span>
            </div>

            {config?.email_mode !== 'gmail' && (
              <Button onClick={handleSwitchToGmail} variant="outline" className="w-full">
                Switch to Gmail Mode
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Custom Domain Card */}
        <Card className={config?.email_mode === 'custom_domain' ? 'ring-2 ring-primary' : ''}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Globe className="h-5 w-5 text-green-600" />
              Custom Domain
              {config?.email_mode === 'custom_domain' && (
                <Badge variant="default" className="ml-auto">Current</Badge>
              )}
            </CardTitle>
            <CardDescription>
              Professional branding • Requires domain setup
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="custom-domain">Your Domain</Label>
              <Input
                id="custom-domain"
                value={customDomain}
                onChange={(e) => setCustomDomain(e.target.value)}
                placeholder="talbilogistics.com"
              />
            </div>

            <div>
              <Label htmlFor="catch-all">Forward Emails To</Label>
              <Input
                id="catch-all"
                value={catchAllForwardTo}
                onChange={(e) => setCatchAllForwardTo(e.target.value)}
                placeholder="talbilogistics@gmail.com"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Set up catch-all forwarding from your domain to this email
              </p>
            </div>

            <div className="p-3 bg-muted/50 rounded-lg text-sm">
              <p className="font-medium mb-2">Setup Required:</p>
              <ol className="space-y-1 text-muted-foreground list-decimal list-inside">
                <li>Add domain to Cloudflare (free)</li>
                <li>Enable Email Routing → Catch-all</li>
                <li>Forward all to your Gmail</li>
              </ol>
            </div>

            {config?.custom_domain_status === 'pending_verification' && (
              <div className="flex items-center gap-2 text-sm text-amber-600">
                <Clock className="h-4 w-4" />
                <span>Pending verification</span>
              </div>
            )}

            {config?.custom_domain_status === 'active' && (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle2 className="h-4 w-4" />
                <span>Domain verified & active</span>
              </div>
            )}

            {config?.email_mode !== 'custom_domain' && (
              <Button onClick={handleSwitchToCustomDomain} variant="outline" className="w-full" disabled={!customDomain}>
                <Sparkles className="h-4 w-4 mr-2" />
                Switch to Custom Domain
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Email Format Preview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Settings className="h-5 w-5" />
            Email Format Preview
          </CardTitle>
          <CardDescription>
            How carrier emails will be generated based on current settings
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="p-4 border rounded-lg">
              <p className="text-sm font-medium mb-2 flex items-center gap-2">
                <Mail className="h-4 w-4 text-blue-600" />
                Gmail Mode
              </p>
              <code className="text-xs bg-muted px-2 py-1 rounded block">
                {getExampleEmail('gmail', 'CourierExpress', '845697')}
              </code>
            </div>
            <div className="p-4 border rounded-lg">
              <p className="text-sm font-medium mb-2 flex items-center gap-2">
                <Globe className="h-4 w-4 text-green-600" />
                Custom Domain Mode
              </p>
              <code className="text-xs bg-muted px-2 py-1 rounded block">
                {getExampleEmail('custom_domain', 'CourierExpress', '845697')}
              </code>
            </div>
          </div>
          
          <Separator className="my-4" />
          
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Carrier Name: <strong>Courier Express</strong> • MC Number: <strong>845697</strong>
            </p>
            <Button onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Quick Links */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Quick Links & Resources</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-3 gap-4">
            <a 
              href="https://dash.cloudflare.com/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-3 border rounded-lg hover:bg-muted transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
              <span className="text-sm">Cloudflare Dashboard</span>
            </a>
            <Button 
              variant="outline" 
              className="justify-start"
              onClick={() => navigate("/dashboard/platform-admin")}
            >
              <ArrowRight className="h-4 w-4 mr-2" />
              <span className="text-sm">Manage Tenants</span>
            </Button>
            <Button 
              variant="outline" 
              className="justify-start"
              onClick={() => navigate("/dashboard/settings")}
            >
              <Settings className="h-4 w-4 mr-2" />
              <span className="text-sm">Integrations</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
