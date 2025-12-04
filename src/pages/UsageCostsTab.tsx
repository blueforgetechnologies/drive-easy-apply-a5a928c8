import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Database, Mail, Map, TrendingUp, DollarSign, Sparkles, Loader2 } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";

const UsageCostsTab = () => {
  const [aiTestResult, setAiTestResult] = useState<string>("");

  // Test AI mutation
  const testAiMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('test-ai', {
        body: { prompt: "Say hello and confirm you're working!" }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setAiTestResult(data.response);
      toast.success("AI test successful!");
    },
    onError: (error: any) => {
      console.error("AI test error:", error);
      toast.error(error.message || "AI test failed");
    }
  });

  // Fetch geocode cache stats
  const { data: geocodeStats } = useQuery({
    queryKey: ["geocode-cache-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('geocode_cache')
        .select('hit_count, created_at');
      
      if (error) throw error;
      
      const totalLocations = data?.length || 0;
      const totalHits = data?.reduce((sum, row) => sum + (row.hit_count || 1), 0) || 0;
      const estimatedSavings = totalHits * 0.00075; // $0.75 per 1000 calls = $0.00075 per call
      
      return {
        totalLocations,
        totalHits,
        estimatedSavings: estimatedSavings.toFixed(2),
        cacheHitRate: totalLocations > 0 ? ((totalHits - totalLocations) / totalHits * 100).toFixed(1) : '0'
      };
    }
  });

  // Fetch historical geocode cache stats
  const { data: dailyStats } = useQuery({
    queryKey: ["geocode-daily-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('geocode_cache_daily_stats')
        .select('*')
        .order('recorded_at', { ascending: false })
        .limit(7);
      
      if (error) throw error;
      return data || [];
    }
  });

  // Fetch table counts
  const { data: tableCounts } = useQuery({
    queryKey: ["usage-table-counts"],
    queryFn: async () => {
      const tables = [
        'loads', 'load_emails', 'load_stops', 'load_hunt_matches',
        'vehicles', 'applications', 'dispatchers', 'carriers',
        'customers', 'payees', 'settlements', 'invoices',
        'maintenance_records', 'audit_logs', 'load_documents', 'geocode_cache'
      ] as const;
      
      const counts: Record<string, number> = {};
      for (const table of tables) {
        const { count } = await supabase
          .from(table as any)
          .select('*', { count: 'exact', head: true });
        counts[table] = count || 0;
      }
      return counts;
    }
  });

  // Fetch recent activity counts (last 30 days)
  const { data: recentActivity } = useQuery({
    queryKey: ["usage-recent-activity"],
    queryFn: async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const { count: emailsCount } = await supabase
        .from('load_emails')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', thirtyDaysAgo.toISOString());
      
      const { count: loadsCount } = await supabase
        .from('loads')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', thirtyDaysAgo.toISOString());
      
      const { count: matchesCount } = await supabase
        .from('load_hunt_matches')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', thirtyDaysAgo.toISOString());
      
      return {
        emails: emailsCount || 0,
        loads: loadsCount || 0,
        matches: matchesCount || 0
      };
    }
  });

  // Mapbox pricing tiers
  const MAPBOX_GEOCODING_FREE_TIER = 100000;
  const MAPBOX_GEOCODING_RATE = 0.75; // $0.75 per 1,000 after free tier
  const MAPBOX_MAP_LOADS_FREE_TIER = 50000;
  const MAPBOX_MAP_LOADS_RATE = 5.00; // $5.00 per 1,000 after free tier

  // Cache stats: totalLocations = unique API calls made, totalHits = total requests served
  // Cache hits that saved API calls = totalHits - totalLocations
  const cachedLocations = geocodeStats?.totalLocations || 0;
  const totalRequestsServed = geocodeStats?.totalHits || 0;
  const cacheSavedCalls = Math.max(0, totalRequestsServed - cachedLocations);
  
  // For Mapbox billing tracking - user should check Mapbox dashboard for exact numbers
  // We can estimate based on cached locations (each was an API call)
  const estimatedApiCalls = cachedLocations; // Each unique cached location = 1 Mapbox API call
  const billableGeocodingCalls = Math.max(0, estimatedApiCalls - MAPBOX_GEOCODING_FREE_TIER);
  const geocodingCost = (billableGeocodingCalls / 1000) * MAPBOX_GEOCODING_RATE;

  // Estimate map loads (each page with a map = 1 load)
  const estimatedMapLoads = (recentActivity?.loads || 0) * 3; // ~3 map views per load (list, detail, route)
  const billableMapLoads = Math.max(0, estimatedMapLoads - MAPBOX_MAP_LOADS_FREE_TIER);
  const mapLoadsCost = (billableMapLoads / 1000) * MAPBOX_MAP_LOADS_RATE;

  const estimatedCosts = {
    mapbox: {
      // Actual API calls (unique locations cached)
      geocodingApiCalls: cachedLocations,
      // Requests served from cache (saved API calls)
      geocodingCacheSaved: cacheSavedCalls,
      geocodingFreeRemaining: Math.max(0, MAPBOX_GEOCODING_FREE_TIER - estimatedApiCalls),
      geocodingBillable: billableGeocodingCalls,
      geocodingCost: geocodingCost.toFixed(2),
      mapLoads: estimatedMapLoads,
      mapLoadsFreeRemaining: Math.max(0, MAPBOX_MAP_LOADS_FREE_TIER - estimatedMapLoads),
      mapLoadsBillable: billableMapLoads,
      mapLoadsCost: mapLoadsCost.toFixed(2)
    },
    resend: {
      emailsSent: recentActivity?.emails || 0,
      estimatedCost: ((recentActivity?.emails || 0) * 0.001).toFixed(2) // $1 per 1000 emails
    },
    storage: {
      totalRecords: Object.values(tableCounts || {}).reduce((a, b) => a + b, 0),
      estimatedSize: (Object.values(tableCounts || {}).reduce((a, b) => a + b, 0) * 0.001).toFixed(2) // Rough estimate in MB
    }
  };

  const totalEstimatedMonthlyCost = (
    geocodingCost +
    mapLoadsCost +
    parseFloat(estimatedCosts.resend.estimatedCost)
  ).toFixed(2);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Usage & Costs</h2>
        <p className="text-muted-foreground mt-2">
          Monitor your service usage and estimated costs
        </p>
      </div>

      {/* Total Cost Overview */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Estimated Monthly Cost (Last 30 Days)
          </CardTitle>
          <CardDescription>Based on current usage patterns</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-4xl font-bold text-primary">
            ${totalEstimatedMonthlyCost}
          </div>
        </CardContent>
      </Card>

      {/* Geocode Cache Stats */}
      <Card className="border-green-500/20 bg-green-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Map className="h-5 w-5 text-green-500" />
            Geocode Cache Performance
          </CardTitle>
          <CardDescription>Cache reduces Mapbox API calls</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Cached Locations</p>
              <p className="text-2xl font-semibold text-green-600">{geocodeStats?.totalLocations?.toLocaleString() || 0}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Total Cache Hits</p>
              <p className="text-2xl font-semibold text-green-600">{geocodeStats?.totalHits?.toLocaleString() || 0}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Cache Hit Rate</p>
              <p className="text-2xl font-semibold text-green-600">{geocodeStats?.cacheHitRate || 0}%</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Est. Savings</p>
              <p className="text-2xl font-semibold text-green-600">${geocodeStats?.estimatedSavings || '0.00'}</p>
            </div>
          </div>
          
          {/* Daily Stats History */}
          {dailyStats && dailyStats.length > 0 && (
            <div className="pt-4 border-t">
              <p className="text-sm font-medium mb-3">Daily History (Last 7 Days)</p>
              <div className="space-y-2">
                {dailyStats.map((stat: any) => (
                  <div key={stat.id} className="flex justify-between items-center text-sm py-1 px-2 rounded bg-muted/50">
                    <span className="text-muted-foreground">{new Date(stat.recorded_at).toLocaleDateString()}</span>
                    <div className="flex gap-4">
                      <span>+{stat.new_locations_today} new</span>
                      <span>{stat.hits_today} hits</span>
                      <span className="text-green-600 font-medium">${Number(stat.estimated_savings).toFixed(2)} saved</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          <div className="pt-2 border-t text-xs text-muted-foreground">
            <p>• Each cache hit saves one Mapbox API call ($0.75/1,000 = $0.00075)</p>
            <p>• Savings calculated based on cache hits that would have been billable API calls</p>
            <p>• Stats snapshot daily at midnight ET</p>
          </div>
        </CardContent>
      </Card>

      {/* Mapbox Usage */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Map className="h-5 w-5" />
            Mapbox Usage & Billing
          </CardTitle>
          <CardDescription>Geocoding and map rendering costs with free tier tracking</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Geocoding API */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Geocoding API</p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">API Calls Made</p>
                <p className="text-lg font-semibold">{estimatedCosts.mapbox.geocodingApiCalls.toLocaleString()}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Cache Saved</p>
                <p className="text-lg font-semibold text-green-600">{estimatedCosts.mapbox.geocodingCacheSaved.toLocaleString()}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Free Tier (100K)</p>
                <p className="text-lg font-semibold text-green-600">
                  {estimatedCosts.mapbox.geocodingFreeRemaining > 0 
                    ? `${estimatedCosts.mapbox.geocodingFreeRemaining.toLocaleString()} left` 
                    : 'Exceeded'}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Billable Calls</p>
                <p className="text-lg font-semibold text-amber-600">{estimatedCosts.mapbox.geocodingBillable.toLocaleString()}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Est. Cost</p>
                <p className="text-lg font-semibold text-red-600">${estimatedCosts.mapbox.geocodingCost}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Rate: $0.75/1,000 after 100K free • Check <a href="https://console.mapbox.com/account/invoices" target="_blank" rel="noopener noreferrer" className="text-primary underline">Mapbox dashboard</a> for exact billing</p>
          </div>
          
          {/* Map Loads */}
          <div className="space-y-2 pt-3 border-t">
            <p className="text-sm font-medium">Map Loads (GL JS)</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Total Loads</p>
                <p className="text-lg font-semibold">{estimatedCosts.mapbox.mapLoads.toLocaleString()}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Free Tier (50K)</p>
                <p className="text-lg font-semibold text-green-600">
                  {estimatedCosts.mapbox.mapLoadsFreeRemaining > 0 
                    ? `${estimatedCosts.mapbox.mapLoadsFreeRemaining.toLocaleString()} left` 
                    : 'Exceeded'}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Billable Loads</p>
                <p className="text-lg font-semibold text-amber-600">{estimatedCosts.mapbox.mapLoadsBillable.toLocaleString()}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Est. Cost</p>
                <p className="text-lg font-semibold text-red-600">${estimatedCosts.mapbox.mapLoadsCost}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Rate: $5.00/1,000 after 50K free</p>
          </div>
        </CardContent>
      </Card>

      {/* Lovable AI Usage */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Lovable AI Usage
          </CardTitle>
          <CardDescription>AI model requests and costs</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Model</p>
            <p className="text-lg font-medium">google/gemini-2.5-flash</p>
          </div>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Test AI Integration</p>
            <Button 
              onClick={() => testAiMutation.mutate()}
              disabled={testAiMutation.isPending}
              className="w-full"
            >
              {testAiMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Testing AI...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Test AI
                </>
              )}
            </Button>
            {aiTestResult && (
              <div className="mt-3 p-3 bg-muted rounded-md">
                <p className="text-sm font-medium mb-1">AI Response:</p>
                <p className="text-sm text-muted-foreground">{aiTestResult}</p>
              </div>
            )}
          </div>
          <div className="pt-2 border-t text-xs text-muted-foreground">
            <p>• Usage-based pricing per AI request</p>
            <p>• Check credit balance in Lovable workspace settings</p>
            <p>• Free monthly usage included, then pay-as-you-go</p>
          </div>
        </CardContent>
      </Card>

      {/* Email Usage (Resend) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email Usage (Resend)
          </CardTitle>
          <CardDescription>Email delivery costs</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Emails Sent (30 days)</p>
            <p className="text-2xl font-semibold">{estimatedCosts.resend.emailsSent.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">
              Est. Cost: ${estimatedCosts.resend.estimatedCost}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Database Storage */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Database Storage
          </CardTitle>
          <CardDescription>Lovable Cloud database usage</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Total Records</p>
            <p className="text-2xl font-semibold">{estimatedCosts.storage.totalRecords.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">
              Estimated Size: ~{estimatedCosts.storage.estimatedSize} MB
            </p>
          </div>
          
          <div className="pt-4 border-t space-y-2">
            <p className="text-sm font-medium">Top Tables by Record Count</p>
            <div className="space-y-1">
              {tableCounts && Object.entries(tableCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([table, count]) => (
                  <div key={table} className="flex justify-between text-sm">
                    <span className="text-muted-foreground capitalize">{table.replace(/_/g, ' ')}</span>
                    <span className="font-medium">{count.toLocaleString()}</span>
                  </div>
                ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Recent Activity (30 Days)
          </CardTitle>
          <CardDescription>System usage statistics</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Load Emails</p>
              <p className="text-2xl font-semibold">{recentActivity?.emails || 0}</p>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Loads Created</p>
              <p className="text-2xl font-semibold">{recentActivity?.loads || 0}</p>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Hunt Matches</p>
              <p className="text-2xl font-semibold">{recentActivity?.matches || 0}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cost Optimization Tips */}
      <Card className="border-amber-500/20 bg-amber-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-amber-500" />
            Cost Optimization Tips
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="flex gap-2">
            <span>•</span>
            <span>Disable hunt plans when not actively searching to avoid geocoding costs</span>
          </p>
          <p className="flex gap-2">
            <span>•</span>
            <span>Geocoding only occurs when loads match hunt plans with location criteria</span>
          </p>
          <p className="flex gap-2">
            <span>•</span>
            <span>Regular database cleanup of old records can help manage storage</span>
          </p>
          <p className="flex gap-2">
            <span>•</span>
            <span>Lovable Cloud includes generous free tiers for most services</span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default UsageCostsTab;
