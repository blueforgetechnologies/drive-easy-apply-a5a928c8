import { X, Truck, MapPin, Package, Calendar, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import LoadRouteMap from "@/components/LoadRouteMap";

interface LoadEmailDetailProps {
  email: any;
  onClose: () => void;
}

const LoadEmailDetail = ({ email, onClose }: LoadEmailDetailProps) => {
  const [bidAmount, setBidAmount] = useState("");
  
  const parsedData = email.parsed_data || {};
  const originCity = parsedData.origin_city || "N/A";
  const originState = parsedData.origin_state || "";
  const destCity = parsedData.destination_city || "N/A";
  const destState = parsedData.destination_state || "";
  const pickupDate = parsedData.pickup_date || "N/A";
  const deliveryDate = parsedData.delivery_date || "N/A";
  const equipmentType = parsedData.equipment_type || "N/A";
  const weight = parsedData.weight || "0";
  const rate = parsedData.rate || "N/A";
  
  // Sample pricing data - would come from calculations
  const pricingData = [
    { rate: "$1,282.00", perMile: "$2.28" },
    { rate: "$1,732.00", perMile: "$2.21" },
    { rate: "$1,682.00", perMile: "$2.15" },
    { rate: "$1,632.00", perMile: "$2.08" },
    { rate: "$1,532.00", perMile: "$1.96" },
    { rate: "$1,482.00", perMile: "$1.89" },
    { rate: "$1,432.00", perMile: "$1.83" },
    { rate: "$1,382.00", perMile: "$1.77" },
    { rate: "$1,332.00", perMile: "$1.70" },
    { rate: "$1,282.00", perMile: "$1.64" },
  ];

  return (
    <div className="fixed inset-0 bg-background z-50 overflow-auto">
      {/* Header */}
      <div className="border-b bg-background sticky top-0 z-10">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-blue-600" />
              <h2 className="text-xl font-semibold">
                {email.subject || "Load Details"}
              </h2>
              <Badge variant="destructive">No Driver Assigned</Badge>
              <Badge className="bg-orange-500">Alert</Badge>
              <Badge className="bg-blue-500">Info</Badge>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Match ID:</span>
            <span className="font-semibold">{email.id.slice(0, 8)}</span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 px-4 pb-2">
          <Button variant="default" size="sm">Dispatch</Button>
          <Button variant="outline" size="sm">Add Vehicle</Button>
          <Button variant="ghost" size="sm">Unreviewed Loads <Badge>4</Badge></Button>
          <Button variant="ghost" size="sm">Missed <Badge>50</Badge></Button>
          <Button variant="ghost" size="sm">Waitlist <Badge variant="secondary">0</Badge></Button>
          <Button variant="ghost" size="sm">Undecided <Badge variant="secondary">0</Badge></Button>
          <Button variant="ghost" size="sm">Skipped <Badge variant="secondary">0</Badge></Button>
          <Button variant="ghost" size="sm">My Bids <Badge>0</Badge></Button>
        </div>
      </div>

      <div className="flex gap-4 p-4">
        {/* Main Content */}
        <div className="flex-1 space-y-4">
          {/* Load Info Cards */}
          <div className="grid grid-cols-2 gap-4">
            <Card className="p-4 bg-red-50 border-l-4 border-red-500">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 bg-red-500 rounded flex items-center justify-center">
                  <Truck className="h-5 w-5 text-white" />
                </div>
                <div>
                  <div className="font-semibold">{email.from_name || "Carrier Name"}</div>
                  <div className="text-sm text-muted-foreground">Empty</div>
                </div>
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-blue-600 font-semibold">Pickup Time</span>
                  <span>{pickupDate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-blue-600 font-semibold">Deliver Time</span>
                  <span>{deliveryDate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-blue-600 font-semibold">Origin</span>
                  <span><MapPin className="inline h-3 w-3" /> {originCity}, {originState}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-blue-600 font-semibold">Destination</span>
                  <span><MapPin className="inline h-3 w-3" /> {destCity}, {destState}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-blue-600 font-semibold">Empty Drive</span>
                  <span className="text-green-600">+ 408mi [4h 48m]</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-blue-600 font-semibold">Loaded Drive</span>
                  <span className="text-green-600">+ 375mi [6h 15m]</span>
                </div>
              </div>
            </Card>

            <Card className="p-4 bg-yellow-50 border-l-4 border-yellow-500">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 bg-yellow-500 rounded flex items-center justify-center">
                  <Package className="h-5 w-5 text-white" />
                </div>
                <div className="font-semibold text-sm">GLOBALTRANZ ENTERPRISES, LLC</div>
              </div>
              <div className="text-sm text-muted-foreground">
                12/01/25 Mon 09:00 EST
              </div>
            </Card>
          </div>

          {/* Load Details */}
          <Card className="p-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="flex gap-2 mb-2">
                  <Button variant="outline" size="sm">Original Post</Button>
                  <span className="text-xs text-red-600">Note: CONFIRM MC, CONFIRM ETA TO PICK, CONFIRM TRUCK DIMS</span>
                </div>
                <div className="space-y-1">
                  <div><span className="font-semibold">Vehicle:</span> Note:</div>
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-blue-600 font-semibold">Load Type</span>
                  <span>{equipmentType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-blue-600 font-semibold">Weight</span>
                  <span>{weight}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-blue-600 font-semibold">Pieces</span>
                  <span>0</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-blue-600 font-semibold">Dimensions</span>
                  <span>0L x 0W x 0H</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold">Vehicle Size:</span>
                  <span>CARGO VAN</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-blue-600 font-semibold">Posted Rate:</span>
                  <span className="text-red-600">N/A</span>
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center mt-4 pt-4 border-t">
              <div className="space-y-1">
                <div className="flex gap-2 items-center">
                  <span className="text-blue-600 font-semibold">Loaded Miles</span>
                  <span className="font-bold text-lg">375</span>
                  <span className="text-green-600 font-semibold">$3.42</span>
                </div>
                <div className="flex gap-2 items-center">
                  <span className="text-blue-600 font-semibold">Total Miles</span>
                  <span className="font-bold text-lg">783</span>
                  <span className="text-green-600 font-semibold">$1.64</span>
                </div>
                <div className="flex gap-2 items-center">
                  <span className="text-blue-600 font-semibold">Fuel, Tolls and Driver</span>
                  <span className="font-bold">$0.00</span>
                  <span className="text-green-600 font-semibold">$0.00</span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="bg-orange-500 text-white">Original Email</Button>
                <Button variant="destructive">Skip</Button>
                <Button variant="secondary">Undecided</Button>
                <Button variant="outline">Mark Unreviewed</Button>
                <Button variant="default">Wait</Button>
              </div>
            </div>
          </Card>

          {/* Map */}
          <Card className="p-4">
            <LoadRouteMap 
              stops={[
                { 
                  location_city: originCity, 
                  location_state: originState,
                  location_address: `${originCity}, ${originState}`,
                  stop_type: 'pickup'
                },
                { 
                  location_city: destCity, 
                  location_state: destState,
                  location_address: `${destCity}, ${destState}`,
                  stop_type: 'delivery'
                }
              ]} 
            />
          </Card>
        </div>

        {/* Right Sidebar - Pricing */}
        <div className="w-80">
          <Card className="p-4">
            <div className="text-center mb-4">
              <div className="flex justify-around mb-2">
                <div>
                  <div className="text-sm text-muted-foreground">Average</div>
                  <div className="text-sm text-muted-foreground">Bid</div>
                </div>
                <div>
                  <div className="font-bold text-lg">Booked</div>
                  <div className="text-blue-600 font-bold">$1,282</div>
                </div>
                <div>
                  <div className="text-sm">N/A</div>
                </div>
              </div>
              <div className="text-center text-2xl font-bold mb-2">1282</div>
              <Button className="w-full bg-green-600 hover:bg-green-700">Set Bid</Button>
            </div>

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground flex justify-between px-2">
                <span>Quote Rate</span>
                <span>$/mi</span>
              </div>
              {pricingData.map((item, index) => (
                <div 
                  key={index}
                  className={`flex justify-between p-2 rounded text-sm ${
                    index === 0 ? 'bg-blue-100 font-semibold' : 'hover:bg-muted'
                  }`}
                >
                  <span>{item.rate}</span>
                  <span>{item.perMile}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default LoadEmailDetail;
