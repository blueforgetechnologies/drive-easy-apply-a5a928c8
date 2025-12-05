import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { 
  RefreshCw, ChevronRight, MapPin, Truck, Target, 
  Filter, Clock, Package, ArrowRight, X, Check, 
  SkipForward, AlertTriangle, Volume2, VolumeX, List
} from "lucide-react";

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
}

interface HuntPlan {
  id: string;
  vehicleId: string;
  planName: string;
  vehicleSizes: string[];
  zipCode: string;
  pickupRadius: string;
  enabled: boolean;
}

interface LoadHunterMobileProps {
  // Props passed from parent
  vehicles: Vehicle[];
  huntPlans: HuntPlan[];
  loadEmails: any[];
  unreviewedViewData: any[];
  skippedMatches: any[];
  missedHistory: any[];
  loadMatches: any[];
  loading: boolean;
  refreshing: boolean;
  activeFilter: string;
  activeMode: 'admin' | 'dispatch';
  myVehicleIds: string[];
  isSoundMuted: boolean;
  carriersMap: Record<string, string>;
  onRefresh: () => void;
  onFilterChange: (filter: string) => void;
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
  missedHistory,
  loadMatches,
  loading,
  refreshing,
  activeFilter,
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
  const [activeTab, setActiveTab] = useState<'trucks' | 'loads'>('loads');

