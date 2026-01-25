import { ApplicationForm } from "@/components/ApplicationForm";
import heroImage from "@/assets/driver-hero.jpg";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, AlertTriangle, Loader2, Shield } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const Apply = () => {
  const [searchParams] = useSearchParams();
  // Support both token param (new) and invite param (legacy fallback)
  const publicToken = searchParams.get("token") || searchParams.get("invite");
  // PREVIEW MODE: Allow internal users to view the form without a token
  const isPreviewMode = searchParams.get("preview") === "true";
  
  const [isValidating, setIsValidating] = useState(true);
  const [isValidInvite, setIsValidInvite] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);

  useEffect(() => {
    const validateInvite = async () => {
      // PREVIEW MODE: Skip validation and show form directly
      if (isPreviewMode) {
        setCompanyName("Preview Mode - Your Company");
        setIsValidInvite(true);
        setIsValidating(false);
        return;
      }

      // FAIL CLOSED: No token = immediate deny
      if (!publicToken) {
        setIsValidating(false);
        setInviteError("No invitation token provided. A valid invite link is required to apply.");
        return;
      }

      // Basic client-side validation (server does the real check)
      if (publicToken.length < 32) {
        setIsValidating(false);
        setInviteError("Invalid invitation token format.");
        return;
      }

      try {
        // Track that the invite link was opened (fire and forget - uses legacy id if needed)
        supabase.functions.invoke("track-invite-open", {
          body: { publicToken },
        }).catch(() => {}); // Ignore tracking errors

        // SERVER-SIDE VALIDATION: Use edge function to validate token
        // This ensures tenant_id mapping is done server-side, not trusting client
        const { data, error } = await supabase.functions.invoke("load-application", {
          body: { public_token: publicToken },
        });

        if (error) {
          console.error("Error validating invite:", error);
          setInviteError("Failed to validate invitation. Please try again.");
          return;
        }

        // Check for explicit denial from server
        if (!data.success) {
          setInviteError(data.error || "Invalid invitation link.");
          return;
        }

        // Check if already submitted
        if (!data.can_edit && data.application?.status === 'submitted') {
          setInviteError("This application has already been submitted. Please contact us if you need to make changes.");
          return;
        }

        // Set company branding if available
        if (data.company?.name) {
          setCompanyName(data.company.name);
        }

        setIsValidInvite(true);
      } catch (err) {
        console.error("Validation error:", err);
        setInviteError("An error occurred while validating your invitation. Please try again.");
      } finally {
        setIsValidating(false);
      }
    };

    validateInvite();
  }, [publicToken, isPreviewMode]);

  // Show loading state while validating
  if (isValidating) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center">
        <div className="text-center">
          <div className="relative">
            <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
            <Shield className="h-5 w-5 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-primary" />
          </div>
          <p className="mt-6 text-lg font-medium text-foreground">Validating your invitation...</p>
          <p className="mt-2 text-sm text-muted-foreground">Please wait while we verify your access</p>
        </div>
      </div>
    );
  }

  // Show error if invite is invalid (FAIL CLOSED)
  if (inviteError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-4">
        <Card className="max-w-md w-full shadow-xl border-0">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
            <CardTitle className="text-2xl">Access Denied</CardTitle>
            <CardDescription className="text-base mt-2">{inviteError}</CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-sm text-muted-foreground">
              If you believe this is an error, please contact the company that sent you the invitation link.
            </p>
            <Link to="/">
              <Button className="w-full">Return to Home</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-scifi">
      {/* Navigation */}
      <div className="absolute top-4 left-4 z-10">
        <Link to="/">
          <Button variant="ghost" size="sm" className="text-scifi-text-muted hover:text-scifi-text hover:bg-scifi-purple/10 gap-2 rounded-full border border-scifi-border/50">
            <ArrowLeft className="h-4 w-4" />
            Home
          </Button>
        </Link>
      </div>
      <div className="absolute top-4 right-4 z-10">
        <Link to="/auth">
          <Button variant="ghost" size="sm" className="text-scifi-text-muted hover:text-scifi-text hover:bg-scifi-purple/10 rounded-full border border-scifi-border/50">
            Admin Login
          </Button>
        </Link>
      </div>

      {/* Sci-Fi Hero Section */}
      <header className="relative h-[260px] md:h-[300px] overflow-hidden">
        <div className="absolute inset-0">
          <img
            src={heroImage}
            alt="Professional truck driver"
            className="w-full h-full object-cover opacity-40"
          />
          {/* Sci-Fi gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-br from-[hsl(230,40%,8%)] via-[hsl(280,30%,12%)] to-[hsl(230,40%,8%)]" />
          <div className="absolute inset-0 bg-gradient-to-t from-[hsl(230,40%,8%)] to-transparent" />
          {/* Subtle glow effects */}
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-[hsl(280,70%,60%)] rounded-full blur-[150px] opacity-20" />
          <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-[hsl(185,70%,50%)] rounded-full blur-[120px] opacity-15" />
        </div>
        <div className="relative h-full flex items-center justify-center text-center px-4">
          <div className="max-w-2xl">
            {companyName && (
              <p className="text-scifi-purple-light text-sm mb-2 font-medium tracking-wider uppercase">
                {companyName}
              </p>
            )}
            <h1 className="text-2xl md:text-4xl font-bold text-scifi-text mb-3">
              Driver Employment Application
            </h1>
            <p className="text-base md:text-lg text-scifi-text-muted max-w-xl mx-auto">
              Join our professional team. Complete your application online — progress saved automatically.
            </p>
          </div>
        </div>
      </header>

      {/* Application Form */}
      <main className="-mt-10 relative z-10">
        <ApplicationForm publicToken={publicToken || "preview"} isPreviewMode={isPreviewMode} />
      </main>

      {/* Footer */}
      <footer className="border-t border-scifi-border mt-12 py-6 bg-scifi-card/50">
        <div className="max-w-3xl mx-auto px-4 text-center text-scifi-text-muted text-xs">
          <p>© {new Date().getFullYear()} {companyName || 'Blueforge Technologies'}. All rights reserved.</p>
          <p className="mt-1">
            Questions?{" "}
            <a href="mailto:hr@blueforgetechnologies.org" className="text-scifi-purple-light hover:text-scifi-purple hover:underline transition-colors">
              hr@blueforgetechnologies.org
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Apply;
