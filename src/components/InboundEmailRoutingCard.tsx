import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { 
  Mail, 
  Copy, 
  CheckCircle2, 
  AlertCircle, 
  Info,
  Loader2,
  Send,
  HelpCircle
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface InboundEmailRoutingCardProps {
  tenantId: string;
  tenantName: string;
  gmailAlias: string | null;
  lastEmailReceivedAt: string | null;
}

export default function InboundEmailRoutingCard({
  tenantId,
  tenantName,
  gmailAlias,
  lastEmailReceivedAt,
}: InboundEmailRoutingCardProps) {
  const [testStatus, setTestStatus] = useState<'idle' | 'sending' | 'checking' | 'success' | 'failed'>('idle');
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    details?: {
      headerUsed?: string;
      extractedAlias?: string;
      routedToTenant?: string;
    };
  } | null>(null);
  const [connectedGmail, setConnectedGmail] = useState<string | null>(null);
  const [loadingGmail, setLoadingGmail] = useState(true);

  // Fetch the connected Gmail from the OAuth owner
  useEffect(() => {
    const fetchConnectedGmail = async () => {
      setLoadingGmail(true);
      try {
        const { data, error } = await supabase.functions.invoke('gmail-tenant-mapping', {
          body: { action: 'list' }
        });
        
        if (!error && data?.tokens?.[0]?.user_email) {
          setConnectedGmail(data.tokens[0].user_email);
        }
      } catch (err) {
        console.error('Error fetching connected Gmail:', err);
      } finally {
        setLoadingGmail(false);
      }
    };
    
    fetchConnectedGmail();
  }, []);

  // Construct the carrier email from the connected Gmail
  const baseEmail = connectedGmail?.split("@")[0] || "email";
  const domain = connectedGmail?.split("@")[1] || "gmail.com";
  const carrierEmail = gmailAlias && connectedGmail
    ? `${baseEmail}${gmailAlias}@${domain}`
    : null;

  const copyToClipboard = () => {
    if (carrierEmail) {
      navigator.clipboard.writeText(carrierEmail);
      toast.success("Email copied to clipboard!");
    }
  };

  const handleTestRouting = async () => {
    if (!gmailAlias) {
      toast.error("Please configure a Gmail alias first");
      return;
    }

    setTestStatus('sending');
    setTestResult(null);

    try {
      // Call an edge function to send a test email
      const { data, error } = await supabase.functions.invoke('test-email-routing', {
        body: {
          tenant_id: tenantId,
          target_email: carrierEmail,
          alias: gmailAlias,
        }
      });

      if (error) throw error;

      setTestStatus('checking');
      
      // Wait a few seconds for the email to be processed
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Check if we received the email
      const { data: recentEmails, error: checkError } = await supabase
        .from('email_queue')
        .select('id, extracted_alias, routing_method, tenant_id, queued_at')
        .eq('tenant_id', tenantId)
        .order('queued_at', { ascending: false })
        .limit(1);

      if (checkError) throw checkError;

      if (recentEmails && recentEmails.length > 0) {
        const latestEmail = recentEmails[0];
        const receivedWithinWindow = new Date(latestEmail.queued_at) > new Date(Date.now() - 60000);
        
        if (receivedWithinWindow && latestEmail.extracted_alias === gmailAlias) {
          setTestStatus('success');
          setTestResult({
            success: true,
            message: "Email routing test passed!",
            details: {
              headerUsed: latestEmail.routing_method || 'unknown',
              extractedAlias: latestEmail.extracted_alias,
              routedToTenant: tenantName,
            }
          });
        } else {
          setTestStatus('failed');
          setTestResult({
            success: false,
            message: "Test email not received within expected time. Check your email configuration.",
          });
        }
      } else {
        setTestStatus('failed');
        setTestResult({
          success: false,
          message: "No recent emails found. The test email may still be processing.",
        });
      }
    } catch (error: any) {
      console.error('Test routing error:', error);
      setTestStatus('failed');
      setTestResult({
        success: false,
        message: error.message || "Failed to send test email",
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Mail className="h-5 w-5 text-primary" />
          Inbound Email Routing
        </CardTitle>
        <CardDescription>
          Configure how loadboard emails are routed to this tenant
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Main Carrier Email Display */}
        {gmailAlias ? (
          <div className="p-4 bg-primary/5 border-2 border-primary/30 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-primary flex items-center gap-2">
                📧 CARRIER EMAIL ADDRESS
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-sm">
                      <p>This is the email address carriers must use in their loadboard settings to send load notifications to this tenant.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </span>
              {lastEmailReceivedAt && (
                <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Active
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 p-3 bg-background border-2 border-dashed rounded-lg text-sm font-mono break-all select-all">
                {loadingGmail ? (
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading...
                  </span>
                ) : carrierEmail ? (
                  carrierEmail
                ) : (
                  <span className="text-muted-foreground">No Gmail connected</span>
                )}
              </code>
              <Button onClick={copyToClipboard} size="sm" className="shrink-0" disabled={!carrierEmail || loadingGmail}>
                <Copy className="h-4 w-4 mr-1" />
                Copy
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Send this email to your carrier to configure in their Sylectus / Full Circle settings
            </p>
          </div>
        ) : (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>No Gmail Alias Configured</AlertTitle>
            <AlertDescription>
              You must configure a Gmail alias above before emails can be routed to this tenant.
            </AlertDescription>
          </Alert>
        )}

        {/* How It Works */}
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="how-it-works">
            <AccordionTrigger className="text-sm font-medium">
              <span className="flex items-center gap-2">
                <Info className="h-4 w-4" />
                How Email Routing Works
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4 text-sm">
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="font-medium mb-2">Email Address Format</p>
                  <p className="text-muted-foreground">
                    We use <strong>plus-addressing</strong> (also called subaddressing) to route emails. 
                    The format is: <code className="bg-background px-1 rounded">{baseEmail}+ALIAS@{domain}</code>
                  </p>
                  <p className="text-muted-foreground mt-2">
                    Your alias is: <Badge variant="secondary">{gmailAlias || 'Not configured'}</Badge>
                  </p>
                </div>

                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="font-medium mb-2">Header Extraction</p>
                  <p className="text-muted-foreground mb-2">
                    We extract the alias from email headers in this priority order:
                  </p>
                  <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                    <li><code className="bg-background px-1 rounded">Delivered-To</code> - Most reliable (Gmail primary)</li>
                    <li><code className="bg-background px-1 rounded">X-Original-To</code> - Common with mail servers</li>
                    <li><code className="bg-background px-1 rounded">Envelope-To</code> - Backup header</li>
                    <li><code className="bg-background px-1 rounded">To</code> - Last resort fallback</li>
                  </ol>
                </div>

                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="font-medium mb-2">What Happens If No Alias?</p>
                  <p className="text-muted-foreground">
                    If the email doesn't contain a <code className="bg-background px-1 rounded">+alias</code> portion, 
                    it is <strong>quarantined</strong> and not processed. This is a security measure to prevent 
                    emails from being routed to the wrong tenant.
                  </p>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="setup-instructions">
            <AccordionTrigger className="text-sm font-medium">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Step-by-Step Setup Instructions
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-3">
                <div className="flex gap-3 p-3 bg-muted/30 rounded-lg">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">1</div>
                  <div>
                    <p className="font-medium">Copy the carrier email address</p>
                    <p className="text-sm text-muted-foreground">Click the Copy button above to copy the email to your clipboard.</p>
                  </div>
                </div>

                <div className="flex gap-3 p-3 bg-muted/30 rounded-lg">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">2</div>
                  <div>
                    <p className="font-medium">Send to your carrier / loadboard provider</p>
                    <p className="text-sm text-muted-foreground">Contact your carrier and provide them with this email address.</p>
                  </div>
                </div>

                <div className="flex gap-3 p-3 bg-muted/30 rounded-lg">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">3</div>
                  <div>
                    <p className="font-medium">Configure in Sylectus / Full Circle</p>
                    <p className="text-sm text-muted-foreground">
                      Have them set this as the <strong>destination email</strong> for load notifications:
                    </p>
                    <ul className="mt-2 text-sm text-muted-foreground list-disc list-inside">
                      <li><strong>Sylectus:</strong> Settings → Email Notifications → Posted Loads Email</li>
                      <li><strong>Full Circle TMS:</strong> Network Settings → Load Board Email → Destination</li>
                    </ul>
                  </div>
                </div>

                <div className="flex gap-3 p-3 bg-muted/30 rounded-lg">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">4</div>
                  <div>
                    <p className="font-medium">Verify routing is working</p>
                    <p className="text-sm text-muted-foreground">
                      After configuration, you should see emails appearing in Load Hunter within minutes. 
                      Check the "Email Routing Health" page to confirm successful routing.
                    </p>
                  </div>
                </div>

                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Important</AlertTitle>
                  <AlertDescription>
                    The email MUST include the <code className="bg-muted px-1 rounded">{gmailAlias}</code> portion 
                    (the plus-address). If the carrier sends to <code className="bg-muted px-1 rounded">{baseEmail}@{domain}</code> 
                    without the alias, the email will be quarantined.
                  </AlertDescription>
                </Alert>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {/* Test Routing Button */}
        {gmailAlias && (
          <div className="pt-4 border-t">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">Test Email Routing</p>
                <p className="text-xs text-muted-foreground">
                  Send a test email to verify routing is configured correctly
                </p>
              </div>
              <Button 
                onClick={handleTestRouting} 
                disabled={testStatus === 'sending' || testStatus === 'checking'}
                variant="outline"
                size="sm"
              >
                {testStatus === 'sending' && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {testStatus === 'checking' && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {testStatus === 'idle' && <Send className="h-4 w-4 mr-2" />}
                {testStatus === 'success' && <CheckCircle2 className="h-4 w-4 mr-2 text-green-600" />}
                {testStatus === 'failed' && <AlertCircle className="h-4 w-4 mr-2 text-red-600" />}
                {testStatus === 'sending' ? 'Sending...' : 
                 testStatus === 'checking' ? 'Checking...' : 
                 'Test Routing'}
              </Button>
            </div>

            {testResult && (
              <div className={`mt-3 p-3 rounded-lg ${testResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                <div className="flex items-center gap-2">
                  {testResult.success ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-red-600" />
                  )}
                  <span className={`font-medium text-sm ${testResult.success ? 'text-green-800' : 'text-red-800'}`}>
                    {testResult.message}
                  </span>
                </div>
                {testResult.details && (
                  <div className="mt-2 text-xs text-muted-foreground space-y-1">
                    <p>Header used: <code className="bg-background px-1 rounded">{testResult.details.headerUsed}</code></p>
                    <p>Extracted alias: <Badge variant="outline" className="text-xs">{testResult.details.extractedAlias}</Badge></p>
                    <p>Routed to: <strong>{testResult.details.routedToTenant}</strong></p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
