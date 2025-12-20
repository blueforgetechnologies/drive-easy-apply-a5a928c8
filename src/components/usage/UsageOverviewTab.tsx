import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Map, Mail, Sparkles, Database, DollarSign, TrendingUp, Activity, RefreshCw } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";

interface UsageOverviewTabProps {
  selectedMonth: string;
}

// Cost rate constants
const CLOUD_WRITE_RATE = 0.000134; // $0.134 per 1000 writes
const MAPBOX_GEOCODE_RATE = 0.75 / 1000; // $0.75 per 1000 after free tier
const MAPBOX_FREE_TIER = 100000;
const AI_TOKEN_RATE = 0.075 / 1_000_000; // Flash model input rate

export function UsageOverviewTab({ selectedMonth }: UsageOverviewTabProps) {
  // Mapbox usage query
  const { data: mapboxUsage, refetch: refetchMapbox, isFetching: isMapboxFetching } = useQuery({
    queryKey: ["overview-mapbox", selectedMonth],
    queryFn: async () => {
      const { data } = await supabase
        .from('mapbox_monthly_usage')
        .select('*')
        .eq('month_year', selectedMonth)
        .maybeSingle();
      
      // If no data for this month, calculate from geocode_cache
      if (!data) {
        const startDate = new Date(selectedMonth + '-01');
        const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
        
        const { count } = await supabase
          .from('geocode_cache')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', startDate.toISOString())
          .lte('created_at', endDate.toISOString());
        
        const geocodeCalls = count || 0;
        const overFree = Math.max(0, geocodeCalls - MAPBOX_FREE_TIER);
        const cost = overFree * MAPBOX_GEOCODE_RATE;
        
        return {
          geocoding_api_calls: geocodeCalls,
          total_cost: cost,
          map_loads: 0,
          directions_api_calls: 0,
        };
      }
      return data;
    },
    refetchInterval: 30000,
  });

  // Email stats query - use created_at for consistency
  const { data: emailStats, refetch: refetchEmail, isFetching: isEmailFetching } = useQuery({
    queryKey: ["overview-email", selectedMonth],
    queryFn: async () => {
      const startDate = new Date(selectedMonth + '-01');
      const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
      
      // Get received emails
      const { count: received } = await supabase
        .from('load_emails')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());
      
      // Get sent emails (Resend)
      const { count: sent } = await supabase
        .from('email_send_tracking')
        .select('*', { count: 'exact', head: true })
        .eq('month_year', selectedMonth);
      
      // Resend cost: 3000 free, then $0.001 each
      const resendFree = 3000;
      const sentCount = sent || 0;
      const overFree = Math.max(0, sentCount - resendFree);
      const cost = overFree * 0.001;
      
      return { 
        received: received || 0,
        sent: sentCount,
        cost,
      };
    },
    refetchInterval: 30000,
  });

  // AI usage query
  const { data: aiStats, refetch: refetchAI, isFetching: isAIFetching } = useQuery({
    queryKey: ["overview-ai", selectedMonth],
    queryFn: async () => {
      const { data, count } = await supabase
        .from('ai_usage_tracking')
        .select('total_tokens, prompt_tokens, completion_tokens, model')
        .eq('month_year', selectedMonth);
      
      const totalTokens = data?.reduce((sum, row) => sum + (row.total_tokens || 0), 0) || 0;
      const promptTokens = data?.reduce((sum, row) => sum + (row.prompt_tokens || 0), 0) || 0;
      const completionTokens = data?.reduce((sum, row) => sum + (row.completion_tokens || 0), 0) || 0;
      
      // Calculate cost based on model (Flash is cheaper)
      let cost = 0;
      data?.forEach(row => {
        const isFlash = row.model?.toLowerCase().includes('flash');
        const inputCostPer1M = isFlash ? 0.075 : 1.25;
        const outputCostPer1M = isFlash ? 0.30 : 5.00;
        cost += ((row.prompt_tokens || 0) / 1_000_000) * inputCostPer1M;
        cost += ((row.completion_tokens || 0) / 1_000_000) * outputCostPer1M;
      });
      
      return { 
        count: data?.length || 0, 
        totalTokens,
        promptTokens,
        completionTokens,
        cost,
      };
    },
    refetchInterval: 30000,
  });

  // Cloud operations query - comprehensive write operations count
  const { data: cloudStats, refetch: refetchCloud, isFetching: isCloudFetching } = useQuery({
    queryKey: ["overview-cloud", selectedMonth],
    queryFn: async () => {
      const startDate = new Date(selectedMonth + '-01');
      const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
      const startISO = startDate.toISOString();
      const endISO = endDate.toISOString();
      
      // Query all tables that generate write operations
      const [
        emails, geocode, matches, mapTracking, directions, 
        aiUsage, emailSend, audit, matchAction, vehicleLocation
      ] = await Promise.all([
        supabase.from('load_emails').select('*', { count: 'exact', head: true })
          .gte('created_at', startISO).lte('created_at', endISO),
        supabase.from('geocode_cache').select('*', { count: 'exact', head: true })
          .gte('created_at', startISO).lte('created_at', endISO),
        supabase.from('load_hunt_matches').select('*', { count: 'exact', head: true })
          .gte('created_at', startISO).lte('created_at', endISO),
        supabase.from('map_load_tracking').select('*', { count: 'exact', head: true })
          .gte('created_at', startISO).lte('created_at', endISO),
        supabase.from('directions_api_tracking').select('*', { count: 'exact', head: true })
          .gte('created_at', startISO).lte('created_at', endISO),
        supabase.from('ai_usage_tracking').select('*', { count: 'exact', head: true })
          .eq('month_year', selectedMonth),
        supabase.from('email_send_tracking').select('*', { count: 'exact', head: true })
          .eq('month_year', selectedMonth),
        supabase.from('audit_logs').select('*', { count: 'exact', head: true })
          .gte('timestamp', startISO).lte('timestamp', endISO),
        supabase.from('match_action_history').select('*', { count: 'exact', head: true })
          .gte('created_at', startISO).lte('created_at', endISO),
        supabase.from('vehicle_location_history').select('*', { count: 'exact', head: true })
          .gte('captured_at', startISO).lte('captured_at', endISO),
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
      };
      
      const total = Object.values(breakdown).reduce((a, b) => a + b, 0);
      const cost = total * CLOUD_WRITE_RATE;
      
      return {
        ...breakdown,
        total,
        cost,
      };
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

  // Calculate costs
  const mapboxCost = mapboxUsage?.total_cost || 0;
  const emailCost = emailStats?.cost || 0;
  const aiCost = aiStats?.cost || 0;
  const cloudCost = cloudStats?.cost || 0;
  const totalCost = mapboxCost + emailCost + aiCost + cloudCost;

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
      limit: 50000, // Arbitrary limit for display
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
      {/* Header with Refresh */}
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={refreshAll} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Summary Header */}
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
              <span className="text-3xl font-bold">
                {totalOps.toLocaleString()}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cost Cards Grid */}
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
                  {percentage.toFixed(0)}% of free tier
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Detailed Breakdown */}
      {cloudStats && cloudStats.total > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Cloud Operations Breakdown</CardTitle>
            <CardDescription>Write operations by category for {selectedMonth}</CardDescription>
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
