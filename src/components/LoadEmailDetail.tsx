import { X, Truck, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import LoadRouteMap from "@/components/LoadRouteMap";

interface LoadEmailDetailProps {
  email: any;
  onClose: () => void;
}

const LoadEmailDetail = ({ email, onClose }: LoadEmailDetailProps) => {
  const data = email.parsed_data || {};

  const originCity = data.origin_city || "ATLANTA";
  const originState = data.origin_state || "GA";
  const destCity = data.destination_city || "MEMPHIS";
  const destState = data.destination_state || "TN";

  const pickupDate = data.pickup_date_time || "11/30/25 Sun 17:00 EST";
  const deliveryDate = data.delivery_date_time || "12/01/25 Mon 09:00 EST";

  const vehicleType = data.vehicle_type || "SPRINTER";
  const weight = data.weight || "0";

  const loadedMiles = data.loaded_miles || 375;
  const totalMiles = data.total_miles || 783;

  const quoteTable = [
    { rate: "$1,782.00", perMile: "$2.28" },
    { rate: "$1,732.00", perMile: "$2.21" },
    { rate: "$1,682.00", perMile: "$2.15" },
    { rate: "$1,632.00", perMile: "$2.08" },
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
    { rate: "$782.00", perMile: "$1.00" },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-auto">
      <div className="mx-auto max-w-[1700px] px-3 py-3">
        {/* Close */}
        <div className="flex justify-between items-center mb-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex gap-3">
          {/* CENTER COLUMN: header + map */}
          <div className="flex-1 space-y-3">
            <Card className="border rounded-md overflow-hidden">
              {/* TOP HEADER ROW */}
              <div className="flex border-b">
                {/* Left TAL-3 panel */}
                <div className="flex items-center gap-3 px-4 py-2 border-r min-w-[260px]">
                  <div className="flex h-10 w-10 items-center justify-center rounded bg-blue-500 text-white">
                    <Truck className="h-5 w-5" />
                  </div>
                  <div className="space-y-0.5 text-[13px] leading-tight">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-blue-600">TAL-3</span>
                      <span className="font-semibold text-red-500">Empty</span>
                    </div>
                    <div className="flex text-[11px] text-muted-foreground gap-4">
                      <span>
                        D1 <span className="font-medium text-foreground">No Driver Assigned</span> Note:
                      </span>
                    </div>
                    <div className="flex text-[11px] text-muted-foreground gap-4">
                      <span>
                        D2 <span className="font-medium text-foreground">No Driver Assigned</span> Note:
                      </span>
                    </div>
                  </div>
                </div>

                {/* Middle carrier grid */}
                <div className="flex-1 text-[12px]">
                  {/* Header row */}
                  <div className="grid grid-cols-[2fr,1.5fr,1.5fr,1.5fr,1.5fr,1.2fr,1.2fr] border-b bg-muted/40 px-3 py-1 font-semibold text-blue-600">
                    <div />
                    <div className="text-right">Pickup Time<br />DeliverTime</div>
                    <div className="text-right">Origin<br />Destination</div>
                    <div className="text-right">Empty Drive<br />Loaded Drive</div>
                    <div className="text-right">Load Type<br />Weight</div>
                    <div className="text-right">Pieces</div>
                    <div className="text-right">Dimensions</div>
                  </div>

                  {/* Row 1 - red */}
                  <div className="grid grid-cols-[2fr,1.5fr,1.5fr,1.5fr,1.5fr,1.2fr,1.2fr] border-b">
                    <div className="flex items-center px-3 py-1 bg-red-100 text-[12px] font-semibold">
                      NE-LANG LOGISTICS LLC
                    </div>
                    <div className="px-3 py-1 text-right align-middle" />
                    <div className="px-3 py-1 text-right align-middle" />
                    <div className="px-3 py-1 text-right align-middle" />
                    <div className="px-3 py-1 text-right align-middle" />
                    <div className="px-3 py-1 text-right align-middle" />
                    <div className="px-3 py-1 text-right align-middle" />
                  </div>

                  {/* Row 2 - yellow with data */}
                  <div className="grid grid-cols-[2fr,1.5fr,1.5fr,1.5fr,1.5fr,1.2fr,1.2fr]">
                    <div className="flex items-center px-3 py-1 bg-amber-100 text-[12px] font-semibold">
                      GLOBALTRANZ ENTERPRISES, LLC
                    </div>
                    <div className="px-3 py-1 text-right">
                      <div>{pickupDate}</div>
                    </div>
                    <div className="px-3 py-1 text-right">
                      <div>
                        <span className="text-orange-500 font-semibold mr-1">P</span>
                        {originCity}, {originState}
                      </div>
                      <div>
                        <span className="text-blue-500 font-semibold mr-1">D</span>
                        {destCity}, {destState}
                      </div>
                    </div>
                    <div className="px-3 py-1 text-right">
                      <div className="text-green-600">+ 408mi [6h 48m]</div>
                      <div className="text-green-600">+ 375mi [6h 15m]</div>
                    </div>
                    <div className="px-3 py-1 text-right">
                      <div>{vehicleType}</div>
                      <div>{weight}</div>
                    </div>
                    <div className="px-3 py-1 text-right">0</div>
                    <div className="px-3 py-1 text-right">0L x 0W x 0H</div>
                  </div>
                </div>

                {/* Right Match card */}
                <div className="w-[260px] border-l p-3 text-[12px]">
                  <div className="flex justify-between items-baseline mb-1">
                    <div>
                      <div className="text-[11px] text-muted-foreground">Match ID:</div>
                      <div className="font-semibold text-[13px]">4227959</div>
                    </div>
                    <button className="text-[11px] text-blue-600 underline">
                      View Match History
                    </button>
                  </div>

                  <Card className="mt-2 border bg-background">
                    <div className="grid grid-cols-3 text-center text-[11px] border-b">
                      <div className="py-1">
                        <div>Average</div>
                      </div>
                      <div className="py-1 font-semibold bg-blue-100">Bid</div>
                      <div className="py-1">Booked</div>
                    </div>
                    <div className="py-2 text-center text-[11px]">
                      <div className="text-xs font-semibold mb-1">$1,282</div>
                    </div>

                    <div className="px-2 py-1 text-[11px] border-t space-y-0.5">
                      <div className="flex justify-between">
                        <span>Loaded Miles</span>
                        <span>
                          {loadedMiles} <span className="text-blue-600 font-semibold">$3.42</span>
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Total Miles</span>
                        <span>
                          {totalMiles} <span className="text-blue-600 font-semibold">$1.64</span>
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Fuel, Tolls and Driver</span>
                        <span>
                          $0.00 <span className="text-blue-600 font-semibold">$0.00</span>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between px-3 py-2 border-t">
                      <div className="flex items-center gap-1 text-[11px] font-semibold text-blue-600">
                        <span className="text-lg">$</span> 1282
                      </div>
                      <Button size="sm" className="h-7 px-3 bg-green-600 hover:bg-green-700 text-[11px]">
                        Set Bid
                      </Button>
                    </div>
                  </Card>
                </div>
              </div>

              {/* ORIGINAL POST / VEHICLE ROWS */}
              <div className="border-t text-[12px]">
                <div className="grid grid-cols-[1.6fr,3fr,1.4fr] border-b">
                  <div className="px-4 py-2 border-r bg-muted/40 font-semibold text-blue-600">
                    Original Post
                  </div>
                  <div className="px-4 py-2 text-red-600 text-[11px] flex items-center">
                    Note: CONFIRM MC, CONFIRM ETA TO PICK, CONFIRM TRUCK DIMS
                  </div>
                  <div className="px-4 py-2 border-l flex items-center justify-end">
                    <span className="mr-2 font-semibold">Posted Rate:</span>
                    <span className="text-red-600 font-semibold">N/A</span>
                  </div>
                </div>

                <div className="grid grid-cols-[1.6fr,3fr,1.4fr]">
                  <div className="px-4 py-2 border-r bg-muted/40 font-semibold text-blue-600">
                    Vehicle
                  </div>
                  <div className="px-4 py-2 text-[11px] flex items-center">
                    Note:
                  </div>
                  <div className="px-4 py-2 border-l flex items-center justify-between">
                    <div className="text-[11px]">
                      <span className="font-semibold mr-1">Vehicle Size:</span> CARGO VAN
                    </div>
                    <Button className="h-8 px-4 bg-orange-500 hover:bg-orange-600 text-[11px] font-semibold">
                      Original Email
                    </Button>
                  </div>
                </div>
              </div>
            </Card>

            {/* MAP */}
            <Card className="h-[520px] overflow-hidden">
              <LoadRouteMap
                stops={[
                  {
                    location_city: originCity,
                    location_state: originState,
                    location_address: `${originCity}, ${originState}`,
                    stop_type: "pickup",
                  },
                  {
                    location_city: destCity,
                    location_state: destState,
                    location_address: `${destCity}, ${destState}`,
                    stop_type: "delivery",
                  },
                ]}
              />
            </Card>
          </div>

          {/* RIGHT QUOTE COLUMN */}
          <div className="w-[180px] flex-shrink-0">
            <Card className="text-[11px] p-2">
              <div className="flex justify-between px-1 pb-1 text-muted-foreground text-[10px] border-b mb-1">
                <span>Quote Rate</span>
                <span>$/mi</span>
              </div>
              <div className="space-y-0.5 max-h-[520px] overflow-auto pr-1">
                {quoteTable.map((row, idx) => (
                  <div
                    key={idx}
                    className={`flex justify-between px-2 py-1 rounded-sm ${
                      row.rate === "$1,282.00" ? "bg-blue-100 font-semibold" : "hover:bg-muted"
                    }`}
                  >
                    <span>{row.rate}</span>
                    <span>{row.perMile}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoadEmailDetail;
