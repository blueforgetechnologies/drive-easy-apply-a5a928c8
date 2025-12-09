import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend } from "recharts";
import { TrendingUp, MapPin, Calendar, Clock, Loader2, Filter, Map as MapIcon, BarChart3, Mail } from "lucide-react";
import { format, getDay, getHours, parseISO } from "date-fns";

interface LoadEmailData {
  id: string;
  received_at: string;
  created_at: string;
  parsed_data: {
    origin_state?: string;
    origin_city?: string;
    destination_state?: string;
    destination_city?: string;
    vehicle_type?: string;
    posted_amount?: number;
    load_type?: string;
  } | null;
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

const CHART_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

// US Holidays that affect freight volume
const US_HOLIDAYS = [
  { name: "New Year's Day", month: 1, day: 1 },
  { name: "MLK Day", month: 1, day: 15 }, // 3rd Monday
  { name: "Presidents Day", month: 2, day: 15 }, // 3rd Monday
  { name: "Memorial Day", month: 5, day: 25 }, // Last Monday
  { name: "Independence Day", month: 7, day: 4 },
  { name: "Labor Day", month: 9, day: 1 }, // 1st Monday
  { name: "Thanksgiving", month: 11, day: 22 }, // 4th Thursday
  { name: "Christmas", month: 12, day: 25 },
];

export default function LoadAnalyticsTab() {
  const [loadEmails, setLoadEmails] = useState<LoadEmailData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'state' | 'city'>('state');
  const [selectedVehicleType, setSelectedVehicleType] = useState<string>('all');
  const [dateRange, setDateRange] = useState<'30' | '90' | '365' | 'all'>('90');
  const [flowDirection, setFlowDirection] = useState<'pickup' | 'delivery' | 'both'>('both');

  useEffect(() => {
    loadAnalyticsData();
  }, [dateRange]);

  const loadAnalyticsData = async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from("load_emails")
        .select("id, received_at, created_at, parsed_data")
        .order("received_at", { ascending: false });

      if (dateRange !== 'all') {
        const daysAgo = new Date();
        daysAgo.setDate(daysAgo.getDate() - parseInt(dateRange));
        query = query.gte("received_at", daysAgo.toISOString());
      }

      const { data, error } = await query;

      if (error) throw error;
      
      // Type assertion for parsed_data
      const typedData = (data || []).map(item => ({
        ...item,
        parsed_data: item.parsed_data as LoadEmailData['parsed_data']
      }));
      
      setLoadEmails(typedData);
    } catch (error) {
      console.error("Error loading analytics:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Get unique vehicle types
  const vehicleTypes = useMemo(() => {
    const types = new Set<string>();
    loadEmails.forEach(email => {
      const type = email.parsed_data?.vehicle_type;
      if (type) types.add(type);
    });
    return Array.from(types).sort();
  }, [loadEmails]);

  // Filter by vehicle type
  const filteredEmails = useMemo(() => {
    if (selectedVehicleType === 'all') return loadEmails;
    return loadEmails.filter(email => email.parsed_data?.vehicle_type === selectedVehicleType);
  }, [loadEmails, selectedVehicleType]);

  // Aggregate by state
  const stateData = useMemo((): StateData[] => {
    const stateMap = new Map<string, { pickups: number; deliveries: number }>();

    filteredEmails.forEach(email => {
      const originState = email.parsed_data?.origin_state?.toUpperCase().trim();
      const destState = email.parsed_data?.destination_state?.toUpperCase().trim();

      if (originState && originState.length === 2) {
        const current = stateMap.get(originState) || { pickups: 0, deliveries: 0 };
        current.pickups++;
        stateMap.set(originState, current);
      }
      if (destState && destState.length === 2) {
        const current = stateMap.get(destState) || { pickups: 0, deliveries: 0 };
        current.deliveries++;
        stateMap.set(destState, current);
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
  }, [filteredEmails]);

  // Aggregate by city
  const cityData = useMemo((): CityData[] => {
    const cityMap = new Map<string, { state: string; pickups: number; deliveries: number }>();

    filteredEmails.forEach(email => {
      const originCity = email.parsed_data?.origin_city;
      const originState = email.parsed_data?.origin_state;
      const destCity = email.parsed_data?.destination_city;
      const destState = email.parsed_data?.destination_state;

      if (originCity && originState) {
        const key = `${originCity}, ${originState}`.toUpperCase();
        const current = cityMap.get(key) || { state: originState, pickups: 0, deliveries: 0 };
        current.pickups++;
        cityMap.set(key, current);
      }
      if (destCity && destState) {
        const key = `${destCity}, ${destState}`.toUpperCase();
        const current = cityMap.get(key) || { state: destState, pickups: 0, deliveries: 0 };
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
      .slice(0, 50);
  }, [filteredEmails]);

  // Day of week analysis
  const dayOfWeekData = useMemo((): TimeData[] => {
    const dayCounts = new Map<number, number>();
    DAYS_OF_WEEK.forEach((_, i) => dayCounts.set(i, 0));

    filteredEmails.forEach(email => {
      try {
        const date = parseISO(email.received_at);
        const day = getDay(date);
        dayCounts.set(day, (dayCounts.get(day) || 0) + 1);
      } catch {}
    });

    return DAYS_OF_WEEK.map((label, i) => ({
      label,
      count: dayCounts.get(i) || 0
    }));
  }, [filteredEmails]);

  // Hour of day analysis
  const hourOfDayData = useMemo((): TimeData[] => {
    const hourCounts = new Map<number, number>();
    HOURS.forEach(h => hourCounts.set(h, 0));

    filteredEmails.forEach(email => {
      try {
        const date = parseISO(email.received_at);
        const hour = getHours(date);
        hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
      } catch {}
    });

    return HOURS.map(hour => ({
      label: `${hour}:00`,
      count: hourCounts.get(hour) || 0
    }));
  }, [filteredEmails]);

  // Vehicle type distribution
  const vehicleTypeDistribution = useMemo(() => {
    const counts = new Map<string, number>();
    
    filteredEmails.forEach(email => {
      const type = email.parsed_data?.vehicle_type || 'Unknown';
      counts.set(type, (counts.get(type) || 0) + 1);
    });

    return Array.from(counts.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 15);
  }, [filteredEmails]);

  // Monthly trend
  const monthlyTrend = useMemo(() => {
    const monthCounts = new Map<string, number>();
    
    filteredEmails.forEach(email => {
      try {
        const date = parseISO(email.received_at);
        const monthKey = format(date, 'MMM yyyy');
        monthCounts.set(monthKey, (monthCounts.get(monthKey) || 0) + 1);
      } catch {}
    });

    return Array.from(monthCounts.entries())
      .map(([month, count]) => ({ month, count }))
      .reverse()
      .slice(-12);
  }, [filteredEmails]);

  // Daily trend (last 30 days)
  const dailyTrend = useMemo(() => {
    const dayCounts = new Map<string, number>();
    
    filteredEmails.forEach(email => {
      try {
        const date = parseISO(email.received_at);
        const dayKey = format(date, 'MMM dd');
        dayCounts.set(dayKey, (dayCounts.get(dayKey) || 0) + 1);
      } catch {}
    });

    return Array.from(dayCounts.entries())
      .map(([day, count]) => ({ day, count }))
      .reverse()
      .slice(-30);
  }, [filteredEmails]);

  // Stats summary
  const stats = useMemo(() => {
    const totalEmails = filteredEmails.length;
    const totalPostedAmount = filteredEmails.reduce((sum, e) => sum + (e.parsed_data?.posted_amount || 0), 0);
    const avgPostedAmount = totalEmails > 0 ? totalPostedAmount / totalEmails : 0;
    const uniqueStates = new Set([
      ...filteredEmails.map(e => e.parsed_data?.origin_state).filter(Boolean),
      ...filteredEmails.map(e => e.parsed_data?.destination_state).filter(Boolean)
    ]).size;

    return { totalEmails, totalPostedAmount, avgPostedAmount, uniqueStates };
  }, [filteredEmails]);

  // Busiest days identification
  const busiestInfo = useMemo(() => {
    const busiestDay = dayOfWeekData.reduce((max, d) => d.count > max.count ? d : max, dayOfWeekData[0]);
    const busiestHour = hourOfDayData.reduce((max, h) => h.count > max.count ? h : max, hourOfDayData[0]);
    return { busiestDay: busiestDay.label, busiestHour: busiestHour.label };
  }, [dayOfWeekData, hourOfDayData]);

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
          <Mail className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Load Email Analytics</h1>
          <Badge variant="secondary">{stats.totalEmails.toLocaleString()} emails</Badge>
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

          <Select value={selectedVehicleType} onValueChange={setSelectedVehicleType}>
            <SelectTrigger className="w-[180px] h-8">
              <SelectValue placeholder="Vehicle Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Vehicle Types</SelectItem>
              {vehicleTypes.map(type => (
                <SelectItem key={type} value={type}>{type}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={flowDirection} onValueChange={(v: any) => setFlowDirection(v)}>
            <SelectTrigger className="w-[120px] h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="both">All Stops</SelectItem>
              <SelectItem value="pickup">Origins</SelectItem>
              <SelectItem value="delivery">Destinations</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Total Load Emails</div>
            <div className="text-2xl font-bold">{stats.totalEmails.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Avg Posted Amount</div>
            <div className="text-2xl font-bold">${Math.round(stats.avgPostedAmount).toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">States Covered</div>
            <div className="text-2xl font-bold">{stats.uniqueStates}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Busiest Day</div>
            <div className="text-2xl font-bold">{busiestInfo.busiestDay}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Peak Hour</div>
            <div className="text-2xl font-bold">{busiestInfo.busiestHour}</div>
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
          <TabsTrigger value="vehicle" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Vehicle Types
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
                  Load volume by {flowDirection === 'both' ? 'origins + destinations' : flowDirection === 'pickup' ? 'origins' : 'destinations'}
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
                        <Bar dataKey="pickups" stackId="a" fill="hsl(var(--chart-1))" name="Origins" />
                        <Bar dataKey="deliveries" stackId="a" fill="hsl(var(--chart-2))" name="Destinations" />
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
                        <th className="text-right p-2 font-medium">Origins</th>
                        <th className="text-right p-2 font-medium">Dest</th>
                        <th className="text-right p-2 font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(viewMode === 'state' ? stateData : cityData).map((item, i) => (
                        <tr key={i} className="border-b hover:bg-muted/50">
                          <td className="p-2">{viewMode === 'state' ? item.state : `${(item as CityData).city}, ${(item as CityData).state}`}</td>
                          <td className="text-right p-2">{item.pickups}</td>
                          <td className="text-right p-2">{item.deliveries}</td>
                          <td className="text-right p-2 font-medium">{item.total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Heat Density Info */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Load Density Hotspots</CardTitle>
              <CardDescription>Areas with highest concentration of loads</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {stateData.slice(0, 5).map((state, i) => (
                  <div key={state.state} className="p-4 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 border">
                    <div className="text-2xl font-bold">{state.state}</div>
                    <div className="text-sm text-muted-foreground">{state.total.toLocaleString()} loads</div>
                    <div className="mt-2 flex gap-2 text-xs">
                      <Badge variant="outline" className="bg-chart-1/10">{state.pickups} origins</Badge>
                      <Badge variant="outline" className="bg-chart-2/10">{state.deliveries} dest</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Time Analysis Tab */}
        <TabsContent value="time" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Day of Week */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Loads by Day of Week</CardTitle>
                <CardDescription>When loads are posted</CardDescription>
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
                <CardTitle className="text-lg">Loads by Hour</CardTitle>
                <CardDescription>Peak hours for load postings</CardDescription>
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
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Monthly Volume Trend</CardTitle>
                <CardDescription>Load email volume over time</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={monthlyTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                    <Line type="monotone" dataKey="count" stroke="hsl(var(--chart-2))" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Daily Trend */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Daily Volume (Last 30 Days)</CardTitle>
                <CardDescription>Recent load posting activity</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={dailyTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={10} interval={3} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                    <Bar dataKey="count" fill="hsl(var(--chart-3))" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Holiday Reference */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">US Holiday Reference</CardTitle>
              <CardDescription>Major holidays that affect freight volume</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {US_HOLIDAYS.map(holiday => (
                  <Badge key={holiday.name} variant="outline" className="py-1">
                    {holiday.name} ({holiday.month}/{holiday.day})
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Vehicle Types Tab */}
        <TabsContent value="vehicle" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Vehicle Type Distribution */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Load Volume by Vehicle Type</CardTitle>
                <CardDescription>Distribution of loads across vehicle types</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart
                    data={vehicleTypeDistribution}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis 
                      dataKey="name" 
                      type="category" 
                      stroke="hsl(var(--muted-foreground))" 
                      fontSize={11}
                      width={90}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                    <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Pie Chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Vehicle Type Share</CardTitle>
                <CardDescription>Percentage breakdown</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <PieChart>
                    <Pie
                      data={vehicleTypeDistribution.slice(0, 8)}
                      cx="50%"
                      cy="50%"
                      outerRadius={120}
                      dataKey="value"
                      nameKey="name"
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      labelLine={false}
                    >
                      {vehicleTypeDistribution.slice(0, 8).map((_, index) => (
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
          </div>

          {/* Vehicle Type Table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">All Vehicle Types</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-[400px] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-background">
                    <tr className="border-b">
                      <th className="text-left p-2 font-medium">Vehicle Type</th>
                      <th className="text-right p-2 font-medium">Count</th>
                      <th className="text-right p-2 font-medium">% Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vehicleTypeDistribution.map((item, i) => (
                      <tr key={i} className="border-b hover:bg-muted/50">
                        <td className="p-2">{item.name}</td>
                        <td className="text-right p-2">{item.value.toLocaleString()}</td>
                        <td className="text-right p-2">
                          {((item.value / stats.totalEmails) * 100).toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
