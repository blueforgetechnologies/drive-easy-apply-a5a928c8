import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ArrowLeft, MapPin, Truck, Settings, Plus, Wrench } from "lucide-react";
import type { Vehicle, HuntPlan } from "@/types/loadHunter";

interface LoadHunterVehicleDetailProps {
  vehicle: Vehicle;
  huntPlans: HuntPlan[];
  carriersMap: Record<string, string>;
  driversMap: Record<string, { first_name: string; last_name: string }>;
  
  // Notes
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
  onClearMatches: (huntId: string) => void;
  
  // Navigation
  onBack: () => void;
  
  // Map container ref for external map rendering
  mapContainerRef?: React.RefObject<HTMLDivElement>;
  
  // Canonical vehicle types for display
  canonicalVehicleTypes: { value: string; label: string }[];
  vehicleTypeMappings: Map<string, string>;
  
  // Match counts per hunt
  huntMatchCounts: Record<string, number>;
}

export function LoadHunterVehicleDetail({
  vehicle,
  huntPlans,
  carriersMap,
  driversMap,
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
  onBack,
  mapContainerRef,
  canonicalVehicleTypes,
  vehicleTypeMappings,
  huntMatchCounts,
}: LoadHunterVehicleDetailProps) {
  const vehicleHunts = huntPlans.filter(h => h.vehicleId === vehicle.id);
  const carrierName = vehicle.carrier ? carriersMap[vehicle.carrier] : null;
  const driver = vehicle.driver_1_id ? driversMap[vehicle.driver_1_id] : null;

  // Format hunt plan display types
  const formatVehicleTypes = (sizes: string[]) => {
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

  const formatDateTime = (date?: string, time?: string) => {
    if (!date) return 'Not set';
    const d = new Date(date);
    const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    return time ? `${dateStr} @ ${time}` : dateStr;
  };

  const getTimeAgo = (dateInput: string | Date) => {
    const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b flex-shrink-0">
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Truck className="h-5 w-5" />
            {vehicle.vehicle_number || vehicle.id.slice(0, 8)}
          </h2>
          {carrierName && (
            <p className="text-sm text-muted-foreground">{carrierName}</p>
          )}
        </div>
        {vehicle.asset_subtype && (
          <Badge variant="outline">{vehicle.asset_subtype}</Badge>
        )}
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Vehicle Info Card */}
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium">Vehicle Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {driver && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Driver:</span>
                <span>{driver.first_name} {driver.last_name}</span>
              </div>
            )}
            {vehicle.odometer && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Odometer:</span>
                <span className="font-mono text-xs">{vehicle.odometer?.toLocaleString()} mi</span>
              </div>
            )}
            {vehicle.last_location && (
              <div className="flex items-center gap-1 text-green-600">
                <MapPin className="h-3 w-3" />
                <span className="text-xs">Location available</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Notes Card */}
        <Card>
          <CardHeader className="py-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">Notes</CardTitle>
            {!editingNotes && (
              <Button variant="ghost" size="sm" className="h-7" onClick={() => setEditingNotes(true)}>
                Edit
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {editingNotes ? (
              <div className="space-y-2">
                <Textarea
                  value={vehicleNotes}
                  onChange={(e) => setVehicleNotes(e.target.value)}
                  placeholder="Add notes about this vehicle..."
                  rows={3}
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={onSaveNotes}>Save</Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingNotes(false)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {vehicleNotes || 'No notes'}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Hunt Plans */}
        <Card>
          <CardHeader className="py-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Wrench className="h-4 w-4" />
              Hunt Plans ({vehicleHunts.length})
            </CardTitle>
            <Button variant="outline" size="sm" className="h-7" onClick={onCreateHunt}>
              <Plus className="h-3 w-3 mr-1" />
              New Hunt
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {vehicleHunts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No hunt plans for this vehicle
              </p>
            ) : (
              vehicleHunts.map((plan) => {
                const matchCount = huntMatchCounts[plan.id] || 0;

                return (
                  <div key={plan.id} className="border rounded-lg p-3 space-y-2">
                    {/* Hunt Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={plan.enabled}
                          onCheckedChange={(checked) => onToggleHunt(plan.id, checked)}
                        />
                        <span className={`font-medium text-sm ${!plan.enabled ? 'text-muted-foreground' : ''}`}>
                          {plan.planName || 'Unnamed Hunt'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {matchCount > 0 && plan.enabled && (
                          <Badge className="bg-green-600 text-white">
                            {matchCount} {matchCount === 1 ? 'Match' : 'Matches'}
                          </Badge>
                        )}
                        <div className="flex">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs rounded-r-none"
                            onClick={() => onEditHunt(plan)}
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-7 px-2 text-xs rounded-l-none"
                            onClick={() => onDeleteHunt(plan.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Hunt Details */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Types:</span>
                        <span className="text-right">{formatVehicleTypes(plan.vehicleSizes)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Zip:</span>
                        <span>{plan.zipCode}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Radius:</span>
                        <span>{plan.pickupRadius} mi</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Available:</span>
                        <span>{formatDateTime(plan.availableDate, plan.availableTime)}</span>
                      </div>
                    </div>

                    {/* Hunt Meta */}
                    <div className="text-xs text-muted-foreground pt-1 border-t">
                      Last modified: {getTimeAgo(plan.lastModified)}
                    </div>

                    {/* Clear Matches */}
                    {matchCount > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full h-7 text-xs text-destructive hover:bg-destructive hover:text-destructive-foreground"
                        onClick={() => onClearMatches(plan.id)}
                      >
                        Clear All Matches
                      </Button>
                    )}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Map */}
        {mapContainerRef && (
          <Card className="flex-shrink-0">
            <CardHeader className="py-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Location
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div ref={mapContainerRef} className="h-[200px] w-full rounded-b-lg" />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
