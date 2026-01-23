import React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Gauge, MapPin, Wrench, Truck } from "lucide-react";
import type { Vehicle, HuntPlan } from "@/types/loadHunter";

interface LoadHunterVehicleDetailProps {
  vehicle: Vehicle;
  huntPlans: HuntPlan[];
  loadEmails: any[];
  
  // Notes editing state
  vehicleNotes: string;
  setVehicleNotes: (notes: string) => void;
  editingNotes: boolean;
  setEditingNotes: (editing: boolean) => void;
  onSaveNotes: () => void;
  
  // Hunt plan actions
  onToggleHunt: (huntId: string, enabled: boolean) => void;
  onEditHunt: (hunt: HuntPlan) => void;
  onDeleteHunt: (huntId: string) => void;
  onCreateHunt: () => void;
  onClearMatches: (huntId: string) => Promise<void>;
  
  // Canonical vehicle types for display
  canonicalVehicleTypes: { value: string; label: string }[];
  vehicleTypeMappings: Map<string, string>;
  
  // Map container ref for external map rendering
  mapContainerRef: React.RefObject<HTMLDivElement>;
  
  // Helpers passed from parent
  getDriverName: (driverId: string | null) => string | null;
  getThirtyMinutesAgo: () => Date;
  extractLoadLocation: (email: any) => any;
  calculateDistance: (lat1: number, lng1: number, lat2: number, lng2: number) => number;
  formatDateTime: (date: string, time: string) => string;
  getTimeAgo: (date: Date | string) => string;
}

