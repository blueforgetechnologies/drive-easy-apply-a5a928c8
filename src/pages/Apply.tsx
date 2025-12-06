import { ApplicationForm } from "@/components/ApplicationForm";
import heroImage from "@/assets/driver-hero.jpg";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft } from "lucide-react";

const Apply = () => {
  const [searchParams] = useSearchParams();
  const inviteId = searchParams.get("invite");

  useEffect(() => {
    if (inviteId) {
      // Track that the invite link was opened
      supabase.functions.invoke("track-invite-open", {
        body: { inviteId },
      }).catch(console.error);
    }
  }, [inviteId]);

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <div className="absolute top-4 left-4 z-10">
        <Link to="/">
          <Button variant="ghost" size="sm" className="text-primary-foreground hover:bg-primary-foreground/10 gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Button>
        </Link>
      </div>
      <div className="absolute top-4 right-4 z-10">
        <Link to="/auth">
          <Button variant="ghost" size="sm" className="text-primary-foreground hover:bg-primary-foreground/10">
            Admin Login
          </Button>
        </Link>
      </div>

      {/* Hero Section */}
      <header className="relative h-[400px] overflow-hidden">
        <div className="absolute inset-0">
          <img
            src={heroImage}
            alt="Professional truck driver"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-primary/80 to-primary/60" />
        </div>
        <div className="relative h-full flex items-center justify-center text-center px-4">
          <div className="max-w-3xl">
            <h1 className="text-4xl md:text-5xl font-bold text-primary-foreground mb-4">
              Driver Employment Application
            </h1>
            <p className="text-lg md:text-xl text-primary-foreground/90">
              Join our professional team of drivers. Complete your application online in just a few
              steps.
            </p>
          </div>
        </div>
      </header>

      {/* Application Form */}
      <main>
        <ApplicationForm />
      </main>

      {/* Footer */}
      <footer className="bg-card border-t mt-16 py-8">
        <div className="max-w-4xl mx-auto px-4 text-center text-muted-foreground text-sm">
          <p>© {new Date().getFullYear()} NexusTMS. All rights reserved.</p>
          <p className="mt-2">
            Questions? Contact us at{" "}
            <a href="mailto:hr@nexustechsolution.com" className="text-primary hover:underline">
              hr@nexustechsolution.com
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Apply;
