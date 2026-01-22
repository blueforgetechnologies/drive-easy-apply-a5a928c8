import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/contexts/TenantContext";
import { useFeatureGate } from "@/hooks/useFeatureGate";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend } from "recharts";
import { TrendingUp, Calendar, Loader2, Map as MapIcon, BarChart3, Mail, Globe, RefreshCw, Timer, ChevronDown, Check, ShieldAlert } from "lucide-react";
import { format, getDay, getHours, parseISO, subDays, subHours, subMonths, subYears, startOfDay, endOfDay } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { AnalyticsDateFilter } from "@/components/AnalyticsDateFilter";

interface LoadEmailData {
  id: string;
  received_at: string;
  created_at: string;
  email_source: string;
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

// Email source display configuration
const EMAIL_SOURCES = {
  sylectus: { label: 'Sylectus', color: 'bg-blue-500', textColor: 'text-blue-600' },
  fullcircle: { label: 'Full Circle TMS', color: 'bg-purple-500', textColor: 'text-purple-600' },
} as const;

type EmailSourceKey = keyof typeof EMAIL_SOURCES;

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

// Cache for prefetched data by RANGE KEY (not by date) for reliable instant loading
const analyticsCache = new Map<string, { data: LoadEmailData[]; count: number; fetchedAt: Date; start: Date; end: Date }>();

// Date range keys for prefetching
const DATE_RANGE_KEYS = ['24h', '3d', '7d', '30d', '90d', '6m', '1y'] as const;
type DateRangeKey = typeof DATE_RANGE_KEYS[number];

// Stable reference date for cache key consistency across prefetch and clicks
let STABLE_REFERENCE_DATE: Date | null = null;
const getStableReferenceDate = () => {
  if (!STABLE_REFERENCE_DATE) {
    STABLE_REFERENCE_DATE = new Date();
  }
  return STABLE_REFERENCE_DATE;
};

// Get date range for prefetching (matches AnalyticsDateFilter presets EXACTLY)
const getDateRangeFromKey = (key: DateRangeKey): { start: Date; end: Date } => {
  const today = getStableReferenceDate();
  const endOfToday = endOfDay(today);
  
  switch (key) {
    case '24h': return { start: subHours(today, 24), end: today };
    case '3d': return { start: startOfDay(subDays(today, 2)), end: endOfToday };
    case '7d': return { start: startOfDay(subDays(today, 6)), end: endOfToday };
    case '30d': return { start: startOfDay(subDays(today, 29)), end: endOfToday };
    case '90d': return { start: startOfDay(subDays(today, 89)), end: endOfToday };
    case '6m': return { start: startOfDay(subMonths(today, 6)), end: endOfToday };
    case '1y': return { start: startOfDay(subYears(today, 1)), end: endOfToday };
    default: return { start: subHours(today, 24), end: today };
  }
};

// Find which range key matches a given date range
const findMatchingRangeKey = (start: Date, end: Date): DateRangeKey | null => {
  for (const key of DATE_RANGE_KEYS) {
    const range = getDateRangeFromKey(key);
    // Compare with tolerance of 2 minutes
    const startDiff = Math.abs(range.start.getTime() - start.getTime());
    const endDiff = Math.abs(range.end.getTime() - end.getTime());
    if (startDiff < 2 * 60 * 1000 && endDiff < 2 * 60 * 1000) {
      return key;
    }
  }
  return null;
};

export default function LoadAnalyticsTab() {
  const navigate = useNavigate();
  const { isPlatformAdmin, loading: tenantLoading } = useTenantContext();
  
  // Use unified feature gate - tenant enablement + role permission (no per-user grants)
  const analyticsGate = useFeatureGate({ featureKey: "analytics", requiresUserGrant: false });
  const canAccessAnalytics = analyticsGate.isAccessible;
  const accessLoading = analyticsGate.isLoading;
  
  const [loadEmails, setLoadEmails] = useState<LoadEmailData[]>([]);
  const [totalEmailCount, setTotalEmailCount] = useState<number>(0);
  const [geocodeCache, setGeocodeCache] = useState<GeocodeData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState<number>(0);
  const [viewMode, setViewMode] = useState<'state' | 'city'>('state');
  const [selectedVehicleTypes, setSelectedVehicleTypes] = useState<string[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>([]); // Empty = all sources
  const [startDate, setStartDate] = useState<Date>(() => subHours(new Date(), 24));
  const [endDate, setEndDate] = useState<Date>(() => new Date());
  const [flowDirection, setFlowDirection] = useState<'pickup' | 'delivery' | 'both'>('both');
  const [mapboxToken, setMapboxToken] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('geographic');
  const [refreshInterval, setRefreshInterval] = useState(900); // Default 15 min (in seconds)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [clusterRadius, setClusterRadius] = useState(0); // 0 = no clustering, in miles
  const [prefetchStatus, setPrefetchStatus] = useState<Record<DateRangeKey, 'idle' | 'loading' | 'done'>>({
    '24h': 'done', '3d': 'idle', '7d': 'idle', '30d': 'idle', '90d': 'idle', '6m': 'idle', '1y': 'idle'
  });
  const [currentRangeKey, setCurrentRangeKey] = useState<string | null>('24h');
  
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const sourceAddedRef = useRef(false);
  const geoJsonDataRef = useRef<typeof geoJsonData | null>(null);
  const prefetchingRef = useRef(false);

  // Handle date filter change - use cached data instantly if available
  const handleDateChange = useCallback((start: Date, end: Date, rangeKey?: string) => {
    // Hard gate: never process date changes if not authorized
    if (accessLoading || tenantLoading || !canAccessAnalytics) return;
    
    // If a range key is provided and we have cached data, use it immediately
    if (rangeKey && analyticsCache.has(rangeKey)) {
      const cached = analyticsCache.get(rangeKey)!;
      console.log(`Instant load from cache: ${rangeKey}`);
      setLoadEmails(cached.data);
      setTotalEmailCount(cached.count);
      setCurrentRangeKey(rangeKey);
      setStartDate(start);
      setEndDate(end);
      setIsLoading(false);
      return;
    }
    
    // Otherwise, trigger a fresh load
    setCurrentRangeKey(rangeKey || null);
    setStartDate(start);
    setEndDate(end);
  }, [canAccessAnalytics, accessLoading, tenantLoading]);

  // Initial load - only run if fully authorized (not loading, and has access)
  useEffect(() => {
    if (accessLoading || tenantLoading) return;
    if (!canAccessAnalytics) return;
    loadAnalyticsData();
    loadMapboxToken();
    loadGeocodeCache();
  }, [startDate, endDate, canAccessAnalytics, accessLoading, tenantLoading]);

  // Auto-refresh interval - gated by access
  useEffect(() => {
    if (accessLoading || tenantLoading) return;
    if (!canAccessAnalytics) return;
    
    const interval = setInterval(() => {
      refreshData();
    }, refreshInterval * 1000);

    return () => clearInterval(interval);
  }, [refreshInterval, startDate, endDate, canAccessAnalytics, accessLoading, tenantLoading]);

  const refreshData = async () => {
    // Hard gate: never refresh if not authorized
    if (accessLoading || tenantLoading || !canAccessAnalytics) return;
    setIsRefreshing(true);
    await loadAnalyticsData();
    setLastRefresh(new Date());
    setIsRefreshing(false);
  };

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

  // Core data fetching function with progress tracking - fetches ALL data for range
  // Queries both load_emails (active) and load_emails_archive (archived) for complete history
  const fetchDataForRange = async (
    dateStart: Date, 
    dateEnd: Date, 
    onProgress?: (progress: number) => void
  ): Promise<{ data: LoadEmailData[]; count: number }> => {
    const pageSize = 3000;
    const dateFilter = dateStart.toISOString();
    const endFilter = dateEnd.toISOString();

    // Get total count from both tables for the date range
    const [activeCountResult, archiveCountResult] = await Promise.all([
      supabase
        .from("load_emails")
        .select("id", { count: 'exact', head: true })
        .gte("received_at", dateFilter)
        .lte("received_at", endFilter),
      supabase
        .from("load_emails_archive")
        .select("id", { count: 'exact', head: true })
        .gte("received_at", dateFilter)
        .lte("received_at", endFilter)
    ]);

    if (activeCountResult.error) throw activeCountResult.error;
    // Archive table may not have data yet, don't throw error
    
    const activeCount = activeCountResult.count || 0;
    const archiveCount = archiveCountResult.count || 0;
    const totalCount = activeCount + archiveCount;
    
    console.log(`fetchDataForRange: fetching ${activeCount} active + ${archiveCount} archived = ${totalCount} total for range ${dateFilter} to ${endFilter}`);
    
    if (totalCount === 0) {
      return { data: [], count: 0 };
    }

    // Fetch from both tables in parallel
    const allData: any[] = [];
    const batchSize = 3;
    
    // Helper to fetch paginated data from a table
    // Archive table has original_created_at instead of created_at
    const fetchFromTable = async (tableName: 'load_emails' | 'load_emails_archive', recordCount: number) => {
      const numPages = Math.ceil(recordCount / pageSize);
      const tableData: any[] = [];
      
      // Different select columns for each table
      const selectColumns = tableName === 'load_emails' 
        ? "id, received_at, created_at, parsed_data, email_source"
        : "id, received_at, original_created_at, parsed_data, email_source";
      
      for (let i = 0; i < numPages; i += batchSize) {
        const batchQueries = Array.from(
          { length: Math.min(batchSize, numPages - i) }, 
          (_, j) => {
            const page = i + j;
            return supabase
              .from(tableName)
              .select(selectColumns)
              .order("received_at", { ascending: false })
              .range(page * pageSize, (page + 1) * pageSize - 1)
              .gte("received_at", dateFilter)
              .lte("received_at", endFilter);
          }
        );

        const results = await Promise.all(batchQueries);
        
        for (const result of results) {
          if (result.error) throw result.error;
          if (result.data) {
            // Normalize archive data to have created_at field
            if (tableName === 'load_emails_archive') {
              result.data.forEach((item: any) => {
                item.created_at = item.original_created_at;
                delete item.original_created_at;
              });
            }
            tableData.push(...result.data);
          }
        }
      }
      
      return tableData;
    };

    // Fetch from both tables in parallel
    const [activeData, archiveData] = await Promise.all([
      activeCount > 0 ? fetchFromTable('load_emails', activeCount) : Promise.resolve([]),
      archiveCount > 0 ? fetchFromTable('load_emails_archive', archiveCount) : Promise.resolve([])
    ]);
    
    allData.push(...activeData, ...archiveData);
    
    if (onProgress) {
      onProgress(100);
    }

    // Sort combined data by received_at descending
    allData.sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime());

    const typedData = allData.map(item => ({
      ...item,
      email_source: item.email_source || 'sylectus',
      parsed_data: item.parsed_data as LoadEmailData['parsed_data']
    }));
    
    return { data: typedData, count: totalCount };
  };

  // Get cached data by finding matching range key
  const getCachedData = useCallback((start: Date, end: Date) => {
    // Find if this matches a known range key
    const rangeKey = findMatchingRangeKey(start, end);
    
    if (rangeKey) {
      const cached = analyticsCache.get(rangeKey);
      if (cached) {
        const cacheAge = Date.now() - cached.fetchedAt.getTime();
        // Valid for 5 minutes
        if (cacheAge < 5 * 60 * 1000) {
          console.log(`Using cached data for ${rangeKey}`);
          return cached;
        }
      }
    }
    
    // Try custom range lookup by date key
    const normalizeDate = (d: Date) => {
      const normalized = new Date(d);
      normalized.setSeconds(0, 0);
      return normalized.toISOString();
    };
    const customKey = `custom_${normalizeDate(start)}_${normalizeDate(end)}`;
    const customCached = analyticsCache.get(customKey);
    if (customCached) {
      const cacheAge = Date.now() - customCached.fetchedAt.getTime();
      if (cacheAge < 5 * 60 * 1000) {
        return customCached;
      }
    }
    
    return null;
  }, []);

  // Main load function - uses cache or fetches (gated by access)
  const loadAnalyticsData = async () => {
    // Hard gate: never load data if not authorized
    if (accessLoading || tenantLoading || !canAccessAnalytics) return;
    
    // Check cache first
    const cached = getCachedData(startDate, endDate);
    if (cached) {
      setLoadEmails(cached.data);
      setTotalEmailCount(cached.count);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setLoadingProgress(0);
    
    try {
      const { data, count } = await fetchDataForRange(startDate, endDate, (progress) => {
        setLoadingProgress(progress);
      });
      
      // Cache the result - use range key if matches, otherwise custom key
      const rangeKey = findMatchingRangeKey(startDate, endDate);
      if (rangeKey) {
        analyticsCache.set(rangeKey, { data, count, fetchedAt: new Date(), start: startDate, end: endDate });
      } else {
        const normalizeDate = (d: Date) => {
          const normalized = new Date(d);
          normalized.setSeconds(0, 0);
          return normalized.toISOString();
        };
        const customKey = `custom_${normalizeDate(startDate)}_${normalizeDate(endDate)}`;
        analyticsCache.set(customKey, { data, count, fetchedAt: new Date(), start: startDate, end: endDate });
      }
      
      setLoadEmails(data);
      setTotalEmailCount(count);
      console.log('loadAnalyticsData: fetched', data.length, 'emails');
    } catch (error) {
      console.error("Error loading analytics:", error);
    } finally {
      setIsLoading(false);
      setLoadingProgress(0);
    }
  };

  // Background prefetch for larger date ranges - sequential to show progressive loading
  const prefetchDateRanges = useCallback(async () => {
    // Hard gate: never prefetch if not authorized
    if (accessLoading || tenantLoading || !canAccessAnalytics) return;
    if (prefetchingRef.current) return;
    prefetchingRef.current = true;
    
    const rangesToPrefetch: DateRangeKey[] = ['3d', '7d', '30d', '90d', '6m', '1y'];
    
    for (const rangeKey of rangesToPrefetch) {
      // Skip if already cached
      if (analyticsCache.has(rangeKey)) {
        setPrefetchStatus(prev => ({ ...prev, [rangeKey]: 'done' }));
        continue;
      }
      
      try {
        setPrefetchStatus(prev => ({ ...prev, [rangeKey]: 'loading' }));
        console.log(`Prefetching ${rangeKey}...`);
        
        const { start, end } = getDateRangeFromKey(rangeKey);
        const { data, count } = await fetchDataForRange(start, end);
        analyticsCache.set(rangeKey, { data, count, fetchedAt: new Date(), start, end });
        
        setPrefetchStatus(prev => ({ ...prev, [rangeKey]: 'done' }));
        console.log(`Prefetched ${rangeKey}: ${data.length} records`);
      } catch (error) {
        console.error(`Error prefetching ${rangeKey}:`, error);
        setPrefetchStatus(prev => ({ ...prev, [rangeKey]: 'idle' }));
      }
    }
    
    prefetchingRef.current = false;
  }, []);

  // Start prefetching after initial load - gated by access
  useEffect(() => {
    if (accessLoading || tenantLoading) return;
    if (!canAccessAnalytics) return;
    if (!isLoading && loadEmails.length > 0) {
      // Start prefetching after 2 seconds
      const timer = setTimeout(() => {
        prefetchDateRanges();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isLoading, loadEmails.length, prefetchDateRanges, canAccessAnalytics, accessLoading, tenantLoading]);

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

  // Get unique email sources
  const emailSources = useMemo(() => {
    const sources = new Set<string>();
    loadEmails.forEach(email => {
      if (email.email_source) sources.add(email.email_source);
    });
    return Array.from(sources).sort();
  }, [loadEmails]);

  // Source breakdown stats
  const sourceStats = useMemo(() => {
    const stats: Record<string, number> = {};
    loadEmails.forEach(email => {
      const source = email.email_source || 'sylectus';
      stats[source] = (stats[source] || 0) + 1;
    });
    return stats;
  }, [loadEmails]);

  // Filter by vehicle types and sources (multi-select)
  const filteredEmails = useMemo(() => {
    let result = loadEmails;
    
    // Filter by source
    if (selectedSources.length > 0) {
      result = result.filter(email => selectedSources.includes(email.email_source || 'sylectus'));
    }
    
    // Filter by vehicle type
    if (selectedVehicleTypes.length > 0) {
      result = result.filter(email => email.parsed_data?.vehicle_type && selectedVehicleTypes.includes(email.parsed_data.vehicle_type));
    }
    
    console.log('filteredEmails recalculated:', result.length, 'from', loadEmails.length, 'total');
    return result;
  }, [loadEmails, selectedVehicleTypes, selectedSources]);

  // Haversine distance calculation (returns miles)
  const haversineDistance = useCallback((coord1: [number, number], coord2: [number, number]): number => {
    const R = 3959; // Earth's radius in miles
    const lat1 = coord1[1] * Math.PI / 180;
    const lat2 = coord2[1] * Math.PI / 180;
    const dLat = (coord2[1] - coord1[1]) * Math.PI / 180;
    const dLon = (coord2[0] - coord1[0]) * Math.PI / 180;

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1) * Math.cos(lat2) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }, []);

  // Generate map points data with optional clustering
  const mapPointsData = useMemo(() => {
    const rawPoints: { coords: [number, number]; origins: number; destinations: number; label: string }[] = [];

    // First pass: collect all points
    filteredEmails.forEach(email => {
      const pd = email.parsed_data;
      if (!pd) return;

      // Origin
      if (flowDirection !== 'delivery') {
        const originCoords = getCoordinates(pd.origin_city, pd.origin_state, pd.origin_zip);
        if (originCoords) {
          const label = pd.origin_city ? `${pd.origin_city}, ${pd.origin_state}` : pd.origin_state || 'Unknown';
          rawPoints.push({ coords: originCoords, origins: 1, destinations: 0, label });
        }
      }

      // Destination
      if (flowDirection !== 'pickup') {
        const destCoords = getCoordinates(pd.destination_city, pd.destination_state, pd.destination_zip);
        if (destCoords) {
          const label = pd.destination_city ? `${pd.destination_city}, ${pd.destination_state}` : pd.destination_state || 'Unknown';
          rawPoints.push({ coords: destCoords, origins: 0, destinations: 1, label });
        }
      }
    });

    // If no clustering, aggregate by exact coordinates
    if (clusterRadius === 0) {
      const aggregated = new Map<string, { coords: [number, number]; origins: number; destinations: number; label: string }>();
      rawPoints.forEach(point => {
        const key = point.coords.join(',');
        const existing = aggregated.get(key);
        if (existing) {
          existing.origins += point.origins;
          existing.destinations += point.destinations;
        } else {
          aggregated.set(key, { ...point });
        }
      });
      return Array.from(aggregated.values());
    }

    // Cluster points within radius
    const clusters: { coords: [number, number]; origins: number; destinations: number; labels: Set<string> }[] = [];

    rawPoints.forEach(point => {
      let addedToCluster = false;
      
      for (const cluster of clusters) {
        const distance = haversineDistance(point.coords, cluster.coords);
        if (distance <= clusterRadius) {
          // Add to existing cluster, recalculate center as weighted average
          const totalBefore = cluster.origins + cluster.destinations;
          const totalNew = point.origins + point.destinations;
          const totalWeight = totalBefore + totalNew;
          
          cluster.coords = [
            (cluster.coords[0] * totalBefore + point.coords[0] * totalNew) / totalWeight,
            (cluster.coords[1] * totalBefore + point.coords[1] * totalNew) / totalWeight
          ];
          cluster.origins += point.origins;
          cluster.destinations += point.destinations;
          cluster.labels.add(point.label);
          addedToCluster = true;
          break;
        }
      }

      if (!addedToCluster) {
        clusters.push({
          coords: point.coords,
          origins: point.origins,
          destinations: point.destinations,
          labels: new Set([point.label])
        });
      }
    });

    console.log('mapPointsData recalculated:', clusters.length, 'points from', filteredEmails.length, 'emails');
    return clusters.map(c => ({
      coords: c.coords,
      origins: c.origins,
      destinations: c.destinations,
      label: c.labels.size <= 3 ? Array.from(c.labels).join(', ') : `${c.labels.size} locations`
    }));
  }, [filteredEmails, flowDirection, getCoordinates, clusterRadius, haversineDistance]);

  // Generate GeoJSON for clustering
  const geoJsonData = useMemo(() => {
    const features = mapPointsData.map((point, idx) => ({
      type: 'Feature' as const,
      properties: {
        id: idx,
        origins: point.origins,
        destinations: point.destinations,
        total: point.origins + point.destinations,
        label: point.label,
      },
      geometry: {
        type: 'Point' as const,
        coordinates: point.coords,
      },
    }));
    return {
      type: 'FeatureCollection' as const,
      features,
    };
  }, [mapPointsData]);

  const updateMapSource = useCallback((data: typeof geoJsonData) => {
    if (!map.current) {
      console.log('updateMapSource: no map');
      return;
    }
    if (!sourceAddedRef.current) {
      console.log('updateMapSource: source not added yet');
      return;
    }
    if (!map.current.isStyleLoaded()) {
      console.log('updateMapSource: style not loaded, scheduling retry');
      map.current.once('idle', () => updateMapSource(data));
      return;
    }
    
    try {
      const source = map.current.getSource('load-points') as mapboxgl.GeoJSONSource;
      if (source) {
        console.log('updateMapSource: updating with', data.features.length, 'features');
        source.setData(data as GeoJSON.FeatureCollection);
        map.current.triggerRepaint();
      } else {
        console.log('updateMapSource: source not found');
      }
    } catch (e) {
      console.log('Map source update error:', e);
    }
  }, []);

  // Keep ref in sync for use in map load handler and trigger update
  useEffect(() => {
    geoJsonDataRef.current = geoJsonData;
    // Also trigger update if map is already ready
    if (mapReady && sourceAddedRef.current) {
      updateMapSource(geoJsonData);
    }
  }, [geoJsonData, mapReady, updateMapSource]);

  // Initialize map when tab is active, token is available, and data has loaded
  useEffect(() => {
    if (activeTab !== 'heatmap' || !mapboxToken || isLoading) return;
    
    setMapReady(false);
    sourceAddedRef.current = false;
    
    // Small delay to ensure container is rendered with dimensions
    const initTimer = setTimeout(() => {
      if (!mapContainer.current) return;

      // Clean up existing map if any
      if (map.current) {
        map.current.remove();
        map.current = null;
      }

      mapboxgl.accessToken = mapboxToken;
      
      try {
        map.current = new mapboxgl.Map({
          container: mapContainer.current,
          style: 'mapbox://styles/mapbox/standard',
          center: [-98.5795, 39.8283], // US center
          zoom: 3.5,
          pitch: 0,
          bearing: 0,
          projection: 'mercator',
        });

        map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
        
        // Add clustering source and layers once map loads
        map.current.on('load', () => {
          if (!map.current) return;
          
          // Add clustered GeoJSON source with current data from ref
          const initialData = geoJsonDataRef.current || { type: 'FeatureCollection', features: [] };
          map.current.addSource('load-points', {
            type: 'geojson',
            data: initialData as GeoJSON.FeatureCollection,
            cluster: true,
            clusterMaxZoom: 14,
            clusterRadius: 50,
            clusterProperties: {
              sum_total: ['+', ['get', 'total']],
              sum_origins: ['+', ['get', 'origins']],
              sum_destinations: ['+', ['get', 'destinations']],
            },
          });

          // Cluster circles
          const clusterColor = flowDirection === 'pickup' 
            ? 'rgba(34, 197, 94, 0.8)' 
            : flowDirection === 'delivery' 
              ? 'rgba(59, 130, 246, 0.8)' 
              : 'rgba(168, 85, 247, 0.8)';

          map.current.addLayer({
            id: 'clusters',
            type: 'circle',
            source: 'load-points',
            filter: ['has', 'point_count'],
            paint: {
              'circle-color': clusterColor,
              'circle-radius': [
                'step',
                ['get', 'sum_total'],
                20,    // default radius
                100, 30,
                500, 40,
                1000, 50,
                5000, 60
              ],
              'circle-stroke-width': 3,
              'circle-stroke-color': '#fff',
            },
          });

          // Cluster count labels
          map.current.addLayer({
            id: 'cluster-count',
            type: 'symbol',
            source: 'load-points',
            filter: ['has', 'point_count'],
            layout: {
              'text-field': ['get', 'sum_total'],
              'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
              'text-size': 12,
            },
            paint: {
              'text-color': '#ffffff',
            },
          });

          // Unclustered points
          map.current.addLayer({
            id: 'unclustered-point',
            type: 'circle',
            source: 'load-points',
            filter: ['!', ['has', 'point_count']],
            paint: {
              'circle-color': clusterColor,
              'circle-radius': [
                'interpolate', ['linear'], ['get', 'total'],
                1, 15,
                50, 25,
                200, 35
              ],
              'circle-stroke-width': 2,
              'circle-stroke-color': '#fff',
            },
          });

          // Unclustered point labels
          map.current.addLayer({
            id: 'unclustered-count',
            type: 'symbol',
            source: 'load-points',
            filter: ['!', ['has', 'point_count']],
            layout: {
              'text-field': ['get', 'total'],
              'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
              'text-size': 11,
            },
            paint: {
              'text-color': '#ffffff',
            },
          });

          sourceAddedRef.current = true;

          // Click to zoom into cluster
          map.current.on('click', 'clusters', (e) => {
            if (!map.current) return;
            const features = map.current.queryRenderedFeatures(e.point, { layers: ['clusters'] });
            if (!features.length) return;
            const clusterId = features[0].properties?.cluster_id;
            const source = map.current.getSource('load-points') as mapboxgl.GeoJSONSource;
            source.getClusterExpansionZoom(clusterId, (err, zoom) => {
              if (err || !map.current) return;
              const geometry = features[0].geometry as GeoJSON.Point;
              map.current.easeTo({
                center: geometry.coordinates as [number, number],
                zoom: zoom || 10,
              });
            });
          });

          // Popup for unclustered points
          map.current.on('click', 'unclustered-point', (e) => {
            if (!map.current || !e.features?.length) return;
            const props = e.features[0].properties;
            const geometry = e.features[0].geometry as GeoJSON.Point;
            new mapboxgl.Popup()
              .setLngLat(geometry.coordinates as [number, number])
              .setHTML(`
                <div style="padding: 8px;">
                  <strong>${props?.label || 'Location'}</strong><br/>
                  <span style="color: #22c55e;">Origins: ${props?.origins || 0}</span><br/>
                  <span style="color: #3b82f6;">Destinations: ${props?.destinations || 0}</span><br/>
                  <strong>Total: ${props?.total || 0}</strong>
                </div>
              `)
              .addTo(map.current);
          });

          // Cursor changes
          map.current.on('mouseenter', 'clusters', () => {
            if (map.current) map.current.getCanvas().style.cursor = 'pointer';
          });
          map.current.on('mouseleave', 'clusters', () => {
            if (map.current) map.current.getCanvas().style.cursor = '';
          });
          map.current.on('mouseenter', 'unclustered-point', () => {
            if (map.current) map.current.getCanvas().style.cursor = 'pointer';
          });
          map.current.on('mouseleave', 'unclustered-point', () => {
            if (map.current) map.current.getCanvas().style.cursor = '';
          });

          setMapReady(true);
        });
      } catch (error) {
        console.error('Error initializing map:', error);
      }
    }, 100);

    return () => {
      clearTimeout(initTimer);
      sourceAddedRef.current = false;
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [activeTab, mapboxToken, flowDirection, isLoading]);

  // Update source data when data changes and map is ready
  useEffect(() => {
    if (activeTab !== 'heatmap' || !mapReady || !sourceAddedRef.current) return;
    
    // Small delay to ensure geoJsonData is updated
    const timer = setTimeout(() => {
      updateMapSource(geoJsonData);
    }, 50);
    
    return () => clearTimeout(timer);
  }, [geoJsonData, activeTab, mapReady, updateMapSource, filteredEmails.length]);

  // Force map to properly render when loading finishes or tab becomes active
  useEffect(() => {
    if (activeTab !== 'heatmap') return;
    if (!map.current) return;
    
    const forceRender = () => {
      if (!map.current) return;
      
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        if (!map.current) return;
        map.current.resize();
        
        // Wait for map to be idle, then update source
        if (map.current.isStyleLoaded()) {
          updateMapSource(geoJsonData);
          map.current.triggerRepaint();
        } else {
          map.current.once('idle', () => {
            updateMapSource(geoJsonData);
            map.current?.triggerRepaint();
          });
        }
      });
    };

    // Run immediately and also after a delay for good measure
    forceRender();
    const timer = setTimeout(forceRender, 200);
    
    return () => clearTimeout(timer);
  }, [isLoading, activeTab, mapReady, geoJsonData, updateMapSource]);

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

  // Day of week analysis - use ALL loaded emails in Eastern Time
  const dayOfWeekData = useMemo((): TimeData[] => {
    const dayCounts = new Map<number, number>();
    DAYS_OF_WEEK.forEach((_, i) => dayCounts.set(i, 0));
    const EASTERN_TZ = 'America/New_York';

    loadEmails.forEach(email => {
      try {
        const utcDate = parseISO(email.received_at);
        const easternDate = toZonedTime(utcDate, EASTERN_TZ);
        const day = getDay(easternDate);
        dayCounts.set(day, (dayCounts.get(day) || 0) + 1);
      } catch {}
    });

    return DAYS_OF_WEEK.map((label, i) => ({
      label,
      count: dayCounts.get(i) || 0
    }));
  }, [loadEmails]);

  // Hour of day analysis - use ALL loaded emails in Eastern Time
  const hourOfDayData = useMemo((): TimeData[] => {
    const hourCounts = new Map<number, number>();
    HOURS.forEach(h => hourCounts.set(h, 0));
    const EASTERN_TZ = 'America/New_York';

    loadEmails.forEach(email => {
      try {
        const utcDate = parseISO(email.received_at);
        const easternDate = toZonedTime(utcDate, EASTERN_TZ);
        const hour = getHours(easternDate);
        hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
      } catch {}
    });

    return HOURS.map(hour => ({
      label: `${hour}:00`,
      count: hourCounts.get(hour) || 0
    }));
  }, [loadEmails]);

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
    // Use totalEmailCount from the database count query (accurate for date range)
    // Fall back to filteredEmails.length for analytics calculations
    const totalEmails = totalEmailCount || filteredEmails.length;
    const totalPostedAmount = filteredEmails.reduce((sum, e) => sum + (e.parsed_data?.posted_amount || 0), 0);
    const avgPostedAmount = filteredEmails.length > 0 ? totalPostedAmount / filteredEmails.length : 0;
    const uniqueStates = new Set([
      ...filteredEmails.map(e => e.parsed_data?.origin_state).filter(Boolean),
      ...filteredEmails.map(e => e.parsed_data?.destination_state).filter(Boolean)
    ]).size;

    return { totalEmails, totalPostedAmount, avgPostedAmount, uniqueStates };
  }, [filteredEmails, totalEmailCount]);

  // Busiest days identification
  const busiestInfo = useMemo(() => {
    const busiestDay = dayOfWeekData.reduce((max, d) => d.count > max.count ? d : max, dayOfWeekData[0]);
    const busiestHour = hourOfDayData.reduce((max, h) => h.count > max.count ? h : max, hourOfDayData[0]);
    return { busiestDay: busiestDay.label, busiestHour: busiestHour.label };
  }, [dayOfWeekData, hourOfDayData]);

  // Authorization check - after all hooks have been called
  if (accessLoading || tenantLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground">Checking access...</p>
      </div>
    );
  }

  // Show access denied if not authorized
  if (!canAccessAnalytics) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <ShieldAlert className="h-16 w-16 text-destructive" />
        <h2 className="text-2xl font-bold">Access Denied</h2>
        <p className="text-muted-foreground text-center max-w-md">
          You don't have permission to access Analytics. Contact your administrator to request access.
        </p>
        <Button onClick={() => navigate("/dashboard/loads")}>Go to Loads</Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <div className="flex flex-col items-center gap-2 w-full max-w-xs">
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden border">
            <div 
              className="h-full bg-primary transition-all duration-300 ease-out"
              style={{ width: `${loadingProgress}%` }}
            />
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">
              {loadingProgress === 0 ? 'Connecting...' : 'Loading 24h data'}
            </span>
            <span className="font-mono font-medium text-primary">{loadingProgress}%</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 md:p-4 space-y-3">
      {/* Header with Source Breakdown */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold">Load Email Analytics</h1>
          <Badge variant="secondary" className="text-xs">{stats.totalEmails.toLocaleString()} emails</Badge>
        </div>
        
        {/* Source Breakdown Badges */}
        {Object.keys(sourceStats).length > 0 && (
          <div className="flex items-center gap-1.5">
            {Object.entries(sourceStats).map(([source, count]) => {
              const config = EMAIL_SOURCES[source as EmailSourceKey] || { label: source, color: 'bg-gray-500', textColor: 'text-gray-600' };
              return (
                <div key={source} className="flex items-center gap-1 px-2 py-1 rounded-md bg-muted/50 border">
                  <div className={`w-2 h-2 rounded-full ${config.color}`} />
                  <span className={`text-xs font-medium ${config.textColor}`}>{config.label}</span>
                  <span className="text-xs text-muted-foreground">{count.toLocaleString()}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Filters Row */}
      <div className="flex flex-wrap items-center gap-2">
        <AnalyticsDateFilter
          startDate={startDate}
          endDate={endDate}
          onDateChange={handleDateChange}
          prefetchStatus={prefetchStatus}
        />

        {/* Source Filter */}
        {emailSources.length > 1 && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-7 text-xs gap-1 px-2">
                {selectedSources.length === 0 ? 'All Sources' : 
                 selectedSources.length === 1 ? (EMAIL_SOURCES[selectedSources[0] as EmailSourceKey]?.label || selectedSources[0]) :
                 `${selectedSources.length} sources`}
                <ChevronDown className="h-3 w-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2" align="start">
              <div className="flex flex-col gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-start text-xs h-7"
                  onClick={() => setSelectedSources([])}
                >
                  <Check className={`h-3 w-3 mr-2 ${selectedSources.length === 0 ? 'opacity-100' : 'opacity-0'}`} />
                  All Sources
                </Button>
                {emailSources.map(source => {
                  const config = EMAIL_SOURCES[source as EmailSourceKey] || { label: source, color: 'bg-gray-500', textColor: 'text-gray-600' };
                  return (
                    <Button
                      key={source}
                      variant="ghost"
                      size="sm"
                      className="justify-start text-xs h-7"
                      onClick={() => {
                        setSelectedSources(prev => 
                          prev.includes(source) 
                            ? prev.filter(s => s !== source) 
                            : [...prev, source]
                        );
                      }}
                    >
                      <Check className={`h-3 w-3 mr-2 ${selectedSources.includes(source) ? 'opacity-100' : 'opacity-0'}`} />
                      <div className={`w-2 h-2 rounded-full ${config.color} mr-1.5`} />
                      {config.label}
                    </Button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        )}

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="h-7 text-xs gap-1 px-2">
              {selectedVehicleTypes.length === 0 ? 'All Types' : 
               selectedVehicleTypes.length === 1 ? selectedVehicleTypes[0] :
               `${selectedVehicleTypes.length} types`}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2 max-h-64 overflow-y-auto" align="start">
            <div className="flex flex-col gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="justify-start text-xs h-7"
                onClick={() => setSelectedVehicleTypes([])}
              >
                <Check className={`h-3 w-3 mr-2 ${selectedVehicleTypes.length === 0 ? 'opacity-100' : 'opacity-0'}`} />
                All Types
              </Button>
              {vehicleTypes.map(type => (
                <Button
                  key={type}
                  variant="ghost"
                  size="sm"
                  className="justify-start text-xs h-7"
                  onClick={() => {
                    setSelectedVehicleTypes(prev => 
                      prev.includes(type) 
                        ? prev.filter(t => t !== type) 
                        : [...prev, type]
                    );
                  }}
                >
                  <Check className={`h-3 w-3 mr-2 ${selectedVehicleTypes.includes(type) ? 'opacity-100' : 'opacity-0'}`} />
                  {type}
                </Button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <Select value={flowDirection} onValueChange={(v: any) => setFlowDirection(v)}>
          <SelectTrigger className="w-[100px] h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="both">All Stops</SelectItem>
            <SelectItem value="pickup">Origins</SelectItem>
            <SelectItem value="delivery">Destinations</SelectItem>
          </SelectContent>
        </Select>

        {/* Prefetch status indicator - only show while prefetching */}
        {(['3d', '7d', '30d', '90d'] as DateRangeKey[]).some(key => prefetchStatus[key] === 'loading') && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded-md border">
            <Loader2 className="h-3 w-3 animate-spin text-primary" />
            <span>Prefetching:</span>
            <div className="flex items-center gap-1">
              {(['3d', '7d', '30d', '90d'] as DateRangeKey[]).map(key => (
                <span 
                  key={key} 
                  className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    prefetchStatus[key] === 'done' 
                      ? 'bg-green-500/20 text-green-600' 
                      : prefetchStatus[key] === 'loading' 
                        ? 'bg-primary/20 text-primary animate-pulse' 
                        : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {key}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-2">
        <TabsList className="h-8">
          <TabsTrigger value="geographic" className="gap-1.5 text-xs h-7 px-2">
            <MapIcon className="h-3.5 w-3.5" />
            Geographic
          </TabsTrigger>
          <TabsTrigger value="heatmap" className="gap-1.5 text-xs h-7 px-2">
            <Globe className="h-3.5 w-3.5" />
            Heat Map
          </TabsTrigger>
          <TabsTrigger value="time" className="gap-1.5 text-xs h-7 px-2">
            <Calendar className="h-3.5 w-3.5" />
            Time
          </TabsTrigger>
          <TabsTrigger value="vehicle" className="gap-1.5 text-xs h-7 px-2">
            <BarChart3 className="h-3.5 w-3.5" />
            Vehicles
          </TabsTrigger>
        </TabsList>

        {/* Geographic Tab */}
        <TabsContent value="geographic" className="space-y-3">
          <div className="flex items-center gap-1.5">
            <Button variant={viewMode === 'state' ? 'default' : 'outline'} size="sm" className="h-7 text-xs" onClick={() => setViewMode('state')}>
              By State
            </Button>
            <Button variant={viewMode === 'city' ? 'default' : 'outline'} size="sm" className="h-7 text-xs" onClick={() => setViewMode('city')}>
              By City
            </Button>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Card>
              <CardHeader className="p-3 pb-1">
                <CardTitle className="text-sm">Top {viewMode === 'state' ? 'States' : 'Cities'}</CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={viewMode === 'state' ? stateData.slice(0, 12) : cityData.slice(0, 12)} layout="vertical" margin={{ top: 5, right: 20, left: 40, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                    <YAxis dataKey={viewMode === 'state' ? 'state' : 'city'} type="category" stroke="hsl(var(--muted-foreground))" fontSize={10} width={35} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '6px', fontSize: '11px' }} />
                    {flowDirection === 'both' ? (
                      <>
                        <Bar dataKey="pickups" stackId="a" fill="hsl(var(--chart-1))" name="Origins" />
                        <Bar dataKey="deliveries" stackId="a" fill="hsl(var(--chart-2))" name="Destinations" />
                      </>
                    ) : (
                      <Bar dataKey={flowDirection === 'pickup' ? 'pickups' : 'deliveries'} fill="hsl(var(--primary))" />
                    )}
                    <Legend wrapperStyle={{ fontSize: '10px' }} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="p-3 pb-1">
                <CardTitle className="text-sm">All Locations</CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <div className="max-h-[300px] overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-background">
                      <tr className="border-b">
                        <th className="text-left p-1.5 font-medium">{viewMode === 'state' ? 'State' : 'City'}</th>
                        <th className="text-right p-1.5 font-medium">Orig</th>
                        <th className="text-right p-1.5 font-medium">Dest</th>
                        <th className="text-right p-1.5 font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(viewMode === 'state' ? stateData : cityData).map((item, i) => (
                        <tr key={i} className="border-b hover:bg-muted/50">
                          <td className="p-1.5">{viewMode === 'state' ? item.state : `${(item as CityData).city}, ${(item as CityData).state}`}</td>
                          <td className="text-right p-1.5">{item.pickups}</td>
                          <td className="text-right p-1.5">{item.deliveries}</td>
                          <td className="text-right p-1.5 font-medium">{item.total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-sm">Load Density Hotspots</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="grid grid-cols-5 gap-2">
                {stateData.slice(0, 5).map((state) => (
                  <div key={state.state} className="p-2 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 border">
                    <div className="text-xl font-bold">{state.state}</div>
                    <div className="text-xs text-muted-foreground">{state.total.toLocaleString()} loads</div>
                    <div className="mt-1 flex gap-1 text-[10px] flex-wrap">
                      <Badge variant="outline" className="bg-chart-1/10 text-[10px] px-1 py-0">{state.pickups}</Badge>
                      <Badge variant="outline" className="bg-chart-2/10 text-[10px] px-1 py-0">{state.deliveries}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Heat Map Tab */}
        <TabsContent value="heatmap" className="space-y-2">
          <Card>
            <CardHeader className="p-3 pb-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  <span className="text-sm font-medium">Load Density Heat Map</span>
                  <Badge variant="outline" className="text-[10px]">
                    {stats.totalEmails.toLocaleString()} loads
                  </Badge>
                  <div className="flex items-center gap-1 bg-muted/50 border rounded px-2 py-0.5">
                    <span className="text-[10px] text-muted-foreground">Refresh:</span>
                    <Select value={refreshInterval.toString()} onValueChange={(v) => setRefreshInterval(parseInt(v))}>
                      <SelectTrigger className="h-5 w-[55px] text-[11px] px-1.5 border-0 bg-transparent font-medium">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-background border z-50">
                        {Array.from({ length: 30 }, (_, i) => (i + 1) * 60).map(val => (
                          <SelectItem key={val} value={val.toString()} className="text-xs">
                            {val / 60} min
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={refreshData}
                    disabled={isRefreshing}
                    className="h-6 w-6"
                  >
                    <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                  </Button>
                  <span className="text-[10px] text-muted-foreground">
                    {format(lastRefresh, 'h:mm a')}
                  </span>
                </div>
                {/* Flow Direction Filter with Legend */}
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 border rounded px-2 py-1">
                    <button
                      onClick={() => setFlowDirection('pickup')}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                        flowDirection === 'pickup' 
                          ? 'bg-green-500/20 text-green-600' 
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      Origins
                    </button>
                    <button
                      onClick={() => setFlowDirection('delivery')}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                        flowDirection === 'delivery' 
                          ? 'bg-blue-500/20 text-blue-600' 
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                      Destinations
                    </button>
                    <button
                      onClick={() => setFlowDirection('both')}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                        flowDirection === 'both' 
                          ? 'bg-purple-500/20 text-purple-600' 
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <div className="w-2 h-2 rounded-full bg-purple-500" />
                      Both
                    </button>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="flex gap-3">
                {/* Stats sidebar */}
                <div className="flex flex-col gap-1.5 w-28 shrink-0">
                  <div className="bg-muted/30 border rounded px-2 py-1.5">
                    <div className="text-[9px] text-muted-foreground uppercase tracking-wide">Total Emails</div>
                    <div className="text-base font-bold">{stats.totalEmails.toLocaleString()}</div>
                  </div>
                  <div className="bg-muted/30 border rounded px-2 py-1.5">
                    <div className="text-[9px] text-muted-foreground uppercase tracking-wide">Avg Amount</div>
                    <div className="text-base font-bold">${Math.round(stats.avgPostedAmount).toLocaleString()}</div>
                  </div>
                  <div className="bg-muted/30 border rounded px-2 py-1.5">
                    <div className="text-[9px] text-muted-foreground uppercase tracking-wide">States</div>
                    <div className="text-base font-bold">{stats.uniqueStates}</div>
                  </div>
                  <div className="bg-muted/30 border rounded px-2 py-1.5">
                    <div className="text-[9px] text-muted-foreground uppercase tracking-wide">
                      Busiest Day
                      {loadEmails.length < totalEmailCount && (
                        <span className="text-orange-500 ml-1" title={`Based on ${loadEmails.length.toLocaleString()} of ${totalEmailCount.toLocaleString()} emails`}>*</span>
                      )}
                    </div>
                    <div className="text-base font-bold">{busiestInfo.busiestDay || 'N/A'}</div>
                  </div>
                  <div className="bg-muted/30 border rounded px-2 py-1.5">
                    <div className="text-[9px] text-muted-foreground uppercase tracking-wide">
                      Peak Hour
                      {loadEmails.length < totalEmailCount && (
                        <span className="text-orange-500 ml-1" title={`Based on ${loadEmails.length.toLocaleString()} of ${totalEmailCount.toLocaleString()} emails`}>*</span>
                      )}
                    </div>
                    <div className="text-base font-bold">{busiestInfo.busiestHour || 'N/A'}</div>
                  </div>
                  <div className="bg-muted/30 border rounded px-2 py-1.5">
                    <div className="text-[9px] text-muted-foreground uppercase tracking-wide">Top Origin</div>
                    <div className="text-base font-bold">{stateData[0]?.state || 'N/A'}</div>
                  </div>
                  <div className="bg-muted/30 border rounded px-2 py-1.5">
                    <div className="text-[9px] text-muted-foreground uppercase tracking-wide">Top Dest</div>
                    <div className="text-base font-bold">
                      {[...stateData].sort((a, b) => b.deliveries - a.deliveries)[0]?.state || 'N/A'}
                    </div>
                  </div>
                </div>
                {/* Map */}
                <div className="flex-1">
                  {!mapboxToken ? (
                    <div className="flex items-center justify-center h-[400px] bg-muted/20 rounded-lg">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <div 
                      ref={mapContainer} 
                      className="rounded-lg" 
                      style={{ height: '520px', width: '100%', minHeight: '520px' }}
                    />
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Time Analysis Tab */}
        <TabsContent value="time" className="space-y-3">
          <div className="grid gap-3 lg:grid-cols-2">
            <Card>
              <CardHeader className="p-3 pb-1">
                <CardTitle className="text-sm">By Day of Week</CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={dayOfWeekData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '6px', fontSize: '11px' }} />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="p-3 pb-1">
                <CardTitle className="text-sm">By Hour</CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={hourOfDayData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={9} interval={3} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '6px', fontSize: '11px' }} />
                    <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="p-3 pb-1">
                <CardTitle className="text-sm">Monthly Trend</CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={monthlyTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={9} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '6px', fontSize: '11px' }} />
                    <Line type="monotone" dataKey="count" stroke="hsl(var(--chart-2))" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="p-3 pb-1">
                <CardTitle className="text-sm">Daily (Last 30 Days)</CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={dailyTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={9} interval={4} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '6px', fontSize: '11px' }} />
                    <Bar dataKey="count" fill="hsl(var(--chart-3))" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-sm">US Holidays</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="flex flex-wrap gap-1.5">
                {US_HOLIDAYS.map(holiday => (
                  <Badge key={holiday.name} variant="outline" className="text-[10px] py-0.5 px-1.5">
                    {holiday.name} ({holiday.month}/{holiday.day})
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Vehicle Types Tab */}
        <TabsContent value="vehicle" className="space-y-3">
          <div className="grid gap-3 lg:grid-cols-2">
            <Card>
              <CardHeader className="p-3 pb-1">
                <CardTitle className="text-sm">By Vehicle Type</CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={vehicleTypeDistribution} layout="vertical" margin={{ top: 5, right: 20, left: 70, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                    <YAxis dataKey="name" type="category" stroke="hsl(var(--muted-foreground))" fontSize={9} width={65} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '6px', fontSize: '11px' }} />
                    <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="p-3 pb-1">
                <CardTitle className="text-sm">Vehicle Type Share</CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={vehicleTypeDistribution.slice(0, 8)}
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      dataKey="value"
                      nameKey="name"
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      labelLine={false}
                      fontSize={9}
                    >
                      {vehicleTypeDistribution.slice(0, 8).map((_, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '6px', fontSize: '11px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-sm">All Vehicle Types</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="max-h-[250px] overflow-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-background">
                    <tr className="border-b">
                      <th className="text-left p-1.5 font-medium">Vehicle Type</th>
                      <th className="text-right p-1.5 font-medium">Count</th>
                      <th className="text-right p-1.5 font-medium">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vehicleTypeDistribution.map((item, i) => (
                      <tr key={i} className="border-b hover:bg-muted/50">
                        <td className="p-1.5">{item.name}</td>
                        <td className="text-right p-1.5">{item.value.toLocaleString()}</td>
                        <td className="text-right p-1.5">
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
