import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantFilter } from "@/hooks/useTenantFilter";
import { TenantDebugBadge } from "@/components/TenantDebugBadge";
import LoadEmailDetail from "@/components/LoadEmailDetail";
import { prefetchMapboxToken } from "@/components/LoadRouteMap";
import { MultipleMatchesDialog } from "@/components/MultipleMatchesDialog";
import { VehicleAssignmentView } from "@/components/VehicleAssignmentView";
import { DispatcherMetricsView } from "@/components/DispatcherMetricsView";
import { UserActivityTracker } from "@/components/UserActivityTracker";
import LoadHunterMobile from "@/components/LoadHunterMobile";
import { BookLoadDialog } from "@/components/BookLoadDialog";
import { SoundSettingsDialog } from "@/components/SoundSettingsDialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { RefreshCw, Settings, X, CheckCircle, MapPin, Wrench, ArrowLeft, Gauge, Truck, MapPinned, Volume2, VolumeX, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, MoreVertical, Target, Plus, Minus, Menu } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import oilChangeIcon from '@/assets/oil-change-icon.png';
import checkEngineIcon from '@/assets/check-engine-icon.png';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// Extracted types and hooks for code splitting
import type { Vehicle, Driver, HuntPlan, Load } from "@/types/loadHunter";
import { loadSoundSettings, getSoundPrompt } from "@/hooks/useLoadHunterSound";
import { useLoadHunterDispatcher } from "@/hooks/useLoadHunterDispatcher";
import { useLoadHunterRealtime } from "@/hooks/useLoadHunterRealtime";
import { useLoadHunterData } from "@/hooks/useLoadHunterData";
import { 
  normalizeDate, 
  normalizeTime, 
  formatTimeAgo, 
  formatExpiresIn,
  buildPickupDisplay,
  buildDeliveryDisplay,
  stripHtmlTags,
  truncateText,
  groupMatchesByLoadEmail
} from "@/utils/loadHunterHelpers";
import type { SoundSettings } from "@/hooks/useUserPreferences";

