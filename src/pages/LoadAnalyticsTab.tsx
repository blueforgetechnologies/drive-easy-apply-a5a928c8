import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend } from "recharts";
import { TrendingUp, Calendar, Loader2, Map as MapIcon, BarChart3, Mail, Globe } from "lucide-react";
import { format, getDay, getHours, parseISO } from "date-fns";
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

interface LoadEmailData {
  id: string;
  received_at: string;
  created_at: string;
  parsed_data: {
    origin_state?: string;
    origin_city?: string;
    origin_zip?: string;
    destination_state?: string;
    destination_city?: string;
    destination_zip?: string;
    vehicle_type?: string;
    posted_amount?: number;
    load_type?: string;
  } | null;
}

interface GeocodeData {
  location_key: string;
  latitude: number;
  longitude: number;
  city: string | null;
  state: string | null;
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

// State center coordinates for fallback
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

const US_HOLIDAYS = [
  { name: "New Year's Day", month: 1, day: 1 },
  { name: "MLK Day", month: 1, day: 15 },
  { name: "Presidents Day", month: 2, day: 15 },
  { name: "Memorial Day", month: 5, day: 25 },
  { name: "Independence Day", month: 7, day: 4 },
  { name: "Labor Day", month: 9, day: 1 },
  { name: "Thanksgiving", month: 11, day: 22 },
  { name: "Christmas", month: 12, day: 25 },
];

export default function LoadAnalyticsTab() {
  const [loadEmails, setLoadEmails] = useState<LoadEmailData[]>([]);
  const [geocodeCache, setGeocodeCache] = useState<GeocodeData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'state' | 'city'>('state');
  const [selectedVehicleType, setSelectedVehicleType] = useState<string>('all');
  const [dateRange, setDateRange] = useState<'30' | '90' | '365' | 'all'>('90');
  const [flowDirection, setFlowDirection] = useState<'pickup' | 'delivery' | 'both'>('both');
  const [mapboxToken, setMapboxToken] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('geographic');
  
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);

  useEffect(() => {
    loadAnalyticsData();
    loadMapboxToken();
    loadGeocodeCache();
  }, [dateRange]);

  const loadMapboxToken = async () => {
    try {
      const { data } = await supabase.functions.invoke('get-mapbox-token');
      if (data?.token) {
        setMapboxToken(data.token);
      }
    } catch (error) {
      console.error("Error loading mapbox token:", error);
    }
  };

  const loadGeocodeCache = async () => {
    try {
      const { data, error } = await supabase
        .from("geocode_cache")
        .select("location_key, latitude, longitude, city, state");
      
      if (!error && data) {
        setGeocodeCache(data);
      }
    } catch (error) {
      console.error("Error loading geocode cache:", error);
    }
  };

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

  // Build geocode lookup map
  const geocodeLookup = useMemo(() => {
    const lookup = new Map<string, { lat: number; lng: number }>();
    geocodeCache.forEach(g => {
      lookup.set(g.location_key.toLowerCase(), { lat: g.latitude, lng: g.longitude });
    });
    return lookup;
  }, [geocodeCache]);

  // Get coordinates for a location - ALWAYS returns coords via state fallback
  const getCoordinates = useCallback((city?: string, state?: string, zip?: string): [number, number] | null => {
    // Try zip first from cache
    if (zip) {
      const cached = geocodeLookup.get(zip.toLowerCase());
      if (cached) return [cached.lng, cached.lat];
    }
    // Try city, state from cache
    if (city && state) {
      const key = `${city}, ${state}`.toLowerCase();
      const cached = geocodeLookup.get(key);
      if (cached) return [cached.lng, cached.lat];
    }
    // Fall back to state center - this should always work if we have a state
    if (state) {
      const stateUpper = state.toUpperCase().trim();
      // Handle full state names by getting abbreviation
      const stateAbbreviations: Record<string, string> = {
        'ALABAMA': 'AL', 'ALASKA': 'AK', 'ARIZONA': 'AZ', 'ARKANSAS': 'AR', 'CALIFORNIA': 'CA',
        'COLORADO': 'CO', 'CONNECTICUT': 'CT', 'DELAWARE': 'DE', 'FLORIDA': 'FL', 'GEORGIA': 'GA',
        'HAWAII': 'HI', 'IDAHO': 'ID', 'ILLINOIS': 'IL', 'INDIANA': 'IN', 'IOWA': 'IA',
        'KANSAS': 'KS', 'KENTUCKY': 'KY', 'LOUISIANA': 'LA', 'MAINE': 'ME', 'MARYLAND': 'MD',
        'MASSACHUSETTS': 'MA', 'MICHIGAN': 'MI', 'MINNESOTA': 'MN', 'MISSISSIPPI': 'MS', 'MISSOURI': 'MO',
        'MONTANA': 'MT', 'NEBRASKA': 'NE', 'NEVADA': 'NV', 'NEW HAMPSHIRE': 'NH', 'NEW JERSEY': 'NJ',
        'NEW MEXICO': 'NM', 'NEW YORK': 'NY', 'NORTH CAROLINA': 'NC', 'NORTH DAKOTA': 'ND', 'OHIO': 'OH',
        'OKLAHOMA': 'OK', 'OREGON': 'OR', 'PENNSYLVANIA': 'PA', 'RHODE ISLAND': 'RI', 'SOUTH CAROLINA': 'SC',
        'SOUTH DAKOTA': 'SD', 'TENNESSEE': 'TN', 'TEXAS': 'TX', 'UTAH': 'UT', 'VERMONT': 'VT',
        'VIRGINIA': 'VA', 'WASHINGTON': 'WA', 'WEST VIRGINIA': 'WV', 'WISCONSIN': 'WI', 'WYOMING': 'WY'
      };
      const abbr = stateAbbreviations[stateUpper] || stateUpper;
      if (STATE_COORDS[abbr]) {
        return STATE_COORDS[abbr];
      }
    }
    return null;
  }, [geocodeLookup]);

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

