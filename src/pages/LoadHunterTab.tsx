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
              variant="default"
              size="sm"
              className="gap-2"
              onClick={handleRefreshLoads}
              disabled={refreshing}
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Refreshing..." : "Refresh Loads"}
            </Button>
          </div>
        </div>

        {/* Loads Table */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <Card className="flex-1 flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between py-3">
              <div>
                <CardTitle className="text-base">Unreviewed Load Emails</CardTitle>
                <p className="text-xs text-muted-foreground">New load offers detected from your monitored inbox</p>
              </div>
              <Badge variant="secondary" className="gap-1 text-xs">
                <CheckCircle className="h-3 w-3 text-green-500" />
                {loadEmails.length} new
              </Badge>
            </CardHeader>
            <CardContent className="p-0 flex-1 flex flex-col min-h-0">
              <div className="border-t">
                {loadEmails.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    No load emails found yet. Click "Refresh Loads" to start monitoring your inbox.
                  </div>
                ) : (
                  <div className="overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[220px]">From</TableHead>
                          <TableHead>Subject</TableHead>
                          <TableHead className="w-[180px]">Received</TableHead>
                          <TableHead className="w-[120px]">Status</TableHead>
                          <TableHead className="w-[80px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {loadEmails.map((email) => (
                          <TableRow key={email.id}>
                            <TableCell>
                              <div className="font-medium truncate">
                                {email.from_name || email.from_email}
                              </div>
                              <div className="text-xs text-muted-foreground truncate">
                                {email.from_email}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm font-medium truncate max-w-[320px]">
                                {email.subject || "(No subject)"}
                              </div>
                              <div className="text-xs text-muted-foreground truncate max-w-[320px]">
                                {email.body_text || "Preview not available"}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">
                                {new Date(email.received_at).toLocaleString()}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={email.status === 'new' ? 'default' : email.status === 'processed' ? 'secondary' : 'outline'}
                                className="text-xs"
                              >
                                {email.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Dismiss load">
                                  <X className="h-3 w-3" />
                                </Button>
                                <Button variant="outline" size="sm" className="h-7 text-xs">
                                  Review
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
