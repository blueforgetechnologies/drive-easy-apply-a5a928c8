import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Map, Mail, Sparkles, Database, DollarSign, TrendingUp, Activity, RefreshCw } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { useCloudCost } from "@/hooks/useCloudCost";

interface UsageOverviewTabProps {
  selectedMonth: string; // "YYYY-MM" or "all"
}

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
  
  // Get cloud cost from shared hook (same calculation as Cloud tab)
  const { cloudCost, totalWriteOps, costBreakdown, isFetching: isCloudFetching } = useCloudCost();
  
  // Mapbox calibration
  const [mapboxCalibratedMultiplier, setMapboxCalibratedMultiplier] = useState<number | null>(null);
  
  useEffect(() => {
    const savedMapboxMultiplier = localStorage.getItem('mapbox_calibrated_multiplier');
    if (savedMapboxMultiplier) setMapboxCalibratedMultiplier(parseFloat(savedMapboxMultiplier));
  }, []);

  // Mapbox usage query - use cumulative cost from billing history + new API calls
  const { data: mapboxUsage, refetch: refetchMapbox, isFetching: isMapboxFetching } = useQuery({
    queryKey: ["overview-mapbox", selectedMonth],
    queryFn: async () => {
      // First get official billing history (baseline)
      let billingQuery;
      if (isAllTime) {
        const { data } = await supabase.from('mapbox_billing_history')
          .select('geocoding_requests, map_loads, directions_requests, total_cost, baseline_set_at');
        if (data && data.length > 0) {
          billingQuery = {
            geocoding_requests: data.reduce((sum, r) => sum + (r.geocoding_requests || 0), 0),
            map_loads: data.reduce((sum, r) => sum + (r.map_loads || 0), 0),
            directions_requests: data.reduce((sum, r) => sum + (r.directions_requests || 0), 0),
            total_cost: data.reduce((sum, r) => sum + Number(r.total_cost || 0), 0),
            baseline_set_at: data[data.length - 1]?.baseline_set_at || new Date().toISOString(),
          };
        }
      } else {
        const { data } = await supabase.from('mapbox_billing_history')
          .select('geocoding_requests, map_loads, directions_requests, total_cost, baseline_set_at')
          .eq('billing_period', selectedMonth)
          .single();
        billingQuery = data;
      }
      
      const hasOfficialBilling = billingQuery && billingQuery.total_cost > 0;
      const baselineDate = billingQuery?.baseline_set_at || new Date().toISOString();
      
      // Get new API calls since baseline (cache misses only = billable)
      const { count: newGeocoding } = await supabase
        .from('geocoding_api_tracking')
        .select('*', { count: 'exact', head: true })
        .eq('was_cache_hit', false)
        .gte('created_at', baselineDate);
      
      const { count: newMapLoads } = await supabase
        .from('map_load_tracking')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', baselineDate);
      
      const { count: newDirections } = await supabase
        .from('directions_api_tracking')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', baselineDate);
      
      // Calculate cumulative totals
      const cumulativeGeocoding = (billingQuery?.geocoding_requests || 0) + (newGeocoding || 0);
      const cumulativeMapLoads = (billingQuery?.map_loads || 0) + (newMapLoads || 0);
      const cumulativeDirections = (billingQuery?.directions_requests || 0) + (newDirections || 0);
      
      // Calculate cumulative cost based on Mapbox pricing
      const geocodingOverFree = Math.max(0, cumulativeGeocoding - MAPBOX_FREE_TIER);
      const mapLoadsOverFree = Math.max(0, cumulativeMapLoads - 50000);
      const directionsOverFree = Math.max(0, cumulativeDirections - 100000);
      
      const geocodingCost = geocodingOverFree * 0.00075; // $0.75 per 1000
      const mapLoadsCost = mapLoadsOverFree * 0.00002; // $0.02 per 1000
      const directionsCost = directionsOverFree * 0.0005; // $0.50 per 1000
      
      const cumulativeCost = geocodingCost + mapLoadsCost + directionsCost;
      
      return { 
        geocoding_api_calls: cumulativeGeocoding, 
        map_loads: cumulativeMapLoads, 
        directions_api_calls: cumulativeDirections,
        total_cost: hasOfficialBilling ? cumulativeCost : 0 
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

  const isFetching = isMapboxFetching || isEmailFetching || isAIFetching || isCloudFetching;

  const refreshAll = () => {
    refetchMapbox();
    refetchEmail();
    refetchAI();
  };

  // Apply calibration multipliers
  const rawMapboxCost = mapboxUsage?.total_cost || 0;
  const mapboxCost = mapboxCalibratedMultiplier ? rawMapboxCost * mapboxCalibratedMultiplier : rawMapboxCost;
  const emailCost = emailStats?.cost || 0;
  const aiCost = aiStats?.cost || 0;
  // cloudCost comes from useCloudCost hook (same calculation as Cloud tab)
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
      usage: `${totalWriteOps.toLocaleString()} writes`,
      color: "bg-orange-500/10 text-orange-500",
      limit: 500000,
      current: totalWriteOps,
    },
  ];

  const activeServices = costCards.filter(c => c.current > 0).length;
  const totalOps = totalWriteOps + (mapboxUsage?.geocoding_api_calls || 0) + (aiStats?.count || 0);

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

      {costBreakdown?.categories && totalWriteOps > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Cloud Operations Breakdown</CardTitle>
            <CardDescription>Write operations by category for {periodLabel}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-5 gap-3 text-sm">
              <div className="p-3 rounded-lg bg-muted text-center">
                <p className="text-muted-foreground text-xs">Emails</p>
                <p className="font-bold text-lg">{(costBreakdown?.categories?.emailIngestion?.details?.emails || 0).toLocaleString()}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted text-center">
                <p className="text-muted-foreground text-xs">Geocode</p>
                <p className="font-bold text-lg">{(costBreakdown?.categories?.emailIngestion?.details?.geocode || 0).toLocaleString()}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted text-center">
                <p className="text-muted-foreground text-xs">Matches</p>
                <p className="font-bold text-lg">{(costBreakdown?.categories?.huntOperations?.details?.matches || 0).toLocaleString()}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted text-center">
                <p className="text-muted-foreground text-xs">Map Loads</p>
                <p className="font-bold text-lg">{(costBreakdown?.categories?.tracking?.details?.mapTracking || 0).toLocaleString()}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted text-center">
                <p className="text-muted-foreground text-xs">Other</p>
                <p className="font-bold text-lg">
                  {(costBreakdown?.categories?.other?.ops || 0).toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}