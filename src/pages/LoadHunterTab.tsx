import { useEffect, useState, useRef } from "react";
import React from "react";
import { supabase } from "@/integrations/supabase/client";
import LoadEmailDetail from "@/components/LoadEmailDetail";
import { MultipleMatchesDialog } from "@/components/MultipleMatchesDialog";
import { VehicleAssignmentView } from "@/components/VehicleAssignmentView";
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
import { RefreshCw, Settings, X, CheckCircle, MapPin, Wrench, ArrowLeft, Gauge, Truck, MapPinned, Volume2, VolumeX, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, MoreVertical, Target } from "lucide-react";
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

interface Vehicle {
  id: string;
  vehicle_number: string | null;
  carrier: string | null;
  asset_type: string | null;
  asset_subtype: string | null;
  dimensions_length: number | null;
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
  vehicleSizes: string[];
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
  const [loadMatches, setLoadMatches] = useState<any[]>([]); // Active matches (is_active = true)
  const [skippedMatches, setSkippedMatches] = useState<any[]>([]); // Skipped/inactive matches
  const [unreviewedViewData, setUnreviewedViewData] = useState<any[]>([]); // Efficient server-side filtered data
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [selectedEmailForDetail, setSelectedEmailForDetail] = useState<any | null>(null);
  const [selectedEmailDistance, setSelectedEmailDistance] = useState<number | undefined>(undefined);
  const [selectedMatchForDetail, setSelectedMatchForDetail] = useState<any | null>(null);
  const [mapboxToken, setMapboxToken] = useState<string>("");
  const [createHuntOpen, setCreateHuntOpen] = useState(false);
  const [huntPlans, setHuntPlans] = useState<HuntPlan[]>([]);
  const [editingHunt, setEditingHunt] = useState<HuntPlan | null>(null);
  const [editHuntOpen, setEditHuntOpen] = useState(false);
  const [carriersMap, setCarriersMap] = useState<Record<string, string>>({});
  const [payeesMap, setPayeesMap] = useState<Record<string, string>>({});
  const [huntFormData, setHuntFormData] = useState({
    planName: "",
    vehicleSizes: ["large-straight"] as string[],
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
  const [showMultipleMatchesDialog, setShowMultipleMatchesDialog] = useState(false);
  const [multipleMatches, setMultipleMatches] = useState<any[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 17;
  const [currentDispatcherId, setCurrentDispatcherId] = useState<string | null>(null);
  const [myVehicleIds, setMyVehicleIds] = useState<string[]>([]);
  const mapContainer = React.useRef<HTMLDivElement>(null);
  const map = React.useRef<mapboxgl.Map | null>(null);

  // Helper to get current time (recalculates each render for accurate filtering)
  const getCurrentTime = () => new Date();
  const getThirtyMinutesAgo = () => new Date(getCurrentTime().getTime() - 30 * 60 * 1000);
  
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
  
  // Map each load email to the specific hunt plan it matched
  const [loadHuntMap, setLoadHuntMap] = useState<Map<string, string>>(new Map());
  
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
  const extractLoadLocation = (email: any): { originZip?: string, originLat?: number, originLng?: number, originCityState?: string, loadType?: string, vehicleType?: string, pickupDate?: string } => {
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
          loadType: parsed.load_type,
          vehicleType: parsed.vehicle_type || parsed.equipment_type,
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

  // Core matching logic - now async to support geocoding
  const doesLoadMatchHunt = async (loadData: {
    originZip?: string;
    originLat?: number;
    originLng?: number;
    originCityState?: string;
    loadType?: string;
    vehicleType?: string;
    pickupDate?: string;
  }, hunt: HuntPlan): Promise<{ matches: boolean; distance?: number }> => {
    // Match by date if specified
    if (hunt.availableDate && loadData.pickupDate) {
      const huntDateObj = new Date(hunt.availableDate);
      const loadDateObj = new Date(loadData.pickupDate);

      if (isNaN(huntDateObj.getTime()) || isNaN(loadDateObj.getTime())) {
        return { matches: false };
      }

      const huntDate = huntDateObj.toISOString().split('T')[0];
      const loadDate = loadDateObj.toISOString().split('T')[0];
      if (huntDate !== loadDate) {
        return { matches: false };
      }
    }

    // Match by load type/vehicle size if specified
    if (hunt.vehicleSizes && hunt.vehicleSizes.length > 0 && loadData.vehicleType) {
      const loadVehicle = loadData.vehicleType.toLowerCase();

      // Define matching rules for each hunt type
      const matchRules: Record<string, string[]> = {
        'large-straight': ['large straight', 'small straight', 'straight', 'straight truck'],
        'large-straight-only': ['large straight'],
        'small-straight': ['small straight'],
        'cargo-van': ['cargo van'],
        'cube-van': ['cube van'],
        'sprinter': ['sprinter', 'sprinter van'],
        'sprinter-van': ['sprinter van', 'sprinter'],
        'sprinter-team': ['sprinter team'],
        'van': ['van', 'cargo van', 'sprinter van', 'cube van'],
        'straight': ['straight', 'straight truck', 'large straight', 'small straight'],
        'straight-truck': ['straight truck', 'straight', 'large straight', 'small straight'],
        'straight-liftgate': ['straight with liftgate', 'lift gate truck'],
        'dock-high-straight': ['dock high straight'],
        'large-straight-team': ['large straight team'],
        'lift-gate-truck': ['lift gate truck', 'straight with liftgate'],
        'flatbed': ['flatbed'],
        'tractor': ['tractor', 'semi'],
        'semi': ['semi', 'tractor'],
        'reefer-sprinter': ['reefer sprinter van'],
      };

      // Check if ANY selected vehicle type matches the load
      const vehicleMatches = hunt.vehicleSizes.some(huntSize => {
        const allowedVehicles = matchRules[huntSize] || [huntSize.replace(/-/g, ' ')];
        return allowedVehicles.some(v => loadVehicle.includes(v) || v.includes(loadVehicle));
      });
      
      if (!vehicleMatches) {
        return { matches: false };
      }
    }

    // Try to get load coordinates - geocode if needed
    let loadLat = loadData.originLat;
    let loadLng = loadData.originLng;
    
    if ((!loadLat || !loadLng) && loadData.originCityState && hunt.huntCoordinates) {
      const coords = await geocodeLocation(loadData.originCityState);
      if (coords) {
        loadLat = coords.lat;
        loadLng = coords.lng;
      }
    }

    // Check distance radius if we have both coordinates
    if (hunt.huntCoordinates && loadLat && loadLng) {
      const distance = calculateDistance(
        hunt.huntCoordinates.lat,
        hunt.huntCoordinates.lng,
        loadLat,
        loadLng
      );

      const radiusMiles = parseInt(hunt.pickupRadius) || 100;

      if (distance <= radiusMiles) {
        return { matches: true, distance };
      }
    } else if (loadData.originZip && hunt.zipCode) {
      // Fallback to exact zip code matching
      if (loadData.originZip === hunt.zipCode) {
        return { matches: true };
      }
    }

    return { matches: false };
  };

  // Effect to search through loads when hunts change and persist ALL matches to database
  // 24/7 MATCHING: Processes ALL loads with status 'new' regardless of age
  useEffect(() => {
    const searchLoadsForHunts = async () => {
      console.log('🔍 Running hunt matching logic. LoadEmails:', loadEmails.length, 'Hunt plans:', huntPlans.length);
      
      const enabledHunts = huntPlans.filter(h => h.enabled);
      if (enabledHunts.length === 0) {
        console.log('❌ No enabled hunt plans');
        setMatchedLoadIds(new Set());
        setLoadDistances(new Map());
        setLoadHuntMap(new Map());
        return;
      }
      
      console.log('✅ Found', enabledHunts.length, 'enabled hunt plans');
      
      // 24/7: Consider ALL loads with "new" status regardless of age
      const candidateLoads = loadEmails.filter(email => email.status === 'new');
      
      console.log('📧 Candidate loads for matching (24/7):', candidateLoads.length);
      
      const newMatchedIds = new Set<string>();
      const newDistances = new Map<string, number>();
      const newHuntMap = new Map<string, string>();
      let matchCount = 0;
      let skippedCount = 0;
      
      // Collect all matches first, then batch insert
      const allMatches: Array<{
        load_email_id: string;
        hunt_plan_id: string;
        vehicle_id: string;
        distance_miles: number | null;
        is_active: boolean;
      }> = [];
      
      // Check each load against ALL hunt plans and create matches for ALL that match
      for (const email of candidateLoads) {
        const loadData = extractLoadLocation(email);
        
        // Better location data logging for debugging
        if (!loadData.originCityState && !loadData.originZip) {
          skippedCount++;
          continue;
        }
        
        // Find ALL hunts that match this load (async now because of geocoding)
        const matchResults = await Promise.all(
          enabledHunts.map(hunt => doesLoadMatchHunt(loadData, hunt))
        );
        
        const matchingHunts = enabledHunts.filter((_, index) => matchResults[index].matches);
        
        if (matchingHunts.length > 0) {
          matchCount++;
          console.log('✅ Match found:', email.subject?.substring(0, 50), '→', matchingHunts.length, 'hunt(s)');
          
          newMatchedIds.add(email.id);
          newHuntMap.set(email.id, matchingHunts[0].id);
          
          // Calculate distance from first match for display
          const firstMatchDistance = matchResults[enabledHunts.indexOf(matchingHunts[0])].distance;
          if (firstMatchDistance) {
            newDistances.set(email.id, Math.round(firstMatchDistance));
          }
          
          // Collect matches for batch insert
          for (let i = 0; i < matchingHunts.length; i++) {
            const matchingHunt = matchingHunts[i];
            const matchIndex = enabledHunts.indexOf(matchingHunt);
            const matchDistance = matchResults[matchIndex].distance;
            
            allMatches.push({
              load_email_id: email.id,
              hunt_plan_id: matchingHunt.id,
              vehicle_id: matchingHunt.vehicleId,
              distance_miles: matchDistance || null,
              is_active: true,
            });
          }
        }
      }
      
      // Batch upsert all matches at once
      if (allMatches.length > 0) {
        console.log('💾 Batch saving', allMatches.length, 'matches');
        const { error } = await supabase
          .from('load_hunt_matches')
          .upsert(allMatches, { onConflict: 'load_email_id,hunt_plan_id' });
        
        if (error) {
          console.error('❌ Error batch persisting matches:', error);
        } else {
          console.log('✅ Batch saved', allMatches.length, 'matches');
        }
      }
      
      console.log('🎯 Matching complete:', matchCount, 'matched,', skippedCount, 'skipped (no location)');
      
      setMatchedLoadIds(newMatchedIds);
      setLoadDistances(newDistances);
      setLoadHuntMap(newHuntMap);
      
      // Reload matches after creating them
      await loadHuntMatches();
      await loadUnreviewedMatches(); // Refresh server-side view for Unreviewed tab
    };
    
    if (huntPlans.length > 0 && loadEmails.length > 0) {
      console.log('🚀 Triggering hunt matching');
      searchLoadsForHunts();
    } else if (huntPlans.length === 0) {
      console.log('⚠️ No hunt plans available');
      setMatchedLoadIds(new Set());
      setLoadDistances(new Map());
      setLoadHuntMap(new Map());
    }
  }, [loadEmails.length, huntPlans.length, loadEmails, huntPlans]);

  // 24/7 PERIODIC RE-MATCH: Continuously checks for unmatched loads every 2 minutes
  // This catches loads that failed geocoding initially and ensures continuous operation
  useEffect(() => {
    if (huntPlans.length === 0) return;
    
    console.log('⏰ Starting 24/7 periodic re-match (every 2 minutes)');
    
    const interval = setInterval(() => {
      console.log('⏰ Periodic re-match triggered');
      // Force re-matching by updating state (triggers the matching useEffect above)
      setLoadEmails(current => [...current]);
    }, 2 * 60 * 1000); // Every 2 minutes
    
    return () => {
      console.log('⏰ Stopping 24/7 periodic re-match');
      clearInterval(interval);
    };
  }, [huntPlans.length]);

  // Use saved distance from match - no recalculation needed
  useEffect(() => {
    // If we have a match, use its saved distance_miles value
    // This avoids recalculating and making unnecessary Mapbox API calls
    if (selectedMatchForDetail && selectedMatchForDetail.distance_miles !== undefined) {
      setSelectedEmailDistance(selectedMatchForDetail.distance_miles);
    } else {
      setSelectedEmailDistance(undefined);
    }
  }, [selectedMatchForDetail]);
  
  // Filter based on active filter - for unreviewed, use matches instead of emails
  const filteredEmails = activeFilter === 'unreviewed' 
    ? [] // Don't use emails for unreviewed
    : loadEmails.filter(email => {
        // CRITICAL: Skipped and waitlist loads should always be visible
        if (email.status === 'skipped' || email.status === 'waitlist') {
          if (activeFilter === 'skipped') return email.status === 'skipped';
          if (activeFilter === 'waitlist') return email.status === 'waitlist';
          if (activeFilter === 'all') return true;
          return false;
        }
        
        if (activeFilter === 'missed') {
          return email.marked_missed_at !== null;
        }
        if (activeFilter === 'issues') {
          return email.has_issues === true;
        }
        if (activeFilter === 'all') return true;
        return true;
      });

  // Get filtered matches for unreviewed - USE SERVER-SIDE VIEW DATA for scalability
  const filteredMatches = activeFilter === 'unreviewed'
    ? unreviewedViewData
        .filter(match => {
          // Filter by dispatcher's vehicles when in MY TRUCKS mode
          if (activeMode === 'dispatch' && myVehicleIds.length > 0) {
            if (!myVehicleIds.includes(match.vehicle_id)) return false;
          }
          return true;
        })
        .sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime())
    : [];

  // Count uses server-side view data for accuracy
  const unreviewedCount = unreviewedViewData.filter(match => {
    if (activeMode === 'dispatch' && myVehicleIds.length > 0) {
      if (!myVehicleIds.includes(match.vehicle_id)) return false;
    }
    return true;
  }).length;
  
  const missedCount = loadEmails.filter(e => e.marked_missed_at !== null).length;
  const waitlistCount = loadEmails.filter(e => e.status === 'waitlist').length;
  const skippedCount = skippedMatches.length;
  const issuesCount = loadEmails.filter(e => e.has_issues === true).length;

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

  // Fetch current user's dispatcher info and assigned vehicles
  useEffect(() => {
    const fetchUserDispatcherInfo = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      console.log('🔍 Current user:', user?.email);
      
      if (user?.email) {
        // Check if user is a dispatcher
        const { data: dispatcher, error: dispatcherError } = await supabase
          .from('dispatchers')
          .select('id, first_name, last_name, email')
          .ilike('email', user.email)
          .single();
        
        console.log('🔍 Dispatcher lookup:', { dispatcher, error: dispatcherError });
        
        if (dispatcher) {
          setCurrentDispatcherId(dispatcher.id);
          console.log('✅ Found dispatcher:', dispatcher.first_name, dispatcher.last_name, 'ID:', dispatcher.id);
          
          // Get vehicles assigned to this dispatcher
          const { data: assignedVehicles, error: vehiclesError } = await supabase
            .from('vehicles')
            .select('id, vehicle_number')
            .eq('primary_dispatcher_id', dispatcher.id);
          
          console.log('🔍 Assigned vehicles:', { assignedVehicles, error: vehiclesError });
          
          if (assignedVehicles) {
            setMyVehicleIds(assignedVehicles.map(v => v.id));
            console.log('✅ My vehicle IDs:', assignedVehicles.map(v => v.id));
          }
        } else {
          console.log('❌ No dispatcher found for email:', user.email);
        }
      }
    };
    fetchUserDispatcherInfo();
  }, []);

  useEffect(() => {
    loadVehicles();
    loadDrivers();
    loadLoadEmails();
    loadHuntPlans();
    loadHuntMatches();
    loadUnreviewedMatches(); // Load from efficient server-side view
    loadCarriersAndPayees();
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

    // Subscribe to real-time updates for load_hunt_matches
    const matchesChannel = supabase
      .channel('load-hunt-matches-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'load_hunt_matches'
        },
        (payload) => {
          console.log('Load hunt match change:', payload);
          // Reload matches on any change
          loadHuntMatches();
          loadUnreviewedMatches(); // Also refresh server-side view
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(emailsChannel);
      supabase.removeChannel(huntPlansChannel);
      supabase.removeChannel(matchesChannel);
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

  // Auto-mark loads for missed tracking after 15 minutes (without changing status)
  useEffect(() => {
    const checkMissedLoads = async () => {
      const now = new Date();
      const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);
      
      // Find all 'new' status loads that are older than 15 minutes and not yet marked for missed tracking
      const loadsToMark = loadEmails.filter(email => {
        const emailTime = new Date(email.received_at);
        return email.status === 'new' && !email.marked_missed_at && emailTime <= fifteenMinutesAgo;
      });

      if (loadsToMark.length > 0) {
        console.log(`Marking ${loadsToMark.length} loads for missed tracking (keeping in unreviewed)`);
        
        const timestamp = new Date().toISOString();
        const loadIds = loadsToMark.map(load => load.id);
        
        // Batch update in chunks of 50 to avoid URL length limits
        const CHUNK_SIZE = 50;
        let hasError = false;
        
        for (let i = 0; i < loadIds.length; i += CHUNK_SIZE) {
          const chunk = loadIds.slice(i, i + CHUNK_SIZE);
          const { error } = await supabase
            .from('load_emails')
            .update({ marked_missed_at: timestamp })
            .in('id', chunk);
          
          if (error) {
            console.error(`Error batch marking chunk ${i}-${i + chunk.length}:`, error);
            hasError = true;
          }
        }

        if (hasError) {
          console.error('Some batches failed when marking loads for missed tracking');
        } else {
          // Prepare history records for batch insert
          const historyRecords = loadsToMark.map(load => ({
            load_email_id: load.id,
            missed_at: timestamp,
            from_email: load.from_email,
            subject: load.subject,
            received_at: load.received_at,
          }));

          // Log all marked loads to history in one batch
          const { error: historyError } = await supabase
            .from('missed_loads_history')
            .insert(historyRecords);
          
          if (historyError) {
            console.error('Error logging to missed_loads_history:', historyError);
          } else {
            console.log(`Logged ${historyRecords.length} loads to missed history`);
          }

          // Refresh the load emails list
          await loadLoadEmails();
        }
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

  const loadCarriersAndPayees = async () => {
    try {
      // Load carriers
      const { data: carriersData, error: carriersError } = await supabase
        .from("carriers")
        .select("id, name")
        .in("status", ["active", "Active", "ACTIVE"]);

      if (!carriersError && carriersData) {
        const cMap: Record<string, string> = {};
        carriersData.forEach((carrier: any) => {
          cMap[carrier.id] = carrier.name;
        });
        setCarriersMap(cMap);
      }

      // Load payees
      const { data: payeesData, error: payeesError } = await supabase
        .from("payees")
        .select("id, name")
        .in("status", ["active", "Active", "ACTIVE"]);

      if (!payeesError && payeesData) {
        const pMap: Record<string, string> = {};
        payeesData.forEach((payee: any) => {
          pMap[payee.id] = payee.name;
        });
        setPayeesMap(pMap);
      }
    } catch (error: any) {
      console.error("Failed to load carriers/payees", error);
    }
  };

  const loadLoadEmails = async (retries = 3) => {
    console.log('📧 Loading emails...');
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        // Fetch emails with relevant statuses OR with issues
        const { data, error } = await supabase
          .from("load_emails")
          .select("*")
          .or('status.in.(new,waitlist,skipped),has_issues.eq.true')
          .order("received_at", { ascending: false })
          .limit(5000);

        if (error) {
          console.error(`📧 Attempt ${attempt} failed:`, error);
          if (attempt === retries) {
            toast.error('Failed to load emails - please refresh');
            return;
          }
          await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 500));
          continue;
        }
        console.log(`✅ Loaded ${data?.length || 0} emails`);
        setLoadEmails(data || []);
        return;
      } catch (err) {
        console.error(`📧 Attempt ${attempt} error:`, err);
        if (attempt === retries) {
          toast.error('Failed to load emails - please refresh');
        }
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 500));
      }
    }
  };

  const loadHuntPlans = async (retries = 3) => {
    console.log('🎯 Loading hunt plans...');
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const { data, error } = await supabase
          .from("hunt_plans")
          .select("*")
          .order("created_at", { ascending: false });

        if (error) {
          console.error(`🎯 Attempt ${attempt} failed:`, error);
          if (attempt === retries) {
            toast.error('Failed to load hunt plans - please refresh');
            return;
          }
          await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 500));
          continue;
        }
        
        console.log(`✅ Loaded ${data?.length || 0} hunt plans`);
        const transformedPlans: HuntPlan[] = (data || []).map((plan: any) => {
          // Parse vehicle_size - could be JSON array or legacy string
          let vehicleSizes: string[] = [];
          if (plan.vehicle_size) {
            try {
              const parsed = JSON.parse(plan.vehicle_size);
              vehicleSizes = Array.isArray(parsed) ? parsed : [plan.vehicle_size];
            } catch {
              vehicleSizes = [plan.vehicle_size];
            }
          }
          return {
            id: plan.id,
            vehicleId: plan.vehicle_id,
            planName: plan.plan_name,
            vehicleSizes,
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
            enabled: plan.enabled !== false,
          };
        });
        
        setHuntPlans(transformedPlans);
        return;
      } catch (err) {
        console.error(`🎯 Attempt ${attempt} error:`, err);
        if (attempt === retries) {
          toast.error('Failed to load hunt plans - please refresh');
        }
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 500));
      }
    }
  };

  const loadHuntMatches = async (retries = 3) => {
    console.log('🔗 Loading hunt matches...');
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const { data, error } = await supabase
          .from("load_hunt_matches")
          .select("*");

        if (error) {
          console.error(`🔗 Attempt ${attempt} failed:`, error);
          if (attempt === retries) {
            toast.error('Failed to load hunt matches - please refresh');
            return;
          }
          await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 500));
          continue;
        }
        
        console.log(`✅ Loaded ${data?.length || 0} hunt matches`);
        const allMatches = data || [];
        const active = allMatches.filter((m: any) => m.is_active !== false);
        const skipped = allMatches.filter((m: any) => m.is_active === false);

        console.log(`   Active: ${active.length}, Skipped: ${skipped.length}`);
        
        setLoadMatches(active);
        setSkippedMatches(skipped);
        
        const huntMap = new Map<string, string>();
        const distances = new Map<string, number>();
        const matchedIds = new Set<string>();
        
        active.forEach((match: any) => {
          huntMap.set(match.load_email_id, match.hunt_plan_id);
          if (match.distance_miles) {
            distances.set(match.load_email_id, match.distance_miles);
          }
          matchedIds.add(match.load_email_id);
        });
        
        setLoadHuntMap(huntMap);
        setLoadDistances(distances);
        setMatchedLoadIds(matchedIds);
        return;
      } catch (err) {
        console.error(`🔗 Attempt ${attempt} error:`, err);
        if (attempt === retries) {
          toast.error('Failed to load hunt matches - please refresh');
        }
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 500));
      }
    }
  };

  // Load unreviewed matches efficiently from database view (server-side filtering)
  const loadUnreviewedMatches = async (retries = 3) => {
    console.log('🚀 Loading unreviewed matches from view...');
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const { data, error } = await supabase
          .from("unreviewed_matches")
          .select("*")
          .limit(500);

        if (error) {
          console.error(`🚀 Attempt ${attempt} failed:`, error);
          if (attempt === retries) {
            toast.error('Failed to load unreviewed matches - please refresh');
            return;
          }
          await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 500));
          continue;
        }
        
        console.log(`✅ Loaded ${data?.length || 0} unreviewed matches from view`);
        setUnreviewedViewData(data || []);
        return;
      } catch (err) {
        console.error(`🚀 Attempt ${attempt} error:`, err);
        if (attempt === retries) {
          toast.error('Failed to load unreviewed matches - please refresh');
        }
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 500));
      }
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
        // Reload the load emails table and unreviewed view
        await loadLoadEmails();
        await loadUnreviewedMatches();
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

  const handleReparseEmails = async () => {
    setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke('reparse-load-emails');

      if (error) {
        console.error('reparse-load-emails error:', error);
        throw new Error(error.message || 'Failed to reparse emails');
      }

      console.log('Reparse response:', data);

      if (data?.success > 0) {
        toast.success(`Reparsed ${data.success} emails successfully`);
        await loadLoadEmails();
        await loadUnreviewedMatches();
      } else {
        toast.info('No emails to reparse');
      }
    } catch (error: any) {
      console.error('Reparse error:', error);
      toast.error('Failed to reparse emails');
    } finally {
      setRefreshing(false);
    }
  };

  const handleSkipMatch = async (matchId: string) => {
    try {
      const { error } = await supabase
        .from('load_hunt_matches')
        .update({ is_active: false })
        .eq('id', matchId);

      if (error) throw error;

      await loadHuntMatches();
      await loadUnreviewedMatches();
      toast.success('Match skipped');
    } catch (error) {
      console.error('Error skipping match:', error);
      toast.error('Failed to skip match');
    }
  };

  const handleDismissIssue = async (emailId: string) => {
    try {
      const { error } = await supabase
        .from('load_emails')
        .update({ 
          has_issues: false,
          issue_notes: null
        })
        .eq('id', emailId);

      if (error) throw error;

      await loadLoadEmails();
      toast.success('Issue dismissed');
    } catch (error) {
      console.error('Error dismissing issue:', error);
      toast.error('Failed to dismiss issue');
    }
  };

  const handleSkipEmail = async (emailId: string) => {
    try {
      const { error } = await supabase
        .from('load_emails')
        .update({ 
          status: 'skipped',
          marked_missed_at: null // Clear missed tracking when skipped
        })
        .eq('id', emailId);

      if (error) throw error;

      // Reload emails to update counts and filtered view
      await loadLoadEmails();
      await loadUnreviewedMatches();
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

      // Remove from UI and reload view
      setLoadEmails(loadEmails.filter(email => email.id !== emailId));
      await loadUnreviewedMatches();
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
        .update({ 
          status: 'waitlist',
          marked_missed_at: null // Clear missed tracking when waitlisted
        })
        .eq('id', emailId);

      if (error) throw error;

      // Reload emails to update counts and filtered view
      await loadLoadEmails();
      await loadUnreviewedMatches();
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
          vehicle_size: JSON.stringify(huntFormData.vehicleSizes),
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
        vehicleSizes: ["large-straight"],
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
      
      // If enabling the hunt (was disabled, now enabled), retroactively check loads from last 30 min
      if (currentEnabled === false) {
        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
        
        // Get loads from the last 30 minutes that are currently in "new" or "missed" status
        const { data: recentLoads, error: fetchError } = await supabase
          .from('load_emails')
          .select('*')
          .gte('received_at', thirtyMinutesAgo.toISOString())
          .in('status', ['new', 'missed']);
        
        if (!fetchError && recentLoads) {
          // Get the updated hunt plan
          const { data: updatedHunt } = await supabase
            .from('hunt_plans')
            .select('*')
            .eq('id', id)
            .single();
          
          if (updatedHunt) {
            // Check each recent load against the hunt criteria
            for (const load of recentLoads) {
              const loadData = extractLoadLocation(load);
              
              // Simple matching logic (you can expand this to use the full loadMatchesHunt logic)
              let matches = true;
              
              // Match by load type if specified
              if (updatedHunt.vehicle_size && loadData.loadType) {
                matches = loadData.loadType.toLowerCase().includes(updatedHunt.vehicle_size.toLowerCase());
              }
              
              // If matches, ensure it's marked as "new" so it appears in unreviewed
              if (matches && load.status === 'missed') {
                await supabase
                  .from('load_emails')
                  .update({ status: 'new' })
                  .eq('id', load.id);
              }
            }
          }
        }
      }
      
      // Trigger re-filtering of loads
      await loadLoadEmails();
      
      toast.success(currentEnabled ? "Hunt disabled" : "Hunt enabled - checking recent loads");
    } catch (error) {
      console.error("Error toggling hunt:", error);
      toast.error("Failed to toggle hunt");
    }
  };

  const handleEditHunt = (hunt: HuntPlan) => {
    setEditingHunt(hunt);
    setHuntFormData({
      planName: hunt.planName,
      vehicleSizes: hunt.vehicleSizes,
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
          vehicle_size: JSON.stringify(huntFormData.vehicleSizes),
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
        vehicleSizes: ["large-straight"],
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
            
            {issuesCount > 0 && (
              <Button
                size="sm" 
                variant="outline"
                className={`h-7 px-2.5 text-xs gap-1.5 ${
                  activeFilter === 'issues' 
                    ? 'bg-amber-600 hover:bg-amber-700 text-white border-amber-600' 
                    : 'bg-white hover:bg-gray-50 text-amber-700 border-amber-300'
                }`}
                onClick={() => {
                  setActiveFilter('issues');
                  setSelectedVehicle(null);
                  setSelectedEmailForDetail(null);
                }}
              >
                ⚠️ Issues
                <Badge variant="destructive" className="h-4 px-1.5 text-[10px] ml-1 bg-amber-500 text-white">{issuesCount}</Badge>
              </Button>
            )}
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
            
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-7 text-xs px-2.5 bg-blue-600 hover:bg-blue-700 text-white border-blue-600"
              onClick={async () => {
                setRefreshing(true);
                try {
                  // Force re-search of loads from last 30 minutes against hunt plans
                  const enabledHunts = huntPlans.filter(h => h.enabled);
                  if (enabledHunts.length === 0) {
                    toast.error("No active hunt plans to match");
                    setRefreshing(false);
                    return;
                  }
                  
                  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
                  const recentLoads = loadEmails.filter(email => {
                    const receivedAt = new Date(email.received_at);
                    return receivedAt >= thirtyMinutesAgo && email.status === 'new';
                  });
                  
                  toast.success(`Re-checking ${recentLoads.length} loads from last 30 min against ${enabledHunts.length} active hunt(s)`);
                  
                  // Trigger re-evaluation by forcing state update
                  await loadLoadEmails();
                } catch (error) {
                  console.error("Error refreshing hunts:", error);
                  toast.error("Failed to refresh hunts");
                } finally {
                  setRefreshing(false);
                }
              }}
              disabled={refreshing}
            >
              <Target className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Refresh Hunts
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-7 text-xs px-2.5"
              onClick={handleReparseEmails}
              disabled={refreshing}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Reparsing..." : "Reparse All"}
            </Button>
          </div>
        </div>

      {/* Main Content Area */}
      <div className="flex flex-1 gap-2 overflow-y-auto overflow-x-hidden pt-3">
        {/* Left Sidebar - Vehicles - Always Visible */}
        <div className="w-64 flex-shrink-0 space-y-1 overflow-y-auto border-r pr-2">
          {loading ? (
            <div className="text-xs text-muted-foreground">Loading...</div>
          ) : vehicles.filter(v => activeMode === 'admin' || myVehicleIds.includes(v.id)).length === 0 ? (
            <div className="text-xs text-muted-foreground">
              {activeMode === 'dispatch' ? 'No trucks assigned to you' : 'No active trucks'}
            </div>
          ) : (
            vehicles
              .filter(v => activeMode === 'admin' || myVehicleIds.includes(v.id))
              .map((vehicle) => {
              const hasEnabledHunt = huntPlans.some(plan => plan.vehicleId === vehicle.id && plan.enabled);
              return (
                <Card 
                  key={vehicle.id} 
                  className={`p-2 hover:bg-muted/50 transition-colors cursor-pointer rounded-sm ${
                    hasEnabledHunt ? 'border-l-4 border-l-blue-500' : 'border-l-4 border-l-gray-300'
                  } ${selectedVehicle?.id === vehicle.id ? 'bg-muted' : ''}`}
                  onClick={() => setSelectedVehicle(vehicle)}
                >
                  <div className="flex items-start justify-between gap-1.5">
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="font-medium text-xs leading-tight text-foreground">
                        {vehicle.vehicle_number || "N/A"} - {getDriverName(vehicle.driver_1_id) || "No Driver Assigned"}
                      </div>
                      <div className="text-[11px] text-muted-foreground leading-tight">
                        {vehicle.dimensions_length ? `${vehicle.dimensions_length}' ` : ''}{vehicle.asset_subtype || vehicle.asset_type || "Asset Type"}
                      </div>
                      <div className="text-[10px] text-muted-foreground/60 truncate leading-tight">
                        {vehicle.carrier ? (carriersMap[vehicle.carrier] || "No Carrier") : "No Carrier"}
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
                    const thirtyMinutesAgo = getThirtyMinutesAgo();
                    
                    // Only count 'new' status loads
                    if (email.status !== 'new') return false;
                    
                    // Remove expired loads (30+ minutes old without expiration time)
                    if (!email.expires_at && emailTime <= thirtyMinutesAgo) return false;
                    
                    const loadData = extractLoadLocation(email);
                    
                    // Match by date if specified
                    if (plan.availableDate && loadData.pickupDate) {
                      const huntDateObj = new Date(plan.availableDate);
                      const loadDateObj = new Date(loadData.pickupDate);
                      
                      // Validate both dates are valid before comparing
                      if (isNaN(huntDateObj.getTime()) || isNaN(loadDateObj.getTime())) {
                        return false; // Invalid date, doesn't match
                      }
                      
                      const huntDate = huntDateObj.toISOString().split('T')[0];
                      const loadDate = loadDateObj.toISOString().split('T')[0];
                      if (huntDate !== loadDate) {
                        return false;
                      }
                    }

                    // Match by load type/vehicle size if specified
                    if (plan.vehicleSizes && plan.vehicleSizes.length > 0 && loadData.loadType) {
                      const loadTypeLower = loadData.loadType.toLowerCase();
                      
                      // Check if any of the selected vehicle sizes match
                      const anyMatch = plan.vehicleSizes.some(size => {
                        const sizeLower = size.replace(/-/g, ' ').toLowerCase();
                        if (sizeLower.includes('straight')) {
                          return loadTypeLower.includes('straight') || loadTypeLower.includes('van') || loadTypeLower.includes('truck');
                        }
                        return loadTypeLower.includes(sizeLower) || sizeLower.includes(loadTypeLower);
                      });
                      
                      if (!anyMatch) {
                        return false;
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
                      <span className="font-medium">Vehicle Types:</span>
                      <span className="text-right max-w-[200px]">{(() => {
                        const labels: Record<string, string> = {
                          'large-straight': 'Large Straight',
                          'large-straight-only': 'Large Straight Only',
                          'small-straight': 'Small Straight',
                          'cargo-van': 'Cargo Van',
                          'cube-van': 'Cube Van',
                          'sprinter': 'Sprinter',
                          'sprinter-van': 'Sprinter Van',
                          'sprinter-team': 'Sprinter Team',
                          'van': 'Van',
                          'straight': 'Straight',
                          'straight-truck': 'Straight Truck',
                          'straight-liftgate': 'Straight With Liftgate',
                          'dock-high-straight': 'Dock High Straight',
                          'large-straight-team': 'Large Straight Team',
                          'lift-gate-truck': 'Lift Gate Truck',
                          'flatbed': 'Flatbed',
                          'tractor': 'Tractor',
                          'semi': 'Semi',
                          'reefer-sprinter': 'Reefer Sprinter Van',
                        };
                        return plan.vehicleSizes.map(s => labels[s] || s).join(', ');
                      })()}</span>
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

            {/* Vehicle Types - Multi-select */}
            <div className="space-y-2">
              <Label>
                Vehicle Types <span className="text-destructive">*</span>
              </Label>
              <div className="grid grid-cols-2 gap-2 max-h-[200px] overflow-y-auto border rounded-md p-3 bg-background">
                {[
                  { value: 'large-straight', label: 'Large Straight' },
                  { value: 'large-straight-only', label: 'Large Straight Only' },
                  { value: 'small-straight', label: 'Small Straight' },
                  { value: 'cargo-van', label: 'Cargo Van' },
                  { value: 'cube-van', label: 'Cube Van' },
                  { value: 'sprinter', label: 'Sprinter' },
                  { value: 'sprinter-van', label: 'Sprinter Van' },
                  { value: 'sprinter-team', label: 'Sprinter Team' },
                  { value: 'van', label: 'Van' },
                  { value: 'straight', label: 'Straight' },
                  { value: 'straight-truck', label: 'Straight Truck' },
                  { value: 'straight-liftgate', label: 'Straight With Liftgate' },
                  { value: 'dock-high-straight', label: 'Dock High Straight' },
                  { value: 'large-straight-team', label: 'Large Straight Team' },
                  { value: 'lift-gate-truck', label: 'Lift Gate Truck' },
                  { value: 'flatbed', label: 'Flatbed' },
                  { value: 'tractor', label: 'Tractor' },
                  { value: 'semi', label: 'Semi' },
                  { value: 'reefer-sprinter', label: 'Reefer Sprinter Van' },
                ].map((type) => (
                  <div key={type.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={`create-${type.value}`}
                      checked={huntFormData.vehicleSizes.includes(type.value)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setHuntFormData({...huntFormData, vehicleSizes: [...huntFormData.vehicleSizes, type.value]});
                        } else {
                          setHuntFormData({...huntFormData, vehicleSizes: huntFormData.vehicleSizes.filter(v => v !== type.value)});
                        }
                      }}
                    />
                    <label htmlFor={`create-${type.value}`} className="text-sm cursor-pointer">{type.label}</label>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{huntFormData.vehicleSizes.length} selected</p>
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

            {/* Vehicle Types - Multi-select */}
            <div className="space-y-2">
              <Label>
                Vehicle Types <span className="text-destructive">*</span>
              </Label>
              <div className="grid grid-cols-2 gap-2 max-h-[200px] overflow-y-auto border rounded-md p-3 bg-background">
                {[
                  { value: 'large-straight', label: 'Large Straight' },
                  { value: 'large-straight-only', label: 'Large Straight Only' },
                  { value: 'small-straight', label: 'Small Straight' },
                  { value: 'cargo-van', label: 'Cargo Van' },
                  { value: 'cube-van', label: 'Cube Van' },
                  { value: 'sprinter', label: 'Sprinter' },
                  { value: 'sprinter-van', label: 'Sprinter Van' },
                  { value: 'sprinter-team', label: 'Sprinter Team' },
                  { value: 'van', label: 'Van' },
                  { value: 'straight', label: 'Straight' },
                  { value: 'straight-truck', label: 'Straight Truck' },
                  { value: 'straight-liftgate', label: 'Straight With Liftgate' },
                  { value: 'dock-high-straight', label: 'Dock High Straight' },
                  { value: 'large-straight-team', label: 'Large Straight Team' },
                  { value: 'lift-gate-truck', label: 'Lift Gate Truck' },
                  { value: 'flatbed', label: 'Flatbed' },
                  { value: 'tractor', label: 'Tractor' },
                  { value: 'semi', label: 'Semi' },
                  { value: 'reefer-sprinter', label: 'Reefer Sprinter Van' },
                ].map((type) => (
                  <div key={type.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={`edit-${type.value}`}
                      checked={huntFormData.vehicleSizes.includes(type.value)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setHuntFormData({...huntFormData, vehicleSizes: [...huntFormData.vehicleSizes, type.value]});
                        } else {
                          setHuntFormData({...huntFormData, vehicleSizes: huntFormData.vehicleSizes.filter(v => v !== type.value)});
                        }
                      }}
                    />
                    <label htmlFor={`edit-${type.value}`} className="text-sm cursor-pointer">{type.label}</label>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{huntFormData.vehicleSizes.length} selected</p>
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
            match={selectedMatchForDetail}
            vehicles={vehicles}
            drivers={drivers}
            carriersMap={carriersMap}
            onClose={() => {
              setSelectedEmailForDetail(null);
              setSelectedMatchForDetail(null);
            }}
          />
        ) : activeFilter === 'vehicle-assignment' ? (
          /* Vehicle Assignment View */
          <VehicleAssignmentView
            vehicles={vehicles}
            drivers={drivers}
            onBack={() => setActiveFilter('unreviewed')}
          />
        ) : activeFilter === 'issues' ? (
          /* Issues View - Special table showing issue details */
          <div className="flex-1 overflow-y-auto flex flex-col">
          <Card className="flex-1 flex flex-col">
            <CardContent className="p-0 flex-1 flex flex-col">
              <div className="border-t">
                {filteredEmails.length === 0 ? (
                  <div className="p-8 text-center">
                    <div className="text-green-600 text-lg font-medium mb-2">✓ No Issues</div>
                    <div className="text-sm text-muted-foreground">
                      All loads are processing correctly. Issues will appear here when loads can't be fully parsed or matched.
                    </div>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="h-8">
                          <TableHead className="w-[100px] py-1 text-[12px] text-amber-600 font-semibold">Load ID</TableHead>
                          <TableHead className="w-[80px] py-1 text-[12px] text-amber-600 font-semibold">Order #</TableHead>
                          <TableHead className="w-[150px] py-1 text-[12px] text-amber-600 font-semibold">Origin → Dest</TableHead>
                          <TableHead className="w-[100px] py-1 text-[12px] text-amber-600 font-semibold">Received</TableHead>
                          <TableHead className="py-1 text-[12px] text-amber-600 font-semibold">Issue Details</TableHead>
                          <TableHead className="w-[100px] py-1 text-[12px] text-amber-600 font-semibold">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredEmails.map((email) => {
                          const parsed = email.parsed_data || {};
                          return (
                            <TableRow key={email.id} className="h-10 hover:bg-amber-50">
                              <TableCell className="py-1 text-xs font-mono">{email.load_id || '-'}</TableCell>
                              <TableCell className="py-1 text-xs">{parsed.order_number || '-'}</TableCell>
                              <TableCell className="py-1 text-xs">
                                {parsed.origin_city && parsed.origin_state 
                                  ? `${parsed.origin_city}, ${parsed.origin_state}` 
                                  : <span className="text-red-500">Missing</span>}
                                {' → '}
                                {parsed.destination_city && parsed.destination_state 
                                  ? `${parsed.destination_city}, ${parsed.destination_state}` 
                                  : <span className="text-red-500">Missing</span>}
                              </TableCell>
                              <TableCell className="py-1 text-xs text-muted-foreground">
                                {email.received_at ? new Date(email.received_at).toLocaleString() : '-'}
                              </TableCell>
                              <TableCell className="py-1">
                                <div className="text-xs text-amber-700 bg-amber-100 px-2 py-1 rounded">
                                  ⚠️ {email.issue_notes || 'Unknown issue'}
                                </div>
                              </TableCell>
                              <TableCell className="py-1">
                                <div className="flex gap-1">
                                  <Button 
                                    size="sm" 
                                    variant="ghost"
                                    className="h-6 px-2 text-xs"
                                    onClick={() => {
                                      setSelectedEmailForDetail(email);
                                      setSelectedEmailDistance(undefined);
                                    }}
                                  >
                                    View
                                  </Button>
                                  <Button 
                                    size="sm" 
                                    variant="outline"
                                    className="h-6 px-2 text-xs text-amber-600 hover:bg-amber-50"
                                    onClick={() => handleDismissIssue(email.id)}
                                  >
                                    Dismiss
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
          </div>
        ) : (
          /* Loads Table */
          <div className="flex-1 overflow-y-auto flex flex-col">
          <Card className="flex-1 flex flex-col">
            <CardContent className="p-0 flex-1 flex flex-col">
              <div className="border-t">
                {(activeFilter === 'unreviewed' ? filteredMatches.length === 0 : filteredEmails.length === 0) ? (
                  <div className="p-4 text-center text-xs text-muted-foreground">
                    {activeFilter === 'skipped' 
                      ? 'No skipped loads yet.' 
                      : activeFilter === 'unreviewed'
                      ? 'No matched loads. Create hunt plans to see matches here.'
                      : 'No load emails found yet. Click "Refresh Loads" to start monitoring your inbox.'}
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="h-7">
                          <TableHead className="w-[80px] py-0 text-[12px] leading-[1.1] text-blue-600 font-semibold">Order #</TableHead>
                          <TableHead className="w-[110px] py-0 text-[12px] leading-[1.1] text-blue-600 font-semibold">Load ID</TableHead>
                          <TableHead className="w-[100px] py-0 text-[12px] leading-[1.1] text-blue-600 font-semibold">Match ID</TableHead>
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
                        {(activeFilter === 'unreviewed' ? filteredMatches : activeFilter === 'skipped' ? skippedMatches.filter((match: any) => {
                          // Skipped matches stay visible until midnight ET regardless of expiration
                          const email = loadEmails.find(e => e.id === match.load_email_id);
                          if (!email) return false;
                          
                          // Show all skipped matches - they persist until midnight reset
                          return true;
                        }) : filteredEmails)
                          .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                          .map((item) => {
                          // For unreviewed, item is from view with email data included
                          // For skipped, item is a match that needs email lookup
                          // For others, item is an email
                          const viewingMatches = activeFilter === 'unreviewed' || activeFilter === 'skipped';
                          
                          // Get email data - from view (unreviewed) or lookup (skipped) or item itself (other)
                          let email: any;
                          if (activeFilter === 'unreviewed') {
                            // View data includes email fields directly
                            email = {
                              id: (item as any).load_email_id,
                              parsed_data: (item as any).parsed_data,
                              subject: (item as any).subject,
                              received_at: (item as any).received_at,
                              expires_at: (item as any).expires_at,
                              from_email: (item as any).from_email,
                              from_name: (item as any).from_name,
                              load_id: (item as any).load_id,
                              status: (item as any).email_status,
                            };
                          } else if (activeFilter === 'skipped') {
                            email = loadEmails.find(e => e.id === (item as any).load_email_id);
                          } else {
                            email = item;
                          }
                          
                          if (!email) return null;
                          
                          // For view data, use match_id; for old format, use id
                          const match = viewingMatches ? {
                            ...item,
                            id: (item as any).match_id || (item as any).id,
                          } : null;
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

                          // Calculate expiration time
                          let expiresIn = '';
                          const parsedExpires = data.expires_datetime as string | undefined;
                          
                          if (email.expires_at) {
                            const expiresDate = new Date(email.expires_at);
                            const timeUntilExpiration = expiresDate.getTime() - now.getTime();
                            const minsUntilExpiration = Math.floor(timeUntilExpiration / 60000);

                            if (minsUntilExpiration > 60) {
                              const hours = Math.floor(minsUntilExpiration / 60);
                              const mins = minsUntilExpiration % 60;
                              expiresIn = `${hours}h ${mins}m`;
                            } else if (minsUntilExpiration > 0) {
                              expiresIn = `${minsUntilExpiration}m`;
                            } else {
                              // Show negative time for expired loads
                              const expiredMins = Math.abs(minsUntilExpiration);
                              if (expiredMins > 60) {
                                const hours = Math.floor(expiredMins / 60);
                                const mins = expiredMins % 60;
                                expiresIn = `-${hours}h ${mins}m`;
                              } else {
                                expiresIn = `-${expiredMins}m`;
                              }
                            }
                          } else if (parsedExpires) {
                            const parsedExpiresDate = new Date(parsedExpires);
                            if (!isNaN(parsedExpiresDate.getTime())) {
                              const timeUntilExpiration = parsedExpiresDate.getTime() - now.getTime();
                              const minsUntilExpiration = Math.floor(timeUntilExpiration / 60000);

                              if (minsUntilExpiration > 60) {
                                const hours = Math.floor(minsUntilExpiration / 60);
                                const mins = minsUntilExpiration % 60;
                                expiresIn = `${hours}h ${mins}m`;
                              } else if (minsUntilExpiration > 0) {
                                expiresIn = `${minsUntilExpiration}m`;
                              } else {
                                // Show negative time for expired loads
                                const expiredMins = Math.abs(minsUntilExpiration);
                                if (expiredMins > 60) {
                                  const hours = Math.floor(expiredMins / 60);
                                  const mins = expiredMins % 60;
                                  expiresIn = `-${hours}h ${mins}m`;
                                } else {
                                  expiresIn = `-${expiredMins}m`;
                                }
                              }
                            } else {
                              expiresIn = '—';
                            }
                          } else {
                            expiresIn = '—';
                          }

                          const rawBody = (email.body_text || email.body_html || '').toString();
                          const cleanBody = rawBody.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

                          // Build pickup display: show date + time when both available, otherwise show what we have
                          let pickupDisplay = '';
                          if (data.pickup_date && data.pickup_time) {
                            pickupDisplay = `${data.pickup_date} ${data.pickup_time}`;
                          } else if (data.pickup_date) {
                            pickupDisplay = data.pickup_date;
                          } else if (data.pickup_time) {
                            pickupDisplay = data.pickup_time;
                          }
                          
                          if (!pickupDisplay) {
                            // Fallback: extract timing after location in raw body
                            const pickupMatch = cleanBody.match(/Pick[-\s]*Up\s+[A-Za-z\s,]+\d{5}\s+(ASAP|[A-Za-z\s]+?)(?:\s+Delivery|$)/i);
                            if (pickupMatch && pickupMatch[1]) {
                              pickupDisplay = pickupMatch[1].trim();
                            }
                          }
                          if (!pickupDisplay || /box\s*>\s*p/i.test(pickupDisplay)) {
                            pickupDisplay = '—';
                          }

                          // Build delivery display: show date + time when both available, otherwise show what we have
                          let deliveryDisplay = '';
                          if (data.delivery_date && data.delivery_time) {
                            deliveryDisplay = `${data.delivery_date} ${data.delivery_time}`;
                          } else if (data.delivery_date) {
                            deliveryDisplay = data.delivery_date;
                          } else if (data.delivery_time) {
                            deliveryDisplay = data.delivery_time;
                          }
                          
                          if (!deliveryDisplay) {
                            // Fallback: extract timing after location in raw body
                            const deliveryMatch = cleanBody.match(/Delivery\s+[A-Za-z\s,]+\d{5}\s+(Deliver\s+Direct|[A-Za-z\s]+?)(?:\s+Rate|\s+Contact|$)/i);
                            if (deliveryMatch && deliveryMatch[1]) {
                              deliveryDisplay = deliveryMatch[1].trim();
                            }
                          }
                          if (!deliveryDisplay || /box\s*>\s*p/i.test(deliveryDisplay)) {
                            deliveryDisplay = '—';
                          }

                          return (
                            <TableRow 
                              key={activeFilter === 'unreviewed' ? (match as any).id : email.id} 
                              className="h-10 cursor-pointer hover:bg-accent transition-colors"
                              onClick={async () => {
                                // Check if this load has multiple matches
                                const matchesForLoad = loadMatches.filter(m => m.load_email_id === email.id);
                                
                                if (matchesForLoad.length > 1) {
                                  // Fetch vehicle details for all matches
                                  const vehicleIds = matchesForLoad.map(m => m.vehicle_id);
                                  const { data: vehicleData } = await supabase
                                    .from('vehicles')
                                    .select('*')
                                    .in('id', vehicleIds);
                                  
                                  if (vehicleData) {
                                    const enrichedMatches = matchesForLoad.map(match => {
                                      const vehicle = vehicleData.find(v => v.id === match.vehicle_id);
                                      return {
                                        id: match.id,
                                        vehicle_id: match.vehicle_id,
                                        vehicle_number: vehicle?.vehicle_number || 'Unknown',
                                        distance_miles: match.distance_miles,
                                        current_location: vehicle?.last_location || vehicle?.formatted_address,
                                        last_updated: vehicle?.last_updated,
                                        status: vehicle?.status,
                                        oil_change_due: vehicle?.oil_change_remaining ? vehicle.oil_change_remaining < 0 : false,
                                      };
                                    });
                                    
                                    setMultipleMatches(enrichedMatches);
                                    setShowMultipleMatchesDialog(true);
                                  }
                                } else {
                                  // Single match or no match - show detail directly
                                  setSelectedEmailForDetail(email);
                                  setSelectedMatchForDetail(match);
                                  if (match) {
                                    setSelectedEmailDistance((match as any).distance_miles);
                                  }
                                }
                              }}
                            >
                              {/* Order Number from Sylectus */}
                              <TableCell className="py-1">
                                <div className="text-[11px] font-semibold leading-tight whitespace-nowrap">
                                  {data.order_number ? `#${data.order_number}` : '—'}
                                </div>
                              </TableCell>
                              {/* Our internal Load ID */}
                              <TableCell className="py-1">
                                <div className="text-[11px] font-mono leading-tight whitespace-nowrap">
                                  {email.load_id || '—'}
                                </div>
                              </TableCell>
                              {/* Load Hunt Match ID (dev only) */}
                              <TableCell className="py-1">
                                <div className="text-[10px] font-mono text-muted-foreground leading-tight whitespace-nowrap">
                                  {activeFilter === 'unreviewed' && match ? (match as any).id.substring(0, 8) : '—'}
                                </div>
                              </TableCell>
                              <TableCell className="py-1">
                                {(() => {
                                  // Get broker info from parsed data
                                  const brokerName = data.broker || data.customer || email.from_name || email.from_email.split('@')[0];
                                  
                                  if (activeFilter === 'unreviewed' && match) {
                                    // For unreviewed (matches), show the matched truck directly
                                    const vehicle = vehicles.find(v => v.id === (match as any).vehicle_id);
                                    if (vehicle) {
                                      const driverName = getDriverName(vehicle.driver_1_id) || "No Driver Assigned";
                                      const carrierName = vehicle.carrier ? (carriersMap[vehicle.carrier] || "No Carrier") : "No Carrier";
                                      return (
                                        <div>
                                          <div className="text-[11px] font-medium leading-tight whitespace-nowrap">
                                            {vehicle.vehicle_number || "N/A"} - {driverName}
                                          </div>
                                          <div className="text-[10px] text-muted-foreground truncate leading-tight whitespace-nowrap">
                                            {carrierName} • {brokerName}
                                          </div>
                                        </div>
                                      );
                                    }
                                  } else {
                                    // For other filters, use the hunt map lookup
                                    const matchingHuntId = loadHuntMap.get(email.id);
                                    const matchingHunt = matchingHuntId
                                      ? huntPlans.find(plan => plan.id === matchingHuntId)
                                      : undefined;
                                    
                                    if (matchingHunt) {
                                      const vehicle = vehicles.find(v => v.id === matchingHunt.vehicleId);
                                      if (vehicle) {
                                        const driverName = getDriverName(vehicle.driver_1_id) || "No Driver Assigned";
                                        const carrierName = vehicle.carrier ? (carriersMap[vehicle.carrier] || "No Carrier") : "No Carrier";
                                        return (
                                          <div>
                                            <div className="text-[11px] font-medium leading-tight whitespace-nowrap">
                                              {vehicle.vehicle_number || "N/A"} - {driverName}
                                            </div>
                                            <div className="text-[10px] text-muted-foreground truncate leading-tight whitespace-nowrap">
                                              {carrierName} • {brokerName}
                                            </div>
                                          </div>
                                        );
                                      }
                                    }
                                  }
                                  
                                  // Show Available if no match, with broker info
                                  return (
                                    <div>
                                      <div className="text-[11px] font-medium leading-tight whitespace-nowrap">Available</div>
                                      <div className="text-[10px] text-muted-foreground truncate leading-tight whitespace-nowrap">
                                        Broker: {brokerName}
                                      </div>
                                    </div>
                                  );
                                })()}
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
                                  {expiresIn}
                                </div>
                              </TableCell>
                              <TableCell className="py-1">
                                <div className="text-[11px] leading-tight whitespace-nowrap">
                                  {pickupDisplay}
                                </div>
                                <div className="text-[11px] leading-tight whitespace-nowrap">
                                  {deliveryDisplay}
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
                                  {(() => {
                                    // First check match distance (for unreviewed view data)
                                    if (match && (match as any).distance_miles != null) {
                                      return `${Math.round((match as any).distance_miles)} mi`;
                                    }
                                    // Then check loadDistances map
                                    if (loadDistances.has(email.id)) {
                                      return `${loadDistances.get(email.id)} mi`;
                                    }
                                    // Finally check parsed data
                                    if (data.empty_miles != null) {
                                      return `${data.empty_miles} mi`;
                                    }
                                    return '—';
                                  })()}
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
                                <div className="text-[11px] leading-tight whitespace-nowrap">{data?.pieces ?? '—'}</div>
                                <div className="text-[10px] text-muted-foreground leading-tight whitespace-nowrap">{data?.dimensions ?? 'Not Specified'}</div>
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
                                    aria-label="Skip load or match"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (activeFilter === 'unreviewed' && match) {
                                        handleSkipMatch((match as any).id);
                                      } else {
                                        handleSkipEmail(email.id);
                                      }
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
                        {(() => {
                          const totalItems = activeFilter === 'unreviewed' ? filteredMatches.length : filteredEmails.length;
                          return `${Math.min((currentPage - 1) * itemsPerPage + 1, totalItems)} - ${Math.min(currentPage * itemsPerPage, totalItems)} of ${totalItems}`;
                        })()}
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
                        onClick={() => {
                          const totalItems = activeFilter === 'unreviewed' ? filteredMatches.length : filteredEmails.length;
                          setCurrentPage(Math.min(Math.ceil(totalItems / itemsPerPage), currentPage + 1));
                        }}
                        disabled={currentPage >= Math.ceil((activeFilter === 'unreviewed' ? filteredMatches.length : filteredEmails.length) / itemsPerPage)}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => {
                          const totalItems = activeFilter === 'unreviewed' ? filteredMatches.length : filteredEmails.length;
                          setCurrentPage(Math.ceil(totalItems / itemsPerPage));
                        }}
                        disabled={currentPage >= Math.ceil((activeFilter === 'unreviewed' ? filteredMatches.length : filteredEmails.length) / itemsPerPage)}
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

      <MultipleMatchesDialog
        open={showMultipleMatchesDialog}
        onOpenChange={setShowMultipleMatchesDialog}
        matches={multipleMatches}
        onSelectVehicle={(vehicleId, matchId) => {
          // Find the email and match to show detail
          const match = multipleMatches.find(m => m.id === matchId);
          if (match) {
            const email = loadEmails.find(e => {
              // Find the load email that corresponds to this match
              return loadMatches.some(lm => lm.id === matchId && lm.load_email_id === e.id);
            });
            
            if (email) {
              setSelectedEmailForDetail(email);
              setSelectedMatchForDetail(match);
              setSelectedEmailDistance(match.distance_miles);
              setShowMultipleMatchesDialog(false);
            }
          }
        }}
      />
    </div>
  );
}
