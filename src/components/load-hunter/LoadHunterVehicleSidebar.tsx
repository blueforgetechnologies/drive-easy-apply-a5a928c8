import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Truck, MapPin, Plus } from "lucide-react";
import type { Vehicle } from "@/types/loadHunter";

interface VehicleWithMatchCount extends Vehicle {
  matchCount?: number;
}

interface LoadHunterVehicleSidebarProps {
  vehicles: VehicleWithMatchCount[];
  selectedVehicle: Vehicle | null;
  onSelectVehicle: (vehicle: Vehicle | null) => void;
  onCreateHunt: () => void;
  filterVehicleId: string | null;
  onFilterByVehicle: (vehicleId: string | null) => void;
  carriersMap: Record<string, string>;
  myVehicleIds: string[];
  activeMode: 'admin' | 'dispatch';
}

export function LoadHunterVehicleSidebar({
  vehicles,
  selectedVehicle,
  onSelectVehicle,
  onCreateHunt,
  filterVehicleId,
  onFilterByVehicle,
  carriersMap,
  myVehicleIds,
  activeMode,
}: LoadHunterVehicleSidebarProps) {
  // Filter vehicles based on mode
  const displayedVehicles = activeMode === 'dispatch'
    ? vehicles.filter(v => myVehicleIds.includes(v.id))
    : vehicles;

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="py-3 px-4 border-b flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Truck className="h-4 w-4" />
            Vehicles ({displayedVehicles.length})
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={onCreateHunt}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 p-0 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="p-2 space-y-1">
            {/* Clear filter option */}
            {filterVehicleId && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-xs h-8 text-muted-foreground"
                onClick={() => onFilterByVehicle(null)}
              >
                ✕ Clear vehicle filter
              </Button>
            )}

            {displayedVehicles.map((vehicle) => {
              const isSelected = selectedVehicle?.id === vehicle.id;
              const isFiltered = filterVehicleId === vehicle.id;
              const carrierName = vehicle.carrier ? carriersMap[vehicle.carrier] : null;

              return (
                <div
                  key={vehicle.id}
                  className={`
                    p-2 rounded-md cursor-pointer transition-colors
                    ${isSelected ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted/50'}
                    ${isFiltered ? 'ring-2 ring-primary' : ''}
                  `}
                  onClick={() => onSelectVehicle(isSelected ? null : vehicle)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">
                          {vehicle.vehicle_number || vehicle.id.slice(0, 8)}
                        </span>
                        {vehicle.matchCount && vehicle.matchCount > 0 && (
                          <Badge
                            variant="secondary"
                            className="h-5 px-1.5 text-xs cursor-pointer hover:bg-primary hover:text-primary-foreground"
                            onClick={(e) => {
                              e.stopPropagation();
                              onFilterByVehicle(isFiltered ? null : vehicle.id);
                            }}
                          >
                            {vehicle.matchCount}
                          </Badge>
                        )}
                      </div>
                      {carrierName && (
                        <p className="text-xs text-muted-foreground truncate">
                          {carrierName}
                        </p>
                      )}
                    </div>
                    {vehicle.last_location && (
                      <MapPin className="h-3 w-3 text-green-500 flex-shrink-0" />
                    )}
                </div>
                {vehicle.asset_subtype && (
                  <Badge variant="outline" className="mt-1 text-xs h-5">
                    {vehicle.asset_subtype}
                  </Badge>
                  )}
                </div>
              );
            })}

            {displayedVehicles.length === 0 && (
              <div className="text-center py-8 text-sm text-muted-foreground">
                {activeMode === 'dispatch' ? (
                  <p>No vehicles assigned to you</p>
                ) : (
                  <p>No vehicles found</p>
                )}
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
