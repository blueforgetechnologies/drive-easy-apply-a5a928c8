import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useUserTimezone() {
  const [timezone, setTimezone] = useState<string>("America/New_York");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadTimezone = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setLoading(false);
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("timezone")
          .eq("id", user.id)
          .single();

        if (profile?.timezone) {
          setTimezone(profile.timezone);
        }
      } catch (error) {
        console.error("Error loading user timezone:", error);
      } finally {
        setLoading(false);
      }
    };

    loadTimezone();
  }, []);

  // Get current date in user's timezone
  const getTodayInTimezone = (): Date => {
    const now = new Date();
    // Format the date in the user's timezone and parse it back
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = formatter.formatToParts(now);
    const month = parts.find(p => p.type === "month")?.value || "01";
    const day = parts.find(p => p.type === "day")?.value || "01";
    const year = parts.find(p => p.type === "year")?.value || "2025";
    
    // Create a date at midnight in local time for that calendar date
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  };

  return { timezone, loading, getTodayInTimezone };
}
