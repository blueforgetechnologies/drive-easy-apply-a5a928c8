/**
 * StuckEmailsAlert Component
 * 
 * Displays a warning when emails are stuck in processing loops.
 * Shows in the Workers tab and Load Hunter page.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface StuckEmailsStats {
  stuckCount: number;
  maxAttempts: number;
  processingCount: number;
  pendingCount: number;
}

export function StuckEmailsAlert() {
  const { data: stats, refetch, isFetching } = useQuery({
    queryKey: ["stuck-emails-stats"],
    queryFn: async (): Promise<StuckEmailsStats> => {
      // Get emails with high attempt counts (potential stuck)
      const { data: stuckData } = await supabase
        .from("email_queue")
        .select("attempts")
        .gte("attempts", 10)
        .not("status", "eq", "completed")
        .not("status", "eq", "failed");
      
      // Get processing emails
      const { count: processingCount } = await supabase
        .from("email_queue")
        .select("id", { count: "exact", head: true })
        .eq("status", "processing");
      
      // Get pending emails
      const { count: pendingCount } = await supabase
        .from("email_queue")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");

      const stuckCount = stuckData?.length || 0;
      const maxAttempts = stuckData?.reduce((max, item) => Math.max(max, item.attempts || 0), 0) || 0;

      return {
        stuckCount,
        maxAttempts,
        processingCount: processingCount || 0,
        pendingCount: pendingCount || 0,
      };
    },
    refetchInterval: 30000, // Check every 30 seconds
    staleTime: 15000,
  });

  const handleResetStuck = async () => {
    try {
      // Reset stuck emails to pending with 0 attempts
      const { error } = await supabase
        .from("email_queue")
        .update({ 
          status: "pending", 
          processing_started_at: null,
          attempts: 0,
          last_error: null
        })
        .gte("attempts", 10)
        .not("status", "eq", "completed")
        .not("status", "eq", "failed");

      if (error) throw error;

      toast.success("Reset stuck emails to pending");
      refetch();
    } catch (error) {
      toast.error("Failed to reset stuck emails");
      console.error(error);
    }
  };

  // Don't show if no stuck emails
  if (!stats || stats.stuckCount === 0) {
    return null;
  }

  const severity = stats.maxAttempts >= 50 ? "critical" : stats.maxAttempts >= 20 ? "warning" : "info";

  return (
    <Alert 
      variant={severity === "critical" ? "destructive" : "default"}
      className={severity === "warning" ? "border-orange-500 bg-orange-50 dark:bg-orange-950/20" : ""}
    >
      <AlertTriangle className={`h-4 w-4 ${severity === "critical" ? "" : "text-orange-500"}`} />
      <AlertTitle className="flex items-center justify-between">
        <span>
          {severity === "critical" ? "🚨 Critical: " : "⚠️ Warning: "}
          {stats.stuckCount} Email{stats.stuckCount !== 1 ? "s" : ""} Stuck in Loop
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={handleResetStuck}
          disabled={isFetching}
          className="ml-2"
        >
          <RefreshCw className={`h-3 w-3 mr-1 ${isFetching ? "animate-spin" : ""}`} />
          Reset All
        </Button>
      </AlertTitle>
      <AlertDescription className="mt-2">
        <div className="text-sm space-y-1">
          <p>
            {stats.stuckCount} email{stats.stuckCount !== 1 ? "s have" : " has"} been retried{" "}
            <strong>{stats.maxAttempts}+ times</strong> without success.
          </p>
          <p className="text-muted-foreground">
            Queue status: {stats.pendingCount} pending, {stats.processingCount} processing
          </p>
          {severity === "critical" && (
            <p className="text-destructive font-medium">
              These emails will be automatically marked as failed after 50 attempts.
            </p>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}