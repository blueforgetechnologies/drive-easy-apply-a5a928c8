import { useEffect, useState } from "react";
import { Truck, X, ChevronDown, ChevronUp, MapPin, Mail, DollarSign, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import LoadRouteMap from "@/components/LoadRouteMap";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";

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
  onUndecided
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
  const data = email.parsed_data || {};

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

  // Fetch company profile and current dispatcher for email signature
  useEffect(() => {
    const fetchProfileData = async () => {
      try {
        // Fetch company profile
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

  // Use fetched data or prop data
  const emailBody = fullEmailData?.body_html || fullEmailData?.body_text || email.body_html || email.body_text || "";
  
  const originCity = data.origin_city || "ATLANTA";
  const originState = data.origin_state || "GA";
  const destCity = data.destination_city || "MEMPHIS";
  const destState = data.destination_state || "TN";

  // Get actual vehicle, driver, carrier, and broker data
  const vehicle = match && vehicles?.find((v: any) => v.id === match.vehicle_id);
  
  // Use asset's Vehicle Size / Asset Subtype from the matched vehicle; if no asset matched, show "(NOT FOUND)"
  const truckLengthFeet = vehicle?.dimensions_length;
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
  const carrierName = vehicle?.carrier ? (carriersMap[vehicle.carrier] || vehicle.carrier) : null;

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
  
  const brokerName = data.broker || data.customer || email.from_name || email.from_email?.split('@')[0] || "Unknown";

  // Handle Skip button click - skips only this specific match, not the entire load
  const handleSkip = async () => {
    try {
      if (!match?.id) {
        console.error("No match ID available to skip");
        return;
      }

      const { error } = await supabase
        .from("load_hunt_matches")
        .update({ is_active: false })
        .eq("id", match.id);

      if (error) throw error;
      
      // Close the detail view and return to unreviewed list
      onClose();
    } catch (error) {
      console.error("Error skipping match:", error);
    }
  };

  // Handle Undecided button click - moves match to undecided status
  const handleUndecided = () => {
    if (match?.id && onUndecided) {
      onUndecided(match.id);
    }
    onClose();
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

  // Dispatcher signature info for email
  const dispatcherName = currentDispatcher 
    ? `${currentDispatcher.first_name} ${currentDispatcher.last_name}` 
    : 'Dispatcher Name';
  const dispatcherEmailAddr = currentDispatcher?.email || 'dispatch@company.com';
  const companyName = companyProfile?.company_name || 'COMPANY NAME';
  const mcNumber = companyProfile?.mc_number || 'MC#';
  const dotNumber = companyProfile?.dot_number || 'USDOT#';
  const companyAddress = companyProfile 
    ? `${companyProfile.address || ''} ${companyProfile.city || ''}, ${companyProfile.state || ''} ${companyProfile.zip || ''}`.trim()
    : 'Company Address';
  const companyPhone = companyProfile?.phone || '(000) 000-0000';
  const emailSubject = `Order# ${data.order_number || 'N/A'} [${originState} to ${destState}] ${displaySize}${displayType} - $${bidAmount || '0'}`;

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
          origin_state: originState,
          dest_state: destState,
          vehicle_size: displaySize,
          vehicle_type: displayType,
          equipment_details: equipmentDetails,
          truck_dimensions: truckDimensions,
          door_dimensions: doorDimensions,
          truck_features: vehicleFeatures,
          dispatcher_name: dispatcherName,
          company_name: companyName,
          company_address: companyAddress,
          company_phone: companyPhone,
          reference_id: `${match?.id ? match.id.slice(0, 8) : 'N/A'}-${email.id?.slice(0, 8) || 'N/A'}`,
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Confirm Before Sending Bid!</DialogTitle>
        </DialogHeader>
        
        <div className="flex gap-2 mb-4">
          <Button 
            className={`flex-1 flex flex-col items-center py-3 ${bidConfirmed ? 'bg-green-600 hover:bg-green-700' : 'bg-pink-500 hover:bg-pink-600'}`}
            onClick={() => setBidConfirmed(true)}
          >
            <span>Confirm Bid</span>
            <span className="text-xl font-bold">$ {bidAmount || '0'}</span>
          </Button>
          <Button 
            variant="outline" 
            className="flex-1"
            disabled={!bidConfirmed || isSending}
            onClick={handleSendBid}
          >
            {isSending ? 'Sending...' : 'Send Bid'}
          </Button>
          <Button 
            className="flex-1 bg-red-500 hover:bg-red-600"
            onClick={() => setShowEmailConfirmDialog(false)}
            disabled={isSending}
          >
            Cancel
          </Button>
        </div>
        
        <div className="border rounded-lg p-4 space-y-3">
          <div className="flex items-start gap-4">
            <span className="font-semibold w-20">Mail To:</span>
            <Input 
              value={toEmail || ''} 
              onChange={(e) => setToEmail(e.target.value)}
              placeholder="Enter email address"
              className="flex-1"
            />
          </div>
          
          <div className="flex items-start gap-4">
            <span className="font-semibold w-20">CC:</span>
            <Input 
              value={ccEmail} 
              onChange={(e) => setCcEmail(e.target.value)}
              placeholder="Add CC email (optional)"
              className="flex-1"
            />
          </div>
          
          <div className="flex items-start gap-4">
            <span className="font-semibold w-20">Subject:</span>
            <span>{emailSubject}</span>
          </div>
          
          <div className="flex items-start gap-4">
            <span className="font-semibold w-20">Message:</span>
            <div className="flex-1 space-y-1">
              <span className="bg-yellow-300 px-1 font-bold">Rate: $ {bidAmount || '0'}</span><br />
              <span className="bg-yellow-300 px-1 font-bold">MC#: {mcNumber}</span><br />
              <span className="bg-yellow-300 px-1 font-bold">USDOT#: {dotNumber}</span>
            </div>
          </div>
          
          <div className="border-t pt-4 space-y-3 text-sm">
            <p>Hello ,</p>
            <p>I have a {displaySize}{displayType}.</p>
            <p>Please let me know if I can help on this load:</p>
            <p>Order Number: {data.order_number || 'N/A'} [{originState} to {destState}]</p>
            
            <div className="space-y-1 mt-4">
              <p><strong>Truck Carries:</strong> {equipmentDetails}</p>
              <p><strong>Truck Size:</strong> {truckDimensions}</p>
              <p><strong>Door Type and Size:</strong> {doorDimensions}</p>
              <p><strong>Truck Features:</strong> {vehicleFeatures}</p>
            </div>
            
            <div className="mt-6 space-y-1">
              <p className="font-bold">{dispatcherName}</p>
              <p>Dispatch</p>
              <p>{companyName}</p>
              <p className="font-bold">MC#: {mcNumber} USDOT#: {dotNumber}</p>
              <p>{companyAddress}</p>
              <p>Cell: <strong>{companyPhone}</strong></p>
              <p>Email: {dispatcherEmailAddr}</p>
            </div>
            
            <div className="mt-4 pt-4 border-t">
              <p className="text-muted-foreground">Reference #: {match?.id ? match.id.slice(0, 8) : 'N/A'}-{email.id?.slice(0, 8) || 'N/A'}</p>
            </div>
          </div>
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
                <Button className="bg-blue-500 hover:bg-blue-600">
                  Wait
                </Button>
                <Button variant="outline">
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
          <div className="fixed inset-0 z-50 bg-background animate-in slide-in-from-bottom">
            <div className="sticky top-0 bg-background border-b p-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Bid Email Preview</h3>
              <Button variant="ghost" size="icon" onClick={() => setShowBidCardOnMap(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="p-3 overflow-auto h-[calc(100vh-60px)]">
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
                    Order# {data.order_number || 'N/A'} [{originState} to {destState}] {displaySize}{displayType} - ${bidAmount || '0'}
                  </div>
                </Card>
                <Card className="p-3 text-sm space-y-2">
                  <p>Hello,</p>
                  <p>I have a {displaySize}{displayType}.</p>
                  <p className="text-blue-600">Please let me know if I can help on this load:</p>
                  <p className="text-blue-600">Order Number: {data.order_number || 'N/A'} [{originCity} to {destCity}]</p>
                  <div className="bg-slate-50 p-2 rounded mt-2 text-xs">
                    <p><strong>We have:</strong> {equipmentDetails}</p>
                    <p><strong>Truck Dimension:</strong> {truckDimensions}</p>
                    <p><strong>Door:</strong> {doorDimensions}</p>
                    <p><strong>Features:</strong> {vehicleFeatures}</p>
                  </div>
                </Card>
                <div className="grid grid-cols-3 gap-2">
                  <Button 
                    size="sm" 
                    className="bg-blue-500 hover:bg-blue-600"
                    onClick={() => setShowEmailConfirmDialog(true)}
                  >
                    Email Bid
                  </Button>
                  <Button size="sm" className="bg-orange-500 hover:bg-orange-600">
                    Place Bid
                  </Button>
                  <Button size="sm" className="bg-green-600 hover:bg-green-700">
                    Book
                  </Button>
                </div>
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
      {/* Original Email Sidebar - Slides in from left */}
      {showOriginalEmail && (
        <div className="absolute left-0 top-0 bottom-0 w-1/2 bg-background z-50 shadow-2xl border-r animate-in slide-in-from-left duration-300 flex flex-col">
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
                      <button className="text-[10px] text-blue-500 hover:underline">View Match History</button>
                    </div>
                  </div>
                </div>

                {/* CARRIER ROWS */}
                <div className="border-b">
                  <div className="grid grid-cols-[2.2fr,1.4fr,1.2fr,1.5fr,1fr,1fr] px-2 py-1.5 text-[11px]">
                    <div className="bg-red-100 -mx-2 px-2 py-1 font-semibold flex items-center">
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
                  <Button size="sm" className="h-8 text-xs flex-1 bg-blue-500 hover:bg-blue-600 whitespace-nowrap font-medium">
                    Mark Unreviewed
                  </Button>
                  <Button size="sm" className="h-8 text-xs flex-1 bg-blue-500 hover:bg-blue-600 whitespace-nowrap font-medium">
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
            
            {/* Original Email Card - Appears on right side over map when Set Bid is clicked */}
            {showBidCardOnMap && !showOriginalEmail && (
              <div className="absolute right-4 top-4 w-[500px] max-h-[calc(100%-2rem)] z-40 animate-in slide-in-from-right duration-300">
                <Card className="shadow-2xl border-2 bg-background flex flex-col max-h-full">
                  <div className="sticky top-0 bg-background border-b p-3 flex items-center justify-between z-10 flex-shrink-0">
                    <h3 className="text-sm font-semibold">Original Email</h3>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => setShowBidCardOnMap(false)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3">
                    <div className="space-y-3">
                      <div className="bg-muted/50 p-2 rounded text-xs">
                        <div className="font-semibold mb-1">To:</div>
                        <Input 
                          value={toEmail || ''} 
                          onChange={(e) => setToEmail(e.target.value)}
                          placeholder="Enter email address"
                          className="h-7 text-xs"
                        />
                      </div>
                      
                      <div className="bg-muted/50 p-2 rounded text-xs">
                        <div className="font-semibold mb-1">CC:</div>
                        <Input 
                          value={ccEmail} 
                          onChange={(e) => setCcEmail(e.target.value)}
                          placeholder="Add CC email (optional)"
                          className="h-7 text-xs"
                        />
                      </div>
                      
                       <div className="bg-muted/50 p-2 rounded text-xs">
                        <div className="font-semibold mb-1">Subject:</div>
                        <div className="text-muted-foreground">
                          Order# {data.order_number || 'N/A'} [{originState} to {destState}] {displaySize}{displayType} - ${bidAmount || '0'}
                        </div>
                      </div>
                      
                      <div className="border rounded p-3 text-xs space-y-2">
                         <p>Hello ,</p>
                        <p>I have a {displaySize}{displayType}.</p>
                         <p className="text-blue-600">Please let me know if I can help on this load:</p>
                        <p className="text-blue-600">Order Number: {data.order_number || '85174'} [{originCity} to {destCity}]</p>
                        
                        <div className="bg-slate-50 p-2 rounded mt-3 space-y-1">
                          <div><strong>We have:</strong> {equipmentDetails}</div>
                          <div><strong>Truck Dimension:</strong> {truckDimensions}</div>
                          <div><strong>Door:</strong> {doorDimensions}</div>
                          <div><strong>Features:</strong> {vehicleFeatures}</div>
                        </div>
                        
                        <div className="bg-blue-50 p-2 rounded mt-2">
                          <p>Our truck is nearby ( {emptyDriveDistance ? `${Math.round(emptyDriveDistance)}mi` : '252mi'} away ). We can pick up on time and deliver as scheduled.</p>
                        </div>
                        
                        <div className="bg-slate-50 p-2 rounded">
                          <p>Driver is U.S. citizen with birth certificate in hand. Clean criminal record.</p>
                        </div>
                        
                        <div className="bg-blue-50 p-2 rounded">
                          <p>Due to increased fuel costs, this bid includes a $ {data.fuel_surcharge || '375.00'} fuel surcharge.</p>
                        </div>
                        
                        <div className="flex gap-2 mt-3">
                          <Button 
                            size="sm" 
                            className="bg-blue-500 hover:bg-blue-600 text-xs h-8"
                            onClick={() => setShowEmailConfirmDialog(true)}
                          >
                            Email Bid
                          </Button>
                          <Button size="sm" className="bg-orange-500 hover:bg-orange-600 text-xs h-8">
                            Mark as Place Bid
                          </Button>
                          <Button size="sm" className="bg-green-600 hover:bg-green-700 text-xs h-8">
                            Book Load
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
            )}
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
    </>
  );
};

export default LoadEmailDetail;
