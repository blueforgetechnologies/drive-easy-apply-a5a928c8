import { Truck, Home, Bell } from "lucide-react";
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

  // Mock vehicle data for sidebar
  const vehicles = [
    { name: "NATL-1 - Torrence Dupree", company: "24' Large Straight\nALLIED FREIGHTLINE L...", badges: [1, 1, 1] },
    { name: "NATL-13 - Lorenzo Stoner", company: "24' Large Straight\nDOAL LOGISTICS EXPRE...", badges: [1, 1, 1] },
    { name: "NATL-6 - Jose Lopez", company: "24' Large Straight\nALLIED FREIGHTLINE L...", badges: [1, 1, 1] },
    { name: "NATL-8 - WARD", company: "24' Large Straight\nDort Transportation", badges: [1, 1, 1] },
    { name: "TAL-16 - RICARDO", company: "26' Large Straight\nDort Transportation", badges: [1, 1, 1] },
    { name: "TAL-21 - ROY", company: "26' Large Straight\nBALE ROAD ROAD TRANS...", badges: [1, 1, 1] },
    { name: "TAL-27 - Arthur Raglin", company: "26' Large Straight\nMYTRANSPORTATION SER...", badges: [1, 1, 1] },
    { name: "TAL-3 - No Driver Assigned", company: "24' Large Straight\nNE-LANG LOGISTICS LL...", badges: [1, 1, 1], active: true },
    { name: "TAL-7 - Shaun Johnson Anthony", company: "24' Large Straight\nGlobal Expediting ...", badges: [1, 1, 1] },
    { name: "TAL-9 - Crystal", company: "24' Large Straight\nALLIED FREIGHTLINE L...", badges: [1, 1, 1] },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-background flex">
      {/* LEFT SIDEBAR - Vehicle List */}
      <div className="w-[260px] border-r bg-background overflow-y-auto">
        <div className="space-y-1 p-2">
          {vehicles.map((vehicle, idx) => (
            <div
              key={idx}
              className={`p-2 rounded cursor-pointer border ${
                vehicle.active ? "bg-blue-50 border-blue-200" : "hover:bg-accent"
              }`}
            >
              <div className="flex items-start justify-between mb-1">
                <div className={`text-[11px] font-semibold ${vehicle.active && vehicle.name.includes("No Driver") ? "text-red-500" : ""}`}>
                  {vehicle.name}
                </div>
                <div className="flex gap-0.5">
                  <Badge variant="destructive" className="h-4 w-4 p-0 text-[9px] flex items-center justify-center">
                    {vehicle.badges[0]}
                  </Badge>
                  <Badge className="h-4 w-4 p-0 text-[9px] flex items-center justify-center bg-orange-500">
                    {vehicle.badges[1]}
                  </Badge>
                  <Badge className="h-4 w-4 p-0 text-[9px] flex items-center justify-center bg-blue-500">
                    {vehicle.badges[2]}
                  </Badge>
                </div>
              </div>
              <div className="text-[10px] text-gray-500 whitespace-pre-line leading-tight">
                {vehicle.company}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* TOP FILTER BAR */}
        <div className="border-b bg-background px-3 py-2">
          <div className="flex items-center gap-2 text-[11px] flex-wrap">
            <span className="text-[10px] font-semibold text-gray-500 mr-1">MODE:</span>
            <Button size="sm" variant="default" className="h-6 px-3 text-[10px]">
              Admin
            </Button>
            <Button size="sm" variant="outline" className="h-6 px-3 text-[10px]">
              Dispatch
            </Button>
            <Button size="sm" className="h-6 px-3 text-[10px] bg-green-600 hover:bg-green-700">
              Add Vehicle
            </Button>
            
            <div className="h-4 w-px bg-border mx-1" />
            
            <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]">
              Unreviewed Loads <Badge variant="destructive" className="ml-1 h-3 px-1 text-[9px]">4</Badge>
            </Button>
            <Button size="sm" variant="outline" className="h-6 p-1">
              <Home className="h-3 w-3" />
            </Button>
            <Button size="sm" variant="outline" className="h-6 p-1">
              <Bell className="h-3 w-3" />
            </Button>
            <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]">
              Missed <Badge className="ml-1 h-3 px-1 text-[9px] bg-gray-200 text-gray-700">50</Badge>
            </Button>
            <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]">
              Waitlist <Badge className="ml-1 h-3 px-1 text-[9px] bg-orange-500">0</Badge>
            </Button>
            <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]">
              Undecided <Badge className="ml-1 h-3 px-1 text-[9px] bg-gray-200 text-gray-700">0</Badge>
            </Button>
            <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]">
              Skipped <Badge className="ml-1 h-3 px-1 text-[9px] bg-gray-200 text-gray-700">21</Badge>
            </Button>
            <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]">
              My Bids <Badge className="ml-1 h-3 px-1 text-[9px] bg-blue-500">0</Badge>
            </Button>
            <Button size="sm" className="h-6 px-2 text-[10px] bg-orange-500 hover:bg-orange-600">
              All
            </Button>
            <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]">
              Booked <Badge className="ml-1 h-3 px-1 text-[9px] bg-blue-500">1</Badge>
            </Button>
            <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]">
              Vehicle Assignment
            </Button>
            <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]">
              Dispatcher Matrix
            </Button>
          </div>
        </div>

        {/* SCROLLABLE CONTENT */}
        <div className="flex-1 overflow-auto">
          <div className="flex gap-3 p-3">
            {/* CENTER COLUMN */}
            <div className="flex-1">
              <Card className="border rounded-md overflow-hidden mb-3">
                {/* HEADER */}
                <div className="flex items-center border-b p-3 bg-slate-50">
                  <div className="flex items-center gap-3 flex-1">
                    <div className="flex h-12 w-16 flex-col items-center justify-center rounded-lg bg-blue-100 border border-blue-300">
                      <Truck className="h-4 w-4 text-blue-600" />
                      <div className="text-[10px] font-semibold text-blue-600">TAL-3</div>
                      <div className="text-[10px] font-semibold text-red-500">Empty</div>
                    </div>
                    <div className="text-[11px] space-y-0.5">
                      <div>
                        <span className="text-gray-500">D1</span> <span className="font-medium">No Driver Assigned</span>{" "}
                        <span className="text-gray-400">Note:</span>
                      </div>
                      <div>
                        <span className="text-gray-500">D2</span> <span className="font-medium">No Driver Assigned</span>{" "}
                        <span className="text-gray-400">Note:</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-8">
                    <div>
                      <div className="text-[14px] font-bold mb-0.5">Match ID: 4227959</div>
                      <button className="text-[10px] text-blue-500 hover:underline">View Match History</button>
                    </div>
                    <div className="grid grid-cols-3 gap-6 text-[11px] text-center">
                      <div>
                        <div className="text-gray-500 mb-0.5">Average</div>
                      </div>
                      <div>
                        <div className="text-gray-500 mb-0.5">Bid</div>
                        <div className="text-blue-600 font-semibold">$1,282</div>
                      </div>
                      <div>
                        <div className="text-gray-500 mb-0.5">Booked</div>
                        <div className="font-semibold">N/A</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* TABLE HEADER */}
                <div className="grid grid-cols-[2.2fr,1.2fr,1.2fr,1.3fr,1fr,1fr,2.3fr] px-3 py-2 bg-blue-50 border-b text-[11px] text-blue-600 font-semibold text-center">
                  <div className="text-left"></div>
                  <div>Pickup Time<br />DeliverTime</div>
                  <div>Origin<br />Destination</div>
                  <div>Empty Drive<br />Loaded Drive</div>
                  <div>Load Type<br />Weight</div>
                  <div>Pieces<br />Dimensions</div>
                  <div className="text-right pr-4">[$/mi]</div>
                </div>

                {/* CARRIER ROWS */}
                <div className="border-b">
                  <div className="grid grid-cols-[2.2fr,1.2fr,1.2fr,1.3fr,1fr,1fr,2.3fr] px-3 py-2 text-[11px]">
                    <div className="bg-red-100 -mx-3 px-3 py-1 font-semibold flex items-center">
                      NE-LANG LOGISTICS LLC
                    </div>
                    <div></div>
                    <div></div>
                    <div></div>
                    <div></div>
                    <div></div>
                    <div></div>
                  </div>
                </div>

                <div className="border-b">
                  <div className="grid grid-cols-[2.2fr,1.2fr,1.2fr,1.3fr,1fr,1fr,2.3fr] px-3 py-2 text-[11px]">
                    <div className="bg-yellow-100 -mx-3 px-3 py-1 font-semibold flex items-center">
                      GLOBALTRANZ ENTERPRISES, LLC
                    </div>
                    <div className="text-center">
                      <div>11/30/25 Sun 17:00 EST</div>
                      <div>12/01/25 Mon 09:00 EST</div>
                    </div>
                    <div>
                      <div><span className="text-orange-500 font-bold">P</span> {originCity}, {originState}</div>
                      <div><span className="text-blue-500 font-bold">D</span> {destCity}, {destState}</div>
                    </div>
                    <div className="text-green-600">
                      <div>+ 408mi [6h 48m]</div>
                      <div>+ 375mi [6h 15m]</div>
                    </div>
                    <div className="text-center">
                      <div>SPRINTER</div>
                      <div>0</div>
                    </div>
                    <div className="text-center">
                      <div>0</div>
                      <div>0L x 0W x 0H</div>
                    </div>
                    <div className="space-y-0.5">
                      <div className="flex justify-between">
                        <span className="text-blue-600 font-semibold">Loaded Miles</span>
                        <span><span className="font-semibold">375</span> <span className="text-blue-600">$3.42</span></span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-blue-600 font-semibold">Total Miles</span>
                        <span><span className="font-semibold">783</span> <span className="text-blue-600">$1.64</span></span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-blue-600 font-semibold">Fuel, Tolls and Driver</span>
                        <span><span className="font-semibold">$0.00</span> <span className="text-blue-600">$0.00</span></span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* BID ROW */}
                <div className="flex justify-end items-center gap-3 px-4 py-2 border-b bg-slate-50">
                  <div className="flex items-center gap-2 bg-blue-500 text-white rounded-full h-9 px-4">
                    <span className="text-xl font-bold">$</span>
                    <span className="text-xl font-bold">1282</span>
                  </div>
                  <Button className="bg-green-600 hover:bg-green-700 h-8 px-4 text-[11px] font-semibold">
                    Set Bid
                  </Button>
                </div>

                {/* ORIGINAL POST */}
                <div className="grid grid-cols-[1fr,4fr,1.3fr] px-4 py-2 border-b text-[11px] items-center">
                  <div className="font-semibold text-blue-600">Original Post</div>
                  <div className="text-red-600 text-[10px]">
                    Note: CONFIRM MC, CONFIRM ETA TO PICK, CONFIRM TRUCK DIMS
                  </div>
                  <div className="text-right">
                    <span className="font-semibold">Posted Rate:</span> <span className="text-red-600 font-semibold">N/A</span>
                  </div>
                </div>

                {/* VEHICLE */}
                <div className="grid grid-cols-[1fr,4fr,1.3fr] px-4 py-2 border-b text-[11px] items-center">
                  <div className="font-semibold text-blue-600">Vehicle</div>
                  <div className="text-gray-500">Note:</div>
                  <div className="flex items-center justify-end gap-3">
                    <span><span className="font-semibold">Vehicle Size:</span> CARGO VAN</span>
                    <Button className="bg-orange-500 hover:bg-orange-600 h-7 px-3 text-[11px] font-semibold">
                      Original Email
                    </Button>
                  </div>
                </div>

                {/* ACTION BUTTONS */}
                <div className="flex justify-end gap-2 px-4 py-3">
                  <Button variant="destructive" size="sm" className="h-7 px-3 text-[11px]">
                    Skip
                  </Button>
                  <Button size="sm" className="h-7 px-3 text-[11px] bg-blue-500 hover:bg-blue-600">
                    Undecided
                  </Button>
                  <Button size="sm" className="h-7 px-3 text-[11px] bg-blue-500 hover:bg-blue-600">
                    Mark Unreviewed
                  </Button>
                  <Button size="sm" className="h-7 px-3 text-[11px] bg-blue-500 hover:bg-blue-600">
                    Wait
                  </Button>
                </div>
              </Card>

              {/* MAP */}
              <Card className="h-[500px] overflow-hidden rounded-md">
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
                  <span>$/mi</span>
                </div>
                <div className="space-y-0.5 text-[11px] max-h-[700px] overflow-auto">
                  {[
                    { rate: "$1,782.00", perMile: "$2.28" },
                    { rate: "$1,732.00", perMile: "$2.21" },
                    { rate: "$1,682.00", perMile: "$2.15" },
                    { rate: "$1,632.00", perMile: "$2.08" },
                    { rate: "$1,582.00", perMile: "$2.02" },
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
                  ].map((row, idx) => (
                    <div
                      key={idx}
                      className={`flex justify-between px-2 py-1 rounded ${
                        row.rate === "$1,282.00" ? "bg-blue-100 font-semibold" : "hover:bg-slate-50"
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
    </div>
  );
};

export default LoadEmailDetail;
