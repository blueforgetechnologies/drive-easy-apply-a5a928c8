import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Map, Navigation, MapPin, Database, Sparkles } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';

interface UsageMapboxTabProps {
  selectedMonth: string; // "YYYY-MM" or "all"
}

const getDateRange = (selectedMonth: string) => {
  if (selectedMonth === "all") {
    return { startISO: null, endISO: null, isAllTime: true };
  }
  const startDate = new Date(selectedMonth + '-01');
  const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
  return { startISO: startDate.toISOString(), endISO: endDate.toISOString(), isAllTime: false };
};

export function UsageMapboxTab({ selectedMonth }: UsageMapboxTabProps) {
  const { startISO, endISO, isAllTime } = getDateRange(selectedMonth);

  // Main Mapbox usage query
  const { data: mapboxUsage } = useQuery({
    queryKey: ["mapbox-usage-detail", selectedMonth],
    queryFn: async () => {
      if (isAllTime) {
        const { data } = await supabase.from('mapbox_monthly_usage').select('*');
        const totals = data?.reduce((acc, row) => ({
          geocoding_api_calls: acc.geocoding_api_calls + (row.geocoding_api_calls || 0),
          map_loads: acc.map_loads + (row.map_loads || 0),
          directions_api_calls: acc.directions_api_calls + (row.directions_api_calls || 0),
          total_cost: acc.total_cost + (row.total_cost || 0),
        }), { geocoding_api_calls: 0, map_loads: 0, directions_api_calls: 0, total_cost: 0 });
        return totals;
      }
      const { data } = await supabase.from('mapbox_monthly_usage').select('*').eq('month_year', selectedMonth).maybeSingle();
      return data;
    },
  });

  // Geocode cache stats - total stats
  const { data: cacheStats } = useQuery({
    queryKey: ["geocode-cache-total"],
    queryFn: async () => {
      const { count: totalLocations } = await supabase.from('geocode_cache').select('*', { count: 'exact', head: true });
      const { data: hitData } = await supabase.from('geocode_cache').select('hit_count');
      const totalHits = hitData?.reduce((sum, row) => sum + (row.hit_count || 0), 0) || 0;
      return { totalLocations: totalLocations || 0, totalHits, estimatedSavings: totalHits * 0.005 };
    },
  });

  // New locations cached this period
  const { data: monthlyCache } = useQuery({
    queryKey: ["geocode-cache-monthly", selectedMonth],
    queryFn: async () => {
      if (isAllTime) {
        const { count } = await supabase.from('geocode_cache').select('*', { count: 'exact', head: true });
        return { newLocations: count || 0 };
      }
      const { count } = await supabase.from('geocode_cache').select('*', { count: 'exact', head: true })
        .gte('created_at', startISO!).lte('created_at', endISO!);
      return { newLocations: count || 0 };
    },
  });

  // Map loads for the period
  const { data: mapLoads } = useQuery({
    queryKey: ["mapbox-map-loads", selectedMonth],
    queryFn: async () => {
      if (isAllTime) {
        const { count } = await supabase.from('map_load_tracking').select('*', { count: 'exact', head: true });
        return { count: count || 0 };
      }
      const { count } = await supabase.from('map_load_tracking').select('*', { count: 'exact', head: true }).eq('month_year', selectedMonth);
      return { count: count || 0 };
    },
  });

  // Directions API calls
  const { data: directionsStats } = useQuery({
    queryKey: ["mapbox-directions", selectedMonth],
    queryFn: async () => {
      if (isAllTime) {
        const { count } = await supabase.from('directions_api_tracking').select('*', { count: 'exact', head: true });
        return { count: count || 0 };
      }
      const { count } = await supabase.from('directions_api_tracking').select('*', { count: 'exact', head: true }).eq('month_year', selectedMonth);
      return { count: count || 0 };
    },
  });

  // Monthly history for chart
  const { data: monthlyHistory } = useQuery({
    queryKey: ["mapbox-history"],
    queryFn: async () => {
      const { data } = await supabase.from('mapbox_monthly_usage').select('month_year, geocoding_api_calls, map_loads, total_cost')
        .order('month_year', { ascending: true }).limit(6);
      return data?.map(row => ({
        month: new Date(row.month_year + '-01').toLocaleDateString('en-US', { month: 'short' }),
        geocoding: row.geocoding_api_calls || 0,
        mapLoads: row.map_loads || 0,
        cost: row.total_cost || 0,
      })) || [];
    },
  });

  const FREE_TIERS = { geocoding: 100000, mapLoads: 50000, directions: 100000 };
  const periodLabel = isAllTime ? "all time" : selectedMonth;

  const metrics = [
    { title: "Geocoding API", icon: MapPin, current: mapboxUsage?.geocoding_api_calls || 0, limit: FREE_TIERS.geocoding, color: "text-blue-500", bgColor: "bg-blue-500/10" },
    { title: "Map Loads", icon: Map, current: mapLoads?.count || 0, limit: FREE_TIERS.mapLoads, color: "text-green-500", bgColor: "bg-green-500/10" },
    { title: "Directions API", icon: Navigation, current: directionsStats?.count || 0, limit: FREE_TIERS.directions, color: "text-orange-500", bgColor: "bg-orange-500/10" },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><Map className="h-5 w-5" />Mapbox Usage</CardTitle>
              <CardDescription>Geocoding, Maps, and Directions API ({periodLabel})</CardDescription>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Estimated Cost</p>
              <p className="text-3xl font-bold">${(mapboxUsage?.total_cost || 0).toFixed(2)}</p>
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          const percentage = Math.min(100, (metric.current / metric.limit) * 100);
          const isOverLimit = metric.current > metric.limit;
          
          return (
            <Card key={metric.title}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <div className={`p-2 rounded-lg ${metric.bgColor}`}><Icon className={`h-4 w-4 ${metric.color}`} /></div>
                  <CardTitle className="text-sm font-medium">{metric.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-bold">{(metric.current / 1000).toFixed(1)}k</span>
                  <span className="text-sm text-muted-foreground">/ {(metric.limit / 1000).toFixed(0)}k free</span>
                </div>
                <Progress value={percentage} className={`h-2 ${isOverLimit ? '[&>div]:bg-destructive' : ''}`} />
                <p className="text-xs text-muted-foreground">
                  {isAllTime ? "All time usage" : isOverLimit ? (
                    <span className="text-destructive font-medium">{(metric.current - metric.limit).toLocaleString()} over free tier</span>
                  ) : `${(metric.limit - metric.current).toLocaleString()} remaining`}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="border-green-500/20 bg-green-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-green-600"><Database className="h-5 w-5" />Geocode Cache Performance</CardTitle>
          <CardDescription>Smart caching reduces API calls and saves money</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Cached Locations</p>
              <p className="text-2xl font-bold">{(cacheStats?.totalLocations || 0).toLocaleString()}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Cache Hits (All Time)</p>
              <p className="text-2xl font-bold">{(cacheStats?.totalHits || 0).toLocaleString()}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{isAllTime ? "Total Cached" : "New This Period"}</p>
              <p className="text-2xl font-bold">{(monthlyCache?.newLocations || 0).toLocaleString()}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground flex items-center gap-1"><Sparkles className="h-3 w-3 text-green-500" />Estimated Savings</p>
              <p className="text-2xl font-bold text-green-600">${(cacheStats?.estimatedSavings || 0).toFixed(2)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {monthlyHistory && monthlyHistory.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Usage Trend</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyHistory}>
                  <XAxis dataKey="month" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: number) => [value.toLocaleString(), '']}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                  <Line type="monotone" dataKey="geocoding" stroke="hsl(217 91% 60%)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="mapLoads" stroke="hsl(142 76% 36%)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-6 mt-2 text-xs">
              <div className="flex items-center gap-2"><div className="w-3 h-0.5 bg-blue-500 rounded" /><span className="text-muted-foreground">Geocoding</span></div>
              <div className="flex items-center gap-2"><div className="w-3 h-0.5 bg-green-500 rounded" /><span className="text-muted-foreground">Map Loads</span></div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}