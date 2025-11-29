import { Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-auto">
      <div className="mx-auto max-w-[1700px] px-4 py-3">
        <div className="flex justify-end mb-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="flex gap-4">
          {/* MAIN CONTENT */}
          <div className="flex-1">
            <Card className="border rounded-lg overflow-hidden">
              {/* TOP HEADER */}
              <div className="flex items-center justify-between px-4 py-3 border-b bg-slate-50">
                {/* TAL-3 Section */}
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-16 flex-col items-center justify-center rounded-xl bg-blue-100 border border-blue-200">
                    <Truck className="h-4 w-4 text-blue-600 mb-0.5" />
                    <div className="text-[11px] font-semibold text-blue-600">TAL-3</div>
                    <div className="text-[11px] font-semibold text-red-500">Empty</div>
                  </div>
                  <div className="space-y-0.5 text-[11px]">
                    <div>
                      <span className="text-gray-500">D1</span>{" "}
                      <span className="font-medium">No Driver Assigned</span>{" "}
                      <span className="text-gray-400">Note:</span>
                    </div>
                    <div>
                      <span className="text-gray-500">D2</span>{" "}
                      <span className="font-medium">No Driver Assigned</span>{" "}
                      <span className="text-gray-400">Note:</span>
                    </div>
                  </div>
                </div>

                {/* Match ID Section */}
                <div className="flex items-center gap-8">
                  <div className="text-right">
                    <div className="text-[14px] font-bold">Match ID: 4227959</div>
                    <button className="text-[11px] text-blue-500 hover:underline">
                      View Match History
                    </button>
                  </div>
                  <div className="flex gap-6 text-[11px]">
                    <div className="text-center">
                      <div className="text-gray-500">Average</div>
                    </div>
                    <div className="text-center">
                      <div className="text-gray-500">Bid</div>
                      <div className="text-blue-600 font-semibold">$1,282</div>
                    </div>
                    <div className="text-center">
                      <div className="text-gray-500">Booked</div>
                      <div className="font-semibold">N/A</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* CARRIER TABLE */}
              <div className="text-[11px]">
                {/* Header Row */}
                <div className="grid grid-cols-[2.5fr,1.2fr,1.3fr,1.3fr,1fr,1fr,2fr] px-4 py-2 bg-blue-50 border-b text-blue-600 font-semibold">
                  <div></div>
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
                  <div></div>
                </div>

                {/* Carrier Row 1 */}
                <div className="grid grid-cols-[2.5fr,1.2fr,1.3fr,1.3fr,1fr,1fr,2fr] px-4 py-2 border-b">
                  <div className="bg-red-100 -mx-4 px-4 py-1 flex items-center font-semibold">
                    NE-LANG LOGISTICS LLC
                  </div>
                  <div></div>
                  <div></div>
                  <div></div>
                  <div></div>
                  <div></div>
                  <div></div>
                </div>

                {/* Carrier Row 2 */}
                <div className="grid grid-cols-[2.5fr,1.2fr,1.3fr,1.3fr,1fr,1fr,2fr] px-4 py-2 border-b">
                  <div className="bg-yellow-100 -mx-4 px-4 py-1 flex items-center font-semibold">
                    GLOBALTRANZ ENTERPRISES, LLC
                  </div>
                  <div className="text-center py-1">
                    <div>11/30/25 Sun 17:00 EST</div>
                    <div>12/01/25 Mon 09:00 EST</div>
                  </div>
                  <div className="py-1">
                    <div>
                      <span className="text-orange-500 font-bold">P</span> {originCity}, {originState}
                    </div>
                    <div>
                      <span className="text-blue-500 font-bold">D</span> {destCity}, {destState}
                    </div>
                  </div>
                  <div className="text-green-600 py-1">
                    <div>+ 408mi [6h 48m]</div>
                    <div>+ 375mi [6h 15m]</div>
                  </div>
                  <div className="text-center py-1">
                    <div>SPRINTER</div>
                    <div>0</div>
                  </div>
                  <div className="text-center py-1">
                    <div>0</div>
                    <div>0L x 0W x 0H</div>
                  </div>
                  <div className="py-1">
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <div className="flex gap-2">
                          <span className="text-blue-600 font-semibold">Loaded Miles</span>
                          <span className="font-semibold">375</span>
                          <span className="text-blue-600">$3.42</span>
                        </div>
                        <div className="flex gap-2">
                          <span className="text-blue-600 font-semibold">Total Miles</span>
                          <span className="font-semibold">783</span>
                          <span className="text-blue-600">$1.64</span>
                        </div>
                        <div className="flex gap-2">
                          <span className="text-blue-600 font-semibold">Fuel, Tolls and Driver</span>
                          <span className="font-semibold">$0.00</span>
                          <span className="text-blue-600">$0.00</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Stats & Bid Button Row */}
                <div className="px-4 py-3 border-b bg-slate-50 flex justify-end items-center gap-3">
                  <div className="flex items-center gap-2 bg-blue-500 text-white rounded-full px-3 py-1.5">
                    <span className="text-lg font-bold">$</span>
                    <span className="text-lg font-bold">1282</span>
                  </div>
                  <Button className="bg-green-600 hover:bg-green-700 h-8 px-4 text-[11px] font-semibold">
                    Set Bid
                  </Button>
                </div>
              </div>

              {/* ORIGINAL POST ROW */}
              <div className="grid grid-cols-[1.2fr,4fr,1.3fr] px-4 py-2 border-b text-[11px] bg-slate-50">
                <div className="font-semibold text-blue-600">Original Post</div>
                <div className="text-red-600">
                  Note: CONFIRM MC, CONFIRM ETA TO PICK, CONFIRM TRUCK DIMS
                </div>
                <div className="text-right">
                  <span className="font-semibold">Posted Rate:</span>{" "}
                  <span className="text-red-600 font-semibold">N/A</span>
                </div>
              </div>

              {/* VEHICLE ROW */}
              <div className="grid grid-cols-[1.2fr,4fr,1.3fr] px-4 py-2 text-[11px] bg-slate-50">
                <div className="font-semibold text-blue-600">Vehicle</div>
                <div className="text-gray-500">Note:</div>
                <div className="flex items-center justify-end gap-3">
                  <span>
                    <span className="font-semibold">Vehicle Size:</span> CARGO VAN
                  </span>
                  <Button className="bg-orange-500 hover:bg-orange-600 h-7 px-3 text-[11px] font-semibold">
                    Original Email
                  </Button>
                </div>
              </div>

              {/* ACTION BUTTONS ROW */}
              <div className="flex justify-end gap-2 px-4 py-3 border-t">
                <Button variant="destructive" size="sm" className="h-8 px-4 text-[11px]">
                  Skip
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  className="h-8 px-4 text-[11px] bg-blue-500 hover:bg-blue-600"
                >
                  Undecided
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  className="h-8 px-4 text-[11px] bg-blue-500 hover:bg-blue-600"
                >
                  Mark Unreviewed
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  className="h-8 px-4 text-[11px] bg-blue-500 hover:bg-blue-600"
                >
                  Wait
                </Button>
              </div>
            </Card>

            {/* MAP */}
            <Card className="mt-4 h-[500px] overflow-hidden rounded-lg">
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
          <div className="w-[200px]">
            <Card className="p-3">
              <div className="flex justify-between text-[10px] text-gray-500 pb-2 border-b mb-2">
                <span>Quote Rate</span>
                <span>[$/mi]</span>
              </div>
              <div className="space-y-1 text-[11px] max-h-[600px] overflow-auto">
                {[
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
                ].map((row, idx) => (
                  <div
                    key={idx}
                    className={`flex justify-between px-2 py-1 rounded ${
                      row.rate === "$1,282.00"
                        ? "bg-blue-100 font-semibold"
                        : "hover:bg-slate-50"
                    }`}
                  >
                    <span>{row.rate}</span>
                    <span className="text-gray-600">{row.perMile}</span>
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
