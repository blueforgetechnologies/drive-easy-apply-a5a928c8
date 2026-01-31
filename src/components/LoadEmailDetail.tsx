import { useEffect, useState, useRef, useMemo, memo } from "react";
import { Truck, X, ChevronDown, ChevronUp, MapPin, Mail, DollarSign, ArrowLeft, Check, History, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import LoadRouteMap from "@/components/LoadRouteMap";
import { BrokerCreditBadge } from "@/components/BrokerCreditBadge";
import { BrokerCreditPopover } from "@/components/load-hunter/BrokerCreditPopover";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { useTenantFilter } from "@/hooks/useTenantFilter";
interface MatchHistoryEntry {
  id: string;
  dispatcher_name: string | null;
  dispatcher_email: string | null;
  action_type: string;
  action_details: any;
  created_at: string;
}
interface LoadEmailDetailProps {
  email: any;
  emptyDriveDistance?: number;
  match?: any;
  vehicles?: any[];
  drivers?: any[];
  carriersMap?: Record<string, string>;
  onClose: () => void;
  onBidPlaced?: (matchId: string, loadEmailId: string, bidRate?: number) => void;
  onUndecided?: (matchId: string) => void;
  onSkip?: (matchId: string) => Promise<void> | void;
  onWait?: (matchId: string) => Promise<void> | void;
  onMarkUnreviewed?: (matchId: string) => Promise<void> | void;
  onShowAlternativeMatches?: () => void;
}
const LoadEmailDetail = ({
  email,
  emptyDriveDistance,
  match,
  vehicles = [],
  drivers = [],
  carriersMap = {},
  onClose,
  onBidPlaced,
  onUndecided,
  onSkip,
  onWait,
  onMarkUnreviewed,
  onShowAlternativeMatches
}: LoadEmailDetailProps) => {
  const isMobile = useIsMobile();
  const { tenantId } = useTenantFilter();
  const [showOriginalEmail, setShowOriginalEmail] = useState(false);
  const [bidAmount, setBidAmount] = useState("");
  const [bidInitialized, setBidInitialized] = useState(false); // Track if we've initialized bid
  const [bidError, setBidError] = useState<string | null>(null);
  const [showBidCardOnMap, setShowBidCardOnMap] = useState(false);
  const [toEmail, setToEmail] = useState<string | null>(null);
  const [ccEmail, setCcEmail] = useState("");
  const [fullEmailData, setFullEmailData] = useState<any>(null);
  const [mobileSection, setMobileSection] = useState<'details' | 'map' | 'bid'>('details');
  const [showEmailConfirmDialog, setShowEmailConfirmDialog] = useState(false);
  const [bidConfirmed, setBidConfirmed] = useState(false);
  const [companyProfile, setCompanyProfile] = useState<any>(null);
  
  const [portalBidUrl, setPortalBidUrl] = useState<string | null>(null);
  const [currentDispatcher, setCurrentDispatcher] = useState<any>(null);

  // Match history state
  const [showMatchHistory, setShowMatchHistory] = useState(false);
  const [matchHistory, setMatchHistory] = useState<MatchHistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Average bid from similar lanes
  const [averageLaneBid, setAverageLaneBid] = useState<number | null>(null);
  const [loadingAverageBid, setLoadingAverageBid] = useState(false);

  // Existing bid check - prevent double bidding
  const [existingBid, setExistingBid] = useState<{
    id: string;
    bid_amount: number;
    dispatcher_name?: string;
    vehicle_number?: string;
    created_at: string;
  } | null>(null);
  const [checkingExistingBid, setCheckingExistingBid] = useState(false);

  // Low bid warning dialog
  const [showLowBidWarning, setShowLowBidWarning] = useState(false);
  const [pendingBidAmount, setPendingBidAmount] = useState("");

  // Presence tracking - who else is viewing this match
  const [otherViewers, setOtherViewers] = useState<{name: string, email: string}[]>([]);
  const channelRef = useRef<any>(null);

  // Editable email body lines
  const [editableGreeting, setEditableGreeting] = useState<string>("");
  const [editableBlankLine, setEditableBlankLine] = useState<string>("");
  const [editableVehicleDesc, setEditableVehicleDesc] = useState<string>("");
  const [editableHelpLine, setEditableHelpLine] = useState<string>("Please let me know if I can help on this load:");
  const [editableOrderLine, setEditableOrderLine] = useState<string>("");
  const data = email.parsed_data || {};
  
  // Pre-fill bid amount with posted rate if available
  useEffect(() => {
    if (!bidInitialized && data.rate) {
      const rateValue = typeof data.rate === 'number' ? data.rate.toString() : data.rate;
      setBidAmount(rateValue);
      setBidInitialized(true);
    }
  }, [data.rate, bidInitialized]);
  
  // Check if broker email contains "do not reply" variants (DONOTREPLY / DO-NOT-REPLY / DO_NOT_REPLY)
  // for button styling - must be reactive to toEmail state
  const isDoNotReplyEmail = useMemo(() => {
    const emailToCheck = (toEmail || data.broker_email || '').trim();
    return /do[-_]?not[-_]?reply/i.test(emailToCheck);
  }, [toEmail, data.broker_email]);

  const DEFAULT_TEMPLATES = {
    nearby: 'Vehicle {distance} away. We can pick up on time and deliver as scheduled.',
    driver: 'Driver is U.S. citizen with birth certificate in hand. Clean criminal record.',
    fuel: 'Due to increased fuel costs, this bid includes a $ {fuel_surcharge} fuel surcharge.'
  };
  const getStoredTemplates = (dispatcherEmail: string) => {
    const key = `bid_templates_${dispatcherEmail}`;
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : null;
  };
  const saveTemplates = (dispatcherEmail: string, templates: Record<string, string>) => {
    const key = `bid_templates_${dispatcherEmail}`;
    localStorage.setItem(key, JSON.stringify(templates));
  };
  const [selectedTemplates, setSelectedTemplates] = useState<Record<string, boolean>>({
    nearby: false,
    driver: false,
    fuel: false
  });
  const [templateTexts, setTemplateTexts] = useState<Record<string, string>>(DEFAULT_TEMPLATES);
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null);

  // Diesel truck acceleration sound effect
  const playTruckSound = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Create multiple oscillators to simulate diesel engine rumble
      const createEngineSound = (startFreq: number, endFreq: number, startTime: number, duration: number, volume: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(startFreq, ctx.currentTime + startTime);
        osc.frequency.exponentialRampToValueAtTime(endFreq, ctx.currentTime + startTime + duration);
        
        gain.gain.setValueAtTime(0, ctx.currentTime + startTime);
        gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + startTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + startTime + duration);
        
        osc.start(ctx.currentTime + startTime);
        osc.stop(ctx.currentTime + startTime + duration);
      };

      // Low rumble base
      createEngineSound(35, 80, 0, 0.8, 0.15);
      createEngineSound(40, 90, 0.1, 0.7, 0.12);
      
      // Mid frequency growl
      createEngineSound(80, 200, 0, 0.8, 0.08);
      createEngineSound(100, 250, 0.1, 0.6, 0.06);
      
      // High rev acceleration
      createEngineSound(150, 400, 0.2, 0.6, 0.04);
      
      console.log('🚛 Diesel truck sound played!');
    } catch (error) {
      console.error('Error playing truck sound:', error);
    }
  };

  // Load dispatcher's custom templates when dispatcher is identified
  useEffect(() => {
    if (currentDispatcher?.email) {
      const stored = getStoredTemplates(currentDispatcher.email);
      if (stored) {
        // Migrate old template format - remove parentheses from nearby template
        if (stored.nearby && stored.nearby.includes('( ') && stored.nearby.includes(' )')) {
          stored.nearby = DEFAULT_TEMPLATES.nearby;
          saveTemplates(currentDispatcher.email, stored);
        }
        setTemplateTexts(prev => ({
          ...prev,
          ...stored
        }));
      }
    }
  }, [currentDispatcher?.email]);
  const handleTemplateToggle = (templateKey: string) => {
    setSelectedTemplates(prev => ({
      ...prev,
      [templateKey]: !prev[templateKey]
    }));
  };
  const handleTemplateTextChange = (templateKey: string, text: string) => {
    setTemplateTexts(prev => {
      const updated = {
        ...prev,
        [templateKey]: text
      };
      // Save to localStorage if dispatcher is known
      if (currentDispatcher?.email) {
        saveTemplates(currentDispatcher.email, updated);
      }
      return updated;
    });
  };

  // Get time-based greeting with contact's first name
  const getGreeting = () => {
    const hour = new Date().getHours();
    let timeGreeting = 'Good morning';
    if (hour >= 12 && hour < 17) {
      timeGreeting = 'Good afternoon';
    } else if (hour >= 17) {
      timeGreeting = 'Good evening';
    }

    // Try broker_name first, then extract from broker_email (e.g., "kristy.pidhoretska@..." -> "Kristy")
    let firstName = '';
    if (data.broker_name) {
      firstName = (data.broker_name || '').split(' ')[0];
    } else if (data.broker_email) {
      // Extract first name from email (before @ and before any dots/underscores)
      const emailPrefix = (data.broker_email || '').split('@')[0];
      const namePart = emailPrefix.split(/[._-]/)[0];
      if (namePart && namePart.length > 1) {
        firstName = namePart.charAt(0).toUpperCase() + namePart.slice(1).toLowerCase();
      }
    }
    return firstName ? `${timeGreeting} ${firstName},` : `${timeGreeting},`;
  };

  // Get rendered template text with dynamic values
  const getRenderedTemplate = (templateKey: string) => {
    const text = templateTexts[templateKey];
    const distance = emptyDriveDistance ? `${Math.round(emptyDriveDistance)}mi` : '252mi';
    const fuelSurcharge = data.fuel_surcharge || '375.00';
    return text.replace('{distance}', distance).replace('{fuel_surcharge}', fuelSurcharge);
  };

  // Get selected templates for email body
  const getSelectedTemplateTexts = () => {
    return Object.entries(selectedTemplates).filter(([_, isSelected]) => isSelected).map(([key]) => getRenderedTemplate(key));
  };

  // Fetch full email data (including body_text) if not present in email prop
  useEffect(() => {
    const fetchFullEmail = async () => {
      // If body_text is missing, fetch it from database
      if (!email.body_text && !email.body_html && email.id) {
        try {
          const {
            data: fullEmail,
            error
          } = await supabase.from('load_emails').select('body_text, body_html').eq('id', email.id).single();
          if (!error && fullEmail) {
            setFullEmailData(fullEmail);
          }
        } catch (e) {
          console.error('Error fetching full email:', e);
        }
      }
    };
    fetchFullEmail();
  }, [email.id, email.body_text, email.body_html]);

  // Extract Full Circle TMS portal bid URL from email body
  useEffect(() => {
    const extractPortalUrl = () => {
      const emailBody = fullEmailData?.body_html || email.body_html || '';
      // Look for Full Circle TMS bid URL pattern
      const bidUrlMatch = emailBody.match(/href="(https:\/\/app\.fullcircletms\.com\/[^"]*BidOnOrder[^"]*)"/i);
      if (bidUrlMatch && bidUrlMatch[1]) {
        // Decode HTML entities
        const decodedUrl = bidUrlMatch[1]
          .replace(/&amp;/g, '&')
          .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(code));
        setPortalBidUrl(decodedUrl);
      } else {
        setPortalBidUrl(null);
      }
    };
    extractPortalUrl();
  }, [email.body_html, fullEmailData]);

  const [bidAsCarrier, setBidAsCarrier] = useState<any>(null);
  const [vehicleCarrier, setVehicleCarrier] = useState<any>(null);

  // Fetch company profile, current dispatcher, and bid_as carrier for email signature
  useEffect(() => {
    const fetchProfileData = async () => {
      if (!tenantId) return; // Wait for tenant context
      
      try {
        // Fetch company profile for this tenant
        const {
          data: profile
        } = await supabase.from('company_profile').select('*').eq('tenant_id', tenantId).single();
        if (profile) setCompanyProfile(profile);

        // Fetch current user's dispatcher info - scoped to tenant
        const {
          data: {
            user
          }
        } = await supabase.auth.getUser();
        if (user?.email) {
          const {
            data: dispatcher
          } = await supabase.from('dispatchers')
            .select('*')
            .eq('tenant_id', tenantId) // CRITICAL: Tenant scoping
            .ilike('email', user.email)
            .single();
          if (dispatcher) setCurrentDispatcher(dispatcher);
        }
      } catch (e) {
        console.error('Error fetching profile data:', e);
      }
    };
    fetchProfileData();
  }, [tenantId]); // Re-run when tenant changes

  // Fetch match history
  const fetchMatchHistory = async () => {
    if (!match?.id) return;
    setLoadingHistory(true);
    try {
      const {
        data: history,
        error
      } = await supabase.from('match_action_history').select('*').eq('match_id', match.id).order('created_at', {
        ascending: false
      });
      if (error) throw error;
      setMatchHistory(history || []);
    } catch (e) {
      console.error('Error fetching match history:', e);
      toast.error('Failed to load match history');
    } finally {
      setLoadingHistory(false);
    }
  };

  // Record action to match history
  const recordMatchAction = async (actionType: string, actionDetails?: any) => {
    if (!match?.id) {
      console.log('📊 recordMatchAction: No match ID, skipping');
      return;
    }
    try {
      console.log('📊 Recording action:', actionType, 'for match:', match.id, 'dispatcher:', currentDispatcher?.email);
      const {
        error
      } = await supabase.from('match_action_history').insert({
        match_id: match.id,
        dispatcher_id: currentDispatcher?.id || null,
        dispatcher_name: currentDispatcher ? `${currentDispatcher.first_name} ${currentDispatcher.last_name}` : null,
        dispatcher_email: currentDispatcher?.email || null,
        action_type: actionType,
        action_details: actionDetails || null,
        tenant_id: tenantId!
      });
      if (error) {
        console.error('📊 Error inserting action:', error);
        throw error;
      }
      console.log('📊 Action recorded successfully:', actionType);
    } catch (e) {
      console.error('Error recording match action:', e);
    }
  };

  // Record when detail is opened (viewed)
  useEffect(() => {
    if (match?.id && currentDispatcher) {
      recordMatchAction('viewed');
    }
  }, [match?.id, currentDispatcher?.id]);

  // Check for existing SENT bid on this Load ID to prevent double bidding
  useEffect(() => {
    const checkExistingBid = async () => {
      const loadId = email?.load_id;
      if (!loadId) return;

      setCheckingExistingBid(true);
      try {
        // Only look for bids with status='sent' (the first real bid)
        const { data: bid, error } = await supabase
          .from('load_bids')
          .select(`
            id,
            bid_amount,
            created_at,
            status,
            dispatcher:dispatchers(first_name, last_name),
            vehicle:vehicles(vehicle_number)
          `)
          .eq('load_id', loadId)
          .eq('status', 'sent')
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();

        if (error) {
          console.error('Error checking existing bid:', error);
          return;
        }

        if (bid) {
          const dispatcherData = bid.dispatcher as any;
          const vehicleData = bid.vehicle as any;
          setExistingBid({
            id: bid.id,
            bid_amount: bid.bid_amount,
            dispatcher_name: dispatcherData
              ? `${dispatcherData.first_name} ${dispatcherData.last_name}`
              : undefined,
            vehicle_number: vehicleData?.vehicle_number,
            created_at: bid.created_at,
          });
        } else {
          setExistingBid(null);
        }
      } catch (e) {
        console.error('Error checking existing bid:', e);
      } finally {
        setCheckingExistingBid(false);
      }
    };

    checkExistingBid();

    // Subscribe to realtime updates for this load_id
    const loadId = email?.load_id;
    if (loadId) {
      const channel = supabase
        .channel(`load_bid_${loadId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'load_bids',
            filter: `load_id=eq.${loadId}`,
          },
          (payload) => {
            console.log('🔔 Load bid changed:', payload);
            checkExistingBid();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [email?.load_id]);

  // Presence tracking - track who is viewing this load email in real-time
  // Uses load_email_id so all matches for the same load share presence
  useEffect(() => {
    const loadEmailId = email?.id;
    console.log('👁️ Presence effect triggered:', { loadEmailId, dispatcherEmail: currentDispatcher?.email, emailProp: email });
    
    if (!loadEmailId || !currentDispatcher?.email) {
      console.log('👁️ Presence: Skipping - missing loadEmailId or dispatcher email');
      return;
    }

    const channelName = `load_presence_${loadEmailId}`;
    console.log('👁️ Presence: Joining channel', channelName);
    const channel = supabase.channel(channelName);

    channel
      .on('presence', { event: 'sync' }, () => {
        const presenceState = channel.presenceState();
        console.log('👁️ Presence sync - raw state:', JSON.stringify(presenceState));
        
        // Use a Map to deduplicate by email (one entry per unique email)
        const viewerMap = new Map<string, {name: string, email: string}>();
        
        Object.entries(presenceState).forEach(([key, presences]: [string, any]) => {
          console.log('👁️ Processing presence key:', key, 'presences:', presences);
          presences.forEach((presence: any) => {
            console.log('👁️ Individual presence:', presence, 'current:', currentDispatcher.email);
            // Don't include current user, dedupe by email
            if (presence.email && presence.email.toLowerCase() !== currentDispatcher.email.toLowerCase()) {
              viewerMap.set(presence.email.toLowerCase(), {
                name: presence.name || presence.email,
                email: presence.email
              });
            }
          });
        });
        
        const viewers = Array.from(viewerMap.values());
        console.log('👁️ Final other viewers:', viewers);
        setOtherViewers(viewers);
      })
      .subscribe(async (status) => {
        console.log('👁️ Presence channel status:', status);
        if (status === 'SUBSCRIBED') {
          await channel.track({
            email: currentDispatcher.email,
            name: currentDispatcher.first_name 
              ? `${currentDispatcher.first_name} ${currentDispatcher.last_name || ''}`.trim()
              : currentDispatcher.email,
            online_at: new Date().toISOString()
          });
          console.log('👁️ Tracked presence for:', currentDispatcher.email);
        }
      });

    channelRef.current = channel;

    return () => {
      console.log('👁️ Leaving presence channel:', channelName);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [email?.id, currentDispatcher?.email]);

  // Use fetched data or prop data
  const emailBody = fullEmailData?.body_html || fullEmailData?.body_text || email.body_html || email.body_text || "";
  const originCity = data.origin_city || "ATLANTA";
  const originState = data.origin_state || "GA";
  const destCity = data.destination_city || "MEMPHIS";
  const destState = data.destination_state || "TN";

  // Memoize map stops to prevent map flickering on parent re-renders
  // Include pre-geocoded coordinates from parsed_data to skip geocoding API calls
  const mapStops = useMemo(() => {
    // Extract pre-geocoded coordinates from parsed_data if available
    const originLat = data.origin_lat || data.pickup_lat;
    const originLng = data.origin_lng || data.pickup_lng;
    const destLat = data.destination_lat || data.delivery_lat || data.dest_lat;
    const destLng = data.destination_lng || data.delivery_lng || data.dest_lng;
    
    return [
      {
        location_city: originCity,
        location_state: originState,
        location_address: `${originCity}, ${originState}`,
        stop_type: "pickup",
        stop_sequence: 1,
        // Pre-geocoded coordinates - if available, map skips geocoding API call
        lat: originLat,
        lng: originLng
      },
      {
        location_city: destCity,
        location_state: destState,
        location_address: `${destCity}, ${destState}`,
        stop_type: "delivery",
        stop_sequence: 2,
        lat: destLat,
        lng: destLng
      }
    ];
  }, [originCity, originState, destCity, destState, data.origin_lat, data.origin_lng, data.pickup_lat, data.pickup_lng, data.destination_lat, data.destination_lng, data.delivery_lat, data.delivery_lng, data.dest_lat, data.dest_lng]);

  // Get actual vehicle, driver, carrier, and broker data
  const vehicle = match && vehicles?.find((v: any) => v.id === match.vehicle_id);

  // Fetch the carrier from the vehicle's bid_as field
  useEffect(() => {
    const fetchBidAsCarrier = async () => {
      if (!tenantId) return; // Wait for tenant context
      
      if (vehicle?.bid_as) {
        console.log('Fetching bid_as carrier for vehicle:', vehicle.id, 'bid_as:', vehicle.bid_as);
        try {
          // bid_as is stored as text but contains a UUID, cast it for the query
          const {
            data: carrier,
            error
          } = await supabase.from('carriers')
            .select('*')
            .eq('id', vehicle.bid_as)
            .eq('tenant_id', tenantId) // TENANT SCOPING
            .maybeSingle();
          console.log('Carrier fetch result:', {
            carrier,
            error
          });
          if (!error && carrier) {
            setBidAsCarrier(carrier);
          } else if (error) {
            console.error('Error fetching bid_as carrier:', error);
          }
        } catch (e) {
          console.error('Error fetching bid_as carrier:', e);
        }
      } else {
        console.log('No bid_as set on vehicle:', vehicle?.id);
        setBidAsCarrier(null);
      }
    };
    fetchBidAsCarrier();
  }, [vehicle?.bid_as, tenantId]);

  // Fetch the vehicle's carrier for safety status display
  useEffect(() => {
    const fetchVehicleCarrier = async () => {
      if (!tenantId) return; // Wait for tenant context
      
      if (vehicle?.carrier) {
        try {
          const {
            data: carrier,
            error
          } = await supabase.from('carriers')
            .select('id, name, safer_status, safety_rating')
            .eq('id', vehicle.carrier)
            .eq('tenant_id', tenantId) // TENANT SCOPING
            .maybeSingle();
          if (!error && carrier) {
            setVehicleCarrier(carrier);
          }
        } catch (e) {
          console.error('Error fetching vehicle carrier:', e);
        }
      } else {
        setVehicleCarrier(null);
      }
    };
    fetchVehicleCarrier();
  }, [vehicle?.carrier, tenantId]);

  // Use asset's Vehicle Size / Asset Subtype from the matched vehicle; if no asset matched, show "(NOT FOUND)"
  const truckLengthFeet = vehicle?.vehicle_size; // Use feet from vehicle_size field
  const truckSubtype = vehicle?.asset_subtype;
  const displaySize = vehicle && truckLengthFeet ? `${truckLengthFeet}' ` : "";
  const displayType = vehicle ? truckSubtype || "Large Straight" : "(NOT FOUND)";
  const driver1 = vehicle?.driver_1_id ? drivers?.find((d: any) => d.id === vehicle.driver_1_id) : null;
  const driver2 = vehicle?.driver_2_id ? drivers?.find((d: any) => d.id === vehicle.driver_2_id) : null;
  const driver1Name = driver1?.personal_info?.firstName && driver1?.personal_info?.lastName ? `${driver1.personal_info.firstName} ${driver1.personal_info.lastName}` : null;
  const driver2Name = driver2?.personal_info?.firstName && driver2?.personal_info?.lastName ? `${driver2.personal_info.firstName} ${driver2.personal_info.lastName}` : null;
  const carrierName = vehicleCarrier?.name || (vehicle?.carrier ? carriersMap[vehicle.carrier] || vehicle.carrier : null);

  // Check if carrier has safety issues (NOT AUTHORIZED or CONDITIONAL rating)
  const hasCarrierSafetyIssue = vehicleCarrier?.safer_status?.toUpperCase().includes('NOT AUTHORIZED') || vehicleCarrier?.safety_rating?.toUpperCase() === 'CONDITIONAL';

  // Build equipment details from vehicle data
  const buildEquipmentDetails = () => {
    if (!vehicle) return '[10 straps] [10 blankets] [2 load bars] [2 horizontal E-Tracks]';
    const parts: string[] = [];
    if (vehicle.straps_count) parts.push(`[${vehicle.straps_count} straps]`);
    if (vehicle.blankets) parts.push(`[${vehicle.blankets} blankets]`);
    if (vehicle.load_bars_etrack) parts.push(`[${vehicle.load_bars_etrack} load bars]`);
    if (vehicle.horizontal_etracks) parts.push(`[${vehicle.horizontal_etracks} horizontal E-Tracks]`);
    return parts.length > 0 ? parts.join(' ') : '[Equipment details not available]';
  };

  // Build truck dimensions from vehicle data
  const buildTruckDimensions = () => {
    if (!vehicle) return 'L x W x H: ( 288 x 97 x 102 ) inches';
    const l = vehicle.dimensions_length; // already in inches
    const w = vehicle.dimensions_width;
    const h = vehicle.dimensions_height;
    if (l && w && h) return `L x W x H: ( ${l} x ${w} x ${h} ) inches`;
    return 'Dimensions not available';
  };

  // Build door dimensions from vehicle data
  const buildDoorDimensions = () => {
    if (!vehicle) return 'Roll Up W x H ( 94 x 96 ) inches';
    const w = vehicle.door_dims_width;
    const h = vehicle.door_dims_height;
    const type = vehicle.door_type || 'Roll Up';
    if (w && h) return `${type} W x H ( ${w} x ${h} ) inches`;
    return 'Door dimensions not available';
  };

  // Build features from vehicle data
  const buildFeatures = () => {
    if (!vehicle) return '[Dock High] [Air Ride] [Lift Gate] [Trailer Tracking] [Pallet Jack]';
    const features: string[] = [];
    features.push('[Dock High]'); // Always included
    if (vehicle.air_ride) features.push('[Air Ride]');
    if (vehicle.lift_gate) features.push('[Lift Gate]');
    if (vehicle.trailer_tracking) features.push('[Trailer Tracking]');
    if (vehicle.pallet_jack) features.push('[Pallet Jack]');
    return features.length > 0 ? features.join(' ') : '[Features not available]';
  };
  const equipmentDetails = buildEquipmentDetails();
  const truckDimensions = buildTruckDimensions();
  const doorDimensions = buildDoorDimensions();
  const vehicleFeatures = buildFeatures();

  // Build vehicle description with equipment for email intro line
  // Example: "This unit is a 24' Large Straight, Air Ride with Lift Gate, Pallet Jack, straps & Blankets (See dims below)"
  const buildVehicleDescription = () => {
    if (!vehicle) return `I have a ${displaySize}${displayType}.`;
    const parts: string[] = [];

    // Add Air Ride first if available
    if (vehicle.air_ride) parts.push('Air Ride');

    // Add Lift Gate
    if (vehicle.lift_gate) parts.push('Lift Gate');

    // Add Pallet Jack
    if (vehicle.pallet_jack) parts.push('Pallet Jack');

    // Add straps if available
    if (vehicle.straps_count && vehicle.straps_count > 0) parts.push('straps');

    // Add blankets if available
    if (vehicle.blankets && vehicle.blankets > 0) parts.push('Blankets');
    if (parts.length > 0) {
      const equipmentList = parts.join(', ').replace(/, ([^,]*)$/, ' & $1'); // Replace last comma with &
      return `This unit is a ${displaySize}${displayType}, ${equipmentList} (See dims below)`;
    }
    return `This unit is a ${displaySize}${displayType}.`;
  };
  const vehicleDescription = buildVehicleDescription();

  // Initialize editable body fields with computed values
  useEffect(() => {
    setEditableGreeting(getGreeting());
    setEditableVehicleDesc(vehicleDescription);
    const orderLine = `Order Number: ${data.order_number || 'N/A'} [${originCity}, ${originState} to ${destCity}, ${destState}]`;
    setEditableOrderLine(orderLine);
  }, [vehicle, data.broker_name, data.broker_email, data.order_number, originCity, originState, destCity, destState]);
  const rawBrokerName = data.broker || data.broker_company || data.customer || email.from_name || email.from_email?.split('@')[0] || "Unknown";
  // Clean and truncate broker name - remove HTML and limit to 25 chars
  const cleanBrokerName = rawBrokerName.replace(/<[^>]*>/g, '').trim();
  const brokerName = cleanBrokerName.length > 25 ? cleanBrokerName.slice(0, 23) + '…' : cleanBrokerName;
  const fullBrokerName = cleanBrokerName; // For tooltips

  // Haversine distance calculation (returns distance in miles)
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 3959; // Earth's radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Calculate average bid from similar lanes (within 50 miles of pickup AND delivery)
  useEffect(() => {
    const fetchAverageLaneBid = async () => {
      // Get current load's pickup and delivery coordinates
      const currentPickupCoords = data.pickup_coordinates;
      const currentDeliveryCoords = data.delivery_coordinates;
      if (!currentPickupCoords?.lat || !currentPickupCoords?.lng || !currentDeliveryCoords?.lat || !currentDeliveryCoords?.lng) {
        console.log('Missing coordinates for average bid calculation');
        return;
      }
      setLoadingAverageBid(true);
      try {
        // Fetch all past bids with their load data
        const {
          data: bidHistory,
          error
        } = await supabase.from('match_action_history').select(`
            action_details,
            load_emails!inner (
              parsed_data
            )
          `).eq('action_type', 'bid').not('action_details->bid_amount', 'is', null);
        if (error) {
          console.error('Error fetching bid history:', error);
          return;
        }
        if (!bidHistory || bidHistory.length === 0) {
          return;
        }

        // Filter bids within 50 miles of both pickup AND delivery
        const matchingBids: number[] = [];
        const RADIUS_MILES = 50;
        for (const bid of bidHistory) {
          const actionDetails = bid.action_details as Record<string, any> | null;
          const bidAmount = actionDetails?.bid_amount;
          if (!bidAmount || typeof bidAmount !== 'number') continue;
          const loadEmail = bid.load_emails as any;
          const parsedData = loadEmail?.parsed_data;
          if (!parsedData) continue;
          const pickupCoords = parsedData.pickup_coordinates;
          const deliveryCoords = parsedData.delivery_coordinates;
          if (!pickupCoords?.lat || !pickupCoords?.lng || !deliveryCoords?.lat || !deliveryCoords?.lng) continue;

          // Calculate distances
          const pickupDistance = calculateDistance(currentPickupCoords.lat, currentPickupCoords.lng, pickupCoords.lat, pickupCoords.lng);
          const deliveryDistance = calculateDistance(currentDeliveryCoords.lat, currentDeliveryCoords.lng, deliveryCoords.lat, deliveryCoords.lng);

          // Both must be within 50 miles
          if (pickupDistance <= RADIUS_MILES && deliveryDistance <= RADIUS_MILES) {
            matchingBids.push(bidAmount);
          }
        }
        if (matchingBids.length > 0) {
          const average = matchingBids.reduce((sum, bid) => sum + bid, 0) / matchingBids.length;
          setAverageLaneBid(Math.round(average));
          console.log(`Found ${matchingBids.length} similar lane bids, average: $${Math.round(average)}`);
        }
      } catch (err) {
        console.error('Error calculating average lane bid:', err);
      } finally {
        setLoadingAverageBid(false);
      }
    };
    fetchAverageLaneBid();
  }, [email.id, data.pickup_coordinates, data.delivery_coordinates]);

  // Handle Skip button click - skips only this specific match, not the entire load
  const handleSkip = async () => {
    try {
      if (!match?.id) {
        console.error("No match ID available to skip");
        return;
      }

      // Record the action
      await recordMatchAction('skipped');

      // Update database FIRST, then notify parent to refresh
      const {
        error
      } = await supabase.from("load_hunt_matches").update({
        is_active: false,
        match_status: 'skipped'
      }).eq("id", match.id);
      if (error) throw error;

      // Now notify parent - data is already updated
      if (onSkip) {
        await onSkip(match.id);
      }

      // Close the detail view and return to unreviewed list
      onClose();
    } catch (error) {
      console.error("Error skipping match:", error);
    }
  };

  // Handle Undecided button click - moves match to undecided status
  const handleUndecided = async () => {
    if (match?.id) {
      await recordMatchAction('undecided');
      if (onUndecided) {
        onUndecided(match.id);
      }
    }
    onClose();
  };

  // Handle Wait button click - moves match to waitlist
  const handleWait = async () => {
    try {
      if (!match?.id) {
        console.error("No match ID available for wait");
        return;
      }

      // Record the action
      await recordMatchAction('waitlist');

      // Update database FIRST, then notify parent to refresh
      const {
        error: matchError
      } = await supabase.from("load_hunt_matches").update({
        is_active: false,
        match_status: 'waitlist'
      }).eq("id", match.id);
      if (matchError) throw matchError;

      // Now notify parent - data is already updated
      if (onWait) {
        await onWait(match.id);
      }
      onClose();
    } catch (error) {
      console.error("Error setting wait status:", error);
    }
  };

  // Handle Mark Unreviewed button click - restores match back to active/unreviewed
  // Only allowed within 40 minutes of original matched_at timestamp
  const handleMarkUnreviewed = async () => {
    try {
      if (!match?.id) {
        console.error("No match ID available for mark unreviewed");
        return;
      }

      // Check if 40 minutes have passed since matched_at
      const matchedAt = new Date(match.matched_at);
      const now = new Date();
      const minutesSinceMatch = (now.getTime() - matchedAt.getTime()) / (1000 * 60);
      if (minutesSinceMatch >= 40) {
        toast.error("Cannot restore to unreviewed - 40 minute window has passed");
        return;
      }

      // Update database - set back to active status
      const {
        error
      } = await supabase.from("load_hunt_matches").update({
        is_active: true,
        match_status: 'active'
      }).eq("id", match.id);
      if (error) throw error;
      toast.success("Match restored to unreviewed");

      // Notify parent to refresh data
      if (onMarkUnreviewed) {
        await onMarkUnreviewed(match.id);
      }
      onClose();
    } catch (error) {
      console.error("Error marking as unreviewed:", error);
      toast.error("Failed to restore match");
    }
  };

  // Ensure we use the broker_email from parsed_data for the bid email
  // Priority: broker_email > email field > NEVER use from_email if it's postedloads@sylectus.com
  useEffect(() => {
    const resolveToEmail = async () => {
      try {
        // Helper to check if email is a "do not use" address (never send bids to these)
        const isDoNotUseEmail = (addr: string | null | undefined) => {
          if (!addr) return true;
          const lower = addr.toLowerCase();
          return lower.includes('postedloads@sylectus') || 
                 lower.includes('postedloads@fullcircletms') ||
                 lower.includes('donotreply') || 
                 lower.includes('do-not-reply') || 
                 lower.includes('do_not_reply') ||
                 lower.includes('noreply') ||
                 lower.includes('no-reply');
        };

        if (match?.load_email_id) {
          const {
            data: loadEmail,
            error
          } = await supabase.from("load_emails").select("parsed_data").eq("id", match.load_email_id).maybeSingle();
          if (!error && loadEmail?.parsed_data) {
            const parsedData = loadEmail.parsed_data as Record<string, any>;
            // PRIORITY 1: Always use reply_to if available (this is the correct bid email)
            if (parsedData.reply_to && !isDoNotUseEmail(parsedData.reply_to)) {
              setToEmail(parsedData.reply_to);
              return;
            }
            // PRIORITY 2: Check broker_email
            if (parsedData.broker_email && !isDoNotUseEmail(parsedData.broker_email)) {
              setToEmail(parsedData.broker_email);
              return;
            }
            // PRIORITY 3: Check email field from parsed data
            if (parsedData.email && !isDoNotUseEmail(parsedData.email)) {
              setToEmail(parsedData.email);
              return;
            }
          }
        }
        // Fallback to reply_to, broker_email, or email from current data prop
        if (data.reply_to && !isDoNotUseEmail(data.reply_to)) {
          setToEmail(data.reply_to);
        } else if (data.broker_email && !isDoNotUseEmail(data.broker_email)) {
          setToEmail(data.broker_email);
        } else if (data.email && !isDoNotUseEmail(data.email)) {
          setToEmail(data.email);
        } else if (!isDoNotUseEmail(email.from_email)) {
          setToEmail(email.from_email);
        } else {
          // No valid email found
          setToEmail(null);
        }
      } catch (e) {
        console.error("Error resolving toEmail from match:", e);
        // Same fallback logic on error
        const isDoNotUseEmail = (addr: string | null | undefined) => {
          if (!addr) return true;
          const lower = addr.toLowerCase();
          return lower.includes('postedloads@sylectus') || lower.includes('postedloads@fullcircletms') || lower.includes('donotreply') || lower.includes('noreply');
        };
        if (data.reply_to && !isDoNotUseEmail(data.reply_to)) {
          setToEmail(data.reply_to);
        } else if (data.broker_email && !isDoNotUseEmail(data.broker_email)) {
          setToEmail(data.broker_email);
        } else if (data.email && !isDoNotUseEmail(data.email)) {
          setToEmail(data.email);
        } else {
          setToEmail(null);
        }
      }
    };
    resolveToEmail();
  }, [match, email.from_email, data.broker_email, data.email, data.reply_to]);

  // Dispatcher signature info for email - use bid_as carrier if available, fallback to company_profile
  const dispatcherName = currentDispatcher ? `${currentDispatcher.first_name} ${currentDispatcher.last_name}` : 'Dispatcher Name';
  const dispatcherEmailAddr = currentDispatcher?.email || 'dispatch@company.com';
  // Use bid_as carrier info first, then fallback to company_profile
  const companyName = bidAsCarrier?.name || companyProfile?.company_name || 'COMPANY NAME';
  const mcNumber = bidAsCarrier?.mc_number || companyProfile?.mc_number || 'MC#';
  const dotNumber = bidAsCarrier?.dot_number || companyProfile?.dot_number || 'USDOT#';
  const companyAddress = bidAsCarrier?.address ? bidAsCarrier.address : companyProfile ? `${companyProfile.address || ''} ${companyProfile.city || ''}, ${companyProfile.state || ''} ${companyProfile.zip || ''}`.trim() : 'Company Address';
  const companyPhone = bidAsCarrier?.phone || companyProfile?.phone || '(000) 000-0000';
  const emailSubject = `Order# ${data.order_number || 'N/A'} [${originState} to ${destState}] ${displaySize}${displayType} - $${bidAmount || '0'} -MC ${mcNumber}`;
  const [isSending, setIsSending] = useState(false);

  // Handle sending bid email
  const handleSendBid = async () => {
    if (!toEmail) {
      toast.error('Please enter a recipient email address');
      return;
    }
    if (!bidAmount) {
      toast.error('Please enter a bid amount');
      return;
    }
    setIsSending(true);
    
    const bidRateNum = bidAmount ? parseFloat(bidAmount.replace(/[^0-9.]/g, '')) : 0;
    
    try {
      // Check if a bid already exists for this Load ID (first-bid-wins logic)
      let isDuplicate = false;
      if (email?.load_id) {
        const { data: existingBidCheck } = await supabase
          .from('load_bids')
          .select('id')
          .eq('load_id', email.load_id)
          .eq('status', 'sent')
          .limit(1)
          .maybeSingle();

        isDuplicate = !!existingBidCheck;
      }

      // Only send email if this is NOT a duplicate
      if (!isDuplicate) {
        const {
          data: result,
          error
        } = await supabase.functions.invoke('send-bid-email', {
          body: {
            to: toEmail,
            cc: ccEmail || undefined,
            from_email: dispatcherEmailAddr,
            from_name: dispatcherName,
            subject: emailSubject,
            bid_amount: bidAmount,
            mc_number: mcNumber,
            dot_number: dotNumber,
            order_number: data.order_number || 'N/A',
            origin_city: originCity,
            origin_state: originState,
            dest_city: destCity,
            dest_state: destState,
            vehicle_size: displaySize,
            vehicle_type: displayType,
            vehicle_description: editableVehicleDesc,
            equipment_details: equipmentDetails,
            truck_dimensions: truckDimensions,
            door_dimensions: doorDimensions,
            truck_features: vehicleFeatures,
            dispatcher_name: dispatcherName,
            company_name: companyName,
            company_address: companyAddress,
            company_phone: companyPhone,
            company_logo_url: bidAsCarrier?.logo_url || undefined,
            reference_id: `${email.load_id || email.id?.slice(0, 8) || 'N/A'}-${match?.id ? match.id.slice(0, 8) : 'N/A'}-${vehicle?.vehicle_number || match?.vehicle_id?.slice(0, 8) || 'N/A'}`,
            selected_templates: getSelectedTemplateTexts(),
            contact_first_name: (() => {
              if (data.broker_name) return (data.broker_name || '').split(' ')[0];
              if (data.broker_email) {
                const emailPrefix = (data.broker_email || '').split('@')[0];
                const namePart = emailPrefix.split(/[._-]/)[0];
                if (namePart && namePart.length > 1) {
                  return namePart.charAt(0).toUpperCase() + namePart.slice(1).toLowerCase();
                }
              }
              return undefined;
            })(),
            // Editable body lines
            greeting_line: editableGreeting,
            blank_line: editableBlankLine,
            vehicle_line: editableVehicleDesc,
            help_line: editableHelpLine,
            order_line: editableOrderLine
          }
        });
        if (error) {
          console.error('Error sending bid email:', error);
          toast.error(`Failed to send bid email: ${error.message}`);
          return;
        }
      }
      
      // Play diesel truck acceleration sound
      playTruckSound();
      
      // Show success to dispatcher (they don't need to know if it was a duplicate)
      toast.success('Bid email sent successfully!');
      setShowEmailConfirmDialog(false);
      setBidConfirmed(false);

      // Insert into load_bids - with appropriate status
      if (email?.load_id) {
        const { error: bidError } = await supabase
          .from('load_bids')
          .insert({
            load_id: email.load_id,
            load_email_id: email.id,
            match_id: match?.id,
            vehicle_id: match?.vehicle_id || vehicle?.id,
            dispatcher_id: currentDispatcher?.id,
            carrier_id: bidAsCarrier?.id,
            bid_amount: bidRateNum,
            to_email: toEmail,
            status: isDuplicate ? 'duplicate' : 'sent',
            tenant_id: tenantId!
          });
        
        if (bidError) {
          console.error('Error recording bid:', bidError);
        } else {
          // Update local state
          setExistingBid({
            id: 'just-placed',
            bid_amount: bidRateNum,
            dispatcher_name: currentDispatcher ? `${currentDispatcher.first_name} ${currentDispatcher.last_name}` : undefined,
            vehicle_number: vehicle?.vehicle_number,
            created_at: new Date().toISOString()
          });
        }
      }

      // Record the bid action
      await recordMatchAction('bid', {
        bid_amount: bidAmount,
        to_email: toEmail,
        was_duplicate: isDuplicate
      });

      // Notify parent that bid was placed - move to MY BIDS and skip siblings
      if (onBidPlaced && match?.id && email?.id) {
        onBidPlaced(match.id, email.id, bidRateNum);
      }
      
      // Close the email builder and return to parent view
      onClose();
    } catch (err: any) {
      console.error('Error sending bid email:', err);
      toast.error(`Failed to send bid email: ${err.message || 'Unknown error'}`);
    } finally {
      setIsSending(false);
    }
  };

  // Reusable Email Confirmation Dialog
  const EmailConfirmDialog = <Dialog open={showEmailConfirmDialog} onOpenChange={open => {
    setShowEmailConfirmDialog(open);
    if (!open) setBidConfirmed(false);
  }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto p-0">
        <div className="sticky top-0 z-10 bg-gradient-to-r from-slate-800 to-slate-900 text-white px-4 py-3">
          <DialogTitle className="text-base font-semibold">Confirm Before Sending Bid!</DialogTitle>
        </div>
        
        {/* Existing Bid Warning Banner */}
        {existingBid && (
          <div className="mx-4 mt-3 p-3 bg-amber-50 border border-amber-300 rounded-lg">
            <div className="flex items-start gap-2">
              <span className="text-amber-600 text-lg">⚠️</span>
              <div className="flex-1">
                <p className="text-amber-800 font-semibold text-sm">Bid Already Placed on This Load!</p>
                <p className="text-amber-700 text-xs mt-1">
                  <strong>{existingBid.dispatcher_name || 'A dispatcher'}</strong> already bid{' '}
                  <strong>${existingBid.bid_amount}</strong>
                  {existingBid.vehicle_number && <> for truck <strong>{existingBid.vehicle_number}</strong></>}
                  {' '}on {new Date(existingBid.created_at).toLocaleString()}
                </p>
                <p className="text-amber-600 text-xs mt-1 italic">
                  Sending another bid may cause internal competition.
                </p>
              </div>
            </div>
          </div>
        )}
        
        {/* Action Buttons - Compact */}
        <div className="flex gap-2 px-4 pt-3">
          <button 
            type="button"
            className={`flex-1 flex flex-col items-center py-3 h-auto text-white rounded-xl text-sm font-semibold transition-all duration-200 shadow-lg active:scale-95 ${
              bidConfirmed 
                ? 'bg-gradient-to-b from-gray-300 to-gray-400 shadow-gray-300/50 cursor-not-allowed' 
                : 'bg-gradient-to-b from-emerald-400 to-emerald-600 hover:from-emerald-500 hover:to-emerald-700 shadow-emerald-500/40 hover:shadow-emerald-500/60'
            }`}
            style={{ 
              textShadow: '0 1px 2px rgba(0,0,0,0.2)',
              boxShadow: bidConfirmed 
                ? 'inset 0 1px 0 rgba(255,255,255,0.3), 0 4px 12px rgba(156,163,175,0.4)' 
                : 'inset 0 1px 0 rgba(255,255,255,0.3), 0 4px 12px rgba(16,185,129,0.4)'
            }}
            onClick={() => setBidConfirmed(true)} 
            disabled={bidConfirmed}
          >
            <span className="text-[10px] font-medium opacity-90">Confirm Bid</span>
            <span className="text-base font-bold">$ {bidAmount || '0'}</span>
          </button>
          <button 
            type="button"
            className={`flex-1 h-auto py-3 rounded-xl text-sm font-semibold transition-all duration-200 shadow-lg active:scale-95 ${
              bidConfirmed 
                ? 'bg-gradient-to-b from-emerald-400 to-emerald-600 hover:from-emerald-500 hover:to-emerald-700 text-white shadow-emerald-500/40 hover:shadow-emerald-500/60' 
                : 'bg-gradient-to-b from-gray-200 to-gray-300 text-gray-500 shadow-gray-300/50 cursor-not-allowed'
            }`}
            style={{ 
              textShadow: bidConfirmed ? '0 1px 2px rgba(0,0,0,0.2)' : 'none',
              boxShadow: bidConfirmed 
                ? 'inset 0 1px 0 rgba(255,255,255,0.3), 0 4px 12px rgba(16,185,129,0.4)' 
                : 'inset 0 1px 0 rgba(255,255,255,0.5), 0 4px 12px rgba(156,163,175,0.3)'
            }}
            disabled={!bidConfirmed || isSending} 
            onClick={handleSendBid}
          >
            {isSending ? 'Sending...' : 'Send Bid'}
          </button>
          <button 
            type="button"
            className="flex-1 h-auto py-3 rounded-xl text-sm font-semibold text-white bg-gradient-to-b from-red-400 to-red-600 hover:from-red-500 hover:to-red-700 transition-all duration-200 shadow-lg shadow-red-500/40 hover:shadow-red-500/60 active:scale-95" 
            style={{ 
              textShadow: '0 1px 2px rgba(0,0,0,0.2)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3), 0 4px 12px rgba(239,68,68,0.4)'
            }}
            onClick={() => setShowEmailConfirmDialog(false)} 
            disabled={isSending}
          >
            Cancel
          </button>
        </div>
        
        <div className="px-4 pb-4 pt-2 space-y-3">
          {/* Email Fields - Inline */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Mail To</label>
              <Input value={toEmail || ''} onChange={e => setToEmail(e.target.value)} placeholder="Enter email" className="h-8 text-xs mt-0.5" />
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">CC</label>
              <Input value={ccEmail} onChange={e => setCcEmail(e.target.value)} placeholder="Optional" className="h-8 text-xs mt-0.5" />
            </div>
          </div>
          
          {/* Subject */}
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded px-3 py-2">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Subject</label>
            <p className="text-xs font-medium mt-0.5">{emailSubject}</p>
          </div>
          
          {/* Message Highlights */}
          <div className="flex flex-wrap gap-1.5">
            <span className="bg-yellow-300 text-yellow-900 px-2 py-0.5 rounded text-xs font-bold">Rate: $ {bidAmount || '0'}</span>
            <span className="bg-yellow-300 text-yellow-900 px-2 py-0.5 rounded text-xs font-bold">MC#: {mcNumber}</span>
            <span className="bg-yellow-300 text-yellow-900 px-2 py-0.5 rounded text-xs font-bold">USDOT#: {dotNumber}</span>
          </div>
          
          {/* Message Body - Clean, uniform styling */}
          <div className="space-y-1 text-sm text-foreground">
            <Textarea value={editableGreeting} onChange={e => setEditableGreeting(e.target.value)} className="min-h-[24px] text-sm border-0 bg-transparent resize-none p-0 focus-visible:ring-0" placeholder="Greeting..." rows={1} />
            {/* Only show blank line field if it has content */}
            {editableBlankLine.trim() && <Textarea value={editableBlankLine} onChange={e => setEditableBlankLine(e.target.value)} className="min-h-[24px] text-sm border-0 bg-transparent resize-none p-0 focus-visible:ring-0" rows={1} />}
            <Textarea value={editableVehicleDesc} onChange={e => setEditableVehicleDesc(e.target.value)} className="min-h-[32px] text-sm border-0 bg-transparent resize-none p-0 focus-visible:ring-0" rows={2} />
            <Textarea value={editableHelpLine} onChange={e => setEditableHelpLine(e.target.value)} className="min-h-[24px] text-sm border-0 bg-transparent resize-none p-0 focus-visible:ring-0" rows={1} />
            <Textarea value={editableOrderLine} onChange={e => setEditableOrderLine(e.target.value)} className="min-h-[24px] text-sm border-0 bg-transparent resize-none p-0 focus-visible:ring-0" rows={1} />
            {/* Selected Templates - highlighted to stand out */}
            {getSelectedTemplateTexts().length > 0 && getSelectedTemplateTexts().map((text, idx) => <p key={idx} className="text-sm leading-relaxed bg-amber-100 dark:bg-amber-900/30 text-amber-900 dark:text-amber-100 px-2 py-1 rounded -mx-2">{text}</p>)}
          </div>
          
          {/* Separator line below order number / message body */}
          <div className="border-t border-dashed" />
          
          {/* Truck Specs - Compact Grid */}
          <div className="bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-800/50 dark:to-slate-800/30 rounded p-2.5 text-[11px] space-y-0.5">
            <div className="flex"><span className="font-semibold text-slate-500 dark:text-slate-400 w-28">Truck Carries:</span><span className="text-slate-700 dark:text-slate-300 flex-1">{equipmentDetails}</span></div>
            <div className="flex"><span className="font-semibold text-slate-500 dark:text-slate-400 w-28">Truck Size:</span><span className="text-slate-700 dark:text-slate-300 flex-1">{truckDimensions}</span></div>
            <div className="flex"><span className="font-semibold text-slate-500 dark:text-slate-400 w-28">Door Type:</span><span className="text-slate-700 dark:text-slate-300 flex-1">{doorDimensions}</span></div>
            <div className="flex"><span className="font-semibold text-slate-500 dark:text-slate-400 w-28">Features:</span><span className="text-slate-700 dark:text-slate-300 flex-1">{vehicleFeatures}</span></div>
          </div>
          
          {/* Signature - Compact with logo on right */}
          <div className="flex items-end gap-3 pt-2 border-t border-dashed">
            <div className="text-xs space-y-0.5 flex-1">
              <p className="font-semibold">{dispatcherName}</p>
              <p className="text-muted-foreground">Dispatch • {companyName}</p>
              <p className="font-medium">MC#: {mcNumber} • USDOT#: {dotNumber}</p>
              <p className="text-muted-foreground">{companyAddress}</p>
              <p>Cell: <span className="font-medium">{companyPhone}</span> • {dispatcherEmailAddr}</p>
            </div>
            {bidAsCarrier?.logo_url && (
              <div className="flex items-end justify-start">
                <img src={bidAsCarrier.logo_url} alt={companyName} className="h-14 max-w-[160px] object-contain" />
              </div>
            )}
          </div>
          
          {/* Reference - Subtle */}
          <p className="text-[10px] text-muted-foreground/60">
            Ref: {email.load_id || email.id?.slice(0, 8) || 'N/A'}-{match?.id ? match.id.slice(0, 8) : 'N/A'}-{vehicle?.vehicle_number || match?.vehicle_id?.slice(0, 8) || 'N/A'}
          </p>
        </div>
      </DialogContent>
    </Dialog>;

  // MOBILE LAYOUT
  if (isMobile) {
    return <div className="flex flex-col h-full bg-background">
        {/* Mobile Header */}
        <div className="sticky top-0 z-50 bg-card border-b px-3 py-2">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={onClose} className="h-8 px-2">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <div className="text-sm font-medium">
              {data.order_number ? `#${data.order_number}` : 'Load Details'}
            </div>
            <div className="w-16" />
          </div>
        </div>

        {/* Mobile Tab Navigation */}
        <div className="border-b bg-card px-2 py-1">
          <div className="flex gap-1">
            {[{
            id: 'details',
            label: 'Details',
            icon: Truck
          }, {
            id: 'map',
            label: 'Map',
            icon: MapPin
          }, {
            id: 'bid',
            label: 'Bid',
            icon: DollarSign
          }].map(tab => <Button key={tab.id} size="sm" variant={mobileSection === tab.id ? 'default' : 'ghost'} className="flex-1 h-9 text-xs" onClick={() => setMobileSection(tab.id as any)}>
                <tab.icon className="h-4 w-4 mr-1" />
                {tab.label}
              </Button>)}
          </div>
        </div>

        {/* Mobile Content */}
        <div className="flex-1 overflow-auto p-3">
          {mobileSection === 'details' && <div className="space-y-3">
              {/* Route Summary */}
              <Card className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">Route</span>
                  {data.vehicle_type && (() => {
                    const cleanType = (data.vehicle_type || '').replace(/<[^>]*>/g, '').trim();
                    const truncatedType = cleanType.length > 20 ? cleanType.slice(0, 18) + '…' : cleanType;
                    return (
                      <span className="text-xs font-medium bg-blue-100 text-blue-700 px-2 py-0.5 rounded" title={cleanType.length > 20 ? cleanType : undefined}>
                        {truncatedType}
                      </span>
                    );
                  })()}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    <span className="font-medium">{originCity}, {originState}</span>
                  </div>
                  <span className="text-muted-foreground">→</span>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                    <span className="font-medium">{destCity}, {destState}</span>
                  </div>
                </div>
                <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                  <span>Empty: {emptyDriveDistance ? `${Math.round(emptyDriveDistance)}mi` : '—'}</span>
                  <span>Loaded: {data.loaded_miles ? `${Math.round(data.loaded_miles)}mi` : '—'}</span>
                </div>
              </Card>

              {/* Truck Info */}
              {vehicle && <Card className="p-3">
                  <div className="text-xs text-muted-foreground mb-2">Matched Truck</div>
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 flex-col items-center justify-center rounded-lg bg-blue-100 border border-blue-300">
                      <Truck className="h-5 w-5 text-blue-600" />
                      <div className="text-[10px] font-semibold text-blue-600">{vehicle?.vehicle_number || "N/A"}</div>
                    </div>
                    <div className="flex-1 text-sm">
                      <div className="font-medium">{driver1Name || "No Driver"}</div>
                      <div className="text-xs text-muted-foreground">{carrierName || "No Carrier"}</div>
                    </div>
                  </div>
                </Card>}

              {/* Broker Info */}
              <Card className="p-3">
                <div className="text-xs text-muted-foreground mb-2">Broker</div>
                <div className="text-sm font-medium">{brokerName}</div>
                {toEmail && <div className="text-xs text-muted-foreground mt-1">{toEmail}</div>}
              </Card>

              {/* Posted Rate */}
              <Card className="p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Posted Rate</span>
                  <span className="text-lg font-bold text-green-600">
                    {data.rate ? `$${data.rate.toLocaleString()}` : 'N/A'}
                  </span>
                </div>
              </Card>

              {/* View Original Email */}
              <Button variant="outline" className="w-full" onClick={() => setShowOriginalEmail(true)}>
                <Mail className="h-4 w-4 mr-2" />
                View Original Email
              </Button>
            </div>}

          {mobileSection === 'map' && <Card className="h-[400px] overflow-hidden rounded-md">
              <LoadRouteMap stops={mapStops} />
            </Card>}

          {mobileSection === 'bid' && <div className="space-y-3">
              {/* Bid Input */}
              <Card className="p-4">
                <div className="text-xs text-muted-foreground mb-3">Your Bid</div>
                <div className="flex items-center gap-3 mb-4">
                  <div className={`flex items-center gap-1 ${bidError ? 'bg-destructive' : 'bg-blue-500'} text-white rounded-full h-12 px-4 flex-1`}>
                    <span className="text-xl font-bold">$</span>
                    <input type="text" value={bidAmount} onChange={e => {
                      const val = e.target.value.replace(/[^0-9]/g, '');
                      setBidAmount(val);
                      if (bidError) setBidError(null);
                    }} placeholder={data.rate?.toString() || "0"} className="bg-transparent border-none outline-none text-xl font-bold text-white w-full placeholder:text-white/60" />
                  </div>
                </div>
                <Button onClick={() => {
                  const finalBid = bidAmount || "";
                  const bidValue = parseFloat(finalBid.replace(/[^0-9.]/g, '')) || 0;
                  if (bidValue <= 0) {
                    setBidError("Bid Rate must be more than $0");
                    return;
                  }
                  setBidError(null);
                  
                  // Check if bidding below posted rate (use posted_amount, fallback to rate)
                  const postedRate = parseFloat(String(data.posted_amount || data.rate || '0').replace(/[^0-9.]/g, '')) || 0;
                  if (postedRate > 0 && bidValue < postedRate) {
                    // Show warning dialog
                    setPendingBidAmount(finalBid);
                    setShowLowBidWarning(true);
                    return;
                  }
                  
                  setBidAmount(finalBid);
                  setShowBidCardOnMap(true);
                }} className="w-full bg-green-600 hover:bg-green-700 h-11 font-semibold">
                  Set Bid
                </Button>
                {bidError && (
                  <p className="text-xs text-destructive mt-2">{bidError}</p>
                )}
              </Card>

              {/* Stats */}
              <Card className="p-4">
                <div className="grid grid-cols-3 gap-2 text-center mb-3">
                  <div>
                    <div className="text-[10px] text-muted-foreground">Average</div>
                    <div className="text-sm font-semibold">—</div>
                  </div>
                  <div className="bg-blue-50 rounded p-2">
                    <div className="text-[10px] text-muted-foreground">Bid</div>
                    <div className="text-base font-bold text-blue-600">
                      ${bidAmount || data.rate || '1,282'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground">Booked</div>
                    <div className="text-sm font-semibold">N/A</div>
                  </div>
                </div>

                <div className="space-y-2 text-sm border-t pt-3">
                  <div className="flex justify-between">
                    <span>Loaded Miles</span>
                    <span className="font-semibold">{data.loaded_miles || 375}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total Miles</span>
                    <span className="font-semibold">
                      {Math.round((data.loaded_miles || 375) + (emptyDriveDistance || 0))}
                    </span>
                  </div>
                </div>
              </Card>

              {/* Actions */}
              <div className="grid grid-cols-2 gap-2">
                <Button variant="destructive" onClick={handleSkip}>
                  Skip
                </Button>
                <Button className="bg-blue-500 hover:bg-blue-600" onClick={handleUndecided}>
                  Undecided
                </Button>
                <Button className="bg-blue-500 hover:bg-blue-600" onClick={handleWait}>
                  Wait
                </Button>
                <Button variant="outline" onClick={handleMarkUnreviewed}>
                  Mark Unreviewed
                </Button>
              </div>
            </div>}
        </div>

        {/* Original Email Sheet for Mobile */}
        {showOriginalEmail && <div className="fixed inset-0 z-50 bg-background animate-in slide-in-from-bottom">
            <div className="sticky top-0 bg-background border-b p-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Original Email</h2>
              <Button variant="ghost" size="icon" onClick={() => setShowOriginalEmail(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="p-3 overflow-auto h-[calc(100vh-60px)]">
              <div className="space-y-3">
                <div className="text-sm">
                  <span className="font-semibold">From:</span> {email.from_name || email.from_email}
                </div>
                <div className="text-sm">
                  <span className="font-semibold">Subject:</span> {email.subject || 'No subject'}
                </div>
                <div className="border-t pt-3">
                  {emailBody ? <iframe srcDoc={emailBody.toLowerCase().includes("<html") ? emailBody : `<!DOCTYPE html><html><head><meta charset="UTF-8" /></head><body>${emailBody}</body></html>`} className="w-full h-[500px] border rounded-md bg-background" title="Email Content" /> : <p className="text-muted-foreground">No email content available</p>}
                </div>
              </div>
            </div>
          </div>}

        {/* Bid Card Sheet for Mobile */}
        {showBidCardOnMap && <div className="fixed inset-0 z-50 bg-background animate-in slide-in-from-bottom flex flex-col">
            <div className="bg-background border-b p-3 flex items-center justify-between flex-shrink-0">
              <h3 className="text-lg font-semibold">Email Builder</h3>
              <Button variant="ghost" size="icon" onClick={() => setShowBidCardOnMap(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="flex-1 overflow-auto p-3 pb-20">
              <div className="space-y-3">
                <Card className="p-3">
                  <div className="text-xs text-muted-foreground mb-1">To:</div>
                  <Input value={toEmail || ''} onChange={e => setToEmail(e.target.value)} placeholder="Enter email address" className="h-8 text-sm" />
                </Card>
                <Card className="p-3">
                  <div className="text-xs text-muted-foreground mb-1">CC:</div>
                  <Input value={ccEmail} onChange={e => setCcEmail(e.target.value)} placeholder="Add CC email (optional)" className="h-8 text-sm" />
                </Card>
                <Card className="p-3">
                  <div className="text-xs text-muted-foreground mb-1">Subject:</div>
                  <div className="text-sm">
                    Order# {data.order_number || 'N/A'} [{originState} to {destState}] {displaySize}{displayType} - ${bidAmount || '0'} -MC {mcNumber}
                  </div>
                </Card>
                <Card className="p-3 text-sm space-y-2">
                  <Textarea value={editableGreeting} onChange={e => setEditableGreeting(e.target.value)} className="min-h-[28px] text-sm border-dashed resize-none" rows={1} />
                  <Textarea value={editableBlankLine} onChange={e => setEditableBlankLine(e.target.value)} className="min-h-[28px] text-sm border-dashed resize-none" placeholder="(Optional text)" rows={1} />
                  <Textarea value={editableVehicleDesc} onChange={e => setEditableVehicleDesc(e.target.value)} className="min-h-[28px] text-sm border-dashed resize-none" rows={2} />
                  <Textarea value={editableHelpLine} onChange={e => setEditableHelpLine(e.target.value)} className="min-h-[28px] text-sm text-blue-600 border-dashed resize-none" rows={1} />
                  <Textarea value={editableOrderLine} onChange={e => setEditableOrderLine(e.target.value)} className="min-h-[28px] text-sm text-blue-600 border-dashed resize-none" rows={1} />
                  <div className="bg-slate-50 p-2 rounded mt-2 text-xs">
                    <p><strong>We have:</strong> {equipmentDetails}</p>
                    <p><strong>Truck Dimension:</strong> {truckDimensions}</p>
                    <p><strong>Door:</strong> {doorDimensions}</p>
                    <p><strong>Features:</strong> {vehicleFeatures}</p>
                  </div>
                </Card>
                
                {/* Selectable Templates for Mobile */}
                <Card className="p-3">
                  <p className="text-xs text-muted-foreground font-medium flex items-center gap-1 mb-3">
                    <Check className="w-3 h-3" /> Select templates to include (tap to toggle, hold to edit)
                  </p>
                  
                  {/* Nearby Template */}
                  <div className={`px-3 py-2.5 rounded-lg cursor-pointer border transition-all flex items-start gap-2 mb-2 ${selectedTemplates.nearby ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-400 shadow-sm ring-1 ring-blue-200' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'}`} onClick={() => handleTemplateToggle('nearby')} onDoubleClick={() => setEditingTemplate('nearby')}>
                    <div className={`w-4 h-4 mt-0.5 rounded flex items-center justify-center flex-shrink-0 transition-colors ${selectedTemplates.nearby ? 'bg-blue-500' : 'border-2 border-slate-300 bg-white'}`}>
                      {selectedTemplates.nearby && <Check className="w-3 h-3 text-white" />}
                    </div>
                    {editingTemplate === 'nearby' ? <textarea className="w-full text-sm bg-white border rounded p-1 min-h-[50px]" value={templateTexts.nearby} onChange={e => handleTemplateTextChange('nearby', e.target.value)} onBlur={() => setEditingTemplate(null)} onClick={e => e.stopPropagation()} autoFocus /> : <p className="text-sm flex-1 leading-relaxed">{getRenderedTemplate('nearby')}</p>}
                  </div>
                  
                  {/* Driver Template */}
                  <div className={`px-3 py-2.5 rounded-lg cursor-pointer border transition-all flex items-start gap-2 mb-2 ${selectedTemplates.driver ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-400 shadow-sm ring-1 ring-blue-200' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'}`} onClick={() => handleTemplateToggle('driver')} onDoubleClick={() => setEditingTemplate('driver')}>
                    <div className={`w-4 h-4 mt-0.5 rounded flex items-center justify-center flex-shrink-0 transition-colors ${selectedTemplates.driver ? 'bg-blue-500' : 'border-2 border-slate-300 bg-white'}`}>
                      {selectedTemplates.driver && <Check className="w-3 h-3 text-white" />}
                    </div>
                    {editingTemplate === 'driver' ? <textarea className="w-full text-sm bg-white border rounded p-1 min-h-[50px]" value={templateTexts.driver} onChange={e => handleTemplateTextChange('driver', e.target.value)} onBlur={() => setEditingTemplate(null)} onClick={e => e.stopPropagation()} autoFocus /> : <p className="text-sm flex-1 leading-relaxed">{getRenderedTemplate('driver')}</p>}
                  </div>
                  
                  {/* Fuel Template */}
                  <div className={`px-3 py-2.5 rounded-lg cursor-pointer border transition-all flex items-start gap-2 ${selectedTemplates.fuel ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-400 shadow-sm ring-1 ring-blue-200' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'}`} onClick={() => handleTemplateToggle('fuel')} onDoubleClick={() => setEditingTemplate('fuel')}>
                    <div className={`w-4 h-4 mt-0.5 rounded flex items-center justify-center flex-shrink-0 transition-colors ${selectedTemplates.fuel ? 'bg-blue-500' : 'border-2 border-slate-300 bg-white'}`}>
                      {selectedTemplates.fuel && <Check className="w-3 h-3 text-white" />}
                    </div>
                    {editingTemplate === 'fuel' ? <textarea className="w-full text-sm bg-white border rounded p-1 min-h-[50px]" value={templateTexts.fuel} onChange={e => handleTemplateTextChange('fuel', e.target.value)} onBlur={() => setEditingTemplate(null)} onClick={e => e.stopPropagation()} autoFocus /> : <p className="text-sm flex-1 leading-relaxed">{getRenderedTemplate('fuel')}</p>}
                  </div>
                </Card>
              </div>
            </div>
            {/* Sticky Footer with Action Buttons */}
            <div className="fixed bottom-0 left-0 right-0 bg-background border-t p-3 safe-area-bottom">
              <div className={`grid gap-2 ${portalBidUrl ? 'grid-cols-4' : 'grid-cols-3'}`}>
                <Button 
                  size="sm" 
                  variant={isDoNotReplyEmail ? "secondary" : "default"}
                  className="h-11"
                  onClick={() => setShowEmailConfirmDialog(true)}
                >
                  Email Bid
                </Button>
                <Button size="sm" className="bg-orange-500 hover:bg-orange-600 h-11">
                  Place Bid
                </Button>
                <Button size="sm" className="bg-green-600 hover:bg-green-700 h-11">
                  Book
                </Button>
                {portalBidUrl && (
                  <Button 
                    size="sm" 
                    className={`bg-purple-600 hover:bg-purple-700 h-11 ${isDoNotReplyEmail ? 'animate-portal-flash' : ''}`} 
                    onClick={() => window.open(portalBidUrl, '_blank', 'noopener,noreferrer')}
                  >
                    Portal
                  </Button>
                )}
              </div>
            </div>
          </div>}


        {EmailConfirmDialog}
      </div>;
  }

  // DESKTOP LAYOUT (original)
  return <>
    <div className="flex-1 overflow-auto relative">
      {/* Original Email Sidebar - Left half when both open, or full left half */}
      {showOriginalEmail && <div className={`absolute left-0 top-0 bottom-0 ${showBidCardOnMap ? 'w-1/2' : 'w-1/2'} bg-background z-50 shadow-2xl border-r animate-in slide-in-from-left duration-300 flex flex-col`}>
          <div className="sticky top-0 bg-background border-b p-4 flex items-center justify-between z-10 flex-shrink-0">
            <h2 className="text-lg font-semibold">Original Email</h2>
            <Button variant="ghost" size="icon" onClick={() => setShowOriginalEmail(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-4">
              <div>
                <div className="text-sm font-semibold mb-1">From:</div>
                <div className="text-sm text-muted-foreground">{email.from_name || email.from_email}</div>
              </div>
              <div>
                <div className="text-sm font-semibold mb-1">Subject:</div>
                <div className="text-sm text-muted-foreground">{email.subject || 'No subject'}</div>
              </div>
              <div>
                <div className="text-sm font-semibold mb-1">Received:</div>
                <div className="text-sm text-muted-foreground">{new Date(email.received_at).toLocaleString()}</div>
              </div>
              <div className="border-t pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Email Content:</div>
                  <Button variant="outline" size="sm" onClick={() => {
                  if (!emailBody) return;
                  const blob = new Blob([emailBody], {
                    type: "text/html;charset=utf-8"
                  });
                  const url = URL.createObjectURL(blob);
                  window.open(url, "_blank", "noopener,noreferrer");
                }}>
                    Open in new tab
                  </Button>
                </div>
                {(() => {
                if (!emailBody) {
                  return <div className="text-sm text-muted-foreground">No email content available</div>;
                }
                const hasHtmlTag = emailBody.toLowerCase().includes("<html");
                const docHtml = hasHtmlTag ? emailBody : `<!DOCTYPE html><html><head><meta charset="UTF-8" /></head><body>${emailBody}</body></html>`;
                return <div className="space-y-2">
                      <iframe srcDoc={docHtml} className="w-full h-[600px] border rounded-md bg-background" title="Email Content" />
                      <details className="text-[10px] bg-muted rounded border max-h-[200px] overflow-auto">
                        <summary className="cursor-pointer px-2 py-1 font-semibold">
                          View raw source
                        </summary>
                        <pre className="whitespace-pre-wrap font-mono px-2 pb-2">
                          {emailBody.slice(0, 4000)}
                        </pre>
                      </details>
                    </div>;
              })()}
              </div>
            </div>
          </div>
        </div>}

      {/* Bid Email Sidebar - Right half, shows alongside Original Email */}
      {showBidCardOnMap && <div className={`absolute right-0 top-0 bottom-0 w-1/2 bg-background z-50 shadow-2xl border-l animate-in slide-in-from-right duration-300 flex flex-col`}>
          <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-3 flex items-center justify-between z-10 flex-shrink-0">
            <h3 className="text-lg font-semibold">Email Builder</h3>
            <Button variant="ghost" size="icon" className="text-white/80 hover:text-white hover:bg-white/20" onClick={() => setShowBidCardOnMap(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-3">
              {/* Email Fields Row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">To</label>
                  <Input value={toEmail || ''} onChange={e => setToEmail(e.target.value)} placeholder="Enter email" className="h-9 text-sm mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">CC</label>
                  <Input value={ccEmail} onChange={e => setCcEmail(e.target.value)} placeholder="Optional" className="h-9 text-sm mt-1" />
                </div>
              </div>
              
              {/* Subject */}
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg px-4 py-3">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Subject</label>
                <p className="text-sm font-medium text-foreground mt-1 leading-relaxed">
                  Order# {data.order_number || 'N/A'} [{originState} to {destState}] {displaySize}{displayType} - ${bidAmount || '0'} -MC {mcNumber}
                </p>
              </div>
              
              {/* Message Body - Editable Fields */}
              <div className="border rounded-lg p-3 space-y-2 bg-white dark:bg-slate-900">
                <Textarea value={editableGreeting} onChange={e => setEditableGreeting(e.target.value)} className="min-h-[32px] text-sm border-0 border-b border-dashed bg-transparent resize-none p-1 focus-visible:ring-0 focus-visible:border-blue-400" rows={1} />
                <Textarea value={editableBlankLine} onChange={e => setEditableBlankLine(e.target.value)} className="min-h-[32px] text-sm border-0 border-b border-dashed bg-transparent resize-none p-1 focus-visible:ring-0 focus-visible:border-blue-400 text-muted-foreground" placeholder="(Add optional text here...)" rows={1} />
                <Textarea value={editableVehicleDesc} onChange={e => setEditableVehicleDesc(e.target.value)} className="min-h-[48px] text-sm border-0 border-b border-dashed bg-transparent resize-none p-1 focus-visible:ring-0 focus-visible:border-blue-400" rows={2} />
                <Textarea value={editableHelpLine} onChange={e => setEditableHelpLine(e.target.value)} className="min-h-[32px] text-sm border-0 border-b border-dashed bg-transparent resize-none p-1 focus-visible:ring-0 focus-visible:border-blue-400" rows={1} />
                <Textarea value={editableOrderLine} onChange={e => setEditableOrderLine(e.target.value)} className="min-h-[32px] text-sm border-0 bg-transparent resize-none p-1 focus-visible:ring-0" rows={1} />
              </div>
              
              {/* Truck Specs */}
              <div className="bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-800/50 dark:to-slate-800/30 rounded-lg p-3 text-sm space-y-1">
                <div className="flex"><span className="font-bold text-slate-700 dark:text-slate-300 w-32">We have:</span><span className="text-slate-700 dark:text-slate-300 flex-1">{equipmentDetails}</span></div>
                <div className="flex"><span className="font-bold text-slate-700 dark:text-slate-300 w-32">Truck Dimension:</span><span className="text-slate-700 dark:text-slate-300 flex-1">{truckDimensions}</span></div>
                <div className="flex"><span className="font-bold text-slate-700 dark:text-slate-300 w-32">Door:</span><span className="text-slate-700 dark:text-slate-300 flex-1">{doorDimensions}</span></div>
                <div className="flex"><span className="font-bold text-slate-700 dark:text-slate-300 w-32">Features:</span><span className="text-slate-700 dark:text-slate-300 flex-1">{vehicleFeatures}</span></div>
              </div>
              
              {/* Selectable Templates */}
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                  <Check className="w-3 h-3" /> Select templates to include (double-click to edit)
                </p>
                
                {/* Nearby Template */}
                <div className={`px-3 py-2.5 rounded-lg cursor-pointer border transition-all flex items-start gap-2 ${selectedTemplates.nearby ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-400 shadow-sm ring-1 ring-blue-200' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-blue-300 hover:shadow-sm'}`} onClick={() => handleTemplateToggle('nearby')} onDoubleClick={() => setEditingTemplate('nearby')}>
                  <div className={`w-4 h-4 mt-0.5 rounded flex items-center justify-center flex-shrink-0 transition-colors ${selectedTemplates.nearby ? 'bg-blue-500' : 'border-2 border-slate-300 bg-white'}`}>
                    {selectedTemplates.nearby && <Check className="w-3 h-3 text-white" />}
                  </div>
                  {editingTemplate === 'nearby' ? <textarea className="w-full text-sm bg-white border rounded p-1 min-h-[50px]" value={templateTexts.nearby} onChange={e => handleTemplateTextChange('nearby', e.target.value)} onBlur={() => setEditingTemplate(null)} onClick={e => e.stopPropagation()} autoFocus /> : <p className="text-sm flex-1 leading-relaxed">{getRenderedTemplate('nearby')}</p>}
                </div>
                
                {/* Driver Template */}
                <div className={`px-3 py-2.5 rounded-lg cursor-pointer border transition-all flex items-start gap-2 ${selectedTemplates.driver ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-400 shadow-sm ring-1 ring-blue-200' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-blue-300 hover:shadow-sm'}`} onClick={() => handleTemplateToggle('driver')} onDoubleClick={() => setEditingTemplate('driver')}>
                  <div className={`w-4 h-4 mt-0.5 rounded flex items-center justify-center flex-shrink-0 transition-colors ${selectedTemplates.driver ? 'bg-blue-500' : 'border-2 border-slate-300 bg-white'}`}>
                    {selectedTemplates.driver && <Check className="w-3 h-3 text-white" />}
                  </div>
                  {editingTemplate === 'driver' ? <textarea className="w-full text-sm bg-white border rounded p-1 min-h-[50px]" value={templateTexts.driver} onChange={e => handleTemplateTextChange('driver', e.target.value)} onBlur={() => setEditingTemplate(null)} onClick={e => e.stopPropagation()} autoFocus /> : <p className="text-sm flex-1 leading-relaxed">{getRenderedTemplate('driver')}</p>}
                </div>
                
                {/* Fuel Template */}
                <div className={`px-3 py-2.5 rounded-lg cursor-pointer border transition-all flex items-start gap-2 ${selectedTemplates.fuel ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-400 shadow-sm ring-1 ring-blue-200' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-blue-300 hover:shadow-sm'}`} onClick={() => handleTemplateToggle('fuel')} onDoubleClick={() => setEditingTemplate('fuel')}>
                  <div className={`w-4 h-4 mt-0.5 rounded flex items-center justify-center flex-shrink-0 transition-colors ${selectedTemplates.fuel ? 'bg-blue-500' : 'border-2 border-slate-300 bg-white'}`}>
                    {selectedTemplates.fuel && <Check className="w-3 h-3 text-white" />}
                  </div>
                  {editingTemplate === 'fuel' ? <textarea className="w-full text-sm bg-white border rounded p-1 min-h-[50px]" value={templateTexts.fuel} onChange={e => handleTemplateTextChange('fuel', e.target.value)} onBlur={() => setEditingTemplate(null)} onClick={e => e.stopPropagation()} autoFocus /> : <p className="text-sm flex-1 leading-relaxed">{getRenderedTemplate('fuel')}</p>}
                </div>
              </div>
            </div>
          </div>
          
          {/* Existing Bid Warning Banner */}
          {existingBid && (
            <div className="mx-4 mt-2 p-2 bg-amber-50 border border-amber-300 rounded-lg">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-amber-600">⚠️</span>
                <span className="text-amber-800">
                  <strong>{existingBid.dispatcher_name || 'Someone'}</strong> already bid <strong>${existingBid.bid_amount}</strong>
                  {existingBid.vehicle_number && <> for <strong>{existingBid.vehicle_number}</strong></>}
                </span>
              </div>
            </div>
          )}
          
          {/* Action Buttons - Sticky Footer */}
          <div className="border-t bg-slate-50 dark:bg-slate-800/50 px-4 py-3 flex gap-2">
            <button 
              type="button"
              className={`flex-1 h-11 px-4 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all duration-200 active:scale-95 ${
                existingBid 
                  ? 'bg-gradient-to-b from-amber-400 to-amber-600 hover:from-amber-500 hover:to-amber-700' 
                  : 'bg-gradient-to-b from-emerald-400 to-emerald-600 hover:from-emerald-500 hover:to-emerald-700'
              }`}
              style={{ 
                textShadow: '0 1px 2px rgba(0,0,0,0.2)',
                boxShadow: existingBid 
                  ? 'inset 0 1px 0 rgba(255,255,255,0.3), 0 4px 12px rgba(245,158,11,0.4)'
                  : 'inset 0 1px 0 rgba(255,255,255,0.3), 0 4px 12px rgba(16,185,129,0.4)'
              }}
              onClick={() => setShowEmailConfirmDialog(true)}
            >
              <Mail className="w-4 h-4" />
              {existingBid ? '⚠️ Email Bid' : 'Email Bid'}
            </button>
            <button 
              type="button"
              className="flex-1 h-11 px-4 rounded-xl text-sm font-semibold text-white flex items-center justify-center transition-all duration-200 active:scale-95 bg-gradient-to-b from-blue-400 to-blue-600 hover:from-blue-500 hover:to-blue-700"
              style={{ 
                textShadow: '0 1px 2px rgba(0,0,0,0.2)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3), 0 4px 12px rgba(59,130,246,0.4)'
              }}
            >
              Mark as: Bid placed
            </button>
            <button 
              type="button"
              className="flex-1 h-11 px-4 rounded-xl text-sm font-semibold text-white flex items-center justify-center transition-all duration-200 active:scale-95 bg-gradient-to-b from-emerald-400 to-emerald-600 hover:from-emerald-500 hover:to-emerald-700"
              style={{ 
                textShadow: '0 1px 2px rgba(0,0,0,0.2)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3), 0 4px 12px rgba(16,185,129,0.4)'
              }}
            >
              Book Load
            </button>
            {portalBidUrl && (
              <Button 
                size="sm" 
                className={`flex-1 bg-purple-600 hover:bg-purple-700 h-10 font-semibold shadow-sm ${isDoNotReplyEmail ? 'animate-portal-flash' : ''}`} 
                onClick={() => window.open(portalBidUrl, '_blank', 'noopener,noreferrer')}
              >
                Bid on Portal
              </Button>
            )}
          </div>
        </div>}

      
      <div className="flex gap-2 p-2">
        {/* LEFT SIDE - Load Details + Stats + Map */}
        <div className="flex-1 space-y-2">
          <div className="flex gap-2">
            {/* Load Details Card */}
            <div className="flex-1">
              <Card className="border rounded-md overflow-hidden h-full pb-0">
                {/* HEADER */}
                <div className="flex items-center border-b p-2 bg-slate-50">
                  <div 
                    className={`flex items-center gap-2 flex-1 ${onShowAlternativeMatches ? 'cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg p-1 -m-1 transition-colors' : ''}`}
                    onClick={onShowAlternativeMatches}
                    title={onShowAlternativeMatches ? "Click to view/change vehicle selection" : undefined}
                  >
                    <div className="flex items-center gap-2.5 bg-gradient-to-r from-blue-50 to-slate-50 dark:from-blue-950/30 dark:to-slate-900/50 border border-blue-200 dark:border-blue-800 rounded-lg px-2.5 py-1.5 shadow-sm">
                      {/* Truck Icon & Number */}
                      <div className="flex items-center gap-1.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-500 shadow">
                          <Truck className="h-4 w-4 text-white" />
                        </div>
                        <div className="flex flex-col">
                          <div className="text-xs font-bold text-blue-700 dark:text-blue-400 leading-tight">{vehicle?.vehicle_number || "N/A"}</div>
                          <div className="text-[9px] font-medium text-red-500">Empty</div>
                        </div>
                      </div>
                      
                      <div className="w-px h-6 bg-slate-300 dark:bg-slate-600" />
                      
                      {/* Drivers - Stacked */}
                      <div className="flex flex-col gap-0 text-[10px] leading-tight">
                        <div className="flex items-center gap-1">
                          <span className="inline-flex items-center justify-center h-3.5 w-3.5 rounded-full bg-blue-500 text-white text-[8px] font-bold shrink-0">1</span>
                          <span className="font-medium text-slate-700 dark:text-slate-300">{driver1Name || "—"}</span>
                          {driver1?.vehicle_note && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-destructive font-bold max-w-[400px] truncate inline-block align-middle cursor-help">
                                    ⚠ {driver1.vehicle_note}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="max-w-[300px]">
                                  <p className="text-sm">{driver1.vehicle_note}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="inline-flex items-center justify-center h-3.5 w-3.5 rounded-full bg-slate-400 text-white text-[8px] font-bold shrink-0">2</span>
                          <span className="font-medium text-slate-700 dark:text-slate-300">{driver2Name || "—"}</span>
                          {driver2?.vehicle_note && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-destructive font-bold max-w-[400px] truncate inline-block align-middle cursor-help">
                                    ⚠ {driver2.vehicle_note}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="max-w-[300px]">
                                  <p className="text-sm">{driver2.vehicle_note}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Match ID and History - moved left */}
                  <div className="flex items-center gap-6">
                    <div>
                      <div className="text-[13px] font-bold mb-0.5">Match ID: {match?.id?.substring(0, 8) || "N/A"}</div>
                      <button className="text-[10px] text-blue-500 hover:underline flex items-center gap-1" onClick={() => {
                        fetchMatchHistory();
                        setShowMatchHistory(true);
                      }}>
                        <History className="h-3 w-3" />
                        View Match History
                      </button>
                    </div>
                  </div>

                  {/* Other viewers indicator - moved right */}
                  {otherViewers.length > 0 && (
                    <HoverCard>
                      <HoverCardTrigger asChild>
                        <div className="flex items-center gap-1 bg-amber-100 text-amber-800 px-2 py-1 rounded-md cursor-pointer hover:bg-amber-200 transition-colors">
                          <Eye className="h-3.5 w-3.5 shrink-0" />
                          <div className="flex items-center -space-x-2">
                            {otherViewers.slice(0, 2).map((viewer, idx) => (
                              <div 
                                key={viewer.email} 
                                className="h-5 w-5 rounded-full bg-amber-600 text-white flex items-center justify-center text-[9px] font-bold border-2 border-amber-100"
                                style={{ zIndex: 2 - idx }}
                                title={viewer.name}
                              >
                                {viewer.name.charAt(0).toUpperCase()}
                              </div>
                            ))}
                            {otherViewers.length > 2 && (
                              <div 
                                className="h-5 w-5 rounded-full bg-amber-800 text-white flex items-center justify-center text-[9px] font-bold border-2 border-amber-100"
                                style={{ zIndex: 0 }}
                              >
                                +{otherViewers.length - 2}
                              </div>
                            )}
                          </div>
                          <span className="text-[10px] font-medium ml-1">
                            {otherViewers.length === 1 ? 'viewing' : 'viewing'}
                          </span>
                        </div>
                      </HoverCardTrigger>
                      <HoverCardContent className="w-48 p-2 bg-popover" align="end">
                        <div className="text-xs font-semibold mb-2 text-foreground">Currently Viewing</div>
                        <div className="space-y-1.5">
                          {otherViewers.map((viewer) => (
                            <div key={viewer.email} className="flex items-center gap-2">
                              <div className="h-6 w-6 rounded-full bg-amber-600 text-white flex items-center justify-center text-[10px] font-bold">
                                {viewer.name.charAt(0).toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-[11px] font-medium truncate text-foreground">{viewer.name}</div>
                                <div className="text-[9px] text-muted-foreground truncate">{viewer.email}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </HoverCardContent>
                    </HoverCard>
                  )}
                </div>

                {/* CARRIER ROWS */}
                <div className="border-b">
                  <div className="grid grid-cols-[2fr,1.4fr,1.2fr,1fr,1fr,1fr] px-2 py-1.5 text-[11px] gap-x-2">
                    <button 
                      className={`px-3 py-1.5 font-bold text-sm flex items-center rounded-lg truncate shadow-md cursor-pointer transition-all duration-200 hover:scale-[1.02] hover:shadow-lg active:scale-[0.98] ${hasCarrierSafetyIssue ? 'bg-gradient-to-b from-red-100 to-red-200 text-red-800 border border-red-300 hover:from-red-150 hover:to-red-250' : 'bg-gradient-to-b from-green-100 to-green-200 text-green-800 border border-green-300 hover:from-green-150 hover:to-green-250'}`}
                      style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6), 0 2px 4px rgba(0,0,0,0.1)' }}
                      title={carrierName || "No Carrier"}
                    >
                      {carrierName || "No Carrier"}
                    </button>
                    <div className="text-blue-800 font-bold">
                      <div>Pickup Time</div>
                      <div>Delivery Time</div>
                    </div>
                    <div className="text-blue-800 font-bold">
                      <div>Origin</div>
                      <div>Destination</div>
                    </div>
                    <div className="text-blue-800 font-bold">
                      <div>Empty Drive</div>
                      <div>Loaded Drive</div>
                    </div>
                    <div className="text-blue-800 font-bold">
                      <div>Load Type</div>
                      <div>Weight</div>
                    </div>
                    <div className="text-blue-800 font-bold">
                      <div>Pieces</div>
                      <div>Dimensions</div>
                    </div>
                  </div>
                </div>

                <div className="border-b">
                  <div className="grid grid-cols-[2fr,1.4fr,1.2fr,1fr,1fr,1fr] px-2 py-1.5 text-[11px] gap-x-2">
                    <div className="flex items-center gap-2">
                      <BrokerCreditPopover
                        customerName={fullBrokerName}
                        truncatedName={brokerName}
                        mcNumber={data.mc_number || data.broker_mc}
                        loadEmailId={email.id}
                        parsedData={{
                          broker_address: data.broker_address,
                          broker_city: data.broker_city,
                          broker_state: data.broker_state,
                          broker_zip: data.broker_zip,
                        }}
                      />
                    </div>
                    <div>
                      <div>   11/30/25 Sun 17:00 EST</div>
                      <div>   12/01/25 Mon 09:00 EST</div>
                    </div>
                    <div>
                      <div><span className="text-orange-500 font-bold">P</span> {originCity}, {originState}</div>
                      <div><span className="text-blue-500 font-bold">D</span> {destCity}, {destState}</div>
                    </div>
                    <div className="text-green-600">
                      <div>{emptyDriveDistance !== undefined && emptyDriveDistance !== null ? `${Math.round(emptyDriveDistance)}mi` : data.empty_miles !== null && data.empty_miles !== undefined ? `${Math.round(data.empty_miles)}mi` : '—'}</div>
                      <div>{data.loaded_miles ? `${Math.round(data.loaded_miles)}mi` : '—'}</div>
                    </div>
                    <div>
                      {(() => {
                        const cleanType = (data.vehicle_type || 'SPRINTER').replace(/<[^>]*>/g, '').trim();
                        const truncatedType = cleanType.length > 18 ? cleanType.slice(0, 16) + '…' : cleanType;
                        return <div title={cleanType.length > 18 ? cleanType : undefined}>{truncatedType}</div>;
                      })()}
                      <div>{data.weight || '0'}</div>
                    </div>
                    <div>
                      <div>{data?.pieces || '0'}</div>
                      <div>{data?.dimensions || 'N/A'}</div>
                    </div>
                  </div>
                </div>

                {/* ORIGINAL POST */}
                <div className="flex items-center gap-2 px-3 py-1.5">
                  <div className="flex-1 border rounded-lg px-3 py-1.5 text-[11px] flex items-center gap-4">
                    <div className="font-semibold text-blue-600 shrink-0">Original Post</div>
                    <div>
                      <span className="text-muted-foreground">Notes:</span>{' '}
                      <span className="text-red-600 font-bold">{data.notes || ''}</span>
                    </div>
                  </div>
                </div>

                {/* VEHICLE */}
                <div className="flex items-center gap-2 px-3 py-1.5">
                  <div className="flex-1 border rounded-lg px-3 py-1.5 text-[11px] flex items-center gap-4">
                    <div className="font-semibold text-blue-600 shrink-0">Vehicle</div>
                    <div className="text-muted-foreground">
                      <span>         Note:</span>{' '}
                      <span className={vehicle?.notes ? "text-destructive font-bold" : ""}>{vehicle?.notes || ''}</span>
                    </div>
                  </div>
                  <Button className="bg-orange-500 hover:bg-orange-600 h-6 px-2 text-[10px] font-semibold shrink-0" onClick={() => setShowOriginalEmail(true)}>
                    Original Email
                  </Button>
                </div>
              </Card>
            </div>

            {/* Stats & Actions Card */}
            <div className="w-[280px]">
              <Card className="p-2 h-full flex flex-col justify-between shadow-md">
                <div>
                  {/* Posted Rate/Average Bid/Average Booked Row */}
                  <div className="grid grid-cols-3 gap-1 text-center mb-2 pb-2 border-b">
                    <div>
                      <div className="text-[10px] text-muted-foreground">Posted Rate</div>
                      <div className="text-xs font-semibold text-red-500">
                        {data.posted_amount ? `$${data.posted_amount.toLocaleString()}` : '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted-foreground">Average Bid</div>
                      <div className="text-xs font-semibold">
                        {loadingAverageBid ? '...' : averageLaneBid ? `$${averageLaneBid.toLocaleString()}` : '—'}
                      </div>
                    </div>
                    <div className="bg-blue-50 px-1 py-0.5 rounded">
                      <div className="text-[10px] text-muted-foreground">Average Booked</div>
                      <div className="text-sm font-bold text-blue-600">${data.rate ? data.rate.toLocaleString() : '1,282'}</div>
                    </div>
                  </div>

                  {/* Miles and Costs */}
                  <div className="space-y-1 mb-2 text-xs">
                    <div className="flex justify-end text-[10px] text-muted-foreground">[$/mi]</div>
                    {(() => {
                      const loadedMiles = data.loaded_miles || 375;
                      const totalMiles = Math.round(loadedMiles + (emptyDriveDistance || 0));
                      const currentBid = parseFloat(bidAmount) || 0;
                      const loadedPerMile = currentBid > 0 ? (currentBid / loadedMiles).toFixed(2) : '—';
                      const totalPerMile = currentBid > 0 ? (currentBid / totalMiles).toFixed(2) : '—';
                      return (
                        <>
                          <div className="flex justify-between items-center">
                            <span className="font-medium">Loaded Miles</span>
                            <div className="flex gap-3 items-center">
                              <span className="font-semibold">{loadedMiles}</span>
                              <span className="text-blue-600 font-semibold w-12 text-right">{currentBid > 0 ? `$${loadedPerMile}` : '—'}</span>
                            </div>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="font-medium">Total Miles</span>
                            <div className="flex gap-3 items-center">
                              <span className="font-semibold">{totalMiles}</span>
                              <span className="text-blue-600 font-semibold w-12 text-right">{currentBid > 0 ? `$${totalPerMile}` : '—'}</span>
                            </div>
                          </div>
                          <div className="flex justify-between items-center pb-1 border-b">
                            <span className="font-medium">Fuel, Tolls and Driver</span>
                            <div className="flex gap-3 items-center">
                              <span className="font-semibold">$0.00</span>
                              <span className="text-blue-600 font-semibold w-12 text-right">$0.00</span>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  {/* Bid Input and Button */}
                  <div className="flex flex-col gap-1 mb-2 pb-2 border-b">
                    <div className={`flex items-center flex-1 border rounded-full overflow-hidden bg-background ${bidError ? 'border-destructive border-2' : ''}`}>
                      <div className={`flex items-center justify-center w-7 h-7 ${bidError ? 'bg-destructive' : 'bg-blue-500'} rounded-full m-0.5`}>
                        <span className="text-sm font-bold text-white">$</span>
                      </div>
                      <input type="text" value={bidAmount} onChange={e => {
                        const val = e.target.value.replace(/[^0-9]/g, '');
                        setBidAmount(val);
                        if (bidError) setBidError(null);
                      }} placeholder={data.rate?.toString() || "0"} className="flex-1 bg-transparent border-none outline-none text-sm font-medium text-foreground px-2 placeholder:text-muted-foreground" />
                      <Button onClick={() => {
                        const finalBid = bidAmount || "";
                        const bidValue = parseFloat(finalBid.replace(/[^0-9.]/g, '')) || 0;
                        if (bidValue <= 0) {
                          setBidError("Bid Rate must be more than $0");
                          return;
                        }
                        setBidError(null);

                        // Check if bidding below posted rate (use posted_amount, fallback to rate)
                        const postedRate = parseFloat(String(data.posted_amount || data.rate || '0').replace(/[^0-9.]/g, '')) || 0;
                        if (postedRate > 0 && bidValue < postedRate) {
                          setPendingBidAmount(finalBid);
                          setShowLowBidWarning(true);
                          return;
                        }

                        setBidAmount(finalBid);
                        setShowBidCardOnMap(true);
                      }} className="bg-green-500 hover:bg-green-600 h-6 px-3 text-xs font-semibold rounded-full m-0.5">
                        Set Bid
                      </Button>
                    </div>
                    {bidError && (
                      <p className="text-xs text-destructive pl-2">{bidError}</p>
                    )}
                  </div>
                </div>

                {/* Action Buttons - Connected button group */}
                <div className="flex gap-0">
                  <Button variant="destructive" size="sm" className="h-7 text-[11px] flex-1 whitespace-nowrap font-medium px-2 rounded-none rounded-l-full" onClick={handleSkip}>
                    Skip
                  </Button>
                  <Button size="sm" className="h-7 text-[11px] flex-1 bg-blue-500 hover:bg-blue-600 whitespace-nowrap font-medium px-2 rounded-none border-l border-blue-400/50" onClick={handleUndecided}>
                    Undecided
                  </Button>
                  <Button size="sm" className="h-7 text-[11px] flex-1 bg-blue-500 hover:bg-blue-600 whitespace-nowrap font-medium px-2 rounded-none border-l border-blue-400/50" onClick={handleMarkUnreviewed}>
                    Unreviewed
                  </Button>
                  <Button size="sm" className="h-7 text-[11px] flex-1 bg-blue-500 hover:bg-blue-600 whitespace-nowrap font-medium px-2 rounded-none rounded-r-full border-l border-blue-400/50" onClick={handleWait}>
                    Wait
                  </Button>
                </div>
              </Card>
            </div>
          </div>

          {/* MAP - Full Width Below */}
          <div className="relative">
            <Card className="h-[calc(100vh-380px)] min-h-[200px] overflow-hidden rounded-md">
              <LoadRouteMap stops={mapStops} />
            </Card>
          </div>
        </div>

        {/* FAR RIGHT COLUMN - Quote Rates */}
        <div className="w-[160px]">
          <Card className="p-3 shadow-sm border-0 bg-gradient-to-b from-slate-50 to-white">
            <div className="flex justify-between text-xs font-medium text-slate-500 pb-2 mb-2 border-b border-slate-200">
              <span>Quote Rate</span>
              <span>$/mi</span>
            </div>
            <div className="space-y-0 max-h-[620px] overflow-auto scrollbar-thin">
              {(() => {
                const loadedMiles = data.loaded_miles || 375;
                const rates = [];
                for (let rate = 1500; rate >= 500; rate -= 50) {
                  rates.push(rate);
                }
                return rates.map((rate) => {
                  const perMile = (rate / loadedMiles).toFixed(2);
                  const isSelected = bidAmount === rate.toString();
                  return (
                    <div
                      key={rate}
                      onClick={() => setBidAmount(rate.toString())}
                      className={`flex justify-between items-center px-2 py-0.5 rounded cursor-pointer transition-all duration-150 ${
                        isSelected 
                          ? "bg-blue-500 text-white shadow-sm" 
                          : "hover:bg-blue-100 hover:scale-[1.02] text-slate-700"
                      }`}
                    >
                      <span className={`text-[12px] font-semibold ${isSelected ? 'text-white' : 'text-slate-800'}`}>
                        ${rate.toLocaleString()}
                      </span>
                      <span className={`text-[11px] font-medium ${isSelected ? 'text-blue-100' : 'text-slate-500'}`}>
                        ${perMile}
                      </span>
                    </div>
                  );
                });
              })()}
            </div>
          </Card>
        </div>
      </div>
    </div>
    {EmailConfirmDialog}
    
    {/* Match History Dialog */}
    <Dialog open={showMatchHistory} onOpenChange={setShowMatchHistory}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Match History
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[300px]">
          {loadingHistory ? <div className="flex items-center justify-center py-4">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
            </div> : matchHistory.length === 0 ? <div className="text-center py-6 text-muted-foreground text-sm">
              No history recorded yet.
            </div> : <div className="divide-y">
              {matchHistory.map(entry => {
              const actionColors: Record<string, string> = {
                viewed: 'bg-blue-100 text-blue-700',
                skipped: 'bg-orange-100 text-orange-700',
                bid: 'bg-green-100 text-green-700',
                waitlist: 'bg-purple-100 text-purple-700',
                undecided: 'bg-gray-100 text-gray-700'
              };
              const actionLabels: Record<string, string> = {
                viewed: 'Viewed',
                skipped: 'Skipped',
                bid: 'Bid',
                waitlist: 'Waitlist',
                undecided: 'Undecided'
              };
              return <div key={entry.id} className="flex items-center gap-3 py-2.5 px-1">
                    <Badge className={`text-xs px-2 py-0.5 ${actionColors[entry.action_type] || 'bg-gray-100 text-gray-700'}`}>
                      {actionLabels[entry.action_type] || entry.action_type}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium truncate">{entry.dispatcher_name || 'Unknown'}</span>
                      {entry.action_details?.bid_amount && <span className="text-xs text-green-600 ml-1.5">${entry.action_details.bid_amount}</span>}
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(entry.created_at).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit'
                  })}
                    </span>
                  </div>;
            })}
            </div>}
        </ScrollArea>
      </DialogContent>
    </Dialog>

    {/* Low bid warning dialog */}
    <AlertDialog open={showLowBidWarning} onOpenChange={setShowLowBidWarning}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Bidding Below Posted Rate</AlertDialogTitle>
          <AlertDialogDescription>
            This load is posted for <span className="font-bold text-foreground">${Number(data.posted_amount || data.rate || 0).toLocaleString()}</span> and you are bidding <span className="font-bold text-foreground">${Number(pendingBidAmount || 0).toLocaleString()}</span>.
            <br /><br />
            Are you sure you want to bid below the posted rate?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setShowLowBidWarning(false)}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => {
            setBidAmount(pendingBidAmount);
            setShowBidCardOnMap(true);
            setShowLowBidWarning(false);
          }} className="bg-green-600 hover:bg-green-700">
            Yes, Continue
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>;
};
export default LoadEmailDetail;