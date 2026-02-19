import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Truck, ArrowLeft, Loader2, Mail, Lock, User } from "lucide-react";
import { 
  loginSchema, 
  signupSchema, 
  passwordResetSchema, 
  emailSchema,
  validateOrThrow
} from "@/lib/auth-validation";

type AuthView = "login" | "signup" | "forgot-password" | "reset-password" | "force-password-change";

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

    // Check if this is an invite signup flow (new user clicked invite link)
    const mode = searchParams.get("mode");
    const inviteEmail = searchParams.get("email");
    if (mode === "signup") {
      setView("signup");
      if (inviteEmail) {
        setEmail(decodeURIComponent(inviteEmail));
      }
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
  }, [navigate, searchParams]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (view === "login") {
        // Validate login form with Zod
        const validData = validateOrThrow(loginSchema, { email, password });

        const { data, error } = await supabase.auth.signInWithPassword({
          email: validData.email,
          password: validData.password,
        });

        if (error) throw error;

        // Track login + dispatcher check — non-blocking so DB timeouts don't block login
        if (data.user) {
          const userId = data.user.id;

          // Fire-and-forget login history (don't await)
          void supabase.from("login_history").insert({
            user_id: userId,
            ip_address: null,
            user_agent: navigator.userAgent,
            location: null,
          });

          // Check dispatcher password change with timeout protection
          try {
            const dispatcherCheck = Promise.race([
              supabase.from("dispatchers").select("must_change_password").eq("user_id", userId).maybeSingle(),
              new Promise<{ data: null }>((resolve) => setTimeout(() => resolve({ data: null }), 3000))
            ]);
            const { data: dispatcher } = await dispatcherCheck as any;
            if (dispatcher?.must_change_password) {
              setView("force-password-change");
              setLoading(false);
              return;
            }
          } catch {
            // If dispatcher check fails, proceed to dashboard anyway
          }
        }

        toast.success("Logged in successfully!");
        navigate("/dashboard/business", { replace: true });
      } else if (view === "signup") {
        // Validate signup form with Zod
        const validData = validateOrThrow(signupSchema, { fullName, email, password });

        // Check if email is invited before allowing signup
        const { data: isInvited, error: checkError } = await supabase
          .rpc('is_email_invited', { check_email: validData.email });
        
        if (checkError) {
          throw new Error("Unable to verify invitation status");
        }
        
        if (!isInvited) {
          throw new Error("This email has not been invited. Please contact an administrator to request access.");
        }

        const { error } = await supabase.auth.signUp({
          email: validData.email,
          password: validData.password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: {
              full_name: validData.fullName,
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
      // Validate email with Zod
      const validation = emailSchema.safeParse(email);
      if (!validation.success) {
        throw new Error(validation.error.errors[0].message);
      }

      const { error } = await supabase.auth.resetPasswordForEmail(validation.data, {
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
      // Validate password reset form with Zod
      const validData = validateOrThrow(passwordResetSchema, { password, confirmPassword });

      const { error } = await supabase.auth.updateUser({
        password: validData.password,
      });

      if (error) throw error;

      // If this was a force password change, clear the flag
      if (view === "force-password-change") {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase
            .from("dispatchers")
            .update({ must_change_password: false })
            .eq("user_id", user.id);
        }
        
        toast.success("Password updated successfully!");
        navigate("/dashboard/business", { replace: true });
        return;
      }

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
      case "login": return "Welcome back";
      case "signup": return "Create account";
      case "forgot-password": return "Reset password";
      case "reset-password": return "Set new password";
      case "force-password-change": return "Change your password";
    }
  };

  const getDescription = () => {
    switch (view) {
      case "login": return "Enter your credentials to access your dashboard";
      case "signup": return "Fill in your details to create an account";
      case "forgot-password": return "Enter your email to receive a reset link";
      case "reset-password": return "Choose a strong password for your account";
      case "force-password-change": return "You must change your temporary password before continuing";
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-primary/5 via-background to-background">
      {/* Header */}
      <header className="p-4">
        <Link to="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
          <span className="text-sm">Back to home</span>
        </Link>
      </header>

      {/* Main content */}
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Logo */}
          <div className="flex justify-center mb-8">
            <div className="h-14 w-14 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/25">
              <Truck className="h-7 w-7 text-primary-foreground" />
            </div>
          </div>

          <Card className="border-0 shadow-xl bg-card/80 backdrop-blur-xl">
            <CardHeader className="text-center pb-2">
              <CardTitle className="text-2xl font-bold tracking-tight">{getTitle()}</CardTitle>
              <CardDescription className="text-base">{getDescription()}</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              {/* Login Form */}
              {view === "login" && (
                <form onSubmit={handleAuth} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-medium">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10 h-11 rounded-xl"
                        placeholder="you@example.com"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-10 h-11 rounded-xl"
                        placeholder="••••••••"
                        required
                        minLength={6}
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full h-11 rounded-xl text-base font-medium" disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
                  </Button>
                  <div className="space-y-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setView("forgot-password")}
                      className="w-full text-sm text-muted-foreground hover:text-primary transition-colors"
                    >
                      Forgot your password?
                    </button>
                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-card px-2 text-muted-foreground">or</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setView("signup")}
                      className="w-full text-sm text-primary font-medium hover:underline"
                    >
                      Don't have an account? Sign up
                    </button>
                  </div>
                </form>
              )}

              {/* Signup Form */}
              {view === "signup" && (
                <form onSubmit={handleAuth} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="fullName" className="text-sm font-medium">Full Name</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="fullName"
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="pl-10 h-11 rounded-xl"
                        placeholder="John Doe"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-medium">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10 h-11 rounded-xl"
                        placeholder="you@example.com"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-10 h-11 rounded-xl"
                        placeholder="••••••••"
                        required
                        minLength={6}
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full h-11 rounded-xl text-base font-medium" disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create account"}
                  </Button>
                  <button
                    type="button"
                    onClick={() => setView("login")}
                    className="w-full text-sm text-primary font-medium hover:underline pt-2"
                  >
                    Already have an account? Sign in
                  </button>
                </form>
              )}

              {/* Forgot Password Form */}
              {view === "forgot-password" && (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-medium">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10 h-11 rounded-xl"
                        placeholder="you@example.com"
                        required
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full h-11 rounded-xl text-base font-medium" disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send reset link"}
                  </Button>
                  <button
                    type="button"
                    onClick={() => setView("login")}
                    className="w-full text-sm text-primary font-medium hover:underline pt-2"
                  >
                    Back to login
                  </button>
                </form>
              )}

              {/* Reset Password Form */}
              {(view === "reset-password" || view === "force-password-change") && (
                <form onSubmit={handleResetPassword} className="space-y-4">
                  {view === "force-password-change" && (
                    <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-4 mb-4">
                      <p className="text-sm text-amber-800 dark:text-amber-200">
                        For security, you must create a new password before accessing the dashboard.
                      </p>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-sm font-medium">New Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-10 h-11 rounded-xl"
                        placeholder="••••••••"
                        required
                        minLength={6}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword" className="text-sm font-medium">Confirm Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="confirmPassword"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="pl-10 h-11 rounded-xl"
                        placeholder="••••••••"
                        required
                        minLength={6}
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full h-11 rounded-xl text-base font-medium" disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update password"}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>

          {/* Footer */}
          <p className="text-center text-xs text-muted-foreground mt-6">
            By continuing, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </main>
    </div>
  );
}
