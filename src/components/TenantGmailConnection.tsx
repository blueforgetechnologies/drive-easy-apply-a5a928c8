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
  BarChart3,
  Trash2
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface GmailToken {
  id: string;
  user_email: string;
  tenant_id: string | null;
  token_expiry: string;
  updated_at: string;
  needs_reauth?: boolean;
  reauth_reason?: string;
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
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
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

  const handleDisconnect = async (tokenId: string, email: string) => {
    setDisconnecting(tokenId);
    try {
      const { data, error } = await supabase.functions.invoke('tenant-gmail-status', {
        body: { tenantId, action: 'disconnect', tokenId }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(`Disconnected ${email}`);
      loadData();
    } catch (error: any) {
      console.error("Disconnect error:", error);
      toast.error(error.message || "Failed to disconnect Gmail");
    } finally {
      setDisconnecting(null);
    }
  };

  const handleRefreshToken = async (tokenId: string, userEmail: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('gmail-auth', {
        body: { action: 'setup-push', tenantId }
      });

      if (error) throw error;
      
      // Check for specific error codes
      if (data?.code === 'RECONNECT_REQUIRED') {
        toast.error("Refresh token expired - please reconnect Gmail");
        return;
      }
      
      if (data?.error) throw new Error(data.error);

      toast.success("Token refreshed successfully");
      loadData();
    } catch (error: any) {
      console.error("Refresh error:", error);
      toast.error(error.message || "Failed to refresh token - please reconnect Gmail");
    }
  };

  const isTokenExpired = (expiry: string) => new Date(expiry) < new Date();
  const needsReconnect = (token: GmailToken) => token.needs_reauth === true || isTokenExpired(token.token_expiry);

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
          Direct Gmail account connections for polling load emails from Sylectus, Full Circle, and other loadboards
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Connected Accounts */}
        {connectedTokens.length > 0 ? (
          <div className="space-y-3">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Connected Accounts ({connectedTokens.length})
            </h4>
            {connectedTokens.map((token) => {
              const hasIssue = needsReconnect(token);
              const needsFullReconnect = token.needs_reauth === true;
              return (
                <div 
                  key={token.id} 
                  className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg border gap-3 ${
                    hasIssue 
                      ? needsFullReconnect 
                        ? 'border-red-400 bg-red-50 dark:bg-red-950/20' 
                        : 'border-amber-300 bg-amber-50 dark:bg-amber-950/20' 
                      : 'border-green-300 bg-green-50 dark:bg-green-950/20'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Mail className={`h-5 w-5 flex-shrink-0 ${hasIssue ? needsFullReconnect ? 'text-red-600' : 'text-amber-600' : 'text-green-600'}`} />
                    <div>
                      <p className="font-medium">{token.user_email}</p>
                      <p className="text-xs text-muted-foreground">
                        {needsFullReconnect ? (
                          <span className="text-red-600 font-medium">
                            ⚠️ Gmail disconnected - must reconnect ({token.reauth_reason || 'token revoked'})
                          </span>
                        ) : hasIssue ? (
                          <span className="text-amber-600">Token expired - click Refresh to restore</span>
                        ) : (
                          <>Valid until: {new Date(token.token_expiry).toLocaleString()}</>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Last updated: {new Date(token.updated_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {hasIssue && !needsFullReconnect && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleRefreshToken(token.id, token.user_email)}
                        className="text-amber-600 border-amber-300 hover:bg-amber-100"
                      >
                        <RefreshCw className="h-3 w-3 mr-1" />
                        Refresh
                      </Button>
                    )}
                    {needsFullReconnect && (
                      <Button 
                        variant="default" 
                        size="sm"
                        onClick={handleConnectGmail}
                        disabled={connecting}
                        className="bg-red-600 hover:bg-red-700 text-white"
                      >
                        <Link2 className="h-3 w-3 mr-1" />
                        Reconnect Gmail
                      </Button>
                    )}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button 
                          variant="outline" 
                          size="sm"
                          className="text-destructive border-destructive/30 hover:bg-destructive/10"
                          disabled={disconnecting === token.id}
                        >
                          {disconnecting === token.id ? (
                            <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <Trash2 className="h-3 w-3 mr-1" />
                          )}
                          Disconnect
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Disconnect Gmail Account?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will stop polling emails from <strong>{token.user_email}</strong>. 
                            New load emails will no longer be imported from this account.
                            <br /><br />
                            <strong>Note:</strong> Existing emails in the system will not be deleted.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDisconnect(token.id, token.user_email)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Yes, Disconnect
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
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
        <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg text-xs text-blue-700 dark:text-blue-300">
          <strong>How it works:</strong> When you connect a Gmail account, the system will automatically poll for new emails from Sylectus, Full Circle, and other loadboard providers. 
          Emails are parsed and displayed in the Load Hunter tab. To change the connected email, disconnect the current one and connect a new account.
        </div>
      </CardContent>
    </Card>
  );
}