  // Generate map points data
  const mapPointsData = useMemo(() => {
    const points: { coords: [number, number]; count: number; type: 'origin' | 'destination'; label: string }[] = [];
    const aggregated = new Map<string, { coords: [number, number]; origins: number; destinations: number; label: string }>();

    filteredEmails.forEach(email => {
      const pd = email.parsed_data;
      if (!pd) return;

      // Origin
      if (flowDirection !== 'delivery') {
        const originCoords = getCoordinates(pd.origin_city, pd.origin_state, pd.origin_zip);
        if (originCoords) {
          const key = originCoords.join(',');
          const existing = aggregated.get(key) || { 
            coords: originCoords, 
            origins: 0, 
            destinations: 0, 
            label: pd.origin_city ? `${pd.origin_city}, ${pd.origin_state}` : pd.origin_state || 'Unknown'
          };
          existing.origins++;
          aggregated.set(key, existing);
        }
      }

      // Destination
      if (flowDirection !== 'pickup') {
        const destCoords = getCoordinates(pd.destination_city, pd.destination_state, pd.destination_zip);
        if (destCoords) {
          const key = destCoords.join(',');
          const existing = aggregated.get(key) || { 
            coords: destCoords, 
            origins: 0, 
            destinations: 0, 
            label: pd.destination_city ? `${pd.destination_city}, ${pd.destination_state}` : pd.destination_state || 'Unknown'
          };
          existing.destinations++;
          aggregated.set(key, existing);
        }
      }
    });

    return Array.from(aggregated.values());
  }, [filteredEmails, flowDirection, getCoordinates]);

  // Add markers to map
  const addMarkersToMap = useCallback(() => {
    if (!map.current) return;
    
    // Clear existing markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    if (mapPointsData.length === 0) return;

    // Find max count for scaling
    const maxCount = Math.max(...mapPointsData.map(p => p.origins + p.destinations), 1);

    // Add new markers
    mapPointsData.forEach((point) => {
      const total = point.origins + point.destinations;
      const radius = Math.max(20, Math.min(60, (total / maxCount) * 60));
      
      // Create marker element
      const el = document.createElement('div');
      el.style.width = `${radius}px`;
      el.style.height = `${radius}px`;
      el.style.borderRadius = '50%';
      el.style.backgroundColor = flowDirection === 'pickup' 
        ? 'rgba(34, 197, 94, 0.7)' 
        : flowDirection === 'delivery' 
          ? 'rgba(59, 130, 246, 0.7)' 
          : 'rgba(168, 85, 247, 0.7)';
      el.style.border = '3px solid white';
      el.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
      el.style.color = 'white';
      el.style.fontSize = radius > 30 ? '12px' : '10px';
      el.style.fontWeight = 'bold';
      el.style.cursor = 'pointer';
      el.style.textShadow = '0 1px 2px rgba(0,0,0,0.5)';
      el.textContent = total > 99 ? '99+' : String(total);

      const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(`
        <div style="padding: 8px;">
          <strong>${point.label}</strong><br/>
          <span style="color: #22c55e;">Origins: ${point.origins}</span><br/>
          <span style="color: #3b82f6;">Destinations: ${point.destinations}</span><br/>
          <strong>Total: ${total}</strong>
        </div>
      `);

      try {
        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat(point.coords)
          .setPopup(popup)
          .addTo(map.current!);

        markersRef.current.push(marker);
      } catch (err) {
        console.error('Error adding marker:', err, point);
      }
    });
  }, [mapPointsData, flowDirection]);

