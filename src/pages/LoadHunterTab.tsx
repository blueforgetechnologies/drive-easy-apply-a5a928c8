import { useEffect, useState } from "react";
import React from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { RefreshCw, Settings, X, CheckCircle, MapPin, Wrench, ArrowLeft, Gauge, Truck } from "lucide-react";
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

interface Vehicle {
  id: string;
  vehicle_number: string | null;
  carrier: string | null;
  asset_type: string | null;
  driver_1_id: string | null;
  driver_2_id: string | null;
  status: string;
  formatted_address: string | null;
  last_location: string | null;
  odometer: number | null;
  next_service_date: string | null;
  notes: string | null;
}

interface Driver {
  id: string;
  personal_info: any;
}

interface Load {
  id: string;
  truck_driver_carrier: string;
  customer: string;
  received: string;
  expires: string;
  pickup_time: string;
  pickup_date: string;
  delivery_time: string;
  delivery_date: string;
  origin_city: string;
  origin_state: string;
  destination_city: string;
  destination_state: string;
  empty_drive_miles: number;
  loaded_drive_miles: number;
  vehicle_type: string;
  weight: string;
  pieces: number;
  dimensions: string;
  avail_ft: string;
  source: string;
}

export default function LoadHunterTab() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loads, setLoads] = useState<Load[]>([]);
  const [loadEmails, setLoadEmails] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [emailConfigOpen, setEmailConfigOpen] = useState(false);
  const [emailAddress, setEmailAddress] = useState("P.D@talbilogistics.com");
  const [emailProvider, setEmailProvider] = useState("gmail");
  const [refreshing, setRefreshing] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [mapboxToken, setMapboxToken] = useState<string>("");
  const mapContainer = React.useRef<HTMLDivElement>(null);
  const map = React.useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    loadVehicles();
    loadDrivers();
    loadLoadEmails();
    fetchMapboxToken();

    // Subscribe to real-time updates for load_emails
    const channel = supabase
      .channel('load-emails-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'load_emails'
        },
        (payload) => {
          console.log('New load email received:', payload);
          // Add the new email to the list
          setLoadEmails((current) => [payload.new, ...current]);
          toast.success('New load email received!');
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchMapboxToken = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('get-mapbox-token');
      if (error) throw error;
      if (data?.token) {
        setMapboxToken(data.token);
      }
    } catch (error) {
      console.error('Failed to fetch Mapbox token:', error);
      toast.error('Failed to load map token');
    }
  };

  // Initialize map when vehicle is selected
  useEffect(() => {
    if (!selectedVehicle || !mapContainer.current || !mapboxToken) return;

    // Clean up existing map
    if (map.current) {
      map.current.remove();
      map.current = null;
    }

    // Get coordinates from last_location
    if (!selectedVehicle.last_location) return;

    const [lat, lng] = selectedVehicle.last_location.split(',').map(parseFloat);
    if (isNaN(lat) || isNaN(lng)) return;

    // Initialize new map
    mapboxgl.accessToken = mapboxToken;
    
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [lng, lat],
      zoom: 5,
    });

    // Create truck icon marker
    const el = document.createElement('div');
    el.className = 'truck-marker';
    el.style.width = '40px';
    el.style.height = '40px';
    el.style.backgroundColor = '#3b82f6';
    el.style.borderRadius = '50%';
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    el.style.color = 'white';
    el.style.fontSize = '20px';
    el.innerHTML = '🚛';

    // Add marker
    new mapboxgl.Marker({ element: el })
      .setLngLat([lng, lat])
      .addTo(map.current);

    // Add navigation controls
    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [selectedVehicle, mapboxToken]);

  const loadVehicles = async () => {
    try {
      const { data, error } = await supabase
        .from("vehicles")
        .select("*")
        .in("status", ["active", "available"])
        .order("vehicle_number", { ascending: true });

      if (error) throw error;
      setVehicles(data || []);
    } catch (error: any) {
      console.error("Failed to load vehicles", error);
      toast.error("Failed to load vehicles");
    } finally {
      setLoading(false);
    }
  };

  const loadDrivers = async () => {
    try {
      const { data, error } = await supabase
        .from("applications")
        .select("id, personal_info")
        .eq("driver_status", "active");

      if (error) throw error;
      setDrivers(data || []);
    } catch (error: any) {
      console.error("Failed to load drivers", error);
    }
  };

  const loadLoadEmails = async () => {
    try {
      const { data, error } = await supabase
        .from("load_emails")
        .select("*")
        .order("received_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      setLoadEmails(data || []);
    } catch (error: any) {
      console.error("Failed to load emails", error);
    }
  };

  const getDriverName = (driverId: string | null) => {
    if (!driverId) return "";
    const driver = drivers.find(d => d.id === driverId);
    if (!driver?.personal_info) return "";
    const { firstName, lastName } = driver.personal_info;
    return `${firstName || ""} ${lastName || ""}`.trim();
  };

  const handleRefreshLoads = async () => {
    setRefreshing(true);
    try {
      // Call the fetch-gmail-loads function to pull emails directly
      const { data, error } = await supabase.functions.invoke('fetch-gmail-loads');

      if (error) {
        console.error('fetch-gmail-loads error:', error);
        throw new Error(error.message || 'Failed to fetch Gmail emails');
      }

      console.log('Fetch response:', data);

      if (data?.count > 0) {
        toast.success(`Successfully loaded ${data.count} new load emails`);
        // Reload the load emails table
        await loadLoadEmails();
      } else {
        toast.info('No new load emails found');
      }
    } catch (error: any) {
      console.error('Gmail fetch error:', error);
      toast.error('Failed to fetch Gmail emails');
    } finally {
      setRefreshing(false);
    }
  };

  const handleSaveEmailConfig = () => {
    if (!emailAddress) {
      toast.error("Please enter an email address");
      return;
    }
    toast.success("Email configuration saved");
    setEmailConfigOpen(false);
  };

  const handleDismissEmail = async (emailId: string) => {
    try {
      const { error } = await supabase
        .from('load_emails')
        .update({ status: 'dismissed' })
        .eq('id', emailId);

      if (error) throw error;

      // Remove from UI
      setLoadEmails(loadEmails.filter(email => email.id !== emailId));
      toast.success('Load email dismissed');
    } catch (error) {
      console.error('Error dismissing email:', error);
      toast.error('Failed to dismiss email');
    }
  };

  const handleReviewEmail = async (emailId: string) => {
    try {
      const { error } = await supabase
        .from('load_emails')
        .update({ status: 'reviewed' })
        .eq('id', emailId);

      if (error) throw error;

      // Remove from UI
      setLoadEmails(loadEmails.filter(email => email.id !== emailId));
      toast.success('Load email marked as reviewed');
    } catch (error) {
      console.error('Error reviewing email:', error);
      toast.error('Failed to mark email as reviewed');
    }
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-3">
      {/* Left Sidebar - Vehicles */}
      <div className="w-56 flex-shrink-0 space-y-1.5 overflow-y-auto border-r pr-3">
        <div className="sticky top-0 bg-background pb-1.5">
          <h3 className="text-xs font-semibold text-muted-foreground mb-1">MY TRUCKS</h3>
        </div>
        {loading ? (
          <div className="text-xs text-muted-foreground">Loading...</div>
        ) : vehicles.length === 0 ? (
          <div className="text-xs text-muted-foreground">No active trucks</div>
        ) : (
          vehicles.map((vehicle) => (
            <Card 
              key={vehicle.id} 
              className="p-2 hover:bg-muted/50 transition-colors cursor-pointer"
              onClick={() => setSelectedVehicle(vehicle)}
            >
              <div className="space-y-0.5">
                <div className="flex items-start justify-between gap-1.5">
                  <div className="font-semibold text-xs leading-tight">
                    {vehicle.vehicle_number || "N/A"} - {getDriverName(vehicle.driver_1_id) || "Unassigned"}
                  </div>
                  <div className="flex gap-0.5 flex-shrink-0">
                    <Badge variant="destructive" className="h-4 w-4 p-0 flex items-center justify-center text-[10px]">
                      0
                    </Badge>
                    <Badge variant="secondary" className="h-4 w-4 p-0 flex items-center justify-center text-[10px] bg-orange-500 text-white">
                      0
                    </Badge>
                    <Badge variant="default" className="h-4 w-4 p-0 flex items-center justify-center text-[10px]">
                      0
                    </Badge>
                  </div>
                </div>
                <div className="text-[10px] text-muted-foreground leading-tight">
                  {vehicle.asset_type || "Asset Type"}
                </div>
                <div className="text-[10px] text-muted-foreground truncate leading-tight">
                  {vehicle.carrier || "No Carrier"}
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Main Content - Load Board or Vehicle Details */}
      <div className="flex-1 space-y-2 overflow-hidden flex flex-col">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            {selectedVehicle && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedVehicle(null)}
                className="gap-1.5"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            )}
            <div>
              <h2 className="text-xl font-bold">
                {selectedVehicle ? `Vehicle ${selectedVehicle.vehicle_number}` : 'Load Hunter'}
              </h2>
              <p className="text-xs text-muted-foreground">
                {selectedVehicle ? 'Vehicle details and location' : 'Available loads from email feed'}
              </p>
            </div>
          </div>
          {!selectedVehicle && (
            <div className="flex gap-1.5">
            <Dialog open={emailConfigOpen} onOpenChange={setEmailConfigOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs px-2.5">
                  <Settings className="h-3.5 w-3.5" />
                  Email Config
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Configure Email Integration</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address to Monitor</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="loads@yourcompany.com"
                      value={emailAddress}
                      onChange={(e) => setEmailAddress(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Enter the email address where you receive load offers
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="provider">Email Provider</Label>
                    <select
                      id="provider"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={emailProvider}
                      onChange={(e) => setEmailProvider(e.target.value)}
                    >
                      <option value="gmail">Gmail</option>
                      <option value="outlook">Outlook</option>
                      <option value="imap">Other (IMAP)</option>
                    </select>
                  </div>
                  <Button onClick={handleSaveEmailConfig} className="w-full">
                    Save Configuration
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            <Button
              variant="default"
              size="sm"
              className="gap-1.5 h-8 text-xs px-2.5"
              onClick={handleRefreshLoads}
              disabled={refreshing}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Refreshing..." : "Refresh Loads"}
            </Button>
            </div>
          )}
        </div>

        {/* Conditional Content: Load Board or Vehicle Details */}
        {selectedVehicle ? (
          /* Vehicle Details View */
          <div className="flex-1 overflow-hidden flex gap-3">
            {/* Left Panel - Vehicle Info */}
            <div className="w-[480px] flex-shrink-0 space-y-3 overflow-y-auto p-4 bg-muted/20 rounded-lg">
              {/* Tabs */}
              <Tabs defaultValue="empty" className="w-full">
                <TabsList className="w-full grid grid-cols-4 h-9">
                  <TabsTrigger value="empty" className="text-xs py-1.5">Empty</TabsTrigger>
                  <TabsTrigger value="delivery" className="text-xs py-1.5">Delivery Date & Time</TabsTrigger>
                  <TabsTrigger value="destination" className="text-xs py-1.5">Destination</TabsTrigger>
                  <TabsTrigger value="remaining" className="text-xs py-1.5">Remaining</TabsTrigger>
                </TabsList>
              </Tabs>

              {/* Location & Odometer - Compact */}
              <div className="space-y-1.5 py-2">
                <div className="text-xs text-muted-foreground">Location</div>
                <div className="text-sm font-medium">
                  {selectedVehicle.formatted_address || selectedVehicle.last_location || "Location not available"}
                </div>
                <div className="flex items-center gap-2 text-sm pt-1">
                  <Gauge className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Odometer</span>
                  <span className="font-semibold">
                    {selectedVehicle.odometer ? selectedVehicle.odometer.toLocaleString() : "N/A"}
                  </span>
                </div>
              </div>

              {/* Next Maintenance Due - Compact with border */}
              <div className="flex items-center justify-between border-2 border-border rounded-lg p-3">
                <div className="text-sm font-medium text-muted-foreground">Next Maintenance Due</div>
                <div className="text-right">
                  <div className="text-2xl font-bold">N/A</div>
                  <div className="text-xs text-muted-foreground">
                    {selectedVehicle.next_service_date || "N/A"}
                  </div>
                </div>
              </div>

              <Button variant="link" className="text-xs text-primary p-0 h-auto">
                View Vehicle Details
              </Button>

              {/* Driver Assignments - Compact */}
              <div className="space-y-2 py-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">D1</span>
                    <span className="text-muted-foreground">
                      {getDriverName(selectedVehicle.driver_1_id) || "No Driver Assigned"}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">Note: N/A</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">D2</span>
                    <span className="text-muted-foreground">
                      {getDriverName(selectedVehicle.driver_2_id) || "No Driver Assigned"}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">Note: N/A</span>
                </div>
              </div>

              {/* Vehicle Note - Compact */}
              <div className="space-y-2 py-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Vehicle Note:</div>
                  <Wrench className="h-4 w-4 text-primary" />
                </div>
                <div className="text-sm text-muted-foreground">
                  {selectedVehicle.notes || "No notes available"}
                </div>
              </div>

              {/* Action Buttons - Compact */}
              <div className="flex gap-2 pt-2">
                <Button size="sm" className="flex-1 h-9 text-xs">
                  Create New Hunt
                </Button>
                <Button size="sm" variant="outline" className="flex-1 h-9 text-xs">
                  Set Driver to Time-Off mode
                </Button>
              </div>
            </div>

            {/* Right Panel - Map */}
            <div className="flex-1 rounded-lg border overflow-hidden relative">
              {selectedVehicle.last_location ? (
                <div ref={mapContainer} className="w-full h-full" />
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
        ) : (
          /* Loads Table */
          <div className="flex-1 overflow-hidden flex flex-col">
          <Card className="flex-1 flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between py-2 px-3">
              <div>
                <CardTitle className="text-sm">Unreviewed Load Emails</CardTitle>
                <p className="text-[10px] text-muted-foreground">New load offers detected from your monitored inbox</p>
              </div>
              <Badge variant="secondary" className="gap-1 text-[10px] h-5 px-1.5">
                <CheckCircle className="h-2.5 w-2.5 text-green-500" />
                {loadEmails.length} new
              </Badge>
            </CardHeader>
            <CardContent className="p-0 flex-1 flex flex-col min-h-0">
              <div className="border-t">
                {loadEmails.length === 0 ? (
                  <div className="p-4 text-center text-xs text-muted-foreground">
                    No load emails found yet. Click "Refresh Loads" to start monitoring your inbox.
                  </div>
                ) : (
                  <div className="overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="h-8">
                          <TableHead className="w-[160px] py-1 text-[10px] leading-tight">Truck - Drivers<br/>Carrier</TableHead>
                          <TableHead className="w-[140px] py-1 text-[10px] leading-tight">Customer</TableHead>
                          <TableHead className="w-[100px] py-1 text-[10px] leading-tight">Received<br/>Expires</TableHead>
                          <TableHead className="w-[130px] py-1 text-[10px] leading-tight">Pickup Time<br/>Delivery Time</TableHead>
                          <TableHead className="w-[150px] py-1 text-[10px] leading-tight">Origin<br/>Destination</TableHead>
                          <TableHead className="w-[110px] py-1 text-[10px] leading-tight">Empty Drive<br/>Loaded Drive</TableHead>
                          <TableHead className="w-[110px] py-1 text-[10px] leading-tight">Vehicle Type<br/>Weight</TableHead>
                          <TableHead className="w-[100px] py-1 text-[10px] leading-tight">Pieces<br/>Dimensions</TableHead>
                          <TableHead className="w-[70px] py-1 text-[10px]">Avail ft</TableHead>
                          <TableHead className="w-[80px] py-1 text-[10px]">Source</TableHead>
                          <TableHead className="w-[90px] py-1 text-[10px]">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {loadEmails.map((email) => {
                          const data = email.parsed_data || {};
                          const receivedDate = new Date(email.received_at);
                          const now = new Date();
                          const diffMs = now.getTime() - receivedDate.getTime();
                          const diffMins = Math.floor(diffMs / 60000);
                          const diffHours = Math.floor(diffMins / 60);
                          const diffDays = Math.floor(diffHours / 24);
                          
                          let receivedAgo = '';
                          if (diffDays > 0) receivedAgo = `${diffDays}d ${diffHours % 24}h ago`;
                          else if (diffHours > 0) receivedAgo = `${diffHours}h ${diffMins % 60}m ago`;
                          else receivedAgo = `${diffMins}m ago`;

                          return (
                            <TableRow key={email.id} className="h-12">
                              <TableCell className="py-1">
                                <div className="text-[11px] font-medium leading-tight">Available</div>
                                <div className="text-[10px] text-muted-foreground truncate leading-tight">
                                  {email.from_name || email.from_email.split('@')[0]}
                                </div>
                              </TableCell>
                              <TableCell className="py-1">
                                <Badge variant="outline" className="mb-0.5 h-4 px-1 text-[10px]">
                                  {email.status === 'new' ? '🟡' : '🟢'}
                                </Badge>
                                <div className="text-[11px] font-medium truncate leading-tight">
                                  {data.customer || email.from_name || 'Unknown'}
                                </div>
                              </TableCell>
                              <TableCell className="py-1">
                                <div className="text-[11px] leading-tight">{receivedAgo}</div>
                                <div className="text-[10px] text-muted-foreground leading-tight">
                                  {data.expires_time || '—'}
                                </div>
                              </TableCell>
                              <TableCell className="py-1">
                                <div className="text-[11px] leading-tight">
                                  {data.pickup_date || '—'} {data.pickup_time || ''}
                                </div>
                                <div className="text-[11px] leading-tight">
                                  {data.delivery_date || '—'} {data.delivery_time || ''}
                                </div>
                              </TableCell>
                              <TableCell className="py-1">
                                <div className="text-[11px] font-medium leading-tight">
                                  {data.origin_city || '—'}, {data.origin_state || '—'}
                                </div>
                                <div className="text-[11px] leading-tight">
                                  {data.destination_city || '—'}, {data.destination_state || '—'}
                                </div>
                              </TableCell>
                              <TableCell className="py-1">
                                <div className="text-[11px] leading-tight">
                                  {data.empty_miles ? `${data.empty_miles} mi` : '—'}
                                </div>
                                <div className="text-[11px] leading-tight">
                                  {data.loaded_miles ? `${data.loaded_miles} mi` : '—'}
                                </div>
                              </TableCell>
                              <TableCell className="py-1">
                                <div className="text-[11px] leading-tight">{data.vehicle_type || '—'}</div>
                                <div className="text-[11px] leading-tight">{data.weight ? `${data.weight} lbs` : '—'}</div>
                              </TableCell>
                              <TableCell className="py-1">
                                <div className="text-[11px] leading-tight">{data.pieces || '—'}</div>
                                <div className="text-[10px] text-muted-foreground leading-tight">{data.dimensions || 'Not Specified'}</div>
                              </TableCell>
                              <TableCell className="py-1">
                                <div className="text-[11px] leading-tight">{data.avail_ft ? `${data.avail_ft} ft` : '—'}</div>
                              </TableCell>
                              <TableCell className="py-1">
                                <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                                  {email.from_email.includes('@') ? email.from_email.split('@')[1].split('.')[0] : 'Email'}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right py-1">
                                <div className="flex justify-end gap-0.5">
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-6 w-6 p-0 text-red-500 hover:text-red-700" 
                                    aria-label="Dismiss load"
                                    onClick={() => handleDismissEmail(email.id)}
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-6 w-6 p-0 text-green-500 hover:text-green-700" 
                                    aria-label="Review load"
                                    onClick={() => handleReviewEmail(email.id)}
                                  >
                                    <CheckCircle className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
          </div>
        )}
      </div>
    </div>
  );
}
