import { useEffect, useState, useRef } from "react";
import React from "react";
import { supabase } from "@/integrations/supabase/client";
import LoadEmailDetail from "@/components/LoadEmailDetail";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { RefreshCw, Settings, X, CheckCircle, MapPin, Wrench, ArrowLeft, Gauge, Truck, MapPinned, Volume2, VolumeX, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, MoreVertical } from "lucide-react";
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

interface Vehicle {
  id: string;
  vehicle_number: string | null;
  carrier: string | null;
  asset_type: string | null;
  driver_1_id: string | null;
  driver_2_id: string | null;
  status: string;
  formatted_address: string | null;
  last_location: string | null;
  odometer: number | null;
  oil_change_remaining: number | null;
  next_service_date: string | null;
  notes: string | null;
}

interface Driver {
  id: string;
  personal_info: any;
}

interface Load {
  id: string;
  truck_driver_carrier: string;
  customer: string;
  received: string;
  expires: string;
  pickup_time: string;
  pickup_date: string;
  delivery_time: string;
  delivery_date: string;
  origin_city: string;
  origin_state: string;
  destination_city: string;
  destination_state: string;
  empty_drive_miles: number;
  loaded_drive_miles: number;
  vehicle_type: string;
  weight: string;
  pieces: number;
  dimensions: string;
  avail_ft: string;
  source: string;
}

interface HuntPlan {
  id: string;
  vehicleId: string;
  planName: string;
  vehicleSize: string;
  zipCode: string;
  availableFeet: string;
  partial: boolean;
  pickupRadius: string;
  mileLimit: string;
  loadCapacity: string;
  availableDate: string;
  availableTime: string;
  destinationZip: string;
  destinationRadius: string;
  notes: string;
  createdBy: string;
  createdAt: Date;
  lastModified: Date;
  huntCoordinates?: { lat: number; lng: number } | null;
  enabled: boolean;
}