  // Initialize map when tab is active and token is available
  useEffect(() => {
    if (activeTab !== 'heatmap' || !mapboxToken) return;
    
    // Small delay to ensure container is rendered with dimensions
    const initTimer = setTimeout(() => {
      if (!mapContainer.current) return;

      // Clean up existing map if any
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];

      mapboxgl.accessToken = mapboxToken;
      
      try {
        map.current = new mapboxgl.Map({
          container: mapContainer.current,
          style: 'mapbox://styles/mapbox/light-v11',
          center: [-98.5795, 39.8283], // US center
          zoom: 3.5,
        });

        map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
        
        // Add markers once map loads
        map.current.on('load', () => {
          addMarkersToMap();
        });
      } catch (error) {
        console.error('Error initializing map:', error);
      }
    }, 100);

    return () => {
      clearTimeout(initTimer);
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [activeTab, mapboxToken, addMarkersToMap]);

  // Update markers when data or filter changes
  useEffect(() => {
    if (!map.current || activeTab !== 'heatmap') return;
    
    if (map.current.loaded()) {
      addMarkersToMap();
    }
  }, [mapPointsData, flowDirection, addMarkersToMap]);

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

  // Daily trend
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
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="geographic" className="gap-2">
            <MapIcon className="h-4 w-4" />
            Geographic
          </TabsTrigger>
          <TabsTrigger value="heatmap" className="gap-2">
            <Globe className="h-4 w-4" />
            Heat Map
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
            <Button variant={viewMode === 'state' ? 'default' : 'outline'} size="sm" onClick={() => setViewMode('state')}>
              By State
            </Button>
            <Button variant={viewMode === 'city' ? 'default' : 'outline'} size="sm" onClick={() => setViewMode('city')}>
              By City
            </Button>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Top {viewMode === 'state' ? 'States' : 'Cities'}</CardTitle>
                <CardDescription>Load volume by {flowDirection === 'both' ? 'origins + destinations' : flowDirection === 'pickup' ? 'origins' : 'destinations'}</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={viewMode === 'state' ? stateData.slice(0, 15) : cityData.slice(0, 15)} layout="vertical" margin={{ top: 5, right: 30, left: 60, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis dataKey={viewMode === 'state' ? 'state' : 'city'} type="category" stroke="hsl(var(--muted-foreground))" fontSize={12} width={50} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
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

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Load Density Hotspots</CardTitle>
              <CardDescription>Areas with highest concentration of loads</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {stateData.slice(0, 5).map((state) => (
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

        {/* Heat Map Tab */}
        <TabsContent value="heatmap" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Load Density Heat Map
              </CardTitle>
              <CardDescription>
                Visual representation of load volume across the US. Circle size indicates load concentration.
                <span className="ml-2 text-xs">
                  <span className="inline-block w-3 h-3 rounded-full bg-green-500/60 mr-1"></span>Origins
                  <span className="inline-block w-3 h-3 rounded-full bg-blue-500/60 mx-1 ml-3"></span>Destinations
                  <span className="inline-block w-3 h-3 rounded-full bg-purple-500/60 mx-1 ml-3"></span>Both
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!mapboxToken ? (
                <div className="flex items-center justify-center h-[500px] bg-muted/20 rounded-lg">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div 
                  ref={mapContainer} 
                  className="rounded-lg" 
                  style={{ height: '500px', width: '100%', minHeight: '500px' }} 
                />
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground">Locations on Map</div>
                <div className="text-2xl font-bold">{mapPointsData.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground">Top Origin State</div>
                <div className="text-2xl font-bold">{stateData[0]?.state || 'N/A'}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground">Top Destination State</div>
                <div className="text-2xl font-bold">
                  {stateData.sort((a, b) => b.deliveries - a.deliveries)[0]?.state || 'N/A'}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Time Analysis Tab */}
        <TabsContent value="time" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
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
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

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
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                    <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

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
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                    <Line type="monotone" dataKey="count" stroke="hsl(var(--chart-2))" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

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
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                    <Bar dataKey="count" fill="hsl(var(--chart-3))" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

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
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Load Volume by Vehicle Type</CardTitle>
                <CardDescription>Distribution of loads across vehicle types</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={vehicleTypeDistribution} layout="vertical" margin={{ top: 5, right: 30, left: 100, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis dataKey="name" type="category" stroke="hsl(var(--muted-foreground))" fontSize={11} width={90} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                    <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

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
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

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
