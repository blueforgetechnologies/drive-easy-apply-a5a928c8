import { Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import LoadRouteMap from "@/components/LoadRouteMap";

interface LoadEmailDetailProps {
  email: any;
  onClose: () => void;
}

// This component is a pixel-close recreation of your reference layout
const LoadEmailDetail = ({ email, onClose }: LoadEmailDetailProps) => {
  const data = email.parsed_data || {};

  const originCity = data.origin_city || "ATLANTA";
  const originState = data.origin_state || "GA";
  const destCity = data.destination_city || "MEMPHIS";
  const destState = data.destination_state || "TN";

  const pickupDate1 = data.pickup_date_time || "11/30/25 Sun";
  const pickupDate2 = data.pickup_time || "17:00 EST";
  const deliveryDate1 = data.delivery_date_time || "12/01/25 Mon";
  const deliveryDate2 = data.delivery_time || "09:00 EST";

  const vehicleType = data.vehicle_type || "SPRINTER";
  const weight = data.weight || "0";

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
      <div className="mx-auto max-w-[1700px] px-3 py-2">
        {/* top-close bar */}
        <div className="flex justify-end mb-1">
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-3 text-[11px]"
            onClick={onClose}
          >
            Close
          </Button>
        </div>

        <div className="flex gap-3">
          {/* CENTER COLUMN (everything except quote table) */}
          <div className="flex-1 space-y-3">
            <Card className="border rounded-md overflow-hidden">
              {/* HEADER ROW: TAL-3 + carrier grid + Match ID */}
              <div className="flex text-[11px] leading-tight">
                {/* TAL-3 pill + D1/D2 */}
                <div className="flex items-center gap-3 px-3 py-2 border-r min-w-[260px]">
                  <div className="flex h-14 w-20 flex-col items-center justify-center rounded-2xl bg-blue-50 shadow-[0_0_0_1px_#e0e7ff]">
                    <Truck className="h-4 w-4 text-blue-600 mb-0.5" />
                    <div className="text-[12px] font-semibold text-blue-600 leading-none">
                      TAL-3
                    </div>
                    <div className="text-[12px] font-semibold text-red-500 leading-none mt-0.5">
                      Empty
                    </div>
                  </div>
                  <div className="space-y-0.5 text-[11px]">
                    <div>
                      <span className="text-gray-500 mr-1">D1</span>
                      <span className="font-medium">No Driver Assigned</span>
                      <span className="text-gray-400 ml-2">Note:</span>
                    </div>
                    <div>
                      <span className="text-gray-500 mr-1">D2</span>
                      <span className="font-medium">No Driver Assigned</span>
                      <span className="text-gray-400 ml-2">Note:</span>
                    </div>
                  </div>
                </div>

                {/* Carrier grid */}
                <div className="flex-1 border-r">
                  {/* blue header row */}
                  <div className="grid grid-cols-[2fr,1.5fr,1.5fr,1.5fr,1.2fr,1.2fr] px-3 py-1 border-b bg-blue-50 text-blue-600 font-semibold text-[11px]">
                    <div />
                    <div className="text-center">
                      Pickup Time
                      <br />
                      DeliverTime
                    </div>
                    <div className="text-center">
                      Origin
                      <br />
                      Destination
                    </div>
                    <div className="text-center">
                      Empty Drive
                      <br />
                      Loaded Drive
                    </div>
                    <div className="text-center">
                      Load Type
                      <br />
                      Weight
                    </div>
                    <div className="text-center">
                      Pieces
                      <br />
                      Dimensions
                    </div>
                  </div>

                  {/* carrier rows */}
                  <div className="grid grid-cols-[2fr,1.5fr,1.5fr,1.5fr,1.2fr,1.2fr] border-b">
                    <div className="px-3 py-2 bg-red-100 text-[11px] font-semibold align-middle flex items-center">
                      NE-LANG LOGISTICS LLC
                    </div>
                    <div className="px-3 py-2" />
                    <div className="px-3 py-2" />
                    <div className="px-3 py-2" />
                    <div className="px-3 py-2" />
                    <div className="px-3 py-2" />
                  </div>

                  <div className="grid grid-cols-[2fr,1.5fr,1.5fr,1.5fr,1.2fr,1.2fr]">
                    <div className="px-3 py-2 bg-amber-100 text-[11px] font-semibold align-middle flex items-center">
                      GLOBALTRANZ ENTERPRISES, LLC
                    </div>
                    <div className="px-3 py-2 text-center">
                      <div>{pickupDate1}</div>
                      <div>{pickupDate2}</div>
                    </div>
                    <div className="px-3 py-2">
                      <div>
                        <span className="text-orange-500 font-semibold mr-1">P</span>
                        {originCity}, {originState}
                      </div>
                      <div>
                        <span className="text-blue-500 font-semibold mr-1">D</span>
                        {destCity}, {destState}
                      </div>
                    </div>
                    <div className="px-3 py-2 text-green-600">
                      <div>+ 408mi [6h 48m]</div>
                      <div>+ 375mi [6h 15m]</div>
                    </div>
                    <div className="px-3 py-2">
                      <div>{vehicleType}</div>
                      <div>{weight}</div>
                    </div>
                    <div className="px-3 py-2 text-center">0</div>
                    <div className="px-3 py-2 text-center">0L x 0W x 0H</div>
                  </div>
                </div>

                {/* Match ID block */}
                <div className="w-[210px] px-3 py-2 text-[11px]">
                  <div className="mb-2">
                    <div className="font-bold text-[13px]">
                      Match ID: <span>4227959</span>
                    </div>
                    <button className="text-[11px] text-blue-500 mt-0.5">
                      View Match History
                    </button>
                  </div>

                  {/* small stats card (simple version matching right-hand group) */}
                  <div className="mt-1 rounded-md border bg-white text-[11px] px-2 py-2">
                    <div className="flex justify-between mb-1">
                      <span>Loaded Miles</span>
                      <span>
                        375 <span className="text-blue-600">$3.42</span>
                      </span>
                    </div>
                    <div className="flex justify-between mb-1">
                      <span>Total Miles</span>
                      <span>
                        783 <span className="text-blue-600">$1.64</span>
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Fuel, Tolls and Driver</span>
                      <span>
                        $0.00 <span className="text-blue-600">$0.00</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ORIGINAL POST / VEHICLE ROWS */}
              <div className="border-t text-[11px] bg-slate-50">
                <div className="grid grid-cols-[1.5fr,3fr,1.6fr] border-b">
                  <div className="px-4 py-2 border-r font-semibold text-blue-600 bg-slate-100">
                    Original Post
                  </div>
                  <div className="px-4 py-2 text-red-600">
                    Note: CONFIRM MC, CONFIRM ETA TO PICK, CONFIRM TRUCK DIMS
                  </div>
                  <div className="px-4 py-2 border-l flex items-center justify-end gap-1">
                    <span className="font-semibold">Posted Rate:</span>
                    <span className="text-red-600 font-semibold">N/A</span>
                  </div>
                </div>

                <div className="grid grid-cols-[1.5fr,3fr,1.6fr]">
                  <div className="px-4 py-2 border-r font-semibold text-blue-600 bg-slate-100">
                    Vehicle
                  </div>
                  <div className="px-4 py-2">Note:</div>
                  <div className="px-4 py-2 border-l flex items-center justify-between">
                    <span>
                      <span className="font-semibold mr-1">Vehicle Size:</span> CARGO VAN
                    </span>
                    <Button className="h-8 px-4 rounded-md bg-orange-500 hover:bg-orange-600 text-[11px] font-semibold text-white">
                      Original Email
                    </Button>
                  </div>
                </div>
              </div>
            </Card>

            {/* MAP CARD */}
            <Card className="h-[520px] overflow-hidden rounded-md">
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

          {/* QUOTE COLUMN (right side) */}
          <div className="w-[190px] flex-shrink-0">
            <Card className="p-2 text-[11px]">
              <div className="flex justify-between px-1 pb-1 text-[10px] text-gray-500 border-b mb-1">
                <span>Quote Rate</span>
                <span>$/mi</span>
              </div>
              <div className="max-h-[520px] overflow-auto space-y-0.5 pr-1">
                {quoteTable.map((row) => (
                  <div
                    key={row.rate}
                    className={`flex justify-between px-2 py-1 rounded-sm ${
                      row.rate === "$1,282.00" ? "bg-blue-100 font-semibold" : "hover:bg-slate-100"
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
