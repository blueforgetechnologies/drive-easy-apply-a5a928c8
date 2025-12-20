import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect } from "react";

// Default cost rate constants
const DEFAULT_CLOUD_WRITE_RATE = 0.000134; // $0.134 per 1000 writes

export function useCloudCost() {
  // Load calibrated rate from localStorage
  const [calibratedRate, setCalibratedRate] = useState<number | null>(null);
  
  useEffect(() => {
    const savedRate = localStorage.getItem('cloud_calibrated_rate');
    if (savedRate) setCalibratedRate(parseFloat(savedRate));
  }, []);
  
  const effectiveRate = calibratedRate ?? DEFAULT_CLOUD_WRITE_RATE;

  // All-time cost breakdown query - matches Cloud tab exactly
  const { data: costBreakdown, isFetching } = useQuery({
    queryKey: ["comprehensive-cost-breakdown-alltime"],
    queryFn: async () => {
      // Fetch ALL write operations (no date filter) to match Lovable's billing
      const [
        emailResult, matchResult, geocodeResult, mapTrackingResult,
        directionsResult, aiResult, emailSendResult, auditResult,
        matchActionResult, emailVolumeResult, archiveResult,
        vehicleLocationResult, missedLoadsResult, pubsubResult,
        loadsResult, loadStopsResult
      ] = await Promise.all([
        supabase.from('load_emails').select('*', { count: 'exact', head: true }),
        supabase.from('load_hunt_matches').select('*', { count: 'exact', head: true }),
        supabase.from('geocode_cache').select('*', { count: 'exact', head: true }),
        supabase.from('map_load_tracking').select('*', { count: 'exact', head: true }),
        supabase.from('directions_api_tracking').select('*', { count: 'exact', head: true }),
        supabase.from('ai_usage_tracking').select('*', { count: 'exact', head: true }),
        supabase.from('email_send_tracking').select('*', { count: 'exact', head: true }),
        supabase.from('audit_logs').select('*', { count: 'exact', head: true }),
        supabase.from('match_action_history').select('*', { count: 'exact', head: true }),
        supabase.from('email_volume_stats').select('*', { count: 'exact', head: true }),
        supabase.from('load_emails_archive').select('*', { count: 'exact', head: true }),
        supabase.from('vehicle_location_history').select('*', { count: 'exact', head: true }),
        supabase.from('missed_loads_history').select('*', { count: 'exact', head: true }),
        supabase.from('pubsub_tracking').select('*', { count: 'exact', head: true }),
        supabase.from('loads').select('*', { count: 'exact', head: true }),
        supabase.from('load_stops').select('*', { count: 'exact', head: true }),
      ]);
      
      // Categorize costs
      const emailIngestion = {
        emails: emailResult.count ?? 0,
        geocode: geocodeResult.count ?? 0,
        emailVolume: emailVolumeResult.count ?? 0,
        archive: archiveResult.count ?? 0,
        pubsub: pubsubResult.count ?? 0,
      };
      
      const huntOperations = {
        matches: matchResult.count ?? 0,
        matchActions: matchActionResult.count ?? 0,
        missedLoads: missedLoadsResult.count ?? 0,
      };
      
      const loadManagement = {
        loads: loadsResult.count ?? 0,
        loadStops: loadStopsResult.count ?? 0,
      };
      
      const tracking = {
        mapTracking: mapTrackingResult.count ?? 0,
        directions: directionsResult.count ?? 0,
        vehicleLocation: vehicleLocationResult.count ?? 0,
      };
      
      const other = {
        ai: aiResult.count ?? 0,
        emailSend: emailSendResult.count ?? 0,
        audit: auditResult.count ?? 0,
      };
      
      const totalEmailIngestion = Object.values(emailIngestion).reduce((a, b) => a + b, 0);
      const totalHuntOps = Object.values(huntOperations).reduce((a, b) => a + b, 0);
      const totalLoadMgmt = Object.values(loadManagement).reduce((a, b) => a + b, 0);
      const totalTracking = Object.values(tracking).reduce((a, b) => a + b, 0);
      const totalOther = Object.values(other).reduce((a, b) => a + b, 0);
      const totalWriteOps = totalEmailIngestion + totalHuntOps + totalLoadMgmt + totalTracking + totalOther;
      
      // Edge function estimates
      const edgeFunctionCalls = (emailIngestion.emails * 2.5) + (other.ai) + (other.emailSend) + (tracking.directions);
      
      // Realtime estimates (subscriptions)
      const realtimeEvents = emailIngestion.emails * 5;
      
      return {
        categories: {
          emailIngestion: { ops: totalEmailIngestion, details: emailIngestion },
          huntOperations: { ops: totalHuntOps, details: huntOperations },
          loadManagement: { ops: totalLoadMgmt, details: loadManagement },
          tracking: { ops: totalTracking, details: tracking },
          other: { ops: totalOther, details: other },
        },
        totals: {
          writeOps: totalWriteOps,
          edgeFunctions: Math.round(edgeFunctionCalls),
          realtimeEvents: Math.round(realtimeEvents),
        },
      };
    },
    refetchInterval: 30000,
    staleTime: 15000,
  });

  // Calculate costs by category (exact same logic as Cloud tab)
  const emailIngestionCost = (costBreakdown?.categories.emailIngestion.ops || 0) * effectiveRate;
  const huntOpsCost = (costBreakdown?.categories.huntOperations.ops || 0) * effectiveRate;
  const loadMgmtCost = (costBreakdown?.categories.loadManagement.ops || 0) * effectiveRate;
  const trackingCost = (costBreakdown?.categories.tracking.ops || 0) * effectiveRate;
  const otherCost = (costBreakdown?.categories.other.ops || 0) * effectiveRate;
  
  // Edge function cost estimate
  const edgeFunctionCost = (costBreakdown?.totals.edgeFunctions || 0) * 0.000001;
  
  // Realtime cost estimate
  const realtimeCost = (costBreakdown?.totals.realtimeEvents || 0) * 0.0000001;
  
  // Total cloud cost - exact same calculation as Cloud tab
  const totalCloudCost = emailIngestionCost + huntOpsCost + loadMgmtCost + trackingCost + otherCost + edgeFunctionCost + realtimeCost;
  const totalWriteOps = costBreakdown?.totals.writeOps || 0;

  return {
    cloudCost: totalCloudCost,
    totalWriteOps,
    effectiveRate,
    calibratedRate,
    setCalibratedRate,
    costBreakdown,
    isFetching,
  };
}
