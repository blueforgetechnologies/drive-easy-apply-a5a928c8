import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp, Send, Clock, Target } from "lucide-react";

interface DispatcherMetric {
  dispatcher_id: string;
  dispatcher_name: string;
  dispatcher_email: string;
  total_actions: number;
  bids_sent: number;
  skips: number;
  waitlist: number;
  undecided: number;
  avg_response_time_mins: number;
}

interface DispatcherMetricsViewProps {
  dispatchers: any[];
}

export function DispatcherMetricsView({ dispatchers }: DispatcherMetricsViewProps) {
  const [metrics, setMetrics] = useState<DispatcherMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [totals, setTotals] = useState({
    totalBids: 0,
    totalActions: 0,
    totalSkips: 0,
    avgResponseTime: 0,
  });

  useEffect(() => {
    loadMetrics();
  }, []);

  const loadMetrics = async () => {
    try {
      setLoading(true);
      
      // Get action history grouped by dispatcher
      const { data: actions, error } = await supabase
        .from('match_action_history')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Group by dispatcher
      const dispatcherMap = new Map<string, DispatcherMetric>();
      
      (actions || []).forEach((action: any) => {
        const key = action.dispatcher_email || action.dispatcher_id || 'unknown';
        
        if (!dispatcherMap.has(key)) {
          dispatcherMap.set(key, {
            dispatcher_id: action.dispatcher_id || '',
            dispatcher_name: action.dispatcher_name || 'Unknown',
            dispatcher_email: action.dispatcher_email || '',
            total_actions: 0,
            bids_sent: 0,
            skips: 0,
            waitlist: 0,
            undecided: 0,
            avg_response_time_mins: 0,
          });
        }
        
        const metric = dispatcherMap.get(key)!;
        metric.total_actions++;
        
        if (action.action_type === 'bid') {
          metric.bids_sent++;
        } else if (action.action_type === 'skip') {
          metric.skips++;
        } else if (action.action_type === 'waitlist') {
          metric.waitlist++;
        } else if (action.action_type === 'undecided' || action.action_type === 'view') {
          metric.undecided++;
        }
      });

      const metricsArray = Array.from(dispatcherMap.values())
        .sort((a, b) => b.bids_sent - a.bids_sent);

      // Calculate totals
      const totalBids = metricsArray.reduce((sum, m) => sum + m.bids_sent, 0);
      const totalActions = metricsArray.reduce((sum, m) => sum + m.total_actions, 0);
      const totalSkips = metricsArray.reduce((sum, m) => sum + m.skips, 0);

      setMetrics(metricsArray);
      setTotals({
        totalBids,
        totalActions,
        totalSkips,
        avgResponseTime: 0,
      });
    } catch (error) {
      console.error("Error loading metrics:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto space-y-4 p-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-3">
        <Card className="bg-green-50 border-green-200">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Send className="h-4 w-4 text-green-600" />
              <span className="text-xs text-green-700 font-medium">Total Bids</span>
            </div>
            <div className="text-2xl font-bold text-green-800 mt-1">{totals.totalBids}</div>
          </CardContent>
        </Card>
        
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-blue-600" />
              <span className="text-xs text-blue-700 font-medium">Total Actions</span>
            </div>
            <div className="text-2xl font-bold text-blue-800 mt-1">{totals.totalActions}</div>
          </CardContent>
        </Card>
        
        <Card className="bg-gray-50 border-gray-200">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-gray-600" />
              <span className="text-xs text-gray-700 font-medium">Total Skips</span>
            </div>
            <div className="text-2xl font-bold text-gray-800 mt-1">{totals.totalSkips}</div>
          </CardContent>
        </Card>
        
        <Card className="bg-indigo-50 border-indigo-200">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-indigo-600" />
              <span className="text-xs text-indigo-700 font-medium">Dispatchers</span>
            </div>
            <div className="text-2xl font-bold text-indigo-800 mt-1">{metrics.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Dispatcher Table */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm font-semibold">Dispatcher Performance</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {metrics.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              No dispatcher activity recorded yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="h-8">
                  <TableHead className="text-xs font-semibold">Dispatcher</TableHead>
                  <TableHead className="text-xs font-semibold text-center">Bids Sent</TableHead>
                  <TableHead className="text-xs font-semibold text-center">Skips</TableHead>
                  <TableHead className="text-xs font-semibold text-center">Waitlist</TableHead>
                  <TableHead className="text-xs font-semibold text-center">Undecided</TableHead>
                  <TableHead className="text-xs font-semibold text-center">Total Actions</TableHead>
                  <TableHead className="text-xs font-semibold text-center">Bid Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.map((metric) => {
                  const bidRate = metric.total_actions > 0 
                    ? Math.round((metric.bids_sent / metric.total_actions) * 100) 
                    : 0;
                  
                  return (
                    <TableRow key={metric.dispatcher_email || metric.dispatcher_id} className="h-10">
                      <TableCell className="py-1">
                        <div>
                          <div className="text-sm font-medium">{metric.dispatcher_name}</div>
                          <div className="text-xs text-muted-foreground">{metric.dispatcher_email}</div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="default" className="bg-green-500 hover:bg-green-500">
                          {metric.bids_sent}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-sm text-gray-600">{metric.skips}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-sm text-blue-600">{metric.waitlist}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-sm text-orange-600">{metric.undecided}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-sm font-medium">{metric.total_actions}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge 
                          variant="outline" 
                          className={bidRate >= 50 ? 'border-green-500 text-green-700' : bidRate >= 25 ? 'border-yellow-500 text-yellow-700' : 'border-gray-400 text-gray-600'}
                        >
                          {bidRate}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
