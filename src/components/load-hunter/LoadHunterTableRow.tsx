import React from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { X, MoreVertical, Truck } from "lucide-react";
import type { Vehicle, HuntPlan, ActiveFilter, LoadHunterTheme } from "@/types/loadHunter";

interface LoadHunterTableRowProps {
  item: any;
  email: any;
  match: any | null;
  matchHuntPlan: HuntPlan | null;
  rowIndex: number;
  activeFilter: ActiveFilter;
  loadHunterTheme: LoadHunterTheme;
  showIdColumns: boolean;
  vehicles: Vehicle[];
  carriersMap: Record<string, string>;
  huntPlans: HuntPlan[];
  loadHuntMap: Map<string, string>;
  loadDistances: Map<string, number>;
  loadMatches: any[];
  currentDispatcherInfo: { id: string; first_name: string; last_name?: string } | null;
  allDispatchers: { id: string; first_name: string; last_name?: string }[];
  getDriverName: (driverId: string | null | undefined) => string | null;
  onRowClick: (email: any, match: any, item: any) => void;
  onSkip: (emailId: string, matchId?: string) => void;
  onWaitlist: (emailId: string, matchId?: string) => void;
  onWaitlistMatch: (matchId: string) => void;
  onBook: (match: any, email: any) => void;
}

