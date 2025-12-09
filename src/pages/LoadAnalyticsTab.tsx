import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend } from "recharts";
import { TrendingUp, MapPin, Calendar, Clock, Loader2, Filter, Map as MapIcon, BarChart3 } from "lucide-react";
import { format, getDay, getHours, parseISO } from "date-fns";

interface LoadData {
  id: string;
  pickup_state: string | null;
  pickup_city: string | null;
  delivery_state: string | null;
  delivery_city: string | null;
  equipment_type: string | null;
  pickup_date: string | null;
  created_at: string | null;
  status: string | null;
  rate: number | null;
}

interface StateData {
  state: string;
  pickups: number;
  deliveries: number;
  total: number;
}

interface CityData {
  city: string;
  state: string;
  pickups: number;
  deliveries: number;
  total: number;
}

interface TimeData {
  label: string;
  count: number;
}

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

const STATE_COORDS: Record<string, [number, number]> = {
  'AL': [-86.9023, 32.3182], 'AK': [-153.4937, 64.2008], 'AZ': [-111.0937, 34.0489],
  'AR': [-92.3731, 34.7465], 'CA': [-119.4179, 36.7783], 'CO': [-105.7821, 39.5501],
  'CT': [-72.7554, 41.6032], 'DE': [-75.5277, 38.9108], 'FL': [-81.5158, 27.6648],
  'GA': [-83.6431, 32.1574], 'HI': [-155.5828, 19.8968], 'ID': [-114.7420, 44.0682],
  'IL': [-89.3985, 40.6331], 'IN': [-86.1349, 40.2672], 'IA': [-93.0977, 41.8780],
  'KS': [-98.4842, 39.0119], 'KY': [-84.2700, 37.8393], 'LA': [-91.9623, 30.9843],
  'ME': [-69.4455, 45.2538], 'MD': [-76.6413, 39.0458], 'MA': [-71.3824, 42.4072],
  'MI': [-85.6024, 44.3148], 'MN': [-94.6859, 46.7296], 'MS': [-89.3985, 32.3547],
  'MO': [-91.8318, 37.9643], 'MT': [-110.3626, 46.8797], 'NE': [-99.9018, 41.4925],
  'NV': [-116.4194, 38.8026], 'NH': [-71.5724, 43.1939], 'NJ': [-74.4057, 40.0583],
  'NM': [-105.8701, 34.5199], 'NY': [-75.4999, 43.2994], 'NC': [-79.0193, 35.7596],
  'ND': [-101.0020, 47.5515], 'OH': [-82.9071, 40.4173], 'OK': [-97.0929, 35.0078],
  'OR': [-120.5542, 43.8041], 'PA': [-77.1945, 41.2033], 'RI': [-71.4774, 41.5801],
  'SC': [-81.1637, 33.8361], 'SD': [-99.9018, 43.9695], 'TN': [-86.5804, 35.5175],
  'TX': [-99.9018, 31.9686], 'UT': [-111.0937, 39.3200], 'VT': [-72.5778, 44.5588],
  'VA': [-78.6569, 37.4316], 'WA': [-120.7401, 47.7511], 'WV': [-80.4549, 38.5976],
  'WI': [-89.6165, 43.7844], 'WY': [-107.2903, 43.0759], 'DC': [-77.0369, 38.9072]
};

const CHART_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

