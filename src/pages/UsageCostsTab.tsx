import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Database, Mail, Map, TrendingUp, DollarSign } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const UsageCostsTab = () => {
  // Fetch table counts
  const { data: tableCounts } = useQuery({
    queryKey: ["usage-table-counts"],
    queryFn: async () => {
      const tables = [
        'loads', 'load_emails', 'load_stops', 'load_hunt_matches',
        'vehicles', 'applications', 'dispatchers', 'carriers',
        'customers', 'payees', 'settlements', 'invoices',
        'maintenance_records', 'audit_logs', 'load_documents'
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

  const estimatedCosts = {
    mapbox: {
      geocodingCalls: (tableCounts?.load_hunt_matches || 0),
      estimatedCost: ((tableCounts?.load_hunt_matches || 0) * 0.006).toFixed(2), // $6 per 1000 calls
      mapLoads: (recentActivity?.loads || 0) * 2, // Estimate 2 map loads per load
      mapLoadsCost: ((recentActivity?.loads || 0) * 2 * 0.00075).toFixed(2) // $0.75 per 1000 loads
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
    parseFloat(estimatedCosts.mapbox.estimatedCost) +
    parseFloat(estimatedCosts.mapbox.mapLoadsCost) +
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

      {/* Mapbox Usage */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Map className="h-5 w-5" />
            Mapbox Usage
          </CardTitle>
          <CardDescription>Geocoding and map rendering costs</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Geocoding API Calls (Total)</p>
              <p className="text-2xl font-semibold">{estimatedCosts.mapbox.geocodingCalls.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">
                Est. Cost: ${estimatedCosts.mapbox.estimatedCost}
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Map Loads (30 days)</p>
              <p className="text-2xl font-semibold">{estimatedCosts.mapbox.mapLoads.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">
                Est. Cost: ${estimatedCosts.mapbox.mapLoadsCost}
              </p>
            </div>
          </div>
          <div className="pt-2 border-t">
            <p className="text-sm text-muted-foreground">Note: Geocoding occurs when loads match hunt plans with location criteria</p>
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
