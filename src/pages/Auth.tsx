import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

type AuthView = "login" | "signup" | "forgot-password" | "reset-password";

export default function Auth() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [view, setView] = useState<AuthView>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Check if this is a password reset flow (user clicked email link)
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const type = hashParams.get("type");
    const accessToken = hashParams.get("access_token");
    
    if (type === "recovery" && accessToken) {
      setView("reset-password");
      return;
    }

    // Check if user is already logged in
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        navigate("/dashboard/business", { replace: true });
      }
    };
    checkUser();
  }, [navigate]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (view === "login") {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        // Track login
        if (data.user) {
          await supabase.from("login_history").insert({
            user_id: data.user.id,
            ip_address: null,
            user_agent: navigator.userAgent,
            location: null,
          });
        }

        toast.success("Logged in successfully!");
        navigate("/dashboard/business", { replace: true });
      } else if (view === "signup") {
        // Check if email is invited before allowing signup
        const { data: isInvited, error: checkError } = await supabase
          .rpc('is_email_invited', { check_email: email });
        
        if (checkError) {
          throw new Error("Unable to verify invitation status");
        }
        
        if (!isInvited) {
          throw new Error("This email has not been invited. Please contact an administrator to request access.");
        }

        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: {
              full_name: fullName,
            },
          },
        });

        if (error) throw error;
        toast.success("Account created successfully!");
        navigate("/dashboard/business", { replace: true });
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!email.trim()) {
        throw new Error("Please enter your email address");
      }

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth`,
      });

      if (error) throw error;

      toast.success("Password reset email sent! Check your inbox.");
      setView("login");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (password.length < 6) {
        throw new Error("Password must be at least 6 characters");
      }

      if (password !== confirmPassword) {
        throw new Error("Passwords do not match");
      }

      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) throw error;

      toast.success("Password updated successfully!");
      
      // Clear the hash from URL
      window.history.replaceState(null, "", window.location.pathname);
      
      setView("login");
      setPassword("");
      setConfirmPassword("");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const getTitle = () => {
    switch (view) {
      case "login": return "Login";
      case "signup": return "Sign Up";
      case "forgot-password": return "Reset Password";
      case "reset-password": return "Set New Password";
    }
  };

  const getDescription = () => {
    switch (view) {
      case "login": return "Enter your credentials to access the admin dashboard";
      case "signup": return "Create an account to get started";
      case "forgot-password": return "Enter your email to receive a password reset link";
      case "reset-password": return "Enter your new password below";
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{getTitle()}</CardTitle>
          <CardDescription>{getDescription()}</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Login Form */}
          {view === "login" && (
            <form onSubmit={handleAuth} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Loading..." : "Login"}
              </Button>
              <div className="text-center space-y-2">
                <button
                  type="button"
                  onClick={() => setView("forgot-password")}
                  className="text-sm text-muted-foreground hover:text-primary hover:underline"
                >
                  Forgot your password?
                </button>
                <div>
                  <button
                    type="button"
                    onClick={() => setView("signup")}
                    className="text-sm text-primary hover:underline"
                  >
                    Don't have an account? Sign up
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Signup Form */}
          {view === "signup" && (
            <form onSubmit={handleAuth} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Loading..." : "Sign Up"}
              </Button>
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setView("login")}
                  className="text-sm text-primary hover:underline"
                >
                  Already have an account? Login
                </button>
              </div>
            </form>
          )}

          {/* Forgot Password Form */}
          {view === "forgot-password" && (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email address"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Sending..." : "Send Reset Link"}
              </Button>
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setView("login")}
                  className="text-sm text-primary hover:underline"
                >
                  Back to Login
                </button>
              </div>
            </form>
          )}

          {/* Reset Password Form (after clicking email link) */}
          {view === "reset-password" && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">New Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter new password"
                  required
                  minLength={6}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  required
                  minLength={6}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Updating..." : "Update Password"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
