import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { RefreshCw, Settings, X, CheckCircle } from "lucide-react";

interface Vehicle {
  id: string;
  vehicle_number: string | null;
  carrier: string | null;
  asset_type: string | null;
  driver_1_id: string | null;
  driver_2_id: string | null;
  status: string;
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

  useEffect(() => {
    loadVehicles();
    loadDrivers();
    loadLoadEmails();
  }, []);

  const loadVehicles = async () => {
    try {
      const { data, error } = await supabase
        .from("vehicles")
        .select("*")
        .eq("status", "active")
        .order("vehicle_number", { ascending: true });

      if (error) throw error;
      setVehicles(data || []);
    } catch (error: any) {
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
      const { data, error } = await supabase.functions.invoke('gmail-auth', {
        body: { action: 'start' }
      });

      if (error) throw error;

      // Open Gmail OAuth window
      window.open(data.authUrl, '_blank', 'width=600,height=700');
      
      toast.success("Gmail authorization window opened - complete the authorization to start receiving load emails");
      
      // Refresh load emails after a delay
      setTimeout(() => loadLoadEmails(), 3000);
    } catch (error: any) {
      toast.error("Failed to start Gmail authorization");
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

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Left Sidebar - Vehicles */}
      <div className="w-64 flex-shrink-0 space-y-2 overflow-y-auto border-r pr-4">
        <div className="sticky top-0 bg-background pb-2">
          <h3 className="text-sm font-semibold text-muted-foreground mb-2">MY TRUCKS</h3>
        </div>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading...</div>
        ) : vehicles.length === 0 ? (
          <div className="text-sm text-muted-foreground">No active trucks</div>
        ) : (
          vehicles.map((vehicle) => (
            <Card key={vehicle.id} className="p-3 hover:bg-muted/50 transition-colors cursor-pointer">
              <div className="space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold text-sm">
                    {vehicle.vehicle_number || "N/A"} - {getDriverName(vehicle.driver_1_id) || "Unassigned"}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <Badge variant="destructive" className="h-5 w-5 p-0 flex items-center justify-center text-xs">
                      0
                    </Badge>
                    <Badge variant="secondary" className="h-5 w-5 p-0 flex items-center justify-center text-xs bg-orange-500 text-white">
                      0
                    </Badge>
                    <Badge variant="default" className="h-5 w-5 p-0 flex items-center justify-center text-xs">
                      0
                    </Badge>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  {vehicle.asset_type || "Asset Type"}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {vehicle.carrier || "No Carrier"}
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Main Content - Load Board */}
      <div className="flex-1 space-y-4 overflow-hidden flex flex-col">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold">Load Hunter</h2>
            <p className="text-sm text-muted-foreground">Available loads from email feed</p>
          </div>
          <div className="flex gap-2">
            <Dialog open={emailConfigOpen} onOpenChange={setEmailConfigOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Settings className="h-4 w-4" />
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
              onClick={handleRefreshLoads}
              disabled={refreshing}
              size="sm"
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Refreshing..." : "Refresh Loads"}
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b">
          <Button variant="default" size="sm" className="rounded-b-none bg-red-600 hover:bg-red-700">
            Unreviewed Loads
            <Badge variant="secondary" className="ml-2 bg-white text-red-600">
              {loadEmails.length}
            </Badge>
          </Button>
          <Button variant="ghost" size="sm" className="rounded-b-none">
            Missed
            <Badge variant="secondary" className="ml-2">0</Badge>
          </Button>
          <Button variant="ghost" size="sm" className="rounded-b-none">
            Watchlist
            <Badge variant="secondary" className="ml-2 bg-orange-500 text-white">0</Badge>
          </Button>
          <Button variant="ghost" size="sm" className="rounded-b-none">
            Undecided
            <Badge variant="secondary" className="ml-2 bg-orange-500 text-white">0</Badge>
          </Button>
          <Button variant="ghost" size="sm" className="rounded-b-none">
            Skipped
            <Badge variant="secondary" className="ml-2">0</Badge>
          </Button>
          <Button variant="ghost" size="sm" className="rounded-b-none">
            My Bids
            <Badge variant="default" className="ml-2">0</Badge>
          </Button>
          <Button variant="ghost" size="sm" className="rounded-b-none">
            All
          </Button>
          <Button variant="ghost" size="sm" className="rounded-b-none">
            Booked
            <Badge variant="secondary" className="ml-2">0</Badge>
          </Button>
        </div>

        {/* Load Table */}
        <Card className="flex-1 overflow-hidden">
          <CardContent className="p-0 h-full overflow-auto">
            {loadEmails.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <div className="text-muted-foreground mb-4">
                  <Settings className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p className="font-medium">No load emails yet</p>
                  <p className="text-sm">Click "Refresh Loads" to connect Gmail and start receiving load emails from {emailAddress}</p>
                </div>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead>From</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Received</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadEmails.map((email) => (
                    <TableRow key={email.id}>
                      <TableCell className="font-medium">{email.from_email}</TableCell>
                      <TableCell className="max-w-md truncate">{email.subject || 'No subject'}</TableCell>
                      <TableCell className="text-sm">{new Date(email.received_at).toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge variant={email.status === 'new' ? 'destructive' : 'secondary'}>
                          {email.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7">
                            <X className="h-4 w-4 text-destructive" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7">
                            <CheckCircle className="h-4 w-4 text-blue-600" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
