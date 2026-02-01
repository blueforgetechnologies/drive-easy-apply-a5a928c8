import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { TableCell, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { X, MoreVertical, Wrench, Truck } from "lucide-react";
import type { ActiveFilter, LoadHunterTheme } from "@/types/loadHunter";
import { cleanCompanyName } from "@/lib/companyName";

// Broker credit status type
type BrokerApprovalStatus = 'approved' | 'not_approved' | 'not_found' | 'call_otr' | 'unchecked' | 'checking' | string;

// Map status to colors - grey if no MC number available
const getStatusColor = (status: BrokerApprovalStatus | null | undefined, hasMc: boolean = true): { dot: string; text: string; label: string } => {
  // If no MC number, always show grey
  if (!hasMc) {
    return { dot: 'bg-gray-400', text: 'text-gray-500', label: 'No MC' };
  }
  
  switch (status) {
    case 'approved':
      return { dot: 'bg-green-500', text: 'text-green-600', label: 'Approved' };
    case 'not_approved':
      return { dot: 'bg-red-500', text: 'text-red-600', label: 'Not Approved' };
    case 'not_found':
      return { dot: 'bg-gray-900 dark:bg-gray-100', text: 'text-gray-700', label: 'Not Found' };
    case 'call_otr':
      return { dot: 'bg-orange-500', text: 'text-orange-600', label: 'Call OTR' };
    case 'checking':
      return { dot: 'bg-blue-400 animate-pulse', text: 'text-blue-600', label: 'Checking...' };
    case 'unchecked':
    default:
      return { dot: 'bg-orange-400', text: 'text-muted-foreground', label: 'Unchecked' };
  }
};

interface LoadHunterTableRowEnhancedProps {
  item: any;
  email: any;
  match: any | null;
  rowIndex: number;
  activeFilter: ActiveFilter;
  loadHunterTheme: LoadHunterTheme;
  showIdColumns: boolean;
  // Data lookups
  vehicles: any[];
  huntPlans: any[];
  carriersMap: Record<string, string>;
  allDispatchers: any[];
  loadDistances: Map<string, number>;
  loadHuntMap: Map<string, string>;
  currentDispatcherInfo: { id: string; first_name: string; last_name: string } | null;
  // Callbacks
  getDriverName: (driverId: string | null) => string | null;
  onRowClick: (email: any, match: any | null, item: any) => void;
  onSkip: (emailId: string, matchId?: string) => void;
  onWaitlist: (emailId: string, matchId?: string) => void;
  onBook: (match: any, email: any) => void;
  // NEW: Broker credit status map
  brokerStatusMap?: Map<string, { status: string; brokerName?: string; mcNumber?: string }>;
}

export function LoadHunterTableRowEnhanced({
  item,
  email,
  match,
  rowIndex,
  activeFilter,
  loadHunterTheme,
  showIdColumns,
  vehicles,
  huntPlans,
  carriersMap,
  allDispatchers,
  loadDistances,
  loadHuntMap,
  currentDispatcherInfo,
  getDriverName,
  onRowClick,
  onSkip,
  onWaitlist,
  onBook,
  brokerStatusMap,
}: LoadHunterTableRowEnhancedProps) {
  const navigate = useNavigate();
  
  // Parse data from email
  const data = email?.parsed_data || {};
  const isFailed = email?._source === 'failed' || email?.status === 'failed';
  
  // Get hunt plan for available feet display
  const matchHuntPlan = useMemo(() => {
    return match ? huntPlans.find(hp => hp.id === (item as any).hunt_plan_id) : null;
  }, [match, huntPlans, item]);

  // Time calculations
  const { receivedAgo, exactReceived, isNewlyProcessed, expiresIn } = useMemo(() => {
    const processedDate = new Date(email?.created_at);
    const receivedDate = new Date(email?.received_at);
    const now = new Date();
    
    // Time since processed (for NEW badge)
    const diffMs = now.getTime() - processedDate.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const isNew = diffMins <= 2 && !isFailed;
    
    // Time since received
    const receivedDiffMs = now.getTime() - receivedDate.getTime();
    const receivedDiffSecs = Math.floor(receivedDiffMs / 1000);
    const receivedDiffMins = Math.floor(receivedDiffSecs / 60);
    const receivedDiffHours = Math.floor(receivedDiffMins / 60);
    const receivedDiffDays = Math.floor(receivedDiffHours / 24);
    
    let ago = '';
    if (receivedDiffDays > 0) ago = `${receivedDiffDays}d ${receivedDiffHours % 24}h ago`;
    else if (receivedDiffHours > 0) ago = `${receivedDiffHours}h ${receivedDiffMins % 60}m ago`;
    else ago = `${receivedDiffMins}m ${receivedDiffSecs % 60}s ago`;
    
    const exact = receivedDate.toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
    });
    
    // Expiration calculation
    let expires = '';
    if (email?.expires_at) {
      const expiresDate = new Date(email.expires_at);
      const timeUntilExpiration = expiresDate.getTime() - now.getTime();
      const minsUntilExpiration = Math.floor(timeUntilExpiration / 60000);
      
      if (minsUntilExpiration > 60) {
        const hours = Math.floor(minsUntilExpiration / 60);
        const mins = minsUntilExpiration % 60;
        expires = `${hours}h ${mins}m`;
      } else if (minsUntilExpiration > 0) {
        expires = `${minsUntilExpiration}m`;
      } else {
        const expiredMins = Math.abs(minsUntilExpiration);
        if (expiredMins > 60) {
          const hours = Math.floor(expiredMins / 60);
          const mins = expiredMins % 60;
          expires = `-${hours}h ${mins}m`;
        } else {
          expires = `-${expiredMins}m`;
        }
      }
    } else {
      expires = '—';
    }
    
    return { receivedAgo: ago, exactReceived: exact, isNewlyProcessed: isNew, expiresIn: expires };
  }, [email, isFailed]);

  // Normalize date/time helpers
  const normalizeDate = (dateStr: string | undefined): string => {
    if (!dateStr) return '';
    const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      const [, year, month, day] = isoMatch;
      return `${month}/${day}/${year.slice(2)}`;
    }
    return dateStr;
  };

  const normalizeTime = (timeStr: string | undefined): string => {
    if (!timeStr) return '';
    return timeStr.replace(/\s+[A-Z]{2,4}$/i, '');
  };

  // Pickup/Delivery display
  const { pickupDisplay, deliveryDisplay } = useMemo(() => {
    const normPickupDate = normalizeDate(data.pickup_date);
    const normPickupTime = normalizeTime(data.pickup_time);
    let pickup = '';
    if (normPickupDate && normPickupTime) pickup = `${normPickupDate} ${normPickupTime}`;
    else if (normPickupDate) pickup = normPickupDate;
    else if (normPickupTime) pickup = normPickupTime;
    if (!pickup) pickup = '—';

    const normDeliveryDate = normalizeDate(data.delivery_date);
    const normDeliveryTime = normalizeTime(data.delivery_time);
    let delivery = '';
    if (normDeliveryDate && normDeliveryTime) delivery = `${normDeliveryDate} ${normDeliveryTime}`;
    else if (normDeliveryDate) delivery = normDeliveryDate;
    else if (normDeliveryTime) delivery = normDeliveryTime;
    if (!delivery) delivery = '—';

    return { pickupDisplay: pickup, deliveryDisplay: delivery };
  }, [data]);

  // Email source
  const emailSource = useMemo(() => {
    const rawSource = (item as any).email_source || email?.email_source || 'sylectus';
    const fromEmail = (email?.from_email || '').toLowerCase();
    if (fromEmail.includes('fullcircletms.com') || fromEmail.includes('fctms.com')) {
      return 'fullcircle';
    }
    return rawSource;
  }, [item, email]);

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

  const source = sourceConfig[emailSource] || { 
    label: emailSource, 
    gradient: 'bg-gradient-to-br from-gray-400/90 to-gray-500/90',
    shadow: 'shadow-[0_3px_12px_-2px_rgba(107,114,128,0.5),inset_0_1px_1px_rgba(255,255,255,0.3)]'
  };

  // Check grouped matches
  const isGroupedRow = activeFilter === 'unreviewed' && (item as any)._isGrouped;
  const matchCount = (item as any)._matchCount || 1;

  // Received time color
  const receivedDiffMins = useMemo(() => {
    const receivedDate = new Date(email?.received_at);
    const now = new Date();
    return Math.floor((now.getTime() - receivedDate.getTime()) / 60000);
  }, [email]);

  if (!email) return null;

  return (
    <TableRow 
      key={activeFilter === 'unreviewed' ? (match as any)?.id : email.id} 
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
      onClick={() => onRowClick(email, match, item)}
    >
      {/* Expand/collapse placeholder cell - show FAILED badge for failed items */}
      <TableCell className="p-0 w-0">
        {isFailed && (
          <Badge variant="destructive" className="text-[9px] px-1 py-0 ml-1">
            FAILED
          </Badge>
        )}
      </TableCell>

      {/* ID Columns */}
      {showIdColumns && (
        <>
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
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/dashboard/development?tab=parser-helper&loadId=${email.load_id}`);
                  }}
                >
                  <Wrench className="h-3 w-3" />
                  Open in Parser Helper
                </Button>
              </HoverCardContent>
            </HoverCard>
          </TableCell>
          {activeFilter !== 'all' && (
            <TableCell className="py-1">
              <div className="text-[12px] font-mono text-muted-foreground leading-tight whitespace-nowrap">
                {match ? (match as any).id?.substring(0, 8) : '—'}
              </div>
            </TableCell>
          )}
        </>
      )}

      {/* Truck - Drivers / Carrier column */}
      {activeFilter !== 'all' && (
        <TableCell className="py-1">
          {(() => {
            const viewingMatches = ['unreviewed', 'missed', 'skipped', 'mybids', 'booked', 'undecided', 'waitlist'].includes(activeFilter);
            
            if (viewingMatches && match) {
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
            }
            
            // Fallback: lookup from hunt map
            const matchingHuntId = loadHuntMap.get(email.id);
            const matchingHunt = matchingHuntId ? huntPlans.find(plan => plan.id === matchingHuntId) : undefined;
            
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
            
            const brokerName = data.broker || data.broker_company || data.customer || email.from_name || email.from_email?.split('@')[0];
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

      {/* Customer - with broker credit status indicator */}
      <TableCell className="py-1">
        {(() => {
          // Sanitize customer name - use centralized cleanCompanyName utility
          const rawCustomerName = data.broker_company || data.broker || data.customer || email.from_name || 'Unknown';
          
          // Use centralized utility that strips Phone/Email/MC metadata
          let cleanName = cleanCompanyName(rawCustomerName);
          
          // Additional safety: if still too long or contains email patterns, extract first meaningful part
          if (cleanName.length > 60 || cleanName.includes('\n') || cleanName.includes('Subject:')) {
            const firstLine = cleanName.split(/[\n\r]/)[0].trim();
            cleanName = firstLine.length > 0 && firstLine.length < 60 ? firstLine : cleanName.substring(0, 60);
          }
          
          // Final safety truncation for tooltip display
          cleanName = cleanName.length > 60 ? cleanName.substring(0, 57) + '...' : cleanName;
          if (!cleanName) cleanName = 'Unknown';
          
          const truncatedName = cleanName.length > 14 ? cleanName.slice(0, 14) + '...' : cleanName;
          
          // Get broker credit status from the map (keyed by load_email_id)
          const brokerStatus = brokerStatusMap?.get(email.id);
          // Check if MC is available from broker status or parsed email data
          const hasMc = !!(brokerStatus?.mcNumber || data.mc_number);
          const statusColors = getStatusColor(brokerStatus?.status, hasMc);
          
          return (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 whitespace-nowrap cursor-default">
                    {/* Colored dot (egg) indicator for broker approval status */}
                    <div 
                      className={`w-3 h-3 rounded-full flex-shrink-0 ${statusColors.dot}`}
                      style={{ 
                        boxShadow: '0 1px 3px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.3)',
                      }}
                    />
                    {/* Customer name with status-based color */}
                    <div className={`text-[13px] font-medium leading-tight whitespace-nowrap ${statusColors.text}`}>
                      {truncatedName}
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs max-w-[300px]">
                  <div className="space-y-1">
                    <p className="font-medium break-words">{cleanName}</p>
                    <p className="text-muted-foreground">
                      Factoring: <span className={`font-semibold ${statusColors.text}`}>{statusColors.label}</span>
                    </p>
                    {data.mc_number && (
                      <p className="text-muted-foreground">MC# {data.mc_number}</p>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        })()}
      </TableCell>

      {/* Received / Expires */}
      {activeFilter !== 'mybids' && activeFilter !== 'booked' && (
        <TableCell className="py-1">
          <div className="flex items-center gap-1">
            <span 
              className={`text-[13px] leading-tight whitespace-nowrap font-medium ${
                receivedDiffMins >= 15 ? 'text-red-500' : receivedDiffMins >= 5 ? 'text-orange-500' : 'text-green-500'
              }`} 
              title={exactReceived}
            >
              {receivedAgo}
            </span>
            {isNewlyProcessed && (
              <Badge variant="default" className="h-4 px-1 text-[10px] bg-green-500 hover:bg-green-500 text-black font-semibold">NEW</Badge>
            )}
            {email.is_update && (
              <Badge variant="outline" className="h-4 px-1 text-[10px] border-yellow-500 text-yellow-600 font-semibold" title="Updated version">UPD</Badge>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground leading-tight whitespace-nowrap">
            {email.expires_at ? new Date(email.expires_at).toLocaleString('en-US', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}
          </div>
        </TableCell>
      )}

      {/* Pickup Time / Deliver Time */}
      <TableCell className="py-1">
        <div className="text-[13px] leading-tight whitespace-nowrap">{pickupDisplay}</div>
        <div className="text-[13px] leading-tight whitespace-nowrap">{deliveryDisplay}</div>
      </TableCell>

      {/* Origin / Destination */}
      <TableCell className="py-1">
        <div className="text-[13px] font-medium leading-tight whitespace-nowrap">
          {data.origin_city || '—'}, {data.origin_state || '—'}
        </div>
        <div className="text-[13px] leading-tight whitespace-nowrap">
          {data.destination_city || '—'}, {data.destination_state || '—'}
        </div>
      </TableCell>

      {/* Empty / Loaded Miles */}
      <TableCell className="py-1">
        <div className="text-[13px] leading-tight whitespace-nowrap">
          {(() => {
            if (match && (match as any).distance_miles != null) {
              return `${Number((match as any).distance_miles).toFixed(2)} mi`;
            }
            if (loadDistances.has(email.id)) {
              return `${Number(loadDistances.get(email.id)).toFixed(2)} mi`;
            }
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

      {/* Vehicle Type / Weight */}
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

      {/* Pieces / Dims */}
      <TableCell className="py-1">
        <div className="text-[13px] leading-tight whitespace-nowrap">{data?.pieces !== undefined && data?.pieces !== null ? data.pieces : '—'}</div>
        <div className="text-[12px] text-muted-foreground leading-tight whitespace-nowrap">
          {data?.dimensions ? (data.dimensions.trim().toLowerCase() === 'no dimensions specified' ? 'No Dim Specified' : data.dimensions) : '—'}
        </div>
      </TableCell>

      {/* Avail / Posted (Available Feet + Rate) */}
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

      {/* Source Badge */}
      <TableCell className="py-1">
        <Badge 
          variant="secondary" 
          className={`text-[10px] h-5 px-2 font-semibold text-white border border-white/30 backdrop-blur-sm whitespace-nowrap ${source.gradient} ${source.shadow} hover:scale-105 transition-transform duration-150`}
        >
          {source.label}
        </Badge>
      </TableCell>

      {/* Actions (for non-bid/booked tabs) */}
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
                onSkip(email.id, match?.id);
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
                onWaitlist(email.id, match?.id);
              }}
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </Button>
          </div>
        </TableCell>
      )}

      {/* My Bids columns */}
      {activeFilter === 'mybids' && (
        <>
          <TableCell className="py-1">
            <div className="text-[13px] font-medium leading-tight whitespace-nowrap">
              {(item as any).bid_rate ? `$${Number((item as any).bid_rate).toLocaleString()}` : (data.rate ? `$${Number(data.rate).toLocaleString()}` : '—')}
            </div>
          </TableCell>
          <TableCell className="py-1">
            <div className="text-[13px] leading-tight whitespace-nowrap">
              {(() => {
                const bidBy = (item as any).bid_by;
                if (bidBy) {
                  if (currentDispatcherInfo?.id === bidBy) {
                    return `${currentDispatcherInfo.first_name} ${currentDispatcherInfo.last_name?.[0] || ''}.`;
                  }
                  const dispatcher = allDispatchers.find(d => d.id === bidBy);
                  if (dispatcher) {
                    return `${dispatcher.first_name} ${dispatcher.last_name?.[0] || ''}.`;
                  }
                  return bidBy.slice(0, 8);
                }
                return '—';
              })()}
            </div>
          </TableCell>
          <TableCell className="py-1">
            {(item as any).booked_load_id ? (
              <Button size="sm" className="h-6 px-2 text-[11px] font-semibold bg-yellow-500 hover:bg-yellow-500 text-white cursor-default" disabled>
                BOOKED
              </Button>
            ) : (
              <Button
                size="sm"
                className="h-6 px-2 text-[11px] font-semibold btn-glossy-success text-white"
                onClick={(e) => {
                  e.stopPropagation();
                  onBook(item, email);
                }}
              >
                BOOK IT
              </Button>
            )}
          </TableCell>
          <TableCell className="py-1">
            <div className="text-[13px] leading-tight whitespace-nowrap">
              {(() => {
                const bidTime = (item as any).bid_at || (item as any).updated_at;
                if (bidTime) {
                  return new Date(bidTime).toLocaleString('en-US', {
                    month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
                  });
                }
                return '—';
              })()}
            </div>
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

      {/* Booked columns */}
      {activeFilter === 'booked' && (
        <>
          <TableCell className="py-1">
            <div className="text-[13px] font-medium leading-tight whitespace-nowrap">
              {(item as any).bid_rate ? `$${Number((item as any).bid_rate).toLocaleString()}` : (data.rate ? `$${Number(data.rate).toLocaleString()}` : '—')}
            </div>
          </TableCell>
          <TableCell className="py-1">
            <div className="text-[13px] leading-tight whitespace-nowrap">
              {(() => {
                const bidBy = (item as any).bid_by;
                if (bidBy) {
                  if (currentDispatcherInfo?.id === bidBy) {
                    return `${currentDispatcherInfo.first_name} ${currentDispatcherInfo.last_name?.[0] || ''}.`;
                  }
                  const dispatcher = allDispatchers.find(d => d.id === bidBy);
                  if (dispatcher) {
                    return `${dispatcher.first_name} ${dispatcher.last_name?.[0] || ''}.`;
                  }
                  return bidBy.slice(0, 8);
                }
                return '—';
              })()}
            </div>
          </TableCell>
        </>
      )}
    </TableRow>
  );
}