export function LoadHunterVehicleDetail({
  vehicle,
  huntPlans,
  loadEmails,
  vehicleNotes,
  setVehicleNotes,
  editingNotes,
  setEditingNotes,
  onSaveNotes,
  onToggleHunt,
  onEditHunt,
  onDeleteHunt,
  onCreateHunt,
  onClearMatches,
  canonicalVehicleTypes,
  vehicleTypeMappings,
  mapContainerRef,
  getDriverName,
  getThirtyMinutesAgo,
  extractLoadLocation,
  calculateDistance,
  formatDateTime,
  getTimeAgo,
}: LoadHunterVehicleDetailProps) {
  
  // Calculate matching loads for a hunt plan
  const calculateMatchCount = (plan: HuntPlan): number => {
    if (!plan.enabled) return 0;
    
    return loadEmails.filter(email => {
      const emailTime = new Date(email.received_at);
      const thirtyMinutesAgo = getThirtyMinutesAgo();
      
      if (email.status !== 'new') return false;
      if (!email.expires_at && emailTime <= thirtyMinutesAgo) return false;
      
      const loadData = extractLoadLocation(email);
      
      // Match by date if specified
      if (plan.availableDate && loadData.pickupDate) {
        const huntDateObj = new Date(plan.availableDate);
        const loadDateObj = new Date(loadData.pickupDate);
        
        if (isNaN(huntDateObj.getTime()) || isNaN(loadDateObj.getTime())) return false;
        
        const huntDate = huntDateObj.toISOString().split('T')[0];
        const loadDate = loadDateObj.toISOString().split('T')[0];
        if (huntDate !== loadDate) return false;
      }

      // Match by load type/vehicle size if specified
      if (plan.vehicleSizes && plan.vehicleSizes.length > 0 && loadData.loadType) {
        const loadTypeRaw = loadData.loadType.toLowerCase();
        const loadTypeCanonical = vehicleTypeMappings.get(loadTypeRaw) || loadData.loadType.toUpperCase();
        
        const anyMatch = plan.vehicleSizes.some(size => {
          return size.toUpperCase() === loadTypeCanonical.toUpperCase();
        });
        
        if (!anyMatch) return false;
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
        if (distance <= radiusMiles) return true;
      } else if (loadData.originZip && plan.zipCode) {
        if (loadData.originZip === plan.zipCode) return true;
      }

      return false;
    }).length;
  };

  // Format vehicle types for display
  const formatVehicleTypes = (sizes: string[]): string => {
    const canonicalValues = canonicalVehicleTypes.map(ct => ct.value.toUpperCase());
    const displayTypes = new Set<string>();
    sizes.forEach(size => {
      const upperSize = size.toUpperCase();
      if (canonicalValues.includes(upperSize)) {
        displayTypes.add(upperSize);
      } else {
        const mappedTo = vehicleTypeMappings.get(size.toLowerCase());
        if (mappedTo && canonicalValues.includes(mappedTo.toUpperCase())) {
          displayTypes.add(mappedTo.toUpperCase());
        }
      }
    });
    return displayTypes.size > 0 ? Array.from(displayTypes).sort().join(', ') : sizes.join(', ');
  };
  
  return (
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
                {vehicle.formatted_address || vehicle.last_location || "N/A"}
              </div>
              <div className="flex items-center gap-1.5 text-sm mt-1">
                <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Odometer</span>
                <span className="font-bold">
                  {vehicle.odometer ? vehicle.odometer.toLocaleString() : "N/A"}
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
                  vehicle.oil_change_remaining !== null && vehicle.oil_change_remaining < 0 
                    ? "text-destructive" 
                    : "text-foreground"
                }`}>
                  {vehicle.oil_change_remaining !== null && vehicle.oil_change_remaining !== undefined
                    ? `${vehicle.oil_change_remaining} mi`
                    : "N/A"}
                </div>
                {vehicle.next_service_date && (
                  <div className="text-xs text-muted-foreground">
                    {vehicle.next_service_date}
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
                {getDriverName(vehicle.driver_1_id) || "No Driver Assigned"}
              </span>
              <span className="text-muted-foreground text-[10px]">Note: N/A</span>
            </div>
            <div className="flex items-center text-xs">
              <span className="font-bold w-6 text-primary">D2</span>
              <span className="flex-1 font-medium">
                {getDriverName(vehicle.driver_2_id) || "No Driver Assigned"}
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
                  <Button size="sm" className="h-7 text-xs" onClick={onSaveNotes}>
                    Save
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="h-7 text-xs"
                    onClick={() => {
                      setEditingNotes(false);
                      setVehicleNotes(vehicle.notes || "");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className={`text-xs min-h-[24px] whitespace-pre-wrap ${vehicle.notes ? "text-destructive font-bold" : "text-muted-foreground"}`}>
                {vehicle.notes || "No notes available"}
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
              onClick={onCreateHunt}
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
          .filter((plan) => plan.vehicleId === vehicle.id)
          .map((plan) => {
            const matchCount = calculateMatchCount(plan);
            
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
                        onClick={() => onToggleHunt(plan.id, plan.enabled)}
                      >
                        {plan.enabled ? "Disable" : "Enable"}
                      </Button>
                      <Button 
                        size="sm" 
                        variant="secondary" 
                        className="h-8 px-3 text-xs rounded-none border-l-0"
                        onClick={() => onEditHunt(plan)}
                      >
                        Edit
                      </Button>
                      <Button 
                        size="sm" 
                        variant="destructive" 
                        className="h-8 px-3 text-xs rounded-none rounded-r-full"
                        onClick={() => onDeleteHunt(plan.id)}
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
                      {formatVehicleTypes(plan.vehicleSizes)}
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
                  onClick={() => onClearMatches(plan.id)}
                >
                  Clear Matches
                </Button>
              </Card>
            );
          })}
      </div>

      {/* Right Panel - Map */}
      <div className="flex-1 rounded-lg border overflow-hidden relative">
        {vehicle.last_location ? (
          <div ref={mapContainerRef} className="w-full h-full" />
        ) : (
          <div className="w-full h-full bg-muted/10 flex items-center justify-center">
            <div className="text-center text-sm text-muted-foreground">
              <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Location not available</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
