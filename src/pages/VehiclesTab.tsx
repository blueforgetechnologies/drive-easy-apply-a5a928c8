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
import { toast } from "sonner";
import { format } from "date-fns";
import { Search, Plus, Edit, Trash2 } from "lucide-react";

interface Vehicle {
  id: string;
  vehicle_number: string | null;
  carrier: string | null;
  payee: string | null;
  driver_1_id: string | null;
  driver_2_id: string | null;
  primary_dispatcher_id: string | null;
  asset_type: string | null;
  dimensions_length: number | null;
  dimensions_width: number | null;
  dimensions_height: number | null;
  payload: number | null;
  lift_gate: boolean;
  oil_change_remaining: number | null;
  registration_exp_date: string | null;
  insurance_expiry: string | null;
  status: string;
  make: string | null;
  model: string | null;
  year: number | null;
  vin: string | null;
  license_plate: string | null;
  created_at: string;
}

export default function VehiclesTab() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = searchParams.get("filter") || "active";
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    vehicle_number: "",
    carrier: "",
    make: "",
    model: "",
    year: new Date().getFullYear(),
    vin: "",
    license_plate: "",
  });

  useEffect(() => {
    loadData();
  }, [filter]);

  const loadData = async () => {
    setLoading(true);
    try {
      const statusFilter = filter === "active" ? "active" : filter === "inactive" ? "inactive" : filter === "pending" ? "pending" : "active";
      
      const { data, error } = await supabase
        .from("vehicles")
        .select("*")
        .eq("status", statusFilter)
        .order("created_at", { ascending: false });

      if (error) {
        toast.error("Error loading assets");
        return;
      }
      setVehicles(data || []);
    } finally {
      setLoading(false);
    }
  };

  const handleAddVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase
        .from("vehicles")
        .insert({
          ...formData,
          status: "active",
        });

      if (error) throw error;
      toast.success("Asset added successfully");
      setDialogOpen(false);
      setFormData({
        vehicle_number: "",
        carrier: "",
        make: "",
        model: "",
        year: new Date().getFullYear(),
        vin: "",
        license_plate: "",
      });
      loadData();
    } catch (error: any) {
      toast.error("Failed to add asset: " + error.message);
    }
  };

  const handleDeleteVehicle = async (id: string) => {
    try {
      const { error } = await supabase
        .from("vehicles")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Asset deleted successfully");
      loadData();
    } catch (error: any) {
      toast.error("Failed to delete asset: " + error.message);
    }
  };

  const viewVehicle = (id: string) => {
    navigate(`/dashboard/vehicle/${id}`);
  };

  const filteredVehicles = vehicles.filter((vehicle) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      (vehicle.vehicle_number || "").toLowerCase().includes(searchLower) ||
      (vehicle.carrier || "").toLowerCase().includes(searchLower) ||
      (vehicle.payee || "").toLowerCase().includes(searchLower) ||
      (vehicle.make || "").toLowerCase().includes(searchLower) ||
      (vehicle.model || "").toLowerCase().includes(searchLower) ||
      (vehicle.vin || "").toLowerCase().includes(searchLower) ||
      (vehicle.license_plate || "").toLowerCase().includes(searchLower)
    );
  });

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Asset Management</h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Add Asset
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Asset</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddVehicle} className="space-y-4">
              <div>
                <Label htmlFor="vehicle_number">Unit ID</Label>
                <Input
                  id="vehicle_number"
                  value={formData.vehicle_number}
                  onChange={(e) => setFormData({ ...formData, vehicle_number: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="carrier">Carrier</Label>
                <Input
                  id="carrier"
                  value={formData.carrier}
                  onChange={(e) => setFormData({ ...formData, carrier: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="make">Make</Label>
                <Input
                  id="make"
                  value={formData.make}
                  onChange={(e) => setFormData({ ...formData, make: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="model">Model</Label>
                <Input
                  id="model"
                  value={formData.model}
                  onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="year">Year</Label>
                <Input
                  id="year"
                  type="number"
                  value={formData.year}
                  onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="vin">VIN</Label>
                <Input
                  id="vin"
                  value={formData.vin}
                  onChange={(e) => setFormData({ ...formData, vin: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="license_plate">License Plate</Label>
                <Input
                  id="license_plate"
                  value={formData.license_plate}
                  onChange={(e) => setFormData({ ...formData, license_plate: e.target.value })}
                  required
                />
              </div>
              <Button type="submit" className="w-full">Add Asset</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Tabs and Search */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex flex-wrap gap-2">
          <Button
            variant={filter === "active" ? "default" : "outline"}
            onClick={() => {
              setSearchParams({ filter: "active" });
              setSearchQuery("");
            }}
            className={filter === "active" ? "bg-green-600 text-white hover:bg-green-700" : ""}
          >
            Active
          </Button>
          <Button
            variant={filter === "pending" ? "default" : "outline"}
            onClick={() => {
              setSearchParams({ filter: "pending" });
              setSearchQuery("");
            }}
            className={filter === "pending" ? "bg-accent text-accent-foreground" : ""}
          >
            Pending
          </Button>
          <Button
            variant={filter === "inactive" ? "default" : "outline"}
            onClick={() => {
              setSearchParams({ filter: "inactive" });
              setSearchQuery("");
            }}
            className={filter === "inactive" ? "bg-muted text-muted-foreground" : ""}
          >
            Inactive
          </Button>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search assets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {filteredVehicles.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {searchQuery ? "No assets match your search" : "No assets found"}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-[80px]">Asset Status</TableHead>
                    <TableHead>Unit ID<br/>Leased ID</TableHead>
                    <TableHead>Carrier<br/>Payee</TableHead>
                    <TableHead>Drivers</TableHead>
                    <TableHead>Primary<br/>Dispatcher</TableHead>
                    <TableHead>Asset Type<br/>Susp</TableHead>
                    <TableHead>Dimensions<br/>Door Dims</TableHead>
                    <TableHead>Payload<br/>Clearance</TableHead>
                    <TableHead>Lift-Gate<br/>Dock High</TableHead>
                    <TableHead>Oil Change</TableHead>
                    <TableHead>Registration<br/>Renewal</TableHead>
                    <TableHead>Insurance<br/>Renewal</TableHead>
                    <TableHead className="w-[120px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredVehicles.map((vehicle) => (
                    <TableRow key={vehicle.id} className="cursor-pointer hover:bg-muted/50" onClick={() => viewVehicle(vehicle.id)}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div 
                            className={`w-8 h-8 rounded flex items-center justify-center font-bold text-xs text-white ${
                              vehicle.status === "active" 
                                ? "bg-green-600" 
                                : vehicle.status === "pending"
                                ? "bg-orange-500"
                                : "bg-gray-500"
                            }`}
                          >
                            0
                          </div>
                          <Badge 
                            variant="secondary" 
                            className={`${
                              vehicle.status === "active"
                                ? "bg-green-100 text-green-800 hover:bg-green-100"
                                : vehicle.status === "pending"
                                ? "bg-orange-100 text-orange-800 hover:bg-orange-100"
                                : "bg-gray-100 text-gray-800 hover:bg-gray-100"
                            }`}
                          >
                            {vehicle.status.charAt(0).toUpperCase() + vehicle.status.slice(1)}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">
                        <div>{vehicle.vehicle_number || "N/A"}</div>
                        <div className="text-sm text-muted-foreground">0</div>
                      </TableCell>
                      <TableCell>
                        <div>{vehicle.carrier || "N/A"}</div>
                        <div className="text-sm text-muted-foreground">{vehicle.payee || "N/A"}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div className="text-primary underline">Assign Driver</div>
                          <div className="text-primary underline">Assign Driver</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-primary underline">Assign Dispatcher</div>
                      </TableCell>
                      <TableCell>
                        <div>{vehicle.asset_type || "N/A"}</div>
                        <div className="text-sm text-muted-foreground">Air Ride</div>
                      </TableCell>
                      <TableCell>
                        <div>
                          {vehicle.dimensions_length && vehicle.dimensions_width && vehicle.dimensions_height
                            ? `${vehicle.dimensions_length}L x ${vehicle.dimensions_width}W x ${vehicle.dimensions_height}H`
                            : "N/A"}
                        </div>
                        <div className="text-sm text-muted-foreground">96H x 94W</div>
                      </TableCell>
                      <TableCell>
                        <div>{vehicle.payload ? `${vehicle.payload}` : "N/A"}</div>
                        <div className="text-sm text-muted-foreground">13"</div>
                      </TableCell>
                      <TableCell>
                        <div>{vehicle.lift_gate ? "Yes" : "No"}</div>
                        <div className="text-sm text-muted-foreground">Dock High</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {vehicle.oil_change_remaining ? `${vehicle.oil_change_remaining}` : "N/A"}
                        </div>
                      </TableCell>
                      <TableCell>
                        {vehicle.registration_exp_date 
                          ? format(new Date(vehicle.registration_exp_date), "yyyy-MM-dd") 
                          : "N/A"}
                      </TableCell>
                      <TableCell>
                        {vehicle.insurance_expiry 
                          ? format(new Date(vehicle.insurance_expiry), "yyyy-MM-dd") 
                          : "N/A"}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-8 w-8"
                            onClick={() => viewVehicle(vehicle.id)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => handleDeleteVehicle(vehicle.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
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
