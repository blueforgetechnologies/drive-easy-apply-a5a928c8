import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { 
  Mail, 
  Link2, 
  Unlink, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle,
  ExternalLink,
  BarChart3
} from "lucide-react";

interface GmailToken {
  id: string;
  user_email: string;
  tenant_id: string | null;
  token_expiry: string;
  updated_at: string;
}

interface EmailSourceStats {
  from_email: string;
  provider: string;
  count: number;
  last_email: string;
}

interface TenantGmailConnectionProps {
  tenantId: string;
  tenantName: string;
}

function detectProvider(fromEmail: string): string {
  const emailLower = fromEmail.toLowerCase();
  if (emailLower.includes('sylectus')) return 'Sylectus';
  if (emailLower.includes('fullcircletms') || emailLower.includes('fullcircle')) return 'Full Circle';
  if (emailLower.includes('asapexpediting')) return 'ASAP Expediting';
  if (emailLower.includes('dat.com')) return 'DAT';
  if (emailLower.includes('truckstop')) return 'Truckstop';
  if (emailLower.includes('123loadboard')) return '123Loadboard';
  return 'Other';
}

export default function TenantGmailConnection({ tenantId, tenantName }: TenantGmailConnectionProps) {
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [connectedTokens, setConnectedTokens] = useState<GmailToken[]>([]);
  const [emailSourceStats, setEmailSourceStats] = useState<EmailSourceStats[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Use edge function to bypass RLS on gmail_tokens table
      const { data, error } = await supabase.functions.invoke('tenant-gmail-status', {
        body: { tenantId }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Set connected accounts
      setConnectedTokens(data.connectedAccounts || []);

      // Process email source stats
      if (data.emailSourceStats) {
        const stats: EmailSourceStats[] = data.emailSourceStats.map((stat: any) => ({
          from_email: stat.from_email,
          provider: detectProvider(stat.from_email),
          count: stat.count,
          last_email: stat.last_email
        }));
        setEmailSourceStats(stats);
      }
    } catch (error: any) {
      console.error("Failed to load Gmail connection data:", error);
      toast.error("Failed to load Gmail data");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    loadData();

    // Listen for OAuth completion messages from popup
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'gmail_oauth_complete') {
        toast.success("Gmail connected successfully!");
        loadData();
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [loadData]);

  const handleConnectGmail = async () => {
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke('gmail-auth', {
        body: { action: 'start', tenantId }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.authUrl) {
        // Open OAuth popup
        const popup = window.open(
          data.authUrl,
          'gmail_oauth',
          'width=600,height=700,scrollbars=yes,resizable=yes'
        );

        if (!popup) {
          toast.error("Please allow popups to connect Gmail");
        }
      }
    } catch (error: any) {
      console.error("Gmail connect error:", error);
      toast.error(error.message || "Failed to start Gmail connection");
    } finally {
      setConnecting(false);
    }
  };

  const handleSetupPush = async (tokenEmail: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('gmail-auth', {
        body: { action: 'setup-push', tenantId }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success("Push notifications configured successfully");
      loadData();
    } catch (error: any) {
      console.error("Setup push error:", error);
      toast.error(error.message || "Failed to setup push notifications");
    }
  };

  const isTokenExpired = (expiry: string) => new Date(expiry) < new Date();

  // Group stats by provider
  const providerStats = emailSourceStats.reduce((acc, stat) => {
    if (!acc[stat.provider]) {
      acc[stat.provider] = { count: 0, sources: [] };
    }
    acc[stat.provider].count += stat.count;
    acc[stat.provider].sources.push(stat);
    return acc;
  }, {} as Record<string, { count: number; sources: EmailSourceStats[] }>);

  const totalEmails = emailSourceStats.reduce((sum, s) => sum + s.count, 0);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Mail className="h-5 w-5 text-primary" />
          Gmail Connections
        </CardTitle>
        <CardDescription>
          Direct Gmail account connections for polling load emails
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Connected Accounts */}
        {connectedTokens.length > 0 ? (
          <div className="space-y-3">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Connected Accounts
            </h4>
            {connectedTokens.map((token) => {
              const expired = isTokenExpired(token.token_expiry);
              return (
                <div 
                  key={token.id} 
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    expired ? 'border-amber-300 bg-amber-50' : 'border-green-300 bg-green-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Mail className={`h-5 w-5 ${expired ? 'text-amber-600' : 'text-green-600'}`} />
                    <div>
                      <p className="font-medium">{token.user_email}</p>
                      <p className="text-xs text-muted-foreground">
                        Token {expired ? 'expired' : 'valid until'}: {new Date(token.token_expiry).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {expired && (
                      <Badge variant="outline" className="text-amber-600 border-amber-300">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        Needs Refresh
                      </Badge>
                    )}
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleSetupPush(token.user_email)}
                    >
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Setup Push
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-6 text-center border-2 border-dashed border-muted-foreground/20 rounded-lg">
            <Mail className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <h4 className="font-medium mb-1">No Gmail Account Connected</h4>
            <p className="text-sm text-muted-foreground mb-4">
              Connect a Gmail account to automatically import load emails from Sylectus, Full Circle, and other loadboards.
            </p>
          </div>
        )}

        {/* Connect Button */}
        <Button 
          onClick={handleConnectGmail} 
          disabled={connecting}
          className="w-full"
          variant={connectedTokens.length > 0 ? "outline" : "default"}
        >
          {connecting ? (
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Link2 className="h-4 w-4 mr-2" />
          )}
          {connectedTokens.length > 0 ? 'Connect Another Gmail Account' : 'Connect Gmail Account'}
        </Button>

        {/* Email Source Statistics */}
        {totalEmails > 0 && (
          <div className="pt-4 border-t">
            <h4 className="text-sm font-medium flex items-center gap-2 mb-3">
              <BarChart3 className="h-4 w-4 text-primary" />
              Email Sources (Last 500 emails)
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {Object.entries(providerStats)
                .sort(([,a], [,b]) => b.count - a.count)
                .map(([provider, data]) => {
                  const percentage = Math.round((data.count / totalEmails) * 100);
                  return (
                    <div 
                      key={provider} 
                      className="p-3 bg-muted/50 rounded-lg text-center"
                    >
                      <p className="font-medium text-sm">{provider}</p>
                      <p className="text-2xl font-bold text-primary">{data.count}</p>
                      <p className="text-xs text-muted-foreground">{percentage}% of emails</p>
                    </div>
                  );
                })}
            </div>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Total: {totalEmails} emails from {emailSourceStats.length} unique sources
            </p>
          </div>
        )}

        {/* Help Text */}
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
          <strong>How it works:</strong> When you connect a Gmail account, the system will poll for new emails from Sylectus, Full Circle, and other loadboard providers. 
          Emails are automatically parsed and displayed in the Load Hunter tab.
        </div>
      </CardContent>
    </Card>
  );
}
