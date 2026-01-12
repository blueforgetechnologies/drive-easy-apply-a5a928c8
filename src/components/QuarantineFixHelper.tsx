import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { 
  AlertCircle, 
  CheckCircle2, 
  Copy,
  Mail,
  ArrowRight,
  Info
} from "lucide-react";
import { toast } from "sonner";

interface TenantCandidate {
  id: string;
  name: string;
  slug: string;
  gmail_alias: string | null;
}

interface QuarantineFixHelperProps {
  failureReason: string;
  deliveredToHeader: string | null;
  extractedAlias: string | null;
  tenants: TenantCandidate[];
}

// The base email for plus-addressing
const BASE_EMAIL = "talbilogistics";
const EMAIL_DOMAIN = "gmail.com";

export default function QuarantineFixHelper({
  failureReason,
  deliveredToHeader,
  extractedAlias,
  tenants,
}: QuarantineFixHelperProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  // Determine what type of fix is needed
  const isNoAliasError = failureReason.includes("No alias found");
  const isNoTenantError = failureReason.includes("No tenant configured");

  // Try to match domain from delivered-to header
  const getDomainFromEmail = (email: string | null) => {
    if (!email) return null;
    const match = email.match(/@([^>]+)/);
    return match ? match[1].toLowerCase() : null;
  };

  const deliveredDomain = getDomainFromEmail(deliveredToHeader);

  // Get suggested tenant based on domain matching or first available
  const suggestedTenants = tenants.filter(t => t.gmail_alias);

  const copyEmail = (tenant: TenantCandidate) => {
    const email = `${BASE_EMAIL}${tenant.gmail_alias}@${EMAIL_DOMAIN}`;
    navigator.clipboard.writeText(email);
    toast.success(`Copied email for ${tenant.name}`);
  };

  if (isNoAliasError) {
    return (
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="ml-2">
            <AlertCircle className="h-3 w-3 mr-1 text-yellow-600" />
            Fix
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              Fix Missing Email Alias
            </DialogTitle>
            <DialogDescription>
              This email was quarantined because it didn't include a +alias in the destination address.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Problem Explanation */}
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm font-medium text-red-800 mb-2">Problem Detected</p>
              <div className="text-sm text-red-700 space-y-1">
                <p>The email was sent to:</p>
                <code className="block p-2 bg-white rounded border text-xs break-all">
                  {deliveredToHeader || 'Unknown address'}
                </code>
                <p className="text-xs mt-2">
                  This address doesn't contain a <code className="bg-white px-1 rounded">+alias</code> portion, 
                  so we can't determine which tenant it belongs to.
                </p>
              </div>
            </div>

            {/* Solution */}
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm font-medium text-green-800 mb-2 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Solution
              </p>
              <p className="text-sm text-green-700 mb-3">
                Update your loadboard (Sylectus/Full Circle) to send emails to one of these addresses instead:
              </p>
              
              {suggestedTenants.length > 0 ? (
                <div className="space-y-2">
                  {suggestedTenants.slice(0, 5).map(tenant => (
                    <div key={tenant.id} className="flex items-center justify-between p-2 bg-white rounded border">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{tenant.name}</p>
                        <code className="text-xs text-muted-foreground">
                          {BASE_EMAIL}{tenant.gmail_alias}@{EMAIL_DOMAIN}
                        </code>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => copyEmail(tenant)}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No tenants with configured aliases found. Please configure a Gmail alias in tenant settings first.
                </p>
              )}
            </div>

            {/* Visual Comparison */}
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                <Info className="h-3 w-3" />
                Email Format Comparison
              </p>
              <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center text-sm">
                <div className="p-2 bg-red-100 rounded text-center">
                  <p className="text-xs text-red-600 mb-1">❌ Wrong</p>
                  <code className="text-xs break-all">{deliveredToHeader || 'base@domain.com'}</code>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <div className="p-2 bg-green-100 rounded text-center">
                  <p className="text-xs text-green-600 mb-1">✓ Correct</p>
                  <code className="text-xs break-all">{BASE_EMAIL}+alias@{EMAIL_DOMAIN}</code>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (isNoTenantError && extractedAlias) {
    return (
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="ml-2">
            <AlertCircle className="h-3 w-3 mr-1 text-orange-600" />
            Fix
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unknown Alias: {extractedAlias}</DialogTitle>
            <DialogDescription>
              The alias was found in the email, but no tenant is configured to use it.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
              <p className="text-sm text-orange-700">
                The email contained alias <Badge variant="outline">{extractedAlias}</Badge> but no tenant 
                has this alias configured.
              </p>
            </div>

            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-sm font-medium mb-2">Possible Solutions:</p>
              <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-2">
                <li>Configure a tenant to use this alias in tenant settings</li>
                <li>Update the loadboard to use a different (existing) alias</li>
              </ol>
            </div>

            {suggestedTenants.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Existing tenant aliases:</p>
                <div className="space-y-1">
                  {suggestedTenants.slice(0, 5).map(t => (
                    <div key={t.id} className="flex items-center gap-2 text-sm">
                      <Badge variant="secondary">{t.gmail_alias}</Badge>
                      <span className="text-muted-foreground">→</span>
                      <span>{t.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Default - no specific fix available
  return (
    <Badge variant="destructive" className="text-xs">
      {failureReason.length > 30 ? failureReason.slice(0, 30) + '...' : failureReason}
    </Badge>
  );
}
