import React, { Component, ReactNode } from "react";
import { AlertCircle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  children: ReactNode;
  fallbackPath?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary for route-level crashes.
 * 
 * Catches React render errors so they don't unmount the entire app (which
 * would reset DashboardLayout's auth state and kick users back to /auth).
 * Instead shows a friendly fallback with retry/navigate options.
 */
export class RouteErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log error for debugging; in production you could send to monitoring
    console.error("[RouteErrorBoundary] Caught error:", error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  handleGoHome = () => {
    window.location.href = this.props.fallbackPath || "/dashboard/business";
  };

  render() {
    if (this.state.hasError) {
      const errorMessage = this.state.error?.message || "Something went wrong";
      const isDev = import.meta.env.DEV;

      return (
        <div className="flex items-center justify-center min-h-[60vh] p-4">
          <Card className="w-full max-w-lg">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertCircle className="h-6 w-6 text-destructive" />
              </div>
              <CardTitle>Page Error</CardTitle>
              <CardDescription>
                This page ran into a problem. Your session is still active.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isDev && (
                <div className="bg-muted rounded-md p-3 text-xs font-mono text-muted-foreground overflow-auto max-h-32">
                  {errorMessage}
                </div>
              )}
              <div className="flex gap-2 justify-center">
                <Button variant="outline" onClick={this.handleGoHome}>
                  <Home className="h-4 w-4 mr-2" />
                  Go to Dashboard
                </Button>
                <Button onClick={this.handleRetry}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Try Again
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
