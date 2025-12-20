import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Mail, Send, Clock, TrendingUp, AlertTriangle, CheckCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';

interface UsageEmailTabProps {
  selectedMonth: string;
}

export function UsageEmailTab({ selectedMonth }: UsageEmailTabProps) {
  // Email volume for the selected month
  const { data: emailStats } = useQuery({
    queryKey: ["email-usage-detail", selectedMonth],
    queryFn: async () => {
      const startDate = new Date(selectedMonth + '-01');
      const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
      
      const { count } = await supabase
        .from('load_emails')
        .select('*', { count: 'exact', head: true })
        .gte('received_at', startDate.toISOString())
        .lte('received_at', endDate.toISOString());
      
      return { received: count || 0 };
    },
  });

  // Email sending stats (Resend)
  const { data: sendStats } = useQuery({
    queryKey: ["email-send-stats", selectedMonth],
    queryFn: async () => {
      const { data, count } = await supabase
        .from('email_send_tracking')
        .select('email_type, success', { count: 'exact' })
        .eq('month_year', selectedMonth);
      
      const successCount = data?.filter(r => r.success).length || 0;
      const byType: Record<string, number> = {};
      data?.forEach(row => {
        byType[row.email_type] = (byType[row.email_type] || 0) + 1;
      });
      
      return { 
        total: count || 0, 
        success: successCount,
        failed: (count || 0) - successCount,
        byType,
      };
    },
  });

  // Email volume history
  const { data: volumeHistory } = useQuery({
    queryKey: ["email-volume-history", selectedMonth],
    queryFn: async () => {
      const startDate = new Date(selectedMonth + '-01');
      const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
      
      const { data } = await supabase
        .from('email_volume_stats')
        .select('hour_start, emails_received, emails_processed')
        .gte('hour_start', startDate.toISOString())
        .lte('hour_start', endDate.toISOString())
        .order('hour_start', { ascending: true });
      
      // Group by day
      const dailyData: Record<string, { received: number; processed: number }> = {};
      data?.forEach(row => {
        const day = row.hour_start.slice(0, 10);
        if (!dailyData[day]) dailyData[day] = { received: 0, processed: 0 };
        dailyData[day].received += row.emails_received || 0;
        dailyData[day].processed += row.emails_processed || 0;
      });
      
      return Object.entries(dailyData).slice(-14).map(([date, stats]) => ({
        date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        ...stats,
      }));
    },
  });

  // Current pending queue
  const { data: pendingCount } = useQuery({
    queryKey: ["email-pending"],
    queryFn: async () => {
      const { data } = await supabase.rpc('get_email_queue_pending_count');
      return data || 0;
    },
    refetchInterval: 30000,
  });

  const FREE_TIER_RESEND = 3000;
  const resendUsage = sendStats?.total || 0;
  const resendPercentage = Math.min(100, (resendUsage / FREE_TIER_RESEND) * 100);
  const estimatedCost = Math.max(0, (resendUsage - FREE_TIER_RESEND) * 0.001);

  return (
    <div className="space-y-6">
      {/* Cost Summary */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Email Pipeline
              </CardTitle>
              <CardDescription>Incoming emails and outgoing notifications</CardDescription>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Resend Cost</p>
              <p className="text-3xl font-bold">${estimatedCost.toFixed(2)}</p>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Mail className="h-4 w-4 text-blue-500" />
              </div>
              <CardTitle className="text-sm font-medium">Received</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{(emailStats?.received || 0).toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">emails this month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-green-500/10">
                <Send className="h-4 w-4 text-green-500" />
              </div>
              <CardTitle className="text-sm font-medium">Sent</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{(sendStats?.total || 0).toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">
              {sendStats?.success || 0} successful
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-orange-500/10">
                <Clock className="h-4 w-4 text-orange-500" />
              </div>
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{pendingCount || 0}</p>
            <p className="text-xs text-muted-foreground">in queue</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className={`p-2 rounded-lg ${(sendStats?.failed || 0) > 0 ? 'bg-destructive/10' : 'bg-green-500/10'}`}>
                {(sendStats?.failed || 0) > 0 ? (
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                ) : (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                )}
              </div>
              <CardTitle className="text-sm font-medium">Failed</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{sendStats?.failed || 0}</p>
            <p className="text-xs text-muted-foreground">delivery failures</p>
          </CardContent>
        </Card>
      </div>

      {/* Resend Usage */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Resend Free Tier Usage</CardTitle>
          <CardDescription>
            {resendUsage.toLocaleString()} / {FREE_TIER_RESEND.toLocaleString()} free emails
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Progress value={resendPercentage} className="h-2" />
          <p className="text-xs text-muted-foreground">
            {resendPercentage < 100 
              ? `${(FREE_TIER_RESEND - resendUsage).toLocaleString()} emails remaining in free tier`
              : `$0.001 per additional email`
            }
          </p>
        </CardContent>
      </Card>

      {/* Volume Chart */}
      {volumeHistory && volumeHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Daily Email Volume</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={volumeHistory}>
                  <XAxis dataKey="date" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="received" 
                    stroke="hsl(217 91% 60%)" 
                    fill="hsl(217 91% 60% / 0.2)" 
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Email Types Breakdown */}
      {sendStats?.byType && Object.keys(sendStats.byType).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Emails by Type</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(sendStats.byType).map(([type, count]) => (
                <div key={type} className="flex items-center justify-between py-2 border-b last:border-0">
                  <span className="text-sm capitalize">{type.replace(/_/g, ' ')}</span>
                  <span className="font-medium">{count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
