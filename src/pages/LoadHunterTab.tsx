import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantFilter } from "@/hooks/useTenantFilter";
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
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { RefreshCw, Settings, X, MapPin, Wrench, Gauge, Truck, MapPinned, Volume2, VolumeX, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, MoreVertical, Plus, Minus, Menu } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import oilChangeIcon from '@/assets/oil-change-icon.png';
import checkEngineIcon from '@/assets/check-engine-icon.png';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// Extracted types and hooks for code splitting
import type { Vehicle, HuntPlan, Load, ActiveMode, ActiveFilter, LoadHunterTheme } from "@/types/loadHunter";
import { loadSoundSettings, getSoundPrompt } from "@/hooks/useLoadHunterSound";
import { useLoadHunterDispatcher } from "@/hooks/useLoadHunterDispatcher";
import { useLoadHunterRealtime } from "@/hooks/useLoadHunterRealtime";
import { useLoadHunterData } from "@/hooks/useLoadHunterData";
import { useLoadHunterCounts } from "@/hooks/useLoadHunterCounts";
import { groupMatchesByLoadEmail } from "@/utils/loadHunterHelpers";
import { LoadHunterFilters, LoadHunterTableHeader, LoadHunterTableRowEnhanced, LoadHunterVehicleDetail } from "@/components/load-hunter";
import type { SoundSettings } from "@/hooks/useUserPreferences";
import { useBrokerCreditStatus } from "@/hooks/useBrokerCreditStatus";

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
  
  // ===== COUNTS HOOK - moved to after activeMode declaration for mode-aware counting =====
  
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

  // Broker credit status hook - extracts load email IDs from visible data
  const visibleLoadEmailIds = React.useMemo(() => {
    const ids: string[] = [];
    [...unreviewedViewData, ...missedHistory, ...loadEmails].forEach((item: any) => {
      const emailId = item?.email?.id || item?.id || item?.load_email_id;
      if (emailId) ids.push(emailId);
    });
    return ids.slice(0, 100); // Limit to 100 for performance
  }, [unreviewedViewData, missedHistory, loadEmails]);
  
  const { statusMap: brokerStatusMap } = useBrokerCreditStatus(visibleLoadEmailIds);

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
  const [activeMode, setActiveMode] = useState<ActiveMode>('dispatch');
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('unreviewed');
  const [filterVehicleId, setFilterVehicleId] = useState<string | null>(null);
  
  // ===== COUNTS HOOK - provides persistent badge counts from DB, filtered by mode =====
  const { 
    unreviewedCount: badgeUnreviewedCount,
    skippedCount: badgeSkippedCount,
    bidCount: badgeBidCount,
    bookedCount: badgeBookedCount,
    missedCount: badgeMissedCount,
  } = useLoadHunterCounts({ activeMode, myVehicleIds });
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
  const [loadHunterTheme, setLoadHunterTheme] = useState<LoadHunterTheme>('classic');
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
      const enabledHunts = huntPlans.filter(h => h.enabled && h.initialMatchDone);
      if (enabledHunts.length === 0) return;
      
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
      
      if (candidateLoads.length === 0) return;
      
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
        await supabase
          .from('load_hunt_matches')
          .upsert(allMatches, { 
            onConflict: 'load_email_id,hunt_plan_id',
            ignoreDuplicates: true  // Don't overwrite existing matches (preserves skipped status)
          });
      }
      
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
    
    const interval = setInterval(() => {
      // Force re-matching by updating state (triggers the matching useEffect above)
      setLoadEmails(current => [...current]);
    }, 60 * 1000); // Every 60 seconds
    
    return () => clearInterval(interval);
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
    if (isSoundMuted && !force) return;

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
        return;
      } catch {
        // Fall through to generate new sound
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
      } catch {
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
    } catch {
      // Fallback sound failed silently
    }
  };
  // Request notification permission
  const requestNotificationPermission = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        setNotificationsEnabled(true);
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
    const newMutedState = !isSoundMuted;
    setIsSoundMuted(newMutedState);
    
    // Initialize audio context and play test sound when unmuting
    if (!newMutedState) {
      // Request notification permission for background alerts
      const notifGranted = await requestNotificationPermission();
      
      // Create audio context on user interaction
      if (!audioContext) {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        setAudioContext(ctx);
        
        // Resume if needed
        if (ctx.state === 'suspended') {
          ctx.resume();
        }
      }
      
      // Play test sound
      setTimeout(() => {
        playAlertSound(true);
        if (notifGranted) {
          toast.success('Sound & background notifications enabled');
        } else {
          toast.success('Sound alerts enabled (enable browser notifications for background alerts)');
        }
      }, 100);
    } else {
      toast.info('Sound alerts muted');
    }
  };

  // Handle visibility change - refresh data when user returns to tab
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        isTabHiddenRef.current = true;
      } else {
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

  // Handle clearing all matches for a hunt plan
  const handleClearMatches = async (huntId: string) => {
    if (!confirm(`Clear all matches for this hunt plan? Only NEW loads will match going forward.`)) return;
    try {
      const { error: deleteError } = await supabase
        .from('load_hunt_matches')
        .delete()
        .eq('hunt_plan_id', huntId);
      if (deleteError) throw deleteError;
      
      const { data: latestLoad } = await supabase
        .from('load_emails')
        .select('load_id')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (latestLoad?.load_id) {
        await supabase
          .from('hunt_plans')
          .update({ floor_load_id: latestLoad.load_id })
          .eq('id', huntId);
      }
      
      toast.success('All matches cleared - only new loads will match');
      const { data: newMatches } = await supabase
        .from('load_hunt_matches')
        .select('*')
        .eq('is_active', true);
      setLoadMatches(newMatches || []);
    } catch (err) {
      console.error('Error clearing matches:', err);
      toast.error('Failed to clear matches');
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

  const getTimeAgo = (date: Date | string | null | undefined): string => {
    if (!date) return 'unknown';
    
    // Convert string to Date if needed
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    
    // Validate it's a valid date
    if (!(dateObj instanceof Date) || isNaN(dateObj.getTime())) {
      return 'unknown';
    }
    
    const seconds = Math.floor((new Date().getTime() - dateObj.getTime()) / 1000);
    if (seconds < 0) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ${minutes % 60}m ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h ago`;
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
            setActiveFilter(filter as ActiveFilter);
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
      {/* Filter Bar - Full Width */}
      <LoadHunterFilters
        activeMode={activeMode}
        setActiveMode={setActiveMode}
        activeFilter={activeFilter}
        setActiveFilter={setActiveFilter}
        unreviewedCount={badgeUnreviewedCount}
        skippedCount={badgeSkippedCount}
        bidCount={badgeBidCount}
        bookedCount={badgeBookedCount}
        missedCount={badgeMissedCount}
        expiredCount={expiredCount}
        waitlistCount={waitlistCount}
        undecidedCount={undecidedCount}
        allEmailsCount={loadEmails.length + failedQueueItems.length}
        matchSearchQuery={matchSearchQuery}
        setMatchSearchQuery={setMatchSearchQuery}
        isSearchingArchive={isSearchingArchive}
        showArchiveResults={showArchiveResults}
        setShowArchiveResults={setShowArchiveResults}
        archivedSearchResults={archivedSearchResults}
        onArchiveResultClick={(result) => {
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
        selectedSources={selectedSources}
        setSelectedSources={setSelectedSources}
        isSoundMuted={isSoundMuted}
        onToggleSound={toggleSound}
        onSoundSettingsChange={setSoundSettings}
        loadHunterTheme={loadHunterTheme}
        setLoadHunterTheme={setLoadHunterTheme}
        groupMatchesEnabled={groupMatchesEnabled}
        setGroupMatchesEnabled={setGroupMatchesEnabled}
        refreshing={refreshing}
        onRefresh={handleRefreshLoads}
        showAllTabEnabled={showAllTabEnabled}
        filterVehicleId={filterVehicleId}
        setFilterVehicleId={setFilterVehicleId}
        setSelectedVehicle={setSelectedVehicle}
        setSelectedEmailForDetail={setSelectedEmailForDetail}
        currentDispatcherInfo={currentDispatcherInfo}
        onOpenDispatcherScorecard={() => setActiveFilter('dispatcher-metrix')}
      />

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
          /* Vehicle Details View - Extracted Component */
          <>
            <LoadHunterVehicleDetail
              vehicle={selectedVehicle}
              huntPlans={huntPlans}
              loadEmails={loadEmails}
              vehicleNotes={vehicleNotes}
              setVehicleNotes={setVehicleNotes}
              editingNotes={editingNotes}
              setEditingNotes={setEditingNotes}
              onSaveNotes={handleSaveVehicleNotes}
              onToggleHunt={handleToggleHunt}
              onEditHunt={handleEditHunt}
              onDeleteHunt={handleDeleteHuntPlan}
              onCreateHunt={() => setCreateHuntOpen(true)}
              onClearMatches={handleClearMatches}
              canonicalVehicleTypes={canonicalVehicleTypes}
              vehicleTypeMappings={vehicleTypeMappings}
              mapContainerRef={mapContainer}
              getDriverName={getDriverName}
              getThirtyMinutesAgo={getThirtyMinutesAgo}
              extractLoadLocation={extractLoadLocation}
              calculateDistance={calculateDistance}
              formatDateTime={formatDateTime}
              getTimeAgo={getTimeAgo}
            />

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
          </>
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
                        <LoadHunterTableHeader
                          activeFilter={activeFilter}
                          loadHunterTheme={loadHunterTheme}
                          showIdColumns={showIdColumns}
                          onToggleIdColumns={() => setShowIdColumns(!showIdColumns)}
                        />
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
                              created_at: (item as any).created_at,
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

                          return (
                            <LoadHunterTableRowEnhanced
                              key={activeFilter === 'unreviewed' ? (match as any)?.id : email.id}
                              item={item}
                              email={email}
                              match={match}
                              rowIndex={rowIndex}
                              activeFilter={activeFilter}
                              loadHunterTheme={loadHunterTheme}
                              showIdColumns={showIdColumns}
                              vehicles={vehicles}
                              huntPlans={huntPlans}
                              carriersMap={carriersMap}
                              allDispatchers={allDispatchers}
                              loadDistances={loadDistances}
                              loadHuntMap={loadHuntMap}
                              currentDispatcherInfo={currentDispatcherInfo}
                              brokerStatusMap={brokerStatusMap}
                              getDriverName={getDriverName}
                              onRowClick={async (clickedEmail, clickedMatch, clickedItem) => {
                                const isFailed = clickedEmail._source === 'failed' || clickedEmail.status === 'failed';
                                if (isFailed) {
                                  toast.error(clickedEmail.issue_notes || 'Processing failed for this email');
                                  return;
                                }
                                // Calculate empty drive distance for detail view
                                let emptyDistance: number | undefined = undefined;
                                if (clickedMatch && (clickedMatch as any).distance_miles != null) {
                                  emptyDistance = (clickedMatch as any).distance_miles;
                                } else if (loadDistances.has(clickedEmail.id)) {
                                  emptyDistance = loadDistances.get(clickedEmail.id);
                                }
                                setSelectedEmailDistance(emptyDistance);
                                setSelectedEmailForDetail(clickedEmail);
                                setSelectedMatchForDetail(clickedMatch);
                              }}
                              onSkip={(emailId, matchId) => {
                                handleSkipEmail(emailId, matchId);
                              }}
                              onWaitlist={(emailId, matchId) => {
                                if (activeFilter === 'unreviewed' && match) {
                                  handleWaitlistMatch((match as any).id);
                                } else {
                                  handleMoveToWaitlist(emailId, matchId);
                                }
                              }}
                              onBook={(matchItem, emailData) => {
                                setBookingMatch(matchItem);
                                setBookingEmail(emailData);
                              }}
                            />
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
