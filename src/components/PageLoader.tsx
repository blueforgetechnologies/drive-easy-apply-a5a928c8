import { Loader2 } from "lucide-react";

/**
 * PageLoader - Displayed inside DashboardLayout while lazy-loaded routes are loading.
 * Shows a centered spinner with optional loading text.
 */
export default function PageLoader() {
  return (
    <div className="flex-1 flex items-center justify-center min-h-[400px]">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}
