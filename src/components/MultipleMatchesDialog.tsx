import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wrench } from "lucide-react";

interface VehicleMatch {
  id: string;
  vehicle_id: string;
  vehicle_number: string;
  distance_miles: number;
  current_location: string;
  last_updated: string;
  status: string;
  oil_change_due: boolean;
}

interface MultipleMatchesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matches: VehicleMatch[];
  onSelectVehicle: (vehicleId: string, matchId: string) => void;
}

export function MultipleMatchesDialog({
  open,
  onOpenChange,
  matches,
  onSelectVehicle,
}: MultipleMatchesDialogProps) {
  // Sort matches by distance (closest first)
  const sortedMatches = [...matches].sort((a, b) => 
    (a.distance_miles || 0) - (b.distance_miles || 0)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">Multiple Matches Found!</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          <div className="grid grid-cols-8 gap-4 text-sm font-medium text-muted-foreground pb-2 border-b">
            <div>Vehicle ID</div>
            <div>Empty Distance</div>
            <div>Empty Time</div>
            <div>Notes</div>
            <div>Current Status</div>
            <div>Delivery Date & Time</div>
            <div>Destination</div>
            <div>Last Updated</div>
          </div>

          {sortedMatches.map((match) => (
            <div
              key={match.id}
              onClick={() => onSelectVehicle(match.vehicle_id, match.id)}
              className="grid grid-cols-8 gap-4 items-center p-4 rounded-lg border cursor-pointer hover:bg-accent/50 transition-colors"
            >
              <div className="font-medium text-green-600 flex items-center gap-2">
                {match.vehicle_number}
                {match.oil_change_due && (
                  <Wrench className="h-4 w-4 text-red-500" />
                )}
              </div>
              
              <div className="text-sm">
                {match.distance_miles ? `${Math.round(match.distance_miles)}mi` : '-'}
              </div>
              
              <div className="text-sm">
                {match.distance_miles 
                  ? `${Math.floor(match.distance_miles / 50)}h ${Math.round((match.distance_miles / 50 - Math.floor(match.distance_miles / 50)) * 60)}m`
                  : '-'
                }
              </div>
              
              <div className="text-sm text-muted-foreground">
                {match.oil_change_due ? 'OIL CHANGE OVER DUE' : '-'}
              </div>
              
              <div>
                <Badge variant={match.status === 'active' ? 'default' : 'secondary'}>
                  {match.status || 'Empty'}
                </Badge>
              </div>
              
              <div className="text-sm text-muted-foreground">-</div>
              
              <div className="text-sm text-muted-foreground">
                {match.current_location || '-'}
              </div>
              
              <div className="text-sm text-muted-foreground">
                {match.last_updated 
                  ? new Date(match.last_updated).toLocaleString('en-US', {
                      month: '2-digit',
                      day: '2-digit',
                      year: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '-'
                }
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-start pt-4">
          <Button 
            variant="destructive" 
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
