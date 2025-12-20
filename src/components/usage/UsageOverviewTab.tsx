import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Map, Mail, Sparkles, Database, DollarSign, TrendingUp, Activity, RefreshCw } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";

interface UsageOverviewTabProps {
  selectedMonth: string; // "YYYY-MM" or "all"
}

// Default cost rate constants
const DEFAULT_CLOUD_WRITE_RATE = 0.000134; // $0.134 per 1000 writes
const MAPBOX_GEOCODE_RATE = 0.75 / 1000; // $0.75 per 1000 after free tier
const MAPBOX_FREE_TIER = 100000;

// Helper to build date range filter
const getDateRange = (selectedMonth: string) => {
  if (selectedMonth === "all") {
    return { startISO: null, endISO: null, isAllTime: true };
  }
  const startDate = new Date(selectedMonth + '-01');
  const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
  return { 
    startISO: startDate.toISOString(), 
    endISO: endDate.toISOString(), 
    isAllTime: false 
  };
};

export function UsageOverviewTab({ selectedMonth }: UsageOverviewTabProps) {
  const { startISO, endISO, isAllTime } = getDateRange(selectedMonth);
  
  // Load calibrated rates from localStorage (set in Cloud & AI tab)
  const [cloudCalibratedRate, setCloudCalibratedRate] = useState<number | null>(null);
  const [mapboxCalibratedMultiplier, setMapboxCalibratedMultiplier] = useState<number | null>(null);
  
  useEffect(() => {
    const savedCloudRate = localStorage.getItem('cloud_calibrated_rate');
    const savedMapboxMultiplier = localStorage.getItem('mapbox_calibrated_multiplier');
    if (savedCloudRate) setCloudCalibratedRate(parseFloat(savedCloudRate));
    if (savedMapboxMultiplier) setMapboxCalibratedMultiplier(parseFloat(savedMapboxMultiplier));
  }, []);
  
  const effectiveCloudRate = cloudCalibratedRate ?? DEFAULT_CLOUD_WRITE_RATE;

  // Mapbox usage query - use actual geocode_cache counts for accuracy
  const { data: mapboxUsage, refetch: refetchMapbox, isFetching: isMapboxFetching } = useQuery({
    queryKey: ["overview-mapbox", selectedMonth],
    queryFn: async () => {
      // Get actual geocode count from geocode_cache (the source of truth)
      let geocodeQuery = supabase.from('geocode_cache').select('*', { count: 'exact', head: true });
      let mapLoadsQuery = supabase.from('map_load_tracking').select('*', { count: 'exact', head: true });
      let directionsQuery = supabase.from('directions_api_tracking').select('*', { count: 'exact', head: true });
      
      if (!isAllTime) {
        geocodeQuery = geocodeQuery.gte('created_at', startISO!).lte('created_at', endISO!);
        mapLoadsQuery = mapLoadsQuery.eq('month_year', selectedMonth);
        directionsQuery = directionsQuery.eq('month_year', selectedMonth);
      }
      
      const [geocodeResult, mapLoadsResult, directionsResult] = await Promise.all([
        geocodeQuery,
        mapLoadsQuery,
        directionsQuery,
      ]);
      
      const geocodeCalls = geocodeResult.count || 0;
      const mapLoads = mapLoadsResult.count || 0;
      const directions = directionsResult.count || 0;
      
      // Calculate cost: $0.75 per 1000 geocodes after 100k free tier
      const overFree = Math.max(0, geocodeCalls - MAPBOX_FREE_TIER);
      const geocodeCost = overFree * MAPBOX_GEOCODE_RATE;
      
      // Map loads: $0.02 per 1000 after 50k free
      const mapLoadsFree = 50000;
      const mapLoadsOverFree = Math.max(0, mapLoads - mapLoadsFree);
      const mapLoadsCost = mapLoadsOverFree * 0.00002;
      
      // Directions: $0.50 per 1000 after 100k free
      const directionsFree = 100000;
      const directionsOverFree = Math.max(0, directions - directionsFree);
      const directionsCost = directionsOverFree * 0.0005;
      
      const totalCost = geocodeCost + mapLoadsCost + directionsCost;
      
      return { 
        geocoding_api_calls: geocodeCalls, 
        map_loads: mapLoads, 
        directions_api_calls: directions,
        total_cost: totalCost 
      };
    },
    refetchInterval: 30000,
  });

  // Email stats query
  const { data: emailStats, refetch: refetchEmail, isFetching: isEmailFetching } = useQuery({
    queryKey: ["overview-email", selectedMonth],
    queryFn: async () => {
      let received = 0;
      let sent = 0;
      
      if (isAllTime) {
        const { count: recvCount } = await supabase
          .from('load_emails')
          .select('*', { count: 'exact', head: true });
        
        const { count: sentCount } = await supabase
          .from('email_send_tracking')
          .select('*', { count: 'exact', head: true });
        
        received = recvCount || 0;
        sent = sentCount || 0;
      } else {
        const { count: recvCount } = await supabase
          .from('load_emails')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', startISO!)
          .lte('created_at', endISO!);
        
        const { count: sentCount } = await supabase
          .from('email_send_tracking')
          .select('*', { count: 'exact', head: true })
          .eq('month_year', selectedMonth);
        
        received = recvCount || 0;
        sent = sentCount || 0;
      }
      
      const resendFree = 3000;
      const overFree = Math.max(0, sent - resendFree);
      const cost = overFree * 0.001;
      
      return { received, sent, cost };
    },
    refetchInterval: 30000,
  });

  // AI usage query
  const { data: aiStats, refetch: refetchAI, isFetching: isAIFetching } = useQuery({
    queryKey: ["overview-ai", selectedMonth],
    queryFn: async () => {
      let query = supabase.from('ai_usage_tracking').select('total_tokens, prompt_tokens, completion_tokens, model');
      
      if (!isAllTime) {
        query = query.eq('month_year', selectedMonth);
      }
      
      const { data } = await query;
      
      const totalTokens = data?.reduce((sum, row) => sum + (row.total_tokens || 0), 0) || 0;
      const promptTokens = data?.reduce((sum, row) => sum + (row.prompt_tokens || 0), 0) || 0;
      const completionTokens = data?.reduce((sum, row) => sum + (row.completion_tokens || 0), 0) || 0;
      
      let cost = 0;
      data?.forEach(row => {
        const isFlash = row.model?.toLowerCase().includes('flash');
        const inputCostPer1M = isFlash ? 0.075 : 1.25;
        const outputCostPer1M = isFlash ? 0.30 : 5.00;
        cost += ((row.prompt_tokens || 0) / 1_000_000) * inputCostPer1M;
        cost += ((row.completion_tokens || 0) / 1_000_000) * outputCostPer1M;
      });
      
      return { count: data?.length || 0, totalTokens, promptTokens, completionTokens, cost };
    },
    refetchInterval: 30000,
  });

  // Cloud operations query
  const { data: cloudStats, refetch: refetchCloud, isFetching: isCloudFetching } = useQuery({
    queryKey: ["overview-cloud", selectedMonth],
    queryFn: async () => {
      const buildQuery = (table: string, dateColumn: string) => {
        let q = supabase.from(table as any).select('*', { count: 'exact', head: true });
        if (!isAllTime) {
          if (dateColumn === 'month_year') {
            q = q.eq('month_year', selectedMonth);
          } else {
            q = q.gte(dateColumn, startISO!).lte(dateColumn, endISO!);
          }
        }
        return q;
      };
      
      // Match the same 16 tables as Cloud & AI tab for consistency
      const [
        emails, geocode, matches, mapTracking, directions, aiUsage, emailSend, 
        audit, matchAction, vehicleLocation, emailVolume, archive, missedLoads, 
        pubsub, loads, loadStops
      ] = await Promise.all([
        buildQuery('load_emails', 'created_at'),
        buildQuery('geocode_cache', 'created_at'),
        buildQuery('load_hunt_matches', 'created_at'),
        buildQuery('map_load_tracking', 'created_at'),
        buildQuery('directions_api_tracking', 'created_at'),
        buildQuery('ai_usage_tracking', 'month_year'),
        buildQuery('email_send_tracking', 'month_year'),
        buildQuery('audit_logs', 'timestamp'),
        buildQuery('match_action_history', 'created_at'),
        buildQuery('vehicle_location_history', 'captured_at'),
        buildQuery('email_volume_stats', 'created_at'),
        buildQuery('load_emails_archive', 'archived_at'),
        buildQuery('missed_loads_history', 'created_at'),
        buildQuery('pubsub_tracking', 'created_at'),
        buildQuery('loads', 'created_at'),
        buildQuery('load_stops', 'created_at'),
      ]);
      
      const breakdown = {
        emails: emails.count || 0,
        geocode: geocode.count || 0,
        matches: matches.count || 0,
        mapTracking: mapTracking.count || 0,
        directions: directions.count || 0,
        aiUsage: aiUsage.count || 0,
        emailSend: emailSend.count || 0,
        audit: audit.count || 0,
        matchAction: matchAction.count || 0,
        vehicleLocation: vehicleLocation.count || 0,
        emailVolume: emailVolume.count || 0,
        archive: archive.count || 0,
        missedLoads: missedLoads.count || 0,
        pubsub: pubsub.count || 0,
        loads: loads.count || 0,
        loadStops: loadStops.count || 0,
      };
      
      const total = Object.values(breakdown).reduce((a, b) => a + b, 0);
      return { ...breakdown, total };
    },
    refetchInterval: 30000,
  });

  const isFetching = isMapboxFetching || isEmailFetching || isAIFetching || isCloudFetching;

  const refreshAll = () => {
    refetchMapbox();
    refetchEmail();
    refetchAI();
    refetchCloud();
  };

  // Apply calibration multipliers
  const rawMapboxCost = mapboxUsage?.total_cost || 0;
  const mapboxCost = mapboxCalibratedMultiplier ? rawMapboxCost * mapboxCalibratedMultiplier : rawMapboxCost;
  const emailCost = emailStats?.cost || 0;
  const aiCost = aiStats?.cost || 0;
  // Compute cloud cost using total operations * calibrated rate (same as Cloud & AI tab)
  const cloudCost = (cloudStats?.total || 0) * effectiveCloudRate;
  const totalCost = mapboxCost + emailCost + aiCost + cloudCost;

  const periodLabel = isAllTime ? "all time" : selectedMonth;

  const costCards = [
    {
      title: "Mapbox",
      icon: Map,
      value: mapboxCost,
      usage: `${((mapboxUsage?.geocoding_api_calls || 0) / 1000).toFixed(1)}k geocodes`,
      color: "bg-blue-500/10 text-blue-500",
      limit: MAPBOX_FREE_TIER,
      current: mapboxUsage?.geocoding_api_calls || 0,
    },
    {
      title: "Email Pipeline",
      icon: Mail,
      value: emailCost,
      usage: `${(emailStats?.received || 0).toLocaleString()} received`,
      color: "bg-green-500/10 text-green-500",
      limit: 50000,
      current: emailStats?.received || 0,
    },
    {
      title: "AI Usage",
      icon: Sparkles,
      value: aiCost,
      usage: `${((aiStats?.totalTokens || 0) / 1000).toFixed(1)}k tokens`,
      color: "bg-purple-500/10 text-purple-500",
      limit: 1000000,
      current: aiStats?.totalTokens || 0,
    },
    {
      title: "Cloud Ops",
      icon: Database,
      value: cloudCost,
      usage: `${(cloudStats?.total || 0).toLocaleString()} writes`,
      color: "bg-orange-500/10 text-orange-500",
      limit: 500000,
      current: cloudStats?.total || 0,
    },
  ];

  const activeServices = costCards.filter(c => c.current > 0).length;
  const totalOps = (cloudStats?.total || 0) + (mapboxUsage?.geocoding_api_calls || 0) + (aiStats?.count || 0);

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={refreshAll} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Estimated Cost</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <DollarSign className="h-5 w-5 text-muted-foreground" />
              <span className="text-3xl font-bold">{totalCost.toFixed(2)}</span>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active Services</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <Activity className="h-5 w-5 text-muted-foreground" />
              <span className="text-3xl font-bold">{activeServices}</span>
              <span className="text-muted-foreground text-sm">/ {costCards.length}</span>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Operations</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <TrendingUp className="h-5 w-5 text-muted-foreground" />
              <span className="text-3xl font-bold">{totalOps.toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {costCards.map((card) => {
          const Icon = card.icon;
          const percentage = Math.min(100, (card.current / card.limit) * 100);
          
          return (
            <Card key={card.title} className="relative overflow-hidden">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className={`p-2 rounded-lg ${card.color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="text-2xl font-bold">${card.value.toFixed(2)}</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{card.title}</span>
                  <span className="text-muted-foreground">{card.usage}</span>
                </div>
                <Progress value={percentage} className="h-1.5" />
                <p className="text-xs text-muted-foreground">
                  {isAllTime ? "All time usage" : `${percentage.toFixed(0)}% of free tier`}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {cloudStats && cloudStats.total > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Cloud Operations Breakdown</CardTitle>
            <CardDescription>Write operations by category for {periodLabel}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-5 gap-3 text-sm">
              <div className="p-3 rounded-lg bg-muted text-center">
                <p className="text-muted-foreground text-xs">Emails</p>
                <p className="font-bold text-lg">{(cloudStats.emails || 0).toLocaleString()}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted text-center">
                <p className="text-muted-foreground text-xs">Geocode</p>
                <p className="font-bold text-lg">{(cloudStats.geocode || 0).toLocaleString()}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted text-center">
                <p className="text-muted-foreground text-xs">Matches</p>
                <p className="font-bold text-lg">{(cloudStats.matches || 0).toLocaleString()}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted text-center">
                <p className="text-muted-foreground text-xs">Map Loads</p>
                <p className="font-bold text-lg">{(cloudStats.mapTracking || 0).toLocaleString()}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted text-center">
                <p className="text-muted-foreground text-xs">Other</p>
                <p className="font-bold text-lg">
                  {((cloudStats.audit || 0) + (cloudStats.matchAction || 0) + (cloudStats.vehicleLocation || 0)).toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}