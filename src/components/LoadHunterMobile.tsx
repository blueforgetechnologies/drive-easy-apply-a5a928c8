import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { 
  RefreshCw, ChevronRight, MapPin, Truck, Target, 
  Filter, Clock, Package, ArrowRight, X, Check, 
  SkipForward, AlertTriangle, Volume2, VolumeX, List,
  Timer, Pause, FileQuestion, DollarSign, Scale, Ruler, Box, Calendar
} from "lucide-react";
import oilChangeIcon from '@/assets/oil-change-icon.png';
import checkEngineIcon from '@/assets/check-engine-icon.png';
import { cleanLoadNotes } from "@/lib/companyName";

interface Vehicle {
  id: string;
  vehicle_number: string | null;
  carrier: string | null;
  asset_type: string | null;
  asset_subtype: string | null;
  dimensions_length: number | null;
  driver_1_id: string | null;
  status: string;
  last_location: string | null;
  oil_change_remaining: number | null;
  fault_codes: any;
  speed: number | null;
  stopped_status: string | null;
}

interface HuntPlan {
  id: string;
  vehicleId: string;
  planName: string;
  vehicleSizes: string[];
  zipCode: string;
  pickupRadius: string;
  enabled: boolean;
  notes?: string;
  availableDate?: string;
  availableTime?: string;
  availableFeet?: string;
}

interface LoadHunterMobileProps {
  // Props passed from parent
  vehicles: Vehicle[];
  huntPlans: HuntPlan[];
  loadEmails: any[];
  unreviewedViewData: any[];
  skippedMatches: any[];
  bidMatches: any[];
  undecidedMatches: any[];
  waitlistMatches: any[];
  missedHistory: any[];
  loadMatches: any[];
  loading: boolean;
  refreshing: boolean;
  activeFilter: string;
  filterVehicleId: string | null;
  activeMode: 'admin' | 'dispatch';
  myVehicleIds: string[];
  isSoundMuted: boolean;
  carriersMap: Record<string, string>;
  onRefresh: () => void;
  onFilterChange: (filter: string, vehicleId?: string | null) => void;
  onModeChange: (mode: 'admin' | 'dispatch') => void;
  onToggleSound: () => void;
  onSelectLoad: (email: any, match?: any) => void;
  onSkipMatch: (matchId: string) => void;
  onToggleHunt: (huntId: string, enabled: boolean) => void;
  getDriverName: (driverId: string | null) => string;
}

