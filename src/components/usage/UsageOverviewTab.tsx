import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Map, Mail, Sparkles, Database, DollarSign, TrendingUp, Activity } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface UsageOverviewTabProps {
  selectedMonth: string;
}

export function UsageOverviewTab({ selectedMonth }: UsageOverviewTabProps) {
  // Mapbox usage query
  const { data: mapboxUsage } = useQuery({
    queryKey: ["overview-mapbox", selectedMonth],
    queryFn: async () => {
      const { data } = await supabase
        .from('mapbox_monthly_usage')
        .select('*')
        .eq('month_year', selectedMonth)
        .maybeSingle();
      return data;
    },
  });

  // Email stats query
  const { data: emailStats } = useQuery({
    queryKey: ["overview-email", selectedMonth],
    queryFn: async () => {
      const startDate = new Date(selectedMonth + '-01');
      const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
      
      const { count } = await supabase
        .from('load_emails')
        .select('*', { count: 'exact', head: true })
        .gte('received_at', startDate.toISOString())
        .lte('received_at', endDate.toISOString());
      
      return { count: count || 0 };
    },
  });

  // AI usage query
  const { data: aiStats } = useQuery({
    queryKey: ["overview-ai", selectedMonth],
    queryFn: async () => {
      const { data, count } = await supabase
        .from('ai_usage_tracking')
        .select('total_tokens', { count: 'exact' })
        .eq('month_year', selectedMonth);
      
      const totalTokens = data?.reduce((sum, row) => sum + (row.total_tokens || 0), 0) || 0;
      return { count: count || 0, totalTokens };
    },
  });

  // Cloud operations query
  const { data: cloudStats } = useQuery({
    queryKey: ["overview-cloud", selectedMonth],
    queryFn: async () => {
      const startDate = new Date(selectedMonth + '-01');
      const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
      
      const [emails, geocode, matches] = await Promise.all([
        supabase.from('load_emails').select('*', { count: 'exact', head: true })
          .gte('created_at', startDate.toISOString()).lte('created_at', endDate.toISOString()),
        supabase.from('geocode_cache').select('*', { count: 'exact', head: true })
          .gte('created_at', startDate.toISOString()).lte('created_at', endDate.toISOString()),
        supabase.from('load_hunt_matches').select('*', { count: 'exact', head: true })
          .gte('created_at', startDate.toISOString()).lte('created_at', endDate.toISOString()),
      ]);
      
      return {
        emails: emails.count || 0,
        geocode: geocode.count || 0,
        matches: matches.count || 0,
        total: (emails.count || 0) + (geocode.count || 0) + (matches.count || 0),
      };
    },
  });

  const costCards = [
    {
      title: "Mapbox",
      icon: Map,
      value: mapboxUsage?.total_cost || 0,
      usage: `${((mapboxUsage?.geocoding_api_calls || 0) / 1000).toFixed(1)}k geocodes`,
      color: "bg-blue-500/10 text-blue-500",
      limit: 100000,
      current: mapboxUsage?.geocoding_api_calls || 0,
    },
    {
      title: "Email Pipeline",
      icon: Mail,
      value: 0, // Email has no direct cost in free tier
      usage: `${emailStats?.count?.toLocaleString() || 0} emails`,
      color: "bg-green-500/10 text-green-500",
      limit: 50000,
      current: emailStats?.count || 0,
    },
    {
      title: "AI Usage",
      icon: Sparkles,
      value: 0,
      usage: `${((aiStats?.totalTokens || 0) / 1000).toFixed(1)}k tokens`,
      color: "bg-purple-500/10 text-purple-500",
      limit: 1000000,
      current: aiStats?.totalTokens || 0,
    },
    {
      title: "Cloud Ops",
      icon: Database,
      value: 0,
      usage: `${(cloudStats?.total || 0).toLocaleString()} writes`,
      color: "bg-orange-500/10 text-orange-500",
      limit: 500000,
      current: cloudStats?.total || 0,
    },
  ];

  const totalCost = costCards.reduce((sum, card) => sum + card.value, 0);

  return (
    <div className="space-y-6">
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
              <span className="text-3xl font-bold">{costCards.filter(c => c.current > 0).length}</span>
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
                {(cloudStats?.total || 0).toLocaleString()}
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
    </div>
  );
}
