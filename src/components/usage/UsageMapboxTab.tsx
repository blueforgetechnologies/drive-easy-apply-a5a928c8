import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Map, Navigation, MapPin, Database, Sparkles, Settings, RefreshCw, Receipt, Calendar, DollarSign } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
  
  // Calibration state
  const [showCalibration, setShowCalibration] = useState(false);
  const [actualMapboxBill, setActualMapboxBill] = useState<string>("");
  const [calibratedMultiplier, setCalibratedMultiplier] = useState<number | null>(null);
  
  // Load calibration from localStorage
  useEffect(() => {
    const savedMultiplier = localStorage.getItem('mapbox_calibrated_multiplier');
    if (savedMultiplier) setCalibratedMultiplier(parseFloat(savedMultiplier));
  }, []);

  // Cost rate constants
  const MAPBOX_GEOCODE_RATE = 0.75 / 1000; // $0.75 per 1000 after free tier
  const MAPBOX_FREE_TIER = 100000;

  // Main Mapbox usage query - use actual counts from source tables for accuracy
  const { data: mapboxUsage } = useQuery({
    queryKey: ["mapbox-usage-detail", selectedMonth],
    queryFn: async () => {
      // Get actual counts from source tables (the source of truth)
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
  
  // Calculate raw estimated cost based on usage
  const rawEstimatedCost = mapboxUsage?.total_cost || 0;
  
  // Apply calibration multiplier if set
  const calibratedCost = calibratedMultiplier 
    ? rawEstimatedCost * calibratedMultiplier 
    : rawEstimatedCost;

  const handleCalibrate = () => {
    const actualBill = parseFloat(actualMapboxBill);
    if (actualBill > 0 && rawEstimatedCost > 0) {
      const multiplier = actualBill / rawEstimatedCost;
      setCalibratedMultiplier(multiplier);
      localStorage.setItem('mapbox_calibrated_multiplier', multiplier.toString());
      localStorage.setItem('mapbox_calibration_date', new Date().toISOString());
      toast.success(`Calibration multiplier set to ${multiplier.toFixed(2)}x`);
      setActualMapboxBill("");
      setShowCalibration(false);
    } else {
      toast.error("Please enter a valid bill amount");
    }
  };

  const clearCalibration = () => {
    setCalibratedMultiplier(null);
    localStorage.removeItem('mapbox_calibrated_multiplier');
    localStorage.removeItem('mapbox_calibration_date');
    toast.success("Calibration cleared, using default estimates");
  };

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
            <div className="flex items-center gap-4">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setShowCalibration(!showCalibration)}
              >
                <Settings className="h-4 w-4 mr-2" />
                Calibrate
              </Button>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">
                  {calibratedMultiplier ? "Calibrated Cost" : "Estimated Cost"}
                </p>
                <p className="text-3xl font-bold">${calibratedCost.toFixed(2)}</p>
                {calibratedMultiplier && (
                  <p className="text-xs text-muted-foreground">
                    ({calibratedMultiplier.toFixed(2)}x multiplier)
                  </p>
                )}
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Calibration Panel */}
      {showCalibration && (
        <Card className="border-blue-500/20 bg-blue-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Cost Calibration
            </CardTitle>
            <CardDescription>
              Enter your actual Mapbox bill to calibrate cost estimates
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end gap-3">
              <div className="flex-1 max-w-xs">
                <label className="text-sm font-medium mb-1.5 block">Actual Mapbox Bill</label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="e.g., 15.50"
                    value={actualMapboxBill}
                    onChange={(e) => setActualMapboxBill(e.target.value)}
                    className="w-32"
                  />
                  <Button onClick={handleCalibrate}>
                    Calibrate
                  </Button>
                </div>
              </div>
              <div className="text-sm text-muted-foreground">
                <p>Current estimate: ${rawEstimatedCost.toFixed(2)}</p>
                {calibratedMultiplier && (
                  <p className="text-xs">Current multiplier: {calibratedMultiplier.toFixed(2)}x</p>
                )}
              </div>
            </div>
            {calibratedMultiplier && (
              <div className="flex items-center gap-2 pt-2 border-t">
                <Button variant="ghost" size="sm" onClick={clearCalibration}>
                  Clear Calibration
                </Button>
                <span className="text-xs text-muted-foreground">
                  Calibrated on {new Date(localStorage.getItem('mapbox_calibration_date') || '').toLocaleDateString()}
                </span>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Tip: Enter the total from your Mapbox dashboard to align estimates with actual billing.
            </p>
          </CardContent>
        </Card>
      )}

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

      <BillingHistorySection />
    </div>
  );
}

// Billing History Component - displays permanent billing records
function BillingHistorySection() {
  const { data: billingHistory, isLoading, refetch } = useQuery({
    queryKey: ["mapbox-billing-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mapbox_billing_history')
        .select('*')
        .order('billing_start', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
  });

  // Calculate cumulative totals
  const cumulativeTotals = billingHistory?.reduce((acc, record) => ({
    geocoding: acc.geocoding + (record.geocoding_requests || 0),
    mapLoads: acc.mapLoads + (record.map_loads || 0),
    directions: acc.directions + (record.directions_requests || 0),
    cost: acc.cost + Number(record.total_cost || 0),
  }), { geocoding: 0, mapLoads: 0, directions: 0, cost: 0 });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Receipt className="h-5 w-5" />Billing History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8 text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-amber-500/20 bg-amber-500/5">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-amber-600">
              <Receipt className="h-5 w-5" />
              Official Billing History
            </CardTitle>
            <CardDescription>Permanent record of Mapbox invoices (cannot be deleted)</CardDescription>
          </div>
          {cumulativeTotals && (
            <div className="text-right">
              <p className="text-sm text-muted-foreground">All-Time Total</p>
              <p className="text-2xl font-bold text-amber-600">${cumulativeTotals.cost.toFixed(2)}</p>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Cumulative totals */}
        {cumulativeTotals && (
          <div className="grid grid-cols-3 gap-4 p-4 rounded-lg bg-background/50 border">
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Total Geocoding</p>
              <p className="text-lg font-bold">{cumulativeTotals.geocoding.toLocaleString()}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Total Map Loads</p>
              <p className="text-lg font-bold">{cumulativeTotals.mapLoads.toLocaleString()}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Total Directions</p>
              <p className="text-lg font-bold">{cumulativeTotals.directions.toLocaleString()}</p>
            </div>
          </div>
        )}

        {/* Billing records table */}
        {billingHistory && billingHistory.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">Geocoding</TableHead>
                <TableHead className="text-right">Map Loads</TableHead>
                <TableHead className="text-right">Directions</TableHead>
                <TableHead className="text-right">Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {billingHistory.map((record) => (
                <TableRow key={record.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      {new Date(record.billing_start).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">{record.geocoding_requests.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{record.map_loads.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{record.directions_requests.toLocaleString()}</TableCell>
                  <TableCell className="text-right font-medium">
                    <div className="flex items-center justify-end gap-1">
                      <DollarSign className="h-3 w-3" />
                      {Number(record.total_cost).toFixed(2)}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            No billing records yet
          </div>
        )}
      </CardContent>
    </Card>
  );
}