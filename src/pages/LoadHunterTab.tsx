import { useEffect, useState } from "react";
import React from "react";
import { supabase } from "@/integrations/supabase/client";
import LoadEmailDetail from "@/components/LoadEmailDetail";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { RefreshCw, Settings, X, CheckCircle, MapPin, Wrench, ArrowLeft, Gauge, Truck, MapPinned, Home, Bell, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
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
  oil_change_remaining: number | null;
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

interface HuntPlan {
  id: string;
  vehicleId: string;
  planName: string;
  vehicleSize: string;
  zipCode: string;
  availableFeet: string;
  partial: boolean;
  pickupRadius: string;
  mileLimit: string;
  loadCapacity: string;
  availableDate: string;
  availableTime: string;
  destinationZip: string;
  destinationRadius: string;
  notes: string;
  createdBy: string;
  createdAt: Date;
  lastModified: Date;
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
  const [selectedEmailForDetail, setSelectedEmailForDetail] = useState<any | null>(null);
  const [mapboxToken, setMapboxToken] = useState<string>("");
  const [createHuntOpen, setCreateHuntOpen] = useState(false);
  const [huntPlans, setHuntPlans] = useState<HuntPlan[]>([]);
  const [huntFormData, setHuntFormData] = useState({
    planName: "",
    vehicleSize: "large-straight",
    zipCode: "",
    availableFeet: "",
    partial: false,
    pickupRadius: "100",
    mileLimit: "",
    loadCapacity: "9000",
    availableDate: new Date().toISOString().split('T')[0],
    availableTime: "00:00",
    destinationZip: "",
    destinationRadius: "",
    notes: "",
  });
  const [editingNotes, setEditingNotes] = useState(false);
  const [vehicleNotes, setVehicleNotes] = useState("");
  const [activeMode, setActiveMode] = useState<'admin' | 'dispatch'>('admin');
  const [activeFilter, setActiveFilter] = useState<string>('unreviewed');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 17;
  const mapContainer = React.useRef<HTMLDivElement>(null);
  const map = React.useRef<mapboxgl.Map | null>(null);

  // Filter emails based on active filter
  const filteredEmails = loadEmails.filter(email => {
    if (activeFilter === 'unreviewed') return email.status === 'new';
    if (activeFilter === 'skipped') return email.status === 'skipped';
    if (activeFilter === 'all') return true;
    return true; // Default for other filters
  });

  // Count emails by status
  const unreviewedCount = loadEmails.filter(e => e.status === 'new').length;
  const skippedCount = loadEmails.filter(e => e.status === 'skipped').length;

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

  const handleSkipEmail = async (emailId: string) => {
    try {
      const { error } = await supabase
        .from('load_emails')
        .update({ status: 'skipped' })
        .eq('id', emailId);

      if (error) throw error;

      // Reload emails to update counts and filtered view
      await loadLoadEmails();
      toast.success('Load skipped');
    } catch (error) {
      console.error('Error skipping email:', error);
      toast.error('Failed to skip email');
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

  const handleSaveHuntPlan = () => {
    if (!selectedVehicle) {
      toast.error("No vehicle selected");
      return;
    }

    const newHuntPlan: HuntPlan = {
      id: Math.random().toString(36).substr(2, 9),
      vehicleId: selectedVehicle.id,
      ...huntFormData,
      createdBy: "Sofiane Talbi",
      createdAt: new Date(),
      lastModified: new Date(),
    };
    
    setHuntPlans([...huntPlans, newHuntPlan]);
    setCreateHuntOpen(false);
    toast.success("Hunt plan created successfully");
    
    // Reset form
    setHuntFormData({
      planName: "",
      vehicleSize: "large-straight",
      zipCode: "",
      availableFeet: "",
      partial: false,
      pickupRadius: "100",
      mileLimit: "",
      loadCapacity: "9000",
      availableDate: new Date().toISOString().split('T')[0],
      availableTime: "00:00",
      destinationZip: "",
      destinationRadius: "",
      notes: "",
    });
  };

  const handleDeleteHuntPlan = (id: string) => {
    setHuntPlans(huntPlans.filter(plan => plan.id !== id));
    toast.success("Hunt plan deleted");
  };

  const formatDateTime = (date: string, time: string) => {
    const dateObj = new Date(date + 'T' + time);
    return dateObj.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    }) + ' ' + time + ' EST';
  };

  const getTimeAgo = (date: Date) => {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s ago`;
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m ago`;
  };

  const handleSaveVehicleNotes = async () => {
    if (!selectedVehicle) return;
    
    try {
      const { error } = await supabase
        .from("vehicles")
        .update({ notes: vehicleNotes })
        .eq("id", selectedVehicle.id);

      if (error) throw error;

      toast.success("Vehicle notes saved successfully");
      setEditingNotes(false);
      
      // Update the selected vehicle's notes
      setSelectedVehicle({ ...selectedVehicle, notes: vehicleNotes });
      
      // Refresh vehicles list to show updated notes
      loadVehicles();
    } catch (error: any) {
      toast.error("Failed to save notes: " + error.message);
    }
  };

  // Update vehicle notes when a new vehicle is selected
  useEffect(() => {
    if (selectedVehicle) {
      setVehicleNotes(selectedVehicle.notes || "");
      setEditingNotes(false);
    }
  }, [selectedVehicle?.id]);

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Filter Bar - Full Width - Always Visible */}
      <div className="flex items-center gap-2 py-2 px-3 bg-background border-y overflow-x-auto flex-shrink-0 relative z-10">
          {/* Mode Buttons */}
          <div className="flex items-center gap-1 pr-3 border-r flex-shrink-0">
            <span className="text-xs font-semibold text-muted-foreground mr-1">MODE:</span>
            <Button 
              size="sm" 
              variant={activeMode === 'admin' ? 'default' : 'outline'}
              className="h-7 px-3 text-xs"
              onClick={() => setActiveMode('admin')}
            >
              Admin
            </Button>
            <Button 
              size="sm" 
              variant={activeMode === 'dispatch' ? 'default' : 'outline'}
              className="h-7 px-3 text-xs"
              onClick={() => setActiveMode('dispatch')}
            >
              Dispatch
            </Button>
            <Button 
              size="sm" 
              variant="default"
              className="h-7 px-3 text-xs bg-green-600 hover:bg-green-700"
            >
              Add Vehicle
            </Button>
          </div>

          {/* Filter Buttons */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Button 
              size="sm" 
              variant={activeFilter === 'unreviewed' ? 'default' : 'outline'}
              className="h-7 px-2.5 text-xs gap-1.5 bg-blue-600 hover:bg-blue-700 text-white border-blue-600"
              onClick={() => {
                setActiveFilter('unreviewed');
                setSelectedVehicle(null);
                setSelectedEmailForDetail(null);
              }}
            >
              Unreviewed Loads
              <Badge variant="destructive" className="h-4 px-1.5 text-[10px] bg-red-500 ml-1">{unreviewedCount}</Badge>
            </Button>
            
            <Button 
              size="sm" 
              variant="outline"
              className="h-7 px-2 text-xs"
            >
              <Home className="h-3.5 w-3.5" />
            </Button>
            
            <Button 
              size="sm" 
              variant="outline"
              className="h-7 px-2 text-xs"
            >
              <Bell className="h-3.5 w-3.5" />
            </Button>
            
            <Button 
              size="sm" 
              variant={activeFilter === 'missed' ? 'default' : 'outline'}
              className="h-7 px-2.5 text-xs gap-1.5"
              onClick={() => {
                setActiveFilter('missed');
                setSelectedVehicle(null);
                setSelectedEmailForDetail(null);
              }}
            >
              Missed
              <Badge variant="secondary" className="h-4 px-1.5 text-[10px] ml-1">50</Badge>
            </Button>
            
            <Button 
              size="sm" 
              variant={activeFilter === 'waitlist' ? 'default' : 'outline'}
              className="h-7 px-2.5 text-xs gap-1.5 bg-orange-500 hover:bg-orange-600 text-white border-orange-500"
              onClick={() => {
                setActiveFilter('waitlist');
                setSelectedVehicle(null);
                setSelectedEmailForDetail(null);
              }}
            >
              Waitlist
              <Badge variant="secondary" className="h-4 px-1.5 text-[10px] bg-orange-600 ml-1">0</Badge>
            </Button>
            
            <Button 
              size="sm" 
              variant={activeFilter === 'undecided' ? 'default' : 'outline'}
              className="h-7 px-2.5 text-xs gap-1.5 bg-orange-500 hover:bg-orange-600 text-white border-orange-500"
              onClick={() => {
                setActiveFilter('undecided');
                setSelectedVehicle(null);
                setSelectedEmailForDetail(null);
              }}
            >
              Undecided
              <Badge variant="secondary" className="h-4 px-1.5 text-[10px] bg-orange-600 ml-1">0</Badge>
            </Button>
            
            <Button 
              size="sm" 
              variant={activeFilter === 'skipped' ? 'default' : 'outline'}
              className="h-7 px-2.5 text-xs gap-1.5"
              onClick={() => {
                setActiveFilter('skipped');
                setSelectedVehicle(null);
                setSelectedEmailForDetail(null);
              }}
            >
              Skipped
              <Badge variant="secondary" className="h-4 px-1.5 text-[10px] ml-1">{skippedCount}</Badge>
            </Button>
            
            <Button 
              size="sm" 
              variant={activeFilter === 'mybids' ? 'default' : 'outline'}
              className="h-7 px-2.5 text-xs gap-1.5 bg-blue-600 hover:bg-blue-700 text-white border-blue-600"
              onClick={() => {
                setActiveFilter('mybids');
                setSelectedVehicle(null);
                setSelectedEmailForDetail(null);
              }}
            >
              My Bids
              <Badge variant="secondary" className="h-4 px-1.5 text-[10px] bg-blue-700 ml-1">85</Badge>
            </Button>
            
            <Button 
              size="sm" 
              variant={activeFilter === 'all' ? 'default' : 'outline'}
              className="h-7 px-2.5 text-xs"
              onClick={() => {
                setActiveFilter('all');
                setSelectedVehicle(null);
                setSelectedEmailForDetail(null);
              }}
            >
              All
            </Button>
            
            <Button 
              size="sm" 
              variant={activeFilter === 'booked' ? 'default' : 'outline'}
              className="h-7 px-2.5 text-xs gap-1.5"
              onClick={() => {
                setActiveFilter('booked');
                setSelectedVehicle(null);
                setSelectedEmailForDetail(null);
              }}
            >
              Booked
              <Badge variant="secondary" className="h-4 px-1.5 text-[10px] ml-1">2</Badge>
            </Button>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
            <Button 
              size="sm" 
              variant={activeFilter === 'vehicle-assignment' ? 'default' : 'outline'}
              className="h-7 px-2.5 text-xs"
              onClick={() => {
                setActiveFilter('vehicle-assignment');
                setSelectedVehicle(null);
                setSelectedEmailForDetail(null);
              }}
            >
              Vehicle Assignment
            </Button>
            
            <Button 
              size="sm" 
              variant={activeFilter === 'dispatcher-metrix' ? 'default' : 'outline'}
              className="h-7 px-2.5 text-xs"
              onClick={() => {
                setActiveFilter('dispatcher-metrix');
                setSelectedVehicle(null);
                setSelectedEmailForDetail(null);
              }}
            >
              Dispatcher Metrix
            </Button>
            
            <Dialog open={emailConfigOpen} onOpenChange={setEmailConfigOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs px-2.5">
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
              className="gap-1.5 h-7 text-xs px-2.5"
              onClick={handleRefreshLoads}
              disabled={refreshing}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Refreshing..." : "Refresh Loads"}
            </Button>
          </div>
        </div>

      {/* Main Content Area */}
      <div className="flex flex-1 gap-2 overflow-y-auto overflow-x-hidden pt-3">
        {/* Left Sidebar - Vehicles - Always Visible */}
        {!selectedEmailForDetail && (
          <div className="w-64 flex-shrink-0 space-y-1 overflow-y-auto border-r pr-2">
            {loading ? (
              <div className="text-xs text-muted-foreground">Loading...</div>
            ) : vehicles.length === 0 ? (
              <div className="text-xs text-muted-foreground">No active trucks</div>
            ) : (
              vehicles.map((vehicle) => {
                const hasHunt = huntPlans.some(plan => plan.vehicleId === vehicle.id);
                return (
                  <Card 
                    key={vehicle.id} 
                    className={`p-2 hover:bg-muted/50 transition-colors cursor-pointer rounded-sm ${
                      hasHunt ? 'border-l-4 border-l-blue-500' : 'border-l-4 border-l-gray-300'
                    } ${selectedVehicle?.id === vehicle.id ? 'bg-muted' : ''}`}
                    onClick={() => setSelectedVehicle(vehicle)}
                  >
                    <div className="flex items-start justify-between gap-1.5">
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <div className="font-medium text-xs leading-tight text-foreground">
                          {vehicle.vehicle_number || "N/A"} - {getDriverName(vehicle.driver_1_id) || "No Driver Assigned"}
                        </div>
                        <div className="text-[11px] text-muted-foreground leading-tight">
                          {vehicle.asset_type || "Asset Type"}
                        </div>
                        <div className="text-[10px] text-muted-foreground/60 truncate leading-tight">
                          {vehicle.carrier || "No Carrier"}
                        </div>
                      </div>
                      <div className="flex gap-0.5 flex-shrink-0">
                        <div className="h-4 w-4 rounded-sm bg-red-500 flex items-center justify-center text-white text-[9px] font-medium">
                          0
                        </div>
                        <div className="h-4 w-4 rounded-sm bg-orange-500 flex items-center justify-center text-white text-[9px] font-medium">
                          0
                        </div>
                        <div className="h-4 w-4 rounded-sm bg-blue-500 flex items-center justify-center text-white text-[9px] font-medium">
                          0
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })
            )}
          </div>
        )}

      {/* Main Content - Load Board or Vehicle Details */}
      <div className="flex-1 space-y-2 overflow-hidden flex flex-col">
        {/* Conditional Content: Load Board or Vehicle Details */}
        {selectedVehicle ? (
          /* Vehicle Details View */
          <div className="flex-1 overflow-hidden flex gap-3">
            {/* Left Panel - Vehicle Info */}
            <div className="w-[380px] flex-shrink-0 space-y-4 overflow-y-auto border rounded-lg p-4 bg-card">
              {/* Tabs */}
              <Tabs defaultValue="empty" className="w-full">
                <TabsList className="w-full grid grid-cols-4 h-10 bg-muted/30 mb-6">
                  <TabsTrigger value="empty" className="text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                    Empty
                  </TabsTrigger>
                  <TabsTrigger value="delivery" className="text-sm">
                    Delivery Date & Time
                  </TabsTrigger>
                  <TabsTrigger value="destination" className="text-sm">
                    Destination
                  </TabsTrigger>
                  <TabsTrigger value="remaining" className="text-sm">
                    Remaining
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {/* Vehicle Details Section with Border */}
              <div className="border-2 border-border rounded-lg p-4 space-y-4 bg-background">
                {/* Location & Odometer with Maintenance Box */}
                <div className="relative">
                  <div className="space-y-1 pr-[220px]">
                    <div className="text-sm">Location</div>
                    <div className="text-sm font-medium whitespace-normal break-words">
                      {selectedVehicle.formatted_address || selectedVehicle.last_location || "N/A"}
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Gauge className="h-4 w-4" />
                      <span>Odometer</span>
                      <span className="font-semibold">
                        {selectedVehicle.odometer ? selectedVehicle.odometer.toLocaleString() : "N/A"}
                      </span>
                    </div>
                  </div>
                  
                  {/* Next Maintenance Due Box - Positioned on the right */}
                  <div className="absolute top-0 right-0 border-2 border-border rounded-lg px-4 py-2 bg-background min-w-[200px]">
                    <div className="text-xs text-muted-foreground mb-1">Next Maintenance Due</div>
                    <div className="flex items-center justify-between gap-4">
                      <div className={`text-2xl font-bold ${
                        selectedVehicle.oil_change_remaining !== null && selectedVehicle.oil_change_remaining < 0 
                          ? "text-destructive" 
                          : ""
                      }`}>
                        {selectedVehicle.oil_change_remaining !== null && selectedVehicle.oil_change_remaining !== undefined
                          ? `${selectedVehicle.oil_change_remaining} mi`
                          : "N/A"}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {selectedVehicle.next_service_date || "N/A"}
                      </div>
                    </div>
                  </div>
                </div>

                <Button variant="link" className="text-sm text-primary p-0 h-auto">
                  View vehicle Details
                </Button>

                {/* Driver Assignments - Single line format */}
                <div className="space-y-2">
                  <div className="flex items-center text-sm">
                    <span className="font-semibold w-8">D1</span>
                    <span className="flex-1">
                      {getDriverName(selectedVehicle.driver_1_id) || "No Driver Assigned"}
                    </span>
                    <span className="text-muted-foreground">Note: N/A</span>
                  </div>
                  <div className="flex items-center text-sm">
                    <span className="font-semibold w-8">D2</span>
                    <span className="flex-1">
                      {getDriverName(selectedVehicle.driver_2_id) || "No Driver Assigned"}
                    </span>
                    <span className="text-muted-foreground">Note: N/A</span>
                  </div>
                </div>

                {/* Vehicle Note - Editable */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">Vehicle Note:</div>
                    <Wrench 
                      className="h-5 w-5 text-primary cursor-pointer hover:text-primary/80" 
                      onClick={() => setEditingNotes(!editingNotes)}
                    />
                  </div>
                  {editingNotes ? (
                    <div className="space-y-2">
                      <Textarea
                        value={vehicleNotes}
                        onChange={(e) => setVehicleNotes(e.target.value)}
                        placeholder="Enter vehicle notes..."
                        className="min-h-[80px] text-sm"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={handleSaveVehicleNotes}>
                          Save Notes
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => {
                            setEditingNotes(false);
                            setVehicleNotes(selectedVehicle.notes || "");
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground min-h-[40px] whitespace-pre-wrap">
                      {selectedVehicle.notes || "No notes available"}
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 pt-2">
                  <Button className="flex-1 h-9" onClick={() => setCreateHuntOpen(true)}>
                    Create New Hunt
                  </Button>
                  <Button variant="outline" className="flex-1 h-9">
                    Set Driver to Time-Off mode
                  </Button>
                </div>
              </div>

              {/* Hunt Plans - Filter by selected vehicle */}
              {huntPlans
                .filter((plan) => plan.vehicleId === selectedVehicle.id)
                .map((plan) => (
                <Card key={plan.id} className="p-4 space-y-3 bg-card border-2 border-border">
                  {/* Action Buttons */}
                  <div className="flex items-center justify-between">
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" className="h-8 px-3 text-xs">
                        Disable
                      </Button>
                      <Button size="sm" variant="secondary" className="h-8 px-3 text-xs">
                        Edit
                      </Button>
                      <Button 
                        size="sm" 
                        variant="secondary" 
                        className="h-8 px-3 text-xs"
                        onClick={() => handleDeleteHuntPlan(plan.id)}
                      >
                        Delete
                      </Button>
                    </div>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                      <Truck className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Hunt Plan Details */}
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="font-medium">Vehicle Size:</span>
                      <span>{plan.vehicleSize === 'large-straight' ? 'Large Straight, Small Straight' : plan.vehicleSize}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Zipcodes:</span>
                      <span>{plan.zipCode}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Search Distance (miles):</span>
                      <span>{plan.pickupRadius}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Available Feet:</span>
                      <span>{plan.availableFeet || 'TL'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Vehicle Available Time:</span>
                      <span className="text-xs">{formatDateTime(plan.availableDate, plan.availableTime)}</span>
                    </div>
                  </div>

                  {/* Meta Info */}
                  <div className="space-y-1 text-xs text-muted-foreground pt-2">
                    <div>Created by {plan.createdBy}: {getTimeAgo(plan.createdAt)}</div>
                    <div>Last Modified: {getTimeAgo(plan.lastModified)}</div>
                    <div className="text-right">Id: {plan.id}</div>
                  </div>

                  {/* Clear Matches Button */}
                  <Button variant="destructive" size="sm" className="w-full">
                    Clear Matches
                  </Button>
                </Card>
              ))}
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

      {/* Create New Hunt Dialog */}
      <Dialog open={createHuntOpen} onOpenChange={setCreateHuntOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">Create New Hunt Plan</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Plan Name */}
            <div className="space-y-2">
              <Label htmlFor="planName">Plan Name</Label>
              <Input 
                id="planName" 
                placeholder="Plan Name" 
                value={huntFormData.planName}
                onChange={(e) => setHuntFormData({...huntFormData, planName: e.target.value})}
              />
            </div>

            {/* Vehicle Size */}
            <div className="space-y-2">
              <Label htmlFor="vehicleSize">
                Vehicle Size <span className="text-destructive">*</span>
              </Label>
              <Select 
                value={huntFormData.vehicleSize}
                onValueChange={(value) => setHuntFormData({...huntFormData, vehicleSize: value})}
              >
                <SelectTrigger id="vehicleSize">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="large-straight">Large Straight, Small Straight</SelectItem>
                  <SelectItem value="small-straight">Small Straight</SelectItem>
                  <SelectItem value="large-straight-only">Large Straight</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Zip Code, Available feet, Partial */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label htmlFor="zipCode">
                  Zip Code <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Input 
                    id="zipCode" 
                    placeholder="Zip Code"
                    value={huntFormData.zipCode}
                    onChange={(e) => setHuntFormData({...huntFormData, zipCode: e.target.value})}
                  />
                  <MapPinned className="absolute right-3 top-2.5 h-4 w-4 text-primary" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="availableFeet">Available feet</Label>
                <Input 
                  id="availableFeet" 
                  placeholder="Available feet"
                  value={huntFormData.availableFeet}
                  onChange={(e) => setHuntFormData({...huntFormData, availableFeet: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label>&nbsp;</Label>
                <div className="flex items-center space-x-2 h-10">
                  <Checkbox 
                    id="partial"
                    checked={huntFormData.partial}
                    onCheckedChange={(checked) => setHuntFormData({...huntFormData, partial: checked as boolean})}
                  />
                  <label htmlFor="partial" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Partial
                  </label>
                </div>
              </div>
            </div>

            {/* Pickup Search Radius, Total Mile Limit */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="pickupRadius">Pickup Search Radius</Label>
                <Input 
                  id="pickupRadius"
                  value={huntFormData.pickupRadius}
                  onChange={(e) => setHuntFormData({...huntFormData, pickupRadius: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mileLimit">Total Mile Limit</Label>
                <Input 
                  id="mileLimit" 
                  placeholder="Total Mile Limit"
                  value={huntFormData.mileLimit}
                  onChange={(e) => setHuntFormData({...huntFormData, mileLimit: e.target.value})}
                />
              </div>
            </div>

            {/* Available Load Capacity */}
            <div className="space-y-2">
              <Label htmlFor="loadCapacity">Available Load Capacity</Label>
              <Input 
                id="loadCapacity"
                value={huntFormData.loadCapacity}
                onChange={(e) => setHuntFormData({...huntFormData, loadCapacity: e.target.value})}
              />
            </div>

            {/* Available Date and Time */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="availableDate">Available Date</Label>
                <Input 
                  id="availableDate" 
                  type="date"
                  value={huntFormData.availableDate}
                  onChange={(e) => setHuntFormData({...huntFormData, availableDate: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="availableTime">Available Time (Eastern Time)</Label>
                <Input 
                  id="availableTime" 
                  type="time"
                  value={huntFormData.availableTime}
                  onChange={(e) => setHuntFormData({...huntFormData, availableTime: e.target.value})}
                />
              </div>
            </div>

            {/* Destination Zip Code */}
            <div className="space-y-2">
              <Label htmlFor="destinationZip">Destination Zip Code (bring driver to home)</Label>
              <div className="relative">
                <Input 
                  id="destinationZip" 
                  placeholder="Destination Zip Code"
                  value={huntFormData.destinationZip}
                  onChange={(e) => setHuntFormData({...huntFormData, destinationZip: e.target.value})}
                />
                <MapPinned className="absolute right-3 top-2.5 h-4 w-4 text-primary" />
              </div>
            </div>

            {/* Destination Search Radius */}
            <div className="space-y-2">
              <Label htmlFor="destinationRadius">Destination Search Radius</Label>
              <Input 
                id="destinationRadius" 
                placeholder="Destination Search Radius"
                value={huntFormData.destinationRadius}
                onChange={(e) => setHuntFormData({...huntFormData, destinationRadius: e.target.value})}
              />
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea 
                id="notes" 
                placeholder="Notes" 
                rows={4} 
                className="resize-none"
                value={huntFormData.notes}
                onChange={(e) => setHuntFormData({...huntFormData, notes: e.target.value})}
              />
            </div>

            {/* Save Button */}
            <div className="flex justify-start pt-2">
              <Button variant="secondary" className="px-8" onClick={handleSaveHuntPlan}>
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
        ) : selectedEmailForDetail ? (
          /* Load Email Detail View */
          <LoadEmailDetail 
            email={selectedEmailForDetail} 
            onClose={() => setSelectedEmailForDetail(null)} 
          />
        ) : (
          /* Loads Table */
          <div className="flex-1 overflow-y-auto flex flex-col">
          <Card className="flex-1 flex flex-col">
            <CardContent className="p-0 flex-1 flex flex-col">
              <div className="border-t">
                {filteredEmails.length === 0 ? (
                  <div className="p-4 text-center text-xs text-muted-foreground">
                    {activeFilter === 'skipped' 
                      ? 'No skipped loads yet.' 
                      : activeFilter === 'unreviewed'
                      ? 'No unreviewed loads. Click "Refresh Loads" to check for new emails.'
                      : 'No load emails found yet. Click "Refresh Loads" to start monitoring your inbox.'}
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="h-7">
                          <TableHead className="w-[160px] py-0 text-[12px] leading-[1.1] text-blue-600 font-semibold">Truck - Drivers<br/>Carrier</TableHead>
                          <TableHead className="w-[110px] py-0 text-[12px] leading-[1.1] text-blue-600 font-semibold">Customer</TableHead>
                          <TableHead className="w-[100px] py-0 text-[12px] leading-[1.1] text-blue-600 font-semibold">Received<br/>Expires</TableHead>
                          <TableHead className="w-[120px] py-0 text-[12px] leading-[1.1] text-blue-600 font-semibold">Pickup Time<br/>Deliver Time</TableHead>
                          <TableHead className="w-[150px] py-0 text-[12px] leading-[1.1] text-blue-600 font-semibold">Origin<br/>Destination</TableHead>
                          <TableHead className="w-[130px] py-0 text-[12px] leading-[1.1] text-blue-600 font-semibold">Empty Drive<br/>Loaded Drive</TableHead>
                          <TableHead className="w-[130px] py-0 text-[12px] leading-[1.1] text-blue-600 font-semibold">Vehicle Type<br/>Weight</TableHead>
                          <TableHead className="w-[120px] py-0 text-[12px] leading-[1.1] text-blue-600 font-semibold">Pieces<br/>Dimensions</TableHead>
                          <TableHead className="w-[70px] py-0 text-[12px] leading-[1.1] text-blue-600 font-semibold">Avail ft</TableHead>
                          <TableHead className="w-[80px] py-0 text-[12px] leading-[1.1] text-blue-600 font-semibold">Source</TableHead>
                          <TableHead className="w-[90px] py-0 text-[12px] leading-[1.1] text-blue-600 font-semibold">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredEmails
                          .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                          .map((email) => {
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
                            <TableRow 
                              key={email.id} 
                              className="h-10 cursor-pointer hover:bg-accent transition-colors"
                              onClick={() => setSelectedEmailForDetail(email)}
                            >
                              <TableCell className="py-1">
                                <div className="text-[11px] font-medium leading-tight whitespace-nowrap">Available</div>
                                <div className="text-[10px] text-muted-foreground truncate leading-tight whitespace-nowrap">
                                  {email.from_name || email.from_email.split('@')[0]}
                                </div>
                              </TableCell>
                              <TableCell className="py-1">
                                <div className="flex items-center gap-1 whitespace-nowrap">
                                  <Badge variant="outline" className="h-4 px-1 text-[10px] flex-shrink-0">
                                    {email.status === 'new' ? '🟡' : '🟢'}
                                  </Badge>
                                  <div className="text-[11px] font-medium leading-tight whitespace-nowrap">
                                    {(() => {
                                      const customerName = data.customer || email.from_name || 'Unknown';
                                      return customerName.length > 22 ? customerName.slice(0, 22) + '...' : customerName;
                                    })()}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="py-1">
                                <div className="text-[11px] leading-tight whitespace-nowrap">{receivedAgo}</div>
                                <div className="text-[10px] text-muted-foreground leading-tight whitespace-nowrap">
                                  {data.expires_time || '—'}
                                </div>
                              </TableCell>
                              <TableCell className="py-1">
                                <div className="text-[11px] leading-tight whitespace-nowrap">
                                  {data.pickup_date || '—'} {data.pickup_time || ''}
                                </div>
                                <div className="text-[11px] leading-tight whitespace-nowrap">
                                  {data.delivery_date || '—'} {data.delivery_time || ''}
                                </div>
                              </TableCell>
                              <TableCell className="py-1">
                                <div className="text-[11px] font-medium leading-tight whitespace-nowrap">
                                  {data.origin_city || '—'}, {data.origin_state || '—'}
                                </div>
                                <div className="text-[11px] leading-tight whitespace-nowrap">
                                  {data.destination_city || '—'}, {data.destination_state || '—'}
                                </div>
                              </TableCell>
                              <TableCell className="py-1">
                                <div className="text-[11px] leading-tight whitespace-nowrap">
                                  {data.empty_miles ? `${data.empty_miles} mi` : '—'}
                                </div>
                                <div className="text-[11px] leading-tight whitespace-nowrap">
                                  {data.loaded_miles ? `${data.loaded_miles} mi` : '—'}
                                </div>
                              </TableCell>
                              <TableCell className="py-1">
                                <div className="text-[11px] leading-tight whitespace-nowrap">{data.vehicle_type || '—'}</div>
                                <div className="text-[11px] leading-tight whitespace-nowrap">{data.weight ? `${data.weight} lbs` : '—'}</div>
                              </TableCell>
                              <TableCell className="py-1">
                                <div className="text-[11px] leading-tight whitespace-nowrap">{data.pieces || '—'}</div>
                                <div className="text-[10px] text-muted-foreground leading-tight whitespace-nowrap">{data.dimensions || 'Not Specified'}</div>
                              </TableCell>
                              <TableCell className="py-1">
                                <div className="text-[11px] leading-tight whitespace-nowrap">{data.avail_ft ? `${data.avail_ft} ft` : '—'}</div>
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
                                    aria-label="Skip load"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSkipEmail(email.id);
                                    }}
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
                  
                  {/* Pagination bar at bottom - inline, not floating */}
                  <div className="flex items-center justify-between px-4 py-3 border-t bg-background">
                    <div className="flex items-center gap-6 text-sm text-muted-foreground">
                      <span>Items per page: {itemsPerPage}</span>
                      <span>
                        {Math.min((currentPage - 1) * itemsPerPage + 1, filteredEmails.length)} - {Math.min(currentPage * itemsPerPage, filteredEmails.length)} of {filteredEmails.length}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setCurrentPage(1)}
                        disabled={currentPage === 1}
                      >
                        <ChevronsLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                        disabled={currentPage === 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setCurrentPage(Math.min(Math.ceil(filteredEmails.length / itemsPerPage), currentPage + 1))}
                        disabled={currentPage >= Math.ceil(filteredEmails.length / itemsPerPage)}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setCurrentPage(Math.ceil(filteredEmails.length / itemsPerPage))}
                        disabled={currentPage >= Math.ceil(filteredEmails.length / itemsPerPage)}
                      >
                        <ChevronsRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
              </div>
            </CardContent>
          </Card>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
