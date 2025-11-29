import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { Search, Plus, Edit, Trash2, Truck, MapPin, DollarSign } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

interface Load {
  id: string;
  load_number: string;
  status: string;
  load_type: string | null;
  pickup_location: string | null;
  pickup_city: string | null;
  pickup_state: string | null;
  pickup_date: string | null;
  delivery_location: string | null;
  delivery_city: string | null;
  delivery_state: string | null;
  delivery_date: string | null;
  assigned_driver_id: string | null;
  assigned_vehicle_id: string | null;
  rate: number | null;
  total_revenue: number | null;
  estimated_miles: number | null;
  cargo_weight: number | null;
  cargo_description: string | null;
  customer_id: string | null;
  broker_name: string | null;
  reference_number: string | null;
  created_at: string;
}

export default function LoadsTab() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = searchParams.get("filter") || "pending";
  const [loads, setLoads] = useState<Load[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    load_number: `LD${Date.now()}`,
    load_type: "internal",
    shipper_name: "",
    shipper_address: "",
    shipper_city: "",
    shipper_state: "",
    shipper_zip: "",
    shipper_contact: "",
    shipper_phone: "",
    shipper_email: "",
    pickup_location: "",
    pickup_city: "",
    pickup_state: "",
    pickup_date: "",
    receiver_name: "",
    receiver_address: "",
    receiver_city: "",
    receiver_state: "",
    receiver_zip: "",
    receiver_contact: "",
    receiver_phone: "",
    receiver_email: "",
    delivery_location: "",
    delivery_city: "",
    delivery_state: "",
    delivery_date: "",
    cargo_description: "",
    cargo_weight: "",
    estimated_miles: "",
    rate: "",
  });

  useEffect(() => {
    loadData();
  }, [filter]);

  const loadData = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("loads" as any)
        .select("*");
      
      // Only filter by status if not "all"
      if (filter !== "all") {
        query = query.eq("status", filter);
      }
      
      const { data, error } = await query.order("created_at", { ascending: false });

      if (error) {
        toast.error("Error loading loads");
        return;
      }
      setLoads((data as any) || []);
    } finally {
      setLoading(false);
    }
  };

  const handleAddLoad = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase
        .from("loads" as any)
        .insert({
          ...formData,
          status: "pending",
          cargo_weight: formData.cargo_weight ? parseFloat(formData.cargo_weight) : null,
          estimated_miles: formData.estimated_miles ? parseFloat(formData.estimated_miles) : null,
          rate: formData.rate ? parseFloat(formData.rate) : null,
        });

      if (error) throw error;
      toast.success("Load created successfully");
      setDialogOpen(false);
      setFormData({
        load_number: `LD${Date.now()}`,
        load_type: "internal",
        shipper_name: "",
        shipper_address: "",
        shipper_city: "",
        shipper_state: "",
        shipper_zip: "",
        shipper_contact: "",
        shipper_phone: "",
        shipper_email: "",
        pickup_location: "",
        pickup_city: "",
        pickup_state: "",
        pickup_date: "",
        receiver_name: "",
        receiver_address: "",
        receiver_city: "",
        receiver_state: "",
        receiver_zip: "",
        receiver_contact: "",
        receiver_phone: "",
        receiver_email: "",
        delivery_location: "",
        delivery_city: "",
        delivery_state: "",
        delivery_date: "",
        cargo_description: "",
        cargo_weight: "",
        estimated_miles: "",
        rate: "",
      });
      loadData();
    } catch (error: any) {
      toast.error("Failed to create load: " + error.message);
    }
  };

  const handleDeleteLoad = async (id: string) => {
    try {
      const { error } = await supabase
        .from("loads" as any)
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Load deleted successfully");
      loadData();
    } catch (error: any) {
      toast.error("Failed to delete load: " + error.message);
    }
  };

  const viewLoadDetail = (id: string) => {
    navigate(`/dashboard/load/${id}`);
  };

  const filteredLoads = loads.filter((load) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      (load.load_number || "").toLowerCase().includes(searchLower) ||
      (load.pickup_location || "").toLowerCase().includes(searchLower) ||
      (load.delivery_location || "").toLowerCase().includes(searchLower) ||
      (load.broker_name || "").toLowerCase().includes(searchLower)
    );
  });

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      pending: "bg-yellow-500 hover:bg-yellow-600",
      dispatched: "bg-blue-500 hover:bg-blue-600",
      in_transit: "bg-purple-500 hover:bg-purple-600",
      delivered: "bg-green-600 hover:bg-green-700",
      completed: "bg-green-800 hover:bg-green-900",
      cancelled: "bg-red-500 hover:bg-red-600",
    };
    return colors[status] || "bg-gray-500 hover:bg-gray-600";
  };

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Booked Loads</h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Create Load
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Load</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddLoad} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="load_number">Load Number</Label>
                  <Input
                    id="load_number"
                    value={formData.load_number}
                    onChange={(e) => setFormData({ ...formData, load_number: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="load_type">Load Type</Label>
                  <Select value={formData.load_type} onValueChange={(value) => setFormData({ ...formData, load_type: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="internal">Internal</SelectItem>
                      <SelectItem value="broker">Broker</SelectItem>
                      <SelectItem value="load_board">Load Board</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Shipper Information
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Label htmlFor="shipper_name">Shipper Company Name</Label>
                    <Input
                      id="shipper_name"
                      value={formData.shipper_name}
                      onChange={(e) => setFormData({ ...formData, shipper_name: e.target.value })}
                      placeholder="Company name"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label htmlFor="shipper_address">Address</Label>
                    <Input
                      id="shipper_address"
                      value={formData.shipper_address}
                      onChange={(e) => setFormData({ ...formData, shipper_address: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="shipper_city">City</Label>
                    <Input
                      id="shipper_city"
                      value={formData.shipper_city}
                      onChange={(e) => setFormData({ ...formData, shipper_city: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="shipper_state">State</Label>
                    <Input
                      id="shipper_state"
                      value={formData.shipper_state}
                      onChange={(e) => setFormData({ ...formData, shipper_state: e.target.value })}
                      placeholder="e.g., CA"
                    />
                  </div>
                  <div>
                    <Label htmlFor="shipper_zip">ZIP</Label>
                    <Input
                      id="shipper_zip"
                      value={formData.shipper_zip}
                      onChange={(e) => setFormData({ ...formData, shipper_zip: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="shipper_contact">Contact Name</Label>
                    <Input
                      id="shipper_contact"
                      value={formData.shipper_contact}
                      onChange={(e) => setFormData({ ...formData, shipper_contact: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="shipper_phone">Phone</Label>
                    <Input
                      id="shipper_phone"
                      type="tel"
                      value={formData.shipper_phone}
                      onChange={(e) => setFormData({ ...formData, shipper_phone: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="shipper_email">Email</Label>
                    <Input
                      id="shipper_email"
                      type="email"
                      value={formData.shipper_email}
                      onChange={(e) => setFormData({ ...formData, shipper_email: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Pickup Information
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Label htmlFor="pickup_location">Pickup Location</Label>
                    <Input
                      id="pickup_location"
                      value={formData.pickup_location}
                      onChange={(e) => setFormData({ ...formData, pickup_location: e.target.value })}
                      placeholder="Company name or location"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="pickup_city">City</Label>
                    <Input
                      id="pickup_city"
                      value={formData.pickup_city}
                      onChange={(e) => setFormData({ ...formData, pickup_city: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="pickup_state">State</Label>
                    <Input
                      id="pickup_state"
                      value={formData.pickup_state}
                      onChange={(e) => setFormData({ ...formData, pickup_state: e.target.value })}
                      placeholder="e.g., CA"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="pickup_date">Pickup Date</Label>
                    <Input
                      id="pickup_date"
                      type="datetime-local"
                      value={formData.pickup_date}
                      onChange={(e) => setFormData({ ...formData, pickup_date: e.target.value })}
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Delivery Information
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Label htmlFor="delivery_location">Delivery Location</Label>
                    <Input
                      id="delivery_location"
                      value={formData.delivery_location}
                      onChange={(e) => setFormData({ ...formData, delivery_location: e.target.value })}
                      placeholder="Company name or location"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="delivery_city">City</Label>
                    <Input
                      id="delivery_city"
                      value={formData.delivery_city}
                      onChange={(e) => setFormData({ ...formData, delivery_city: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="delivery_state">State</Label>
                    <Input
                      id="delivery_state"
                      value={formData.delivery_state}
                      onChange={(e) => setFormData({ ...formData, delivery_state: e.target.value })}
                      placeholder="e.g., NY"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="delivery_date">Delivery Date</Label>
                    <Input
                      id="delivery_date"
                      type="datetime-local"
                      value={formData.delivery_date}
                      onChange={(e) => setFormData({ ...formData, delivery_date: e.target.value })}
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Receiver Information
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Label htmlFor="receiver_name">Receiver Company Name</Label>
                    <Input
                      id="receiver_name"
                      value={formData.receiver_name}
                      onChange={(e) => setFormData({ ...formData, receiver_name: e.target.value })}
                      placeholder="Company name"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label htmlFor="receiver_address">Address</Label>
                    <Input
                      id="receiver_address"
                      value={formData.receiver_address}
                      onChange={(e) => setFormData({ ...formData, receiver_address: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="receiver_city">City</Label>
                    <Input
                      id="receiver_city"
                      value={formData.receiver_city}
                      onChange={(e) => setFormData({ ...formData, receiver_city: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="receiver_state">State</Label>
                    <Input
                      id="receiver_state"
                      value={formData.receiver_state}
                      onChange={(e) => setFormData({ ...formData, receiver_state: e.target.value })}
                      placeholder="e.g., NY"
                    />
                  </div>
                  <div>
                    <Label htmlFor="receiver_zip">ZIP</Label>
                    <Input
                      id="receiver_zip"
                      value={formData.receiver_zip}
                      onChange={(e) => setFormData({ ...formData, receiver_zip: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="receiver_contact">Contact Name</Label>
                    <Input
                      id="receiver_contact"
                      value={formData.receiver_contact}
                      onChange={(e) => setFormData({ ...formData, receiver_contact: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="receiver_phone">Phone</Label>
                    <Input
                      id="receiver_phone"
                      type="tel"
                      value={formData.receiver_phone}
                      onChange={(e) => setFormData({ ...formData, receiver_phone: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="receiver_email">Email</Label>
                    <Input
                      id="receiver_email"
                      type="email"
                      value={formData.receiver_email}
                      onChange={(e) => setFormData({ ...formData, receiver_email: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Truck className="h-4 w-4" />
                  Cargo Details
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Label htmlFor="cargo_description">Cargo Description</Label>
                    <Textarea
                      id="cargo_description"
                      value={formData.cargo_description}
                      onChange={(e) => setFormData({ ...formData, cargo_description: e.target.value })}
                      rows={2}
                    />
                  </div>
                  <div>
                    <Label htmlFor="cargo_weight">Weight (lbs)</Label>
                    <Input
                      id="cargo_weight"
                      type="number"
                      value={formData.cargo_weight}
                      onChange={(e) => setFormData({ ...formData, cargo_weight: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="estimated_miles">Estimated Miles</Label>
                    <Input
                      id="estimated_miles"
                      type="number"
                      value={formData.estimated_miles}
                      onChange={(e) => setFormData({ ...formData, estimated_miles: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Financial
                </h3>
                <div>
                  <Label htmlFor="rate">Rate ($)</Label>
                  <Input
                    id="rate"
                    type="number"
                    step="0.01"
                    value={formData.rate}
                    onChange={(e) => setFormData({ ...formData, rate: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">
                  Cancel
                </Button>
                <Button type="submit" className="flex-1">Create Load</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex flex-wrap gap-2">
          <Button
            variant={filter === "all" ? "default" : "outline"}
            onClick={() => {
              setSearchParams({ filter: "all" });
              setSearchQuery("");
            }}
            className={filter === "all" ? "bg-primary text-primary-foreground" : ""}
          >
            All Loads
          </Button>
          <Button
            variant={filter === "pending" ? "default" : "outline"}
            onClick={() => {
              setSearchParams({ filter: "pending" });
              setSearchQuery("");
            }}
            className={filter === "pending" ? "bg-yellow-500 text-white hover:bg-yellow-600" : ""}
          >
            Pending
          </Button>
          <Button
            variant={filter === "dispatched" ? "default" : "outline"}
            onClick={() => {
              setSearchParams({ filter: "dispatched" });
              setSearchQuery("");
            }}
            className={filter === "dispatched" ? "bg-blue-500 text-white hover:bg-blue-600" : ""}
          >
            Dispatched
          </Button>
          <Button
            variant={filter === "in_transit" ? "default" : "outline"}
            onClick={() => {
              setSearchParams({ filter: "in_transit" });
              setSearchQuery("");
            }}
            className={filter === "in_transit" ? "bg-purple-500 text-white hover:bg-purple-600" : ""}
          >
            In Transit
          </Button>
          <Button
            variant={filter === "delivered" ? "default" : "outline"}
            onClick={() => {
              setSearchParams({ filter: "delivered" });
              setSearchQuery("");
            }}
            className={filter === "delivered" ? "bg-green-600 text-white hover:bg-green-700" : ""}
          >
            Delivered
          </Button>
          <Button
            variant={filter === "completed" ? "default" : "outline"}
            onClick={() => {
              setSearchParams({ filter: "completed" });
              setSearchQuery("");
            }}
            className={filter === "completed" ? "bg-green-800 text-white hover:bg-green-900" : ""}
          >
            Completed
          </Button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search loads..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {filteredLoads.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {searchQuery ? "No loads match your search" : `No ${filter === "all" ? "" : filter} loads found`}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-12">
                      <Checkbox />
                    </TableHead>
                    <TableHead className="text-primary">Status</TableHead>
                    <TableHead className="text-primary">
                      <div>Truck Id</div>
                      <div>Driver</div>
                    </TableHead>
                    <TableHead className="text-primary">
                      <div>Carrier</div>
                      <div>Customer</div>
                    </TableHead>
                    <TableHead className="text-primary">
                      <div>Our Load ID</div>
                      <div>Customer Load</div>
                    </TableHead>
                    <TableHead className="text-primary">
                      <div>Origin</div>
                      <div>Destination</div>
                    </TableHead>
                    <TableHead className="text-primary">
                      <div>Pickup</div>
                      <div>Delivery</div>
                    </TableHead>
                    <TableHead className="text-primary">
                      <div>DH</div>
                      <div>Loaded</div>
                    </TableHead>
                    <TableHead className="text-primary">
                      <div>Loaded $ /</div>
                      <div>Mile</div>
                      <div>Total $ / Mile</div>
                    </TableHead>
                    <TableHead className="text-primary">Payload</TableHead>
                    <TableHead className="text-primary">
                      <div>Load Owner</div>
                      <div>Current Dispatcher</div>
                    </TableHead>
                    <TableHead className="text-primary">RC</TableHead>
                    <TableHead className="text-primary">BOL</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLoads.map((load) => (
                    <TableRow 
                      key={load.id} 
                      className="cursor-pointer hover:bg-muted/30 border-b" 
                      onClick={() => viewLoadDetail(load.id)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox />
                      </TableCell>
                      <TableCell>
                        <div className="text-xs whitespace-nowrap">
                          {load.status === "pending" && "Pending Rate"}
                        </div>
                        <div className="text-xs whitespace-nowrap">
                          {load.status === "pending" && "Approval"}
                        </div>
                        {load.status === "dispatched" && (
                          <Badge className="bg-blue-500 text-white text-xs">Dispatched</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="font-semibold text-sm">N/A</div>
                        <div className="text-xs text-muted-foreground">-</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{load.broker_name || "N/A"}</div>
                        <div className="text-xs text-muted-foreground">-</div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-sm">{load.load_number}</div>
                        <div className="text-xs text-muted-foreground">{load.reference_number || "-"}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{load.pickup_city}, {load.pickup_state}</div>
                        <div className="text-xs text-muted-foreground">{load.delivery_city}, {load.delivery_state}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs whitespace-nowrap">
                          {load.pickup_date ? format(new Date(load.pickup_date), "MM/dd/yy HH:mm") : "N/A"}
                        </div>
                        <div className="text-xs text-muted-foreground whitespace-nowrap">EST</div>
                        <div className="text-xs whitespace-nowrap">
                          {load.delivery_date ? format(new Date(load.delivery_date), "MM/dd/yy HH:mm") : "N/A"}
                        </div>
                        <div className="text-xs text-muted-foreground whitespace-nowrap">EST</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">0</div>
                        <div className="text-sm">{load.estimated_miles || "N/A"}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {load.rate && load.estimated_miles 
                            ? `$${(load.rate / load.estimated_miles).toFixed(2)}`
                            : "N/A"}
                        </div>
                        <div className="text-sm">
                          {load.rate && load.estimated_miles 
                            ? `$${(load.rate / load.estimated_miles).toFixed(2)}`
                            : "N/A"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">
                          {load.rate ? `$${load.rate.toFixed(2)}` : "N/A"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">-</div>
                        <div className="text-sm">-</div>
                      </TableCell>
                      <TableCell className="text-sm">N/A</TableCell>
                      <TableCell className="text-sm">N/A</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
