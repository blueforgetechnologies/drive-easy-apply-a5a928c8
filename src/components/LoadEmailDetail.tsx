import { Truck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useState } from "react";
import LoadRouteMap from "@/components/LoadRouteMap";

interface LoadEmailDetailProps {
  email: any;
  emptyDriveDistance?: number;
  match?: any;
  vehicles?: any[];
  drivers?: any[];
  carriersMap?: Record<string, string>;
  onClose: () => void;
}

const LoadEmailDetail = ({
  email,
  emptyDriveDistance,
  match,
  vehicles = [],
  drivers = [],
  carriersMap = {},
  onClose
}: LoadEmailDetailProps) => {
  const [showOriginalEmail, setShowOriginalEmail] = useState(false);
  const [bidAmount, setBidAmount] = useState("");
  const [showBidCard, setShowBidCard] = useState(false);
  const data = email.parsed_data || {};
  
  const originCity = data.origin_city || "ATLANTA";
  const originState = data.origin_state || "GA";
  const destCity = data.destination_city || "MEMPHIS";
  const destState = data.destination_state || "TN";

  // Get actual vehicle, driver, carrier, and broker data
  const vehicle = match && vehicles?.find((v: any) => v.id === match.vehicle_id);
  
  const driver1 = vehicle?.driver_1_id ? drivers?.find((d: any) => d.id === vehicle.driver_1_id) : null;
  const driver2 = vehicle?.driver_2_id ? drivers?.find((d: any) => d.id === vehicle.driver_2_id) : null;
  
  const driver1Name = driver1?.personal_info?.firstName && driver1?.personal_info?.lastName 
    ? `${driver1.personal_info.firstName} ${driver1.personal_info.lastName}` 
    : null;
  const driver2Name = driver2?.personal_info?.firstName && driver2?.personal_info?.lastName
    ? `${driver2.personal_info.firstName} ${driver2.personal_info.lastName}` 
    : null;
  const carrierName = vehicle?.carrier ? (carriersMap[vehicle.carrier] || vehicle.carrier) : null;
  
  const brokerName = data.broker || data.customer || email.from_name || email.from_email?.split('@')[0] || "Unknown";

  return (
    <div className="flex-1 overflow-auto relative">
      {/* Original Email Sidebar - Slides in from left */}
      {showOriginalEmail && (
        <div className="absolute left-0 top-0 bottom-0 w-1/2 bg-background z-50 shadow-2xl border-r animate-in slide-in-from-left duration-300 flex flex-col">
          <div className="sticky top-0 bg-background border-b p-4 flex items-center justify-between z-10 flex-shrink-0">
            <h2 className="text-lg font-semibold">Original Email</h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowOriginalEmail(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-4">
              <div>
                <div className="text-sm font-semibold mb-1">From:</div>
                <div className="text-sm text-muted-foreground">{email.from_name || email.from_email}</div>
              </div>
              <div>
                <div className="text-sm font-semibold mb-1">Subject:</div>
                <div className="text-sm text-muted-foreground">{email.subject || 'No subject'}</div>
              </div>
              <div>
                <div className="text-sm font-semibold mb-1">Received:</div>
                <div className="text-sm text-muted-foreground">{new Date(email.received_at).toLocaleString()}</div>
              </div>
              <div className="border-t pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Email Content:</div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const raw = (email.body_html || email.body_text || "") as string;
                      if (!raw) return;

                      const blob = new Blob([raw], { type: "text/html;charset=utf-8" });
                      const url = URL.createObjectURL(blob);
                      window.open(url, "_blank", "noopener,noreferrer");
                    }}
                  >
                    Open in new tab
                  </Button>
                </div>
                {(() => {
                  const raw = (email.body_html || email.body_text || "") as string;
                  if (!raw) {
                    return (
                      <div className="text-sm text-muted-foreground">No email content available</div>
                    );
                  }

                  const hasHtmlTag = raw.toLowerCase().includes("<html");
                  const docHtml = hasHtmlTag
                    ? raw
                    : `<!DOCTYPE html><html><head><meta charset="UTF-8" /></head><body>${raw}</body></html>`;

                  return (
                    <div className="space-y-2">
                      <iframe
                        srcDoc={docHtml}
                        className="w-full h-[600px] border rounded-md bg-background"
                        title="Email Content"
                      />
                      <details className="text-[10px] bg-muted rounded border max-h-[200px] overflow-auto">
                        <summary className="cursor-pointer px-2 py-1 font-semibold">
                          View raw source
                        </summary>
                        <pre className="whitespace-pre-wrap font-mono px-2 pb-2">
                          {raw.slice(0, 4000)}
                        </pre>
                      </details>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}
      
      <div className="flex gap-2 p-2">
        {/* LEFT SIDE - Load Details + Stats + Map */}
        <div className="flex-1 space-y-2">
          <div className="flex gap-2">
            {/* Load Details Card */}
            <div className="flex-1">
              <Card className="border rounded-md overflow-hidden h-full pb-0">
                {/* HEADER */}
                <div className="flex items-center border-b p-2 bg-slate-50">
                  <div className="flex items-center gap-2 flex-1">
                    <div className="flex h-10 w-14 flex-col items-center justify-center rounded-lg bg-blue-100 border border-blue-300">
                      <Truck className="h-4 w-4 text-blue-600" />
                      <div className="text-[10px] font-semibold text-blue-600">{vehicle?.vehicle_number || "N/A"}</div>
                      <div className="text-[10px] font-semibold text-red-500">Empty</div>
                    </div>
                    <div className="text-[11px] space-y-0.5">
                      <div>
                        <span className="text-gray-500">D1</span> <span className="font-medium">{driver1Name || "No Driver Assigned"}</span>{" "}
                        <span className="text-gray-400">Note:</span>
                      </div>
                      <div>
                        <span className="text-gray-500">D2</span> <span className="font-medium">{driver2Name || "No Driver Assigned"}</span>{" "}
                        <span className="text-gray-400">Note:</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div>
                      <div className="text-[13px] font-bold mb-0.5">Match ID: {match?.id?.substring(0, 8) || "N/A"}</div>
                      <button className="text-[10px] text-blue-500 hover:underline">View Match History</button>
                    </div>
                  </div>
                </div>

                {/* CARRIER ROWS */}
                <div className="border-b">
                  <div className="grid grid-cols-[2.2fr,1.4fr,1.2fr,1.5fr,1fr,1fr] px-2 py-1.5 text-[11px]">
                    <div className="bg-red-100 -mx-2 px-2 py-1 font-semibold flex items-center">
                      {carrierName || "No Carrier"}
                    </div>
                    <div className="text-gray-400">
                      <div>    Pickup Time</div>
                      <div>    Delivery Time</div>
                    </div>
                    <div className="text-gray-400">
                      <div>   Origin</div>
                      <div>   Destination</div>
                    </div>
                    <div className="text-gray-400">
                      <div>    Empty Drive</div>
                      <div>    Loaded Drive</div>
                    </div>
                    <div className="text-gray-400">
                      <div>Load Type</div>
                      <div>Weight</div>
                    </div>
                    <div className="text-gray-400">
                      <div>Pieces</div>
                      <div>Dimensions</div>
                    </div>
                  </div>
                </div>

                <div className="border-b">
                  <div className="grid grid-cols-[2.2fr,1.4fr,1.2fr,1.5fr,1fr,1fr] px-2 py-1.5 text-[11px]">
                    <div className="bg-yellow-100 -mx-2 px-2 py-1 font-semibold flex items-center">
                      {brokerName}
                    </div>
                    <div>
                      <div>   11/30/25 Sun 17:00 EST</div>
                      <div>   12/01/25 Mon 09:00 EST</div>
                    </div>
                    <div>
                      <div><span className="text-orange-500 font-bold">P</span> {originCity}, {originState}</div>
                      <div><span className="text-blue-500 font-bold">D</span> {destCity}, {destState}</div>
                    </div>
                    <div className="text-green-600">
                      <div><span className="inline-block w-3 text-green-600">+</span>{emptyDriveDistance !== undefined && emptyDriveDistance !== null ? `${Math.round(emptyDriveDistance)}mi` : (data.empty_miles !== null && data.empty_miles !== undefined ? `${Math.round(data.empty_miles)}mi` : '—')}</div>
                      <div><span className="inline-block w-3 text-green-600">+</span>{data.loaded_miles ? `${Math.round(data.loaded_miles)}mi` : '—'}</div>
                    </div>
                    <div>
                      <div>{data.vehicle_type || 'SPRINTER'}</div>
                      <div>{data.weight || '0'}</div>
                    </div>
                    <div>
                      <div>{data?.pieces || '0'}</div>
                      <div>{data?.dimensions || 'N/A'}</div>
                    </div>
                  </div>
                </div>

                {/* ORIGINAL POST */}
                <div className="grid grid-cols-[1fr,4fr,1.3fr] px-3 py-1 text-[11px] items-center">
                  <div className="font-semibold text-blue-600">Original Post</div>
                  <div className="text-red-600 text-[10px]">
                    {data.notes ? `Note: ${data.notes}` : 'Note:'}
                  </div>
                  <div className="text-right space-x-3">
                    <span className="font-semibold">Posted Rate:</span>{' '}
                    <span className="text-red-600 font-semibold">
                      {data.rate ? `$${data.rate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'NONE'}
                    </span>
                  </div>
                </div>

                {/* VEHICLE */}
                <div className="grid grid-cols-[1fr,4fr,1.3fr] px-3 py-1 text-[11px] items-center">
                  <div className="font-semibold text-blue-600">Vehicle</div>
                  <div className="text-gray-500">{vehicle?.notes ? `Note: ${vehicle.notes}` : 'Note:'}</div>
                  <div className="flex items-center justify-end gap-2 leading-tight">
                    <span>
                      <span className="font-semibold">Vehicle Size:</span> {data.vehicle_type || 'N/A'}
                    </span>
                    <Button 
                      className="bg-orange-500 hover:bg-orange-600 h-6 px-2 text-[10px] font-semibold"
                      onClick={() => setShowOriginalEmail(true)}
                    >
                      Original Email
                    </Button>
                  </div>
                </div>
              </Card>
            </div>

            {/* Stats & Actions Card */}
            <div className="w-[360px]">
              <Card className="p-3 h-full flex flex-col justify-between shadow-md">
                <div>
                  {/* Average/Bid/Booked Row */}
                  <div className="grid grid-cols-3 gap-2 text-center mb-3 pb-3 border-b">
                    <div>
                      <div className="text-[11px] text-muted-foreground mb-1">Average</div>
                      <div className="text-sm font-semibold">—</div>
                    </div>
                    <div className="bg-blue-50 -mx-1 px-2 py-1 rounded">
                      <div className="text-[11px] text-muted-foreground mb-1">Bid</div>
                      <div className="text-lg font-bold text-blue-600">${data.rate ? data.rate.toLocaleString() : '1,282'}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-muted-foreground mb-1">Booked</div>
                      <div className="text-sm font-semibold">N/A</div>
                    </div>
                  </div>

                  {/* [$/mi] Label */}
                  <div className="text-xs text-muted-foreground text-right mb-2">[$/mi]</div>

                  {/* Miles and Costs */}
                  <div className="space-y-2 mb-3 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">Loaded Miles</span>
                      <div className="flex gap-4 items-center">
                        <span className="font-semibold">{data.loaded_miles || 375}</span>
                        <span className="text-blue-600 font-semibold w-14 text-right">$3.42</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-medium">Total Miles</span>
                      <div className="flex gap-4 items-center">
                        <span className="font-semibold">{((data.loaded_miles || 375) + (emptyDriveDistance || 0))}</span>
                        <span className="text-blue-600 font-semibold w-14 text-right">$1.64</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center pb-2 border-b">
                      <span className="font-medium">Fuel, Tolls and Driver</span>
                      <div className="flex gap-4 items-center">
                        <span className="font-semibold">$0.00</span>
                        <span className="text-blue-600 font-semibold w-14 text-right">$0.00</span>
                      </div>
                    </div>
                  </div>

                  {/* Bid Input and Button */}
                  <div className="flex items-center justify-between gap-3 mb-3 pb-3 border-b">
                    <div className="flex items-center gap-1 bg-blue-500 text-white rounded-full h-10 px-4 min-w-[100px]">
                      <span className="text-lg font-bold">$</span>
                      <input
                        type="text"
                        value={bidAmount}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9]/g, '');
                          setBidAmount(val);
                        }}
                        placeholder={data.rate?.toString() || "3000"}
                        className="bg-transparent border-none outline-none text-xl font-bold text-white w-20 placeholder:text-blue-200"
                      />
                    </div>
                    <Button 
                      onClick={() => {
                        if (bidAmount) {
                          setShowBidCard(true);
                        }
                      }}
                      className="bg-green-600 hover:bg-green-700 h-9 px-6 text-sm font-semibold shadow-sm"
                    >
                      Set Bid
                    </Button>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-1.5">
                  <Button variant="destructive" size="sm" className="h-8 text-xs flex-1 whitespace-nowrap font-medium">
                    Skip
                  </Button>
                  <Button size="sm" className="h-8 text-xs flex-1 bg-blue-500 hover:bg-blue-600 whitespace-nowrap font-medium">
                    Undecided
                  </Button>
                  <Button size="sm" className="h-8 text-xs flex-1 bg-blue-500 hover:bg-blue-600 whitespace-nowrap font-medium">
                    Mark Unreviewed
                  </Button>
                  <Button size="sm" className="h-8 text-xs flex-1 bg-blue-500 hover:bg-blue-600 whitespace-nowrap font-medium">
                    Wait
                  </Button>
                </div>
              </Card>
            </div>
          </div>

          {/* MAP - Full Width Below */}
          <div className="relative">
            <Card className="h-[400px] overflow-hidden rounded-md">
              <LoadRouteMap 
                stops={[
                  {
                    location_city: originCity,
                    location_state: originState,
                    location_address: `${originCity}, ${originState}`,
                    stop_type: "pickup"
                  },
                  {
                    location_city: destCity,
                    location_state: destState,
                    location_address: `${destCity}, ${destState}`,
                    stop_type: "delivery"
                  }
                ]} 
              />
            </Card>
            
            {/* Floating Bid Card - Appears on right side over map */}
            {showBidCard && !showOriginalEmail && (
              <div className="absolute right-0 top-0 w-[360px] z-40 animate-in slide-in-from-right duration-300">
                <Card className="p-3 shadow-2xl border-2 border-green-500">
                  <div className="flex items-center justify-between mb-3 pb-3 border-b">
                    <h3 className="text-sm font-semibold">Bid Set Successfully</h3>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => setShowBidCard(false)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  {/* Average/Bid/Booked Row */}
                  <div className="grid grid-cols-3 gap-2 text-center mb-3 pb-3 border-b">
                    <div>
                      <div className="text-[11px] text-muted-foreground mb-1">Average</div>
                      <div className="text-sm font-semibold">—</div>
                    </div>
                    <div className="bg-green-50 -mx-1 px-2 py-1 rounded border border-green-200">
                      <div className="text-[11px] text-muted-foreground mb-1">Bid</div>
                      <div className="text-lg font-bold text-green-600">${bidAmount ? parseInt(bidAmount).toLocaleString() : '3,000'}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-muted-foreground mb-1">Booked</div>
                      <div className="text-sm font-semibold">N/A</div>
                    </div>
                  </div>

                  {/* [$/mi] Label */}
                  <div className="text-xs text-muted-foreground text-right mb-2">[$/mi]</div>

                  {/* Miles and Costs */}
                  <div className="space-y-2 mb-3 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">Loaded Miles</span>
                      <div className="flex gap-4 items-center">
                        <span className="font-semibold">{data.loaded_miles || 862}</span>
                        <span className="text-blue-600 font-semibold w-14 text-right">$3.48</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-medium">Total Miles</span>
                      <div className="flex gap-4 items-center">
                        <span className="font-semibold">{((data.loaded_miles || 862) + (emptyDriveDistance || 252))}</span>
                        <span className="text-blue-600 font-semibold w-14 text-right">$2.69</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center pb-2 border-b">
                      <span className="font-medium">Fuel, Tolls and Driver</span>
                      <div className="flex gap-4 items-center">
                        <span className="font-semibold">$0.00</span>
                        <span className="text-blue-600 font-semibold w-14 text-right">$0.00</span>
                      </div>
                    </div>
                  </div>

                  {/* Bid Display */}
                  <div className="flex items-center justify-center mb-3 pb-3 border-b">
                    <div className="flex items-center gap-1 bg-green-600 text-white rounded-full h-12 px-6">
                      <span className="text-2xl font-bold">$</span>
                      <span className="text-3xl font-bold">{bidAmount || '3000'}</span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="destructive" size="sm" className="h-9 text-xs font-medium">
                      Skip
                    </Button>
                    <Button size="sm" className="h-9 text-xs bg-blue-500 hover:bg-blue-600 font-medium">
                      Undecided
                    </Button>
                    <Button size="sm" className="h-9 text-xs bg-blue-500 hover:bg-blue-600 font-medium col-span-2">
                      Mark Unreviewed
                    </Button>
                    <Button size="sm" className="h-9 text-xs bg-blue-500 hover:bg-blue-600 font-medium col-span-2">
                      Wait
                    </Button>
                  </div>
                </Card>
              </div>
            )}
          </div>
        </div>

        {/* FAR RIGHT COLUMN - Quote Rates */}
        <div className="w-[200px]">
          <Card className="p-2">
            <div className="flex justify-between text-[10px] text-gray-500 pb-1.5 border-b mb-1.5">
              <span>Quote Rate</span>
              <span>$/mi</span>
            </div>
            <div className="space-y-0.5 text-[10px] max-h-[700px] overflow-auto">
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
                { rate: "$782.00", perMile: "$1.00" }
              ].map((row, idx) => (
                <div 
                  key={idx} 
                  className={`flex justify-between px-1.5 py-0.5 rounded ${row.rate === "$1,282.00" ? "bg-blue-100 font-semibold" : "hover:bg-slate-50"}`}
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
  );
};

export default LoadEmailDetail;