export default function LoadHunterTab() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loads, setLoads] = useState<Load[]>([]);
  const [loadEmails, setLoadEmails] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [selectedEmailForDetail, setSelectedEmailForDetail] = useState<any | null>(null);
  const [selectedEmailDistance, setSelectedEmailDistance] = useState<number | undefined>(undefined);
  const [mapboxToken, setMapboxToken] = useState<string>("");
  const [createHuntOpen, setCreateHuntOpen] = useState(false);
  const [huntPlans, setHuntPlans] = useState<HuntPlan[]>([]);
  const [editingHunt, setEditingHunt] = useState<HuntPlan | null>(null);
  const [editHuntOpen, setEditHuntOpen] = useState(false);
  const [huntFormData, setHuntFormData] = useState({
    planName: "",
    vehicleSize: "large-straight",
    zipCode: "",
    availableFeet: "",
    partial: false,
    pickupRadius: "100",
    mileLimit: "",
    loadCapacity: "9000",
    availableDate: new Date().toISOString().split('T')[0],
    availableTime: "00:00",
    destinationZip: "",
    destinationRadius: "",
    notes: "",
  });
  const [editingNotes, setEditingNotes] = useState(false);
  const [vehicleNotes, setVehicleNotes] = useState("");
  const [isSoundMuted, setIsSoundMuted] = useState(false);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [activeMode, setActiveMode] = useState<'admin' | 'dispatch'>('admin');
  const [activeFilter, setActiveFilter] = useState<string>('unreviewed');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 17;
  const mapContainer = React.useRef<HTMLDivElement>(null);
  const map = React.useRef<mapboxgl.Map | null>(null);

  // Calculate time thresholds
  const now = new Date();
  const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
  
  // Helper function to calculate distance between two zip codes using Haversine formula
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 3959; // Radius of the Earth in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Cache for geocoded locations (zip codes or city/state) to avoid repeated API calls
  const locationCache = useRef<Map<string, { lat: number, lng: number } | null>>(new Map());
  
  // Track which load emails have been verified to match active hunts
  const [matchedLoadIds, setMatchedLoadIds] = useState<Set<string>>(new Set());
  
  // Track distances from hunt location to each load's pickup
  const [loadDistances, setLoadDistances] = useState<Map<string, number>>(new Map());

  // Helper function to geocode a location string (zip code or "City, ST")
  const geocodeLocation = async (locationQuery: string): Promise<{ lat: number, lng: number } | null> => {
    // Check cache first
    if (locationCache.current.has(locationQuery)) {
      return locationCache.current.get(locationQuery) || null;
    }

    try {
      if (!mapboxToken) return null;
      
      const encoded = encodeURIComponent(locationQuery);
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?access_token=${mapboxToken}&country=US&limit=1`
      );
      const data = await response.json();
      
      if (data.features && data.features.length > 0) {
        const [lng, lat] = data.features[0].center;
        const coords = { lat, lng };
        locationCache.current.set(locationQuery, coords);
        return coords;
      }
      
      locationCache.current.set(locationQuery, null);
      return null;
    } catch (error) {
      console.error('Error geocoding location:', error);
      locationCache.current.set(locationQuery, null);
      return null;
    }
  };

  // Helper function to extract location data from load email
  const extractLoadLocation = (email: any): { originZip?: string, originLat?: number, originLng?: number, originCityState?: string, loadType?: string, pickupDate?: string } => {
    try {
      if (email.parsed_data) {
        const parsed = email.parsed_data;
        const originCityState = parsed.origin_city && parsed.origin_state
          ? `${parsed.origin_city}, ${parsed.origin_state}`
          : undefined;

        return {
          originZip: parsed.origin_zip || parsed.pickup_zip,
          originLat: parsed.origin_lat || parsed.pickup_lat,
          originLng: parsed.origin_lng || parsed.pickup_lng,
          originCityState,
          loadType: parsed.vehicle_type || parsed.equipment_type,
          pickupDate: parsed.pickup_date
        };
      }
      
      // Try extracting from body text if parsed_data not available
      const bodyText = email.body_text || '';
      const zipMatch = bodyText.match(/\b\d{5}\b/);
      return {
        originZip: zipMatch ? zipMatch[0] : undefined
      };
    } catch (error) {
      console.error('Error extracting load location:', error);
      return {};
    }
  };

  // Check if a load matches any active hunt plans (async version for geocoding)
  const loadMatchesHuntAsync = async (email: any): Promise<boolean> => {
    // Only consider enabled hunt plans
    const enabledHunts = huntPlans.filter(h => h.enabled);
    if (enabledHunts.length === 0) return false;
    
    const loadData = extractLoadLocation(email);
    
    for (const hunt of enabledHunts) {
      // Match by date if specified
      if (hunt.availableDate && loadData.pickupDate) {
        const huntDate = new Date(hunt.availableDate).toISOString().split('T')[0];
        const loadDate = new Date(loadData.pickupDate).toISOString().split('T')[0];
        if (huntDate !== loadDate) {
          continue; // Date doesn't match, try next hunt
        }
      }

      // Match by load type/vehicle size if specified
      if (hunt.vehicleSize && loadData.loadType) {
        const vehicleSizeLower = hunt.vehicleSize.toLowerCase();
        const loadTypeLower = loadData.loadType.toLowerCase();
        
        if (vehicleSizeLower.includes('straight')) {
          if (!loadTypeLower.includes('straight') && !loadTypeLower.includes('van') && !loadTypeLower.includes('truck')) {
            continue; // Vehicle type doesn't match, try next hunt
          }
        }
      }

      // Check distance radius
      if (hunt.huntCoordinates) {
        let loadLat = loadData.originLat;
        let loadLng = loadData.originLng;
        
        // If load doesn't have coordinates but has zip code or city/state, geocode it
        if ((!loadLat || !loadLng) && (loadData.originZip || loadData.originCityState)) {
          const query = loadData.originZip || loadData.originCityState!;
          const coords = await geocodeLocation(query);
          if (coords) {
            loadLat = coords.lat;
            loadLng = coords.lng;
          }
        }
        
        // Calculate distance if we have both coordinates
        if (loadLat && loadLng) {
          const distance = calculateDistance(
            hunt.huntCoordinates.lat,
            hunt.huntCoordinates.lng,
            loadLat,
            loadLng
          );
          
          const radiusMiles = parseInt(hunt.pickupRadius) || 100;
          
          if (distance <= radiusMiles) {
            return true; // Match found!
          }
        }
      }
      
      // Fallback to exact zip code matching
      if (loadData.originZip && hunt.zipCode) {
        if (loadData.originZip === hunt.zipCode) {
          return true; // Exact zip match
        }
      }
    }
    
    return false; // No matches found
  };

  // Check if a load has been verified to match hunts
  const loadMatchesHunt = (email: any): boolean => {
    return matchedLoadIds.has(email.id);
  };
  
  // Effect to search through last 30 minutes of loads when hunts change
  useEffect(() => {
    const searchLoadsForHunts = async () => {
      const enabledHunts = huntPlans.filter(h => h.enabled);
      if (enabledHunts.length === 0) {
        setMatchedLoadIds(new Set());
        setLoadDistances(new Map());
        return;
      }
      
      // Get loads from last 30 minutes only
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
      const recentLoads = loadEmails.filter(email => {
        const receivedAt = new Date(email.received_at);
        return receivedAt >= thirtyMinutesAgo;
      });
      
      const newMatchedIds = new Set<string>();
      const newDistances = new Map<string, number>();
      
      // Check each recent load against hunt criteria
      for (const email of recentLoads) {
        // Calculate distance from hunt location to load pickup for ALL loads
        const loadData = extractLoadLocation(email);
        
        // Use the first enabled hunt's coordinates as the "truck location"
        const primaryHunt = enabledHunts[0];
        if (primaryHunt?.huntCoordinates) {
          let loadLat = loadData.originLat;
          let loadLng = loadData.originLng;
          
          // Geocode if needed
          if ((!loadLat || !loadLng) && (loadData.originZip || loadData.originCityState)) {
            const query = loadData.originZip || loadData.originCityState!;
            const coords = await geocodeLocation(query);
            if (coords) {
              loadLat = coords.lat;
              loadLng = coords.lng;
            }
          }
          
          // Calculate distance
          if (loadLat && loadLng) {
            const distance = calculateDistance(
              primaryHunt.huntCoordinates.lat,
              primaryHunt.huntCoordinates.lng,
              loadLat,
              loadLng
            );
            newDistances.set(email.id, Math.round(distance));
          }
        }
        
        // Check if load matches hunt criteria
        const matched = await loadMatchesHuntAsync(email);
        if (matched) {
          newMatchedIds.add(email.id);
          
          // Mark as 'new' if it was missed, so it appears in unreviewed
          if (email.status === 'missed') {
            await supabase
              .from('load_emails')
              .update({ status: 'new' })
              .eq('id', email.id);
          }
        }
      }
      
      setMatchedLoadIds(newMatchedIds);
      setLoadDistances(newDistances);
    };
    
    if (mapboxToken && huntPlans.length > 0 && loadEmails.length > 0) {
      searchLoadsForHunts();
    } else if (huntPlans.length === 0) {
      setMatchedLoadIds(new Set());
      setLoadDistances(new Map());
    }
  }, [loadEmails, huntPlans, mapboxToken]); // Re-run when new loads arrive, hunts change, or token is ready

  // Calculate distance for selected email detail view
  useEffect(() => {
    const calculateSelectedDistance = async () => {
      if (!selectedEmailForDetail || !huntPlans.length || !mapboxToken) {
        setSelectedEmailDistance(undefined);
        return;
      }

      // Check if we already have the distance in loadDistances
      const existingDistance = loadDistances.get(selectedEmailForDetail.id);
      if (existingDistance) {
        setSelectedEmailDistance(existingDistance);
        return;
      }

      // Calculate distance from first enabled hunt's location
      const enabledHunts = huntPlans.filter(h => h.enabled);
      if (enabledHunts.length === 0) {
        setSelectedEmailDistance(undefined);
        return;
      }

      const primaryHunt = enabledHunts[0];
      if (!primaryHunt.huntCoordinates) {
        setSelectedEmailDistance(undefined);
        return;
      }

      const loadData = extractLoadLocation(selectedEmailForDetail);
      let loadLat = loadData.originLat;
      let loadLng = loadData.originLng;

      // Geocode if needed
      if ((!loadLat || !loadLng) && (loadData.originZip || loadData.originCityState)) {
        const query = loadData.originZip || loadData.originCityState!;
        const coords = await geocodeLocation(query);
        if (coords) {
          loadLat = coords.lat;
          loadLng = coords.lng;
        }
      }

      // Calculate distance
      if (loadLat && loadLng) {
        const distance = calculateDistance(
          primaryHunt.huntCoordinates.lat,
          primaryHunt.huntCoordinates.lng,
          loadLat,
          loadLng
        );
        setSelectedEmailDistance(Math.round(distance));
      } else {
        setSelectedEmailDistance(undefined);
      }
    };

    calculateSelectedDistance();
  }, [selectedEmailForDetail, huntPlans, mapboxToken, loadDistances]);
  
  // Filter emails based on active filter
  const filteredEmails = loadEmails.filter(email => {
    const emailTime = new Date(email.received_at);
    const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
    
    // Apply hunt filtering for unreviewed status
    if (activeFilter === 'unreviewed') {
      const isUnreviewed = email.status === 'new' || (email.status === 'missed' && emailTime > thirtyMinutesAgo);
      
      // Only show unreviewed loads that match hunt criteria
      if (isUnreviewed) {
        return loadMatchesHunt(email);
      }
      
      return false;
    }
    if (activeFilter === 'missed') {
      // Show only missed loads that are 30+ minutes old
      return email.status === 'missed' && emailTime <= thirtyMinutesAgo;
    }
    if (activeFilter === 'waitlist') return email.status === 'waitlist';
    if (activeFilter === 'skipped') return email.status === 'skipped';
    if (activeFilter === 'all') return true;
    return true; // Default for other filters
  });

  // Count emails by status (with hunt filtering applied for unreviewed)
  const unreviewedCount = loadEmails.filter(e => {
    const emailTime = new Date(e.received_at);
    const isUnreviewed = e.status === 'new' || (e.status === 'missed' && emailTime > thirtyMinutesAgo);
    
    // Apply hunt filtering for unreviewed count
    if (isUnreviewed) {
      return loadMatchesHunt(e);
    }
    
    return false;
  }).length;
  const missedCount = loadEmails.filter(e => {
    const emailTime = new Date(e.received_at);
    return e.status === 'missed' && emailTime <= thirtyMinutesAgo;
  }).length;
  const waitlistCount = loadEmails.filter(e => e.status === 'waitlist').length;
  const skippedCount = loadEmails.filter(e => e.status === 'skipped').length;

  // Function to play alert sound
  const playAlertSound = (force = false) => {
    console.log('🔔 playAlertSound called, isSoundMuted:', isSoundMuted, 'force:', force);
    
    if (isSoundMuted && !force) {
      console.log('❌ Sound is muted, skipping');
      return;
    }
    
    try {
      // Create or reuse audio context
      let ctx = audioContext;
      if (!ctx) {
        console.log('🎵 Creating new AudioContext');
        ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        setAudioContext(ctx);
      }
      
      console.log('🎵 AudioContext state:', ctx.state);
      
      // Resume context if suspended (required by some browsers)
      if (ctx.state === 'suspended') {
        console.log('🔓 Resuming suspended AudioContext');
        ctx.resume();
      }
      
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      // Create a pleasant notification sound (two-tone)
      oscillator.frequency.setValueAtTime(800, ctx.currentTime);
      oscillator.frequency.setValueAtTime(600, ctx.currentTime + 0.1);
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.4);
      
      console.log('✅ Sound notification played successfully');
    } catch (error) {
      console.error('❌ Error playing sound:', error);
    }
  };
  const toggleSound = () => {
    console.log('🔘 toggleSound clicked, current state:', isSoundMuted);
    
    const newMutedState = !isSoundMuted;
    setIsSoundMuted(newMutedState);
    
    console.log('🔘 New muted state:', newMutedState);
    
    // Initialize audio context and play test sound when unmuting
    if (!newMutedState) {
      console.log('🔊 Enabling sound alerts...');
      
      // Create audio context on user interaction
      if (!audioContext) {
        console.log('🎵 Creating AudioContext on user interaction');
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        setAudioContext(ctx);
        
        // Resume if needed
        if (ctx.state === 'suspended') {
          ctx.resume().then(() => {
            console.log('🔓 AudioContext resumed');
          });
        }
      }
      
      // Play test sound
      setTimeout(() => {
        console.log('⏰ Playing test sound after delay');
        playAlertSound(true);
        toast.success('Sound alerts enabled');
      }, 100);
    } else {
      console.log('🔇 Sound alerts muted');
      toast.info('Sound alerts muted');
    }
  };

  useEffect(() => {
    loadVehicles();
    loadDrivers();
    loadLoadEmails();
    loadHuntPlans();
    fetchMapboxToken();

    // Subscribe to real-time updates for load_emails
    const emailsChannel = supabase
      .channel('load-emails-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'load_emails'
        },
        (payload) => {
          console.log('New load email received:', payload);
          // Add the new email to the list
          setLoadEmails((current) => [payload.new, ...current]);
          toast.success('New load email received!');
          // Sound will be handled by the loadEmails length watcher
        }
      )
      .subscribe();

    // Subscribe to real-time updates for hunt_plans
    const huntPlansChannel = supabase
      .channel('hunt-plans-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'hunt_plans'
        },
        (payload) => {
          console.log('Hunt plan change:', payload);
          // Reload hunt plans on any change
          loadHuntPlans();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(emailsChannel);
      supabase.removeChannel(huntPlansChannel);
    };
  }, []);

  // Watch for increases in load email count to trigger sound
  const previousEmailCountRef = useRef<number | null>(null);
  useEffect(() => {
    const currentCount = loadEmails.length;

    if (previousEmailCountRef.current === null) {
      // Initialize on first run, no sound
      previousEmailCountRef.current = currentCount;
      return;
    }

    if (currentCount > previousEmailCountRef.current) {
      console.log('📥 Load email count increased:', previousEmailCountRef.current, '→', currentCount);
      playAlertSound();
    }

    previousEmailCountRef.current = currentCount;
  }, [loadEmails.length]);

  // Auto-mark loads as missed after 15 minutes
  useEffect(() => {
    const checkMissedLoads = async () => {
      const now = new Date();
      const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);
      
      // Find all 'new' status loads that are older than 15 minutes
      const loadsToMark = loadEmails.filter(email => {
        const emailTime = new Date(email.received_at);
        return email.status === 'new' && emailTime <= fifteenMinutesAgo;
      });

      if (loadsToMark.length > 0) {
        console.log(`Marking ${loadsToMark.length} loads as missed`);
        
        for (const load of loadsToMark) {
          try {
            const { error } = await supabase
              .from('load_emails')
              .update({ status: 'missed' })
              .eq('id', load.id);

            if (error) {
              console.error('Error marking load as missed:', error);
            }
          } catch (err) {
            console.error('Error updating load status:', err);
          }
        }

        // Refresh the load emails list
        await loadLoadEmails();
      }
    };

    // Check immediately on mount
    checkMissedLoads();

    // Then check every minute
    const interval = setInterval(checkMissedLoads, 60000);

    return () => clearInterval(interval);
  }, [loadEmails]);

  const fetchMapboxToken = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('get-mapbox-token');
      if (error) throw error;
      if (data?.token) {
        setMapboxToken(data.token);
      }
    } catch (error) {
      console.error('Failed to fetch Mapbox token:', error);
      toast.error('Failed to load map token');
    }
  };

  // Initialize map when vehicle is selected
  useEffect(() => {
    if (!selectedVehicle || !mapContainer.current || !mapboxToken) return;

    // Clean up existing map
    if (map.current) {
      map.current.remove();
      map.current = null;
    }

    // Get coordinates from last_location
    if (!selectedVehicle.last_location) return;

    const [lat, lng] = selectedVehicle.last_location.split(',').map(parseFloat);
    if (isNaN(lat) || isNaN(lng)) return;

    // Initialize new map
    mapboxgl.accessToken = mapboxToken;
    
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [lng, lat],
      zoom: 5,
    });

    // Create truck icon marker
    const el = document.createElement('div');
    el.className = 'truck-marker';
    el.style.width = '40px';
    el.style.height = '40px';
    el.style.backgroundColor = '#3b82f6';
    el.style.borderRadius = '50%';
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    el.style.color = 'white';
    el.style.fontSize = '20px';
    el.innerHTML = '🚛';

    // Add marker
    new mapboxgl.Marker({ element: el })
      .setLngLat([lng, lat])
      .addTo(map.current);

    // Add navigation controls
    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [selectedVehicle, mapboxToken]);

  const loadVehicles = async () => {
    try {
      const { data, error } = await supabase
        .from("vehicles")
        .select("*")
        .in("status", ["active", "available"])
        .order("vehicle_number", { ascending: true });

      if (error) throw error;
      setVehicles(data || []);
    } catch (error: any) {
      console.error("Failed to load vehicles", error);
      toast.error("Failed to load vehicles");
    } finally {
      setLoading(false);
    }
  };

  const loadDrivers = async () => {
    try {
      const { data, error } = await supabase
        .from("applications")
        .select("id, personal_info")
        .eq("driver_status", "active");

      if (error) throw error;
      setDrivers(data || []);
    } catch (error: any) {
      console.error("Failed to load drivers", error);
    }
  };

  const loadLoadEmails = async () => {
    try {
      const { data, error } = await supabase
        .from("load_emails")
        .select("*")
        .order("received_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      setLoadEmails(data || []);
    } catch (error: any) {
      console.error("Failed to load emails", error);
    }
  };

  const loadHuntPlans = async () => {
    try {
      const { data, error } = await supabase
        .from("hunt_plans")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      // Transform database format to component format
      const transformedPlans: HuntPlan[] = (data || []).map(plan => ({
        id: plan.id,
        vehicleId: plan.vehicle_id,
        planName: plan.plan_name,
        vehicleSize: plan.vehicle_size || "",
        zipCode: plan.zip_code || "",
        availableFeet: plan.available_feet || "",
        partial: plan.partial || false,
        pickupRadius: plan.pickup_radius || "",
        mileLimit: plan.mile_limit || "",
        loadCapacity: plan.load_capacity || "",
        availableDate: plan.available_date || "",
        availableTime: plan.available_time || "",
        destinationZip: plan.destination_zip || "",
        destinationRadius: plan.destination_radius || "",
        notes: plan.notes || "",
        createdBy: plan.created_by || "",
        createdAt: new Date(plan.created_at),
        lastModified: new Date(plan.last_modified),
        huntCoordinates: plan.hunt_coordinates as { lat: number; lng: number } | null,
        enabled: plan.enabled !== false, // Default to true if undefined
      }));
      
      setHuntPlans(transformedPlans);
    } catch (error: any) {
      console.error("Failed to load hunt plans", error);
    }
  };

  const getDriverName = (driverId: string | null) => {
    if (!driverId) return "";
    const driver = drivers.find(d => d.id === driverId);
    if (!driver?.personal_info) return "";
    const { firstName, lastName } = driver.personal_info;
    return `${firstName || ""} ${lastName || ""}`.trim();
  };

  const handleRefreshLoads = async () => {
    setRefreshing(true);
    try {
      // Call the fetch-gmail-loads function to pull emails directly
      const { data, error } = await supabase.functions.invoke('fetch-gmail-loads');

      if (error) {
        console.error('fetch-gmail-loads error:', error);
        throw new Error(error.message || 'Failed to fetch Gmail emails');
      }

      console.log('Fetch response:', data);

      if (data?.count > 0) {
        toast.success(`Successfully loaded ${data.count} new load emails`);
        // Reload the load emails table
        await loadLoadEmails();
      } else {
        toast.info('No new load emails found');
      }
    } catch (error: any) {
      console.error('Gmail fetch error:', error);
      toast.error('Failed to fetch Gmail emails');
    } finally {
      setRefreshing(false);
    }
  };

  const handleSkipEmail = async (emailId: string) => {
    try {
      const { error } = await supabase
        .from('load_emails')
        .update({ status: 'skipped' })
        .eq('id', emailId);

      if (error) throw error;

      // Reload emails to update counts and filtered view
      await loadLoadEmails();
      toast.success('Load skipped');
    } catch (error) {
      console.error('Error skipping email:', error);
      toast.error('Failed to skip email');
    }
  };

  const handleReviewEmail = async (emailId: string) => {
    try {
      const { error } = await supabase
        .from('load_emails')
        .update({ status: 'reviewed' })
        .eq('id', emailId);

      if (error) throw error;

      // Remove from UI
      setLoadEmails(loadEmails.filter(email => email.id !== emailId));
      toast.success('Load email marked as reviewed');
    } catch (error) {
      console.error('Error reviewing email:', error);
      toast.error('Failed to mark email as reviewed');
    }
  };

  const handleMoveToWaitlist = async (emailId: string) => {
    try {
      const { error } = await supabase
        .from('load_emails')
        .update({ status: 'waitlist' })
        .eq('id', emailId);

      if (error) throw error;

      // Reload emails to update counts and filtered view
      await loadLoadEmails();
      toast.success('Load moved to waitlist');
    } catch (error) {
      console.error('Error moving to waitlist:', error);
      toast.error('Failed to move load to waitlist');
    }
  };

  const handleSaveHuntPlan = async () => {
    if (!selectedVehicle) {
      toast.error("No vehicle selected");
      return;
    }

    if (!huntFormData.zipCode) {
      toast.error("Please enter a zip code");
      return;
    }

    try {
      // Geocode the zipcode to get coordinates using Mapbox
      const geocodeResponse = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${huntFormData.zipCode}.json?access_token=${mapboxToken}&country=US&types=postcode&limit=1`
      );
      const geocodeData = await geocodeResponse.json();
      
      let huntCoordinates = null;
      if (geocodeData.features && geocodeData.features.length > 0) {
        const [lng, lat] = geocodeData.features[0].center;
        huntCoordinates = { lat, lng };
      } else {
        toast.warning("Could not geocode zip code, hunt may not filter accurately");
      }

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      
      // Get user profile for name
      let createdBy = "Unknown";
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .single();
        
        createdBy = profile?.full_name || user.email || "Unknown";
      }

      // Save to database
      const { data, error } = await supabase
        .from("hunt_plans")
        .insert({
          vehicle_id: selectedVehicle.id,
          plan_name: huntFormData.planName,
          vehicle_size: huntFormData.vehicleSize,
          zip_code: huntFormData.zipCode,
          available_feet: huntFormData.availableFeet,
          partial: huntFormData.partial,
          pickup_radius: huntFormData.pickupRadius,
          mile_limit: huntFormData.mileLimit,
          load_capacity: huntFormData.loadCapacity,
          available_date: huntFormData.availableDate,
          available_time: huntFormData.availableTime,
          destination_zip: huntFormData.destinationZip,
          destination_radius: huntFormData.destinationRadius,
          notes: huntFormData.notes,
          hunt_coordinates: huntCoordinates,
          created_by: user?.id,
          enabled: true,
        })
        .select()
        .single();

      if (error) throw error;
      
      setCreateHuntOpen(false);
      toast.success("Hunt plan created successfully");
      
      // Reload hunt plans from database
      await loadHuntPlans();
      
      // Trigger re-filtering of loads
      await loadLoadEmails();
      
      // Reset form
      setHuntFormData({
        planName: "",
        vehicleSize: "large-straight",
        zipCode: "",
        availableFeet: "",
        partial: false,
        pickupRadius: "100",
        mileLimit: "",
        loadCapacity: "9000",
        availableDate: new Date().toISOString().split('T')[0],
        availableTime: "00:00",
        destinationZip: "",
        destinationRadius: "",
        notes: "",
      });
    } catch (error) {
      console.error("Error creating hunt plan:", error);
      toast.error("Failed to create hunt plan");
    }
  };

  const handleDeleteHuntPlan = async (id: string) => {
    try {
      const { error } = await supabase
        .from("hunt_plans")
        .delete()
        .eq("id", id);

      if (error) throw error;
      
      // Reload hunt plans from database
      await loadHuntPlans();
      toast.success("Hunt plan deleted");
    } catch (error) {
      console.error("Error deleting hunt plan:", error);
      toast.error("Failed to delete hunt plan");
    }
  };

  const handleToggleHunt = async (id: string, currentEnabled: boolean) => {
    try {
      const { error } = await supabase
        .from("hunt_plans")
        .update({ enabled: !currentEnabled })
        .eq("id", id);

      if (error) throw error;
      
      // Reload hunt plans from database
      await loadHuntPlans();
      
      // Trigger re-filtering of loads
      await loadLoadEmails();
      
      toast.success(currentEnabled ? "Hunt disabled" : "Hunt enabled");
    } catch (error) {
      console.error("Error toggling hunt:", error);
      toast.error("Failed to toggle hunt");
    }
  };

  const handleEditHunt = (hunt: HuntPlan) => {
    setEditingHunt(hunt);
    setHuntFormData({
      planName: hunt.planName,
      vehicleSize: hunt.vehicleSize,
      zipCode: hunt.zipCode,
      availableFeet: hunt.availableFeet,
      partial: hunt.partial,
      pickupRadius: hunt.pickupRadius,
      mileLimit: hunt.mileLimit,
      loadCapacity: hunt.loadCapacity,
      availableDate: hunt.availableDate,
      availableTime: hunt.availableTime,
      destinationZip: hunt.destinationZip,
      destinationRadius: hunt.destinationRadius,
      notes: hunt.notes,
    });
    setEditHuntOpen(true);
  };

  const handleUpdateHuntPlan = async () => {
    if (!editingHunt) return;

    if (!huntFormData.zipCode) {
      toast.error("Please enter a zip code");
      return;
    }

    try {
      // Geocode the zipcode to get coordinates using Mapbox
      const geocodeResponse = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${huntFormData.zipCode}.json?access_token=${mapboxToken}&country=US&types=postcode&limit=1`
      );
      const geocodeData = await geocodeResponse.json();
      
      let huntCoordinates = null;
      if (geocodeData.features && geocodeData.features.length > 0) {
        const [lng, lat] = geocodeData.features[0].center;
        huntCoordinates = { lat, lng };
      }

      // Update in database
      const { error } = await supabase
        .from("hunt_plans")
        .update({
          plan_name: huntFormData.planName,
          vehicle_size: huntFormData.vehicleSize,
          zip_code: huntFormData.zipCode,
          available_feet: huntFormData.availableFeet,
          partial: huntFormData.partial,
          pickup_radius: huntFormData.pickupRadius,
          mile_limit: huntFormData.mileLimit,
          load_capacity: huntFormData.loadCapacity,
          available_date: huntFormData.availableDate,
          available_time: huntFormData.availableTime,
          destination_zip: huntFormData.destinationZip,
          destination_radius: huntFormData.destinationRadius,
          notes: huntFormData.notes,
          hunt_coordinates: huntCoordinates,
        })
        .eq("id", editingHunt.id);

      if (error) throw error;
      
      setEditHuntOpen(false);
      setEditingHunt(null);
      toast.success("Hunt plan updated successfully");
      
      // Reload hunt plans from database
      await loadHuntPlans();
      
      // Trigger re-filtering of loads
      await loadLoadEmails();
      
      // Reset form
      setHuntFormData({
        planName: "",
        vehicleSize: "large-straight",
        zipCode: "",
        availableFeet: "",
        partial: false,
        pickupRadius: "100",
        mileLimit: "",
        loadCapacity: "9000",
        availableDate: new Date().toISOString().split('T')[0],
        availableTime: "00:00",
        destinationZip: "",
        destinationRadius: "",
        notes: "",
      });
    } catch (error) {
      console.error("Error updating hunt plan:", error);
      toast.error("Failed to update hunt plan");
    }
  };

  const formatDateTime = (date: string, time: string) => {
    const dateObj = new Date(date + 'T' + time);
    return dateObj.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    }) + ' ' + time + ' EST';
  };

  const getTimeAgo = (date: Date) => {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s ago`;
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m ago`;
  };

  const handleSaveVehicleNotes = async () => {
    if (!selectedVehicle) return;
    
    try {
      const { error } = await supabase
        .from("vehicles")
        .update({ notes: vehicleNotes })
        .eq("id", selectedVehicle.id);

      if (error) throw error;

      toast.success("Vehicle notes saved successfully");
      setEditingNotes(false);
      
      // Update the selected vehicle's notes
      setSelectedVehicle({ ...selectedVehicle, notes: vehicleNotes });
      
      // Refresh vehicles list to show updated notes
      loadVehicles();
    } catch (error: any) {
      toast.error("Failed to save notes: " + error.message);
    }
  };

  // Update vehicle notes when a new vehicle is selected
  useEffect(() => {
    if (selectedVehicle) {
      setVehicleNotes(selectedVehicle.notes || "");
      setEditingNotes(false);
    }
  }, [selectedVehicle?.id]);

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Filter Bar - Full Width - Always Visible */}
      <div className="flex items-center gap-2 py-2 px-3 bg-background border-y overflow-x-auto flex-shrink-0 relative z-10">
          {/* Mode Buttons */}
          <div className="flex items-center border rounded-md overflow-hidden pr-3 border-r flex-shrink-0">
            <Button 
              size="sm" 
              variant={activeMode === 'admin' ? 'default' : 'ghost'}
              className="h-7 px-3 text-xs rounded-none border-0"
              onClick={() => setActiveMode('admin')}
            >
              Admin
            </Button>
            
            <div className="w-px h-5 bg-border"></div>
            
            <Button 
              size="sm" 
              variant={activeMode === 'dispatch' ? 'default' : 'ghost'}
              className="h-7 px-3 text-xs rounded-none border-0"
              onClick={() => setActiveMode('dispatch')}
            >
              MY TRUCKS
            </Button>
          </div>
          
          <div className="pr-3 border-r flex-shrink-0">
            <Button 
              size="sm" 
              variant="default"
              className="h-7 px-3 text-xs bg-green-600 hover:bg-green-700"
            >
              Add Vehicle
            </Button>
          </div>

          {/* Filter Buttons */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <div className="flex items-center border border-gray-300 rounded-md overflow-hidden bg-white">
              <Button 
                size="sm" 
                variant="ghost"
                className={`h-7 px-2.5 text-xs gap-1.5 rounded-none border-0 ${
                  activeFilter === 'unreviewed' 
                    ? 'bg-blue-600 text-white hover:bg-blue-700' 
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
                onClick={() => {
                  setActiveFilter('unreviewed');
                  setSelectedVehicle(null);
                  setSelectedEmailForDetail(null);
                }}
              >
                Unreviewed Loads
                <Badge variant="destructive" className="h-4 px-1.5 text-[10px] bg-red-500 text-white ml-1">{unreviewedCount}</Badge>
              </Button>
              
              <div className="w-px h-5 bg-gray-300"></div>
              
              <Button 
                size="sm" 
                variant="ghost"
                className="h-7 px-2 text-xs rounded-none border-0 bg-white text-gray-700 hover:bg-gray-50"
                onClick={toggleSound}
                title={isSoundMuted ? "Sound alerts off" : "Sound alerts on"}
              >
                {isSoundMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
              </Button>
            </div>
            
            <Button
              size="sm" 
              variant="outline"
              className={`h-7 px-2.5 text-xs gap-1.5 ${
                activeFilter === 'missed' 
                  ? 'bg-red-600 hover:bg-red-700 text-white border-red-600' 
                  : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-300'
              }`}
              onClick={() => {
                setActiveFilter('missed');
                setSelectedVehicle(null);
                setSelectedEmailForDetail(null);
              }}
            >
              Missed
              <Badge variant="destructive" className="h-4 px-1.5 text-[10px] ml-1 bg-red-400 text-white">{missedCount}</Badge>
            </Button>
            
            <div className="flex items-center border border-gray-300 rounded-md overflow-hidden bg-white">
              <Button 
                size="sm" 
                variant="ghost"
                className={`h-7 px-2.5 text-xs gap-1.5 rounded-none border-0 ${
                  activeFilter === 'waitlist' 
                    ? 'bg-orange-500 hover:bg-orange-600 text-white' 
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
                onClick={() => {
                  setActiveFilter('waitlist');
                  setSelectedVehicle(null);
                  setSelectedEmailForDetail(null);
                }}
              >
                Waitlist
                <Badge variant="secondary" className="h-4 px-1.5 text-[10px] ml-1 bg-orange-400 text-white">{waitlistCount}</Badge>
              </Button>
              
              <div className="w-px h-5 bg-gray-300"></div>
              
              <Button 
                size="sm" 
                variant="ghost"
                className={`h-7 px-2.5 text-xs gap-1.5 rounded-none border-0 ${
                  activeFilter === 'undecided' 
                    ? 'bg-orange-500 hover:bg-orange-600 text-white' 
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
                onClick={() => {
                  setActiveFilter('undecided');
                  setSelectedVehicle(null);
                  setSelectedEmailForDetail(null);
                }}
              >
                Undecided
                <Badge variant="secondary" className="h-4 px-1.5 text-[10px] ml-1 bg-orange-400 text-white">0</Badge>
              </Button>
              
              <div className="w-px h-5 bg-gray-300"></div>
              
              <Button 
                size="sm" 
                variant="ghost"
                className={`h-7 px-2.5 text-xs gap-1.5 rounded-none border-0 ${
                  activeFilter === 'skipped' 
                    ? 'bg-gray-600 hover:bg-gray-700 text-white' 
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
                onClick={() => {
                  setActiveFilter('skipped');
                  setSelectedVehicle(null);
                  setSelectedEmailForDetail(null);
                }}
              >
                Skipped
                <Badge variant="secondary" className="h-4 px-1.5 text-[10px] ml-1 bg-gray-300 text-gray-700">{skippedCount}</Badge>
              </Button>
            </div>
            
            <div className="flex items-center border border-gray-300 rounded-md overflow-hidden bg-white">
              <Button 
                size="sm" 
                variant="ghost"
                className={`h-7 px-2.5 text-xs gap-1.5 rounded-none border-0 ${
                  activeFilter === 'mybids' 
                    ? 'bg-blue-600 text-white hover:bg-blue-700' 
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
                onClick={() => {
                  setActiveFilter('mybids');
                  setSelectedVehicle(null);
                  setSelectedEmailForDetail(null);
                }}
              >
                My Bids
                <Badge variant="secondary" className="h-4 px-1.5 text-[10px] ml-1 bg-blue-400 text-white">85</Badge>
              </Button>
              
              <div className="w-px h-5 bg-gray-300"></div>
              
              <Button 
                size="sm" 
                variant="ghost"
                className={`h-7 px-2.5 text-xs rounded-none border-0 ${
                  activeFilter === 'all' 
                    ? 'bg-gray-800 text-white hover:bg-gray-900' 
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
                onClick={() => {
                  setActiveFilter('all');
                  setSelectedVehicle(null);
                  setSelectedEmailForDetail(null);
                }}
              >
                All
              </Button>
            </div>
            
            <Button
              size="sm" 
              variant="outline"
              className={`h-7 px-2.5 text-xs gap-1.5 ${
                activeFilter === 'booked' 
                  ? 'bg-green-600 hover:bg-green-700 text-white border-green-600' 
                  : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-300'
              }`}
              onClick={() => {
                setActiveFilter('booked');
                setSelectedVehicle(null);
                setSelectedEmailForDetail(null);
              }}
            >
              Booked
              <Badge variant="secondary" className="h-4 px-1.5 text-[10px] ml-1 bg-blue-400 text-white">2</Badge>
            </Button>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
            <Button 
              size="sm" 
              variant="outline"
              className={`h-7 px-2.5 text-xs ${
                activeFilter === 'vehicle-assignment' 
                  ? 'bg-teal-600 hover:bg-teal-700 text-white border-teal-600' 
                  : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-300'
              }`}
              onClick={() => {
                setActiveFilter('vehicle-assignment');
                setSelectedVehicle(null);
                setSelectedEmailForDetail(null);
              }}
            >
              Vehicle Assignment
            </Button>
            
            <Button 
              size="sm" 
              variant="outline"
              className={`h-7 px-2.5 text-xs ${
                activeFilter === 'dispatcher-metrix' 
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600' 
                  : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-300'
              }`}
              onClick={() => {
                setActiveFilter('dispatcher-metrix');
                setSelectedVehicle(null);
                setSelectedEmailForDetail(null);
              }}
            >
              Dispatcher Metrix
            </Button>
            
            <Button
              variant="default"
              size="sm"
              className="gap-1.5 h-7 text-xs px-2.5"
              onClick={handleRefreshLoads}
              disabled={refreshing}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Refreshing..." : "Refresh Loads"}
            </Button>
          </div>
        </div>

      {/* Main Content Area */}
      <div className="flex flex-1 gap-2 overflow-y-auto overflow-x-hidden pt-3">
        {/* Left Sidebar - Vehicles - Always Visible */}
        <div className="w-64 flex-shrink-0 space-y-1 overflow-y-auto border-r pr-2">
          {loading ? (
            <div className="text-xs text-muted-foreground">Loading...</div>
          ) : vehicles.length === 0 ? (
            <div className="text-xs text-muted-foreground">No active trucks</div>
          ) : (
            vehicles.map((vehicle) => {
              const hasHunt = huntPlans.some(plan => plan.vehicleId === vehicle.id);
              return (
                <Card 
                  key={vehicle.id} 
                  className={`p-2 hover:bg-muted/50 transition-colors cursor-pointer rounded-sm ${
                    hasHunt ? 'border-l-4 border-l-blue-500' : 'border-l-4 border-l-gray-300'
                  } ${selectedVehicle?.id === vehicle.id ? 'bg-muted' : ''}`}
                  onClick={() => setSelectedVehicle(vehicle)}
                >
                  <div className="flex items-start justify-between gap-1.5">
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="font-medium text-xs leading-tight text-foreground">
                        {vehicle.vehicle_number || "N/A"} - {getDriverName(vehicle.driver_1_id) || "No Driver Assigned"}
                      </div>
                      <div className="text-[11px] text-muted-foreground leading-tight">
                        {vehicle.asset_type || "Asset Type"}
                      </div>
                      <div className="text-[10px] text-muted-foreground/60 truncate leading-tight">
                        {vehicle.carrier || "No Carrier"}
                      </div>
                    </div>
                    <div className="flex gap-0.5 flex-shrink-0">
                      <div className="h-4 w-4 rounded-sm bg-red-500 flex items-center justify-center text-white text-[9px] font-medium">
                        0
                      </div>
                      <div className="h-4 w-4 rounded-sm bg-orange-500 flex items-center justify-center text-white text-[9px] font-medium">
                        0
                      </div>
                      <div className="h-4 w-4 rounded-sm bg-blue-500 flex items-center justify-center text-white text-[9px] font-medium">
                        0
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>

      {/* Main Content - Load Board or Vehicle Details */}
      <div className="flex-1 space-y-2 overflow-hidden flex flex-col">
        {/* Conditional Content: Load Board or Vehicle Details */}
        {selectedVehicle ? (
          /* Vehicle Details View */
          <div className="flex-1 overflow-hidden flex gap-3">
            {/* Left Panel - Vehicle Info */}
            <div className="w-[380px] flex-shrink-0 space-y-4 overflow-y-auto border rounded-lg p-4 bg-card">
              {/* Tabs */}
              <Tabs defaultValue="empty" className="w-full">
                <TabsList className="w-full grid grid-cols-4 h-10 bg-muted/30 mb-6">
                  <TabsTrigger value="empty" className="text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                    Empty
                  </TabsTrigger>
                  <TabsTrigger value="delivery" className="text-sm">
                    Delivery Date & Time
                  </TabsTrigger>
                  <TabsTrigger value="destination" className="text-sm">
                    Destination
                  </TabsTrigger>
                  <TabsTrigger value="remaining" className="text-sm">
                    Remaining
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {/* Vehicle Details Section with Border */}
              <div className="border-2 border-border rounded-lg p-4 space-y-4 bg-background">
                {/* Location & Odometer with Maintenance Box */}
                <div className="relative">
                  <div className="space-y-1 pr-[220px]">
                    <div className="text-sm">Location</div>
                    <div className="text-sm font-medium whitespace-normal break-words">
                      {selectedVehicle.formatted_address || selectedVehicle.last_location || "N/A"}
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Gauge className="h-4 w-4" />
                      <span>Odometer</span>
                      <span className="font-semibold">
                        {selectedVehicle.odometer ? selectedVehicle.odometer.toLocaleString() : "N/A"}
                      </span>
                    </div>
                  </div>
                  
                  {/* Next Maintenance Due Box - Positioned on the right */}
                  <div className="absolute top-0 right-0 border-2 border-border rounded-lg px-4 py-2 bg-background min-w-[200px]">
                    <div className="text-xs text-muted-foreground mb-1">Next Maintenance Due</div>
                    <div className="flex items-center justify-between gap-4">
                      <div className={`text-2xl font-bold ${
                        selectedVehicle.oil_change_remaining !== null && selectedVehicle.oil_change_remaining < 0 
                          ? "text-destructive" 
                          : ""
                      }`}>
                        {selectedVehicle.oil_change_remaining !== null && selectedVehicle.oil_change_remaining !== undefined
                          ? `${selectedVehicle.oil_change_remaining} mi`
                          : "N/A"}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {selectedVehicle.next_service_date || "N/A"}
                      </div>
                    </div>
                  </div>
                </div>

                <Button variant="link" className="text-sm text-primary p-0 h-auto">
                  View vehicle Details
                </Button>

                {/* Driver Assignments - Single line format */}
                <div className="space-y-2">
                  <div className="flex items-center text-sm">
                    <span className="font-semibold w-8">D1</span>
                    <span className="flex-1">
                      {getDriverName(selectedVehicle.driver_1_id) || "No Driver Assigned"}
                    </span>
                    <span className="text-muted-foreground">Note: N/A</span>
                  </div>
                  <div className="flex items-center text-sm">
                    <span className="font-semibold w-8">D2</span>
                    <span className="flex-1">
                      {getDriverName(selectedVehicle.driver_2_id) || "No Driver Assigned"}
                    </span>
                    <span className="text-muted-foreground">Note: N/A</span>
                  </div>
                </div>

                {/* Vehicle Note - Editable */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">Vehicle Note:</div>
                    <Wrench 
                      className="h-5 w-5 text-primary cursor-pointer hover:text-primary/80" 
                      onClick={() => setEditingNotes(!editingNotes)}
                    />
                  </div>
                  {editingNotes ? (
                    <div className="space-y-2">
                      <Textarea
                        value={vehicleNotes}
                        onChange={(e) => setVehicleNotes(e.target.value)}
                        placeholder="Enter vehicle notes..."
                        className="min-h-[80px] text-sm"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={handleSaveVehicleNotes}>
                          Save Notes
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => {
                            setEditingNotes(false);
                            setVehicleNotes(selectedVehicle.notes || "");
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground min-h-[40px] whitespace-pre-wrap">
                      {selectedVehicle.notes || "No notes available"}
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 pt-2">
                  <Button className="flex-1 h-9" onClick={() => setCreateHuntOpen(true)}>
                    Create New Hunt
                  </Button>
                  <Button variant="outline" className="flex-1 h-9">
                    Set Driver to Time-Off mode
                  </Button>
                </div>
              </div>

              {/* Hunt Plans - Filter by selected vehicle */}
              {huntPlans
                .filter((plan) => plan.vehicleId === selectedVehicle.id)
                .map((plan) => {
                  // Calculate matching loads for this hunt (only if enabled)
                  const matchingLoads = plan.enabled ? loadEmails.filter(email => {
                    const emailTime = new Date(email.received_at);
                    const isUnreviewed = email.status === 'new' || (email.status === 'missed' && emailTime > thirtyMinutesAgo);
                    
                    if (!isUnreviewed) return false;
                    
                    const loadData = extractLoadLocation(email);
                    
                    // Match by date if specified
                    if (plan.availableDate && loadData.pickupDate) {
                      const huntDate = new Date(plan.availableDate).toISOString().split('T')[0];
                      const loadDate = new Date(loadData.pickupDate).toISOString().split('T')[0];
                      if (huntDate !== loadDate) {
                        return false;
                      }
                    }

                    // Match by load type/vehicle size if specified
                    if (plan.vehicleSize && loadData.loadType) {
                      const vehicleSizeLower = plan.vehicleSize.toLowerCase();
                      const loadTypeLower = loadData.loadType.toLowerCase();
                      
                      if (vehicleSizeLower.includes('straight')) {
                        if (!loadTypeLower.includes('straight') && !loadTypeLower.includes('van') && !loadTypeLower.includes('truck')) {
                          return false;
                        }
                      }
                    }

                    // Check distance radius if we have coordinates
                    if ((plan as any).huntCoordinates && loadData.originLat && loadData.originLng) {
                      const distance = calculateDistance(
                        (plan as any).huntCoordinates.lat,
                        (plan as any).huntCoordinates.lng,
                        loadData.originLat,
                        loadData.originLng
                      );
                      
                      const radiusMiles = parseInt(plan.pickupRadius) || 100;
                      
                      if (distance <= radiusMiles) {
                        return true;
                      }
                    } else if (loadData.originZip && plan.zipCode) {
                      if (loadData.originZip === plan.zipCode) {
                        return true;
                      }
                    }

                    return false;
                  }) : [];
                  
                  const matchCount = matchingLoads.length;
                  
                  return (
                <Card key={plan.id} className={`p-4 space-y-3 border-2 ${plan.enabled ? 'bg-card border-border' : 'bg-muted/30 border-muted'}`}>
                  {/* Status and Action Buttons */}
                  <div className="flex items-center justify-between">
                    <div className="flex gap-2 items-center">
                      <Badge variant={plan.enabled ? "default" : "secondary"} className="h-6">
                        {plan.enabled ? "Active" : "Disabled"}
                      </Badge>
                      <Button 
                        size="sm" 
                        variant="secondary" 
                        className="h-8 px-3 text-xs"
                        onClick={() => handleToggleHunt(plan.id, plan.enabled)}
                      >
                        {plan.enabled ? "Disable" : "Enable"}
                      </Button>
                      <Button 
                        size="sm" 
                        variant="secondary" 
                        className="h-8 px-3 text-xs"
                        onClick={() => handleEditHunt(plan)}
                      >
                        Edit
                      </Button>
                      <Button 
                        size="sm" 
                        variant="secondary" 
                        className="h-8 px-3 text-xs"
                        onClick={() => handleDeleteHuntPlan(plan.id)}
                      >
                        Delete
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      {matchCount > 0 && plan.enabled && (
                        <Badge className="h-6 px-2 text-xs bg-green-600 hover:bg-green-700 text-white">
                          {matchCount} {matchCount === 1 ? 'Match' : 'Matches'}
                        </Badge>
                      )}
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                        <Truck className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Hunt Plan Details */}
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="font-medium">Vehicle Size:</span>
                      <span>{plan.vehicleSize === 'large-straight' ? 'Large Straight, Small Straight' : plan.vehicleSize}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Zipcodes:</span>
                      <span>{plan.zipCode}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Search Distance (miles):</span>
                      <span>{plan.pickupRadius}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Available Feet:</span>
                      <span>{plan.availableFeet || 'TL'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Vehicle Available Time:</span>
                      <span className="text-xs">{formatDateTime(plan.availableDate, plan.availableTime)}</span>
                    </div>
                  </div>

                  {/* Meta Info */}
                  <div className="space-y-1 text-xs text-muted-foreground pt-2">
                    <div>Created by {plan.createdBy}: {getTimeAgo(plan.createdAt)}</div>
                    <div>Last Modified: {getTimeAgo(plan.lastModified)}</div>
                    <div className="text-right">Id: {plan.id}</div>
                  </div>

                  {/* Clear Matches Button */}
                  <Button variant="destructive" size="sm" className="w-full">
                    Clear Matches
                  </Button>
                </Card>
                  );
              })}
            </div>

            {/* Right Panel - Map */}
            <div className="flex-1 rounded-lg border overflow-hidden relative">
              {selectedVehicle.last_location ? (
                <div ref={mapContainer} className="w-full h-full" />
              ) : (
                <div className="w-full h-full bg-muted/10 flex items-center justify-center">
                  <div className="text-center text-sm text-muted-foreground">
                    <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Location not available</p>
                  </div>
          </div>
        )}
      </div>

      {/* Create New Hunt Dialog */}
      <Dialog open={createHuntOpen} onOpenChange={setCreateHuntOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">Create New Hunt Plan</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Plan Name */}
            <div className="space-y-2">
              <Label htmlFor="planName">Plan Name</Label>
              <Input 
                id="planName" 
                placeholder="Plan Name" 
                value={huntFormData.planName}
                onChange={(e) => setHuntFormData({...huntFormData, planName: e.target.value})}
              />
            </div>

            {/* Vehicle Size */}
            <div className="space-y-2">
              <Label htmlFor="vehicleSize">
                Vehicle Size <span className="text-destructive">*</span>
              </Label>
              <Select 
                value={huntFormData.vehicleSize}
                onValueChange={(value) => setHuntFormData({...huntFormData, vehicleSize: value})}
              >
                <SelectTrigger id="vehicleSize">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="large-straight">Large Straight, Small Straight</SelectItem>
                  <SelectItem value="small-straight">Small Straight</SelectItem>
                  <SelectItem value="large-straight-only">Large Straight</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Zip Code, Available feet, Partial */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label htmlFor="zipCode">
                  Zip Code <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Input 
                    id="zipCode" 
                    placeholder="Zip Code"
                    value={huntFormData.zipCode}
                    onChange={(e) => setHuntFormData({...huntFormData, zipCode: e.target.value})}
                  />
                  <MapPinned className="absolute right-3 top-2.5 h-4 w-4 text-primary" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="availableFeet">Available feet</Label>
                <Input 
                  id="availableFeet" 
                  placeholder="Available feet"
                  value={huntFormData.availableFeet}
                  onChange={(e) => setHuntFormData({...huntFormData, availableFeet: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label>&nbsp;</Label>
                <div className="flex items-center space-x-2 h-10">
                  <Checkbox 
                    id="partial"
                    checked={huntFormData.partial}
                    onCheckedChange={(checked) => setHuntFormData({...huntFormData, partial: checked as boolean})}
                  />
                  <label htmlFor="partial" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Partial
                  </label>
                </div>
              </div>
            </div>

            {/* Pickup Search Radius, Total Mile Limit */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="pickupRadius">Pickup Search Radius</Label>
                <Input 
                  id="pickupRadius"
                  value={huntFormData.pickupRadius}
                  onChange={(e) => setHuntFormData({...huntFormData, pickupRadius: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mileLimit">Total Mile Limit</Label>
                <Input 
                  id="mileLimit" 
                  placeholder="Total Mile Limit"
                  value={huntFormData.mileLimit}
                  onChange={(e) => setHuntFormData({...huntFormData, mileLimit: e.target.value})}
                />
              </div>
            </div>

            {/* Available Load Capacity */}
            <div className="space-y-2">
              <Label htmlFor="loadCapacity">Available Load Capacity</Label>
              <Input 
                id="loadCapacity"
                value={huntFormData.loadCapacity}
                onChange={(e) => setHuntFormData({...huntFormData, loadCapacity: e.target.value})}
              />
            </div>

            {/* Available Date and Time */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="availableDate">Available Date</Label>
                <Input 
                  id="availableDate" 
                  type="date"
                  value={huntFormData.availableDate}
                  onChange={(e) => setHuntFormData({...huntFormData, availableDate: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="availableTime">Available Time (Eastern Time)</Label>
                <Input 
                  id="availableTime" 
                  type="time"
                  value={huntFormData.availableTime}
                  onChange={(e) => setHuntFormData({...huntFormData, availableTime: e.target.value})}
                />
              </div>
            </div>

            {/* Destination Zip Code */}
            <div className="space-y-2">
              <Label htmlFor="destinationZip">Destination Zip Code (bring driver to home)</Label>
              <div className="relative">
                <Input 
                  id="destinationZip" 
                  placeholder="Destination Zip Code"
                  value={huntFormData.destinationZip}
                  onChange={(e) => setHuntFormData({...huntFormData, destinationZip: e.target.value})}
                />
                <MapPinned className="absolute right-3 top-2.5 h-4 w-4 text-primary" />
              </div>
            </div>

            {/* Destination Search Radius */}
            <div className="space-y-2">
              <Label htmlFor="destinationRadius">Destination Search Radius</Label>
              <Input 
                id="destinationRadius" 
                placeholder="Destination Search Radius"
                value={huntFormData.destinationRadius}
                onChange={(e) => setHuntFormData({...huntFormData, destinationRadius: e.target.value})}
              />
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea 
                id="notes" 
                placeholder="Notes" 
                rows={4} 
                className="resize-none"
                value={huntFormData.notes}
                onChange={(e) => setHuntFormData({...huntFormData, notes: e.target.value})}
              />
            </div>

            {/* Save and Cancel Buttons */}
            <div className="flex justify-start gap-3 pt-2">
              <Button variant="secondary" className="px-8" onClick={handleSaveHuntPlan}>
                Save
              </Button>
              <Button variant="outline" className="px-8" onClick={() => setCreateHuntOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Hunt Dialog */}
      <Dialog open={editHuntOpen} onOpenChange={setEditHuntOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">Edit Hunt Plan</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Plan Name */}
            <div className="space-y-2">
              <Label htmlFor="edit-planName">Plan Name</Label>
              <Input 
                id="edit-planName" 
                placeholder="Plan Name" 
                value={huntFormData.planName}
                onChange={(e) => setHuntFormData({...huntFormData, planName: e.target.value})}
              />
            </div>

            {/* Vehicle Size */}
            <div className="space-y-2">
              <Label htmlFor="edit-vehicleSize">
                Vehicle Size <span className="text-destructive">*</span>
              </Label>
              <Select 
                value={huntFormData.vehicleSize}
                onValueChange={(value) => setHuntFormData({...huntFormData, vehicleSize: value})}
              >
                <SelectTrigger id="edit-vehicleSize">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="large-straight">Large Straight, Small Straight</SelectItem>
                  <SelectItem value="small-straight">Small Straight</SelectItem>
                  <SelectItem value="large-straight-only">Large Straight</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Zip Code, Available feet, Partial */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label htmlFor="edit-zipCode">
                  Zip Code <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Input 
                    id="edit-zipCode" 
                    placeholder="Zip Code"
                    value={huntFormData.zipCode}
                    onChange={(e) => setHuntFormData({...huntFormData, zipCode: e.target.value})}
                  />
                  <MapPinned className="absolute right-3 top-2.5 h-4 w-4 text-primary" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-availableFeet">Available feet</Label>
                <Input 
                  id="edit-availableFeet" 
                  placeholder="Available feet"
                  value={huntFormData.availableFeet}
                  onChange={(e) => setHuntFormData({...huntFormData, availableFeet: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label>&nbsp;</Label>
                <div className="flex items-center space-x-2 h-10">
                  <Checkbox 
                    id="edit-partial"
                    checked={huntFormData.partial}
                    onCheckedChange={(checked) => setHuntFormData({...huntFormData, partial: checked as boolean})}
                  />
                  <label htmlFor="edit-partial" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Partial
                  </label>
                </div>
              </div>
            </div>

            {/* Pickup Search Radius, Total Mile Limit */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="edit-pickupRadius">Pickup Search Radius</Label>
                <Input 
                  id="edit-pickupRadius"
                  value={huntFormData.pickupRadius}
                  onChange={(e) => setHuntFormData({...huntFormData, pickupRadius: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-mileLimit">Total Mile Limit</Label>
                <Input 
                  id="edit-mileLimit" 
                  placeholder="Total Mile Limit"
                  value={huntFormData.mileLimit}
                  onChange={(e) => setHuntFormData({...huntFormData, mileLimit: e.target.value})}
                />
              </div>
            </div>

            {/* Available Load Capacity */}
            <div className="space-y-2">
              <Label htmlFor="edit-loadCapacity">Available Load Capacity</Label>
              <Input 
                id="edit-loadCapacity"
                value={huntFormData.loadCapacity}
                onChange={(e) => setHuntFormData({...huntFormData, loadCapacity: e.target.value})}
              />
            </div>

            {/* Available Date and Time */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="edit-availableDate">Available Date</Label>
                <Input 
                  id="edit-availableDate" 
                  type="date"
                  value={huntFormData.availableDate}
                  onChange={(e) => setHuntFormData({...huntFormData, availableDate: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-availableTime">Available Time (Eastern Time)</Label>
                <Input 
                  id="edit-availableTime" 
                  type="time"
                  value={huntFormData.availableTime}
                  onChange={(e) => setHuntFormData({...huntFormData, availableTime: e.target.value})}
                />
              </div>
            </div>

            {/* Destination Zip Code */}
            <div className="space-y-2">
              <Label htmlFor="edit-destinationZip">Destination Zip Code (bring driver to home)</Label>
              <div className="relative">
                <Input 
                  id="edit-destinationZip" 
                  placeholder="Destination Zip Code"
                  value={huntFormData.destinationZip}
                  onChange={(e) => setHuntFormData({...huntFormData, destinationZip: e.target.value})}
                />
                <MapPinned className="absolute right-3 top-2.5 h-4 w-4 text-primary" />
              </div>
            </div>

            {/* Destination Search Radius */}
            <div className="space-y-2">
              <Label htmlFor="edit-destinationRadius">Destination Search Radius</Label>
              <Input 
                id="edit-destinationRadius" 
                placeholder="Destination Search Radius"
                value={huntFormData.destinationRadius}
                onChange={(e) => setHuntFormData({...huntFormData, destinationRadius: e.target.value})}
              />
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="edit-notes">Notes</Label>
              <Textarea 
                id="edit-notes" 
                placeholder="Notes" 
                rows={4} 
                className="resize-none"
                value={huntFormData.notes}
                onChange={(e) => setHuntFormData({...huntFormData, notes: e.target.value})}
              />
            </div>

            {/* Update and Cancel Buttons */}
            <div className="flex justify-start gap-3 pt-2">
              <Button variant="secondary" className="px-8" onClick={handleUpdateHuntPlan}>
                Update
              </Button>
              <Button variant="outline" className="px-8" onClick={() => {
                setEditHuntOpen(false);
                setEditingHunt(null);
              }}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
        ) : selectedEmailForDetail ? (
          /* Load Email Detail View */
          <LoadEmailDetail 
            email={selectedEmailForDetail} 
            emptyDriveDistance={selectedEmailDistance}
            onClose={() => setSelectedEmailForDetail(null)}
          />
        ) : (
          /* Loads Table */
          <div className="flex-1 overflow-y-auto flex flex-col">
          <Card className="flex-1 flex flex-col">
            <CardContent className="p-0 flex-1 flex flex-col">
              <div className="border-t">
                {filteredEmails.length === 0 ? (
                  <div className="p-4 text-center text-xs text-muted-foreground">
                    {activeFilter === 'skipped' 
                      ? 'No skipped loads yet.' 
                      : activeFilter === 'unreviewed'
                      ? 'No unreviewed loads. Click "Refresh Loads" to check for new emails.'
                      : 'No load emails found yet. Click "Refresh Loads" to start monitoring your inbox.'}
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="h-7">
                          <TableHead className="w-[160px] py-0 text-[12px] leading-[1.1] text-blue-600 font-semibold">Truck - Drivers<br/>Carrier</TableHead>
                          <TableHead className="w-[110px] py-0 text-[12px] leading-[1.1] text-blue-600 font-semibold">Customer</TableHead>
                          <TableHead className="w-[100px] py-0 text-[12px] leading-[1.1] text-blue-600 font-semibold">Received<br/>Expires</TableHead>
                          <TableHead className="w-[120px] py-0 text-[12px] leading-[1.1] text-blue-600 font-semibold">Pickup Time<br/>Deliver Time</TableHead>
                          <TableHead className="w-[150px] py-0 text-[12px] leading-[1.1] text-blue-600 font-semibold">Origin<br/>Destination</TableHead>
                          <TableHead className="w-[130px] py-0 text-[12px] leading-[1.1] text-blue-600 font-semibold">Empty Drive<br/>Loaded Drive</TableHead>
                          <TableHead className="w-[130px] py-0 text-[12px] leading-[1.1] text-blue-600 font-semibold">Vehicle Type<br/>Weight</TableHead>
                          <TableHead className="w-[120px] py-0 text-[12px] leading-[1.1] text-blue-600 font-semibold">Pieces<br/>Dimensions</TableHead>
                          <TableHead className="w-[70px] py-0 text-[12px] leading-[1.1] text-blue-600 font-semibold">Avail ft</TableHead>
                          <TableHead className="w-[80px] py-0 text-[12px] leading-[1.1] text-blue-600 font-semibold">Source</TableHead>
                          <TableHead className="w-[90px] py-0 text-[12px] leading-[1.1] text-blue-600 font-semibold">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredEmails
                          .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                          .map((email) => {
                          const data = email.parsed_data || {};
                          const receivedDate = new Date(email.received_at);
                          const now = new Date();
                          const diffMs = now.getTime() - receivedDate.getTime();
                          const diffMins = Math.floor(diffMs / 60000);
                          const diffHours = Math.floor(diffMins / 60);
                          const diffDays = Math.floor(diffHours / 24);
                          
                          let receivedAgo = '';
                          if (diffDays > 0) receivedAgo = `${diffDays}d ${diffHours % 24}h ago`;
                          else if (diffHours > 0) receivedAgo = `${diffHours}h ${diffMins % 60}m ago`;
                          else receivedAgo = `${diffMins}m ago`;

                          return (
                            <TableRow 
                              key={email.id} 
                              className="h-10 cursor-pointer hover:bg-accent transition-colors"
                              onClick={() => setSelectedEmailForDetail(email)}
                            >
                              <TableCell className="py-1">
                                <div className="text-[11px] font-medium leading-tight whitespace-nowrap">Available</div>
                                <div className="text-[10px] text-muted-foreground truncate leading-tight whitespace-nowrap">
                                  {email.from_name || email.from_email.split('@')[0]}
                                </div>
                              </TableCell>
                              <TableCell className="py-1">
                                <div className="flex items-center gap-1 whitespace-nowrap">
                                  <Badge variant="outline" className="h-4 px-1 text-[10px] flex-shrink-0">
                                    {email.status === 'new' ? '🟡' : '🟢'}
                                  </Badge>
                                  <div className="text-[11px] font-medium leading-tight whitespace-nowrap">
                                    {(() => {
                                      const customerName = data.customer || email.from_name || 'Unknown';
                                      return customerName.length > 22 ? customerName.slice(0, 22) + '...' : customerName;
                                    })()}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="py-1">
                                <div className="text-[11px] leading-tight whitespace-nowrap">{receivedAgo}</div>
                                <div className="text-[10px] text-muted-foreground leading-tight whitespace-nowrap">
                                  {data.expires_time || '—'}
                                </div>
                              </TableCell>
                              <TableCell className="py-1">
                                <div className="text-[11px] leading-tight whitespace-nowrap">
                                  {data.pickup_date || '—'} {data.pickup_time || ''}
                                </div>
                                <div className="text-[11px] leading-tight whitespace-nowrap">
                                  {data.delivery_date || '—'} {data.delivery_time || ''}
                                </div>
                              </TableCell>
                              <TableCell className="py-1">
                                <div className="text-[11px] font-medium leading-tight whitespace-nowrap">
                                  {data.origin_city || '—'}, {data.origin_state || '—'}
                                </div>
                                <div className="text-[11px] leading-tight whitespace-nowrap">
                                  {data.destination_city || '—'}, {data.destination_state || '—'}
                                </div>
                              </TableCell>
                              <TableCell className="py-1">
                                <div className="text-[11px] leading-tight whitespace-nowrap">
                                  {loadDistances.has(email.id) 
                                    ? `${loadDistances.get(email.id)} mi` 
                                    : (data.empty_miles !== null && data.empty_miles !== undefined ? `${data.empty_miles} mi` : '—')
                                  }
                                </div>
                                <div className="text-[11px] leading-tight whitespace-nowrap">
                                  {data.loaded_miles ? `${data.loaded_miles} mi` : '—'}
                                </div>
                              </TableCell>
                              <TableCell className="py-1">
                                <div className="text-[11px] leading-tight whitespace-nowrap">{data.vehicle_type || '—'}</div>
                                <div className="text-[11px] leading-tight whitespace-nowrap">{data.weight ? `${data.weight} lbs` : '—'}</div>
                              </TableCell>
                              <TableCell className="py-1">
                                <div className="text-[11px] leading-tight whitespace-nowrap">{data.pieces || '—'}</div>
                                <div className="text-[10px] text-muted-foreground leading-tight whitespace-nowrap">{data.dimensions || 'Not Specified'}</div>
                              </TableCell>
                              <TableCell className="py-1">
                                <div className="text-[11px] leading-tight whitespace-nowrap">{data.avail_ft ? `${data.avail_ft} ft` : '—'}</div>
                              </TableCell>
                              <TableCell className="py-1">
                                <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                                  {email.from_email.includes('@') ? email.from_email.split('@')[1].split('.')[0] : 'Email'}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right py-1">
                                <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-6 w-6 p-0 rounded-full text-red-500 hover:bg-red-50 hover:text-red-700" 
                                    aria-label="Skip load"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSkipEmail(email.id);
                                    }}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-6 w-6 p-0 rounded-full bg-blue-500 text-white hover:bg-blue-600" 
                                    aria-label="Move to waitlist"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleMoveToWaitlist(email.id);
                                    }}
                                  >
                                    <MoreVertical className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  
                  {/* Pagination bar at bottom - inline, not floating */}
                  <div className="flex items-center justify-between px-4 py-3 border-t bg-background">
                    <div className="flex items-center gap-6 text-sm text-muted-foreground">
                      <span>Items per page: {itemsPerPage}</span>
                      <span>
                        {Math.min((currentPage - 1) * itemsPerPage + 1, filteredEmails.length)} - {Math.min(currentPage * itemsPerPage, filteredEmails.length)} of {filteredEmails.length}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setCurrentPage(1)}
                        disabled={currentPage === 1}
                      >
                        <ChevronsLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                        disabled={currentPage === 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setCurrentPage(Math.min(Math.ceil(filteredEmails.length / itemsPerPage), currentPage + 1))}
                        disabled={currentPage >= Math.ceil(filteredEmails.length / itemsPerPage)}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setCurrentPage(Math.ceil(filteredEmails.length / itemsPerPage))}
                        disabled={currentPage >= Math.ceil(filteredEmails.length / itemsPerPage)}
                      >
                        <ChevronsRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
              </div>
            </CardContent>
          </Card>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
