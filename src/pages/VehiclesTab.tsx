import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  make: string | null;
  model: string | null;
  year: number | null;
  vin: string | null;
  license_plate: string | null;
  status: string;
  assigned_driver_id: string | null;
  mileage: number | null;
  last_service_date: string | null;
  next_service_date: string | null;
  insurance_expiry: string | null;
  registration_expiry: string | null;
  notes: string | null;
  created_at: string;
}

export default function VehiclesTab() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = searchParams.get("filter") || "active";
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    vehicle_number: "",
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
      const statusFilter = filter === "active" ? "active" : filter === "inactive" ? "inactive" : "maintenance";
      
      const { data, error } = await supabase
        .from("vehicles")
        .select("*")
        .eq("status", statusFilter)
        .order("created_at", { ascending: false });

      if (error) {
        toast.error("Error loading vehicles");
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
      toast.success("Vehicle added successfully");
      setDialogOpen(false);
      setFormData({
        vehicle_number: "",
        make: "",
        model: "",
        year: new Date().getFullYear(),
        vin: "",
        license_plate: "",
      });
      loadData();
    } catch (error: any) {
      toast.error("Failed to add vehicle: " + error.message);
    }
  };

  const handleDeleteVehicle = async (id: string) => {
    try {
      const { error } = await supabase
        .from("vehicles")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Vehicle deleted successfully");
      loadData();
    } catch (error: any) {
      toast.error("Failed to delete vehicle: " + error.message);
    }
  };

  const filteredVehicles = vehicles.filter((vehicle) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      (vehicle.vehicle_number || "").toLowerCase().includes(searchLower) ||
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
        <h2 className="text-2xl font-bold">Vehicle Management</h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Add Vehicle
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Vehicle</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddVehicle} className="space-y-4">
              <div>
                <Label htmlFor="vehicle_number">Vehicle Number</Label>
                <Input
                  id="vehicle_number"
                  value={formData.vehicle_number}
                  onChange={(e) => setFormData({ ...formData, vehicle_number: e.target.value })}
                  required
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
              <Button type="submit" className="w-full">Add Vehicle</Button>
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
            variant={filter === "maintenance" ? "default" : "outline"}
            onClick={() => {
              setSearchParams({ filter: "maintenance" });
              setSearchQuery("");
            }}
            className={filter === "maintenance" ? "bg-orange-500 text-white hover:bg-orange-600" : ""}
          >
            Maintenance
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
            placeholder="Search vehicles..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Vehicles</CardTitle>
          <CardDescription>Manage your fleet vehicles</CardDescription>
        </CardHeader>
        <CardContent>
          {filteredVehicles.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {searchQuery ? "No vehicles match your search" : "No vehicles found"}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vehicle #</TableHead>
                  <TableHead>Make/Model</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead>VIN</TableHead>
                  <TableHead>License Plate</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredVehicles.map((vehicle) => (
                  <TableRow key={vehicle.id}>
                    <TableCell className="font-medium">{vehicle.vehicle_number}</TableCell>
                    <TableCell>{vehicle.make} {vehicle.model}</TableCell>
                    <TableCell>{vehicle.year}</TableCell>
                    <TableCell>{vehicle.vin}</TableCell>
                    <TableCell>{vehicle.license_plate}</TableCell>
                    <TableCell>
                      <Badge
                        className={
                          vehicle.status === "active"
                            ? "bg-green-600 hover:bg-green-700"
                            : vehicle.status === "maintenance"
                            ? "bg-orange-500 hover:bg-orange-600"
                            : "bg-gray-500 hover:bg-gray-600"
                        }
                      >
                        {vehicle.status.charAt(0).toUpperCase() + vehicle.status.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="icon" variant="ghost" className="h-8 w-8">
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
