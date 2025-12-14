import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import React from "react";
import { supabase } from "@/integrations/supabase/client";
import LoadEmailDetail from "@/components/LoadEmailDetail";
import { MultipleMatchesDialog } from "@/components/MultipleMatchesDialog";
import { VehicleAssignmentView } from "@/components/VehicleAssignmentView";
import { DispatcherMetricsView } from "@/components/DispatcherMetricsView";
import { UserActivityTracker } from "@/components/UserActivityTracker";
import LoadHunterMobile from "@/components/LoadHunterMobile";
import { useIsMobile } from "@/hooks/use-mobile";
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
import { RefreshCw, Settings, X, CheckCircle, MapPin, Wrench, ArrowLeft, Gauge, Truck, MapPinned, Volume2, VolumeX, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, MoreVertical, Target, Plus, Minus } from "lucide-react";
import oilChangeIcon from '@/assets/oil-change-icon.png';
import checkEngineIcon from '@/assets/check-engine-icon.png';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

interface Vehicle {
  id: string;
  vehicle_number: string | null;
  carrier: string | null;
  bid_as: string | null;
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
  fault_codes: any;
  speed: number | null;
  stopped_status: string | null;
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
  floorLoadId?: string | null;
  initialMatchDone?: boolean;
}

export default function LoadHunterTab() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loads, setLoads] = useState<Load[]>([]);
  const [loadEmails, setLoadEmails] = useState<any[]>([]);
  const [loadMatches, setLoadMatches] = useState<any[]>([]); // Active matches (match_status = 'active')
  const [skippedMatches, setSkippedMatches] = useState<any[]>([]); // Manually skipped matches (match_status = 'skipped')
  const [bidMatches, setBidMatches] = useState<any[]>([]); // Matches with bids placed (match_status = 'bid')
  const [undecidedMatches, setUndecidedMatches] = useState<any[]>([]); // Matches viewed but no action (match_status = 'undecided')
  const [waitlistMatches, setWaitlistMatches] = useState<any[]>([]); // Matches moved to waitlist (match_status = 'waitlist')
  const [unreviewedViewData, setUnreviewedViewData] = useState<any[]>([]); // Efficient server-side filtered data
  const [missedHistory, setMissedHistory] = useState<any[]>([]); // Missed loads history with full email data
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [selectedEmailForDetail, setSelectedEmailForDetail] = useState<any | null>(null);
  const [selectedEmailDistance, setSelectedEmailDistance] = useState<number | undefined>(undefined);
  const [selectedMatchForDetail, setSelectedMatchForDetail] = useState<any | null>(null);
  const [matchActionTaken, setMatchActionTaken] = useState(false); // Track if user took action on current match
  const matchActionTakenRef = useRef(false); // Sync ref for immediate checks in onClose
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
  const [activeMode, setActiveMode] = useState<'admin' | 'dispatch'>('dispatch');
  const [activeFilter, setActiveFilter] = useState<string>('unreviewed');
  const [filterVehicleId, setFilterVehicleId] = useState<string | null>(null); // Vehicle-specific filter
  const [showIdColumns, setShowIdColumns] = useState(false);
  const [showMultipleMatchesDialog, setShowMultipleMatchesDialog] = useState(false);
  const [multipleMatches, setMultipleMatches] = useState<any[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [matchSearchQuery, setMatchSearchQuery] = useState('');
  const [archivedSearchResults, setArchivedSearchResults] = useState<any[]>([]);
  const [isSearchingArchive, setIsSearchingArchive] = useState(false);
  const [canonicalVehicleTypes, setCanonicalVehicleTypes] = useState<{ value: string; label: string }[]>([]);
  const [vehicleTypeMappings, setVehicleTypeMappings] = useState<Map<string, string>>(new Map());
  const [showArchiveResults, setShowArchiveResults] = useState(false);
  const itemsPerPage = 17;
  const [currentDispatcherId, setCurrentDispatcherId] = useState<string | null>(null);
  const [currentDispatcherInfo, setCurrentDispatcherInfo] = useState<{ id: string; first_name: string; last_name: string; email: string } | null>(null);
  const currentDispatcherIdRef = useRef<string | null>(null);
  const [myVehicleIds, setMyVehicleIds] = useState<string[]>([]);
  const mapContainer = React.useRef<HTMLDivElement>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const isTabHiddenRef = useRef(false);
  const map = React.useRef<mapboxgl.Map | null>(null);
  
  // Refs for stable callbacks in real-time subscriptions
  const loadVehiclesRef = useRef<() => Promise<void>>();
  const refreshMyVehicleIdsRef = useRef<() => Promise<void>>();

  // Reset to page 1 when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeFilter]);

  // Close archive search dropdown on click outside
  useEffect(() => {
    const handleClickOutside = () => setShowArchiveResults(false);
    if (showArchiveResults) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showArchiveResults]);

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

        // Extract coordinates - check multiple possible locations
        let originLat = parsed.origin_lat || parsed.pickup_lat;
        let originLng = parsed.origin_lng || parsed.pickup_lng;
        
        // Also check nested pickup_coordinates object (common format from webhook)
        if ((!originLat || !originLng) && parsed.pickup_coordinates) {
          const coords = typeof parsed.pickup_coordinates === 'string' 
            ? JSON.parse(parsed.pickup_coordinates) 
            : parsed.pickup_coordinates;
          if (coords && coords.lat && coords.lng) {
            originLat = coords.lat;
            originLng = coords.lng;
          }
        }

        return {
          originZip: parsed.origin_zip || parsed.pickup_zip,
          originLat,
          originLng,
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
    // Match by date if specified - load pickup must be ON OR AFTER hunt's available date
    if (hunt.availableDate && loadData.pickupDate) {
      const huntDateObj = new Date(hunt.availableDate);
      const loadDateObj = new Date(loadData.pickupDate);

      if (isNaN(huntDateObj.getTime()) || isNaN(loadDateObj.getTime())) {
        return { matches: false };
      }

      // Load pickup date must be >= hunt available date
      const huntDateNormalized = new Date(huntDateObj.toISOString().split('T')[0]);
      const loadDateNormalized = new Date(loadDateObj.toISOString().split('T')[0]);
      if (loadDateNormalized < huntDateNormalized) {
        return { matches: false };
      }
    }

    // Match by load type/vehicle size if specified
    if (hunt.vehicleSizes && hunt.vehicleSizes.length > 0 && loadData.vehicleType) {
      const loadVehicleRaw = loadData.vehicleType.toLowerCase();
      
      // Use mapping to get canonical type (uppercase), or use raw type uppercased if no mapping
      const loadVehicleCanonical = vehicleTypeMappings.get(loadVehicleRaw) || loadData.vehicleType.toUpperCase();

      // Check if ANY selected vehicle type matches the load's canonical type
      const vehicleMatches = hunt.vehicleSizes.some(huntSize => {
        // Direct match - both should be uppercase canonical names
        return huntSize.toUpperCase() === loadVehicleCanonical.toUpperCase();
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

  // CURSOR-BASED MATCHING: Only processes loads with load_id > floor_load_id (forward-only)
  // When a hunt is enabled, it does a one-time 15-min backfill then only looks forward
  useEffect(() => {
    const searchLoadsForHunts = async () => {
      console.log('🔍 Running cursor-based hunt matching. LoadEmails:', loadEmails.length, 'Hunt plans:', huntPlans.length);
      
      const enabledHunts = huntPlans.filter(h => h.enabled && h.initialMatchDone);
      if (enabledHunts.length === 0) {
        console.log('❌ No enabled hunt plans with initial match done');
        return;
      }
      
      console.log('✅ Found', enabledHunts.length, 'enabled hunt plans ready for matching');
      
      // CURSOR-BASED: Only process loads AFTER each hunt's floor_load_id
      const candidateLoads = loadEmails.filter(email => {
        if (email.status !== 'new') return false;
        
        // Check if this load is past ANY enabled hunt's floor
        return enabledHunts.some(hunt => {
          if (!hunt.floorLoadId) return true; // No floor = match all
          // Compare load_id strings - they're sequential like LH-YYMMDD-NNNNN
          return email.load_id > hunt.floorLoadId;
        });
      });
      
      console.log('📧 Candidate loads for matching (cursor-based):', candidateLoads.length);
      
      if (candidateLoads.length === 0) {
        console.log('📭 No new loads past floor cursor');
        return;
      }
      
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
        match_status: string;
      }> = [];
      
      // Check each load against hunt plans (only if load_id > that hunt's floor)
      for (const email of candidateLoads) {
        const loadData = extractLoadLocation(email);
        
        if (!loadData.originCityState && !loadData.originZip) {
          skippedCount++;
          continue;
        }
        
        // Only check hunts where this load is past their floor
        const applicableHunts = enabledHunts.filter(hunt => {
          if (!hunt.floorLoadId) return true;
          return email.load_id > hunt.floorLoadId;
        });
        
        const matchResults = await Promise.all(
          applicableHunts.map(hunt => doesLoadMatchHunt(loadData, hunt))
        );
        
        const matchingHunts = applicableHunts.filter((_, index) => matchResults[index].matches);
        
        if (matchingHunts.length > 0) {
          matchCount++;
          console.log('✅ Match found:', email.load_id, '→', matchingHunts.length, 'hunt(s)');
          
          newMatchedIds.add(email.id);
          newHuntMap.set(email.id, matchingHunts[0].id);
          
          const firstMatchDistance = matchResults[applicableHunts.indexOf(matchingHunts[0])].distance;
          if (firstMatchDistance) {
            newDistances.set(email.id, Math.round(firstMatchDistance));
          }
          
          for (let i = 0; i < matchingHunts.length; i++) {
            const matchingHunt = matchingHunts[i];
            const matchIndex = applicableHunts.indexOf(matchingHunt);
            const matchDistance = matchResults[matchIndex].distance;
            
            allMatches.push({
              load_email_id: email.id,
              hunt_plan_id: matchingHunt.id,
              vehicle_id: matchingHunt.vehicleId,
              distance_miles: matchDistance || null,
              is_active: true,
              match_status: 'active',
            });
          }
        }
      }
      
      // Batch insert ONLY new matches (don't overwrite existing ones that may be skipped)
      if (allMatches.length > 0) {
        console.log('💾 Batch saving', allMatches.length, 'matches');
        const { error } = await supabase
          .from('load_hunt_matches')
          .upsert(allMatches, { 
            onConflict: 'load_email_id,hunt_plan_id',
            ignoreDuplicates: true  // Don't overwrite existing matches (preserves skipped status)
          });
        
        if (error) {
          console.error('❌ Error batch persisting matches:', error);
        } else {
          console.log('✅ Batch saved', allMatches.length, 'matches');
        }
      }
      
      console.log('🎯 Matching complete:', matchCount, 'matched,', skippedCount, 'skipped (no location)');
      
      setMatchedLoadIds(prev => new Set([...prev, ...newMatchedIds]));
      setLoadDistances(prev => new Map([...prev, ...newDistances]));
      setLoadHuntMap(prev => new Map([...prev, ...newHuntMap]));
      
      // Reload matches and refresh UI
      await loadHuntMatches();
      await loadUnreviewedMatches();
    };
    
    // Only trigger if we have enabled hunts with initialMatchDone
    const readyHunts = huntPlans.filter(h => h.enabled && h.initialMatchDone);
    if (readyHunts.length > 0 && loadEmails.length > 0) {
      console.log('🚀 Triggering cursor-based hunt matching');
      searchLoadsForHunts();
    }
  }, [loadEmails.length, huntPlans]);

  // Process email queue every 20 seconds - cursor-based pagination (never goes older than floor)
  useEffect(() => {
    const processQueue = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('process-email-queue');
        if (error) {
          console.error('📧 Queue processor error:', error);
          return;
        }
        if (data?.processed > 0) {
          console.log(`📧 Queue processed: ${data.processed} emails, checkpoint: ${data.checkpoint}, lastLoadId: ${data.lastLoadId}`);
          // Refresh ALL data after processing so new emails show immediately
          loadLoadEmails();
          loadUnreviewedMatches();
        } else {
          console.log('📭 No new emails to process');
        }
      } catch (e) {
        console.error('📧 Queue processor exception:', e);
      }
    };
    
    // Process immediately, then every 20 seconds
    processQueue();
    const interval = setInterval(processQueue, 20 * 1000);
    
    return () => clearInterval(interval);
  }, []);

  // BACKUP: Periodic re-match every 20 seconds (primary matching is in gmail-webhook)
  // This catches any loads that failed initial matching
  useEffect(() => {
    const readyHunts = huntPlans.filter(h => h.enabled && h.initialMatchDone);
    if (readyHunts.length === 0) return;
    
    console.log('⏰ Starting backup periodic re-match (every 20 seconds)');
    
    const interval = setInterval(() => {
      console.log('⏰ Backup re-match triggered');
      // Force re-matching by updating state (triggers the matching useEffect above)
      setLoadEmails(current => [...current]);
    }, 20 * 1000); // Every 20 seconds
    
    return () => {
      console.log('⏰ Stopping backup periodic re-match');
      clearInterval(interval);
    };
  }, [huntPlans]);

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
  // IMPORTANT: Matched emails should ONLY appear in Unreviewed tab, nowhere else
  const filteredEmails = activeFilter === 'unreviewed' 
    ? [] // Don't use emails for unreviewed - use filteredMatches instead
    : loadEmails.filter(email => {
        // Exclude emails that have active matches - they belong in Unreviewed only
        if (matchedLoadIds.has(email.id)) {
          return false;
        }
        
        // CRITICAL: Skipped and waitlist loads should always be visible
        if (email.status === 'skipped' || email.status === 'waitlist') {
          if (activeFilter === 'skipped') return email.status === 'skipped';
          if (activeFilter === 'waitlist') return email.status === 'waitlist';
          if (activeFilter === 'all') return true;
          return false;
        }
        
        // Missed tab now uses missedHistory, not loadEmails
        if (activeFilter === 'missed') {
          return false; // Return empty - we use missedHistory data directly
        }
        if (activeFilter === 'issues') {
          return email.has_issues === true;
        }
        if (activeFilter === 'all') return true;
        return true;
      });

  // Debug: Log filtered emails count for all filter
  if (activeFilter === 'all') {
    console.log(`📧 All filter: ${filteredEmails.length} emails (from ${loadEmails.length} total loadEmails)`);
  }

  // Get filtered matches for unreviewed - USE SERVER-SIDE VIEW DATA for scalability
  const filteredMatches = activeFilter === 'unreviewed'
    ? unreviewedViewData
        .filter(match => {
          // Filter by specific vehicle if filterVehicleId is set (badge click)
          if (filterVehicleId && match.vehicle_id !== filterVehicleId) return false;
          // Filter by dispatcher's vehicles when in MY TRUCKS mode
          // Only filter if we're in dispatch mode AND we have vehicle IDs loaded
          if (activeMode === 'dispatch' && myVehicleIds.length > 0) {
            if (!myVehicleIds.includes(match.vehicle_id)) return false;
          }
          // Filter by search query - check multiple fields
          if (matchSearchQuery) {
            const query = matchSearchQuery.toLowerCase();
            const matchId = match.match_id?.toLowerCase() || '';
            const vehicleId = match.vehicle_id?.toLowerCase() || '';
            const emailId = match.load_email_id?.toLowerCase() || '';
            const orderNumber = match.parsed_data?.order_number?.toLowerCase() || '';
            const vehicleNumber = match.vehicle_number?.toLowerCase() || '';
            
            // Check if query matches any searchable field
            if (!matchId.includes(query) && 
                !vehicleId.includes(query) && 
                !emailId.includes(query) &&
                !orderNumber.includes(query) &&
                !vehicleNumber.includes(query)) {
              return false;
            }
          }
          return true;
        })
        .sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime())
    : [];

  // Apply vehicle filter to other match types as well
  const filteredSkippedMatches = filterVehicleId 
    ? skippedMatches.filter(m => m.vehicle_id === filterVehicleId)
    : skippedMatches;
  const filteredBidMatches = filterVehicleId 
    ? bidMatches.filter(m => m.vehicle_id === filterVehicleId)
    : bidMatches;
  const filteredMissedHistory = filterVehicleId 
    ? missedHistory.filter(m => m.vehicle_id === filterVehicleId)
    : missedHistory;
  
  // Debug logging for filtered results
  if (activeFilter === 'unreviewed') {
    console.log(`📊 filteredMatches: ${filteredMatches.length} (from ${unreviewedViewData.length} total, mode: ${activeMode}, myVehicles: ${myVehicleIds.length})`);
  }

  // Count uses server-side view data for accuracy
  const unreviewedCount = unreviewedViewData.filter(match => {
    if (activeMode === 'dispatch' && myVehicleIds.length > 0) {
      if (!myVehicleIds.includes(match.vehicle_id)) return false;
    }
    return true;
  }).length;
  
  const missedCount = missedHistory.length; // Use missed history count
  const waitlistCount = waitlistMatches.length; // Use match-based count
  const skippedCount = skippedMatches.length;
  const bidCount = bidMatches.length;
  const undecidedCount = undecidedMatches.length;
  const issuesCount = loadEmails.filter(e => e.has_issues === true).length;

  // Search archived matches
  const searchArchivedMatches = async (query: string) => {
    if (!query || query.length < 3) {
      setArchivedSearchResults([]);
      setShowArchiveResults(false);
      return;
    }
    
    setIsSearchingArchive(true);
    try {
      // Archive table doesn't have FK relationships, so query it directly
      // Use textSearch on match_status or filter by casting UUID to text via RPC
      // For now, search by fetching recent archives and filtering client-side
      const { data: archiveData, error } = await supabase
        .from('load_hunt_matches_archive')
        .select('*')
        .order('archived_at', { ascending: false })
        .limit(100);
      
      // Filter client-side since we can't do ilike on UUID columns
      const filteredData = (archiveData || []).filter(a => 
        a.original_match_id?.toString().toLowerCase().includes(query.toLowerCase()) ||
        a.load_email_id?.toString().toLowerCase().includes(query.toLowerCase()) ||
        a.match_status?.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 20);
      
      if (error) {
        console.error('Archive search error:', error);
        toast.error('Failed to search archives');
        return;
      }

      // Enrich with related data if we have results
      if (filteredData && filteredData.length > 0) {
        const loadEmailIds = [...new Set(filteredData.map(a => a.load_email_id).filter(Boolean))];
        const vehicleIds = [...new Set(filteredData.map(a => a.vehicle_id).filter(Boolean))];
        
        const [emailsRes, vehiclesRes] = await Promise.all([
          loadEmailIds.length > 0 
            ? supabase.from('load_emails').select('id, load_id, subject, from_email, received_at, parsed_data, expires_at').in('id', loadEmailIds)
            : { data: [] },
          vehicleIds.length > 0
            ? supabase.from('vehicles').select('id, vehicle_number, carrier').in('id', vehicleIds)
            : { data: [] }
        ]);

        const emailsMap = new Map((emailsRes.data || []).map(e => [e.id, e]));
        const vehiclesMap = new Map((vehiclesRes.data || []).map(v => [v.id, v]));

        const enrichedData = filteredData.map(a => ({
          ...a,
          load_emails: emailsMap.get(a.load_email_id) || null,
          vehicles: vehiclesMap.get(a.vehicle_id) || null
        }));

        setArchivedSearchResults(enrichedData);
      } else {
        setArchivedSearchResults([]);
      }
      setShowArchiveResults(true);
    } catch (err) {
      console.error('Archive search error:', err);
      toast.error('Failed to search archives');
    } finally {
      setIsSearchingArchive(false);
    }
  };

  // Debounced archive search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (matchSearchQuery) {
        searchArchivedMatches(matchSearchQuery);
      } else {
        setArchivedSearchResults([]);
        setShowArchiveResults(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [matchSearchQuery]);

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
  // Request notification permission
  const requestNotificationPermission = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        setNotificationsEnabled(true);
        console.log('✅ Browser notifications enabled');
        return true;
      }
    }
    return false;
  };

  // Show system notification (works even when tab is inactive)
  const showSystemNotification = (title: string, body: string) => {
    if (!notificationsEnabled || Notification.permission !== 'granted') return;
    
    try {
      const notification = new Notification(title, {
        body,
        icon: '/pwa-192x192.png',
        tag: 'load-hunter-alert',
        requireInteraction: false,
      });
      
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
      
      // Auto close after 5 seconds
      setTimeout(() => notification.close(), 5000);
    } catch (error) {
      console.error('Error showing notification:', error);
    }
  };

  const toggleSound = async () => {
    console.log('🔘 toggleSound clicked, current state:', isSoundMuted);
    
    const newMutedState = !isSoundMuted;
    setIsSoundMuted(newMutedState);
    
    console.log('🔘 New muted state:', newMutedState);
    
    // Initialize audio context and play test sound when unmuting
    if (!newMutedState) {
      console.log('🔊 Enabling sound alerts...');
      
      // Request notification permission for background alerts
      const notifGranted = await requestNotificationPermission();
      
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
        if (notifGranted) {
          toast.success('Sound & background notifications enabled');
        } else {
          toast.success('Sound alerts enabled (enable browser notifications for background alerts)');
        }
      }, 100);
    } else {
      console.log('🔇 Sound alerts muted');
      toast.info('Sound alerts muted');
    }
  };

  // Handle visibility change - refresh data when user returns to tab
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        console.log('👋 Tab hidden - background mode');
        isTabHiddenRef.current = true;
      } else {
        console.log('👀 Tab visible - refreshing data');
        isTabHiddenRef.current = false;
        
        // Immediately refresh all data when user returns
        loadLoadEmails();
        loadHuntMatches();
        loadUnreviewedMatches();
        loadHuntPlans();
        
        // Resume audio context if it was suspended
        if (audioContext && audioContext.state === 'suspended') {
          audioContext.resume();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Check initial notification permission
    if ('Notification' in window && Notification.permission === 'granted') {
      setNotificationsEnabled(true);
    }
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [audioContext]);

  // Function to refresh my vehicles (assigned to current dispatcher)
  const refreshMyVehicleIds = async () => {
    const dispatcherId = currentDispatcherIdRef.current;
    if (!dispatcherId) return;
    
    const { data: assignedVehicles } = await supabase
      .from('vehicles')
      .select('id, vehicle_number')
      .eq('primary_dispatcher_id', dispatcherId);
    
    if (assignedVehicles) {
      setMyVehicleIds(assignedVehicles.map(v => v.id));
      console.log('✅ Refreshed my vehicle IDs:', assignedVehicles.map(v => v.id));
    }
  };
  
  // Keep refs updated for real-time subscription callbacks
  refreshMyVehicleIdsRef.current = refreshMyVehicleIds;
  
  // Combined refresh for vehicle data (used by VehicleAssignmentView)
  const refreshVehicleData = async () => {
    await loadVehicles();
    await refreshMyVehicleIds();
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
          setCurrentDispatcherInfo(dispatcher);
          currentDispatcherIdRef.current = dispatcher.id;
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
    loadMissedHistory(); // Load missed history for Missed tab
    loadCarriersAndPayees();
    loadCanonicalVehicleTypes();
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
          // Reset to page 1 so user sees the new email at the top
          setCurrentPage(1);
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

    // Subscribe to real-time updates for vehicles (dispatcher assignments)
    const vehiclesChannel = supabase
      .channel('vehicles-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'vehicles'
        },
        (payload) => {
          console.log('Vehicle change:', payload);
          // Use refs to call the latest versions of these functions
          loadVehiclesRef.current?.();
          refreshMyVehicleIdsRef.current?.();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(emailsChannel);
      supabase.removeChannel(huntPlansChannel);
      supabase.removeChannel(matchesChannel);
      supabase.removeChannel(vehiclesChannel);
    };
  }, []);

  // DISABLED: Sound notifications - not supposed to notify
  // Sound and system notifications have been disabled per user request

  // Interval to check for missed loads (15 min) and deactivate stale matches (30 min)
  useEffect(() => {
    // Run immediately on mount
    checkAndMarkMissedLoads();
    deactivateStaleMatches();
    
    // Run every 30 seconds
    const missedCheckInterval = setInterval(() => {
      console.log('⏰ Running missed load check (15 min) and stale match check (30 min)');
      checkAndMarkMissedLoads();
      deactivateStaleMatches();
    }, 30 * 1000);
    
    return () => clearInterval(missedCheckInterval);
  }, []);

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
  
  // Keep ref updated for real-time subscription callbacks
  loadVehiclesRef.current = loadVehicles;

  const loadDrivers = async () => {
    try {
      const { data, error } = await supabase
        .from("applications")
        .select("id, personal_info, vehicle_note")
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

  // Load canonical vehicle types from sylectus_type_config
  const loadCanonicalVehicleTypes = async () => {
    try {
      // Fetch from BOTH vehicle and load categories since they share canonical names
      const { data, error } = await supabase
        .from("sylectus_type_config")
        .select("type_category, original_value, mapped_to");

      if (error) throw error;

      // Build mappings: original_value -> mapped_to (or null if hidden)
      const mappings = new Map<string, string>();
      const canonicalSet = new Set<string>();

      data?.forEach((config: any) => {
        if (config.mapped_to) {
          // This type maps to a canonical type - store lowercase for matching
          mappings.set(config.original_value.toLowerCase(), config.mapped_to.toUpperCase());
          canonicalSet.add(config.mapped_to.toUpperCase());
        }
        // If mapped_to is null, it's hidden - don't add to canonical
      });

      setVehicleTypeMappings(mappings);

      // If we have canonical types, use them; otherwise fall back to defaults
      if (canonicalSet.size > 0) {
        const types = Array.from(canonicalSet).sort().map(t => ({
          value: t, // Keep the canonical name as-is (e.g., "SPRINTER")
          label: t  // Display same value
        }));
        setCanonicalVehicleTypes(types);
      } else {
        // Default fallback types
        setCanonicalVehicleTypes([
          { value: 'LARGE STRAIGHT', label: 'LARGE STRAIGHT' },
          { value: 'SMALL STRAIGHT', label: 'SMALL STRAIGHT' },
          { value: 'CARGO VAN', label: 'CARGO VAN' },
          { value: 'SPRINTER', label: 'SPRINTER' },
          { value: 'STRAIGHT', label: 'STRAIGHT' },
          { value: 'FLATBED', label: 'FLATBED' },
        ]);
      }
    } catch (error) {
      console.error("Failed to load canonical vehicle types:", error);
    }
  };

  const loadLoadEmails = async (retries = 3) => {
    console.log('📧 Loading emails...');
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        // Only fetch emails processed in the last 30 minutes - fresh emails only
        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
        
        // Sort by received_at (when email was originally received) - most recent first
        const { data, error } = await supabase
          .from("load_emails")
          .select("*")
          .gte("created_at", thirtyMinutesAgo)
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
        console.log(`✅ Loaded ${data?.length || 0} emails (last 48h by created_at)`);
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
            floorLoadId: plan.floor_load_id || null,
            initialMatchDone: plan.initial_match_done || false,
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
        // Get midnight ET for today (skipped/bids only show today's matches)
        const now = new Date();
        const etOffset = -5; // EST offset (use -4 for EDT)
        const utcHour = now.getUTCHours();
        const etHour = (utcHour + 24 + etOffset) % 24;
        const midnightET = new Date(now);
        midnightET.setUTCHours(utcHour - etHour, 0, 0, 0);
        const midnightETIso = midnightET.toISOString();

        // Fetch active matches (match_status = 'active')
        const { data: activeData, error: activeError } = await supabase
          .from("load_hunt_matches")
          .select("*")
          .eq('match_status', 'active');

        // Fetch manually skipped matches (match_status = 'skipped', today only) - include email data
        const { data: skippedData, error: skippedError } = await supabase
          .from("load_hunt_matches")
          .select(`
            *,
            load_emails (
              id, email_id, load_id, from_email, from_name, subject, body_text, body_html,
              received_at, expires_at, parsed_data, status, created_at, updated_at, has_issues
            )
          `)
          .eq('match_status', 'skipped')
          .gte('updated_at', midnightETIso);

        // Fetch bid matches (match_status = 'bid', today only - clears at midnight) - include email data
        const { data: bidData, error: bidError } = await supabase
          .from("load_hunt_matches")
          .select(`
            *,
            load_emails (
              id, email_id, load_id, from_email, from_name, subject, body_text, body_html,
              received_at, expires_at, parsed_data, status, created_at, updated_at, has_issues
            )
          `)
          .eq('match_status', 'bid')
          .gte('updated_at', midnightETIso);

        // Fetch undecided matches (match_status = 'undecided') - include email data
        // These are matches that were viewed but no action taken
        const { data: undecidedData, error: undecidedError } = await supabase
          .from("load_hunt_matches")
          .select(`
            *,
            load_emails (
              id, email_id, load_id, from_email, from_name, subject, body_text, body_html,
              received_at, expires_at, parsed_data, status, created_at, updated_at, has_issues
            )
          `)
          .eq('match_status', 'undecided');

        // Fetch waitlist matches (match_status = 'waitlist', today only) - include email data
        const { data: waitlistData, error: waitlistError } = await supabase
          .from("load_hunt_matches")
          .select(`
            *,
            load_emails (
              id, email_id, load_id, from_email, from_name, subject, body_text, body_html,
              received_at, expires_at, parsed_data, status, created_at, updated_at, has_issues
            )
          `)
          .eq('match_status', 'waitlist')
          .gte('updated_at', midnightETIso);

        if (activeError || skippedError || bidError || undecidedError || waitlistError) {
          console.error(`🔗 Attempt ${attempt} failed:`, activeError || skippedError || bidError || undecidedError || waitlistError);
          if (attempt === retries) {
            toast.error('Failed to load hunt matches - please refresh');
            return;
          }
          await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 500));
          continue;
        }
        
        const active = activeData || [];
        const skipped = skippedData || [];
        const bids = bidData || [];
        const undecided = undecidedData || [];
        const waitlist = waitlistData || [];

        console.log(`✅ Loaded ${active.length} active, ${skipped.length} skipped, ${bids.length} bids, ${undecided.length} undecided, ${waitlist.length} waitlist`);
        
        setLoadMatches(active);
        setSkippedMatches(skipped);
        setBidMatches(bids);
        setUndecidedMatches(undecided);
        setWaitlistMatches(waitlist);
        
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
        console.log('📊 Sample match:', data?.[0]);
        console.log('📊 Current myVehicleIds:', myVehicleIds);
        console.log('📊 Current activeMode:', activeMode);
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

  // Load missed history from database - shows all loads that went 15+ min without action
  const loadMissedHistory = async () => {
    try {
      const { data, error } = await supabase
        .from('missed_loads_history')
        .select(`
          id,
          load_email_id,
          hunt_plan_id,
          vehicle_id,
          match_id,
          missed_at,
          received_at,
          from_email,
          subject,
          dispatcher_id
        `)
        .order('missed_at', { ascending: false })
        .limit(500);

      if (error) {
        console.error('Error loading missed history:', error);
        return;
      }

      // Fetch full email data for each missed record
      if (data && data.length > 0) {
        const emailIds = [...new Set(data.map(m => m.load_email_id))];
        const { data: emails } = await supabase
          .from('load_emails')
          .select('*')
          .in('id', emailIds);

        const emailMap = new Map(emails?.map(e => [e.id, e]) || []);
        
        // Enrich missed history with full email data
        const enrichedData = data.map(m => ({
          ...m,
          email: emailMap.get(m.load_email_id) || null
        }));

        console.log(`📊 Loaded ${enrichedData.length} missed history records`);
        setMissedHistory(enrichedData);
      } else {
        setMissedHistory([]);
      }
    } catch (err) {
      console.error('Error in loadMissedHistory:', err);
    }
  };

  // Check for matches that are 15+ minutes old and create copies in missed_loads_history
  // ONLY for matches with match_status = 'active' (not skipped, bid, waitlist, undecided)
  const checkAndMarkMissedLoads = async () => {
    try {
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      
      // Get active matches that are older than 15 minutes AND have not been acted upon
      // Excludes: skipped, bid, waitlist, undecided matches
      const { data: oldMatches, error: matchError } = await supabase
        .from('load_hunt_matches')
        .select(`
          id,
          load_email_id,
          hunt_plan_id,
          vehicle_id,
          matched_at,
          match_status,
          load_emails!inner (
            id,
            from_email,
            subject,
            received_at,
            status
          )
        `)
        .eq('is_active', true)
        .eq('match_status', 'active')  // Only consider truly unacted matches
        .lt('matched_at', fifteenMinutesAgo);

      if (matchError) {
        console.error('Error fetching old matches:', matchError);
        return;
      }

      // Filter out matches where the email has been acted upon (waitlist, undecided, etc.)
      const unactedMatches = (oldMatches || []).filter(m => {
        const emailStatus = (m.load_emails as any)?.status;
        // Only consider for missed if email status is 'new' (not waitlist, undecided, skipped, etc.)
        return emailStatus === 'new';
      });

      if (unactedMatches.length === 0) {
        return;
      }

      // Check which matches are already in missed_loads_history
      const matchIds = unactedMatches.map(m => m.id);
      const { data: existingMissed } = await supabase
        .from('missed_loads_history')
        .select('match_id')
        .in('match_id', matchIds);

      const existingMatchIds = new Set(existingMissed?.map(m => m.match_id) || []);
      
      // Filter to only matches not already in history
      const newMissedMatches = unactedMatches.filter(m => !existingMatchIds.has(m.id));

      if (newMissedMatches.length === 0) {
        return;
      }

      console.log(`⚠️ Found ${newMissedMatches.length} new missed matches (15+ min old)`);

      // Insert new missed records
      const missedRecords = newMissedMatches.map(m => ({
        load_email_id: m.load_email_id,
        hunt_plan_id: m.hunt_plan_id,
        vehicle_id: m.vehicle_id,
        match_id: m.id,
        missed_at: new Date().toISOString(),
        from_email: (m.load_emails as any)?.from_email || null,
        subject: (m.load_emails as any)?.subject || null,
        received_at: (m.load_emails as any)?.received_at || null
      }));

      const { error: insertError } = await supabase
        .from('missed_loads_history')
        .insert(missedRecords);

      if (insertError) {
        console.error('Error inserting missed records:', insertError);
        return;
      }

      console.log(`✅ Created ${missedRecords.length} missed history records`);
      
      // Reload missed history
      await loadMissedHistory();
    } catch (err) {
      console.error('Error in checkAndMarkMissedLoads:', err);
    }
  };

  // DELETE matches that are 40+ minutes old (completely remove from Unreviewed AND Undecided)
  const deactivateStaleMatches = async () => {
    try {
      const fortyMinutesAgo = new Date(Date.now() - 40 * 60 * 1000).toISOString();
      
      // Find active OR undecided matches older than 40 minutes (based on matched_at)
      const { data: staleMatches, error: fetchError } = await supabase
        .from('load_hunt_matches')
        .select('id, match_status')
        .in('match_status', ['active', 'undecided'])
        .lt('matched_at', fortyMinutesAgo);

      if (fetchError) {
        console.error('Error fetching stale matches:', fetchError);
        return;
      }

      if (!staleMatches || staleMatches.length === 0) {
        return;
      }

      const activeCount = staleMatches.filter(m => m.match_status === 'active').length;
      const undecidedCount = staleMatches.filter(m => m.match_status === 'undecided').length;
      console.log(`🕐 Found ${staleMatches.length} stale matches (40+ min old) - DELETING (${activeCount} active, ${undecidedCount} undecided)`);

      // DELETE in batches of 50 to avoid URL length limits
      const BATCH_SIZE = 50;
      for (let i = 0; i < staleMatches.length; i += BATCH_SIZE) {
        const batch = staleMatches.slice(i, i + BATCH_SIZE);
        const batchIds = batch.map(m => m.id);
        
        const { error: deleteError } = await supabase
          .from('load_hunt_matches')
          .delete()
          .in('id', batchIds);

        if (deleteError) {
          console.error(`Error deleting batch ${i / BATCH_SIZE + 1}:`, deleteError);
        }
      }

      console.log(`✅ Deleted ${staleMatches.length} stale matches`);
      
      // Reload matches
      await loadUnreviewedMatches();
      await loadHuntMatches();
    } catch (err) {
      console.error('Error in deactivateStaleMatches:', err);
    }
  };

  // Track dispatcher action in match_action_history
  const trackDispatcherAction = async (matchId: string, actionType: string, actionDetails?: any) => {
    try {
      console.log('📊 Tracking action:', actionType, 'for match:', matchId, 'dispatcher:', currentDispatcherInfo?.email);
      const { error } = await supabase.from('match_action_history').insert({
        match_id: matchId,
        dispatcher_id: currentDispatcherInfo?.id || null,
        dispatcher_name: currentDispatcherInfo ? `${currentDispatcherInfo.first_name} ${currentDispatcherInfo.last_name}` : null,
        dispatcher_email: currentDispatcherInfo?.email || null,
        action_type: actionType,
        action_details: actionDetails || null
      });
      if (error) {
        console.error('❌ Error inserting action history:', error);
      } else {
        console.log('✅ Action tracked successfully:', actionType);
      }
    } catch (e) {
      console.error('Error tracking dispatcher action:', e);
    }
  };

  // Handle moving a viewed match to undecided status (when user closes without action)
  const handleMoveToUndecided = async (matchId: string) => {
    try {
      console.log('🤔 Moving match to undecided:', matchId);
      
      // Track the undecided action
      await trackDispatcherAction(matchId, 'undecided');
      
      const { error } = await supabase
        .from('load_hunt_matches')
        .update({ match_status: 'undecided', is_active: false })
        .eq('id', matchId);

      if (error) throw error;

      await loadHuntMatches();
      await loadUnreviewedMatches();
      console.log('✅ Match moved to undecided');
    } catch (error) {
      console.error('Error moving match to undecided:', error);
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
    setMatchActionTaken(true); // Mark that action was taken
    
    // Optimistic update - immediately remove from unreviewed UI for instant feedback
    setUnreviewedViewData(prev => prev.filter(m => m.match_id !== matchId));
    setLoadMatches(prev => prev.filter(m => m.id !== matchId));
    
    try {
      // Run DB operations in parallel for speed
      const [, { error }] = await Promise.all([
        trackDispatcherAction(matchId, 'skipped'),
        supabase
          .from('load_hunt_matches')
          .update({ match_status: 'skipped', is_active: false })
          .eq('id', matchId)
      ]);

      if (error) throw error;
      
      // Refresh all match data to update counts (skip, vehicle badges, etc.)
      await loadHuntMatches();
    } catch (err) {
      console.error('Error skipping match:', err);
      toast.error('Failed to skip match');
      // Refetch all on error to restore correct state
      await loadHuntMatches();
      await loadUnreviewedMatches();
    }
  };

  // Handle bid placed - move match to MY BIDS and skip all sibling matches
  const handleBidPlaced = async (matchId: string, loadEmailId: string) => {
    try {
      setMatchActionTaken(true); // Mark that action was taken
      console.log('💰 Bid placed for match:', matchId, 'load:', loadEmailId);
      
      // 1. Set this match to 'bid' status
      const { error: bidError } = await supabase
        .from('load_hunt_matches')
        .update({ match_status: 'bid', is_active: false })
        .eq('id', matchId);

      if (bidError) throw bidError;

      // 2. Find and skip all sibling matches (same load_email_id, different match)
      const { data: siblingMatches, error: fetchError } = await supabase
        .from('load_hunt_matches')
        .select('id')
        .eq('load_email_id', loadEmailId)
        .neq('id', matchId)
        .eq('match_status', 'active');

      if (fetchError) {
        console.error('Error fetching sibling matches:', fetchError);
      } else if (siblingMatches && siblingMatches.length > 0) {
        console.log(`📋 Found ${siblingMatches.length} sibling matches to skip`);
        
        const siblingIds = siblingMatches.map(m => m.id);
        const { error: skipError } = await supabase
          .from('load_hunt_matches')
          .update({ match_status: 'skipped', is_active: false })
          .in('id', siblingIds);

        if (skipError) {
          console.error('Error skipping sibling matches:', skipError);
        } else {
          console.log(`✅ Skipped ${siblingMatches.length} sibling matches`);
        }
      }

      await loadHuntMatches();
      await loadUnreviewedMatches();
      toast.success('Bid placed - moved to My Bids');
    } catch (error) {
      console.error('Error placing bid:', error);
      toast.error('Failed to update match status');
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

  const handleSkipEmail = async (emailId: string, matchId?: string) => {
    try {
      // Track the skip action if we have a match ID
      if (matchId) {
        await trackDispatcherAction(matchId, 'skipped');
      }
      
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

  const handleWaitlistMatch = async (matchId: string) => {
    try {
      setMatchActionTaken(true); // Mark that action was taken
      matchActionTakenRef.current = true;
      
      // Track the waitlist action
      await trackDispatcherAction(matchId, 'waitlist');
      
      const { error } = await supabase
        .from('load_hunt_matches')
        .update({ match_status: 'waitlist', is_active: false })
        .eq('id', matchId);

      if (error) throw error;

      await loadHuntMatches();
      await loadUnreviewedMatches();
      toast.success('Match moved to waitlist');
    } catch (error) {
      console.error('Error moving match to waitlist:', error);
      toast.error('Failed to move match to waitlist');
    }
  };

  const handleMoveToWaitlist = async (emailId: string, matchId?: string) => {
    try {
      // If we have a matchId, use the new match-based function
      if (matchId) {
        await handleWaitlistMatch(matchId);
        return;
      }
      
      // Fallback: Update email status only (for non-match cases)
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

      // Get the current highest load_id as the floor
      const { data: latestLoad } = await supabase
        .from('load_emails')
        .select('load_id')
        .order('load_id', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      const floorLoadId = latestLoad?.load_id || null;
      console.log('📍 New hunt - Setting floor_load_id:', floorLoadId);

      // Save to database with floor_load_id set
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
          floor_load_id: floorLoadId,
          initial_match_done: false,
        })
        .select()
        .single();

      if (error) throw error;
      
      setCreateHuntOpen(false);
      toast.info("Hunt created - searching 15 minutes back...");
      
      // Do 15-minute backfill for new hunt
      if (data && huntCoordinates) {
        const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
        console.log('⏰ New hunt backfill from:', fifteenMinutesAgo.toISOString());
        
        const { data: backfillLoads } = await supabase
          .from('load_emails')
          .select('*')
          .gte('received_at', fifteenMinutesAgo.toISOString())
          .eq('status', 'new');
        
        if (backfillLoads && backfillLoads.length > 0) {
          console.log(`📧 Found ${backfillLoads.length} loads for 15-min backfill`);
          
          const transformedHunt: HuntPlan = {
            id: data.id,
            vehicleId: selectedVehicle.id,
            planName: huntFormData.planName,
            vehicleSizes: huntFormData.vehicleSizes,
            zipCode: huntFormData.zipCode,
            availableFeet: huntFormData.availableFeet,
            partial: huntFormData.partial,
            pickupRadius: huntFormData.pickupRadius,
            mileLimit: huntFormData.mileLimit,
            loadCapacity: huntFormData.loadCapacity,
            availableDate: huntFormData.availableDate,
            availableTime: huntFormData.availableTime,
            destinationZip: huntFormData.destinationZip,
            destinationRadius: huntFormData.destinationRadius,
            notes: huntFormData.notes,
            createdBy: user?.id || "",
            createdAt: new Date(),
            lastModified: new Date(),
            huntCoordinates,
            enabled: true,
            floorLoadId,
            initialMatchDone: false,
          };
          
          const backfillMatches: Array<{
            load_email_id: string;
            hunt_plan_id: string;
            vehicle_id: string;
            distance_miles: number | null;
            is_active: boolean;
            match_status: string;
          }> = [];
          
          for (const load of backfillLoads) {
            const loadData = extractLoadLocation(load);
            if (!loadData.originCityState && !loadData.originZip) continue;
            
            const matchResult = await doesLoadMatchHunt(loadData, transformedHunt);
            if (matchResult.matches) {
              console.log('✅ New hunt backfill match:', load.load_id);
              backfillMatches.push({
                load_email_id: load.id,
                hunt_plan_id: data.id,
                vehicle_id: selectedVehicle.id,
                distance_miles: matchResult.distance || null,
                is_active: true,
                match_status: 'active',
              });
            }
          }
          
          if (backfillMatches.length > 0) {
            console.log(`💾 Saving ${backfillMatches.length} backfill matches for new hunt`);
            await supabase
              .from('load_hunt_matches')
              .upsert(backfillMatches, { onConflict: 'load_email_id,hunt_plan_id', ignoreDuplicates: true });
            toast.success(`Hunt created - found ${backfillMatches.length} matches from last 15 min`);
          } else {
            toast.success("Hunt created - no matches in last 15 min, now watching for new loads");
          }
        } else {
          toast.success("Hunt created - no loads in last 15 min, now watching for new loads");
        }
        
        // Mark initial match as done
        await supabase
          .from("hunt_plans")
          .update({ initial_match_done: true })
          .eq("id", data.id);
      } else {
        toast.success("Hunt plan created - now watching for new loads");
      }
      
      // Reload hunt plans from database
      await loadHuntPlans();
      
      // Trigger re-filtering of loads
      await loadLoadEmails();
      await loadHuntMatches();
      await loadUnreviewedMatches();
      
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
      if (!currentEnabled) {
        // ENABLING the hunt - set floor_load_id and do 15-min backfill
        console.log('🎯 Enabling hunt - setting floor_load_id and doing 15-min backfill');
        
        // Get the current highest load_id as the floor (never go older than this after initial backfill)
        const { data: latestLoad } = await supabase
          .from('load_emails')
          .select('load_id')
          .order('load_id', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        const floorLoadId = latestLoad?.load_id || null;
        console.log('📍 Setting floor_load_id:', floorLoadId);
        
        // Update hunt with enabled=true, floor_load_id, but NOT initial_match_done yet
        const { error: updateError } = await supabase
          .from("hunt_plans")
          .update({ 
            enabled: true,
            floor_load_id: floorLoadId,
            initial_match_done: false
          })
          .eq("id", id);

        if (updateError) throw updateError;
        
        // Get the hunt plan details for matching
        const { data: huntPlan } = await supabase
          .from('hunt_plans')
          .select('*')
          .eq('id', id)
          .single();
        
        if (huntPlan) {
          // Do 15-minute backfill
          const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
          console.log('⏰ Backfilling loads from:', fifteenMinutesAgo.toISOString());
          
          const { data: backfillLoads, error: fetchError } = await supabase
            .from('load_emails')
            .select('*')
            .gte('received_at', fifteenMinutesAgo.toISOString())
            .eq('status', 'new');
          
          if (!fetchError && backfillLoads && backfillLoads.length > 0) {
            console.log(`📧 Found ${backfillLoads.length} loads for 15-min backfill`);
            
            // Parse vehicle_sizes
            let vehicleSizes: string[] = [];
            if (huntPlan.vehicle_size) {
              try {
                const parsed = JSON.parse(huntPlan.vehicle_size);
                vehicleSizes = Array.isArray(parsed) ? parsed : [huntPlan.vehicle_size];
              } catch {
                vehicleSizes = [huntPlan.vehicle_size];
              }
            }
            
            const transformedHunt: HuntPlan = {
              id: huntPlan.id,
              vehicleId: huntPlan.vehicle_id,
              planName: huntPlan.plan_name,
              vehicleSizes,
              zipCode: huntPlan.zip_code || "",
              availableFeet: huntPlan.available_feet || "",
              partial: huntPlan.partial || false,
              pickupRadius: huntPlan.pickup_radius || "100",
              mileLimit: huntPlan.mile_limit || "",
              loadCapacity: huntPlan.load_capacity || "",
              availableDate: huntPlan.available_date || "",
              availableTime: huntPlan.available_time || "",
              destinationZip: huntPlan.destination_zip || "",
              destinationRadius: huntPlan.destination_radius || "",
              notes: huntPlan.notes || "",
              createdBy: huntPlan.created_by || "",
              createdAt: new Date(huntPlan.created_at),
              lastModified: new Date(huntPlan.last_modified),
              huntCoordinates: huntPlan.hunt_coordinates as { lat: number; lng: number } | null,
              enabled: true,
              floorLoadId: floorLoadId,
              initialMatchDone: false,
            };
            
            // Match backfill loads
            const backfillMatches: Array<{
              load_email_id: string;
              hunt_plan_id: string;
              vehicle_id: string;
              distance_miles: number | null;
              is_active: boolean;
              match_status: string;
            }> = [];
            
            for (const load of backfillLoads) {
              const loadData = extractLoadLocation(load);
              if (!loadData.originCityState && !loadData.originZip) continue;
              
              const matchResult = await doesLoadMatchHunt(loadData, transformedHunt);
              if (matchResult.matches) {
                console.log('✅ Backfill match:', load.load_id);
                backfillMatches.push({
                  load_email_id: load.id,
                  hunt_plan_id: id,
                  vehicle_id: huntPlan.vehicle_id,
                  distance_miles: matchResult.distance || null,
                  is_active: true,
                  match_status: 'active',
                });
              }
            }
            
            if (backfillMatches.length > 0) {
              console.log(`💾 Saving ${backfillMatches.length} backfill matches`);
              await supabase
                .from('load_hunt_matches')
                .upsert(backfillMatches, { onConflict: 'load_email_id,hunt_plan_id', ignoreDuplicates: true });
            }
          }
        }
        
        // Mark initial match as done - now forward-only matching will take over
        await supabase
          .from("hunt_plans")
          .update({ initial_match_done: true })
          .eq("id", id);
        
        console.log('✅ Hunt enabled with 15-min backfill complete, switching to forward-only mode');
        toast.success("Hunt enabled - 15-min backfill complete, now forward-only");
        
      } else {
        // DISABLING the hunt
        const { error } = await supabase
          .from("hunt_plans")
          .update({ 
            enabled: false,
            floor_load_id: null,
            initial_match_done: false
          })
          .eq("id", id);

        if (error) throw error;
        toast.success("Hunt disabled");
      }
      
      // Reload hunt plans from database
      await loadHuntPlans();
      await loadLoadEmails();
      await loadHuntMatches();
      await loadUnreviewedMatches();
      
    } catch (error) {
      console.error("Error toggling hunt:", error);
      toast.error("Failed to toggle hunt");
    }
  };

  const handleEditHunt = (hunt: HuntPlan) => {
    setEditingHunt(hunt);
    // Map stored values to canonical types and deduplicate
    const canonicalValues = canonicalVehicleTypes.map(ct => ct.value.toUpperCase());
    const mappedVehicleSizes = new Set<string>();
    hunt.vehicleSizes.forEach(size => {
      const upperSize = size.toUpperCase();
      // Check if it's already a canonical type
      if (canonicalValues.includes(upperSize)) {
        mappedVehicleSizes.add(upperSize);
      } else {
        // Check if it maps to a canonical type
        const mappedTo = vehicleTypeMappings.get(size.toLowerCase());
        if (mappedTo && canonicalValues.includes(mappedTo.toUpperCase())) {
          mappedVehicleSizes.add(mappedTo.toUpperCase());
        }
      }
    });
    setHuntFormData({
      planName: hunt.planName,
      vehicleSizes: Array.from(mappedVehicleSizes),
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

  // Mobile view
  if (isMobile) {
    return (
      <>
        <LoadHunterMobile
          vehicles={vehicles}
          huntPlans={huntPlans}
          loadEmails={loadEmails}
          unreviewedViewData={unreviewedViewData}
          skippedMatches={skippedMatches}
          bidMatches={bidMatches}
          missedHistory={missedHistory}
          loadMatches={loadMatches}
          loading={loading}
          refreshing={refreshing}
          activeFilter={activeFilter}
          filterVehicleId={filterVehicleId}
          activeMode={activeMode}
          myVehicleIds={myVehicleIds}
          isSoundMuted={isSoundMuted}
          carriersMap={carriersMap}
          onRefresh={handleRefreshLoads}
          onFilterChange={(filter, vehicleId) => {
            setActiveFilter(filter);
            setFilterVehicleId(vehicleId ?? null);
            setSelectedVehicle(null);
            setSelectedEmailForDetail(null);
          }}
          onModeChange={setActiveMode}
          onToggleSound={() => setIsSoundMuted(!isSoundMuted)}
          onSelectLoad={(email, match) => {
            setSelectedEmailForDetail(email);
            setSelectedMatchForDetail(match);
            if (match?.distance_miles) {
              setSelectedEmailDistance(match.distance_miles);
            }
          }}
          onSkipMatch={handleSkipMatch}
          onToggleHunt={handleToggleHunt}
          getDriverName={getDriverName}
        />
        
        {/* Load Email Detail Dialog for Mobile */}
        {selectedEmailForDetail && (
          <Dialog open={!!selectedEmailForDetail} onOpenChange={async () => {
            // Only move to undecided if NO action was taken
            // The ref must be checked first - if action was taken, skip undecided logic entirely
            if (!matchActionTakenRef.current && selectedMatchForDetail && selectedMatchForDetail.match_status === 'active') {
              await handleMoveToUndecided(selectedMatchForDetail.id);
            }
            setSelectedEmailForDetail(null);
            setSelectedMatchForDetail(null);
            setMatchActionTaken(false);
            matchActionTakenRef.current = false; // Reset ref for next match
          }}>
            <DialogContent className="max-w-full h-[90vh] p-0 overflow-hidden">
              <LoadEmailDetail
                email={selectedEmailForDetail}
                onClose={async () => {
                  // Only move to undecided if NO action was taken
                  // The ref must be checked first - if action was taken, skip undecided logic entirely
                  if (!matchActionTakenRef.current && selectedMatchForDetail && selectedMatchForDetail.match_status === 'active') {
                    await handleMoveToUndecided(selectedMatchForDetail.id);
                  }
                  setSelectedEmailForDetail(null);
                  setSelectedMatchForDetail(null);
                  setMatchActionTaken(false);
                  matchActionTakenRef.current = false; // Reset ref for next match
                }}
                emptyDriveDistance={selectedEmailDistance}
                match={selectedMatchForDetail}
                vehicles={vehicles}
                drivers={drivers}
                carriersMap={carriersMap}
                onBidPlaced={handleBidPlaced}
                onUndecided={async (matchId: string) => {
                  setMatchActionTaken(true);
                  matchActionTakenRef.current = true;
                  await handleMoveToUndecided(matchId);
                }}
                onSkip={async () => {
                  setMatchActionTaken(true);
                  matchActionTakenRef.current = true;
                  await loadHuntMatches();
                  await loadUnreviewedMatches();
                }}
                onWait={async () => {
                  setMatchActionTaken(true);
                  matchActionTakenRef.current = true;
                  await loadHuntMatches();
                  await loadUnreviewedMatches();
                }}
                onMarkUnreviewed={async () => {
                  setMatchActionTaken(true);
                  matchActionTakenRef.current = true;
                  await loadHuntMatches();
                  await loadUnreviewedMatches();
                }}
                onShowAlternativeMatches={async () => {
                  if (!selectedEmailForDetail) return;
                  const matchesForLoad = loadMatches.filter(m => m.load_email_id === selectedEmailForDetail.id);
                  
                  if (matchesForLoad.length > 1) {
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
                          load_email_id: match.load_email_id,
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
                    toast.info("This load only matches one vehicle");
                  }
                }}
              />
            </DialogContent>
          </Dialog>
        )}
        
        <UserActivityTracker />
      </>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Filter Bar - Full Width - Always Visible */}
      <div className="flex items-center gap-2 py-2 px-2 bg-background border-y overflow-x-auto flex-shrink-0 relative z-10">
          {/* Mode Buttons - Merged Toggle */}
          <div className="flex items-center overflow-hidden rounded-full border border-primary/30 flex-shrink-0">
            <Button 
              size="sm" 
              className={`h-7 px-3.5 text-xs font-semibold !rounded-none !rounded-l-full border-0 ${
                activeMode === 'admin' 
                  ? 'btn-glossy-dark text-white' 
                  : 'btn-glossy text-gray-600'
              }`}
              onClick={() => setActiveMode('admin')}
            >
              Admin
            </Button>
            
            <Button 
              size="sm" 
              className={`h-7 px-3.5 text-xs font-medium !rounded-none !rounded-r-full border-0 ${
                activeMode === 'dispatch' 
                  ? 'btn-glossy-primary text-white' 
                  : 'btn-glossy text-gray-600'
              }`}
              onClick={() => setActiveMode('dispatch')}
            >
              MY TRUCKS
            </Button>
          </div>
          
          <div className="flex-shrink-0">
            <Button 
              size="sm" 
              className="h-7 px-3.5 text-xs font-medium rounded-full border-0 btn-glossy-success text-white"
            >
              Add Vehicle
            </Button>
          </div>

          {/* Match Search */}
          <div className="flex-shrink-0 relative">
            <Input
              placeholder="Search match ID..."
              value={matchSearchQuery}
              onChange={(e) => setMatchSearchQuery(e.target.value)}
              onFocus={() => matchSearchQuery && setShowArchiveResults(true)}
              className="h-7 w-36 text-xs rounded-full px-3.5 input-inset"
            />
            {isSearchingArchive && (
              <div className="absolute right-5 top-1.5">
                <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
            {showArchiveResults && archivedSearchResults.length > 0 && (
              <div className="absolute top-8 left-0 w-80 bg-white border rounded-md shadow-lg z-50 max-h-64 overflow-y-auto">
                <div className="px-2 py-1 bg-gray-100 text-[10px] font-semibold text-gray-600 border-b">
                  Archived Matches ({archivedSearchResults.length})
                </div>
                {archivedSearchResults.map((result) => (
                  <div 
                    key={result.id}
                    className="px-2 py-1.5 hover:bg-gray-50 cursor-pointer border-b last:border-b-0 text-[11px]"
                    onClick={() => {
                      // Open detail view for archived match
                      const emailData = result.load_emails;
                      if (emailData) {
                        setSelectedEmailForDetail({
                          ...emailData,
                          match_id: result.original_match_id,
                          vehicle_id: result.vehicle_id,
                          hunt_plan_id: result.hunt_plan_id,
                          distance_miles: result.distance_miles,
                          match_status: result.match_status,
                          archived: true,
                          archived_at: result.archived_at
                        });
                        setSelectedEmailDistance(result.distance_miles);
                        setSelectedMatchForDetail({
                          match_id: result.original_match_id,
                          vehicle_id: result.vehicle_id,
                          archived: true
                        });
                      }
                      setShowArchiveResults(false);
                      setMatchSearchQuery('');
                    }}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-mono text-blue-600">{result.original_match_id?.slice(0, 8)}...</span>
                      <Badge variant="outline" className="text-[9px] h-4">{result.match_status}</Badge>
                    </div>
                    <div className="text-gray-500 truncate">
                      {result.load_emails?.parsed_data?.origin_city}, {result.load_emails?.parsed_data?.origin_state} → {result.load_emails?.parsed_data?.destination_city}, {result.load_emails?.parsed_data?.destination_state}
                    </div>
                    <div className="text-gray-400 text-[10px]">
                      Archived: {new Date(result.archived_at).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {showArchiveResults && matchSearchQuery.length >= 3 && archivedSearchResults.length === 0 && !isSearchingArchive && (
              <div className="absolute top-8 left-0 w-60 bg-white border rounded-md shadow-lg z-50 p-2 text-[11px] text-gray-500">
                No archived matches found
              </div>
            )}
          </div>

          {/* Filter Buttons */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Merged button group: All, Unreviewed, Sound */}
            <div className="flex items-center overflow-hidden rounded-full">
              <Button 
                size="sm" 
                className={`h-7 px-3 text-xs font-medium gap-1 !rounded-none !rounded-l-full border-0 ${
                  activeFilter === 'all' 
                    ? 'btn-glossy-dark text-white' 
                    : 'btn-glossy text-gray-600'
                }`}
                onClick={() => {
                  setActiveFilter('all');
                  setFilterVehicleId(null);
                  setSelectedVehicle(null);
                  setSelectedEmailForDetail(null);
                }}
              >
                All
                <span className={`badge-inset text-[10px] h-5 ${activeFilter === 'all' ? 'opacity-80' : ''}`}>{loadEmails.length}</span>
              </Button>
              
              <Button
                size="sm" 
                className={`h-7 px-3 text-xs font-medium gap-1 !rounded-none border-0 ${
                  activeFilter === 'unreviewed' 
                    ? 'btn-glossy-primary text-white' 
                    : 'btn-glossy text-gray-600'
                }`}
                onClick={() => {
                  setActiveFilter('unreviewed');
                  setFilterVehicleId(null);
                  setSelectedVehicle(null);
                  setSelectedEmailForDetail(null);
                }}
              >
                Unreviewed
                <span className="badge-inset-danger-bright text-[10px] h-5">{unreviewedCount}</span>
              </Button>
              
              <Button 
                size="sm" 
                className="h-7 w-7 p-0 !rounded-none !rounded-r-full border-0 btn-glossy text-gray-600"
                onClick={toggleSound}
                title={isSoundMuted ? "Sound alerts off" : "Sound alerts on"}
              >
                {isSoundMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
              </Button>
            </div>
            
            <Button
              size="sm" 
              className={`h-7 px-3 text-xs font-medium gap-1 rounded-full border-0 ${
                activeFilter === 'missed' 
                  ? 'btn-glossy-danger text-white' 
                  : 'btn-glossy text-gray-600'
              }`}
              onClick={() => {
                setActiveFilter('missed');
                setFilterVehicleId(null);
                setSelectedVehicle(null);
                setSelectedEmailForDetail(null);
              }}
            >
              Missed
              <span className="badge-inset-danger text-[10px] h-5">{missedCount}</span>
            </Button>
            
            {/* Merged button group: Wait, Undec, Skip */}
            <div className="flex items-center overflow-hidden rounded-full">
              <Button 
                size="sm" 
                className={`h-7 px-3 text-xs font-medium gap-1 !rounded-none !rounded-l-full border-0 ${
                  activeFilter === 'waitlist' 
                    ? 'btn-glossy-warning text-white' 
                    : 'btn-glossy text-gray-600'
                }`}
                onClick={() => {
                  setActiveFilter('waitlist');
                  setFilterVehicleId(null);
                  setSelectedVehicle(null);
                  setSelectedEmailForDetail(null);
                }}
              >
                Wait
                <span className="badge-inset-warning text-[10px] h-5">{waitlistCount}</span>
              </Button>
              
              <Button 
                size="sm" 
                className={`h-7 px-3 text-xs font-medium gap-1 !rounded-none border-0 ${
                  activeFilter === 'undecided' 
                    ? 'btn-glossy-warning text-white' 
                    : 'btn-glossy text-gray-600'
                }`}
                onClick={() => {
                  setActiveFilter('undecided');
                  setFilterVehicleId(null);
                  setSelectedVehicle(null);
                  setSelectedEmailForDetail(null);
                }}
              >
                Undec
                <span className="badge-inset-warning text-[10px] h-5">{undecidedCount}</span>
              </Button>
              
              <Button 
                size="sm" 
                className={`h-7 px-3 text-xs font-medium gap-1 !rounded-none !rounded-r-full border-0 ${
                  activeFilter === 'skipped' 
                    ? 'btn-glossy-dark text-white' 
                    : 'btn-glossy text-gray-600'
                }`}
                onClick={() => {
                  setActiveFilter('skipped');
                  setFilterVehicleId(null);
                  setSelectedVehicle(null);
                  setSelectedEmailForDetail(null);
                }}
              >
                Skip
                <span className="badge-inset text-[10px] h-5">{skippedCount}</span>
              </Button>
            </div>
            
            <Button 
              size="sm" 
              className={`h-7 px-3 text-xs font-medium gap-1 rounded-full border-0 ${
                activeFilter === 'mybids' 
                  ? 'btn-glossy-primary text-white' 
                  : 'btn-glossy text-gray-600'
              }`}
              onClick={() => {
                setActiveFilter('mybids');
                setFilterVehicleId(null);
                setSelectedVehicle(null);
                setSelectedEmailForDetail(null);
              }}
            >
              Bids
              <span className="badge-inset-primary text-[10px] h-5">{bidCount}</span>
            </Button>
            
            <Button
              size="sm" 
              className={`h-7 px-3 text-xs font-medium gap-1 rounded-full border-0 ${
                activeFilter === 'booked' 
                  ? 'btn-glossy-success text-white' 
                  : 'btn-glossy text-gray-600'
              }`}
              onClick={() => {
                setActiveFilter('booked');
                setSelectedVehicle(null);
                setSelectedEmailForDetail(null);
              }}
            >
              Booked
              <span className="badge-inset-success text-[10px] h-5">2</span>
            </Button>
            
            {issuesCount > 0 && (
              <Button
                size="sm" 
                className={`h-7 px-3 text-xs font-medium gap-1 rounded-full border-0 ${
                  activeFilter === 'issues' 
                    ? 'btn-glossy-warning text-white' 
                    : 'btn-glossy text-amber-600'
                }`}
                onClick={() => {
                  setActiveFilter('issues');
                  setSelectedVehicle(null);
                  setSelectedEmailForDetail(null);
                }}
              >
                ⚠️
                <span className="badge-inset-warning text-[10px] h-5">{issuesCount}</span>
              </Button>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1 ml-auto flex-shrink-0">
            <Button 
              size="sm" 
              className={`h-7 px-3 text-xs font-medium rounded-full border-0 ${
                activeFilter === 'vehicle-assignment' 
                  ? 'btn-glossy-primary text-white' 
                  : 'btn-glossy text-gray-600'
              }`}
              onClick={() => {
                setActiveFilter('vehicle-assignment');
                setSelectedVehicle(null);
                setSelectedEmailForDetail(null);
              }}
            >
              Assign
            </Button>
            
            <Button
              size="sm" 
              className={`h-7 px-3 text-xs font-medium rounded-full border-0 ${
                activeFilter === 'dispatcher-metrix' 
                  ? 'btn-glossy-primary text-white' 
                  : 'btn-glossy text-gray-600'
              }`}
              onClick={() => {
                setActiveFilter('dispatcher-metrix');
                setSelectedVehicle(null);
                setSelectedEmailForDetail(null);
              }}
            >
              Metrics
            </Button>
            
            <Button
              size="sm"
              className="gap-1 h-7 text-xs px-3.5 rounded-full border-0 btn-glossy-primary text-white font-medium"
              onClick={async () => {
                setRefreshing(true);
                try {
                  await handleRefreshLoads();
                  const enabledHunts = huntPlans.filter(h => h.enabled);
                  if (enabledHunts.length > 0) {
                    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
                    const recentLoads = loadEmails.filter(email => {
                      const receivedAt = new Date(email.received_at);
                      return receivedAt >= thirtyMinutesAgo && email.status === 'new';
                    });
                    toast.success(`Refreshed ${recentLoads.length} loads against ${enabledHunts.length} active hunt(s)`);
                  }
                } catch (error) {
                  console.error("Error refreshing:", error);
                  toast.error("Failed to refresh");
                } finally {
                  setRefreshing(false);
                }
              }}
              disabled={refreshing}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
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
              // Calculate unreviewed count for this vehicle from view data
              const unreviewedCount = unreviewedViewData.filter(m => 
                m.vehicle_id === vehicle.id
              ).length;
              // Calculate missed count for this vehicle from missedHistory
              const missedCount = missedHistory.filter(m => m.vehicle_id === vehicle.id).length;
              // Calculate skipped count for this vehicle
              const skippedCount = skippedMatches.filter(m => m.vehicle_id === vehicle.id).length;
              // Calculate bid count for this vehicle
              const bidCount = bidMatches.filter(m => m.vehicle_id === vehicle.id).length;
              // Check if oil change is due (negative remaining miles)
              const isOilChangeDue = vehicle.oil_change_remaining !== null && vehicle.oil_change_remaining <= 0;
              // Check if vehicle has active fault codes
              const hasFaultCodes = Array.isArray(vehicle.fault_codes) && vehicle.fault_codes.length > 0;
              return (
                <div 
                  key={vehicle.id} 
                  className={`p-2.5 cursor-pointer rounded-lg relative border transition-all duration-200 ${
                    hasEnabledHunt ? 'border-l-4 border-l-blue-500' : 'border-l-4 border-l-gray-200'
                  } ${selectedVehicle?.id === vehicle.id ? 'card-glossy-selected' : 'card-glossy'}`}
                  onClick={() => setSelectedVehicle(vehicle)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0 space-y-0.5 pr-16">
                      <div className="font-medium text-sm leading-tight text-carved flex items-center gap-1">
                        {vehicle.vehicle_number || "N/A"} - {getDriverName(vehicle.driver_1_id) || "No Driver Assigned"}
                      </div>
                      <div className="text-xs text-carved-light leading-tight">
                        {vehicle.dimensions_length ? `${vehicle.dimensions_length}' ` : ''}{vehicle.asset_subtype || vehicle.asset_type || "Asset Type"}
                      </div>
                      <div className="text-[11px] text-carved-light truncate leading-tight opacity-70">
                        {vehicle.carrier ? (carriersMap[vehicle.carrier] || "No Carrier") : "No Carrier"}
                      </div>
                    </div>
                    {/* Merged badge pill - glossy 3D button style, flush with edge */}
                    <div className="absolute -top-px -right-px flex items-center overflow-hidden rounded-bl-lg rounded-tr-lg">
                      {/* GREEN = Unreviewed */}
                      <div 
                        className="btn-glossy-success h-6 px-2.5 !rounded-none !border-0 !border-b-0 text-[11px] cursor-pointer hover:brightness-110 transition-all !py-0 flex items-center justify-center"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveFilter('unreviewed');
                          setFilterVehicleId(vehicle.id);
                          setSelectedVehicle(null);
                          setSelectedEmailForDetail(null);
                        }}
                        title={`View Unreviewed Loads for ${vehicle.vehicle_number || 'this truck'}`}
                      >
                        {unreviewedCount}
                      </div>
                      {/* GRAY = Skipped */}
                      <div 
                        className="btn-glossy h-6 px-2.5 !rounded-none !border-0 !border-b-0 text-[11px] text-gray-600 cursor-pointer hover:brightness-95 transition-all !py-0 flex items-center justify-center"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveFilter('skipped');
                          setFilterVehicleId(vehicle.id);
                          setSelectedVehicle(null);
                          setSelectedEmailForDetail(null);
                        }}
                        title={`View Skipped Loads for ${vehicle.vehicle_number || 'this truck'}`}
                      >
                        {skippedCount}
                      </div>
                      {/* BLUE = My Bids */}
                      <div 
                        className="btn-glossy-primary h-6 px-2.5 !rounded-none !border-0 !border-b-0 text-[11px] cursor-pointer hover:brightness-110 transition-all !py-0 flex items-center justify-center"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveFilter('mybids');
                          setFilterVehicleId(vehicle.id);
                          setSelectedVehicle(null);
                          setSelectedEmailForDetail(null);
                        }}
                        title={`View Bids for ${vehicle.vehicle_number || 'this truck'}`}
                      >
                        {bidCount}
                      </div>
                    </div>
                    {/* Status Text - plain text style */}
                    {vehicle.stopped_status && (
                      <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center">
                        <span className={`text-[10px] font-medium whitespace-nowrap ${
                          vehicle.stopped_status === 'Stopped' ? 'text-gray-400' : 
                          vehicle.stopped_status === 'Idling' ? 'text-orange-500' : 
                          'text-green-700'
                        }`}>
                          {vehicle.stopped_status === 'Stopped' ? 'Stopped' : 
                           vehicle.stopped_status === 'Idling' ? 'Idling' : 
                           `Moving${vehicle.speed !== null ? ` ${vehicle.speed}` : ''}`}
                        </span>
                      </div>
                    )}
                    {/* Maintenance & Fault Indicators - bottom right corner */}
                    {(isOilChangeDue || hasFaultCodes) && (
                      <div 
                        className="absolute bottom-0 right-0 flex items-center gap-0.5 bg-white/90 rounded-tl-md rounded-br-lg shadow-md p-0.5 cursor-pointer hover:bg-white transition-colors"
                        style={{ boxShadow: '0 2px 4px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.8)' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/dashboard/maintenance?vehicle=${vehicle.id}`);
                        }}
                      >
                        {isOilChangeDue && (
                          <img src={oilChangeIcon} alt="Oil" className="h-6 w-6 drop-shadow-sm" />
                        )}
                        {hasFaultCodes && (
                          <img src={checkEngineIcon} alt="Engine" className="h-6 w-6 drop-shadow-sm" />
                        )}
                      </div>
                    )}
                  </div>
                </div>
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
                    <div className={`text-sm min-h-[40px] whitespace-pre-wrap ${selectedVehicle.notes ? "text-destructive font-bold" : "text-muted-foreground"}`}>
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
                      const loadTypeRaw = loadData.loadType.toLowerCase();
                      
                      // Use mapping to get canonical type (uppercase), or use raw type uppercased if no mapping
                      const loadTypeCanonical = vehicleTypeMappings.get(loadTypeRaw) || loadData.loadType.toUpperCase();
                      
                      // Check if any of the selected vehicle sizes match the canonical type
                      const anyMatch = plan.vehicleSizes.some(size => {
                        // Direct match - both should be uppercase canonical names
                        return size.toUpperCase() === loadTypeCanonical.toUpperCase();
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
                      <span className="text-right max-w-[200px]">
                        {(() => {
                          // Map stored values to canonical types and deduplicate
                          const canonicalValues = canonicalVehicleTypes.map(ct => ct.value.toUpperCase());
                          const displayTypes = new Set<string>();
                          plan.vehicleSizes.forEach(size => {
                            const upperSize = size.toUpperCase();
                            // Check if it's already a canonical type
                            if (canonicalValues.includes(upperSize)) {
                              displayTypes.add(upperSize);
                            } else {
                              // Check if it maps to a canonical type
                              const mappedTo = vehicleTypeMappings.get(size.toLowerCase());
                              if (mappedTo && canonicalValues.includes(mappedTo.toUpperCase())) {
                                displayTypes.add(mappedTo.toUpperCase());
                              }
                            }
                          });
                          return displayTypes.size > 0 ? Array.from(displayTypes).sort().join(', ') : plan.vehicleSizes.join(', ');
                        })()}
                      </span>
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
                {canonicalVehicleTypes.length > 0 ? canonicalVehicleTypes.map((type) => (
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
                )) : (
                  <p className="text-sm text-muted-foreground col-span-2">No vehicle types configured. Configure them in Settings → Sylectus.</p>
                )}
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
                {canonicalVehicleTypes.length > 0 ? canonicalVehicleTypes.map((type) => (
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
                )) : (
                  <p className="text-sm text-muted-foreground col-span-2">No vehicle types configured. Configure them in Settings → Sylectus.</p>
                )}
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
            onClose={async () => {
              // Only move to undecided if NO action was taken
              // The ref must be checked first - if action was taken, skip undecided logic entirely
              if (!matchActionTakenRef.current && selectedMatchForDetail && selectedMatchForDetail.match_status === 'active') {
                await handleMoveToUndecided(selectedMatchForDetail.id);
              }
              setSelectedEmailForDetail(null);
              setSelectedMatchForDetail(null);
              setMatchActionTaken(false);
              matchActionTakenRef.current = false; // Reset ref for next match
            }}
            onBidPlaced={handleBidPlaced}
            onUndecided={async (matchId: string) => {
              setMatchActionTaken(true);
              matchActionTakenRef.current = true;
              await handleMoveToUndecided(matchId);
            }}
            onSkip={async () => {
              setMatchActionTaken(true);
              matchActionTakenRef.current = true;
              await loadHuntMatches();
              await loadUnreviewedMatches();
            }}
            onWait={async () => {
              setMatchActionTaken(true);
              matchActionTakenRef.current = true;
              await loadHuntMatches();
              await loadUnreviewedMatches();
            }}
            onMarkUnreviewed={async () => {
              setMatchActionTaken(true);
              matchActionTakenRef.current = true;
              await loadHuntMatches();
              await loadUnreviewedMatches();
            }}
            onShowAlternativeMatches={async () => {
              // Check if this load has multiple matches
              if (!selectedEmailForDetail) return;
              const matchesForLoad = loadMatches.filter(m => m.load_email_id === selectedEmailForDetail.id);
              
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
                      load_email_id: match.load_email_id,
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
                toast.info("This load only matches one vehicle");
              }
            }}
          />
        ) : activeFilter === 'vehicle-assignment' ? (
          /* Vehicle Assignment View */
          <VehicleAssignmentView
            vehicles={vehicles}
            drivers={drivers}
            onBack={() => setActiveFilter('unreviewed')}
            onRefresh={refreshVehicleData}
          />
        ) : activeFilter === 'dispatcher-metrix' ? (
          /* Dispatcher Metrics View */
          <DispatcherMetricsView dispatchers={[]} />
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
            {/* Vehicle Filter Indicator */}
            {filterVehicleId && (
              <div className="px-3 py-1.5 bg-blue-50 border-b flex items-center justify-between">
                <span className="text-xs text-blue-700">
                  Filtering by: <span className="font-semibold">{vehicles.find(v => v.id === filterVehicleId)?.vehicle_number || 'Unknown Truck'}</span>
                </span>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-5 px-2 text-xs text-blue-600 hover:text-blue-800"
                  onClick={() => setFilterVehicleId(null)}
                >
                  <X className="h-3 w-3 mr-1" />
                  Clear
                </Button>
              </div>
            )}
            <CardContent className="p-0 flex-1 flex flex-col">
              <div className="border-t">
                {(activeFilter === 'unreviewed' ? filteredMatches.length === 0 
                  : activeFilter === 'missed' ? missedHistory.length === 0 
                  : activeFilter === 'skipped' ? skippedMatches.length === 0
                  : activeFilter === 'mybids' ? bidMatches.length === 0
                  : activeFilter === 'undecided' ? undecidedMatches.length === 0
                  : activeFilter === 'waitlist' ? waitlistMatches.length === 0
                  : filteredEmails.length === 0) ? (
                  <div className="p-4 text-center text-xs text-muted-foreground">
                    {activeFilter === 'skipped' 
                      ? 'No skipped loads yet.' 
                      : activeFilter === 'unreviewed'
                      ? 'No matched loads. Create hunt plans to see matches here.'
                      : activeFilter === 'missed'
                      ? 'No missed loads. Loads that go 15+ minutes without action appear here.'
                      : activeFilter === 'mybids'
                      ? 'No bids placed yet. Send a bid on a load to see it here.'
                      : activeFilter === 'undecided'
                      ? 'No undecided loads. Loads you viewed but took no action on will appear here.'
                      : activeFilter === 'waitlist'
                      ? 'No waitlisted loads yet. Click Wait on a load to add it here.'
                      : 'No load emails found yet. Click "Refresh Loads" to start monitoring your inbox.'}
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="h-7">
                          <TableHead className="w-[30px] py-0 px-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 w-5 p-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowIdColumns(!showIdColumns);
                              }}
                              title={showIdColumns ? "Hide ID columns" : "Show ID columns"}
                            >
                              {showIdColumns ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                            </Button>
                          </TableHead>
                          {showIdColumns && (
                            <>
                              <TableHead className="w-[80px] py-0 text-[13px] leading-[1.1] text-blue-600 font-semibold">Order #</TableHead>
                              <TableHead className="w-[110px] py-0 text-[13px] leading-[1.1] text-blue-600 font-semibold">Load ID</TableHead>
                              {activeFilter !== 'all' && (
                                <TableHead className="w-[100px] py-0 text-[13px] leading-[1.1] text-blue-600 font-semibold">Match ID</TableHead>
                              )}
                            </>
                          )}
                          {activeFilter !== 'all' && (
                            <TableHead className="w-[140px] py-0 text-[13px] leading-[1.1] text-blue-600 font-semibold">Truck - Drivers<br/>Carrier</TableHead>
                          )}
                          <TableHead className="w-[60px] py-0 text-[13px] leading-[1.1] text-blue-600 font-semibold">Customer</TableHead>
                          <TableHead className="w-[95px] py-0 text-[13px] leading-[1.1] text-blue-600 font-semibold">Received<br/>Expires</TableHead>
                          <TableHead className="w-[115px] py-0 text-[13px] leading-[1.1] text-blue-600 font-semibold">Pickup Time<br/>Deliver Time</TableHead>
                          <TableHead className="w-[130px] py-0 text-[13px] leading-[1.1] text-blue-600 font-semibold">Origin<br/>Destination</TableHead>
                          <TableHead className="w-[60px] py-0 text-[13px] leading-[1.1] text-blue-600 font-semibold">Empty<br/>Loaded</TableHead>
                          <TableHead className="w-[100px] py-0 text-[13px] leading-[1.1] text-blue-600 font-semibold">Vehicle Type<br/>Weight</TableHead>
                          <TableHead className="w-[70px] py-0 text-[13px] leading-[1.1] text-blue-600 font-semibold">Pieces<br/>Dims</TableHead>
                          <TableHead className="w-[45px] py-0 text-[13px] leading-[1.1] text-blue-600 font-semibold">Avail</TableHead>
                          <TableHead className="w-[65px] py-0 text-[13px] leading-[1.1] text-blue-600 font-semibold">Source</TableHead>
                          <TableHead className="w-[85px] py-0 text-[13px] leading-[1.1] text-blue-600 font-semibold">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(activeFilter === 'unreviewed' ? filteredMatches 
                          : activeFilter === 'skipped' ? [...filteredSkippedMatches].sort((a, b) => new Date(b.load_emails?.received_at || 0).getTime() - new Date(a.load_emails?.received_at || 0).getTime())
                          : activeFilter === 'mybids' ? [...filteredBidMatches].sort((a, b) => new Date(b.load_emails?.received_at || 0).getTime() - new Date(a.load_emails?.received_at || 0).getTime())
                          : activeFilter === 'undecided' ? undecidedMatches
                          : activeFilter === 'waitlist' ? [...waitlistMatches].sort((a, b) => new Date(b.load_emails?.received_at || 0).getTime() - new Date(a.load_emails?.received_at || 0).getTime())
                          : activeFilter === 'missed' ? filteredMissedHistory : filteredEmails)
                          .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                          .map((item) => {
                          // For unreviewed, item is from view with email data included
                          // For skipped/mybids/undecided/waitlist, item is a match that needs email lookup
                          // For missed, item is from missedHistory with email data
                          // For others, item is an email
                          const viewingMatches = activeFilter === 'unreviewed' || activeFilter === 'skipped' || activeFilter === 'mybids' || activeFilter === 'missed' || activeFilter === 'undecided' || activeFilter === 'waitlist';
                          
                          // Get email data - from view (unreviewed) or lookup (skipped/mybids/undecided/waitlist) or missedHistory (missed) or item itself (other)
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
                          } else if (activeFilter === 'skipped' || activeFilter === 'mybids' || activeFilter === 'undecided' || activeFilter === 'waitlist') {
                            // Skipped/bid/undecided/waitlist matches now include email data from the join
                            const matchItem = item as any;
                            email = matchItem.load_emails || loadEmails.find(e => e.id === matchItem.load_email_id);
                          } else if (activeFilter === 'missed') {
                            // Missed history item has enriched email data
                            const missedItem = item as any;
                            email = missedItem.email || {
                              id: missedItem.load_email_id,
                              received_at: missedItem.received_at,
                              from_email: missedItem.from_email,
                              subject: missedItem.subject,
                              parsed_data: missedItem.email?.parsed_data || {},
                              load_id: missedItem.email?.load_id,
                            };
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
                          // Use created_at (when WE processed the email) for time display
                          const processedDate = new Date(email.created_at);
                          const receivedDate = new Date(email.received_at);
                          const now = new Date();
                          
                          // Calculate time since we processed the email (for NEW badge)
                          const diffMs = now.getTime() - processedDate.getTime();
                          const diffMins = Math.floor(diffMs / 60000);
                          const isNewlyProcessed = diffMins <= 2;
                          
                          // Calculate time since email was RECEIVED (for display)
                          const receivedDiffMs = now.getTime() - receivedDate.getTime();
                          const receivedDiffMins = Math.floor(receivedDiffMs / 60000);
                          const receivedDiffHours = Math.floor(receivedDiffMins / 60);
                          const receivedDiffDays = Math.floor(receivedDiffHours / 24);
                          
                          // Format relative time for received (e.g., "15m ago", "2h 30m ago")
                          let receivedAgo = '';
                          if (receivedDiffDays > 0) receivedAgo = `${receivedDiffDays}d ${receivedDiffHours % 24}h ago`;
                          else if (receivedDiffHours > 0) receivedAgo = `${receivedDiffHours}h ${receivedDiffMins % 60}m ago`;
                          else receivedAgo = `${receivedDiffMins}m ago`;
                          
                          // Format exact date/time for tooltip
                          const formatDateTime = (date: Date) => {
                            return date.toLocaleString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                              hour12: true
                            });
                          };
                          
                          const exactReceived = formatDateTime(receivedDate);

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
                              className={`h-10 cursor-pointer hover:bg-accent transition-colors ${isNewlyProcessed ? 'bg-green-50 dark:bg-green-950/30 animate-pulse' : ''}`}
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
                                        load_email_id: match.load_email_id,
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
                              {/* Expand/collapse placeholder cell */}
                              <TableCell className="py-1 px-1 w-[30px]" />
                              {showIdColumns && (
                                <>
                                  {/* Order Number from Sylectus */}
                                  <TableCell className="py-1">
                                    <div className="text-[13px] font-semibold leading-tight whitespace-nowrap">
                                      {data.order_number ? `#${data.order_number}` : '—'}
                                    </div>
                                  </TableCell>
                                  {/* Our internal Load ID */}
                                  <TableCell className="py-1">
                                    <div className="text-[13px] font-mono leading-tight whitespace-nowrap">
                                      {email.load_id || '—'}
                                    </div>
                                  </TableCell>
                                  {/* Load Hunt Match ID - hidden on ALL filter */}
                                  {activeFilter !== 'all' && (
                                    <TableCell className="py-1">
                                      <div className="text-[12px] font-mono text-muted-foreground leading-tight whitespace-nowrap">
                                        {activeFilter === 'unreviewed' && match ? (match as any).id.substring(0, 8) : '—'}
                                      </div>
                                    </TableCell>
                                  )}
                                </>
                              )}
                              {activeFilter !== 'all' && (
                              <TableCell className="py-1">
                                {(() => {
                                  // Get broker info from parsed data
                                  const brokerName = data.broker || data.customer || email.from_name || email.from_email.split('@')[0];
                                  
                                  if ((activeFilter === 'unreviewed' || activeFilter === 'missed' || activeFilter === 'skipped' || activeFilter === 'mybids' || activeFilter === 'undecided' || activeFilter === 'waitlist') && match) {
                                    // For match-based tabs (unreviewed/missed/skipped/mybids), show the matched truck directly
                                    const vehicle = vehicles.find(v => v.id === (match as any).vehicle_id);
                                    if (vehicle) {
                                      const driverName = getDriverName(vehicle.driver_1_id) || "No Driver Assigned";
                                      const carrierName = vehicle.carrier ? (carriersMap[vehicle.carrier] || "No Carrier") : "No Carrier";
                                      return (
                                        <div>
                                          <div className="text-[13px] font-medium leading-tight whitespace-nowrap">
                                            {vehicle.vehicle_number || "N/A"} - {driverName}
                                          </div>
                                          <div className="text-[12px] text-muted-foreground truncate leading-tight whitespace-nowrap">
                                            {carrierName}
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
                                            <div className="text-[13px] font-medium leading-tight whitespace-nowrap">
                                              {vehicle.vehicle_number || "N/A"} - {driverName}
                                            </div>
                                            <div className="text-[12px] text-muted-foreground truncate leading-tight whitespace-nowrap">
                                              {carrierName}
                                            </div>
                                          </div>
                                        );
                                      }
                                    }
                                  }
                                  
                                  // Show Available if no match, with broker info
                                  return (
                                    <div>
                                      <div className="text-[13px] font-medium leading-tight whitespace-nowrap">Available</div>
                                      <div className="text-[12px] text-muted-foreground truncate leading-tight whitespace-nowrap">
                                        Broker: {brokerName}
                                      </div>
                                    </div>
                                  );
                                })()}
                              </TableCell>
                              )}
                              <TableCell className="py-1">
                                <div className="flex items-center gap-1 whitespace-nowrap">
                                  <Badge variant="outline" className="h-4 px-1 text-[11px] flex-shrink-0">
                                    {email.status === 'new' ? '🟡' : '🟢'}
                                  </Badge>
                                  <div className="text-[13px] font-medium leading-tight whitespace-nowrap">
                                    {(() => {
                                      const customerName = data.customer || email.from_name || 'Unknown';
                                      return customerName.length > 22 ? customerName.slice(0, 22) + '...' : customerName;
                                    })()}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="py-1">
                                <div className="flex items-center gap-1">
                                  <span className="text-[13px] leading-tight whitespace-nowrap font-medium" title={exactReceived}>{receivedAgo}</span>
                                  {isNewlyProcessed && (
                                    <Badge variant="default" className="h-4 px-1 text-[10px] bg-green-500 hover:bg-green-500">NEW</Badge>
                                  )}
                                </div>
                                <div className="text-[11px] text-muted-foreground leading-tight whitespace-nowrap">
                                  {email.expires_at ? new Date(email.expires_at).toLocaleString('en-US', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}
                                </div>
                              </TableCell>
                              <TableCell className="py-1">
                                <div className="text-[13px] leading-tight whitespace-nowrap">
                                  {pickupDisplay}
                                </div>
                                <div className="text-[13px] leading-tight whitespace-nowrap">
                                  {deliveryDisplay}
                                </div>
                              </TableCell>
                              <TableCell className="py-1">
                                <div className="text-[13px] font-medium leading-tight whitespace-nowrap">
                                  {data.origin_city || '—'}, {data.origin_state || '—'}
                                </div>
                                <div className="text-[13px] leading-tight whitespace-nowrap">
                                  {data.destination_city || '—'}, {data.destination_state || '—'}
                                </div>
                              </TableCell>
                              <TableCell className="py-1">
                                <div className="text-[13px] leading-tight whitespace-nowrap">
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
                                <div className="text-[13px] leading-tight whitespace-nowrap">
                                  {data.loaded_miles ? `${data.loaded_miles} mi` : '—'}
                                </div>
                              </TableCell>
                              <TableCell className="py-1">
                                <div className="text-[13px] leading-tight whitespace-nowrap">{data.vehicle_type || '—'}</div>
                                <div className="text-[13px] leading-tight whitespace-nowrap">{data.weight ? `${data.weight} lbs` : '—'}</div>
                              </TableCell>
                              <TableCell className="py-1">
                                <div className="text-[13px] leading-tight whitespace-nowrap">{data?.pieces ?? '—'}</div>
                                <div className="text-[12px] text-muted-foreground leading-tight whitespace-nowrap">{data?.dimensions ?? 'Not Specified'}</div>
                              </TableCell>
                              <TableCell className="py-1">
                                <div className="text-[13px] leading-tight whitespace-nowrap">{data.avail_ft ? `${data.avail_ft} ft` : '—'}</div>
                              </TableCell>
                              <TableCell className="py-1">
                                <Badge variant="secondary" className="text-[12px] h-4 px-1.5">
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
                                        handleSkipEmail(email.id, match?.id);
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
                                      if (activeFilter === 'unreviewed' && match) {
                                        handleWaitlistMatch((match as any).id);
                                      } else {
                                        handleMoveToWaitlist(email.id, match?.id);
                                      }
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
                          const totalItems = activeFilter === 'unreviewed' ? filteredMatches.length 
                            : activeFilter === 'skipped' ? skippedMatches.length
                            : activeFilter === 'mybids' ? bidMatches.length
                            : activeFilter === 'undecided' ? undecidedMatches.length
                            : activeFilter === 'waitlist' ? waitlistMatches.length
                            : activeFilter === 'missed' ? missedHistory.length
                            : filteredEmails.length;
                          return totalItems === 0 ? '0 - 0 of 0' : `${Math.min((currentPage - 1) * itemsPerPage + 1, totalItems)} - ${Math.min(currentPage * itemsPerPage, totalItems)} of ${totalItems}`;
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
                          const totalItems = activeFilter === 'unreviewed' ? filteredMatches.length 
                            : activeFilter === 'skipped' ? skippedMatches.length
                            : activeFilter === 'mybids' ? bidMatches.length
                            : activeFilter === 'undecided' ? undecidedMatches.length
                            : activeFilter === 'waitlist' ? waitlistMatches.length
                            : activeFilter === 'missed' ? missedHistory.length
                            : filteredEmails.length;
                          setCurrentPage(Math.min(Math.ceil(totalItems / itemsPerPage), currentPage + 1));
                        }}
                        disabled={(() => {
                          const totalItems = activeFilter === 'unreviewed' ? filteredMatches.length 
                            : activeFilter === 'skipped' ? skippedMatches.length
                            : activeFilter === 'mybids' ? bidMatches.length
                            : activeFilter === 'undecided' ? undecidedMatches.length
                            : activeFilter === 'waitlist' ? waitlistMatches.length
                            : activeFilter === 'missed' ? missedHistory.length
                            : filteredEmails.length;
                          return currentPage >= Math.ceil(totalItems / itemsPerPage);
                        })()}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => {
                          const totalItems = activeFilter === 'unreviewed' ? filteredMatches.length 
                            : activeFilter === 'skipped' ? skippedMatches.length
                            : activeFilter === 'mybids' ? bidMatches.length
                            : activeFilter === 'undecided' ? undecidedMatches.length
                            : activeFilter === 'waitlist' ? waitlistMatches.length
                            : activeFilter === 'missed' ? missedHistory.length
                            : filteredEmails.length;
                          setCurrentPage(Math.ceil(totalItems / itemsPerPage));
                        }}
                        disabled={(() => {
                          const totalItems = activeFilter === 'unreviewed' ? filteredMatches.length 
                            : activeFilter === 'skipped' ? skippedMatches.length
                            : activeFilter === 'mybids' ? bidMatches.length
                            : activeFilter === 'undecided' ? undecidedMatches.length
                            : activeFilter === 'waitlist' ? waitlistMatches.length
                            : activeFilter === 'missed' ? missedHistory.length
                            : filteredEmails.length;
                          return currentPage >= Math.ceil(totalItems / itemsPerPage);
                        })()}
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
          console.log('🎯 Selected vehicle from dialog:', { vehicleId, matchId });
          
          // Find the match from multipleMatches
          const selectedMatch = multipleMatches.find(m => m.id === matchId);
          console.log('🎯 Found match:', selectedMatch);
          
          if (selectedMatch) {
            // The match should already have load_email_id - find the email
            const loadEmailId = selectedMatch.load_email_id;
            const email = loadEmails.find(e => e.id === loadEmailId);
            
            console.log('🎯 Looking for email with id:', loadEmailId);
            console.log('🎯 Found email:', email);
            
            if (email) {
              setSelectedEmailForDetail(email);
              setSelectedMatchForDetail(selectedMatch);
              setSelectedEmailDistance(selectedMatch.distance_miles);
              setShowMultipleMatchesDialog(false);
            } else {
              // Email might not be in loadEmails - fetch it directly
              console.log('🎯 Email not in loadEmails, fetching...');
              supabase
                .from('load_emails')
                .select('*')
                .eq('id', loadEmailId)
                .maybeSingle()
                .then(({ data: fetchedEmail, error }) => {
                  if (error) {
                    console.error('Failed to fetch email:', error);
                    toast.error('Failed to load email details');
                    return;
                  }
                  if (fetchedEmail) {
                    setSelectedEmailForDetail(fetchedEmail);
                    setSelectedMatchForDetail(selectedMatch);
                    setSelectedEmailDistance(selectedMatch.distance_miles);
                    setShowMultipleMatchesDialog(false);
                  }
                });
            }
          } else {
            console.error('Match not found in multipleMatches');
            toast.error('Failed to find selected match');
          }
        }}
      />
      
      {/* User Activity Tracker */}
      <UserActivityTracker />
    </div>
  );
}
