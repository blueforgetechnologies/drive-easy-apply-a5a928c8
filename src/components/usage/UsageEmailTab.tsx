import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Mail, Send, Clock, AlertTriangle, CheckCircle, RefreshCw, Inbox, Archive } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { Button } from "@/components/ui/button";

interface UsageEmailTabProps {
  selectedMonth: string; // "YYYY-MM" or "all"
}

const getDateRange = (selectedMonth: string) => {
  if (selectedMonth === "all") {
    return { startISO: null, endISO: null, isAllTime: true };
  }

  const [y, m] = selectedMonth.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
  const endExclusive = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
  return { startISO: start.toISOString(), endISO: endExclusive.toISOString(), isAllTime: false };
};

export function UsageEmailTab({ selectedMonth }: UsageEmailTabProps) {
  const { startISO, endISO, isAllTime } = getDateRange(selectedMonth);
  const periodLabel = isAllTime ? "all time" : selectedMonth;

  // Email volume for the selected period
  const { data: emailStats, refetch: refetchStats, isFetching: isStatsFetching } = useQuery({
    queryKey: ["email-usage-detail", selectedMonth],
    queryFn: async () => {
      let received = 0, active = 0, archived = 0;
      
      if (isAllTime) {
        const { count: activeCount } = await supabase.from('load_emails').select('*', { count: 'exact', head: true });
        const { count: archivedCount } = await supabase.from('load_emails_archive').select('*', { count: 'exact', head: true });
        active = activeCount || 0;
        archived = archivedCount || 0;
        received = active + archived;
      } else {
        const { count: activeCount } = await supabase.from('load_emails').select('*', { count: 'exact', head: true })
          .gte('received_at', startISO!).lt('received_at', endISO!);
        const { count: archivedCount } = await supabase.from('load_emails_archive').select('*', { count: 'exact', head: true })
          .gte('received_at', startISO!).lt('received_at', endISO!);
        active = activeCount || 0;
        archived = archivedCount || 0;
        received = active + archived;
      }
      
      return { received, active, archived };
    },
    refetchInterval: 30000,
  });

  // Email sending stats (Resend)
  const { data: sendStats, refetch: refetchSend, isFetching: isSendFetching } = useQuery({
    queryKey: ["email-send-stats", selectedMonth],
    queryFn: async () => {
      let query = supabase.from('email_send_tracking').select('email_type, success', { count: 'exact' });
      if (!isAllTime) {
        query = query.eq('month_year', selectedMonth);
      }
      const { data, count } = await query;
      
      const successCount = data?.filter(r => r.success).length || 0;
      const byType: Record<string, number> = {};
      data?.forEach(row => { byType[row.email_type] = (byType[row.email_type] || 0) + 1; });
      
      return { total: count || 0, success: successCount, failed: (count || 0) - successCount, byType };
    },
    refetchInterval: 30000,
  });

  // Email volume history - daily breakdown (last 14 days for selected period)
  const { data: volumeHistory } = useQuery({
    queryKey: ["email-volume-history-daily", selectedMonth],
    queryFn: async () => {
      let query = supabase.from('load_emails').select('received_at');
      if (!isAllTime) {
        query = query.gte('received_at', startISO!).lt('received_at', endISO!);
      }
      const { data: emails } = await query;
      
      const dailyData: Record<string, number> = {};
      emails?.forEach(email => {
        const day = email.received_at.slice(0, 10);
        dailyData[day] = (dailyData[day] || 0) + 1;
      });
      
      return Object.entries(dailyData)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-14)
        .map(([date, count]) => ({
          date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          received: count,
        }));
    },
    refetchInterval: 60000,
  });

  // Current pending queue
  const { data: pendingCount, refetch: refetchPending } = useQuery({
    queryKey: ["email-pending"],
    queryFn: async () => {
      const { data } = await supabase.rpc('get_email_queue_pending_count');
      return data || 0;
    },
    refetchInterval: 30000,
  });

  const isFetching = isStatsFetching || isSendFetching;

  const refreshAll = () => { refetchStats(); refetchSend(); refetchPending(); };

  const FREE_TIER_RESEND = 3000;
  const resendUsage = sendStats?.total || 0;
  const resendPercentage = Math.min(100, (resendUsage / FREE_TIER_RESEND) * 100);
  const estimatedCost = Math.max(0, (resendUsage - FREE_TIER_RESEND) * 0.001);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5" />Email Pipeline</CardTitle>
              <CardDescription>Incoming emails and outgoing notifications ({periodLabel})</CardDescription>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Resend Cost</p>
                <p className="text-3xl font-bold">${estimatedCost.toFixed(2)}</p>
              </div>
              <Button variant="outline" size="sm" onClick={refreshAll} disabled={isFetching}>
                <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-blue-500/10"><Inbox className="h-4 w-4 text-blue-500" /></div>
              <CardTitle className="text-sm font-medium">Total Received</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{(emailStats?.received || 0).toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">{periodLabel}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-green-500/10"><Mail className="h-4 w-4 text-green-500" /></div>
              <CardTitle className="text-sm font-medium">Active</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{(emailStats?.active || 0).toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">in database</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-gray-500/10"><Archive className="h-4 w-4 text-gray-500" /></div>
              <CardTitle className="text-sm font-medium">Archived</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{(emailStats?.archived || 0).toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">older than 30 days</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-purple-500/10"><Send className="h-4 w-4 text-purple-500" /></div>
              <CardTitle className="text-sm font-medium">Sent</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{(sendStats?.total || 0).toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">via Resend</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-orange-500/10"><Clock className="h-4 w-4 text-orange-500" /></div>
              <CardTitle className="text-sm font-medium">Queue</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{pendingCount || 0}</p>
            <p className="text-xs text-muted-foreground">pending</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Resend Free Tier Usage</CardTitle>
          <CardDescription>{resendUsage.toLocaleString()} / {FREE_TIER_RESEND.toLocaleString()} free emails</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Progress value={resendPercentage} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{resendPercentage < 100 ? `${(FREE_TIER_RESEND - resendUsage).toLocaleString()} remaining` : `${(resendUsage - FREE_TIER_RESEND).toLocaleString()} over free tier`}</span>
            <span>$0.001/email after free tier</span>
          </div>
        </CardContent>
      </Card>

      {volumeHistory && volumeHistory.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Daily Email Volume</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={volumeHistory}>
                  <XAxis dataKey="date" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                    formatter={(value: number) => [value.toLocaleString(), 'Emails']} />
                  <Area type="monotone" dataKey="received" stroke="hsl(217 91% 60%)" fill="hsl(217 91% 60% / 0.2)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {sendStats?.byType && Object.keys(sendStats.byType).length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Sent Emails by Type</CardTitle></CardHeader>
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

      {(sendStats?.total || 0) > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Delivery Status</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-green-500/10">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <div><p className="font-medium">{sendStats?.success || 0}</p><p className="text-xs text-muted-foreground">Delivered</p></div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                <div><p className="font-medium">{sendStats?.failed || 0}</p><p className="text-xs text-muted-foreground">Failed</p></div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}