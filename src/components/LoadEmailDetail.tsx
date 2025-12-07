import { useEffect, useState } from "react";
import { Truck, X, ChevronDown, ChevronUp, MapPin, Mail, DollarSign, ArrowLeft, Check, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import LoadRouteMap from "@/components/LoadRouteMap";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";

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
  onBidPlaced?: (matchId: string, loadEmailId: string) => void;
  onUndecided?: (matchId: string) => void;
  onSkip?: (matchId: string) => Promise<void> | void;
  onWait?: (matchId: string) => Promise<void> | void;
  onMarkUnreviewed?: (matchId: string) => Promise<void> | void;
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
  onMarkUnreviewed
}: LoadEmailDetailProps) => {
  const isMobile = useIsMobile();
  const [showOriginalEmail, setShowOriginalEmail] = useState(false);
  const [bidAmount, setBidAmount] = useState("");
  const [showBidCardOnMap, setShowBidCardOnMap] = useState(false);
  const [toEmail, setToEmail] = useState<string | null>(null);
  const [ccEmail, setCcEmail] = useState("");
  const [fullEmailData, setFullEmailData] = useState<any>(null);
  const [mobileSection, setMobileSection] = useState<'details' | 'map' | 'bid'>('details');
  const [showEmailConfirmDialog, setShowEmailConfirmDialog] = useState(false);
  const [bidConfirmed, setBidConfirmed] = useState(false);
  const [companyProfile, setCompanyProfile] = useState<any>(null);
  const [currentDispatcher, setCurrentDispatcher] = useState<any>(null);
  
  // Match history state
  const [showMatchHistory, setShowMatchHistory] = useState(false);
  const [matchHistory, setMatchHistory] = useState<MatchHistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  
  // Editable email body lines
  const [editableGreeting, setEditableGreeting] = useState<string>("");
  const [editableBlankLine, setEditableBlankLine] = useState<string>("");
  const [editableVehicleDesc, setEditableVehicleDesc] = useState<string>("");
  const [editableHelpLine, setEditableHelpLine] = useState<string>("Please let me know if I can help on this load:");
  const [editableOrderLine, setEditableOrderLine] = useState<string>("");
  
  const data = email.parsed_data || {};

  // Email templates - editable and selectable
  const DEFAULT_TEMPLATES = {
    nearby: 'Our truck is nearby ( {distance} away ). We can pick up on time and deliver as scheduled.',
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

  // Load dispatcher's custom templates when dispatcher is identified
  useEffect(() => {
    if (currentDispatcher?.email) {
      const stored = getStoredTemplates(currentDispatcher.email);
      if (stored) {
        setTemplateTexts(prev => ({ ...prev, ...stored }));
      }
    }
  }, [currentDispatcher?.email]);

  const handleTemplateToggle = (templateKey: string) => {
    setSelectedTemplates(prev => ({ ...prev, [templateKey]: !prev[templateKey] }));
  };

  const handleTemplateTextChange = (templateKey: string, text: string) => {
    setTemplateTexts(prev => {
      const updated = { ...prev, [templateKey]: text };
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
    return text
      .replace('{distance}', distance)
      .replace('{fuel_surcharge}', fuelSurcharge);
  };

  // Get selected templates for email body
  const getSelectedTemplateTexts = () => {
    return Object.entries(selectedTemplates)
      .filter(([_, isSelected]) => isSelected)
      .map(([key]) => getRenderedTemplate(key));
  };

  // Fetch full email data (including body_text) if not present in email prop
  useEffect(() => {
    const fetchFullEmail = async () => {
      // If body_text is missing, fetch it from database
      if (!email.body_text && !email.body_html && email.id) {
        try {
          const { data: fullEmail, error } = await supabase
            .from('load_emails')
            .select('body_text, body_html')
            .eq('id', email.id)
            .single();
          
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

  const [bidAsCarrier, setBidAsCarrier] = useState<any>(null);
  const [vehicleCarrier, setVehicleCarrier] = useState<any>(null);

  // Fetch company profile, current dispatcher, and bid_as carrier for email signature
  useEffect(() => {
    const fetchProfileData = async () => {
      try {
        // Fetch company profile (fallback)
        const { data: profile } = await supabase
          .from('company_profile')
          .select('*')
          .single();
        if (profile) setCompanyProfile(profile);

        // Fetch current user's dispatcher info
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email) {
          const { data: dispatcher } = await supabase
            .from('dispatchers')
            .select('*')
            .ilike('email', user.email)
            .single();
          if (dispatcher) setCurrentDispatcher(dispatcher);
        }
      } catch (e) {
        console.error('Error fetching profile data:', e);
      }
    };
    fetchProfileData();
  }, []);

  // Fetch match history
  const fetchMatchHistory = async () => {
    if (!match?.id) return;
    setLoadingHistory(true);
    try {
      const { data: history, error } = await supabase
        .from('match_action_history')
        .select('*')
        .eq('match_id', match.id)
        .order('created_at', { ascending: false });
      
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
    if (!match?.id) return;
    try {
      const { error } = await supabase
        .from('match_action_history')
        .insert({
          match_id: match.id,
          dispatcher_id: currentDispatcher?.id || null,
          dispatcher_name: currentDispatcher ? `${currentDispatcher.first_name} ${currentDispatcher.last_name}` : null,
          dispatcher_email: currentDispatcher?.email || null,
          action_type: actionType,
          action_details: actionDetails || null
        });
      
      if (error) throw error;
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

  // Use fetched data or prop data
  const emailBody = fullEmailData?.body_html || fullEmailData?.body_text || email.body_html || email.body_text || "";
  
  const originCity = data.origin_city || "ATLANTA";
  const originState = data.origin_state || "GA";
  const destCity = data.destination_city || "MEMPHIS";
  const destState = data.destination_state || "TN";

  // Get actual vehicle, driver, carrier, and broker data
  const vehicle = match && vehicles?.find((v: any) => v.id === match.vehicle_id);
  
  // Fetch the carrier from the vehicle's bid_as field
  useEffect(() => {
    const fetchBidAsCarrier = async () => {
      if (vehicle?.bid_as) {
        console.log('Fetching bid_as carrier for vehicle:', vehicle.id, 'bid_as:', vehicle.bid_as);
        try {
          // bid_as is stored as text but contains a UUID, cast it for the query
          const { data: carrier, error } = await supabase
            .from('carriers')
            .select('*')
            .eq('id', vehicle.bid_as)
            .maybeSingle();
          
          console.log('Carrier fetch result:', { carrier, error });
          
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
  }, [vehicle?.bid_as]);

  // Fetch the vehicle's carrier for safety status display
  useEffect(() => {
    const fetchVehicleCarrier = async () => {
      if (vehicle?.carrier) {
        try {
          const { data: carrier, error } = await supabase
            .from('carriers')
            .select('id, name, safer_status, safety_rating')
            .eq('id', vehicle.carrier)
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
  }, [vehicle?.carrier]);
   
  // Use asset's Vehicle Size / Asset Subtype from the matched vehicle; if no asset matched, show "(NOT FOUND)"
  const truckLengthFeet = vehicle?.vehicle_size; // Use feet from vehicle_size field
  const truckSubtype = vehicle?.asset_subtype;

  const displaySize = vehicle && truckLengthFeet ? `${truckLengthFeet}' ` : "";
  const displayType = vehicle ? (truckSubtype || "Large Straight") : "(NOT FOUND)";
  
  const driver1 = vehicle?.driver_1_id ? drivers?.find((d: any) => d.id === vehicle.driver_1_id) : null;
  const driver2 = vehicle?.driver_2_id ? drivers?.find((d: any) => d.id === vehicle.driver_2_id) : null;
  
  const driver1Name = driver1?.personal_info?.firstName && driver1?.personal_info?.lastName 
    ? `${driver1.personal_info.firstName} ${driver1.personal_info.lastName}` 
    : null;
  const driver2Name = driver2?.personal_info?.firstName && driver2?.personal_info?.lastName
    ? `${driver2.personal_info.firstName} ${driver2.personal_info.lastName}` 
    : null;
  const carrierName = vehicleCarrier?.name || (vehicle?.carrier ? (carriersMap[vehicle.carrier] || vehicle.carrier) : null);
  
  // Check if carrier has safety issues (NOT AUTHORIZED or CONDITIONAL rating)
  const hasCarrierSafetyIssue = 
    vehicleCarrier?.safer_status?.toUpperCase().includes('NOT AUTHORIZED') ||
    vehicleCarrier?.safety_rating?.toUpperCase() === 'CONDITIONAL';

  // Build equipment details from vehicle data
  const buildEquipmentDetails = () => {
    if (!vehicle) return '[10 straps] [2 load bars] [2 horizontal E-Tracks] [10 blankets]';
    const parts: string[] = [];
    if (vehicle.straps_count) parts.push(`[${vehicle.straps_count} straps]`);
    if (vehicle.load_bars_etrack) parts.push(`[${vehicle.load_bars_etrack} load bars]`);
    if (vehicle.horizontal_etracks) parts.push(`[${vehicle.horizontal_etracks} horizontal E-Tracks]`);
    if (vehicle.blankets) parts.push(`[${vehicle.blankets} blankets]`);
    return parts.length > 0 ? parts.join(' ') : '[Equipment details not available]';
  };

  // Build truck dimensions from vehicle data
  const buildTruckDimensions = () => {
    if (!vehicle) return 'L x W x H: ( 288 x 97 x 102 ) inches';
    const l = vehicle.dimensions_length ? vehicle.dimensions_length * 12 : null; // feet to inches
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
  
  const brokerName = data.broker || data.customer || email.from_name || email.from_email?.split('@')[0] || "Unknown";

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
      const { error } = await supabase
        .from("load_hunt_matches")
        .update({ is_active: false, match_status: 'skipped' })
        .eq("id", match.id);

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
      const { error: matchError } = await supabase
        .from("load_hunt_matches")
        .update({ is_active: false, match_status: 'waitlist' })
        .eq("id", match.id);

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
      const { error } = await supabase
        .from("load_hunt_matches")
        .update({ is_active: true, match_status: 'active' })
        .eq("id", match.id);

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
  useEffect(() => {
    const resolveToEmail = async () => {
      try {
        if (match?.load_email_id) {
          const { data: loadEmail, error } = await supabase
            .from("load_emails")
            .select("parsed_data")
            .eq("id", match.load_email_id)
            .maybeSingle();

          if (!error && loadEmail?.parsed_data) {
            const parsedData = loadEmail.parsed_data as Record<string, any>;
            if (parsedData.broker_email) {
              setToEmail(parsedData.broker_email);
              return;
            }
          }
        }
        // Fallback to broker_email from email prop if available
        setToEmail(data.broker_email || email.from_email || null);
      } catch (e) {
        console.error("Error resolving toEmail from match:", e);
        setToEmail(data.broker_email || email.from_email || null);
      }
    };

    resolveToEmail();
  }, [match, email.from_email, data.broker_email]);

  // Dispatcher signature info for email - use bid_as carrier if available, fallback to company_profile
  const dispatcherName = currentDispatcher 
    ? `${currentDispatcher.first_name} ${currentDispatcher.last_name}` 
    : 'Dispatcher Name';
  const dispatcherEmailAddr = currentDispatcher?.email || 'dispatch@company.com';
  // Use bid_as carrier info first, then fallback to company_profile
  const companyName = bidAsCarrier?.name || companyProfile?.company_name || 'COMPANY NAME';
  const mcNumber = bidAsCarrier?.mc_number || companyProfile?.mc_number || 'MC#';
  const dotNumber = bidAsCarrier?.dot_number || companyProfile?.dot_number || 'USDOT#';
  const companyAddress = bidAsCarrier?.address 
    ? bidAsCarrier.address 
    : (companyProfile 
      ? `${companyProfile.address || ''} ${companyProfile.city || ''}, ${companyProfile.state || ''} ${companyProfile.zip || ''}`.trim()
      : 'Company Address');
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
    try {
      const { data: result, error } = await supabase.functions.invoke('send-bid-email', {
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
          order_line: editableOrderLine,
        },
      });

      if (error) {
        console.error('Error sending bid email:', error);
        toast.error(`Failed to send bid email: ${error.message}`);
        return;
      }

      toast.success('Bid email sent successfully!');
      setShowEmailConfirmDialog(false);
      setBidConfirmed(false);
      
      // Record the bid action
      await recordMatchAction('bid', { bid_amount: bidAmount, to_email: toEmail });
      
      // Notify parent that bid was placed - move to MY BIDS and skip siblings
      if (onBidPlaced && match?.id && email?.id) {
        onBidPlaced(match.id, email.id);
      }
    } catch (err: any) {
      console.error('Error sending bid email:', err);
      toast.error(`Failed to send bid email: ${err.message || 'Unknown error'}`);
    } finally {
      setIsSending(false);
    }
  };

  // Reusable Email Confirmation Dialog
  const EmailConfirmDialog = (
    <Dialog open={showEmailConfirmDialog} onOpenChange={(open) => {
      setShowEmailConfirmDialog(open);
      if (!open) setBidConfirmed(false);
    }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto p-0">
        <div className="sticky top-0 z-10 bg-gradient-to-r from-slate-800 to-slate-900 text-white px-4 py-3">
          <DialogTitle className="text-base font-semibold">Confirm Before Sending Bid!</DialogTitle>
        </div>
        
        {/* Action Buttons - Compact */}
        <div className="flex gap-1.5 px-4 pt-3">
          <Button 
            size="sm"
            className={`flex-1 flex flex-col items-center py-2 h-auto ${bidConfirmed ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-pink-500 hover:bg-pink-600'}`}
            onClick={() => setBidConfirmed(true)}
          >
            <span className="text-[10px] font-medium opacity-90">Confirm Bid</span>
            <span className="text-sm font-bold">$ {bidAmount || '0'}</span>
          </Button>
          <Button 
            size="sm"
            variant="outline" 
            className="flex-1 h-auto py-2"
            disabled={!bidConfirmed || isSending}
            onClick={handleSendBid}
          >
            {isSending ? 'Sending...' : 'Send Bid'}
          </Button>
          <Button 
            size="sm"
            className="flex-1 bg-red-500 hover:bg-red-600 h-auto py-2"
            onClick={() => setShowEmailConfirmDialog(false)}
            disabled={isSending}
          >
            Cancel
          </Button>
        </div>
        
        <div className="px-4 pb-4 pt-2 space-y-3">
          {/* Email Fields - Inline */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Mail To</label>
              <Input 
                value={toEmail || ''} 
                onChange={(e) => setToEmail(e.target.value)}
                placeholder="Enter email"
                className="h-8 text-xs mt-0.5"
              />
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">CC</label>
              <Input 
                value={ccEmail} 
                onChange={(e) => setCcEmail(e.target.value)}
                placeholder="Optional"
                className="h-8 text-xs mt-0.5"
              />
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
            <Textarea 
              value={editableGreeting}
              onChange={(e) => setEditableGreeting(e.target.value)}
              className="min-h-[24px] text-sm border-0 bg-transparent resize-none p-0 focus-visible:ring-0"
              placeholder="Greeting..."
              rows={1}
            />
            {/* Only show blank line field if it has content */}
            {editableBlankLine.trim() && (
              <Textarea 
                value={editableBlankLine}
                onChange={(e) => setEditableBlankLine(e.target.value)}
                className="min-h-[24px] text-sm border-0 bg-transparent resize-none p-0 focus-visible:ring-0"
                rows={1}
              />
            )}
            <Textarea 
              value={editableVehicleDesc}
              onChange={(e) => setEditableVehicleDesc(e.target.value)}
              className="min-h-[32px] text-sm border-0 bg-transparent resize-none p-0 focus-visible:ring-0"
              rows={2}
            />
            <Textarea 
              value={editableHelpLine}
              onChange={(e) => setEditableHelpLine(e.target.value)}
              className="min-h-[24px] text-sm border-0 bg-transparent resize-none p-0 focus-visible:ring-0"
              rows={1}
            />
            <Textarea 
              value={editableOrderLine}
              onChange={(e) => setEditableOrderLine(e.target.value)}
              className="min-h-[24px] text-sm border-0 bg-transparent resize-none p-0 focus-visible:ring-0"
              rows={1}
            />
            {/* Selected Templates - highlighted to stand out */}
            {getSelectedTemplateTexts().length > 0 && getSelectedTemplateTexts().map((text, idx) => (
              <p key={idx} className="text-sm leading-relaxed bg-amber-100 dark:bg-amber-900/30 text-amber-900 dark:text-amber-100 px-2 py-1 rounded -mx-2">{text}</p>
            ))}
          </div>
          
          {/* Truck Specs - Compact Grid */}
          <div className="bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-800/50 dark:to-slate-800/30 rounded p-2.5 text-[11px] space-y-0.5">
            <div className="flex"><span className="font-semibold text-slate-500 dark:text-slate-400 w-28">Truck Carries:</span><span className="text-slate-700 dark:text-slate-300 flex-1">{equipmentDetails}</span></div>
            <div className="flex"><span className="font-semibold text-slate-500 dark:text-slate-400 w-28">Truck Size:</span><span className="text-slate-700 dark:text-slate-300 flex-1">{truckDimensions}</span></div>
            <div className="flex"><span className="font-semibold text-slate-500 dark:text-slate-400 w-28">Door Type:</span><span className="text-slate-700 dark:text-slate-300 flex-1">{doorDimensions}</span></div>
            <div className="flex"><span className="font-semibold text-slate-500 dark:text-slate-400 w-28">Features:</span><span className="text-slate-700 dark:text-slate-300 flex-1">{vehicleFeatures}</span></div>
          </div>
          
          {/* Signature - Compact */}
          <div className="text-xs space-y-0.5 pt-2 border-t border-dashed">
            <p className="font-semibold">{dispatcherName}</p>
            <p className="text-muted-foreground">Dispatch • {companyName}</p>
            <p className="font-medium">MC#: {mcNumber} • USDOT#: {dotNumber}</p>
            <p className="text-muted-foreground">{companyAddress}</p>
            <p>Cell: <span className="font-medium">{companyPhone}</span> • {dispatcherEmailAddr}</p>
          </div>
          
          {/* Reference - Subtle */}
          <p className="text-[10px] text-muted-foreground/60">
            Ref: {email.load_id || email.id?.slice(0, 8) || 'N/A'}-{match?.id ? match.id.slice(0, 8) : 'N/A'}-{vehicle?.vehicle_number || match?.vehicle_id?.slice(0, 8) || 'N/A'}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );

  // MOBILE LAYOUT
  if (isMobile) {
    return (
      <div className="flex flex-col h-full bg-background">
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
            {[
              { id: 'details', label: 'Details', icon: Truck },
              { id: 'map', label: 'Map', icon: MapPin },
              { id: 'bid', label: 'Bid', icon: DollarSign },
            ].map(tab => (
              <Button
                key={tab.id}
                size="sm"
                variant={mobileSection === tab.id ? 'default' : 'ghost'}
                className="flex-1 h-9 text-xs"
                onClick={() => setMobileSection(tab.id as any)}
              >
                <tab.icon className="h-4 w-4 mr-1" />
                {tab.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Mobile Content */}
        <div className="flex-1 overflow-auto p-3">
          {mobileSection === 'details' && (
            <div className="space-y-3">
              {/* Route Summary */}
              <Card className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">Route</span>
                  {data.vehicle_type && (
                    <span className="text-xs font-medium bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                      {data.vehicle_type}
                    </span>
                  )}
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
              {vehicle && (
                <Card className="p-3">
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
                </Card>
              )}

              {/* Broker Info */}
              <Card className="p-3">
                <div className="text-xs text-muted-foreground mb-2">Broker</div>
                <div className="text-sm font-medium">{brokerName}</div>
                {toEmail && (
                  <div className="text-xs text-muted-foreground mt-1">{toEmail}</div>
                )}
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
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => setShowOriginalEmail(true)}
              >
                <Mail className="h-4 w-4 mr-2" />
                View Original Email
              </Button>
            </div>
          )}

          {mobileSection === 'map' && (
            <Card className="h-[400px] overflow-hidden rounded-md">
              <LoadRouteMap 
                stops={[
                  {
                    location_city: originCity,
                    location_state: originState,
                    location_address: `${originCity}, ${originState}`,
                    stop_type: "pickup"
                  },
                  {
                    location_city: destCity,
                    location_state: destState,
                    location_address: `${destCity}, ${destState}`,
                    stop_type: "delivery"
                  }
                ]} 
              />
            </Card>
          )}

          {mobileSection === 'bid' && (
            <div className="space-y-3">
              {/* Bid Input */}
              <Card className="p-4">
                <div className="text-xs text-muted-foreground mb-3">Your Bid</div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex items-center gap-1 bg-blue-500 text-white rounded-full h-12 px-4 flex-1">
                    <span className="text-xl font-bold">$</span>
                    <input
                      type="text"
                      value={bidAmount}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9]/g, '');
                        setBidAmount(val);
                      }}
                      placeholder={data.rate?.toString() || "3000"}
                      className="bg-transparent border-none outline-none text-xl font-bold text-white w-full placeholder:text-blue-200"
                    />
                  </div>
                </div>
                <Button 
                  onClick={() => {
                    const finalBid = bidAmount || data.rate?.toString() || "3000";
                    setBidAmount(finalBid);
                    setShowBidCardOnMap(true);
                  }}
                  className="w-full bg-green-600 hover:bg-green-700 h-11 font-semibold"
                >
                  Set Bid
                </Button>
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
            </div>
          )}
        </div>

        {/* Original Email Sheet for Mobile */}
        {showOriginalEmail && (
          <div className="fixed inset-0 z-50 bg-background animate-in slide-in-from-bottom">
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
                  {emailBody ? (
                    <iframe
                      srcDoc={emailBody.toLowerCase().includes("<html") ? emailBody : `<!DOCTYPE html><html><head><meta charset="UTF-8" /></head><body>${emailBody}</body></html>`}
                      className="w-full h-[500px] border rounded-md bg-background"
                      title="Email Content"
                    />
                  ) : (
                    <p className="text-muted-foreground">No email content available</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Bid Card Sheet for Mobile */}
        {showBidCardOnMap && (
          <div className="fixed inset-0 z-50 bg-background animate-in slide-in-from-bottom flex flex-col">
            <div className="bg-background border-b p-3 flex items-center justify-between flex-shrink-0">
              <h3 className="text-lg font-semibold">Bid Email Preview</h3>
              <Button variant="ghost" size="icon" onClick={() => setShowBidCardOnMap(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="flex-1 overflow-auto p-3 pb-20">
              <div className="space-y-3">
                <Card className="p-3">
                  <div className="text-xs text-muted-foreground mb-1">To:</div>
                  <Input 
                    value={toEmail || ''} 
                    onChange={(e) => setToEmail(e.target.value)}
                    placeholder="Enter email address"
                    className="h-8 text-sm"
                  />
                </Card>
                <Card className="p-3">
                  <div className="text-xs text-muted-foreground mb-1">CC:</div>
                  <Input 
                    value={ccEmail} 
                    onChange={(e) => setCcEmail(e.target.value)}
                    placeholder="Add CC email (optional)"
                    className="h-8 text-sm"
                  />
                </Card>
                <Card className="p-3">
                  <div className="text-xs text-muted-foreground mb-1">Subject:</div>
                  <div className="text-sm">
                    Order# {data.order_number || 'N/A'} [{originState} to {destState}] {displaySize}{displayType} - ${bidAmount || '0'} -MC {mcNumber}
                  </div>
                </Card>
                <Card className="p-3 text-sm space-y-2">
                  <Textarea 
                    value={editableGreeting}
                    onChange={(e) => setEditableGreeting(e.target.value)}
                    className="min-h-[28px] text-sm border-dashed resize-none"
                    rows={1}
                  />
                  <Textarea 
                    value={editableBlankLine}
                    onChange={(e) => setEditableBlankLine(e.target.value)}
                    className="min-h-[28px] text-sm border-dashed resize-none"
                    placeholder="(Optional text)"
                    rows={1}
                  />
                  <Textarea 
                    value={editableVehicleDesc}
                    onChange={(e) => setEditableVehicleDesc(e.target.value)}
                    className="min-h-[28px] text-sm border-dashed resize-none"
                    rows={2}
                  />
                  <Textarea 
                    value={editableHelpLine}
                    onChange={(e) => setEditableHelpLine(e.target.value)}
                    className="min-h-[28px] text-sm text-blue-600 border-dashed resize-none"
                    rows={1}
                  />
                  <Textarea 
                    value={editableOrderLine}
                    onChange={(e) => setEditableOrderLine(e.target.value)}
                    className="min-h-[28px] text-sm text-blue-600 border-dashed resize-none"
                    rows={1}
                  />
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
                  <div 
                    className={`px-3 py-2.5 rounded-lg cursor-pointer border transition-all flex items-start gap-2 mb-2 ${
                      selectedTemplates.nearby 
                        ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-400 shadow-sm ring-1 ring-blue-200' 
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
                    }`}
                    onClick={() => handleTemplateToggle('nearby')}
                    onDoubleClick={() => setEditingTemplate('nearby')}
                  >
                    <div className={`w-4 h-4 mt-0.5 rounded flex items-center justify-center flex-shrink-0 transition-colors ${
                      selectedTemplates.nearby ? 'bg-blue-500' : 'border-2 border-slate-300 bg-white'
                    }`}>
                      {selectedTemplates.nearby && <Check className="w-3 h-3 text-white" />}
                    </div>
                    {editingTemplate === 'nearby' ? (
                      <textarea
                        className="w-full text-sm bg-white border rounded p-1 min-h-[50px]"
                        value={templateTexts.nearby}
                        onChange={(e) => handleTemplateTextChange('nearby', e.target.value)}
                        onBlur={() => setEditingTemplate(null)}
                        onClick={(e) => e.stopPropagation()}
                        autoFocus
                      />
                    ) : (
                      <p className="text-sm flex-1 leading-relaxed">{getRenderedTemplate('nearby')}</p>
                    )}
                  </div>
                  
                  {/* Driver Template */}
                  <div 
                    className={`px-3 py-2.5 rounded-lg cursor-pointer border transition-all flex items-start gap-2 mb-2 ${
                      selectedTemplates.driver 
                        ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-400 shadow-sm ring-1 ring-blue-200' 
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
                    }`}
                    onClick={() => handleTemplateToggle('driver')}
                    onDoubleClick={() => setEditingTemplate('driver')}
                  >
                    <div className={`w-4 h-4 mt-0.5 rounded flex items-center justify-center flex-shrink-0 transition-colors ${
                      selectedTemplates.driver ? 'bg-blue-500' : 'border-2 border-slate-300 bg-white'
                    }`}>
                      {selectedTemplates.driver && <Check className="w-3 h-3 text-white" />}
                    </div>
                    {editingTemplate === 'driver' ? (
                      <textarea
                        className="w-full text-sm bg-white border rounded p-1 min-h-[50px]"
                        value={templateTexts.driver}
                        onChange={(e) => handleTemplateTextChange('driver', e.target.value)}
                        onBlur={() => setEditingTemplate(null)}
                        onClick={(e) => e.stopPropagation()}
                        autoFocus
                      />
                    ) : (
                      <p className="text-sm flex-1 leading-relaxed">{getRenderedTemplate('driver')}</p>
                    )}
                  </div>
                  
                  {/* Fuel Template */}
                  <div 
                    className={`px-3 py-2.5 rounded-lg cursor-pointer border transition-all flex items-start gap-2 ${
                      selectedTemplates.fuel 
                        ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-400 shadow-sm ring-1 ring-blue-200' 
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
                    }`}
                    onClick={() => handleTemplateToggle('fuel')}
                    onDoubleClick={() => setEditingTemplate('fuel')}
                  >
                    <div className={`w-4 h-4 mt-0.5 rounded flex items-center justify-center flex-shrink-0 transition-colors ${
                      selectedTemplates.fuel ? 'bg-blue-500' : 'border-2 border-slate-300 bg-white'
                    }`}>
                      {selectedTemplates.fuel && <Check className="w-3 h-3 text-white" />}
                    </div>
                    {editingTemplate === 'fuel' ? (
                      <textarea
                        className="w-full text-sm bg-white border rounded p-1 min-h-[50px]"
                        value={templateTexts.fuel}
                        onChange={(e) => handleTemplateTextChange('fuel', e.target.value)}
                        onBlur={() => setEditingTemplate(null)}
                        onClick={(e) => e.stopPropagation()}
                        autoFocus
                      />
                    ) : (
                      <p className="text-sm flex-1 leading-relaxed">{getRenderedTemplate('fuel')}</p>
                    )}
                  </div>
                </Card>
              </div>
            </div>
            {/* Sticky Footer with Action Buttons */}
            <div className="fixed bottom-0 left-0 right-0 bg-background border-t p-3 safe-area-bottom">
              <div className="grid grid-cols-3 gap-2">
                <Button 
                  size="sm" 
                  className="bg-blue-500 hover:bg-blue-600 h-11"
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
              </div>
            </div>
          </div>
        )}
        {EmailConfirmDialog}
      </div>
    );
  }

  // DESKTOP LAYOUT (original)
  return (
    <>
    <div className="flex-1 overflow-auto relative">
      {/* Original Email Sidebar - Left half when both open, or full left half */}
      {showOriginalEmail && (
        <div className={`absolute left-0 top-0 bottom-0 ${showBidCardOnMap ? 'w-1/2' : 'w-1/2'} bg-background z-50 shadow-2xl border-r animate-in slide-in-from-left duration-300 flex flex-col`}>
          <div className="sticky top-0 bg-background border-b p-4 flex items-center justify-between z-10 flex-shrink-0">
            <h2 className="text-lg font-semibold">Original Email</h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowOriginalEmail(false)}
            >
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
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (!emailBody) return;

                      const blob = new Blob([emailBody], { type: "text/html;charset=utf-8" });
                      const url = URL.createObjectURL(blob);
                      window.open(url, "_blank", "noopener,noreferrer");
                    }}
                  >
                    Open in new tab
                  </Button>
                </div>
                {(() => {
                  if (!emailBody) {
                    return (
                      <div className="text-sm text-muted-foreground">No email content available</div>
                    );
                  }

                  const hasHtmlTag = emailBody.toLowerCase().includes("<html");
                  const docHtml = hasHtmlTag
                    ? emailBody
                    : `<!DOCTYPE html><html><head><meta charset="UTF-8" /></head><body>${emailBody}</body></html>`;

                  return (
                    <div className="space-y-2">
                      <iframe
                        srcDoc={docHtml}
                        className="w-full h-[600px] border rounded-md bg-background"
                        title="Email Content"
                      />
                      <details className="text-[10px] bg-muted rounded border max-h-[200px] overflow-auto">
                        <summary className="cursor-pointer px-2 py-1 font-semibold">
                          View raw source
                        </summary>
                        <pre className="whitespace-pre-wrap font-mono px-2 pb-2">
                          {emailBody.slice(0, 4000)}
                        </pre>
                      </details>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bid Email Sidebar - Right half, shows alongside Original Email */}
      {showBidCardOnMap && (
        <div className={`absolute right-0 top-0 bottom-0 w-1/2 bg-background z-50 shadow-2xl border-l animate-in slide-in-from-right duration-300 flex flex-col`}>
          <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-3 flex items-center justify-between z-10 flex-shrink-0">
            <h3 className="text-lg font-semibold">Bid Email Preview</h3>
            <Button
              variant="ghost"
              size="icon"
              className="text-white/80 hover:text-white hover:bg-white/20"
              onClick={() => setShowBidCardOnMap(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-3">
              {/* Email Fields Row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">To</label>
                  <Input 
                    value={toEmail || ''} 
                    onChange={(e) => setToEmail(e.target.value)}
                    placeholder="Enter email"
                    className="h-9 text-sm mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">CC</label>
                  <Input 
                    value={ccEmail} 
                    onChange={(e) => setCcEmail(e.target.value)}
                    placeholder="Optional"
                    className="h-9 text-sm mt-1"
                  />
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
                <Textarea 
                  value={editableGreeting}
                  onChange={(e) => setEditableGreeting(e.target.value)}
                  className="min-h-[32px] text-sm border-0 border-b border-dashed bg-transparent resize-none p-1 focus-visible:ring-0 focus-visible:border-blue-400"
                  rows={1}
                />
                <Textarea 
                  value={editableBlankLine}
                  onChange={(e) => setEditableBlankLine(e.target.value)}
                  className="min-h-[32px] text-sm border-0 border-b border-dashed bg-transparent resize-none p-1 focus-visible:ring-0 focus-visible:border-blue-400 text-muted-foreground"
                  placeholder="(Add optional text here...)"
                  rows={1}
                />
                <Textarea 
                  value={editableVehicleDesc}
                  onChange={(e) => setEditableVehicleDesc(e.target.value)}
                  className="min-h-[48px] text-sm border-0 border-b border-dashed bg-transparent resize-none p-1 focus-visible:ring-0 focus-visible:border-blue-400"
                  rows={2}
                />
                <Textarea 
                  value={editableHelpLine}
                  onChange={(e) => setEditableHelpLine(e.target.value)}
                  className="min-h-[32px] text-sm border-0 border-b border-dashed bg-transparent resize-none p-1 focus-visible:ring-0 focus-visible:border-blue-400"
                  rows={1}
                />
                <Textarea 
                  value={editableOrderLine}
                  onChange={(e) => setEditableOrderLine(e.target.value)}
                  className="min-h-[32px] text-sm border-0 bg-transparent resize-none p-1 focus-visible:ring-0"
                  rows={1}
                />
              </div>
              
              {/* Truck Specs */}
              <div className="bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-800/50 dark:to-slate-800/30 rounded-lg p-3 text-sm space-y-1">
                <div className="flex"><span className="font-semibold text-slate-600 dark:text-slate-400 w-32">We have:</span><span className="text-slate-700 dark:text-slate-300 flex-1">{equipmentDetails}</span></div>
                <div className="flex"><span className="font-semibold text-slate-600 dark:text-slate-400 w-32">Truck Dimension:</span><span className="text-slate-700 dark:text-slate-300 flex-1">{truckDimensions}</span></div>
                <div className="flex"><span className="font-semibold text-slate-600 dark:text-slate-400 w-32">Door:</span><span className="text-slate-700 dark:text-slate-300 flex-1">{doorDimensions}</span></div>
                <div className="flex"><span className="font-semibold text-slate-600 dark:text-slate-400 w-32">Features:</span><span className="text-slate-700 dark:text-slate-300 flex-1">{vehicleFeatures}</span></div>
              </div>
              
              {/* Selectable Templates */}
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                  <Check className="w-3 h-3" /> Select templates to include (double-click to edit)
                </p>
                
                {/* Nearby Template */}
                <div 
                  className={`px-3 py-2.5 rounded-lg cursor-pointer border transition-all flex items-start gap-2 ${
                    selectedTemplates.nearby 
                      ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-400 shadow-sm ring-1 ring-blue-200' 
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-blue-300 hover:shadow-sm'
                  }`}
                  onClick={() => handleTemplateToggle('nearby')}
                  onDoubleClick={() => setEditingTemplate('nearby')}
                >
                  <div className={`w-4 h-4 mt-0.5 rounded flex items-center justify-center flex-shrink-0 transition-colors ${
                    selectedTemplates.nearby ? 'bg-blue-500' : 'border-2 border-slate-300 bg-white'
                  }`}>
                    {selectedTemplates.nearby && <Check className="w-3 h-3 text-white" />}
                  </div>
                  {editingTemplate === 'nearby' ? (
                    <textarea
                      className="w-full text-sm bg-white border rounded p-1 min-h-[50px]"
                      value={templateTexts.nearby}
                      onChange={(e) => handleTemplateTextChange('nearby', e.target.value)}
                      onBlur={() => setEditingTemplate(null)}
                      onClick={(e) => e.stopPropagation()}
                      autoFocus
                    />
                  ) : (
                    <p className="text-sm flex-1 leading-relaxed">{getRenderedTemplate('nearby')}</p>
                  )}
                </div>
                
                {/* Driver Template */}
                <div 
                  className={`px-3 py-2.5 rounded-lg cursor-pointer border transition-all flex items-start gap-2 ${
                    selectedTemplates.driver 
                      ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-400 shadow-sm ring-1 ring-blue-200' 
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-blue-300 hover:shadow-sm'
                  }`}
                  onClick={() => handleTemplateToggle('driver')}
                  onDoubleClick={() => setEditingTemplate('driver')}
                >
                  <div className={`w-4 h-4 mt-0.5 rounded flex items-center justify-center flex-shrink-0 transition-colors ${
                    selectedTemplates.driver ? 'bg-blue-500' : 'border-2 border-slate-300 bg-white'
                  }`}>
                    {selectedTemplates.driver && <Check className="w-3 h-3 text-white" />}
                  </div>
                  {editingTemplate === 'driver' ? (
                    <textarea
                      className="w-full text-sm bg-white border rounded p-1 min-h-[50px]"
                      value={templateTexts.driver}
                      onChange={(e) => handleTemplateTextChange('driver', e.target.value)}
                      onBlur={() => setEditingTemplate(null)}
                      onClick={(e) => e.stopPropagation()}
                      autoFocus
                    />
                  ) : (
                    <p className="text-sm flex-1 leading-relaxed">{getRenderedTemplate('driver')}</p>
                  )}
                </div>
                
                {/* Fuel Template */}
                <div 
                  className={`px-3 py-2.5 rounded-lg cursor-pointer border transition-all flex items-start gap-2 ${
                    selectedTemplates.fuel 
                      ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-400 shadow-sm ring-1 ring-blue-200' 
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-blue-300 hover:shadow-sm'
                  }`}
                  onClick={() => handleTemplateToggle('fuel')}
                  onDoubleClick={() => setEditingTemplate('fuel')}
                >
                  <div className={`w-4 h-4 mt-0.5 rounded flex items-center justify-center flex-shrink-0 transition-colors ${
                    selectedTemplates.fuel ? 'bg-blue-500' : 'border-2 border-slate-300 bg-white'
                  }`}>
                    {selectedTemplates.fuel && <Check className="w-3 h-3 text-white" />}
                  </div>
                  {editingTemplate === 'fuel' ? (
                    <textarea
                      className="w-full text-sm bg-white border rounded p-1 min-h-[50px]"
                      value={templateTexts.fuel}
                      onChange={(e) => handleTemplateTextChange('fuel', e.target.value)}
                      onBlur={() => setEditingTemplate(null)}
                      onClick={(e) => e.stopPropagation()}
                      autoFocus
                    />
                  ) : (
                    <p className="text-sm flex-1 leading-relaxed">{getRenderedTemplate('fuel')}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
          
          {/* Action Buttons - Sticky Footer */}
          <div className="border-t bg-slate-50 dark:bg-slate-800/50 px-4 py-3 flex gap-2">
            <Button 
              size="sm" 
              className="flex-1 bg-blue-600 hover:bg-blue-700 h-10 font-semibold shadow-sm"
              onClick={() => setShowEmailConfirmDialog(true)}
            >
              <Mail className="w-4 h-4 mr-2" />
              Email Bid
            </Button>
            <Button size="sm" className="flex-1 bg-amber-500 hover:bg-amber-600 h-10 font-semibold shadow-sm">
              Mark as Bid
            </Button>
            <Button size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700 h-10 font-semibold shadow-sm">
              Book Load
            </Button>
          </div>
        </div>
      )}
      
      <div className="flex gap-2 p-2">
        {/* LEFT SIDE - Load Details + Stats + Map */}
        <div className="flex-1 space-y-2">
          <div className="flex gap-2">
            {/* Load Details Card */}
            <div className="flex-1">
              <Card className="border rounded-md overflow-hidden h-full pb-0">
                {/* HEADER */}
                <div className="flex items-center border-b p-2 bg-slate-50">
                  <div className="flex items-center gap-2 flex-1">
                    <div className="flex h-10 w-14 flex-col items-center justify-center rounded-lg bg-blue-100 border border-blue-300">
                      <Truck className="h-4 w-4 text-blue-600" />
                      <div className="text-[10px] font-semibold text-blue-600">{vehicle?.vehicle_number || "N/A"}</div>
                      <div className="text-[10px] font-semibold text-red-500">Empty</div>
                    </div>
                    <div className="text-[11px] space-y-0.5">
                      <div>
                        <span className="text-gray-500">D1</span> <span className="font-medium">{driver1Name || "No Driver Assigned"}</span>{" "}
                        <span className="text-gray-400">Note:</span>
                      </div>
                      <div>
                        <span className="text-gray-500">D2</span> <span className="font-medium">{driver2Name || "No Driver Assigned"}</span>{" "}
                        <span className="text-gray-400">Note:</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div>
                      <div className="text-[13px] font-bold mb-0.5">Match ID: {match?.id?.substring(0, 8) || "N/A"}</div>
                      <button 
                        className="text-[10px] text-blue-500 hover:underline flex items-center gap-1"
                        onClick={() => {
                          fetchMatchHistory();
                          setShowMatchHistory(true);
                        }}
                      >
                        <History className="h-3 w-3" />
                        View Match History
                      </button>
                    </div>
                  </div>
                </div>

                {/* CARRIER ROWS */}
                <div className="border-b">
                  <div className="grid grid-cols-[2.2fr,1.4fr,1.2fr,1.5fr,1fr,1fr] px-2 py-1.5 text-[11px]">
                    <div className={`px-2 py-1 font-bold text-sm flex items-center rounded ${hasCarrierSafetyIssue ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                      {carrierName || "No Carrier"}
                    </div>
                    <div className="text-gray-400">
                      <div>    Pickup Time</div>
                      <div>    Delivery Time</div>
                    </div>
                    <div className="text-gray-400">
                      <div>   Origin</div>
                      <div>   Destination</div>
                    </div>
                    <div className="text-gray-400">
                      <div>    Empty Drive</div>
                      <div>    Loaded Drive</div>
                    </div>
                    <div className="text-gray-400">
                      <div>Load Type</div>
                      <div>Weight</div>
                    </div>
                    <div className="text-gray-400">
                      <div>Pieces</div>
                      <div>Dimensions</div>
                    </div>
                  </div>
                </div>

                <div className="border-b">
                  <div className="grid grid-cols-[2.2fr,1.4fr,1.2fr,1.5fr,1fr,1fr] px-2 py-1.5 text-[11px]">
                    <div className="bg-yellow-100 -mx-2 px-2 py-1 font-semibold flex items-center">
                      {brokerName}
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
                      <div><span className="inline-block w-3 text-green-600">+</span>{emptyDriveDistance !== undefined && emptyDriveDistance !== null ? `${Math.round(emptyDriveDistance)}mi` : (data.empty_miles !== null && data.empty_miles !== undefined ? `${Math.round(data.empty_miles)}mi` : '—')}</div>
                      <div><span className="inline-block w-3 text-green-600">+</span>{data.loaded_miles ? `${Math.round(data.loaded_miles)}mi` : '—'}</div>
                    </div>
                    <div>
                      <div>{data.vehicle_type || 'SPRINTER'}</div>
                      <div>{data.weight || '0'}</div>
                    </div>
                    <div>
                      <div>{data?.pieces || '0'}</div>
                      <div>{data?.dimensions || 'N/A'}</div>
                    </div>
                  </div>
                </div>

                {/* ORIGINAL POST */}
                <div className="grid grid-cols-[1fr,4fr,1.3fr] px-3 py-1 text-[11px] items-center">
                  <div className="font-semibold text-blue-600">Original Post</div>
                  <div className="text-red-600 text-[10px]">
                    {data.notes ? `Note: ${data.notes}` : 'Note:'}
                  </div>
                  <div className="text-right space-x-3">
                    <span className="font-semibold">Posted Rate:</span>{' '}
                    <span className="text-red-600 font-semibold">
                      {data.rate ? `$${data.rate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'NONE'}
                    </span>
                  </div>
                </div>

                {/* VEHICLE */}
                <div className="grid grid-cols-[1fr,4fr,1.3fr] px-3 py-1 text-[11px] items-center">
                  <div className="font-semibold text-blue-600">Vehicle</div>
                  <div className="text-gray-500">{vehicle?.notes ? `Note: ${vehicle.notes}` : 'Note:'}</div>
                  <div className="flex items-center justify-end gap-2 leading-tight">
                    <span>
                      <span className="font-semibold">Vehicle Size:</span> {data.vehicle_type || 'N/A'}
                    </span>
                    <Button 
                      className="bg-orange-500 hover:bg-orange-600 h-6 px-2 text-[10px] font-semibold"
                      onClick={() => setShowOriginalEmail(true)}
                    >
                      Original Email
                    </Button>
                  </div>
                </div>
              </Card>
            </div>

            {/* Stats & Actions Card */}
            <div className="w-[360px]">
              <Card className="p-3 h-full flex flex-col justify-between shadow-md">
                <div>
                  {/* Average/Bid/Booked Row */}
                  <div className="grid grid-cols-3 gap-2 text-center mb-3 pb-3 border-b">
                    <div>
                      <div className="text-[11px] text-muted-foreground mb-1">Average</div>
                      <div className="text-sm font-semibold">—</div>
                    </div>
                    <div className="bg-blue-50 -mx-1 px-2 py-1 rounded">
                      <div className="text-[11px] text-muted-foreground mb-1">Bid</div>
                      <div className="text-lg font-bold text-blue-600">${data.rate ? data.rate.toLocaleString() : '1,282'}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-muted-foreground mb-1">Booked</div>
                      <div className="text-sm font-semibold">N/A</div>
                    </div>
                  </div>

                  {/* [$/mi] Label */}
                  <div className="text-xs text-muted-foreground text-right mb-2">[$/mi]</div>

                  {/* Miles and Costs */}
                  <div className="space-y-2 mb-3 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">Loaded Miles</span>
                      <div className="flex gap-4 items-center">
                        <span className="font-semibold">{data.loaded_miles || 375}</span>
                        <span className="text-blue-600 font-semibold w-14 text-right">$3.42</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-medium">Total Miles</span>
                      <div className="flex gap-4 items-center">
                        <span className="font-semibold">{Math.round((data.loaded_miles || 375) + (emptyDriveDistance || 0))}</span>
                        <span className="text-blue-600 font-semibold w-14 text-right">$1.64</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center pb-2 border-b">
                      <span className="font-medium">Fuel, Tolls and Driver</span>
                      <div className="flex gap-4 items-center">
                        <span className="font-semibold">$0.00</span>
                        <span className="text-blue-600 font-semibold w-14 text-right">$0.00</span>
                      </div>
                    </div>
                  </div>

                  {/* Bid Input and Button */}
                  <div className="flex items-center justify-between gap-3 mb-3 pb-3 border-b">
                    <div className="flex items-center gap-1 bg-blue-500 text-white rounded-full h-10 px-4 min-w-[100px]">
                      <span className="text-lg font-bold">$</span>
                      <input
                        type="text"
                        value={bidAmount}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9]/g, '');
                          setBidAmount(val);
                        }}
                        placeholder={data.rate?.toString() || "3000"}
                        className="bg-transparent border-none outline-none text-xl font-bold text-white w-20 placeholder:text-blue-200"
                      />
                    </div>
                    <Button 
                      onClick={() => {
                        const finalBid = bidAmount || data.rate?.toString() || "3000";
                        setBidAmount(finalBid);
                        setShowBidCardOnMap(true);
                      }}
                      className="bg-green-600 hover:bg-green-700 h-9 px-6 text-sm font-semibold shadow-sm"
                    >
                      Set Bid
                    </Button>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-1.5">
                  <Button 
                    variant="destructive" 
                    size="sm" 
                    className="h-8 text-xs flex-1 whitespace-nowrap font-medium"
                    onClick={handleSkip}
                  >
                    Skip
                  </Button>
                  <Button size="sm" className="h-8 text-xs flex-1 bg-blue-500 hover:bg-blue-600 whitespace-nowrap font-medium" onClick={handleUndecided}>
                    Undecided
                  </Button>
                  <Button size="sm" className="h-8 text-xs flex-1 bg-blue-500 hover:bg-blue-600 whitespace-nowrap font-medium" onClick={handleMarkUnreviewed}>
                    Mark Unreviewed
                  </Button>
                  <Button size="sm" className="h-8 text-xs flex-1 bg-blue-500 hover:bg-blue-600 whitespace-nowrap font-medium" onClick={handleWait}>
                    Wait
                  </Button>
                </div>
              </Card>
            </div>
          </div>

          {/* MAP - Full Width Below */}
          <div className="relative">
            <Card className="h-[400px] overflow-hidden rounded-md">
              <LoadRouteMap 
                stops={[
                  {
                    location_city: originCity,
                    location_state: originState,
                    location_address: `${originCity}, ${originState}`,
                    stop_type: "pickup"
                  },
                  {
                    location_city: destCity,
                    location_state: destState,
                    location_address: `${destCity}, ${destState}`,
                    stop_type: "delivery"
                  }
                ]} 
              />
            </Card>
          </div>
        </div>

        {/* FAR RIGHT COLUMN - Quote Rates */}
        <div className="w-[200px]">
          <Card className="p-2">
            <div className="flex justify-between text-[10px] text-gray-500 pb-1.5 border-b mb-1.5">
              <span>Quote Rate</span>
              <span>$/mi</span>
            </div>
            <div className="space-y-0.5 text-[10px] max-h-[700px] overflow-auto">
              {[
                { rate: "$1,782.00", perMile: "$2.28" },
                { rate: "$1,732.00", perMile: "$2.21" },
                { rate: "$1,682.00", perMile: "$2.15" },
                { rate: "$1,632.00", perMile: "$2.08" },
                { rate: "$1,582.00", perMile: "$2.02" },
                { rate: "$1,532.00", perMile: "$1.96" },
                { rate: "$1,482.00", perMile: "$1.89" },
                { rate: "$1,432.00", perMile: "$1.83" },
                { rate: "$1,382.00", perMile: "$1.77" },
                { rate: "$1,332.00", perMile: "$1.70" },
                { rate: "$1,282.00", perMile: "$1.64" },
                { rate: "$1,232.00", perMile: "$1.57" },
                { rate: "$1,182.00", perMile: "$1.51" },
                { rate: "$1,132.00", perMile: "$1.45" },
                { rate: "$1,082.00", perMile: "$1.38" },
                { rate: "$1,032.00", perMile: "$1.32" },
                { rate: "$982.00", perMile: "$1.25" },
                { rate: "$932.00", perMile: "$1.19" },
                { rate: "$882.00", perMile: "$1.13" },
                { rate: "$832.00", perMile: "$1.06" },
                { rate: "$782.00", perMile: "$1.00" }
              ].map((row, idx) => (
                <div 
                  key={idx} 
                  className={`flex justify-between px-1.5 py-0.5 rounded ${row.rate === "$1,282.00" ? "bg-blue-100 font-semibold" : "hover:bg-slate-50"}`}
                >
                  <span>{row.rate}</span>
                  <span className="text-gray-600">{row.perMile}</span>
                </div>
              ))}
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
          {loadingHistory ? (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
            </div>
          ) : matchHistory.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm">
              No history recorded yet.
            </div>
          ) : (
            <div className="divide-y">
              {matchHistory.map((entry) => {
                const actionColors: Record<string, string> = {
                  viewed: 'bg-blue-100 text-blue-700',
                  skipped: 'bg-orange-100 text-orange-700',
                  bid: 'bg-green-100 text-green-700',
                  waitlist: 'bg-purple-100 text-purple-700',
                  undecided: 'bg-gray-100 text-gray-700',
                };
                const actionLabels: Record<string, string> = {
                  viewed: 'Viewed',
                  skipped: 'Skipped',
                  bid: 'Bid',
                  waitlist: 'Waitlist',
                  undecided: 'Undecided',
                };
                return (
                  <div key={entry.id} className="flex items-center gap-3 py-2.5 px-1">
                    <Badge className={`text-xs px-2 py-0.5 ${actionColors[entry.action_type] || 'bg-gray-100 text-gray-700'}`}>
                      {actionLabels[entry.action_type] || entry.action_type}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium truncate">{entry.dispatcher_name || 'Unknown'}</span>
                      {entry.action_details?.bid_amount && (
                        <span className="text-xs text-green-600 ml-1.5">${entry.action_details.bid_amount}</span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(entry.created_at).toLocaleString('en-US', { 
                        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' 
                      })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
    </>
  );
};

export default LoadEmailDetail;