  // Filter counts
  const getFilterCount = (filter: string) => {
    switch (filter) {
      case 'unreviewed':
        return unreviewedViewData.length;
      case 'skipped':
        return skippedMatches.length;
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

  // Get display data based on active filter
  const getDisplayData = () => {
    let data: any[] = [];
    
    switch (activeFilter) {
      case 'unreviewed':
        data = unreviewedViewData;
        break;
      case 'skipped':
        data = skippedMatches.map(m => ({
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

    // Filter by selected vehicle if one is selected
    if (selectedVehicleId) {
      if (activeFilter === 'unreviewed') {
        data = data.filter(item => item.vehicle_id === selectedVehicleId);
      } else if (activeFilter === 'missed') {
        data = data.filter(item => item.vehicle_id === selectedVehicleId);
      }
    }

    return data.slice(0, 50); // Limit for performance
  };

  const displayData = getDisplayData();
  const filteredVehicles = vehicles.filter(v => activeMode === 'admin' || myVehicleIds.includes(v.id));

  // Filter options for bottom tabs
  const filterTabs = [
    { id: 'unreviewed', label: 'Unreviewed', icon: Target },
    { id: 'skipped', label: 'Skipped', icon: SkipForward },
    { id: 'missed', label: 'Missed', icon: AlertTriangle },
    { id: 'all', label: 'All', icon: List },
  ];

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Mobile Header */}
      <div className="sticky top-0 z-40 bg-card border-b px-3 py-2 space-y-2">
        {/* Top Row - Mode Toggle & Actions */}
        <div className="flex items-center justify-between gap-2">
          {/* Mode Toggle */}
          <div className="flex rounded-lg border overflow-hidden">
            <Button
              size="sm"
              variant={activeMode === 'dispatch' ? 'default' : 'ghost'}
              className="h-8 px-3 text-xs rounded-none"
              onClick={() => onModeChange('dispatch')}
            >
              My Trucks
            </Button>
            <Button
              size="sm"
              variant={activeMode === 'admin' ? 'default' : 'ghost'}
              className="h-8 px-3 text-xs rounded-none"
              onClick={() => onModeChange('admin')}
            >
              Admin
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

      {/* Bottom Tab Bar - Filter Navigation */}
      <div className="border-b bg-card px-1 py-1">
        <div className="flex items-center gap-1 overflow-x-auto">
          {/* My Trucks Tab */}
          <Button
            size="sm"
            variant={activeTab === 'trucks' ? 'default' : 'ghost'}
            className="h-9 px-3 text-xs flex-shrink-0"
            onClick={() => setActiveTab('trucks')}
          >
            <Truck className="h-4 w-4 mr-1" />
            My Trucks
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
              {filteredVehicles.length}
            </Badge>
          </Button>
          
          {/* Filter Tabs */}
          {filterTabs.map(tab => (
            <Button
              key={tab.id}
              size="sm"
              variant={activeTab === 'loads' && activeFilter === tab.id ? 'default' : 'ghost'}
              className="h-9 px-3 text-xs flex-shrink-0"
              onClick={() => {
                setActiveTab('loads');
                onFilterChange(tab.id);
              }}
            >
              <tab.icon className="h-4 w-4 mr-1" />
              {tab.label}
              <Badge 
                variant={getFilterCount(tab.id) > 0 ? 'destructive' : 'secondary'} 
                className="ml-1 h-5 px-1.5 text-[10px]"
              >
                {getFilterCount(tab.id)}
              </Badge>
            </Button>
          ))}
        </div>
      </div>

      {/* Content Area */}
      <ScrollArea className="flex-1 px-3 py-2">
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
                const hunt = huntPlans.find(p => p.vehicleId === vehicle.id);
                
                return (
                  <Card 
                    key={vehicle.id}
                    className={`overflow-hidden ${hasEnabledHunt ? 'border-blue-500' : ''}`}
                  >
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          {hasEnabledHunt && <div className="w-1.5 h-10 bg-blue-500 rounded-full" />}
                          <div>
                            <p className="font-semibold">{vehicle.vehicle_number || 'N/A'}</p>
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
                        <div className="flex items-center gap-2">
                          {unreviewedCount > 0 && (
                            <Badge variant="destructive">{unreviewedCount}</Badge>
                          )}
                          {hunt && (
                            <Button
                              size="sm"
                              variant={hunt.enabled ? 'default' : 'outline'}
                              className="h-8 text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleHunt(hunt.id, !hunt.enabled);
                              }}
                            >
                              {hunt.enabled ? 'Hunting' : 'Start Hunt'}
                            </Button>
                          )}
                        </div>
                      </div>
                      {hunt && (
                        <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {hunt.zipCode || 'No location'}
                          </span>
                          <span>{hunt.pickupRadius} mi radius</span>
                          {hunt.vehicleSizes?.length > 0 && (
                            <span>{hunt.vehicleSizes.slice(0, 2).join(', ')}{hunt.vehicleSizes.length > 2 ? '...' : ''}</span>
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
              const isNew = diffMins <= 5;

              // Get vehicle info for matched loads
              const vehicle = match ? vehicles.find(v => v.id === match.vehicle_id) : null;

              return (
                <Card 
                  key={`${email.id}-${index}`}
                  className={`overflow-hidden ${isNew ? 'border-green-500 bg-green-50 dark:bg-green-950/20' : ''}`}
                  onClick={() => onSelectLoad(email, match)}
                >
                  <CardContent className="p-3 space-y-2">
                    {/* Header Row */}
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {data.order_number && (
                            <Badge variant="outline" className="text-[10px] px-1.5 h-5">
                              #{data.order_number}
                            </Badge>
                          )}
                          {isNew && (
                            <Badge className="bg-green-500 text-[10px] px-1.5 h-5">NEW</Badge>
                          )}
                        </div>
                        <p className="font-medium text-sm mt-1 truncate">
                          {data.customer || email.from_name || 'Unknown Customer'}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs text-muted-foreground">{diffMins}m ago</p>
                        {email.expires_at && (
                          <p className="text-[10px] text-orange-600">
                            Exp: {Math.max(0, Math.floor((new Date(email.expires_at).getTime() - now.getTime()) / 60000))}m
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Route Info */}
                    <div className="flex items-center gap-2 text-sm">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-green-600 flex-shrink-0" />
                          <span className="truncate">
                            {data.origin_city && data.origin_state 
                              ? `${data.origin_city}, ${data.origin_state}`
                              : 'Unknown'
                            }
                          </span>
                        </div>
                      </div>
                      <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-blue-600 flex-shrink-0" />
                          <span className="truncate">
                            {data.destination_city && data.destination_state 
                              ? `${data.destination_city}, ${data.destination_state}`
                              : 'Unknown'
                            }
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Details Row */}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {data.vehicle_type && (
                        <span className="flex items-center gap-1">
                          <Truck className="h-3 w-3" />
                          {data.vehicle_type}
                        </span>
                      )}
                      {data.posted_amount && (
                        <span className="font-semibold text-green-600">
                          ${data.posted_amount}
                        </span>
                      )}
                      {match?.distance_miles && (
                        <span>{Math.round(match.distance_miles)} mi away</span>
                      )}
                    </div>

                    {/* Matched Vehicle (for unreviewed) */}
                    {vehicle && (
                      <div className="flex items-center justify-between pt-2 border-t">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-6 bg-blue-500 rounded-full" />
                          <div>
                            <p className="text-xs font-medium">{vehicle.vehicle_number}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {getDriverName(vehicle.driver_1_id) || 'No Driver'}
                            </p>
                          </div>
                        </div>
                        {activeFilter === 'unreviewed' && match && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSkipMatch(match.match_id || match.id);
                            }}
                          >
                            <SkipForward className="h-3 w-3 mr-1" />
                            Skip
                          </Button>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {/* Hunt Plans Quick Access - Bottom Sheet Trigger */}
      <div className="fixed bottom-20 right-4 z-40">
        <Sheet>
          <SheetTrigger asChild>
            <Button size="lg" className="rounded-full h-14 w-14 shadow-lg">
              <Target className="h-6 w-6" />
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
                                Types: {plan.vehicleSizes.join(', ')}
                              </p>
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