export function LoadHunterTableRow({
  item,
  email,
  match,
  matchHuntPlan,
  rowIndex,
  activeFilter,
  loadHunterTheme,
  showIdColumns,
  vehicles,
  carriersMap,
  huntPlans,
  loadHuntMap,
  loadDistances,
  loadMatches,
  currentDispatcherInfo,
  allDispatchers,
  getDriverName,
  onRowClick,
  onSkip,
  onWaitlist,
  onWaitlistMatch,
  onBook,
}: LoadHunterTableRowProps) {
  const data = email.parsed_data || {};
  const isFailed = email.status === 'failed' || email.status === 'parsing_failed';
  
  // Calculate time-based values
  const processedDate = new Date(email.processed_at || email.received_at);
  const receivedDate = new Date(email.received_at);
  const now = new Date();
  
  const diffMs = now.getTime() - processedDate.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const isNewlyProcessed = diffMins <= 2 && !isFailed;
  
  const receivedDiffMs = now.getTime() - receivedDate.getTime();
  const receivedDiffSecs = Math.floor(receivedDiffMs / 1000);
  const receivedDiffMins = Math.floor(receivedDiffSecs / 60);
  const receivedDiffHours = Math.floor(receivedDiffMins / 60);
  const receivedDiffDays = Math.floor(receivedDiffHours / 24);
  
  // Format relative time
  let receivedAgo = '';
  if (receivedDiffDays > 0) receivedAgo = `${receivedDiffDays}d ${receivedDiffHours % 24}h ago`;
  else if (receivedDiffHours > 0) receivedAgo = `${receivedDiffHours}h ${receivedDiffMins % 60}m ago`;
  else receivedAgo = `${receivedDiffMins}m ${receivedDiffSecs % 60}s ago`;
  
  const exactReceived = receivedDate.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

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

  // Helper to normalize date format
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

  // Build pickup/delivery displays
  const normPickupDate = normalizeDate(data.pickup_date);
  const normPickupTime = normalizeTime(data.pickup_time);
  let pickupDisplay = '';
  if (normPickupDate && normPickupTime) {
    pickupDisplay = `${normPickupDate} ${normPickupTime}`;
  } else if (normPickupDate) {
    pickupDisplay = normPickupDate;
  } else if (normPickupTime) {
    pickupDisplay = normPickupTime;
  }
  if (!pickupDisplay) pickupDisplay = '—';

  const normDeliveryDate = normalizeDate(data.delivery_date);
  const normDeliveryTime = normalizeTime(data.delivery_time);
  let deliveryDisplay = '';
  if (normDeliveryDate && normDeliveryTime) {
    deliveryDisplay = `${normDeliveryDate} ${normDeliveryTime}`;
  } else if (normDeliveryDate) {
    deliveryDisplay = normDeliveryDate;
  } else if (normDeliveryTime) {
    deliveryDisplay = normDeliveryTime;
  }
  if (!deliveryDisplay) deliveryDisplay = '—';

  // Check for grouped matches
  const isGroupedRow = activeFilter === 'unreviewed' && (item as any)._isGrouped;
  const matchCount = (item as any)._matchCount || 1;

  // Get email source
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
      {/* Failed badge cell */}
      <TableCell className="p-0 w-0">
        {isFailed && (
          <Badge variant="destructive" className="text-[9px] px-1 py-0 ml-1">
            FAILED
          </Badge>
        )}
      </TableCell>

      {/* ID columns */}
      {showIdColumns && (
        <>
          <TableCell className="py-1">
            <div className="text-[13px] font-semibold leading-tight whitespace-nowrap">
              {isFailed ? (
                <span className="text-red-600" title={email.issue_notes}>
                  {email.subject?.substring(0, 30) || 'Processing Error'}...
                </span>
              ) : (
                data.order_number || '—'
              )}
            </div>
          </TableCell>
          <TableCell className="py-1">
            <HoverCard>
              <HoverCardTrigger asChild>
                <div className="text-[12px] font-mono text-muted-foreground leading-tight whitespace-nowrap cursor-help">
                  {email.load_id?.substring(0, 12) || '—'}
                </div>
              </HoverCardTrigger>
              <HoverCardContent className="w-auto">
                <div className="text-sm font-mono">{email.load_id || 'No Load ID'}</div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(`/dashboard/tools?tab=parser&loadId=${email.load_id}`, '_blank');
                  }}
                >
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

      {/* Vehicle/Truck column */}
      {activeFilter !== 'all' && (
        <TableCell className="py-1">
          {(() => {
            const viewingMatches = activeFilter === 'unreviewed' || activeFilter === 'missed' || activeFilter === 'skipped' || activeFilter === 'mybids' || activeFilter === 'booked' || activeFilter === 'undecided' || activeFilter === 'waitlist';
            
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
            } else {
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

      {/* Customer column */}
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

      {/* Received/Expires column */}
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

      {/* Pickup/Delivery Time column */}
      <TableCell className="py-1">
        <div className="text-[13px] leading-tight whitespace-nowrap">{pickupDisplay}</div>
        <div className="text-[13px] leading-tight whitespace-nowrap">{deliveryDisplay}</div>
      </TableCell>

      {/* Origin/Destination column */}
      <TableCell className="py-1">
        <div className="text-[13px] font-medium leading-tight whitespace-nowrap">
          {data.origin_city || '—'}, {data.origin_state || '—'}
        </div>
        <div className="text-[13px] leading-tight whitespace-nowrap">
          {data.destination_city || '—'}, {data.destination_state || '—'}
        </div>
      </TableCell>

      {/* Empty/Loaded miles column */}
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

      {/* Vehicle Type/Weight column */}
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

      {/* Pieces/Dims column */}
      <TableCell className="py-1">
        <div className="text-[13px] leading-tight whitespace-nowrap">{data?.pieces !== undefined && data?.pieces !== null ? data.pieces : '—'}</div>
        <div className="text-[12px] text-muted-foreground leading-tight whitespace-nowrap">{data?.dimensions ? (data.dimensions.trim().toLowerCase() === 'no dimensions specified' ? 'No Dim Specified' : data.dimensions) : '—'}</div>
      </TableCell>

      {/* Avail/Posted column */}
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

      {/* Source column */}
      <TableCell className="py-1">
        <Badge 
          variant="secondary" 
          className={`text-[10px] h-5 px-2 font-semibold text-white border border-white/30 backdrop-blur-sm whitespace-nowrap ${config.gradient} ${config.shadow} hover:scale-105 transition-transform duration-150`}
        >
          {config.label}
        </Badge>
      </TableCell>

      {/* Actions column (not mybids/booked) */}
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
                if (activeFilter === 'unreviewed' && match) {
                  onWaitlistMatch((match as any).id);
                } else {
                  onWaitlist(email.id, match?.id);
                }
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
              {(() => {
                const bidItem = item as any;
                if (bidItem.bid_rate) {
                  return `$${Number(bidItem.bid_rate).toLocaleString()}`;
                }
                return data.rate ? `$${Number(data.rate).toLocaleString()}` : '—';
              })()}
            </div>
          </TableCell>
          <TableCell className="py-1">
            <div className="text-[13px] leading-tight whitespace-nowrap">
              {(() => {
                const bidItem = item as any;
                if (bidItem.bid_by) {
                  if (currentDispatcherInfo?.id === bidItem.bid_by) {
                    return `${currentDispatcherInfo.first_name} ${currentDispatcherInfo.last_name?.[0] || ''}.`;
                  }
                  return bidItem.bid_by.slice(0, 8);
                }
                return '—';
              })()}
            </div>
          </TableCell>
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
                const bidItem = item as any;
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
              {(() => {
                const bookedItem = item as any;
                if (bookedItem.bid_rate) {
                  return `$${Number(bookedItem.bid_rate).toLocaleString()}`;
                }
                return data.rate ? `$${Number(data.rate).toLocaleString()}` : '—';
              })()}
            </div>
          </TableCell>
          <TableCell className="py-1">
            <div className="text-[13px] leading-tight whitespace-nowrap">
              {(() => {
                const bookedItem = item as any;
                if (bookedItem.bid_by) {
                  if (currentDispatcherInfo?.id === bookedItem.bid_by) {
                    return `${currentDispatcherInfo.first_name} ${currentDispatcherInfo.last_name?.[0] || ''}.`;
                  }
                  const dispatcher = allDispatchers.find(d => d.id === bookedItem.bid_by);
                  if (dispatcher) {
                    return `${dispatcher.first_name} ${dispatcher.last_name?.[0] || ''}.`;
                  }
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
}