export default function LoadAnalyticsTab() {
  const [loads, setLoads] = useState<LoadData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'state' | 'city'>('state');
  const [selectedEquipment, setSelectedEquipment] = useState<string>('all');
  const [dateRange, setDateRange] = useState<'30' | '90' | '365' | 'all'>('90');
  const [flowDirection, setFlowDirection] = useState<'pickup' | 'delivery' | 'both'>('both');

  useEffect(() => {
    loadAnalyticsData();
  }, [dateRange]);

  const loadAnalyticsData = async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from("loads")
        .select("id, pickup_state, pickup_city, delivery_state, delivery_city, equipment_type, pickup_date, created_at, status, rate")
        .in("status", ["completed", "delivered", "in_transit", "booked", "dispatched"]);

      if (dateRange !== 'all') {
        const daysAgo = new Date();
        daysAgo.setDate(daysAgo.getDate() - parseInt(dateRange));
        query = query.gte("pickup_date", daysAgo.toISOString().split('T')[0]);
      }

      const { data, error } = await query;

      if (error) throw error;
      setLoads(data || []);
    } catch (error) {
      console.error("Error loading analytics:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Filter loads by equipment type
  const filteredLoads = useMemo(() => {
    if (selectedEquipment === 'all') return loads;
    return loads.filter(load => load.equipment_type === selectedEquipment);
  }, [loads, selectedEquipment]);

  // Get unique equipment types
  const equipmentTypes = useMemo(() => {
    const types = new Set(loads.map(l => l.equipment_type).filter(Boolean));
    return Array.from(types).sort();
  }, [loads]);

  // Aggregate by state
  const stateData = useMemo((): StateData[] => {
    const stateMap = new Map<string, { pickups: number; deliveries: number }>();

    filteredLoads.forEach(load => {
      if (load.pickup_state) {
        const state = load.pickup_state.toUpperCase().trim();
        if (state.length === 2) {
          const current = stateMap.get(state) || { pickups: 0, deliveries: 0 };
          current.pickups++;
          stateMap.set(state, current);
        }
      }
      if (load.delivery_state) {
        const state = load.delivery_state.toUpperCase().trim();
        if (state.length === 2) {
          const current = stateMap.get(state) || { pickups: 0, deliveries: 0 };
          current.deliveries++;
          stateMap.set(state, current);
        }
      }
    });

    return Array.from(stateMap.entries())
      .map(([state, data]) => ({
        state,
        pickups: data.pickups,
        deliveries: data.deliveries,
        total: data.pickups + data.deliveries
      }))
      .sort((a, b) => b.total - a.total);
  }, [filteredLoads]);

  // Aggregate by city
  const cityData = useMemo((): CityData[] => {
    const cityMap = new Map<string, { state: string; pickups: number; deliveries: number }>();

    filteredLoads.forEach(load => {
      if (load.pickup_city && load.pickup_state) {
        const key = `${load.pickup_city}, ${load.pickup_state}`.toUpperCase();
        const current = cityMap.get(key) || { state: load.pickup_state, pickups: 0, deliveries: 0 };
        current.pickups++;
        cityMap.set(key, current);
      }
      if (load.delivery_city && load.delivery_state) {
        const key = `${load.delivery_city}, ${load.delivery_state}`.toUpperCase();
        const current = cityMap.get(key) || { state: load.delivery_state, pickups: 0, deliveries: 0 };
        current.deliveries++;
        cityMap.set(key, current);
      }
    });

    return Array.from(cityMap.entries())
      .map(([city, data]) => ({
        city: city.split(',')[0],
        state: data.state,
        pickups: data.pickups,
        deliveries: data.deliveries,
        total: data.pickups + data.deliveries
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 50); // Top 50 cities
  }, [filteredLoads]);

  // Day of week analysis
  const dayOfWeekData = useMemo((): TimeData[] => {
    const dayCounts = new Map<number, number>();
    DAYS_OF_WEEK.forEach((_, i) => dayCounts.set(i, 0));

    filteredLoads.forEach(load => {
      const dateStr = load.pickup_date || load.created_at;
      if (dateStr) {
        try {
          const date = parseISO(dateStr);
          const day = getDay(date);
          dayCounts.set(day, (dayCounts.get(day) || 0) + 1);
        } catch {}
      }
    });

    return DAYS_OF_WEEK.map((label, i) => ({
      label,
      count: dayCounts.get(i) || 0
    }));
  }, [filteredLoads]);

  // Hour of day analysis
  const hourOfDayData = useMemo((): TimeData[] => {
    const hourCounts = new Map<number, number>();
    HOURS.forEach(h => hourCounts.set(h, 0));

    filteredLoads.forEach(load => {
      const dateStr = load.created_at;
      if (dateStr) {
        try {
          const date = parseISO(dateStr);
          const hour = getHours(date);
          hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
        } catch {}
      }
    });

    return HOURS.map(hour => ({
      label: `${hour}:00`,
      count: hourCounts.get(hour) || 0
    }));
  }, [filteredLoads]);

  // Equipment type distribution
  const equipmentDistribution = useMemo(() => {
    const counts = new Map<string, number>();
    
    filteredLoads.forEach(load => {
      const type = load.equipment_type || 'Unknown';
      counts.set(type, (counts.get(type) || 0) + 1);
    });

    return Array.from(counts.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [filteredLoads]);

  // Monthly trend
  const monthlyTrend = useMemo(() => {
    const monthCounts = new Map<string, number>();
    
    filteredLoads.forEach(load => {
      const dateStr = load.pickup_date || load.created_at;
      if (dateStr) {
        try {
          const date = parseISO(dateStr);
          const monthKey = format(date, 'MMM yyyy');
          monthCounts.set(monthKey, (monthCounts.get(monthKey) || 0) + 1);
        } catch {}
      }
    });

    return Array.from(monthCounts.entries())
      .map(([month, count]) => ({ month, count }))
      .slice(-12); // Last 12 months
  }, [filteredLoads]);

  // Stats summary
  const stats = useMemo(() => {
    const totalLoads = filteredLoads.length;
    const totalRevenue = filteredLoads.reduce((sum, l) => sum + (l.rate || 0), 0);
    const avgRate = totalLoads > 0 ? totalRevenue / totalLoads : 0;
    const uniqueStates = new Set([
      ...filteredLoads.map(l => l.pickup_state).filter(Boolean),
      ...filteredLoads.map(l => l.delivery_state).filter(Boolean)
    ]).size;

    return { totalLoads, totalRevenue, avgRate, uniqueStates };
  }, [filteredLoads]);

  // Get display data based on view mode
  const getDisplayValue = (data: StateData | CityData) => {
    if (flowDirection === 'pickup') return data.pickups;
    if (flowDirection === 'delivery') return data.deliveries;
    return data.total;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <TrendingUp className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Load Analytics</h1>
          <Badge variant="secondary">{stats.totalLoads} loads</Badge>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <Select value={dateRange} onValueChange={(v: any) => setDateRange(v)}>
            <SelectTrigger className="w-[130px] h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="365">Last year</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>

          <Select value={selectedEquipment} onValueChange={setSelectedEquipment}>
            <SelectTrigger className="w-[150px] h-8">
              <SelectValue placeholder="Equipment" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Equipment</SelectItem>
              {equipmentTypes.map(type => (
                <SelectItem key={type} value={type!}>{type}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={flowDirection} onValueChange={(v: any) => setFlowDirection(v)}>
            <SelectTrigger className="w-[120px] h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="both">All Stops</SelectItem>
              <SelectItem value="pickup">Pickups</SelectItem>
              <SelectItem value="delivery">Deliveries</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Total Loads</div>
            <div className="text-2xl font-bold">{stats.totalLoads.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Total Revenue</div>
            <div className="text-2xl font-bold">${stats.totalRevenue.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Avg Rate</div>
            <div className="text-2xl font-bold">${Math.round(stats.avgRate).toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">States Covered</div>
            <div className="text-2xl font-bold">{stats.uniqueStates}</div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="geographic" className="space-y-4">
        <TabsList>
          <TabsTrigger value="geographic" className="gap-2">
            <MapIcon className="h-4 w-4" />
            Geographic
          </TabsTrigger>
          <TabsTrigger value="time" className="gap-2">
            <Calendar className="h-4 w-4" />
            Time Analysis
          </TabsTrigger>
          <TabsTrigger value="equipment" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Equipment
          </TabsTrigger>
        </TabsList>

        {/* Geographic Tab */}
        <TabsContent value="geographic" className="space-y-4">
          <div className="flex items-center gap-2">
            <Button
              variant={viewMode === 'state' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('state')}
            >
              By State
            </Button>
            <Button
              variant={viewMode === 'city' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('city')}
            >
              By City
            </Button>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Top Locations Chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">
                  Top {viewMode === 'state' ? 'States' : 'Cities'}
                </CardTitle>
                <CardDescription>
                  Load volume by {flowDirection === 'both' ? 'pickups + deliveries' : flowDirection}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart
                    data={viewMode === 'state' ? stateData.slice(0, 15) : cityData.slice(0, 15)}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 60, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis 
                      dataKey={viewMode === 'state' ? 'state' : 'city'} 
                      type="category" 
                      stroke="hsl(var(--muted-foreground))" 
                      fontSize={12}
                      width={50}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                    {flowDirection === 'both' ? (
                      <>
                        <Bar dataKey="pickups" stackId="a" fill="hsl(var(--chart-1))" name="Pickups" />
                        <Bar dataKey="deliveries" stackId="a" fill="hsl(var(--chart-2))" name="Deliveries" />
                      </>
                    ) : (
                      <Bar dataKey={flowDirection === 'pickup' ? 'pickups' : 'deliveries'} fill="hsl(var(--primary))" />
                    )}
                    <Legend />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* State/City Table */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">All Locations</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-[400px] overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-background">
                      <tr className="border-b">
                        <th className="text-left p-2 font-medium">{viewMode === 'state' ? 'State' : 'City'}</th>
                        <th className="text-right p-2 font-medium">Pickups</th>
                        <th className="text-right p-2 font-medium">Deliveries</th>
                        <th className="text-right p-2 font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(viewMode === 'state' ? stateData : cityData).map((row, i) => (
                        <tr key={i} className="border-b border-border/50 hover:bg-muted/50">
                          <td className="p-2 font-medium">
                            {viewMode === 'state' ? row.state : `${(row as CityData).city}, ${(row as CityData).state}`}
                          </td>
                          <td className="text-right p-2 text-green-600">{row.pickups}</td>
                          <td className="text-right p-2 text-blue-600">{row.deliveries}</td>
                          <td className="text-right p-2 font-medium">{row.total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Time Analysis Tab */}
        <TabsContent value="time" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Day of Week */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Busiest Days
                </CardTitle>
                <CardDescription>Load volume by day of week</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={dayOfWeekData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Hour of Day */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Busiest Hours
                </CardTitle>
                <CardDescription>Load creation by hour (24h)</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={hourOfDayData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={10} interval={2} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                    <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Monthly Trend */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Monthly Trend</CardTitle>
                <CardDescription>Load volume over time</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={monthlyTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                    <Bar dataKey="count" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Equipment Tab */}
        <TabsContent value="equipment" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Equipment Pie Chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Equipment Distribution</CardTitle>
                <CardDescription>Loads by equipment type</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={350}>
                  <PieChart>
                    <Pie
                      data={equipmentDistribution}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      outerRadius={120}
                      dataKey="value"
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    >
                      {equipmentDistribution.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Equipment Table */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Equipment Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {equipmentDistribution.map((item, i) => (
                    <div key={item.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                        />
                        <span className="text-sm font-medium">{item.name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-muted-foreground">
                          {((item.value / stats.totalLoads) * 100).toFixed(1)}%
                        </span>
                        <Badge variant="secondary">{item.value}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