export default function LoadHunterTab() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { tenantId, shouldFilter } = useTenantFilter();
  
  // ===== DISPATCHER HOOK - replaces inline state + effects =====
  const {
    currentDispatcherId,
    currentDispatcherInfo,
    currentDispatcherIdRef,
    myVehicleIds,
    setMyVehicleIds,
    showAllTabEnabled,
    refreshMyVehicleIds,
  } = useLoadHunterDispatcher({ tenantId, shouldFilter });
  
  // Session start for time window filter
  const [sessionStart] = useState(() => new Date().toISOString());
  const [emailTimeWindow, setEmailTimeWindow] = useState<'30m' | '6h' | '24h' | 'session'>('30m');
  
  // ===== DATA HOOK - replaces inline state + data loading functions =====
  const {
    vehicles,
    setVehicles,
    drivers,
    loadEmails,
    setLoadEmails,
    failedQueueItems,
    huntPlans,
    setHuntPlans,
    allDispatchers,
    carriersMap,
    payeesMap,
    canonicalVehicleTypes,
    vehicleTypeMappings,
    loadMatches,
    setLoadMatches,
    skippedMatches,
    setSkippedMatches,
    bidMatches,
    setBidMatches,
    bookedMatches,
    setBookedMatches,
    undecidedMatches,
    setUndecidedMatches,
    waitlistMatches,
    setWaitlistMatches,
    expiredMatches,
    setExpiredMatches,
    unreviewedViewData,
    setUnreviewedViewData,
    missedHistory,
    setMissedHistory,
    mapboxToken,
    loading,
    refreshing,
    setRefreshing,
    // Loaders
    loadVehicles,
    loadDrivers,
    loadLoadEmails,
    loadHuntPlans,
    loadHuntMatches,
    loadUnreviewedMatches,
    loadMissedHistory,
    loadCarriersAndPayees,
    loadCanonicalVehicleTypes,
    loadAllDispatchers,
    fetchMapboxToken,
    clearAllState,
    loadAllData,
  } = useLoadHunterData({ tenantId, shouldFilter, emailTimeWindow, sessionStart });

  // UI state that stays in the component
  const [loads, setLoads] = useState<Load[]>([]);
  const [bookingMatch, setBookingMatch] = useState<any | null>(null);
  const [bookingEmail, setBookingEmail] = useState<any | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [selectedEmailForDetail, setSelectedEmailForDetail] = useState<any | null>(null);
  const [selectedEmailDistance, setSelectedEmailDistance] = useState<number | undefined>(undefined);
  const [selectedMatchForDetail, setSelectedMatchForDetail] = useState<any | null>(null);
  const [matchActionTaken, setMatchActionTaken] = useState(false);
  const matchActionTakenRef = useRef(false);
  const [createHuntOpen, setCreateHuntOpen] = useState(false);
  const [editingHunt, setEditingHunt] = useState<HuntPlan | null>(null);
  const [editHuntOpen, setEditHuntOpen] = useState(false);
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
  const [soundSettings, setSoundSettings] = useState<SoundSettings>(loadSoundSettings());
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [activeMode, setActiveMode] = useState<'admin' | 'dispatch'>('dispatch');
  const [activeFilter, setActiveFilter] = useState<string>('unreviewed');
  const [filterVehicleId, setFilterVehicleId] = useState<string | null>(null);
  const [showIdColumns, setShowIdColumns] = useState(false);
  const [showMultipleMatchesDialog, setShowMultipleMatchesDialog] = useState(false);
  const [multipleMatches, setMultipleMatches] = useState<any[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [matchSearchQuery, setMatchSearchQuery] = useState('');
  const [archivedSearchResults, setArchivedSearchResults] = useState<any[]>([]);
  const [isSearchingArchive, setIsSearchingArchive] = useState(false);
  const [showArchiveResults, setShowArchiveResults] = useState(false);
  const itemsPerPage = 14;
  
  const [selectedSources, setSelectedSources] = useState<string[]>(['sylectus', 'fullcircle']);
  const [loadHunterTheme, setLoadHunterTheme] = useState<'classic' | 'aurora'>('classic');
  const [groupMatchesEnabled, setGroupMatchesEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('loadHunterGroupMatches');
    return saved !== null ? saved === 'true' : true;
  });
  
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
  
  // Helper to get Eastern timezone offset (handles EST vs EDT automatically)
  // Returns the offset in hours (negative, e.g., -5 for EST, -4 for EDT)
  const getEasternTimezoneOffset = (date: Date): number => {
    // Create a formatter that gives us the timezone offset
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      timeZoneName: 'shortOffset',
    });
    
    const parts = formatter.formatToParts(date);
    const tzPart = parts.find(p => p.type === 'timeZoneName')?.value || 'GMT-5';
    
    // Parse offset like "GMT-5" or "GMT-4"
    const match = tzPart.match(/GMT([+-]?\d+)/);
    if (match) {
      return parseInt(match[1], 10);
    }
    
    // Fallback: determine based on date (DST is March to November in US)
    const month = date.getMonth(); // 0-indexed
    // DST typically runs from second Sunday of March to first Sunday of November
    // Simplified: March (2) through October (9) is roughly EDT
    if (month >= 2 && month <= 9) {
      return -4; // EDT
    }
    return -5; // EST
  };
  
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
        tenant_id: string;
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
              tenant_id: tenantId!, // Will be validated by trigger
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

  // VPS WORKERS NOW HANDLE EMAIL QUEUE PROCESSING
  // UI no longer polls process-email-queue - workers claim from email_queue table directly
  // This eliminates Edge Function costs and prevents Gmail API 429 rate limits

  // BACKUP: Periodic re-match every 60 seconds (reduced from 20s for cost savings)
  // Primary matching is handled by gmail-webhook and realtime subscriptions
  // This only catches loads that failed initial matching
  useEffect(() => {
    const readyHunts = huntPlans.filter(h => h.enabled && h.initialMatchDone);
    if (readyHunts.length === 0) return;
    
    console.log('⏰ Starting backup periodic re-match (every 60 seconds)');
    
    const interval = setInterval(() => {
      console.log('⏰ Backup re-match triggered');
      // Force re-matching by updating state (triggers the matching useEffect above)
      setLoadEmails(current => [...current]);
    }, 60 * 1000); // Every 60 seconds (was 20s)
    
    return () => {
      console.log('⏰ Stopping backup periodic re-match');
      clearInterval(interval);
    };
  }, [huntPlans]);

  // REALTIME SUBSCRIPTION: Auto-refresh when new matches arrive
  // CRITICAL: Must be tenant-scoped to prevent cross-tenant triggers
  // This subscription is DISABLED when no tenantId - duplicate with the tenant-scoped one at line ~1327
  // Keeping for sound alerts only - actual data refresh is handled by tenant-scoped subscriptions

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
  // For "All" tab, combine processed emails AND failed queue items
  const allEmailsAndFailed = activeFilter === 'all' 
    ? [
        ...loadEmails.map(e => ({ ...e, _source: 'processed' as const })),
        ...failedQueueItems.map(q => ({
          id: q.id,
          email_id: q.gmail_message_id,
          subject: q.subject || '[Processing Failed]',
          from_email: q.from_email,
          from_name: q.from_name,
          received_at: q.queued_at,
          created_at: q.queued_at,
          parsed_data: {},
          status: 'failed',
          has_issues: true,
          issue_notes: q.last_error,
          _source: 'failed' as const,
          _queueItem: q,
        }))
      ].sort((a, b) => new Date(b.received_at || b.created_at).getTime() - new Date(a.received_at || a.created_at).getTime())
    : [];

  const filteredEmails = activeFilter === 'unreviewed' 
    ? [] // Don't use emails for unreviewed - use filteredMatches instead
    : activeFilter === 'all'
    ? allEmailsAndFailed // Show ALL emails for debugging - no exclusions
    : loadEmails.filter(email => {
        // Exclude emails that have active matches - they belong in Unreviewed only
        if (matchedLoadIds.has(email.id)) {
          return false;
        }
        
        // CRITICAL: Skipped and waitlist loads should always be visible
        if (email.status === 'skipped' || email.status === 'waitlist') {
          if (activeFilter === 'skipped') return email.status === 'skipped';
          if (activeFilter === 'waitlist') return email.status === 'waitlist';
          return false;
        }
        
        // Missed tab now uses missedHistory, not loadEmails
        if (activeFilter === 'missed') {
          return false; // Return empty - we use missedHistory data directly
        }
        if (activeFilter === 'issues') {
          return email.has_issues === true;
        }
        return true;
      });

  // Debug: Log filtered emails count for all filter
  if (activeFilter === 'all') {
    console.log(`📧 All filter: ${filteredEmails.length} emails (${loadEmails.length} processed + ${failedQueueItems.length} failed)`);
  }

  // DISPATCH MODE: In "My Trucks" mode, only show matches for assigned vehicles
  // If no vehicles assigned, show nothing (0 counts) - user needs to be assigned trucks first
  
  // Get filtered matches for unreviewed - USE SERVER-SIDE VIEW DATA for scalability
  const filteredMatchesRaw = activeFilter === 'unreviewed'
    ? unreviewedViewData
        .filter(match => {
          // Filter by specific vehicle if filterVehicleId is set (badge click)
          if (filterVehicleId && match.vehicle_id !== filterVehicleId) return false;
          // Filter by dispatcher's vehicles when in MY TRUCKS mode
          if (activeMode === 'dispatch') {
            if (!myVehicleIds.includes(match.vehicle_id)) return false;
          }
          // Filter by email source - if no sources selected, show nothing
          if (selectedSources.length === 0) return false;
          // Infer source from email_source field or from_email (same logic as table rendering)
          const rawEmailSource = match.email_source || 'sylectus';
          const fromEmail = (match.from_email || '').toLowerCase();
          const emailSource = fromEmail.includes('fullcircletms.com') || fromEmail.includes('fctms.com')
            ? 'fullcircle'
            : rawEmailSource;
          if (!selectedSources.includes(emailSource)) return false;
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

  // GROUP MATCHES BY LOAD EMAIL: Consolidate multiple vehicle matches into single rows
  // - Admin mode (Option B): Show all matches, prioritize user's vehicles for display
  // - Dispatch mode (Option A): Only count/show user's matches (already filtered above)
  // - Toggle: groupMatchesEnabled controls whether grouping is active
  const groupMatchesByLoad = (matches: any[]): any[] => {
    if (matches.length === 0) return [];
    
    // If grouping is disabled, return matches as-is (each match = own row)
    if (!groupMatchesEnabled) {
      return matches
        .map(match => ({
          ...match,
          _allMatches: [match],
          _matchCount: 1,
          _isGrouped: false,
        }))
        .sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime());
    }
    
    const grouped = new Map<string, any[]>();
    matches.forEach(match => {
      const key = match.load_email_id;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(match);
    });
    
    // Convert grouped map to array of "primary" matches with count metadata
    const result: any[] = [];
    grouped.forEach((matchesForLoad, loadEmailId) => {
      // Sort matches: prioritize user's vehicles first, then by distance
      const sortedMatches = [...matchesForLoad].sort((a, b) => {
        const aIsMyVehicle = myVehicleIds.includes(a.vehicle_id) ? 0 : 1;
        const bIsMyVehicle = myVehicleIds.includes(b.vehicle_id) ? 0 : 1;
        if (aIsMyVehicle !== bIsMyVehicle) return aIsMyVehicle - bIsMyVehicle;
        return (a.distance_miles || 999) - (b.distance_miles || 999);
      });
      
      // Primary match is the first (user's vehicle or closest)
      const primaryMatch = sortedMatches[0];
      result.push({
        ...primaryMatch,
        _allMatches: sortedMatches, // Store all matches for popup
        _matchCount: sortedMatches.length, // Count for badge
        _isGrouped: sortedMatches.length > 1, // Flag for UI
      });
    });
    
    // Sort grouped results by received_at
    return result.sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime());
  };
  
  // Apply grouping to filtered matches
  const filteredMatches = groupMatchesByLoad(filteredMatchesRaw);

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
  const filteredExpiredMatches = filterVehicleId 
    ? expiredMatches.filter(m => m.vehicle_id === filterVehicleId)
    : expiredMatches;
  
  // Debug logging for filtered results
  if (activeFilter === 'unreviewed') {
    console.log(`📊 filteredMatches: ${filteredMatches.length} grouped (from ${filteredMatchesRaw.length} raw, mode: ${activeMode}, myVehicles: ${myVehicleIds.length})`);
  }

  // Count uses raw filtered data (not grouped) for accuracy - shows actual match count
  // In dispatch mode, only count matches for assigned vehicles (show 0 if none assigned)
  const unreviewedCount = filteredMatches.length; // Use grouped count for badge
  
  // Filter helper for dispatch mode - only show matches for assigned vehicles
  const filterByAssignedVehicles = <T extends { vehicle_id?: string | null }>(items: T[]) => {
    if (activeMode === 'dispatch') {
      return items.filter(item => item.vehicle_id && myVehicleIds.includes(item.vehicle_id));
    }
    return items;
  };

  const missedCount = filterByAssignedVehicles(missedHistory).length;
  const waitlistCount = filterByAssignedVehicles(waitlistMatches).length;
  const skippedCount = filterByAssignedVehicles(skippedMatches).length;
  const bidCount = filterByAssignedVehicles(bidMatches).length;
  const bookedCount = filterByAssignedVehicles(bookedMatches).length;
  const undecidedCount = filterByAssignedVehicles(undecidedMatches).length;
  const expiredCount = filterByAssignedVehicles(expiredMatches).length;
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

  // Cache for generated sound effects
  const soundCacheRef = useRef<Map<string, string>>(new Map());
  const isGeneratingSoundRef = useRef<Record<string, boolean>>({});
  // ElevenLabs free tier is blocked - disable AI sounds permanently
  const aiSoundsUnavailableRef = useRef(true);
  const aiSoundsUnavailableToastShownRef = useRef(false);

  const ensureSoundRefs = () => {
    if (!(soundCacheRef.current instanceof Map)) {
      (soundCacheRef as any).current = new Map<string, string>();
    }
    if (!isGeneratingSoundRef.current || typeof isGeneratingSoundRef.current !== "object") {
      (isGeneratingSoundRef as any).current = {};
    }
  };

  // Generic function to play a sound by type (load_receive or bid_sent)
  const playSound = async (soundType: 'load_receive' | 'bid_sent', force = false) => {
    console.log(`🔔 playSound called for ${soundType}, isSoundMuted:`, isSoundMuted, 'force:', force);

    if (isSoundMuted && !force) {
      console.log('❌ Sound is muted, skipping');
      return;
    }

    ensureSoundRefs();

    // If the provider is blocked (e.g. 401 unusual activity), stop calling it for this session.
    if (aiSoundsUnavailableRef.current) {
      playFallbackSound();
      return;
    }

    const currentSettings = loadSoundSettings();
    const soundId = soundType === 'load_receive' ? currentSettings.loadReceiveSound : currentSettings.bidSentSound;
    const volume = currentSettings.volume / 100;
    const cacheKey = soundId;

    // Check if we have a cached sound
    const cachedAudioUrl = soundCacheRef.current.get(cacheKey);

    if (cachedAudioUrl) {
      try {
        const audio = new Audio(cachedAudioUrl);
        audio.volume = volume;
        await audio.play();
        console.log(`✅ Played cached AI sound: ${soundId}`);
        return;
      } catch (error) {
        console.error('Error playing cached sound:', error);
      }
    }

    // Generate new sound if not cached and not already generating
    if (!isGeneratingSoundRef.current[soundId]) {
      isGeneratingSoundRef.current[soundId] = true;

      try {
        const prompt = getSoundPrompt(soundId);
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-sfx`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify({
              prompt,
              duration: 1,
            }),
          }
        );

        if (!response.ok) {
          const errorText = await response.text().catch(() => "");

          const providerBlocked =
            response.status === 401 ||
            response.status === 403 ||
            (response.status === 500 &&
              (errorText.includes('ElevenLabs API error: 401') ||
                errorText.includes('detected_unusual_activity')));

          if (providerBlocked) {
            aiSoundsUnavailableRef.current = true;
            if (!aiSoundsUnavailableToastShownRef.current) {
              aiSoundsUnavailableToastShownRef.current = true;
              toast.error('AI sound provider blocked — using fallback sounds.');
            }
          }

          throw new Error(`SFX request failed: ${response.status} ${errorText}`);
        }

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);

        // Cache the generated sound
        soundCacheRef.current.set(cacheKey, audioUrl);

        // Play the sound
        const audio = new Audio(audioUrl);
        audio.volume = volume;
        await audio.play();
        console.log(`✅ AI sound generated and played: ${soundId}`);
      } catch (error) {
        console.error('Error generating AI sound, using fallback:', error);
        playFallbackSound();
      } finally {
        // Defensive: avoid ref corruption causing a blank screen
        ensureSoundRefs();
        isGeneratingSoundRef.current[soundId] = false;
      }
    } else {
      // If already generating, use fallback
      playFallbackSound();
    }
  };

  // Wrapper for backward compatibility
  const playAlertSound = async (force = false) => {
    await playSound('load_receive', force);
  };

  // Play bid sent sound
  const playBidSentSound = async () => {
    await playSound('bid_sent', false);
  };

  // Fallback sound using Web Audio API
  const playFallbackSound = () => {
    try {
      let ctx = audioContext;
      if (!ctx) {
        ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        setAudioContext(ctx);
      }
      
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.frequency.setValueAtTime(800, ctx.currentTime);
      oscillator.frequency.setValueAtTime(600, ctx.currentTime + 0.1);
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.4);
      
      console.log('✅ Fallback sound played');
    } catch (error) {
      console.error('❌ Error playing fallback sound:', error);
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

  // Dispatcher logic (refreshMyVehicleIds, dispatcher info) is now handled by useLoadHunterDispatcher hook
  // Keep refs updated for real-time subscription callbacks
  refreshMyVehicleIdsRef.current = refreshMyVehicleIds;
  
  // Combined refresh for vehicle data (used by VehicleAssignmentView)
  const refreshVehicleData = async () => {
    await loadVehicles();
    await refreshMyVehicleIds();
  };

  // ===== REALTIME HOOK - replaces inline channel setup =====
  // Callback handlers for realtime events
  const handleRealtimeEmailInsert = useCallback((payload: any) => {
    setLoadEmails((current) => [payload.new, ...current]);
    setCurrentPage(1);
  }, []);

  const handleRealtimeHuntPlanChange = useCallback(() => {
    loadHuntPlans();
  }, []);

  const handleRealtimeMatchChange = useCallback((payload: any) => {
    const record = (payload.new || payload.old) as any;
    // PERFORMANCE: Skip reload for skip/bid actions - already handled optimistically
    if (payload.eventType === 'UPDATE' && record?.match_status === 'skipped') {
      console.log(`[Realtime] Skipped match update (already handled optimistically)`);
      return;
    }
    loadHuntMatches();
    loadUnreviewedMatches();
  }, []);

  const handleRealtimeVehicleChange = useCallback(() => {
    loadVehiclesRef.current?.();
    refreshMyVehicleIdsRef.current?.();
  }, []);

  // Realtime subscriptions via extracted hook
  const { cleanupChannels } = useLoadHunterRealtime({
    tenantId,
    onEmailInsert: handleRealtimeEmailInsert,
    onHuntPlanChange: handleRealtimeHuntPlanChange,
    onMatchChange: handleRealtimeMatchChange,
    onVehicleChange: handleRealtimeVehicleChange,
    playAlertSound,
    showSystemNotification,
    isTabHidden: isTabHiddenRef.current,
    isSoundMuted,
  });

  // CRITICAL: Reset all state when tenant changes BEFORE loading new data
  // This prevents stale cross-tenant data from appearing
  useEffect(() => {
    // STRICT tenantReady guard - tenant filtering is ALWAYS ON now
    const tenantReady = !!tenantId;
    
    console.log('🔄 Tenant effect triggered:', { tenantId, tenantReady, shouldFilter });
    
    // Always clear state first on any tenant change (including null)
    // Hook's clearAllState handles data state; clear UI state here
    clearAllState();
    setMatchedLoadIds(new Set());
    setLoadHuntMap(new Map());
    setLoadDistances(new Map());
    setSelectedVehicle(null);
    setSelectedEmailForDetail(null);
    setSelectedMatchForDetail(null);
    
    // CRITICAL: If tenant not ready, DO NOT run loaders
    if (!tenantReady) {
      console.log('[LoadHunter] ⚠️ tenantReady=false, skipping all loaders');
      return;
    }
    
    console.log(`[LoadHunter] ✅ tenantReady=true (${tenantId}), running loaders...`);
    
    // Only run loaders when tenant is ready - use hook's combined loader
    loadAllData();
  }, [tenantId, shouldFilter, clearAllState, loadAllData]);

  // DISABLED: Sound notifications - not supposed to notify
  // Sound and system notifications have been disabled per user request

  // Reload emails when time window changes - handled by tenant change effect which calls loadLoadEmails
  // The emailTimeWindow is in the useCallback deps, so the function updates when it changes
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

  // fetchMapboxToken is now provided by useLoadHunterData hook

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

  // All data loading functions are now provided by useLoadHunterData hook
  // Keep refs updated for real-time subscription callbacks
  loadVehiclesRef.current = loadVehicles;

  // Reload emails when time window changes
  useEffect(() => {
    console.log('⏰ Time window changed to:', emailTimeWindow);
    loadLoadEmails();
  }, [emailTimeWindow, loadLoadEmails]);

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

  // Mark matches as expired when their load's actual expiration time has passed
  // Call server-side expiration function to avoid client timezone issues
  // The server uses proper UTC comparison for consistent expiration across all clients
  const deactivateStaleMatches = async () => {
    try {
      console.log('🔄 Calling server-side expire-stale-matches function...');
      
      // Call the edge function with tenant filter for efficiency
      const params: Record<string, string> = {};
      if (tenantId) {
        params.tenant_id = tenantId;
      }
      
      const queryString = new URLSearchParams(params).toString();
      const { data, error } = await supabase.functions.invoke('expire-stale-matches', {
        body: {},
      });

      if (error) {
        console.error('Error calling expire-stale-matches:', error);
        return;
      }

      if (data?.expired > 0) {
        console.log(`✅ Server expired ${data.expired} matches (checked ${data.checked})`);
        
        // Reload matches to reflect changes
        await loadUnreviewedMatches();
        await loadHuntMatches();
      } else {
        console.log(`✅ No matches expired (checked ${data?.checked || 0})`);
      }
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
        action_details: actionDetails || null,
        tenant_id: tenantId!
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

  const handleSkipMatch = (matchId: string) => {
    setMatchActionTaken(true); // Mark that action was taken
    
    // Optimistic update - immediately remove from unreviewed UI for instant feedback
    setUnreviewedViewData(prev => prev.filter(m => m.match_id !== matchId));
    setLoadMatches(prev => prev.filter(m => m.id !== matchId));
    
    // Fire-and-forget: run DB operations in background - no reload needed
    Promise.all([
      trackDispatcherAction(matchId, 'skipped'),
      supabase
        .from('load_hunt_matches')
        .update({ match_status: 'skipped', is_active: false })
        .eq('id', matchId)
    ]).then(([, { error }]) => {
      if (error) {
        console.error('Error skipping match:', error);
        toast.error('Failed to skip match');
        // Only refetch on error to restore correct state
        loadHuntMatches();
        loadUnreviewedMatches();
      }
      // Success: no reload - optimistic update already handled it
    }).catch(err => {
      console.error('Error skipping match:', err);
      toast.error('Failed to skip match');
      loadHuntMatches();
      loadUnreviewedMatches();
    });
  };

  // Handle bid placed - move match to MY BIDS and skip all sibling matches
  const handleBidPlaced = async (matchId: string, loadEmailId: string, bidRate?: number) => {
    try {
      setMatchActionTaken(true); // Mark that action was taken
      matchActionTakenRef.current = true; // Prevent onClose from marking as undecided
      console.log('💰 Bid placed for match:', matchId, 'load:', loadEmailId, 'rate:', bidRate);
      
      // 1. Set this match to 'bid' status with bid details
      const { error: bidError } = await supabase
        .from('load_hunt_matches')
        .update({ 
          match_status: 'bid', 
          is_active: false,
          bid_rate: bidRate || null,
          bid_by: currentDispatcherId || null,
          bid_at: new Date().toISOString()
        })
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
      
      // Navigate back to unreviewed tab
      setActiveFilter('unreviewed');
      
      toast.success('Bid placed - moved to My Bids');
      playBidSentSound();
    } catch (error) {
      console.error('Error placing bid:', error);
      toast.error('Failed to update match status');
    }
  };

  // Handle booking complete - refresh matches after load is created
  const handleBookingComplete = async (matchId: string, loadId: string) => {
    console.log('📦 Load booked:', matchId, 'created load:', loadId);
    await loadHuntMatches();
    setBookingMatch(null);
    setBookingEmail(null);
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

  const handleSkipEmail = (emailId: string, matchId?: string) => {
    // Optimistic update - immediately remove from UI
    setLoadEmails(prev => prev.filter(e => e.id !== emailId));
    setUnreviewedViewData(prev => prev.filter(m => (m as any).load_email_id !== emailId));
    // Also remove from loadMatches to prevent reappearing in other views
    setLoadMatches(prev => prev.filter(m => m.load_email_id !== emailId));
    
    // Fire-and-forget: run DB operations in background - no reload on success
    (async () => {
      try {
        // Track the skip action if we have a match ID (fire-and-forget)
        if (matchId) {
          trackDispatcherAction(matchId, 'skipped');
        }
        
        // Update email status AND all related matches in parallel
        const [emailResult, matchesResult] = await Promise.all([
          supabase
            .from('load_emails')
            .update({ 
              status: 'skipped',
              marked_missed_at: null
            })
            .eq('id', emailId),
          // Also mark all matches for this email as skipped/inactive
          // This ensures they don't reappear in unreviewed_matches view on refresh
          supabase
            .from('load_hunt_matches')
            .update({ 
              match_status: 'skipped',
              is_active: false
            })
            .eq('load_email_id', emailId)
        ]);

        if (emailResult.error) {
          console.error('Error skipping email:', emailResult.error);
          toast.error('Failed to skip email');
          // Only refetch on error to restore correct state
          loadLoadEmails();
          loadUnreviewedMatches();
        }
        if (matchesResult.error) {
          console.error('Error skipping matches:', matchesResult.error);
        }
        // Success: no reload - optimistic update already handled it
      } catch (error) {
        console.error('Error skipping email:', error);
        toast.error('Failed to skip email');
        loadLoadEmails();
        loadUnreviewedMatches();
      }
    })();
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
          tenant_id: tenantId,
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
            tenant_id: string;
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
                tenant_id: tenantId!,
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
      // Soft delete: Disable the hunt plan and delete all matches
      // This avoids foreign key constraints with missed_loads_history
      
      // First, delete all matches associated with this hunt plan
      const { error: matchesError } = await supabase
        .from("load_hunt_matches")
        .delete()
        .eq("hunt_plan_id", id);

      if (matchesError) {
        console.error("Error deleting hunt matches:", matchesError);
      }

      // Mark the hunt plan as disabled and add [DELETED] prefix to name
      const { error } = await supabase
        .from("hunt_plans")
        .update({ 
          enabled: false,
          plan_name: `[DELETED] ${new Date().toISOString().split('T')[0]}`
        })
        .eq("id", id);

      if (error) throw error;
      
      // Remove from local state immediately (soft delete - hide from UI)
      setHuntPlans(prev => prev.filter(p => p.id !== id));
      
      // Reload matches to reflect the deletion
      await loadHuntMatches();
      toast.success("Hunt plan deactivated and matches cleared");
    } catch (error) {
      console.error("Error deactivating hunt plan:", error);
      toast.error("Failed to deactivate hunt plan");
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
              tenant_id: string;
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
                  tenant_id: tenantId!,
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
          undecidedMatches={undecidedMatches}
          waitlistMatches={waitlistMatches}
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
    <div className={`flex flex-col flex-1 min-h-0 ${
      loadHunterTheme === 'aurora' ? 'bg-gradient-to-b from-slate-900 via-purple-950/30 to-slate-900' : ''
    }`}>
      {/* Filter Bar - Full Width - Always Visible */}
      <div className={`flex items-center gap-2 py-2 px-2 border-y overflow-x-auto flex-shrink-0 relative z-10 ${
        loadHunterTheme === 'aurora'
          ? 'bg-gradient-to-r from-slate-900/95 via-purple-900/50 to-slate-900/95 border-purple-500/30 backdrop-blur-md shadow-[0_4px_20px_-5px_rgba(168,85,247,0.3)]'
          : 'bg-background'
      }`}>
          
          {/* Mode Buttons - Merged Toggle */}
          <div className={`flex items-center overflow-hidden rounded-full flex-shrink-0 ${
            loadHunterTheme === 'aurora'
              ? 'border border-purple-400/40 shadow-[0_0_15px_-5px_rgba(168,85,247,0.5)]'
              : 'border border-primary/30'
          }`}>
            <Button 
              variant="ghost"
              size="sm" 
              className={`h-7 px-3.5 text-xs font-semibold !rounded-none !rounded-l-full border-0 ${
                loadHunterTheme === 'aurora'
                  ? activeMode === 'admin'
                    ? 'bg-gradient-to-b from-violet-500 to-purple-600 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.3)]'
                    : 'bg-slate-800/60 text-purple-200 hover:bg-slate-700/60'
                  : activeMode === 'admin' 
                    ? 'btn-glossy-primary text-white' 
                    : 'btn-glossy text-gray-700'
              }`}
              onClick={() => setActiveMode('admin')}
            >
              Admin
            </Button>
            
            <Button 
              variant="ghost"
              size="sm" 
              className={`h-7 px-3.5 text-xs font-medium !rounded-none !rounded-r-full border-0 ${
                loadHunterTheme === 'aurora'
                  ? activeMode === 'dispatch'
                    ? 'bg-gradient-to-b from-violet-500 to-purple-600 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.3)]'
                    : 'bg-slate-800/60 text-purple-200 hover:bg-slate-700/60'
                  : activeMode === 'dispatch' 
                    ? 'btn-glossy-primary text-white' 
                    : 'btn-glossy text-gray-700'
              }`}
              onClick={() => {
                setActiveMode('dispatch');
                // If on "All" tab, switch to "unreviewed" since "All" is only available in Admin mode
                if (activeFilter === 'all') {
                  setActiveFilter('unreviewed');
                }
              }}
            >
              MY TRUCKS
            </Button>
          </div>
          
          <div className="flex-shrink-0">
            <Button 
              size="sm" 
              className={`h-7 px-3.5 text-xs font-medium rounded-full border-0 ${
                loadHunterTheme === 'aurora'
                  ? 'bg-gradient-to-b from-emerald-400 to-emerald-600 text-white shadow-[0_0_15px_-3px_rgba(52,211,153,0.5),inset_0_1px_1px_rgba(255,255,255,0.3)] hover:from-emerald-300 hover:to-emerald-500'
                  : 'btn-glossy-success text-white'
              }`}
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
              className={`h-7 w-36 text-xs rounded-full px-3.5 ${
                loadHunterTheme === 'aurora'
                  ? 'bg-slate-800/60 border-purple-500/30 text-purple-100 placeholder:text-purple-300/50 focus:border-purple-400/60 focus:ring-purple-500/20'
                  : 'input-inset'
              }`}
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
          <div className={`flex items-center gap-1 flex-shrink-0 ${
            loadHunterTheme === 'aurora' ? 'text-purple-100' : ''
          }`}>
            {/* Merged button group: All, Unreviewed, Sound */}
            <div className={`flex items-center overflow-hidden rounded-full ${
              loadHunterTheme === 'aurora' ? 'border border-purple-400/30 shadow-[0_0_10px_-3px_rgba(168,85,247,0.4)]' : ''
            }`}>
              {/* All tab only visible in Admin mode when showAllTabEnabled */}
              {showAllTabEnabled && activeMode === 'admin' && (
                <Button 
                  variant="ghost"
                  size="sm" 
                  className={`h-7 px-3 text-xs font-medium gap-1 !rounded-none !rounded-l-full border-0 ${
                    loadHunterTheme === 'aurora'
                      ? activeFilter === 'all'
                        ? 'bg-gradient-to-b from-slate-600 to-slate-800 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)]'
                        : 'bg-slate-800/40 text-purple-200/70 hover:bg-slate-700/40'
                      : activeFilter === 'all' 
                        ? 'btn-glossy-dark text-white' 
                        : 'btn-glossy text-gray-700'
                  }`}
                  onClick={() => {
                    setActiveFilter('all');
                    setFilterVehicleId(null);
                    setSelectedVehicle(null);
                    setSelectedEmailForDetail(null);
                  }}
                >
                  All
                  <span className={`badge-inset text-[10px] h-5 ${activeFilter === 'all' ? 'opacity-80' : ''}`}>{loadEmails.length + failedQueueItems.length}</span>
                </Button>
              )}
              
              <Button
                variant="ghost"
                size="sm" 
                className={`h-7 px-3 text-xs font-medium gap-1 !rounded-none border-0 ${
                  !(showAllTabEnabled && activeMode === 'admin') ? '!rounded-l-full' : ''
                } ${
                  loadHunterTheme === 'aurora'
                    ? activeFilter === 'unreviewed'
                      ? 'bg-gradient-to-b from-violet-500 to-purple-600 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.3)]'
                      : 'bg-slate-800/40 text-purple-200/70 hover:bg-slate-700/40'
                    : activeFilter === 'unreviewed' 
                      ? 'btn-glossy-primary text-white' 
                      : 'btn-glossy text-gray-700'
                }`}
                onClick={() => {
                  setActiveFilter('unreviewed');
                  setFilterVehicleId(null);
                  setSelectedVehicle(null);
                  setSelectedEmailForDetail(null);
                }}
              >
                Unreviewed
                <span className={`text-[10px] h-5 ${
                  loadHunterTheme === 'aurora'
                    ? 'bg-rose-500/80 text-white px-1.5 rounded-full'
                    : 'badge-inset-danger-bright'
                }`}>{unreviewedCount}</span>
              </Button>
              
              <Button 
                variant="ghost"
                size="sm" 
                className={`h-7 w-7 p-0 !rounded-none border-0 ${
                  loadHunterTheme === 'aurora'
                    ? 'bg-slate-800/40 text-purple-200/70 hover:bg-slate-700/40'
                    : 'btn-glossy text-gray-700'
                }`}
                onClick={toggleSound}
                title={isSoundMuted ? "Sound alerts off" : "Sound alerts on"}
              >
                {isSoundMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
              </Button>
              
              <SoundSettingsDialog 
                onSettingsChange={setSoundSettings}
                trigger={
                  <Button 
                    variant="ghost"
                    size="sm" 
                    className={`h-7 w-7 p-0 !rounded-none !rounded-r-full border-0 ${
                      loadHunterTheme === 'aurora'
                        ? 'bg-slate-800/40 text-purple-200/70 hover:bg-slate-700/40'
                        : 'btn-glossy text-gray-700'
                    }`}
                    title="Sound settings"
                  >
                    <Settings className="h-3.5 w-3.5" />
                  </Button>
                }
              />
            </div>
            
            <Button
              variant="ghost"
              size="sm" 
              className={`h-7 px-3 text-xs font-medium gap-1 rounded-full border-0 ${
                loadHunterTheme === 'aurora'
                  ? activeFilter === 'missed'
                    ? 'bg-gradient-to-b from-rose-500 to-rose-700 text-white shadow-[0_0_12px_-3px_rgba(244,63,94,0.6),inset_0_1px_1px_rgba(255,255,255,0.2)]'
                    : 'bg-slate-800/40 border border-purple-400/20 text-purple-200/70 hover:bg-slate-700/40'
                  : activeFilter === 'missed' 
                    ? 'btn-glossy-danger text-white' 
                    : 'btn-glossy text-gray-700'
              }`}
              onClick={() => {
                setActiveFilter('missed');
                setFilterVehicleId(null);
                setSelectedVehicle(null);
                setSelectedEmailForDetail(null);
              }}
            >
              Missed
              <span className={`text-[10px] h-5 ${
                loadHunterTheme === 'aurora'
                  ? 'bg-rose-600/60 text-white px-1.5 rounded-full'
                  : 'badge-inset-danger'
              }`}>{missedCount}</span>
            </Button>
            
            {/* Merged button group: Wait, Undec, Skip */}
            <div className={`flex items-center overflow-hidden rounded-full ${
              loadHunterTheme === 'aurora' ? 'border border-purple-400/30 shadow-[0_0_10px_-3px_rgba(168,85,247,0.4)]' : ''
            }`}>
              <Button 
                variant="ghost"
                size="sm" 
                className={`h-7 px-3 text-xs font-medium gap-1 !rounded-none !rounded-l-full border-0 ${
                  loadHunterTheme === 'aurora'
                    ? activeFilter === 'waitlist'
                      ? 'bg-gradient-to-b from-amber-400 to-amber-600 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.3)]'
                      : 'bg-slate-800/40 text-purple-200/70 hover:bg-slate-700/40'
                    : activeFilter === 'waitlist' 
                      ? 'btn-glossy-warning text-white' 
                      : 'btn-glossy text-gray-700'
                }`}
                onClick={() => {
                  setActiveFilter('waitlist');
                  setFilterVehicleId(null);
                  setSelectedVehicle(null);
                  setSelectedEmailForDetail(null);
                }}
              >
                Wait
                <span className={`text-[10px] h-5 ${
                  loadHunterTheme === 'aurora'
                    ? 'bg-amber-500/60 text-white px-1.5 rounded-full'
                    : 'badge-inset-warning'
                }`}>{waitlistCount}</span>
              </Button>
              
              <Button 
                variant="ghost"
                size="sm" 
                className={`h-7 px-3 text-xs font-medium gap-1 !rounded-none border-0 ${
                  loadHunterTheme === 'aurora'
                    ? activeFilter === 'undecided'
                      ? 'bg-gradient-to-b from-amber-400 to-amber-600 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.3)]'
                      : 'bg-slate-800/40 text-purple-200/70 hover:bg-slate-700/40'
                    : activeFilter === 'undecided' 
                      ? 'btn-glossy-warning text-white' 
                      : 'btn-glossy text-gray-700'
                }`}
                onClick={() => {
                  setActiveFilter('undecided');
                  setFilterVehicleId(null);
                  setSelectedVehicle(null);
                  setSelectedEmailForDetail(null);
                }}
              >
                Undec
                <span className={`text-[10px] h-5 ${
                  loadHunterTheme === 'aurora'
                    ? 'bg-amber-500/60 text-white px-1.5 rounded-full'
                    : 'badge-inset-warning'
                }`}>{undecidedCount}</span>
              </Button>
              
              <Button 
                variant="ghost"
                size="sm" 
                className={`h-7 px-3 text-xs font-medium gap-1 !rounded-none !rounded-r-full border-0 ${
                  loadHunterTheme === 'aurora'
                    ? activeFilter === 'skipped'
                      ? 'bg-gradient-to-b from-slate-500 to-slate-700 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)]'
                      : 'bg-slate-800/40 text-purple-200/70 hover:bg-slate-700/40'
                    : activeFilter === 'skipped' 
                      ? 'btn-glossy-dark text-white' 
                      : 'btn-glossy text-gray-700'
                }`}
                onClick={() => {
                  setActiveFilter('skipped');
                  setFilterVehicleId(null);
                  setSelectedVehicle(null);
                  setSelectedEmailForDetail(null);
                }}
              >
                Skip
                <span className={`text-[10px] h-5 ${
                  loadHunterTheme === 'aurora'
                    ? 'bg-slate-600/60 text-white px-1.5 rounded-full'
                    : 'badge-inset'
                }`}>{skippedCount}</span>
              </Button>
            </div>
            
            {/* Merged button group: Bids, Booked */}
            <div className={`flex items-center overflow-hidden rounded-full ${
              loadHunterTheme === 'aurora' ? 'border border-purple-400/30 shadow-[0_0_10px_-3px_rgba(168,85,247,0.4)]' : ''
            }`}>
              <Button 
                variant="ghost"
                size="sm" 
                className={`h-7 px-3 text-xs font-medium gap-1 !rounded-none !rounded-l-full border-0 ${
                  loadHunterTheme === 'aurora'
                    ? activeFilter === 'mybids'
                      ? 'bg-gradient-to-b from-cyan-400 to-cyan-600 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.3)]'
                      : 'bg-slate-800/40 text-purple-200/70 hover:bg-slate-700/40'
                    : activeFilter === 'mybids' 
                      ? 'btn-glossy-primary text-white' 
                      : 'btn-glossy text-gray-700'
                }`}
                onClick={() => {
                  setActiveFilter('mybids');
                  setFilterVehicleId(null);
                  setSelectedVehicle(null);
                  setSelectedEmailForDetail(null);
                }}
              >
                Bids
                <span className={`text-[10px] h-5 ${
                  loadHunterTheme === 'aurora'
                    ? 'bg-cyan-500/60 text-white px-1.5 rounded-full'
                    : 'badge-inset-primary'
                }`}>{bidCount}</span>
              </Button>
              
              <Button
                variant="ghost"
                size="sm" 
                className={`h-7 px-3 text-xs font-medium gap-1 !rounded-none !rounded-r-full border-0 ${
                  loadHunterTheme === 'aurora'
                    ? activeFilter === 'booked'
                      ? 'bg-gradient-to-b from-emerald-400 to-emerald-600 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.3)]'
                      : 'bg-slate-800/40 text-purple-200/70 hover:bg-slate-700/40'
                    : activeFilter === 'booked' 
                      ? 'btn-glossy-success text-white' 
                      : 'btn-glossy text-gray-700'
                }`}
                onClick={() => {
                  setActiveFilter('booked');
                  setSelectedVehicle(null);
                  setSelectedEmailForDetail(null);
                }}
              >
                Booked
                <span className={`text-[10px] h-5 ${
                  loadHunterTheme === 'aurora'
                    ? 'bg-emerald-500/60 text-white px-1.5 rounded-full'
                    : 'badge-inset-success'
                }`}>{bookedCount}</span>
              </Button>
            </div>
            
            {issuesCount > 0 && (
              <Button
                size="sm" 
                className={`h-7 px-3 text-xs font-medium gap-1 rounded-full border-0 ${
                  loadHunterTheme === 'aurora'
                    ? activeFilter === 'issues'
                      ? 'bg-gradient-to-b from-amber-400 to-amber-600 text-white shadow-[0_0_12px_-3px_rgba(251,191,36,0.6)]'
                      : 'bg-slate-800/40 border border-amber-400/30 text-amber-400 hover:bg-slate-700/40'
                    : activeFilter === 'issues' 
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
                <span className={`text-[10px] h-5 ${
                  loadHunterTheme === 'aurora'
                    ? 'bg-amber-500/60 text-white px-1.5 rounded-full'
                    : 'badge-inset-warning'
                }`}>{issuesCount}</span>
              </Button>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1 ml-auto flex-shrink-0">
            {/* Metrics Button */}
            <Button
              variant="ghost"
              size="sm" 
              className={`h-7 px-3 text-xs font-medium rounded-full border-0 ${
                loadHunterTheme === 'aurora'
                  ? activeFilter === 'dispatcher-metrix'
                    ? 'bg-gradient-to-b from-fuchsia-500 to-purple-600 text-white shadow-[0_0_15px_-3px_rgba(217,70,239,0.6),inset_0_1px_1px_rgba(255,255,255,0.3)]'
                    : 'bg-slate-800/40 border border-fuchsia-400/30 text-fuchsia-300 hover:bg-slate-700/40'
                  : activeFilter === 'dispatcher-metrix' 
                    ? 'btn-glossy-primary text-white' 
                    : 'btn-glossy text-gray-700'
              }`}
              onClick={() => {
                setActiveFilter('dispatcher-metrix');
                setSelectedVehicle(null);
                setSelectedEmailForDetail(null);
              }}
            >
              Dispatcher Score Card
            </Button>

            {/* Assign Button */}
            <Button
              variant="ghost"
              size="sm"
              className={`h-7 px-3 text-xs font-medium rounded-full border-0 ${
                loadHunterTheme === 'aurora'
                  ? activeFilter === 'vehicle-assignment'
                    ? 'bg-gradient-to-b from-violet-500 to-purple-600 text-white shadow-[0_0_15px_-3px_rgba(139,92,246,0.6),inset_0_1px_1px_rgba(255,255,255,0.3)]'
                    : 'bg-slate-800/40 border border-purple-400/30 text-purple-300 hover:bg-slate-700/40'
                  : activeFilter === 'vehicle-assignment'
                    ? 'btn-glossy-primary text-white'
                    : 'btn-glossy text-gray-700'
              }`}
              onClick={() => {
                setActiveFilter('vehicle-assignment');
                setSelectedVehicle(null);
                setSelectedEmailForDetail(null);
              }}
            >
              Assign
            </Button>

            {/* Source Filter Popover - Special Button */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`h-8 px-4 text-xs font-semibold gap-2 rounded-full border border-white/40 bg-gradient-to-br from-violet-500/90 via-purple-500/90 to-fuchsia-500/90 text-white shadow-[0_4px_20px_-2px_rgba(139,92,246,0.5),inset_0_1px_1px_rgba(255,255,255,0.3)] backdrop-blur-md hover:shadow-[0_6px_28px_-2px_rgba(139,92,246,0.6),inset_0_1px_1px_rgba(255,255,255,0.4)] hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 ${
                    selectedSources.length < 2 ? 'animate-[pulse_1.5s_ease-in-out_infinite]' : ''
                  }`}
                >
                  <svg className={`h-3.5 w-3.5 drop-shadow-sm ${selectedSources.length < 2 ? 'animate-[ping_1.5s_ease-in-out_infinite]' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M22 12h-4l-3 9L9 3l-3 9H2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Source
                  <span className={`flex items-center justify-center min-w-[20px] h-[20px] px-1.5 text-[10px] font-bold rounded-full border shadow-inner transition-colors ${
                    selectedSources.length < 2 
                      ? 'bg-amber-400/90 border-amber-300 text-amber-900' 
                      : 'bg-white/25 backdrop-blur-sm border-white/40'
                  }`}>
                    {selectedSources.length}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-52 p-2" align="start">
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground px-2 py-1">Filter by Source</div>
                  <div 
                    className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${
                      selectedSources.includes('sylectus') ? 'bg-primary/10' : 'hover:bg-muted'
                    }`}
                    onClick={() => {
                      setSelectedSources(prev => 
                        prev.includes('sylectus') 
                          ? prev.filter(s => s !== 'sylectus')
                          : [...prev, 'sylectus']
                      );
                    }}
                  >
                    <Checkbox checked={selectedSources.includes('sylectus')} />
                    <span className="text-sm">Sylectus</span>
                  </div>
                  <div 
                    className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${
                      selectedSources.includes('fullcircle') ? 'bg-primary/10' : 'hover:bg-muted'
                    }`}
                    onClick={() => {
                      setSelectedSources(prev => 
                        prev.includes('fullcircle') 
                          ? prev.filter(s => s !== 'fullcircle')
                          : [...prev, 'fullcircle']
                      );
                    }}
                  >
                    <Checkbox checked={selectedSources.includes('fullcircle')} />
                    <span className="text-sm">Full Circle TMS</span>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            
            {/* More Actions Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`h-7 w-7 p-0 rounded-full border-0 ${
                    loadHunterTheme === 'aurora'
                      ? 'bg-slate-800/60 border border-purple-400/30 text-purple-200 hover:bg-slate-700/60 shadow-[0_0_10px_-3px_rgba(168,85,247,0.4)]'
                      : 'btn-glossy text-gray-700'
                  }`}
                >
                  <Menu className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 bg-background z-50">
                {/* Theme Selection */}
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Theme</div>
                <DropdownMenuItem
                  className={loadHunterTheme === 'classic' ? 'bg-primary/10 text-primary' : ''}
                  onClick={() => setLoadHunterTheme('classic')}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded bg-gradient-to-br from-gray-100 to-gray-200 border border-gray-300" />
                    Classic
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className={loadHunterTheme === 'aurora' ? 'bg-primary/10 text-primary' : ''}
                  onClick={() => setLoadHunterTheme('aurora')}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-500 border border-white/40 shadow-[0_2px_8px_-2px_rgba(139,92,246,0.5)]" />
                    Aurora
                  </div>
                </DropdownMenuItem>
                <div className="h-px bg-border my-1" />
                <DropdownMenuItem
                  className={activeFilter === 'expired' ? 'bg-primary/10 text-primary' : ''}
                  onClick={() => {
                    setActiveFilter('expired');
                    setFilterVehicleId(null);
                    setSelectedVehicle(null);
                    setSelectedEmailForDetail(null);
                  }}
                >
                  Expired ({expiredCount})
                </DropdownMenuItem>
                <div className="h-px bg-border my-1" />
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Display</div>
                <DropdownMenuItem
                  className={groupMatchesEnabled ? 'bg-primary/10 text-primary' : ''}
                  onClick={() => {
                    const newValue = !groupMatchesEnabled;
                    setGroupMatchesEnabled(newValue);
                    localStorage.setItem('loadHunterGroupMatches', String(newValue));
                  }}
                >
                  <div className="flex items-center gap-2">
                    {groupMatchesEnabled ? (
                      <div className="w-4 h-4 rounded-sm bg-primary/20 flex items-center justify-center">
                        <div className="w-2 h-2 rounded-sm bg-primary" />
                      </div>
                    ) : (
                      <div className="w-4 h-4 rounded-sm border border-muted-foreground/40" />
                    )}
                    Group Matches by Load
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

      {/* Main Content Area */}
      <div className={`flex flex-1 gap-2 overflow-y-auto overflow-x-hidden pt-3 ${
        loadHunterTheme === 'aurora' ? 'bg-gradient-to-br from-slate-900 via-purple-950/50 to-slate-900' : ''
      }`}>
        {/* Left Sidebar - Vehicles - Always Visible */}
        <div className={`w-64 flex-shrink-0 space-y-1 overflow-y-auto pr-2 ${
          loadHunterTheme === 'aurora' 
            ? 'border-r border-purple-500/30' 
            : 'border-r'
        }`}>
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
              const enabledHuntPlan = huntPlans.find(plan => plan.vehicleId === vehicle.id && plan.enabled);
              const hasEnabledHunt = !!enabledHuntPlan;
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
                  className={`p-2.5 cursor-pointer rounded-lg relative transition-all duration-200 ${
                    loadHunterTheme === 'aurora'
                      ? selectedVehicle?.id === vehicle.id
                        ? 'bg-gradient-to-b from-purple-900/80 to-violet-900/60 border border-purple-400/60 shadow-lg shadow-purple-500/30'
                        : 'bg-gradient-to-b from-purple-900/40 to-violet-900/30 border border-purple-500/30 hover:border-purple-400/50 hover:shadow-md hover:shadow-purple-500/20'
                      : selectedVehicle?.id === vehicle.id ? 'card-glossy-selected' : 'card-glossy'
                  }`}
                  style={{ 
                    borderLeft: loadHunterTheme === 'aurora'
                      ? hasEnabledHunt ? '4px solid #a855f7' : '4px solid rgba(168,85,247,0.3)'
                      : hasEnabledHunt ? '5px solid #3b82f6' : '5px solid #d1d5db'
                  }}
                  onClick={() => setSelectedVehicle(vehicle)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0 space-y-0.5 pr-16">
                      <div className={`font-medium text-sm leading-tight truncate ${
                        loadHunterTheme === 'aurora' ? 'text-purple-200' : 'text-carved'
                      }`}>
                        {vehicle.vehicle_number || "N/A"} - {getDriverName(vehicle.driver_1_id) || "No Driver Assigned"}
                      </div>
                      <div className={`text-xs leading-tight truncate ${
                        loadHunterTheme === 'aurora' ? 'text-purple-300/70' : 'text-carved-light'
                      }`}>
                        {vehicle.dimensions_length ? `${vehicle.dimensions_length}' ` : ''}{vehicle.asset_subtype || vehicle.asset_type || "Asset Type"}
                        {enabledHuntPlan?.availableFeet && (
                          <span className={`ml-1.5 font-medium ${loadHunterTheme === 'aurora' ? 'text-emerald-400' : 'text-primary'}`}>| Avail: {enabledHuntPlan.availableFeet}'</span>
                        )}
                      </div>
                      <div className={`text-[11px] truncate leading-tight ${
                        loadHunterTheme === 'aurora' ? 'text-purple-400/70' : 'text-carved-light opacity-70'
                      }`}>
                        {vehicle.carrier ? (carriersMap[vehicle.carrier] || "No Carrier") : "No Carrier"}
                      </div>
                    </div>
                    {/* Merged badge pill - glossy 3D button style, flush with edge */}
                    <div className={`absolute -top-px -right-px flex items-center overflow-hidden rounded-bl-lg rounded-tr-lg ${
                      loadHunterTheme === 'aurora' ? 'shadow-[0_2px_8px_-2px_rgba(168,85,247,0.3)]' : ''
                    }`}>
                      {/* GREEN = Unreviewed */}
                      <div 
                        className={`h-6 px-2.5 !rounded-none !border-0 !border-b-0 text-[11px] cursor-pointer transition-all !py-0 flex items-center justify-center ${
                          loadHunterTheme === 'aurora'
                            ? 'bg-gradient-to-b from-emerald-400 to-emerald-600 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.3)] hover:from-emerald-300 hover:to-emerald-500'
                            : 'btn-glossy-success hover:brightness-110'
                        }`}
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
                        className={`h-6 px-2.5 !rounded-none !border-0 !border-b-0 text-[11px] cursor-pointer transition-all !py-0 flex items-center justify-center ${
                          loadHunterTheme === 'aurora'
                            ? 'bg-gradient-to-b from-slate-500 to-slate-700 text-slate-200 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] hover:from-slate-400 hover:to-slate-600'
                            : 'btn-glossy text-gray-600 hover:brightness-95'
                        }`}
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
                      {/* CYAN = My Bids (Aurora) / BLUE = My Bids (Classic) */}
                      <div 
                        className={`h-6 px-2.5 !rounded-none !border-0 !border-b-0 text-[11px] cursor-pointer transition-all !py-0 flex items-center justify-center ${
                          loadHunterTheme === 'aurora'
                            ? 'bg-gradient-to-b from-cyan-400 to-cyan-600 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.3)] hover:from-cyan-300 hover:to-cyan-500'
                            : 'btn-glossy-primary hover:brightness-110'
                        }`}
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
            <div 
              className="w-[420px] flex-shrink-0 space-y-3 overflow-y-auto rounded-lg p-3"
              style={{
                background: 'linear-gradient(180deg, hsl(220 15% 96%) 0%, hsl(220 10% 92%) 50%, hsl(220 10% 88%) 100%)',
                border: '1px solid hsl(220 10% 78%)',
                boxShadow: '0 4px 16px rgba(0,0,0,0.1), inset 0 1px 0 hsl(0 0% 100%), inset 0 -1px 0 hsl(220 10% 85%)'
              }}
            >
              {/* Tabs - Glossy */}
              <Tabs defaultValue="empty" className="w-full">
                <TabsList 
                  className="w-full grid grid-cols-4 h-8 p-0.5 rounded-md"
                  style={{
                    background: 'linear-gradient(180deg, hsl(220 12% 94%) 0%, hsl(220 12% 90%) 100%)',
                    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.08), 0 1px 0 hsl(0 0% 100%)'
                  }}
                >
                  <TabsTrigger 
                    value="empty" 
                    className="text-xs font-semibold rounded data-[state=active]:text-white data-[state=active]:shadow-md"
                    style={{ textShadow: '0 1px 0 white' }}
                  >
                    Empty
                  </TabsTrigger>
                  <TabsTrigger value="delivery" className="text-xs" style={{ textShadow: '0 1px 0 white' }}>
                    Delivery
                  </TabsTrigger>
                  <TabsTrigger value="destination" className="text-xs" style={{ textShadow: '0 1px 0 white' }}>
                    Destination
                  </TabsTrigger>
                  <TabsTrigger value="remaining" className="text-xs" style={{ textShadow: '0 1px 0 white' }}>
                    Remaining
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {/* Vehicle Details Section - Glossy Card */}
              <div 
                className="rounded-lg p-3 space-y-3"
                style={{
                  background: 'linear-gradient(180deg, hsl(0 0% 100%) 0%, hsl(220 15% 99%) 100%)',
                  border: '1px solid hsl(220 15% 85%)',
                  boxShadow: '0 3px 10px rgba(0,0,0,0.08), inset 0 1px 0 hsl(0 0% 100%)'
                }}
              >
                {/* Location & Odometer with Maintenance Box */}
                <div className="flex gap-3">
                  <div className="flex-1 space-y-1">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Location</div>
                    <div className="text-sm font-medium whitespace-normal break-words leading-tight">
                      {selectedVehicle.formatted_address || selectedVehicle.last_location || "N/A"}
                    </div>
                    <div className="flex items-center gap-1.5 text-sm mt-1">
                      <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Odometer</span>
                      <span className="font-bold">
                        {selectedVehicle.odometer ? selectedVehicle.odometer.toLocaleString() : "N/A"}
                      </span>
                    </div>
                  </div>
                  
                  {/* Next Maintenance Due Box - Glossy */}
                  <div 
                    className="rounded-md px-3 py-2 min-w-[160px]"
                    style={{
                      background: 'linear-gradient(180deg, hsl(220 12% 98%) 0%, hsl(220 12% 94%) 100%)',
                      border: '1px solid hsl(220 15% 82%)',
                      boxShadow: 'inset 0 1px 0 hsl(0 0% 100%), 0 2px 4px rgba(0,0,0,0.05)'
                    }}
                  >
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Next Maintenance</div>
                    <div className="flex items-baseline gap-2">
                      <div className={`text-xl font-bold ${
                        selectedVehicle.oil_change_remaining !== null && selectedVehicle.oil_change_remaining < 0 
                          ? "text-destructive" 
                          : "text-foreground"
                      }`}>
                        {selectedVehicle.oil_change_remaining !== null && selectedVehicle.oil_change_remaining !== undefined
                          ? `${selectedVehicle.oil_change_remaining} mi`
                          : "N/A"}
                      </div>
                      {selectedVehicle.next_service_date && (
                        <div className="text-xs text-muted-foreground">
                          {selectedVehicle.next_service_date}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <Button 
                  variant="link" 
                  className="text-xs text-primary p-0 h-auto font-semibold"
                  style={{ textShadow: '0 1px 0 white' }}
                >
                  View vehicle Details
                </Button>

                {/* Driver Assignments - Compact */}
                <div 
                  className="space-y-1 rounded-md p-2"
                  style={{
                    background: 'linear-gradient(180deg, hsl(220 12% 98%) 0%, hsl(220 12% 96%) 100%)',
                    boxShadow: 'inset 0 -1px 0 hsl(220 15% 90%), inset 0 1px 0 hsl(0 0% 100%)'
                  }}
                >
                  <div className="flex items-center text-xs">
                    <span className="font-bold w-6 text-primary">D1</span>
                    <span className="flex-1 font-medium">
                      {getDriverName(selectedVehicle.driver_1_id) || "No Driver Assigned"}
                    </span>
                    <span className="text-muted-foreground text-[10px]">Note: N/A</span>
                  </div>
                  <div className="flex items-center text-xs">
                    <span className="font-bold w-6 text-primary">D2</span>
                    <span className="flex-1 font-medium">
                      {getDriverName(selectedVehicle.driver_2_id) || "No Driver Assigned"}
                    </span>
                    <span className="text-muted-foreground text-[10px]">Note: N/A</span>
                  </div>
                </div>

                {/* Vehicle Note - Compact */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold uppercase tracking-wide">Vehicle Note:</div>
                    <Wrench 
                      className="h-4 w-4 text-primary cursor-pointer hover:text-primary/80" 
                      onClick={() => setEditingNotes(!editingNotes)}
                    />
                  </div>
                  {editingNotes ? (
                    <div className="space-y-1.5">
                      <Textarea
                        value={vehicleNotes}
                        onChange={(e) => setVehicleNotes(e.target.value)}
                        placeholder="Enter vehicle notes..."
                        className="min-h-[60px] text-xs"
                      />
                      <div className="flex gap-1.5">
                        <Button size="sm" className="h-7 text-xs" onClick={handleSaveVehicleNotes}>
                          Save
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="h-7 text-xs"
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
                    <div className={`text-xs min-h-[24px] whitespace-pre-wrap ${selectedVehicle.notes ? "text-destructive font-bold" : "text-muted-foreground"}`}>
                      {selectedVehicle.notes || "No notes available"}
                    </div>
                  )}
                </div>

                {/* Action Buttons - Glossy */}
                <div className="flex gap-2 pt-1">
                  <Button 
                    className="flex-1 h-8 text-xs font-semibold"
                    style={{
                      background: 'linear-gradient(180deg, hsl(221 80% 58%) 0%, hsl(221 80% 50%) 100%)',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.3)'
                    }}
                    onClick={() => setCreateHuntOpen(true)}
                  >
                    Create New Hunt
                  </Button>
                  <Button 
                    variant="outline" 
                    className="flex-1 h-8 text-xs font-medium"
                    style={{
                      background: 'linear-gradient(180deg, hsl(0 0% 100%) 0%, hsl(220 10% 96%) 100%)',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.08), inset 0 1px 0 hsl(0 0% 100%)'
                    }}
                  >
                    Set Driver to Time-Off
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
                    <div className="flex items-center">
                      <div className="flex items-center gap-0">
                        <div className={`h-8 px-3 text-xs font-medium flex items-center rounded-l-full ${plan.enabled ? 'bg-green-500 text-white' : 'bg-gray-400 text-white'}`}>
                          {plan.enabled ? "Active" : "Disabled"}
                        </div>
                        <Button 
                          size="sm" 
                          variant="secondary" 
                          className="h-8 px-3 text-xs rounded-none border-l-0"
                          onClick={() => handleToggleHunt(plan.id, plan.enabled)}
                        >
                          {plan.enabled ? "Disable" : "Enable"}
                        </Button>
                        <Button 
                          size="sm" 
                          variant="secondary" 
                          className="h-8 px-3 text-xs rounded-none border-l-0"
                          onClick={() => handleEditHunt(plan)}
                        >
                          Edit
                        </Button>
                        <Button 
                          size="sm" 
                          variant="destructive" 
                          className="h-8 px-3 text-xs rounded-none rounded-r-full"
                          onClick={() => handleDeleteHuntPlan(plan.id)}
                        >
                          Delete
                        </Button>
                      </div>
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
                  <Button 
                    variant="destructive" 
                    size="sm" 
                    className="w-full"
                    onClick={async () => {
                      if (!confirm(`Clear all matches for this hunt plan? Only NEW loads will match going forward.`)) return;
                      try {
                        // Delete all matches for this hunt plan
                        const { error: deleteError } = await supabase
                          .from('load_hunt_matches')
                          .delete()
                          .eq('hunt_plan_id', plan.id);
                        if (deleteError) throw deleteError;
                        
                        // Get current highest load_id to update cursor
                        const { data: latestLoad } = await supabase
                          .from('load_emails')
                          .select('load_id')
                          .order('created_at', { ascending: false })
                          .limit(1)
                          .single();
                        
                        // Update floor_load_id so only NEW loads match going forward
                        if (latestLoad?.load_id) {
                          const { error: updateError } = await supabase
                            .from('hunt_plans')
                            .update({ floor_load_id: latestLoad.load_id })
                            .eq('id', plan.id);
                          if (updateError) console.error('Error updating floor_load_id:', updateError);
                        }
                        
                        toast.success('All matches cleared - only new loads will match');
                        // Refresh matches
                        const { data: newMatches } = await supabase
                          .from('load_hunt_matches')
                          .select('*')
                          .eq('is_active', true);
                        setLoadMatches(newMatches || []);
                      } catch (err) {
                        console.error('Error clearing matches:', err);
                        toast.error('Failed to clear matches');
                      }
                    }}
                  >
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

      {/* Edit Hunt Dialog - Glossy */}
      <Dialog open={editHuntOpen} onOpenChange={setEditHuntOpen}>
        <DialogContent 
          className="max-w-2xl max-h-[90vh] overflow-y-auto p-0"
          style={{
            background: 'linear-gradient(180deg, hsl(220 15% 96%) 0%, hsl(220 10% 92%) 50%, hsl(220 10% 88%) 100%)',
            border: '1px solid hsl(220 10% 78%)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2), inset 0 1px 0 hsl(0 0% 100%)'
          }}
        >
          <DialogHeader className="px-5 pt-4 pb-2">
            <DialogTitle 
              className="text-lg font-bold"
              style={{ color: 'hsl(221 70% 45%)', textShadow: '0 1px 0 white' }}
            >
              Edit Hunt Plan
            </DialogTitle>
          </DialogHeader>
          
          <div 
            className="mx-4 mb-4 rounded-lg p-4 space-y-3"
            style={{
              background: 'linear-gradient(180deg, hsl(0 0% 100%) 0%, hsl(220 15% 99%) 100%)',
              border: '1px solid hsl(220 15% 85%)',
              boxShadow: '0 3px 10px rgba(0,0,0,0.08), inset 0 1px 0 hsl(0 0% 100%)'
            }}
          >
            {/* Plan Name */}
            <div className="space-y-1">
              <Label htmlFor="edit-planName" className="text-xs font-semibold uppercase tracking-wide">Plan Name</Label>
              <Input 
                id="edit-planName" 
                placeholder="Plan Name" 
                className="h-8 text-sm"
                style={{
                  background: 'linear-gradient(180deg, hsl(0 0% 100%) 0%, hsl(220 10% 98%) 100%)',
                  boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.06), 0 1px 0 hsl(0 0% 100%)'
                }}
                value={huntFormData.planName}
                onChange={(e) => setHuntFormData({...huntFormData, planName: e.target.value})}
              />
            </div>

            {/* Vehicle Types - Multi-select */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold uppercase tracking-wide">
                Vehicle Types <span className="text-destructive">*</span>
              </Label>
              <div 
                className="grid grid-cols-2 gap-1.5 max-h-[140px] overflow-y-auto rounded-md p-2"
                style={{
                  background: 'linear-gradient(180deg, hsl(220 12% 98%) 0%, hsl(220 12% 96%) 100%)',
                  boxShadow: 'inset 0 -1px 0 hsl(220 15% 90%), inset 0 1px 0 hsl(0 0% 100%)'
                }}
              >
                {canonicalVehicleTypes.length > 0 ? canonicalVehicleTypes.map((type) => (
                  <div key={type.value} className="flex items-center space-x-1.5">
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
                    <label htmlFor={`edit-${type.value}`} className="text-xs cursor-pointer">{type.label}</label>
                  </div>
                )) : (
                  <p className="text-xs text-muted-foreground col-span-2">No vehicle types configured.</p>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">{huntFormData.vehicleSizes.length} selected</p>
            </div>

            {/* Zip Code, Available feet, Partial */}
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label htmlFor="edit-zipCode" className="text-xs font-semibold uppercase tracking-wide">
                  Zip Code <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Input 
                    id="edit-zipCode" 
                    placeholder="Zip Code"
                    className="h-8 text-sm pr-8"
                    style={{
                      background: 'linear-gradient(180deg, hsl(0 0% 100%) 0%, hsl(220 10% 98%) 100%)',
                      boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.06), 0 1px 0 hsl(0 0% 100%)'
                    }}
                    value={huntFormData.zipCode}
                    onChange={(e) => setHuntFormData({...huntFormData, zipCode: e.target.value})}
                  />
                  <MapPinned className="absolute right-2 top-2 h-3.5 w-3.5 text-primary" />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-availableFeet" className="text-xs font-semibold uppercase tracking-wide">Available feet</Label>
                <Input 
                  id="edit-availableFeet" 
                  placeholder="Available feet"
                  className="h-8 text-sm"
                  style={{
                    background: 'linear-gradient(180deg, hsl(0 0% 100%) 0%, hsl(220 10% 98%) 100%)',
                    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.06), 0 1px 0 hsl(0 0% 100%)'
                  }}
                  value={huntFormData.availableFeet}
                  onChange={(e) => setHuntFormData({...huntFormData, availableFeet: e.target.value})}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold uppercase tracking-wide">&nbsp;</Label>
                <div className="flex items-center space-x-1.5 h-8">
                  <Checkbox 
                    id="edit-partial"
                    checked={huntFormData.partial}
                    onCheckedChange={(checked) => setHuntFormData({...huntFormData, partial: checked as boolean})}
                  />
                  <label htmlFor="edit-partial" className="text-xs font-medium">Partial</label>
                </div>
              </div>
            </div>

            {/* Pickup Search Radius, Total Mile Limit */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="edit-pickupRadius" className="text-xs font-semibold uppercase tracking-wide">Pickup Search Radius</Label>
                <Input 
                  id="edit-pickupRadius"
                  className="h-8 text-sm"
                  style={{
                    background: 'linear-gradient(180deg, hsl(0 0% 100%) 0%, hsl(220 10% 98%) 100%)',
                    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.06), 0 1px 0 hsl(0 0% 100%)'
                  }}
                  value={huntFormData.pickupRadius}
                  onChange={(e) => setHuntFormData({...huntFormData, pickupRadius: e.target.value})}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-mileLimit" className="text-xs font-semibold uppercase tracking-wide">Total Mile Limit</Label>
                <Input 
                  id="edit-mileLimit" 
                  placeholder="Total Mile Limit"
                  className="h-8 text-sm"
                  style={{
                    background: 'linear-gradient(180deg, hsl(0 0% 100%) 0%, hsl(220 10% 98%) 100%)',
                    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.06), 0 1px 0 hsl(0 0% 100%)'
                  }}
                  value={huntFormData.mileLimit}
                  onChange={(e) => setHuntFormData({...huntFormData, mileLimit: e.target.value})}
                />
              </div>
            </div>

            {/* Available Load Capacity */}
            <div className="space-y-1">
              <Label htmlFor="edit-loadCapacity" className="text-xs font-semibold uppercase tracking-wide">Available Load Capacity</Label>
              <Input 
                id="edit-loadCapacity"
                className="h-8 text-sm"
                style={{
                  background: 'linear-gradient(180deg, hsl(0 0% 100%) 0%, hsl(220 10% 98%) 100%)',
                  boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.06), 0 1px 0 hsl(0 0% 100%)'
                }}
                value={huntFormData.loadCapacity}
                onChange={(e) => setHuntFormData({...huntFormData, loadCapacity: e.target.value})}
              />
            </div>

            {/* Available Date and Time */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="edit-availableDate" className="text-xs font-semibold uppercase tracking-wide">Available Date</Label>
                <Input 
                  id="edit-availableDate" 
                  type="date"
                  className="h-8 text-sm"
                  style={{
                    background: 'linear-gradient(180deg, hsl(0 0% 100%) 0%, hsl(220 10% 98%) 100%)',
                    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.06), 0 1px 0 hsl(0 0% 100%)'
                  }}
                  value={huntFormData.availableDate}
                  onChange={(e) => setHuntFormData({...huntFormData, availableDate: e.target.value})}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-availableTime" className="text-xs font-semibold uppercase tracking-wide">Available Time (ET)</Label>
                <Input 
                  id="edit-availableTime" 
                  type="time"
                  className="h-8 text-sm"
                  style={{
                    background: 'linear-gradient(180deg, hsl(0 0% 100%) 0%, hsl(220 10% 98%) 100%)',
                    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.06), 0 1px 0 hsl(0 0% 100%)'
                  }}
                  value={huntFormData.availableTime}
                  onChange={(e) => setHuntFormData({...huntFormData, availableTime: e.target.value})}
                />
              </div>
            </div>

            {/* Destination Zip Code */}
            <div className="space-y-1">
              <Label htmlFor="edit-destinationZip" className="text-xs font-semibold uppercase tracking-wide">Destination Zip Code</Label>
              <div className="relative">
                <Input 
                  id="edit-destinationZip" 
                  placeholder="Destination Zip Code"
                  className="h-8 text-sm pr-8"
                  style={{
                    background: 'linear-gradient(180deg, hsl(0 0% 100%) 0%, hsl(220 10% 98%) 100%)',
                    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.06), 0 1px 0 hsl(0 0% 100%)'
                  }}
                  value={huntFormData.destinationZip}
                  onChange={(e) => setHuntFormData({...huntFormData, destinationZip: e.target.value})}
                />
                <MapPinned className="absolute right-2 top-2 h-3.5 w-3.5 text-primary" />
              </div>
            </div>

            {/* Destination Search Radius */}
            <div className="space-y-1">
              <Label htmlFor="edit-destinationRadius" className="text-xs font-semibold uppercase tracking-wide">Destination Search Radius</Label>
              <Input 
                id="edit-destinationRadius" 
                placeholder="Destination Search Radius"
                className="h-8 text-sm"
                style={{
                  background: 'linear-gradient(180deg, hsl(0 0% 100%) 0%, hsl(220 10% 98%) 100%)',
                  boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.06), 0 1px 0 hsl(0 0% 100%)'
                }}
                value={huntFormData.destinationRadius}
                onChange={(e) => setHuntFormData({...huntFormData, destinationRadius: e.target.value})}
              />
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <Label htmlFor="edit-notes" className="text-xs font-semibold uppercase tracking-wide">Notes</Label>
              <Textarea 
                id="edit-notes" 
                placeholder="Notes" 
                rows={2} 
                className="resize-none text-sm"
                style={{
                  background: 'linear-gradient(180deg, hsl(0 0% 100%) 0%, hsl(220 10% 98%) 100%)',
                  boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.06), 0 1px 0 hsl(0 0% 100%)'
                }}
                value={huntFormData.notes}
                onChange={(e) => setHuntFormData({...huntFormData, notes: e.target.value})}
              />
            </div>

            {/* Update and Cancel Buttons - Glossy */}
            <div className="flex justify-start gap-2 pt-2">
              <Button 
                className="px-6 h-8 text-xs font-semibold"
                style={{
                  background: 'linear-gradient(180deg, hsl(221 80% 58%) 0%, hsl(221 80% 50%) 100%)',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.3)'
                }}
                onClick={handleUpdateHuntPlan}
              >
                Update
              </Button>
              <Button 
                variant="outline" 
                className="px-6 h-8 text-xs font-medium"
                style={{
                  background: 'linear-gradient(180deg, hsl(0 0% 100%) 0%, hsl(220 10% 96%) 100%)',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.08), inset 0 1px 0 hsl(0 0% 100%)'
                }}
                onClick={() => {
                  setEditHuntOpen(false);
                  setEditingHunt(null);
                }}
              >
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
          <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 flex flex-col card-glossy-table overflow-hidden">
            {/* Vehicle Filter Indicator */}
            {filterVehicleId && (
              <div className="px-3 py-2 bg-gradient-to-r from-blue-50 to-blue-100/50 border-b border-blue-200 flex items-center justify-between flex-shrink-0">
                <span className="text-xs text-blue-700 font-medium">
                  Filtering by: <span className="font-bold">{vehicles.find(v => v.id === filterVehicleId)?.vehicle_number || 'Unknown Truck'}</span>
                </span>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 px-2 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-100"
                  onClick={() => setFilterVehicleId(null)}
                >
                  <X className="h-3 w-3 mr-1" />
                  Clear
                </Button>
              </div>
            )}
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                {(activeFilter === 'unreviewed' ? filteredMatches.length === 0 
                  : activeFilter === 'missed' ? missedHistory.length === 0 
                  : activeFilter === 'skipped' ? skippedMatches.length === 0
                  : activeFilter === 'mybids' ? bidMatches.length === 0
                  : activeFilter === 'booked' ? bookedMatches.length === 0
                  : activeFilter === 'undecided' ? undecidedMatches.length === 0
                  : activeFilter === 'waitlist' ? waitlistMatches.length === 0
                  : activeFilter === 'expired' ? expiredMatches.length === 0
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
                      : activeFilter === 'booked'
                      ? 'No booked loads yet. Book a load from My Bids to see it here.'
                      : activeFilter === 'undecided'
                      ? 'No undecided loads. Loads you viewed but took no action on will appear here.'
                      : activeFilter === 'waitlist'
                      ? 'No waitlisted loads yet. Click Wait on a load to add it here.'
                      : activeFilter === 'expired'
                      ? 'No expired matches yet. Matches that expire without action appear here.'
                      : 'No load emails found yet. Click "Refresh Loads" to start monitoring your inbox.'}
                  </div>
                ) : (
                  <>
                    <div className="flex-1 overflow-auto min-h-0">
                      <Table className={loadHunterTheme === 'aurora' ? '' : 'table-glossy'}>
                      <TableHeader 
                        className={loadHunterTheme === 'aurora' ? 'rounded-t-lg' : ''}
                        style={loadHunterTheme === 'aurora' ? { 
                          background: 'linear-gradient(180deg, #a78bfa 0%, #8b5cf6 40%, #7c3aed 100%)',
                          borderBottom: '3px solid #5b21b6',
                          boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.3), inset 0 -2px 4px rgba(0,0,0,0.15), 0 4px 8px rgba(91,33,182,0.35)',
                          textShadow: 'none'
                        } : undefined}
                      >
                        <TableRow 
                          className={loadHunterTheme === 'aurora' ? 'h-12' : 'h-9'}
                          style={loadHunterTheme === 'aurora' ? { 
                            background: 'transparent', 
                            boxShadow: 'none',
                            textShadow: 'none'
                          } : undefined}
                        >
                          <TableHead className={`w-0 p-0 relative ${loadHunterTheme === 'aurora' ? '!text-white font-medium uppercase !tracking-normal [text-shadow:none]' : 'text-white'}`} style={loadHunterTheme === 'aurora' ? { textShadow: 'none' } : undefined}>
                            <Button
                              variant="ghost"
                              size="sm"
                              className={`absolute left-0 top-1/2 -translate-y-1/2 h-4 w-4 p-0 ${loadHunterTheme === 'aurora' ? 'text-white hover:bg-white/20' : 'text-white hover:bg-white/20'}`}
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
                              <TableHead className={`w-[80px] py-2 text-[12px] leading-[1.1] ${loadHunterTheme === 'aurora' ? '!text-white font-medium uppercase !tracking-normal [text-shadow:none]' : 'text-white font-semibold tracking-wide'}`} style={loadHunterTheme === 'aurora' ? { textShadow: 'none' } : undefined}>Order #</TableHead>
                              <TableHead className={`w-[110px] py-2 text-[12px] leading-[1.1] ${loadHunterTheme === 'aurora' ? '!text-white font-medium uppercase !tracking-normal [text-shadow:none]' : 'text-white font-semibold tracking-wide'}`} style={loadHunterTheme === 'aurora' ? { textShadow: 'none' } : undefined}>Load ID</TableHead>
                              {activeFilter !== 'all' && (
                                <TableHead className={`w-[100px] py-2 text-[12px] leading-[1.1] ${loadHunterTheme === 'aurora' ? '!text-white font-medium uppercase !tracking-normal [text-shadow:none]' : 'text-white font-semibold tracking-wide'}`} style={loadHunterTheme === 'aurora' ? { textShadow: 'none' } : undefined}>Match ID</TableHead>
                              )}
                            </>
                          )}
                          {activeFilter !== 'all' && (
                            <TableHead className={`w-[140px] py-2 text-[12px] leading-[1.1] ${loadHunterTheme === 'aurora' ? '!text-white font-medium uppercase !tracking-normal [text-shadow:none]' : 'text-white font-semibold tracking-wide'}`} style={loadHunterTheme === 'aurora' ? { textShadow: 'none' } : undefined}>Truck - Drivers<br/>Carrier</TableHead>
                          )}
                          <TableHead className={`w-[60px] py-2 text-[12px] leading-[1.1] ${loadHunterTheme === 'aurora' ? '!text-white font-medium uppercase !tracking-normal [text-shadow:none]' : 'text-white font-semibold tracking-wide'}`} style={loadHunterTheme === 'aurora' ? { textShadow: 'none' } : undefined}>Customer</TableHead>
                          {activeFilter !== 'mybids' && activeFilter !== 'booked' && (
                            <TableHead className={`w-[95px] py-2 text-[12px] leading-[1.1] ${loadHunterTheme === 'aurora' ? '!text-white font-medium uppercase !tracking-normal [text-shadow:none]' : 'text-white font-semibold tracking-wide'}`} style={loadHunterTheme === 'aurora' ? { textShadow: 'none' } : undefined}>Received<br/>Expires</TableHead>
                          )}
                          <TableHead className={`w-[115px] py-2 text-[12px] leading-[1.1] ${loadHunterTheme === 'aurora' ? '!text-white font-medium uppercase !tracking-normal [text-shadow:none]' : 'text-white font-semibold tracking-wide'}`} style={loadHunterTheme === 'aurora' ? { textShadow: 'none' } : undefined}>Pickup Time<br/>Deliver Time</TableHead>
                          <TableHead className={`w-[130px] py-2 text-[12px] leading-[1.1] ${loadHunterTheme === 'aurora' ? '!text-white font-medium uppercase !tracking-normal [text-shadow:none]' : 'text-white font-semibold tracking-wide'}`} style={loadHunterTheme === 'aurora' ? { textShadow: 'none' } : undefined}>Origin<br/>Destination</TableHead>
                          <TableHead className={`w-[60px] py-2 text-[12px] leading-[1.1] ${loadHunterTheme === 'aurora' ? '!text-white font-medium uppercase !tracking-normal [text-shadow:none]' : 'text-white font-semibold tracking-wide'}`} style={loadHunterTheme === 'aurora' ? { textShadow: 'none' } : undefined}>Empty<br/>Loaded</TableHead>
                          <TableHead className={`w-[100px] py-2 text-[12px] leading-[1.1] ${loadHunterTheme === 'aurora' ? '!text-white font-medium uppercase !tracking-normal [text-shadow:none]' : 'text-white font-semibold tracking-wide'}`} style={loadHunterTheme === 'aurora' ? { textShadow: 'none' } : undefined}>Vehicle Type<br/>Weight</TableHead>
                          <TableHead className={`w-[70px] py-2 text-[12px] leading-[1.1] ${loadHunterTheme === 'aurora' ? '!text-white font-medium uppercase !tracking-normal [text-shadow:none]' : 'text-white font-semibold tracking-wide'}`} style={loadHunterTheme === 'aurora' ? { textShadow: 'none' } : undefined}>Pieces<br/>Dims</TableHead>
                          <TableHead className={`w-[45px] py-2 text-[12px] leading-[1.1] ${loadHunterTheme === 'aurora' ? '!text-white font-medium uppercase !tracking-normal [text-shadow:none]' : 'text-white font-semibold tracking-wide'}`} style={loadHunterTheme === 'aurora' ? { textShadow: 'none' } : undefined}>Avail<br/>Posted</TableHead>
                          <TableHead className={`w-[65px] py-2 text-[12px] leading-[1.1] ${loadHunterTheme === 'aurora' ? '!text-white font-medium uppercase !tracking-normal [text-shadow:none]' : 'text-white font-semibold tracking-wide'}`} style={loadHunterTheme === 'aurora' ? { textShadow: 'none' } : undefined}>Source</TableHead>
                          {activeFilter !== 'mybids' && activeFilter !== 'booked' && (
                            <TableHead className={`w-[85px] py-2 text-[12px] leading-[1.1] ${loadHunterTheme === 'aurora' ? '!text-white font-medium uppercase !tracking-normal [text-shadow:none]' : 'text-white font-semibold tracking-wide'}`} style={loadHunterTheme === 'aurora' ? { textShadow: 'none' } : undefined}>Actions</TableHead>
                          )}
                          {activeFilter === 'mybids' && (
                            <>
                              <TableHead className={`w-[70px] py-2 text-[12px] leading-[1.1] ${loadHunterTheme === 'aurora' ? '!text-white font-medium uppercase !tracking-normal [text-shadow:none]' : 'text-white font-semibold tracking-wide'}`} style={loadHunterTheme === 'aurora' ? { textShadow: 'none' } : undefined}>Rate</TableHead>
                              <TableHead className={`w-[90px] py-2 text-[12px] leading-[1.1] ${loadHunterTheme === 'aurora' ? '!text-white font-medium uppercase !tracking-normal [text-shadow:none]' : 'text-white font-semibold tracking-wide'}`} style={loadHunterTheme === 'aurora' ? { textShadow: 'none' } : undefined}>Dispatcher</TableHead>
                              <TableHead className={`w-[60px] py-2 text-[12px] leading-[1.1] ${loadHunterTheme === 'aurora' ? '!text-white font-medium uppercase !tracking-normal [text-shadow:none]' : 'text-white font-semibold tracking-wide'}`} style={loadHunterTheme === 'aurora' ? { textShadow: 'none' } : undefined}>Award</TableHead>
                              <TableHead className={`w-[80px] py-2 text-[12px] leading-[1.1] ${loadHunterTheme === 'aurora' ? '!text-white font-medium uppercase !tracking-normal [text-shadow:none]' : 'text-white font-semibold tracking-wide'}`} style={loadHunterTheme === 'aurora' ? { textShadow: 'none' } : undefined}>Bid Time</TableHead>
                            </>
                          )}
                          {activeFilter === 'booked' && (
                            <>
                              <TableHead className={`w-[70px] py-2 text-[12px] leading-[1.1] ${loadHunterTheme === 'aurora' ? '!text-white font-medium uppercase !tracking-normal [text-shadow:none]' : 'text-white font-semibold tracking-wide'}`} style={loadHunterTheme === 'aurora' ? { textShadow: 'none' } : undefined}>Rate</TableHead>
                              <TableHead className={`w-[90px] py-2 text-[12px] leading-[1.1] ${loadHunterTheme === 'aurora' ? '!text-white font-medium uppercase !tracking-normal [text-shadow:none]' : 'text-white font-semibold tracking-wide'}`} style={loadHunterTheme === 'aurora' ? { textShadow: 'none' } : undefined}>Dispatcher</TableHead>
                            </>
                          )}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(activeFilter === 'unreviewed' ? filteredMatches 
                          : activeFilter === 'skipped' ? [...filteredSkippedMatches].sort((a, b) => new Date(b.load_emails?.received_at || 0).getTime() - new Date(a.load_emails?.received_at || 0).getTime())
                          : activeFilter === 'mybids' ? [...filteredBidMatches].sort((a, b) => new Date(b.load_emails?.received_at || 0).getTime() - new Date(a.load_emails?.received_at || 0).getTime())
                          : activeFilter === 'booked' ? [...bookedMatches].sort((a, b) => new Date(b.load_emails?.received_at || 0).getTime() - new Date(a.load_emails?.received_at || 0).getTime())
                          : activeFilter === 'undecided' ? undecidedMatches
                          : activeFilter === 'waitlist' ? [...waitlistMatches].sort((a, b) => new Date(b.load_emails?.received_at || 0).getTime() - new Date(a.load_emails?.received_at || 0).getTime())
                          : activeFilter === 'expired' ? [...filteredExpiredMatches].sort((a, b) => new Date(b.load_emails?.received_at || 0).getTime() - new Date(a.load_emails?.received_at || 0).getTime())
                          : activeFilter === 'missed' ? filteredMissedHistory : filteredEmails)
                          .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                          .map((item, rowIndex) => {
                          // For unreviewed, item is from view with email data included
                          // For skipped/mybids/booked/undecided/waitlist/expired, item is a match that needs email lookup
                          // For missed, item is from missedHistory with email data
                          // For others, item is an email
                          const viewingMatches = activeFilter === 'unreviewed' || activeFilter === 'skipped' || activeFilter === 'mybids' || activeFilter === 'booked' || activeFilter === 'missed' || activeFilter === 'undecided' || activeFilter === 'waitlist' || activeFilter === 'expired';
                          
                          // Get email data - from view (unreviewed) or lookup (skipped/mybids/booked/undecided/waitlist) or missedHistory (missed) or item itself (other)
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
                              email_source: (item as any).email_source,
                              is_update: (item as any).is_update,
                              parent_email_id: (item as any).parent_email_id,
                            };
                          } else if (activeFilter === 'skipped' || activeFilter === 'mybids' || activeFilter === 'booked' || activeFilter === 'undecided' || activeFilter === 'waitlist' || activeFilter === 'expired') {
                            // Skipped/bid/booked/undecided/waitlist/expired matches now include email data from the join
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
                          // Get the hunt plan for this match to access availableFeet
                          const matchHuntPlan = match ? huntPlans.find(hp => hp.id === (item as any).hunt_plan_id) : null;
                          const data = email.parsed_data || {};
                          const isFailed = email._source === 'failed' || email.status === 'failed';
                          // Use created_at (when WE processed the email) for time display
                          const processedDate = new Date(email.created_at);
                          const receivedDate = new Date(email.received_at);
                          const now = new Date();
                          
                          // Calculate time since we processed the email (for NEW badge)
                          const diffMs = now.getTime() - processedDate.getTime();
                          const diffMins = Math.floor(diffMs / 60000);
                          const isNewlyProcessed = diffMins <= 2 && !isFailed;
                          
                          // Calculate time since email was RECEIVED (for display)
                          const receivedDiffMs = now.getTime() - receivedDate.getTime();
                          const receivedDiffSecs = Math.floor(receivedDiffMs / 1000);
                          const receivedDiffMins = Math.floor(receivedDiffSecs / 60);
                          const receivedDiffHours = Math.floor(receivedDiffMins / 60);
                          const receivedDiffDays = Math.floor(receivedDiffHours / 24);
                          
                          // Format relative time for received (e.g., "15m 30s ago", "2h 30m ago")
                          let receivedAgo = '';
                          if (receivedDiffDays > 0) receivedAgo = `${receivedDiffDays}d ${receivedDiffHours % 24}h ago`;
                          else if (receivedDiffHours > 0) receivedAgo = `${receivedDiffHours}h ${receivedDiffMins % 60}m ago`;
                          else receivedAgo = `${receivedDiffMins}m ${receivedDiffSecs % 60}s ago`;
                          
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

                          // Helper to normalize date format from "2025-12-19" or "2025-12-19 08:00 CST" to "12/19/25"
                          const normalizeDate = (dateStr: string | undefined): string => {
                            if (!dateStr) return '';
                            // Match ISO-like format: 2025-12-19 or 2025-12-19 08:00 CST
                            const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
                            if (isoMatch) {
                              const [, year, month, day] = isoMatch;
                              return `${month}/${day}/${year.slice(2)}`;
                            }
                            return dateStr;
                          };

                          // Helper to normalize time format - strip timezone suffix like " CST"
                          const normalizeTime = (timeStr: string | undefined): string => {
                            if (!timeStr) return '';
                            // Remove timezone suffix like " CST", " EST", " PST"
                            return timeStr.replace(/\s+[A-Z]{2,4}$/i, '');
                          };

                          // Build pickup display: show date + time when both available, otherwise show what we have
                          let pickupDisplay = '';
                          const normPickupDate = normalizeDate(data.pickup_date);
                          const normPickupTime = normalizeTime(data.pickup_time);
                          if (normPickupDate && normPickupTime) {
                            pickupDisplay = `${normPickupDate} ${normPickupTime}`;
                          } else if (normPickupDate) {
                            pickupDisplay = normPickupDate;
                          } else if (normPickupTime) {
                            pickupDisplay = normPickupTime;
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
                          const normDeliveryDate = normalizeDate(data.delivery_date);
                          const normDeliveryTime = normalizeTime(data.delivery_time);
                          if (normDeliveryDate && normDeliveryTime) {
                            deliveryDisplay = `${normDeliveryDate} ${normDeliveryTime}`;
                          } else if (normDeliveryDate) {
                            deliveryDisplay = normDeliveryDate;
                          } else if (normDeliveryTime) {
                            deliveryDisplay = normDeliveryTime;
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
                              className={`cursor-pointer transition-all duration-150 ${
                                loadHunterTheme === 'aurora' 
                                  ? 'h-12 border-0 rounded-md my-0.5 mx-1 hover:scale-[1.005] hover:shadow-md' 
                                  : 'h-11 border-b border-border/50'
                              } ${
                                isFailed 
                                  ? 'bg-gradient-to-r from-red-50 to-red-100/50 dark:from-red-950/30 dark:to-red-900/20 hover:from-red-100 hover:to-red-150' 
                                  : isNewlyProcessed 
                                    ? 'bg-gradient-to-r from-green-50 to-green-100/50 dark:from-green-950/30 dark:to-green-900/20' 
                                    : loadHunterTheme === 'aurora'
                                      ? ''
                                      : 'hover:bg-gradient-to-r hover:from-primary/5 hover:to-primary/10 even:bg-muted/30'
                              }`}
                              style={loadHunterTheme === 'aurora' && !isFailed && !isNewlyProcessed ? {
                                background: (rowIndex % 2 === 0) 
                                  ? 'linear-gradient(180deg, #f5f0ff 0%, #ede5ff 100%)'
                                  : 'linear-gradient(180deg, #ebe5fc 0%, #e0d8f5 100%)',
                                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7), inset 0 -1px 0 rgba(139,92,246,0.15), 0 1px 2px rgba(139,92,246,0.1)',
                                borderTop: '1px solid rgba(255,255,255,0.8)',
                                borderBottom: '1px solid rgba(139,92,246,0.2)'
                              } : undefined}
                              onClick={async () => {
                                // Don't open failed items for detail view
                                if (isFailed) {
                                  toast.error(`Processing failed: ${email.issue_notes || 'Unknown error'}`);
                                  return;
                                }
                                
                                // Check if this is a grouped row with multiple matches
                                const isGroupedRow = activeFilter === 'unreviewed' && (item as any)._isGrouped;
                                const allMatchesForRow = (item as any)._allMatches as any[] | undefined;
                                
                                if (isGroupedRow && allMatchesForRow && allMatchesForRow.length > 1) {
                                  // Use pre-grouped matches from the row data
                                  const vehicleIds = allMatchesForRow.map(m => m.vehicle_id);
                                  const { data: vehicleData } = await supabase
                                    .from('vehicles')
                                    .select('*')
                                    .in('id', vehicleIds);
                                  
                                  if (vehicleData) {
                                    const enrichedMatches = allMatchesForRow.map(matchItem => {
                                      const vehicle = vehicleData.find(v => v.id === matchItem.vehicle_id);
                                      return {
                                        id: matchItem.match_id || matchItem.id,
                                        vehicle_id: matchItem.vehicle_id,
                                        load_email_id: matchItem.load_email_id,
                                        vehicle_number: vehicle?.vehicle_number || 'Unknown',
                                        distance_miles: matchItem.distance_miles,
                                        current_location: vehicle?.last_location || vehicle?.formatted_address,
                                        last_updated: vehicle?.updated_at,
                                        status: vehicle?.status,
                                        oil_change_due: vehicle?.oil_change_remaining ? vehicle.oil_change_remaining < 0 : false,
                                      };
                                    });
                                    
                                    setMultipleMatches(enrichedMatches);
                                    setShowMultipleMatchesDialog(true);
                                  }
                                } else {
                                  // Check old way for non-grouped tabs (skipped, mybids, etc.)
                                  const matchesForLoad = loadMatches.filter(m => m.load_email_id === email.id);
                                  
                                  if (matchesForLoad.length > 1) {
                                    // Fetch vehicle details for all matches
                                    const vehicleIds = matchesForLoad.map(m => m.vehicle_id);
                                    const { data: vehicleData } = await supabase
                                      .from('vehicles')
                                      .select('*')
                                      .in('id', vehicleIds);
                                    
                                    if (vehicleData) {
                                      const enrichedMatches = matchesForLoad.map(matchItem => {
                                        const vehicle = vehicleData.find(v => v.id === matchItem.vehicle_id);
                                        return {
                                          id: matchItem.id,
                                          vehicle_id: matchItem.vehicle_id,
                                          load_email_id: matchItem.load_email_id,
                                          vehicle_number: vehicle?.vehicle_number || 'Unknown',
                                          distance_miles: matchItem.distance_miles,
                                          current_location: vehicle?.last_location || vehicle?.formatted_address,
                                          last_updated: vehicle?.updated_at,
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
                                }
                              }}
                            >
                              {/* Expand/collapse placeholder cell - show FAILED badge for failed items */}
                              <TableCell className="p-0 w-0">
                                {isFailed && (
                                  <Badge variant="destructive" className="text-[9px] px-1 py-0 ml-1">
                                    FAILED
                                  </Badge>
                                )}
                              </TableCell>
                              {showIdColumns && (
                                <>
                                  {/* Order Number from Sylectus */}
                                  <TableCell className="py-1">
                                    <div className="text-[13px] font-semibold leading-tight whitespace-nowrap">
                                      {isFailed ? (
                                        <span className="text-red-600" title={email.issue_notes}>
                                          {email.subject?.substring(0, 30) || 'Processing Error'}...
                                        </span>
                                      ) : (
                                        data.order_number ? `#${data.order_number}` : '—'
                                      )}
                                    </div>
                                  </TableCell>
                                  {/* Our internal Load ID */}
                                  <TableCell className="py-1">
                                    <HoverCard openDelay={800} closeDelay={200}>
                                      <HoverCardTrigger asChild>
                                        <div className="text-[13px] font-mono leading-tight whitespace-nowrap cursor-pointer hover:text-primary">
                                          {email.load_id || '—'}
                                        </div>
                                      </HoverCardTrigger>
                                      <HoverCardContent className="w-auto p-2" side="top">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="text-xs gap-2"
                                          onClick={() => navigate(`/dashboard/development?tab=parser-helper&loadId=${email.load_id}`)}
                                        >
                                          <Wrench className="h-3 w-3" />
                                          Open in Parser Helper
                                        </Button>
                                      </HoverCardContent>
                                    </HoverCard>
                                  </TableCell>
                                  {/* Load Hunt Match ID - hidden on ALL filter */}
                                  {activeFilter !== 'all' && (
                                    <TableCell className="py-1">
                                      <div className="text-[12px] font-mono text-muted-foreground leading-tight whitespace-nowrap">
                                        {match ? (match as any).id.substring(0, 8) : '—'}
                                      </div>
                                    </TableCell>
                                  )}
                                </>
                              )}
                              {activeFilter !== 'all' && (
                              <TableCell className="py-1">
                                {(() => {
                                  // Get broker info from parsed data
                                  const brokerName = data.broker || data.broker_company || data.customer || email.from_name || email.from_email.split('@')[0];
                                  
                                  // Check for grouped matches (multiple vehicles matched this load)
                                  const isGroupedRow = activeFilter === 'unreviewed' && (item as any)._isGrouped;
                                  const matchCount = (item as any)._matchCount || 1;
                                  
                                  if ((activeFilter === 'unreviewed' || activeFilter === 'missed' || activeFilter === 'skipped' || activeFilter === 'mybids' || activeFilter === 'booked' || activeFilter === 'undecided' || activeFilter === 'waitlist') && match) {
                                    // For match-based tabs (unreviewed/missed/skipped/mybids), show the matched truck directly
                                    const vehicle = vehicles.find(v => v.id === (match as any).vehicle_id);
                                    if (vehicle) {
                                      const driverName = getDriverName(vehicle.driver_1_id) || "No Driver Assigned";
                                      const carrierName = vehicle.carrier ? (carriersMap[vehicle.carrier] || "No Carrier") : "No Carrier";
                                      return (
                                        <div className="flex items-center gap-1.5">
                                          <div className="flex-1 min-w-0">
                                            <div className="text-[13px] font-medium leading-tight whitespace-nowrap">
                                              {vehicle.vehicle_number || "N/A"} - {driverName}
                                            </div>
                                            <div className="text-[12px] text-muted-foreground truncate leading-tight whitespace-nowrap">
                                              {carrierName}
                                            </div>
                                          </div>
                                          {/* Match count badge for grouped rows */}
                                          {isGroupedRow && matchCount > 1 && (
                                            <Badge 
                                              className="h-5 px-1.5 text-[10px] font-bold bg-gradient-to-b from-blue-500 to-blue-600 text-white border-0 shadow-sm flex items-center gap-0.5 flex-shrink-0"
                                              title={`${matchCount} vehicles matched this load`}
                                            >
                                              <Truck className="h-3 w-3" />
                                              {matchCount}
                                            </Badge>
                                          )}
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
                                      const customerName = data.broker_company || data.broker || data.customer || email.from_name || 'Unknown';
                                      return customerName.length > 14 ? customerName.slice(0, 14) + '...' : customerName;
                                    })()}
                                  </div>
                                </div>
                              </TableCell>
                              {activeFilter !== 'mybids' && activeFilter !== 'booked' && (
                                <TableCell className="py-1">
                                  <div className="flex items-center gap-1">
                                    <span className={`text-[13px] leading-tight whitespace-nowrap font-medium ${receivedDiffMins >= 15 ? 'text-red-500' : receivedDiffMins >= 5 ? 'text-orange-500' : 'text-green-500'}`} title={exactReceived}>{receivedAgo}</span>
                                    {isNewlyProcessed && (
                                      <Badge variant="default" className="h-4 px-1 text-[10px] bg-green-500 hover:bg-green-500 text-black font-semibold">NEW</Badge>
                                    )}
                                    {email.is_update && (
                                      <Badge variant="outline" className="h-4 px-1 text-[10px] border-yellow-500 text-yellow-600 font-semibold" title="This is an updated version of a previously posted load">UPD</Badge>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-muted-foreground leading-tight whitespace-nowrap">
                                    {email.expires_at ? new Date(email.expires_at).toLocaleString('en-US', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}
                                  </div>
                                </TableCell>
                              )}
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
                                      return `${Number((match as any).distance_miles).toFixed(2)} mi`;
                                    }
                                    // Then check loadDistances map
                                    if (loadDistances.has(email.id)) {
                                      return `${Number(loadDistances.get(email.id)).toFixed(2)} mi`;
                                    }
                                    // Finally check parsed data
                                    if (data.empty_miles != null) {
                                      return `${Number(data.empty_miles).toFixed(2)} mi`;
                                    }
                                    return '—';
                                  })()}
                                </div>
                                <div className="text-[13px] leading-tight whitespace-nowrap">
                                  {data.loaded_miles ? `${data.loaded_miles} mi` : '—'}
                                </div>
                              </TableCell>
                              <TableCell className="py-1">
                                {(() => {
                                  const cleanVehicleType = data.vehicle_type?.replace(/<[^>]*>/g, '').trim() || '';
                                  const displayVehicleType = cleanVehicleType.length > 20 ? cleanVehicleType.slice(0, 18) + '…' : cleanVehicleType;
                                  return cleanVehicleType.length > 20 ? (
                                    <HoverCard>
                                      <HoverCardTrigger asChild>
                                        <div className="text-[13px] leading-tight whitespace-nowrap cursor-help">{displayVehicleType || '—'}</div>
                                      </HoverCardTrigger>
                                      <HoverCardContent className="w-auto max-w-xs text-sm">{cleanVehicleType}</HoverCardContent>
                                    </HoverCard>
                                  ) : (
                                    <div className="text-[13px] leading-tight whitespace-nowrap">{displayVehicleType || '—'}</div>
                                  );
                                })()}
                                <div className="text-[13px] leading-tight whitespace-nowrap">{data.weight !== undefined && data.weight !== null ? `${data.weight} lbs` : '—'}</div>
                              </TableCell>
                              <TableCell className="py-1">
                                <div className="text-[13px] leading-tight whitespace-nowrap">{data?.pieces !== undefined && data?.pieces !== null ? data.pieces : '—'}</div>
                                <div className="text-[12px] text-muted-foreground leading-tight whitespace-nowrap">{data?.dimensions ? (data.dimensions.trim().toLowerCase() === 'no dimensions specified' ? 'No Dim Specified' : data.dimensions) : '—'}</div>
                              </TableCell>
                              <TableCell className="py-1">
                                {matchHuntPlan?.availableFeet ? (
                                  <div 
                                    className="inline-flex items-center justify-center text-[12px] font-semibold h-6 px-2 rounded-md text-yellow-900"
                                    style={{
                                      background: 'linear-gradient(180deg, hsl(48 96% 70%) 0%, hsl(45 93% 55%) 100%)',
                                      boxShadow: '0 3px 10px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.5)',
                                      border: '1px solid hsl(45 80% 45%)',
                                      textShadow: '0 1px 0 rgba(255,255,255,0.4)'
                                    }}
                                  >
                                    {matchHuntPlan.availableFeet}'
                                  </div>
                                ) : (
                                  <div className="text-[13px] leading-tight whitespace-nowrap text-muted-foreground">—</div>
                                )}
                                <div className="text-[12px] font-medium leading-tight whitespace-nowrap text-green-600 mt-0.5">
                                  {data.rate ? `$${Number(data.rate).toLocaleString()}` : '—'}
                                </div>
                              </TableCell>
                              <TableCell className="py-1">
                                {(() => {
                                  // Get source from email_source field (from view or email data)
                                  const rawEmailSource = (item as any).email_source || email.email_source || 'sylectus';
                                  const inferredSource = (email.from_email || '').toLowerCase().includes('fullcircletms.com') || (email.from_email || '').toLowerCase().includes('fctms.com')
                                    ? 'fullcircle'
                                    : rawEmailSource;
                                  const emailSource = inferredSource;

                                  const sourceConfig: Record<string, { label: string; gradient: string; shadow: string }> = {
                                    sylectus: { 
                                      label: 'Sylectus', 
                                      gradient: 'bg-gradient-to-br from-blue-400/90 via-blue-500/90 to-indigo-500/90',
                                      shadow: 'shadow-[0_3px_12px_-2px_rgba(59,130,246,0.5),inset_0_1px_1px_rgba(255,255,255,0.3)]'
                                    },
                                    fullcircle: { 
                                      label: 'FullCircle', 
                                      gradient: 'bg-gradient-to-br from-purple-400/90 via-purple-500/90 to-fuchsia-500/90',
                                      shadow: 'shadow-[0_3px_12px_-2px_rgba(168,85,247,0.5),inset_0_1px_1px_rgba(255,255,255,0.3)]'
                                    },
                                  };
                                  const config = sourceConfig[emailSource] || { 
                                    label: emailSource, 
                                    gradient: 'bg-gradient-to-br from-gray-400/90 to-gray-500/90',
                                    shadow: 'shadow-[0_3px_12px_-2px_rgba(107,114,128,0.5),inset_0_1px_1px_rgba(255,255,255,0.3)]'
                                  };
                                  return (
                                    <Badge 
                                      variant="secondary" 
                                      className={`text-[10px] h-5 px-2 font-semibold text-white border border-white/30 backdrop-blur-sm whitespace-nowrap ${config.gradient} ${config.shadow} hover:scale-105 transition-transform duration-150`}
                                    >
                                      {config.label}
                                    </Badge>
                                  );
                                })()}
                              </TableCell>
                              {activeFilter !== 'mybids' && activeFilter !== 'booked' && (
                                <TableCell className="text-right py-1">
                                  <div 
                                    className="inline-flex items-center gap-0 rounded-md overflow-hidden"
                                    style={{ 
                                      background: 'linear-gradient(180deg, hsl(0 0% 100%) 0%, hsl(220 10% 96%) 100%)',
                                      boxShadow: '0 3px 10px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,1)',
                                      border: '1px solid hsl(220 10% 80%)'
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <Button 
                                      variant="ghost" 
                                      size="sm" 
                                      className="h-7 w-7 p-0 rounded-none text-red-500 hover:bg-red-100 hover:text-red-700 border-r border-gray-200" 
                                      style={{ textShadow: '0 1px 0 white' }}
                                      aria-label="Skip load or match"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        // Always skip the entire email/load for instant row removal
                                        handleSkipEmail(email.id, match?.id);
                                      }}
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                    <Button 
                                      variant="ghost" 
                                      size="sm" 
                                      className="h-7 w-7 p-0 rounded-none text-white hover:opacity-90" 
                                      style={{ 
                                        background: 'linear-gradient(180deg, hsl(221 80% 58%) 0%, hsl(221 80% 50%) 100%)',
                                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3), inset 0 -1px 0 rgba(0,0,0,0.1)'
                                      }}
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
                              )}
                              {activeFilter === 'mybids' && (
                                <>
                                  {/* Rate column */}
                                  <TableCell className="py-1">
                                    <div className="text-[13px] font-medium leading-tight whitespace-nowrap">
                                      {(() => {
                                        const bidItem = item as any;
                                        if (bidItem.bid_rate) {
                                          return `$${Number(bidItem.bid_rate).toLocaleString()}`;
                                        }
                                        return data.rate ? `$${Number(data.rate).toLocaleString()}` : '—';
                                      })()}
                                    </div>
                                  </TableCell>
                                  {/* Dispatcher column */}
                                  <TableCell className="py-1">
                                    <div className="text-[13px] leading-tight whitespace-nowrap">
                                      {(() => {
                                        const bidItem = item as any;
                                        // Use bid_by from match if available
                                        if (bidItem.bid_by) {
                                          // Check if it's the current dispatcher
                                          if (currentDispatcherInfo?.id === bidItem.bid_by) {
                                            return `${currentDispatcherInfo.first_name} ${currentDispatcherInfo.last_name?.[0] || ''}.`;
                                          }
                                          // Return abbreviated ID if dispatcher not found
                                          return bidItem.bid_by.slice(0, 8);
                                        }
                                        return '—';
                                      })()}
                                    </div>
                                  </TableCell>
                                  {/* Award column */}
                                  <TableCell className="py-1">
                                    {(item as any).booked_load_id ? (
                                      <Button
                                        size="sm"
                                        className="h-6 px-2 text-[11px] font-semibold bg-yellow-500 hover:bg-yellow-500 text-white cursor-default"
                                        disabled
                                      >
                                        BOOKED
                                      </Button>
                                    ) : (
                                      <Button
                                        size="sm"
                                        className="h-6 px-2 text-[11px] font-semibold btn-glossy-success text-white"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setBookingMatch(item);
                                          setBookingEmail(email);
                                        }}
                                      >
                                        BOOK IT
                                      </Button>
                                    )}
                                  </TableCell>
                                  {/* Bid Time column */}
                                  <TableCell className="py-1">
                                    <div className="text-[13px] leading-tight whitespace-nowrap">
                                      {(() => {
                                        const bidItem = item as any;
                                        // Use bid_at if available, fallback to updated_at
                                        const bidTime = bidItem.bid_at || bidItem.updated_at;
                                        if (bidTime) {
                                          const bidDate = new Date(bidTime);
                                          return bidDate.toLocaleString('en-US', {
                                            month: 'numeric',
                                            day: 'numeric',
                                            hour: 'numeric',
                                            minute: '2-digit',
                                            hour12: true
                                          });
                                        }
                                        return '—';
                                      })()}
                                    </div>
                                    {/* Show duplicate badge if any bid for this match is duplicate */}
                                    {(() => {
                                      const bids = (item as any).load_bids || [];
                                      const hasDuplicateBid = bids.some((b: any) => b.status === 'duplicate');
                                      if (hasDuplicateBid) {
                                        return (
                                          <Badge variant="outline" className="h-4 px-1.5 text-[10px] border-orange-400 text-orange-600 bg-orange-50 mt-0.5">
                                            Duplicate
                                          </Badge>
                                        );
                                      }
                                      return null;
                                    })()}
                                  </TableCell>
                                </>
                              )}
                              {activeFilter === 'booked' && (
                                <>
                                  {/* Rate column */}
                                  <TableCell className="py-1">
                                    <div className="text-[13px] font-medium leading-tight whitespace-nowrap">
                                      {(() => {
                                        const bookedItem = item as any;
                                        if (bookedItem.bid_rate) {
                                          return `$${Number(bookedItem.bid_rate).toLocaleString()}`;
                                        }
                                        return data.rate ? `$${Number(data.rate).toLocaleString()}` : '—';
                                      })()}
                                    </div>
                                  </TableCell>
                                  {/* Dispatcher column */}
                                  <TableCell className="py-1">
                                    <div className="text-[13px] leading-tight whitespace-nowrap">
                                      {(() => {
                                        const bookedItem = item as any;
                                        // Use bid_by from match if available
                                        if (bookedItem.bid_by) {
                                          // Check if it's the current dispatcher
                                          if (currentDispatcherInfo?.id === bookedItem.bid_by) {
                                            return `${currentDispatcherInfo.first_name} ${currentDispatcherInfo.last_name?.[0] || ''}.`;
                                          }
                                          // Look up dispatcher from allDispatchers
                                          const dispatcher = allDispatchers.find(d => d.id === bookedItem.bid_by);
                                          if (dispatcher) {
                                            return `${dispatcher.first_name} ${dispatcher.last_name?.[0] || ''}.`;
                                          }
                                          // Return abbreviated ID if dispatcher not found
                                          return bookedItem.bid_by.slice(0, 8);
                                        }
                                        return '—';
                                      })()}
                                    </div>
                                  </TableCell>
                                </>
                              )}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  
                  {/* Pagination bar at bottom - glossy style */}
                  <div className="flex-shrink-0 flex items-center justify-between px-3 py-1.5 bg-gradient-to-r from-muted/50 to-muted/80 border-t border-border/50">
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>Items per page: {itemsPerPage}</span>
                      <span className="font-medium">
                        {(() => {
                          const totalItems = activeFilter === 'unreviewed' ? filteredMatches.length 
                            : activeFilter === 'skipped' ? skippedMatches.length
                            : activeFilter === 'mybids' ? bidMatches.length
                            : activeFilter === 'undecided' ? undecidedMatches.length
                            : activeFilter === 'waitlist' ? waitlistMatches.length
                            : activeFilter === 'missed' ? missedHistory.length
                            : activeFilter === 'expired' ? expiredMatches.length
                            : filteredEmails.length;
                          return totalItems === 0 ? '0 - 0 of 0' : `${Math.min((currentPage - 1) * itemsPerPage + 1, totalItems)} - ${Math.min(currentPage * itemsPerPage, totalItems)} of ${totalItems}`;
                        })()}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        className="btn-glossy h-6 w-6 rounded flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={() => setCurrentPage(1)}
                        disabled={currentPage === 1}
                      >
                        <ChevronsLeft className="h-3 w-3 text-muted-foreground" />
                      </button>
                      <button
                        className="btn-glossy h-6 w-6 rounded flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                        disabled={currentPage === 1}
                      >
                        <ChevronLeft className="h-3 w-3 text-muted-foreground" />
                      </button>
                      <button
                        className="btn-glossy h-6 w-6 rounded flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={() => {
                          const totalItems = activeFilter === 'unreviewed' ? filteredMatches.length 
                            : activeFilter === 'skipped' ? skippedMatches.length
                            : activeFilter === 'mybids' ? bidMatches.length
                            : activeFilter === 'undecided' ? undecidedMatches.length
                            : activeFilter === 'waitlist' ? waitlistMatches.length
                            : activeFilter === 'missed' ? missedHistory.length
                            : activeFilter === 'expired' ? expiredMatches.length
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
                            : activeFilter === 'expired' ? expiredMatches.length
                            : filteredEmails.length;
                          return currentPage >= Math.ceil(totalItems / itemsPerPage);
                        })()}
                      >
                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                      </button>
                      <button
                        className="btn-glossy h-6 w-6 rounded flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={() => {
                          const totalItems = activeFilter === 'unreviewed' ? filteredMatches.length 
                            : activeFilter === 'skipped' ? skippedMatches.length
                            : activeFilter === 'mybids' ? bidMatches.length
                            : activeFilter === 'undecided' ? undecidedMatches.length
                            : activeFilter === 'waitlist' ? waitlistMatches.length
                            : activeFilter === 'missed' ? missedHistory.length
                            : activeFilter === 'expired' ? expiredMatches.length
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
                            : activeFilter === 'expired' ? expiredMatches.length
                            : filteredEmails.length;
                          return currentPage >= Math.ceil(totalItems / itemsPerPage);
                        })()}
                      >
                        <ChevronsRight className="h-3 w-3 text-muted-foreground" />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
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

      {/* Book Load Dialog */}
      <BookLoadDialog
        open={!!bookingMatch}
        onOpenChange={(open) => {
          if (!open) {
            setBookingMatch(null);
            setBookingEmail(null);
          }
        }}
        match={bookingMatch}
        email={bookingEmail}
        parsedData={bookingEmail?.parsed_data || {}}
        vehicles={vehicles}
        dispatchers={allDispatchers}
        currentDispatcherId={currentDispatcherId}
        onBookingComplete={handleBookingComplete}
      />
    </div>
  );
}