export default function LoadHunterMobile({
  vehicles,
  huntPlans,
  loadEmails,
  unreviewedViewData,
  skippedMatches,
  bidMatches,
  undecidedMatches = [],
  waitlistMatches = [],
  missedHistory,
  loadMatches,
  loading,
  refreshing,
  activeFilter,
  filterVehicleId,
  activeMode,
  myVehicleIds,
  isSoundMuted,
  carriersMap,
  onRefresh,
  onFilterChange,
  onModeChange,
  onToggleSound,
  onSelectLoad,
  onSkipMatch,
  onToggleHunt,
  getDriverName,
}: LoadHunterMobileProps) {
  const [vehicleSheetOpen, setVehicleSheetOpen] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'trucks' | 'loads'>('trucks');

  // Filter counts
  const getFilterCount = (filter: string) => {
    switch (filter) {
      case 'unreviewed':
        return unreviewedViewData.length;
      case 'skipped':
        return skippedMatches.length;
      case 'mybids':
        return bidMatches.length;
      case 'undecided':
        return undecidedMatches.length;
      case 'waitlist':
        return waitlistMatches.length;
      case 'missed':
        return missedHistory.length;
      case 'issues':
        return loadEmails.filter(e => e.has_issues).length;
      case 'all':
        return loadEmails.length;
      default:
        return 0;
    }
  };

  // Group matches by load_email_id for unreviewed tab
  const groupMatchesByLoad = (matches: any[]): any[] => {
    if (matches.length === 0) return [];
    
    const grouped = new Map<string, any[]>();
    matches.forEach(match => {
      const key = match.load_email_id;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(match);
    });
    
    const result: any[] = [];
    grouped.forEach((matchesForLoad) => {
      // Sort: prioritize user's vehicles first, then by distance
      const sortedMatches = [...matchesForLoad].sort((a, b) => {
        const aIsMyVehicle = myVehicleIds.includes(a.vehicle_id) ? 0 : 1;
        const bIsMyVehicle = myVehicleIds.includes(b.vehicle_id) ? 0 : 1;
        if (aIsMyVehicle !== bIsMyVehicle) return aIsMyVehicle - bIsMyVehicle;
        return (a.distance_miles || 999) - (b.distance_miles || 999);
      });
      
      const primaryMatch = sortedMatches[0];
      result.push({
        ...primaryMatch,
        _allMatches: sortedMatches,
        _matchCount: sortedMatches.length,
        _isGrouped: sortedMatches.length > 1,
      });
    });
    
    return result.sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime());
  };

  // Get display data based on active filter
  const getDisplayData = () => {
    let data: any[] = [];
    
    switch (activeFilter) {
      case 'unreviewed':
        // Apply grouping for unreviewed matches
        data = groupMatchesByLoad(unreviewedViewData);
        break;
      case 'skipped':
        data = skippedMatches.map(m => ({
          ...loadEmails.find(e => e.id === m.load_email_id),
          match: m
        })).filter(d => d.id);
        break;
      case 'mybids':
        data = bidMatches.map(m => ({
          ...loadEmails.find(e => e.id === m.load_email_id),
          match: m
        })).filter(d => d.id);
        break;
      case 'undecided':
        data = undecidedMatches.map(m => ({
          ...loadEmails.find(e => e.id === m.load_email_id),
          match: m
        })).filter(d => d.id);
        break;
      case 'waitlist':
        data = waitlistMatches.map(m => ({
          ...loadEmails.find(e => e.id === m.load_email_id),
          match: m
        })).filter(d => d.id);
        break;
      case 'missed':
        data = missedHistory;
        break;
      case 'issues':
        data = loadEmails.filter(e => e.has_issues);
        break;
      case 'all':
      default:
        data = loadEmails;
        break;
    }

    // Filter by vehicle ID if filterVehicleId is set (from badge click)
    if (filterVehicleId) {
      if (activeFilter === 'unreviewed') {
        data = data.filter(item => item.vehicle_id === filterVehicleId);
      } else if (['skipped', 'mybids', 'undecided', 'waitlist'].includes(activeFilter)) {
        data = data.filter(item => item.match?.vehicle_id === filterVehicleId);
      } else if (activeFilter === 'missed') {
        data = data.filter(item => item.vehicle_id === filterVehicleId);
      }
    }
    // Also filter by selected vehicle if one is selected (from UI selection)
    else if (selectedVehicleId) {
      if (activeFilter === 'unreviewed') {
        data = data.filter(item => item.vehicle_id === selectedVehicleId);
      } else if (activeFilter === 'missed') {
        data = data.filter(item => item.vehicle_id === selectedVehicleId);
      }
    }

    return data.slice(0, 100); // Increased limit for better coverage
  };

  const displayData = getDisplayData();
  const filteredVehicles = vehicles.filter(v => activeMode === 'admin' || myVehicleIds.includes(v.id));

  // Primary filter tabs (most important) - Hunts is special (shows trucks view)
  const primaryFilterTabs = [
    { id: 'hunts', label: 'Hunts', icon: Truck, color: 'bg-blue-500', isTrucksView: true },
    { id: 'unreviewed', label: 'Unreviewed', icon: Target, color: 'bg-primary' },
    { id: 'missed', label: 'Missed', icon: AlertTriangle, color: 'bg-destructive' },
  ];

  // Secondary filter tabs (scrollable row)
  const secondaryFilterTabs = [
    { id: 'waitlist', label: 'Wait', icon: Timer },
    { id: 'undecided', label: 'Undec', icon: FileQuestion },
    { id: 'mybids', label: 'My Bids', icon: DollarSign },
    { id: 'skipped', label: 'Skip', icon: SkipForward },
    { id: 'all', label: 'All', icon: List },
  ];

  // Count for Hunts tab (vehicles with enabled hunt plans)
  const huntsCount = filteredVehicles.filter(v => 
    huntPlans.some(p => p.vehicleId === v.id && p.enabled)
  ).length;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Mobile Header */}
      <div className="sticky top-0 z-40 bg-card border-b px-3 py-2 space-y-2">
        {/* Top Row - Scope Toggle & Actions */}
        <div className="flex items-center justify-between gap-2">
          {/* Scope Toggle - Independent from status filters */}
          <div className="flex rounded-full border bg-muted/50 p-0.5">
            <Button
              size="sm"
              variant={activeMode === 'dispatch' ? 'default' : 'ghost'}
              className={`h-7 px-3 text-xs rounded-full gap-1.5 ${
                activeMode === 'dispatch' ? 'shadow-sm' : ''
              }`}
              onClick={() => onModeChange('dispatch')}
            >
              My Trucks
              <Badge variant={activeMode === 'dispatch' ? 'secondary' : 'outline'} className="h-5 px-1.5 text-[10px]">
                {vehicles.filter(v => myVehicleIds.includes(v.id)).length}
              </Badge>
            </Button>
            <Button
              size="sm"
              variant={activeMode === 'admin' ? 'default' : 'ghost'}
              className={`h-7 px-3 text-xs rounded-full gap-1.5 ${
                activeMode === 'admin' ? 'shadow-sm' : ''
              }`}
              onClick={() => onModeChange('admin')}
            >
              Admin
              <Badge variant={activeMode === 'admin' ? 'secondary' : 'outline'} className="h-5 px-1.5 text-[10px]">
                {vehicles.length}
              </Badge>
            </Button>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={onToggleSound}
            >
              {isSoundMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </Button>
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8"
              onClick={onRefresh}
              disabled={refreshing}
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

      </div>

      {/* Primary Filter Tab Bar - Horizontally Scrollable */}
      <div className="border-b bg-card px-1 py-1 overflow-x-auto">
        <div className="flex items-center gap-1 min-w-max">
          {/* Primary Tabs */}
          {primaryFilterTabs.map(tab => {
            const isHuntsTab = tab.id === 'hunts';
            const isActive = isHuntsTab 
              ? activeTab === 'trucks' 
              : activeTab === 'loads' && activeFilter === tab.id;
            const count = isHuntsTab ? huntsCount : getFilterCount(tab.id);
            
            return (
              <Button
                key={tab.id}
                size="sm"
                variant={isActive ? 'default' : 'ghost'}
                className={`h-9 px-3 text-xs flex-shrink-0 ${
                  isActive 
                    ? tab.id === 'missed' 
                      ? 'bg-destructive hover:bg-destructive/90' 
                      : tab.id === 'hunts'
                        ? 'bg-blue-500 hover:bg-blue-600'
                        : ''
                    : ''
                }`}
                onClick={() => {
                  if (isHuntsTab) {
                    setActiveTab('trucks');
                  } else {
                    setActiveTab('loads');
                    onFilterChange(tab.id);
                  }
                }}
              >
                <tab.icon className="h-4 w-4 mr-1" />
                {tab.label}
                <Badge 
                  variant={count > 0 ? (isHuntsTab ? 'secondary' : 'destructive') : 'secondary'} 
                  className="ml-1 h-5 px-1.5 text-[10px]"
                >
                  {count}
                </Badge>
              </Button>
            );
          })}
        </div>
      </div>

      {/* Secondary Filter Tabs (scrollable) */}
      <div className="border-b bg-muted/30 px-1 py-1 overflow-x-auto">
        <div className="flex items-center gap-1 min-w-max">
          {secondaryFilterTabs.map(tab => (
            <Button
              key={tab.id}
              size="sm"
              variant={activeTab === 'loads' && activeFilter === tab.id ? 'secondary' : 'ghost'}
              className="h-7 px-2 text-xs flex-shrink-0"
              onClick={() => {
                setActiveTab('loads');
                onFilterChange(tab.id);
              }}
            >
              <tab.icon className="h-3 w-3 mr-1" />
              {tab.label}
              <Badge 
                variant="outline" 
                className="ml-1 h-4 px-1 text-[9px]"
              >
                {getFilterCount(tab.id)}
              </Badge>
            </Button>
          ))}
        </div>
      </div>

      {/* Vehicle Filter Indicator */}
      {filterVehicleId && (
        <div className="px-3 py-2 bg-blue-50 dark:bg-blue-950/30 border-b flex items-center justify-between">
          <span className="text-xs text-blue-700 dark:text-blue-300 font-medium">
            Filtering: <span className="font-bold">{vehicles.find(v => v.id === filterVehicleId)?.vehicle_number || 'Unknown'}</span>
          </span>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-6 px-2 text-xs"
            onClick={() => onFilterChange(activeFilter, null)}
          >
            <X className="h-3 w-3 mr-1" />
            Clear
          </Button>
        </div>
      )}

      {/* Content Area */}
      <ScrollArea className="flex-1">
        <div className="pl-0.5 pr-4 py-2">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : activeTab === 'trucks' ? (
          /* Trucks List View */
          <div className="space-y-2 pb-20">
            {filteredVehicles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Truck className="h-12 w-12 text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">No trucks found</p>
              </div>
            ) : (
              filteredVehicles.map(vehicle => {
                const hasEnabledHunt = huntPlans.some(p => p.vehicleId === vehicle.id && p.enabled);
                const unreviewedCount = unreviewedViewData.filter(m => m.vehicle_id === vehicle.id).length;
                const skippedCount = skippedMatches.filter(m => m.vehicle_id === vehicle.id).length;
                const bidCount = bidMatches.filter(m => m.vehicle_id === vehicle.id).length;
                const waitlistCount = waitlistMatches.filter(m => m.vehicle_id === vehicle.id).length;
                const undecidedCount = undecidedMatches.filter(m => m.vehicle_id === vehicle.id).length;
                const hunt = huntPlans.find(p => p.vehicleId === vehicle.id);
                const isOilChangeDue = vehicle.oil_change_remaining !== null && vehicle.oil_change_remaining <= 0;
                const hasFaultCodes = Array.isArray(vehicle.fault_codes) && vehicle.fault_codes.length > 0;
                
                return (
                  <Card 
                    key={vehicle.id}
                    className={`overflow-hidden relative ${hasEnabledHunt ? 'border-blue-500' : ''}`}
                  >
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-start justify-between pr-12">
                        <div className="flex items-center gap-2">
                          {hasEnabledHunt && <div className="w-1.5 h-10 bg-blue-500 rounded-full" />}
                          <div>
                            <div className="flex items-center gap-1">
                              <p className="font-semibold">{vehicle.vehicle_number || 'N/A'}</p>
                              {isOilChangeDue && (
                                <span title="Oil change due">
                                  <img src={oilChangeIcon} alt="Oil change due" className="h-3.5 w-3.5" />
                                </span>
                              )}
                              {hasFaultCodes && (
                                <span title={`${vehicle.fault_codes?.length || 0} fault code(s)`}>
                                  <img src={checkEngineIcon} alt="Check engine" className="h-3.5 w-3.5" />
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {getDriverName(vehicle.driver_1_id) || 'No Driver'}
                            </p>
                            {vehicle.carrier && (
                              <p className="text-xs text-muted-foreground">
                                {carriersMap[vehicle.carrier] || vehicle.carrier}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {/* Clickable Badge Filters - Expanded */}
                          <div className="flex gap-0.5 mr-2 flex-wrap">
                            {/* GREEN = Unreviewed */}
                            <div 
                              className="h-5 min-w-5 px-1 rounded-full bg-green-500 flex items-center justify-center text-white text-[10px] font-medium cursor-pointer active:bg-green-600"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveTab('loads');
                                onFilterChange('unreviewed', vehicle.id);
                              }}
                            >
                              {unreviewedCount}
                            </div>
                            {/* YELLOW = Waitlist */}
                            <div 
                              className="h-5 min-w-5 px-1 rounded-full bg-amber-400 flex items-center justify-center text-amber-900 text-[10px] font-medium cursor-pointer active:bg-amber-500"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveTab('loads');
                                onFilterChange('waitlist', vehicle.id);
                              }}
                            >
                              {waitlistCount}
                            </div>
                            {/* ORANGE = Undecided */}
                            <div 
                              className="h-5 min-w-5 px-1 rounded-full bg-orange-400 flex items-center justify-center text-white text-[10px] font-medium cursor-pointer active:bg-orange-500"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveTab('loads');
                                onFilterChange('undecided', vehicle.id);
                              }}
                            >
                              {undecidedCount}
                            </div>
                            {/* BLUE = My Bids */}
                            <div 
                              className="h-5 min-w-5 px-1 rounded-full bg-blue-500 flex items-center justify-center text-white text-[10px] font-medium cursor-pointer active:bg-blue-600"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveTab('loads');
                                onFilterChange('mybids', vehicle.id);
                              }}
                            >
                              {bidCount}
                            </div>
                            {/* GRAY = Skipped */}
                            <div 
                              className="h-5 min-w-5 px-1 rounded-full bg-gray-400 flex items-center justify-center text-white text-[10px] font-medium cursor-pointer active:bg-gray-500"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveTab('loads');
                                onFilterChange('skipped', vehicle.id);
                              }}
                            >
                              {skippedCount}
                            </div>
                          </div>
                          {hunt && (
                            <Button
                              size="sm"
                              variant={hunt.enabled ? 'default' : 'outline'}
                              className={`h-7 text-[10px] px-2 ${hunt.enabled ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleHunt(hunt.id, hunt.enabled);
                              }}
                            >
                              {hunt.enabled ? '● Hunting' : 'Start'}
                            </Button>
                          )}
                        </div>
                      </div>
                      {/* Status Text - centered on right edge */}
                      {vehicle.stopped_status && (
                        <div className="absolute right-2 top-1/2 -translate-y-1/2">
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
                      {hunt && (
                        <div className="text-xs text-muted-foreground space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {hunt.zipCode || 'No location'}
                            </span>
                            <span>{hunt.pickupRadius} mi radius</span>
                            {hunt.availableFeet && (
                              <span className="flex items-center gap-1">
                                <Ruler className="h-3 w-3" />
                                {hunt.availableFeet} ft
                              </span>
                            )}
                          </div>
                          {hunt.vehicleSizes?.length > 0 && (
                            <span className="text-[10px]">{hunt.vehicleSizes.slice(0, 3).join(', ')}{hunt.vehicleSizes.length > 3 ? '...' : ''}</span>
                          )}
                          {hunt.notes && (
                            <p className="text-[10px] text-amber-600 dark:text-amber-400 italic line-clamp-1">
                              Note: {hunt.notes}
                            </p>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        ) : displayData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Package className="h-12 w-12 text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">No loads found</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              {activeFilter === 'unreviewed' 
                ? 'Enable a hunt plan to start matching loads'
                : activeFilter === 'mybids'
                ? 'Send a bid to see it here'
                : activeFilter === 'waitlist'
                ? 'Waitlisted loads will appear here'
                : activeFilter === 'undecided'
                ? 'Viewed loads with no action appear here'
                : 'Try a different filter'
              }
            </p>
          </div>
        ) : (
          <div className="space-y-2 pb-20">
            {displayData.map((item, index) => {
              // Extract email data based on filter type
              let email: any;
              let match: any;
              
              if (activeFilter === 'unreviewed') {
                email = {
                  id: item.load_email_id,
                  load_id: item.load_id,
                  from_email: item.from_email,
                  received_at: item.received_at,
                  expires_at: item.expires_at,
                  parsed_data: item.parsed_data,
                  status: item.status,
                  email_source: item.email_source,
                };
                match = item;
              } else if (activeFilter === 'missed') {
                email = item;
                match = null;
              } else {
                email = item.match ? item : item;
                match = item.match || null;
              }

              if (!email) return null;

              const data = email.parsed_data || {};
              const receivedDate = new Date(email.received_at);
              const now = new Date();
              const diffMs = now.getTime() - receivedDate.getTime();
              const diffMins = Math.floor(diffMs / 60000);
              const diffHours = Math.floor(diffMins / 60);
              const isNew = diffMins <= 5;

              // Calculate expiration
              let expiresIn = '';
              if (email.expires_at) {
                const expiresDate = new Date(email.expires_at);
                const timeUntil = expiresDate.getTime() - now.getTime();
                const minsUntil = Math.floor(timeUntil / 60000);
                if (minsUntil > 60) {
                  expiresIn = `${Math.floor(minsUntil / 60)}h ${minsUntil % 60}m`;
                } else if (minsUntil > 0) {
                  expiresIn = `${minsUntil}m`;
                } else {
                  expiresIn = `Expired`;
                }
              }

              // Get vehicle info for matched loads
              const vehicle = match ? vehicles.find(v => v.id === match.vehicle_id) : null;
              const huntPlan = match ? huntPlans.find(hp => hp.id === match.hunt_plan_id) : null;

              // Time display
              const timeAgo = diffHours > 0 ? `${diffHours}h ${diffMins % 60}m` : `${diffMins}m`;

              return (
                <Card 
                  key={`${email.id}-${index}`}
                  className={`overflow-hidden text-[85%] !transform-none hover:!transform-none active:!transform-none ${isNew ? 'border-green-500 bg-green-50 dark:bg-green-950/20' : ''}`}
                  onClick={() => onSelectLoad(email, match)}
                >
                  <CardContent className="p-0.5 space-y-0.5">
                    {/* Header Row - Order #, NEW badge, Time */}
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {data.order_number && (
                            <Badge variant="outline" className="text-[10px] px-1.5 h-5 font-mono">
                              #{data.order_number}
                            </Badge>
                          )}
                          {email.load_id && (
                            <Badge variant="secondary" className="text-[9px] px-1 h-4 font-mono">
                              {email.load_id}
                            </Badge>
                          )}
                          {isNew && (
                            <Badge className="bg-green-500 text-[10px] px-1.5 h-5">NEW</Badge>
                          )}
                        </div>
                        <p className="font-medium text-[13px] mt-1 truncate">
                          {(() => {
                            const customerName = data.customer || data.broker_company || email.from_name || 'Unknown Customer';
                            return customerName.length > 24 ? customerName.slice(0, 24) + '...' : customerName;
                          })()}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0 space-y-0.5">
                        <div className="flex items-center gap-1 justify-end">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs font-medium">{timeAgo}</span>
                        </div>
                        {expiresIn && (
                          <p className={`text-[10px] ${expiresIn === 'Expired' ? 'text-destructive' : 'text-muted-foreground'}`}>
                            {expiresIn === 'Expired' ? 'Expired' : `Exp: ${expiresIn}`}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Route Info - Origin → Destination */}
                    <div className="flex items-center gap-1 text-[11px]">
                      <MapPin className="h-2.5 w-2.5 text-green-600 flex-shrink-0" />
                      <span className="truncate font-medium">
                        {data.origin_city && data.origin_state 
                          ? `${data.origin_city}, ${data.origin_state}`
                          : 'Unknown'
                        }
                      </span>
                      <ArrowRight className="h-2.5 w-2.5 text-muted-foreground flex-shrink-0" />
                      <MapPin className="h-2.5 w-2.5 text-blue-600 flex-shrink-0" />
                      <span className="truncate font-medium">
                        {data.destination_city && data.destination_state 
                          ? `${data.destination_city}, ${data.destination_state}`
                          : 'Unknown'
                        }
                      </span>
                    </div>

                    {/* Pickup/Delivery Times */}
                    {(data.pickup_date || data.pickup_time || data.delivery_date || data.delivery_time) && (
                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          <span>P: {data.pickup_date || ''} {data.pickup_time || '—'}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span>D: {data.delivery_date || ''} {data.delivery_time || '—'}</span>
                        </div>
                      </div>
                    )}

                    {/* Load Details Grid - Miles, Weight, Pieces, Dims */}
                    <div className="grid grid-cols-4 gap-0.5 text-[8px]">
                      <div className="bg-muted/50 rounded p-0.5 text-center">
                        <div className="text-muted-foreground">Out</div>
                        <div className="font-semibold text-primary">
                          {match?.distance_miles ? `${Number(match.distance_miles).toFixed(2)}` : (data.empty_miles ? Number(data.empty_miles).toFixed(2) : '—')}
                        </div>
                      </div>
                      <div className="bg-muted/50 rounded p-0.5 text-center">
                        <div className="text-muted-foreground">Loaded</div>
                        <div className="font-semibold">{data.loaded_miles || data.miles || '—'}</div>
                      </div>
                      <div className="bg-muted/50 rounded p-0.5 text-center">
                        <div className="text-muted-foreground">Pcs</div>
                        <div className="font-semibold">{data.pieces || '—'}</div>
                      </div>
                      <div className="bg-muted/50 rounded p-0.5 text-center">
                        <div className="text-muted-foreground">Wt</div>
                        <div className="font-semibold">{data.weight ? `${data.weight}` : '—'}</div>
                      </div>
                    </div>

                    {/* Secondary Details Row - Vehicle Type, Dims, Amount */}
                    <div className="flex items-center gap-2 text-xs flex-wrap">
                      {data.vehicle_type && (() => {
                        const cleanVehicleType = data.vehicle_type.replace(/<[^>]*>/g, '').trim();
                        const displayVehicleType = cleanVehicleType.length > 18 ? cleanVehicleType.slice(0, 16) + '…' : cleanVehicleType;
                        return (
                          <Badge variant="outline" className="text-[10px] h-5" title={cleanVehicleType.length > 18 ? cleanVehicleType : undefined}>
                            <Truck className="h-3 w-3 mr-1" />
                            {displayVehicleType}
                          </Badge>
                        );
                      })()}
                      {data.dimensions && (
                        <Badge variant="outline" className="text-[10px] h-5">
                          <Box className="h-3 w-3 mr-1" />
                          {data.dimensions.trim().toLowerCase() === 'no dimensions specified' ? 'No Dim Specified' : data.dimensions}
                        </Badge>
                      )}
                      {data.available_feet && (
                        <Badge variant="outline" className="text-[10px] h-5">
                          <Ruler className="h-3 w-3 mr-1" />
                          {data.available_feet} ft
                        </Badge>
                      )}
                      {data.posted_amount && (
                        <Badge className="bg-green-600 text-[10px] h-5">
                          ${data.posted_amount}
                        </Badge>
                      )}
                      {/* Source Badge */}
                      {(() => {
                        const emailSource = (item as any).email_source || email?.email_source || 'sylectus';
                        const sourceConfig: Record<string, { label: string; className: string }> = {
                          sylectus: { label: 'SYL', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
                          fullcircle: { label: 'FC', className: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300' },
                        };
                        const config = sourceConfig[emailSource] || { label: emailSource, className: 'bg-gray-100 text-gray-700' };
                        return (
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${config.className}`}>
                            {config.label}
                          </span>
                        );
                      })()}
                    </div>

                    {/* Load Notes (if present) */}
                    {cleanLoadNotes(data.notes) && (
                      <div className="bg-amber-50 dark:bg-amber-950/30 rounded p-1.5 text-[9px] text-amber-800 dark:text-amber-300">
                        <span className="font-semibold">Notes:</span> {cleanLoadNotes(data.notes)}
                      </div>
                    )}

                    {/* Matched Vehicle (for match-based filters) */}
                    {vehicle && (
                      <div className="pt-1.5 border-t space-y-1">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-5 bg-blue-500 rounded-full" />
                          <p className="text-xs flex-1">
                            <span className="font-semibold">{vehicle.vehicle_number}</span>
                            <span className="text-muted-foreground"> · {getDriverName(vehicle.driver_1_id) || 'No Driver'}</span>
                          </p>
                          {/* Match count badge for grouped rows */}
                          {activeFilter === 'unreviewed' && (item as any)._isGrouped && (item as any)._matchCount > 1 && (
                            <Badge 
                              className="h-5 px-1.5 text-[10px] font-bold bg-gradient-to-b from-blue-500 to-blue-600 text-white border-0 shadow-sm flex items-center gap-0.5"
                              title={`${(item as any)._matchCount} vehicles matched this load`}
                            >
                              <Truck className="h-3 w-3" />
                              {(item as any)._matchCount}
                            </Badge>
                          )}
                        </div>
                        {/* Carrier Name */}
                        {vehicle.carrier && carriersMap[vehicle.carrier] && (
                          <p className="text-[10px] text-muted-foreground pl-3.5">
                            Carrier: <span className="font-medium text-foreground">{carriersMap[vehicle.carrier]}</span>
                          </p>
                        )}
                        {/* Hunt Plan Notes */}
                        {huntPlan?.notes && (
                          <p className="text-[10px] text-amber-600 dark:text-amber-400 pl-3.5 italic">
                            Hunt Note: {huntPlan.notes}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Action Buttons - Skip for unreviewed - Compact */}
                    {activeFilter === 'unreviewed' && match && (
                      <div className="pt-1 border-t flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="min-w-0 flex-1 h-6 px-1.5 text-[10px]"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSkipMatch(match.match_id || match.id);
                          }}
                        >
                          <SkipForward className="h-2.5 w-2.5 mr-0.5" />
                          Skip
                        </Button>
                        <Button
                          size="sm"
                          className="min-w-0 flex-1 h-6 px-1.5 text-[10px]"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectLoad(email, match);
                          }}
                        >
                          <DollarSign className="h-2.5 w-2.5 mr-0.5" />
                          View
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
        </div>
      </ScrollArea>

      {/* Hunt Plans Quick Access - Bottom Sheet Trigger */}
      <div className="fixed bottom-4 right-4 z-40">
        <Sheet>
          <SheetTrigger asChild>
            <Button size="lg" className="rounded-full h-12 w-12 shadow-lg">
              <Target className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[80vh]">
            <SheetHeader>
              <SheetTitle>Hunt Plans</SheetTitle>
            </SheetHeader>
            <ScrollArea className="h-full py-4">
              {huntPlans.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Target className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No hunt plans created</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {huntPlans.map(plan => {
                    const vehicle = vehicles.find(v => v.id === plan.vehicleId);
                    const matchCount = unreviewedViewData.filter(m => m.vehicle_id === plan.vehicleId).length;
                    
                    return (
                      <Card key={plan.id} className={`${plan.enabled ? 'border-blue-500' : ''}`}>
                        <CardContent className="p-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <p className="font-medium">{plan.planName}</p>
                                {plan.enabled && (
                                  <Badge className="bg-green-500 text-[10px]">Active</Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                {vehicle?.vehicle_number || 'Unknown'} • {plan.zipCode} • {plan.pickupRadius}mi
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Types: {plan.vehicleSizes?.slice(0, 3).join(', ')}{plan.vehicleSizes?.length > 3 ? '...' : ''}
                              </p>
                              {plan.availableFeet && (
                                <p className="text-xs text-muted-foreground">
                                  Available: {plan.availableFeet} ft
                                </p>
                              )}
                              {plan.notes && (
                                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 italic">
                                  {plan.notes}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              {matchCount > 0 && plan.enabled && (
                                <Badge variant="destructive">{matchCount}</Badge>
                              )}
                              <Button
                                size="sm"
                                variant={plan.enabled ? 'default' : 'outline'}
                                className="h-8"
                                onClick={() => onToggleHunt(plan.id, !plan.enabled)}
                              >
                                {plan.enabled ? 'Disable' : 'Enable'}
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}
