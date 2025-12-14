import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { Search, Plus, Edit, Trash2, Truck, MapPin, DollarSign, Download, X, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { AddCustomerDialog } from "@/components/AddCustomerDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
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
  carrier_id: string | null;
  rate: number | null;
  total_revenue: number | null;
  estimated_miles: number | null;
  cargo_weight: number | null;
  cargo_description: string | null;
  customer_id: string | null;
  broker_name: string | null;
  reference_number: string | null;
  created_at: string;
  vehicle?: {
    vehicle_number: string | null;
  };
  driver?: {
    personal_info: any;
  };
  carrier?: {
    name: string | null;
  };
}

export default function LoadsTab() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = searchParams.get("filter") || "all";
  const [loads, setLoads] = useState<Load[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedLoadIds, setSelectedLoadIds] = useState<string[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const ROWS_PER_PAGE = 50;
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
    customer_id: "",
  });

  useEffect(() => {
    loadData();
    loadDriversAndVehicles();
  }, [filter]);

  const loadDriversAndVehicles = async () => {
    try {
      const [driversResult, vehiclesResult, customersResult] = await Promise.all([
        supabase.from("applications" as any).select("id, personal_info").eq("driver_status", "active"),
        supabase.from("vehicles" as any).select("id, vehicle_number").eq("status", "active"),
        supabase.from("customers" as any).select("id, name, contact_name").eq("status", "active"),
      ]);
      
      if (driversResult.data) setDrivers(driversResult.data);
      if (vehiclesResult.data) setVehicles(vehiclesResult.data);
      if (customersResult.data) setCustomers(customersResult.data);
    } catch (error) {
      console.error("Error loading drivers/vehicles/customers:", error);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("loads" as any)
        .select(`
          *,
          vehicle:vehicles!assigned_vehicle_id(vehicle_number),
          driver:applications!assigned_driver_id(personal_info),
          carrier:carriers!carrier_id(name)
        `);
      
      // Only filter by status if not "all"
      if (filter !== "all") {
        query = query.eq("status", filter);
      }
      
      const { data, error } = await query.order("created_at", { ascending: false });

      if (error) {
        toast.error("Error loading loads");
        console.error(error);
        return;
      }
      setLoads((data as any) || []);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (loadId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from("loads" as any)
        .update({ status: newStatus })
        .eq("id", loadId);

      if (error) throw error;
      toast.success("Status updated successfully");
      loadData();
    } catch (error) {
      console.error("Error updating status:", error);
      toast.error("Failed to update status");
    }
  };

  const toggleSelectAll = () => {
    if (selectedLoadIds.length === filteredLoads.length) {
      setSelectedLoadIds([]);
    } else {
      setSelectedLoadIds(filteredLoads.map(load => load.id));
    }
  };

  const toggleSelectLoad = (loadId: string) => {
    setSelectedLoadIds(prev => 
      prev.includes(loadId) 
        ? prev.filter(id => id !== loadId)
        : [...prev, loadId]
    );
  };

  const handleBulkStatusUpdate = async (newStatus: string) => {
    try {
      const { error } = await supabase
        .from("loads" as any)
        .update({ status: newStatus })
        .in("id", selectedLoadIds);

      if (error) throw error;
      toast.success(`Updated ${selectedLoadIds.length} load(s) to ${newStatus}`);
      setSelectedLoadIds([]);
      loadData();
    } catch (error) {
      console.error("Error updating loads:", error);
      toast.error("Failed to update loads");
    }
  };

  const handleBulkAssignment = async (field: 'assigned_driver_id' | 'assigned_vehicle_id', value: string) => {
    try {
      const { error } = await supabase
        .from("loads" as any)
        .update({ [field]: value })
        .in("id", selectedLoadIds);

      if (error) throw error;
      toast.success(`Assigned ${field === 'assigned_driver_id' ? 'driver' : 'vehicle'} to ${selectedLoadIds.length} load(s)`);
      setSelectedLoadIds([]);
      loadData();
    } catch (error) {
      console.error("Error assigning:", error);
      toast.error("Failed to assign");
    }
  };

  const handleBulkExport = () => {
    const selectedLoads = loads.filter(load => selectedLoadIds.includes(load.id));
    
    const csvHeaders = [
      "Load Number", "Status", "Pickup City", "Pickup State", "Pickup Date",
      "Delivery City", "Delivery State", "Delivery Date", "Rate", "Miles", "Broker"
    ].join(",");
    
    const csvRows = selectedLoads.map(load => [
      load.load_number,
      load.status,
      load.pickup_city || "",
      load.pickup_state || "",
      load.pickup_date ? format(new Date(load.pickup_date), "MM/dd/yyyy") : "",
      load.delivery_city || "",
      load.delivery_state || "",
      load.delivery_date ? format(new Date(load.delivery_date), "MM/dd/yyyy") : "",
      load.rate || 0,
      load.estimated_miles || 0,
      load.broker_name || ""
    ].join(",")).join("\n");
    
    const csv = `${csvHeaders}\n${csvRows}`;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `loads_export_${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    
    toast.success(`Exported ${selectedLoadIds.length} load(s)`);
  };

  const getStatusDisplay = (status: string) => {
    switch (status) {
      case "available":
        return { label: "Available", color: "bg-transparent border-sky-400 text-sky-500" };
      case "booked":
        return { label: "Booked", color: "bg-transparent border-indigo-400 text-indigo-500" };
      case "dispatched":
        return { label: "Dispatched", color: "bg-transparent border-blue-500 text-blue-600" };
      case "at_pickup":
        return { label: "At Pickup", color: "bg-transparent border-amber-400 text-amber-500" };
      case "in_transit":
        return { label: "In Transit", color: "bg-transparent border-purple-400 text-purple-500" };
      case "at_delivery":
        return { label: "At Delivery", color: "bg-transparent border-teal-400 text-teal-500" };
      case "delivered":
        return { label: "Delivered", color: "bg-transparent border-emerald-500 text-emerald-600" };
      case "completed":
        return { label: "Completed", color: "bg-transparent border-emerald-700 text-emerald-700" };
      case "cancelled":
        return { label: "Cancelled", color: "bg-transparent border-red-500 text-red-600" };
      case "tonu":
        return { label: "TONU", color: "bg-transparent border-orange-500 text-orange-600" };
      default:
        return { label: status, color: "bg-transparent border-muted text-muted-foreground" };
    }
  };

  const handleAddLoad = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase
        .from("loads" as any)
        .insert({
          ...formData,
          status: "available",
          cargo_weight: formData.cargo_weight ? parseFloat(formData.cargo_weight) : null,
          estimated_miles: formData.estimated_miles ? parseFloat(formData.estimated_miles) : null,
          rate: formData.rate ? parseFloat(formData.rate) : null,
          customer_id: formData.customer_id || null,
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
        customer_id: "",
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

  // Calculate status counts
  const statusCounts = {
    all: loads.length,
    available: loads.filter(l => l.status === 'available').length,
    booked: loads.filter(l => l.status === 'booked').length,
    dispatched: loads.filter(l => l.status === 'dispatched').length,
    at_pickup: loads.filter(l => l.status === 'at_pickup').length,
    in_transit: loads.filter(l => l.status === 'in_transit').length,
    at_delivery: loads.filter(l => l.status === 'at_delivery').length,
    delivered: loads.filter(l => l.status === 'delivered').length,
    completed: loads.filter(l => l.status === 'completed').length,
    cancelled: loads.filter(l => l.status === 'cancelled').length,
    tonu: loads.filter(l => l.status === 'tonu').length,
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

  // Pagination
  const totalPages = Math.ceil(filteredLoads.length / ROWS_PER_PAGE);
  const paginatedLoads = filteredLoads.slice(
    (currentPage - 1) * ROWS_PER_PAGE,
    currentPage * ROWS_PER_PAGE
  );

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      available: "bg-sky-500 hover:bg-sky-600",
      booked: "bg-indigo-500 hover:bg-indigo-600",
      dispatched: "bg-blue-500 hover:bg-blue-600",
      at_pickup: "bg-amber-500 hover:bg-amber-600",
      in_transit: "bg-purple-500 hover:bg-purple-600",
      at_delivery: "bg-teal-500 hover:bg-teal-600",
      delivered: "bg-green-600 hover:bg-green-700",
      completed: "bg-green-800 hover:bg-green-900",
      cancelled: "bg-red-500 hover:bg-red-600",
      tonu: "bg-orange-500 hover:bg-orange-600",
    };
    return colors[status] || "bg-gray-500 hover:bg-gray-600";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Loading loads...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 px-3 md:px-0">
      {/* Header - Mobile optimized */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <h2 className="text-xl sm:text-2xl font-bold">Booked Loads</h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 w-full sm:w-auto h-11 sm:h-10 rounded-xl">
              <Plus className="h-4 w-4" />
              Create Load
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto mx-4 sm:mx-auto rounded-2xl">
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
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="customer_id">Customer (Who Pays)</Label>
                    <div className="flex gap-2">
                      <Select value={formData.customer_id} onValueChange={(value) => setFormData({ ...formData, customer_id: value })}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select customer" />
                        </SelectTrigger>
                        <SelectContent className="bg-background z-50">
                          {customers.map((customer) => (
                            <SelectItem key={customer.id} value={customer.id}>
                              {customer.name} {customer.contact_name ? `(${customer.contact_name})` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <AddCustomerDialog onCustomerAdded={async (customerId) => {
                        await loadDriversAndVehicles();
                        setFormData({ ...formData, customer_id: customerId });
                      }} />
                    </div>
                  </div>
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

      {selectedLoadIds.length > 0 && (
        <Card className="mb-4 border-primary/50 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between">
              <div className="flex items-center gap-3">
                <Badge variant="secondary" className="text-sm">
                  {selectedLoadIds.length} selected
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedLoadIds([])}
                  className="h-7"
                >
                  <X className="h-4 w-4 mr-1" />
                  Clear
                </Button>
              </div>
              
              <div className="flex flex-wrap gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Check className="h-4 w-4 mr-2" />
                      Update Status
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => handleBulkStatusUpdate("available")}>
                      Available
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleBulkStatusUpdate("booked")}>
                      Booked
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleBulkStatusUpdate("dispatched")}>
                      Dispatched
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleBulkStatusUpdate("at_pickup")}>
                      At Pickup
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleBulkStatusUpdate("in_transit")}>
                      In Transit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleBulkStatusUpdate("at_delivery")}>
                      At Delivery
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleBulkStatusUpdate("delivered")}>
                      Delivered
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleBulkStatusUpdate("completed")}>
                      Completed
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => handleBulkStatusUpdate("cancelled")}>
                      Cancelled
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleBulkStatusUpdate("tonu")}>
                      TONU
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Truck className="h-4 w-4 mr-2" />
                      Assign Driver
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {drivers.length === 0 ? (
                      <DropdownMenuItem disabled>No active drivers</DropdownMenuItem>
                    ) : (
                      drivers.map((driver) => (
                        <DropdownMenuItem 
                          key={driver.id}
                          onClick={() => handleBulkAssignment("assigned_driver_id", driver.id)}
                        >
                          {driver.personal_info?.firstName} {driver.personal_info?.lastName}
                        </DropdownMenuItem>
                      ))
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Truck className="h-4 w-4 mr-2" />
                      Assign Vehicle
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {vehicles.length === 0 ? (
                      <DropdownMenuItem disabled>No active vehicles</DropdownMenuItem>
                    ) : (
                      vehicles.map((vehicle) => (
                        <DropdownMenuItem 
                          key={vehicle.id}
                          onClick={() => handleBulkAssignment("assigned_vehicle_id", vehicle.id)}
                        >
                          {vehicle.vehicle_number}
                        </DropdownMenuItem>
                      ))
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button variant="outline" size="sm" onClick={handleBulkExport}>
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex items-center gap-0 overflow-x-auto pb-1">
          {[
            { key: "all", label: "All", count: statusCounts.all, activeClass: "btn-glossy-dark", badgeClass: "badge-inset" },
            { key: "available", label: "Available", count: statusCounts.available, activeClass: "btn-glossy-primary", badgeClass: "badge-inset-primary" },
            { key: "booked", label: "Booked", count: statusCounts.booked, activeClass: "btn-glossy-success", badgeClass: "badge-inset-success" },
            { key: "dispatched", label: "Dispatched", count: statusCounts.dispatched, activeClass: "btn-glossy-primary", badgeClass: "badge-inset-primary" },
            { key: "at_pickup", label: "Pickup", count: statusCounts.at_pickup, activeClass: "btn-glossy-warning", badgeClass: "badge-inset-warning" },
            { key: "in_transit", label: "Transit", count: statusCounts.in_transit, activeClass: "btn-glossy-primary", badgeClass: "badge-inset-primary" },
            { key: "at_delivery", label: "Delivery", count: statusCounts.at_delivery, activeClass: "btn-glossy-primary", badgeClass: "badge-inset-primary" },
            { key: "delivered", label: "Delivered", count: statusCounts.delivered, activeClass: "btn-glossy-success", badgeClass: "badge-inset-success" },
            { key: "completed", label: "Completed", count: statusCounts.completed, activeClass: "btn-glossy-success", badgeClass: "badge-inset-success" },
            { key: "cancelled", label: "Cancelled", count: statusCounts.cancelled, activeClass: "btn-glossy-danger", badgeClass: "badge-inset-danger" },
            { key: "tonu", label: "TONU", count: statusCounts.tonu, activeClass: "btn-glossy-warning", badgeClass: "badge-inset-warning" },
          ].map((status) => (
            <Button
              key={status.key}
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchParams({ filter: status.key });
                setSearchQuery("");
              }}
              className={`h-[30px] px-3 text-[13px] font-medium gap-1 rounded-none first:rounded-l-full last:rounded-r-full border-0 ${
                filter === status.key 
                  ? `${status.activeClass} text-white` 
                  : 'btn-glossy text-gray-700'
              }`}
            >
              {status.label}
              <span className={`${filter === status.key ? status.badgeClass : 'badge-inset'} text-[10px] h-5`}>{status.count}</span>
            </Button>
          ))}
        </div>

        <div className="relative w-full sm:w-56">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search loads..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-7 text-xs"
          />
        </div>
      </div>

      <Card className="flex flex-col" style={{ height: 'calc(100vh - 280px)' }}>
        <CardContent className="p-0 flex flex-col flex-1 overflow-hidden">
          {filteredLoads.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {searchQuery ? "No loads match your search" : `No ${filter === "all" ? "" : filter} loads found`}
            </p>
          ) : (
            <>
              <div className="flex-1 overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-12 py-2 px-2">
                        <Checkbox 
                          checked={selectedLoadIds.length === paginatedLoads.length && paginatedLoads.length > 0}
                          onCheckedChange={toggleSelectAll}
                        />
                      </TableHead>
                      <TableHead className="text-primary text-xs py-2 px-2">Status</TableHead>
                      <TableHead className="text-primary text-xs py-2 px-2">
                        <div>Truck Id</div>
                        <div>Driver</div>
                      </TableHead>
                      <TableHead className="text-primary text-xs py-2 px-2">
                        <div>Carrier</div>
                        <div>Customer</div>
                      </TableHead>
                      <TableHead className="text-primary text-xs py-2 px-2">
                        <div>Our Load ID</div>
                        <div>Customer Load</div>
                      </TableHead>
                      <TableHead className="text-primary text-xs py-2 px-2">
                        <div>Origin</div>
                        <div>Destination</div>
                      </TableHead>
                      <TableHead className="text-primary text-xs py-2 px-2">
                        <div>Pickup</div>
                        <div>Delivery</div>
                      </TableHead>
                      <TableHead className="text-primary text-xs py-2 px-2">
                        <div>DH</div>
                        <div>Loaded</div>
                      </TableHead>
                      <TableHead className="text-primary text-xs py-2 px-2">
                        <div>Loaded $/Mi</div>
                        <div>Total $/Mi</div>
                      </TableHead>
                      <TableHead className="text-primary text-xs py-2 px-2">Payload</TableHead>
                      <TableHead className="text-primary text-xs py-2 px-2">
                        <div>Load Owner</div>
                        <div>Dispatcher</div>
                      </TableHead>
                      <TableHead className="text-primary text-xs py-2 px-2">RC</TableHead>
                      <TableHead className="text-primary text-xs py-2 px-2">BOL</TableHead>
                    </TableRow>
                  </TableHeader>
                   <TableBody>
                    {paginatedLoads.map((load) => (
                      <TableRow 
                        key={load.id} 
                        className="cursor-pointer hover:bg-muted/40 border-b border-border/50 transition-colors" 
                        onClick={() => viewLoadDetail(load.id)}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()} className="py-2 px-2">
                          <Checkbox 
                            className="h-4 w-4"
                            checked={selectedLoadIds.includes(load.id)}
                            onCheckedChange={() => toggleSelectLoad(load.id)}
                          />
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()} className="py-2 px-2">
                          <Select
                            value={load.status}
                            onValueChange={(value) => handleStatusChange(load.id, value)}
                          >
                            <SelectTrigger 
                              className={`h-7 text-xs font-semibold border rounded-md shadow-none [text-shadow:none] [background:none] ${getStatusDisplay(load.status).color}`}
                            >
                              <SelectValue>
                                {getStatusDisplay(load.status).label}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="available">Available</SelectItem>
                              <SelectItem value="booked">Booked</SelectItem>
                              <SelectItem value="dispatched">Dispatched</SelectItem>
                              <SelectItem value="at_pickup">At Pickup</SelectItem>
                              <SelectItem value="in_transit">In Transit</SelectItem>
                              <SelectItem value="at_delivery">At Delivery</SelectItem>
                              <SelectItem value="delivered">Delivered</SelectItem>
                              <SelectItem value="completed">Completed</SelectItem>
                              <SelectItem value="cancelled">Cancelled</SelectItem>
                              <SelectItem value="tonu">TONU</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="py-2 px-2">
                          <div className="font-semibold text-xs text-foreground">
                            {load.vehicle?.vehicle_number || "N/A"}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {load.driver?.personal_info?.firstName && load.driver?.personal_info?.lastName
                              ? `${load.driver.personal_info.firstName} ${load.driver.personal_info.lastName}`
                              : "-"}
                          </div>
                        </TableCell>
                        <TableCell className="py-2 px-2">
                          <div className="text-xs text-foreground">{load.carrier?.name || "N/A"}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">-</div>
                        </TableCell>
                        <TableCell className="py-2 px-2">
                          <div className="font-medium text-xs text-foreground">{load.load_number}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{load.reference_number || "-"}</div>
                        </TableCell>
                        <TableCell className="py-2 px-2">
                          <div className="text-xs text-foreground">{load.pickup_city}, {load.pickup_state}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{load.delivery_city}, {load.delivery_state}</div>
                        </TableCell>
                        <TableCell className="py-2 px-2">
                          <div className="text-xs whitespace-nowrap text-foreground">
                            {load.pickup_date ? format(new Date(load.pickup_date), "MM/dd/yy HH:mm") : "N/A"}
                          </div>
                          <div className="text-xs whitespace-nowrap text-foreground mt-0.5">
                            {load.delivery_date ? format(new Date(load.delivery_date), "MM/dd/yy HH:mm") : "N/A"}
                          </div>
                        </TableCell>
                        <TableCell className="py-2 px-2">
                          <div className="text-xs text-foreground">0</div>
                          <div className="text-xs text-foreground mt-0.5">{load.estimated_miles || "N/A"}</div>
                        </TableCell>
                        <TableCell className="py-2 px-2">
                          <div className="text-xs text-foreground">
                            {load.rate && load.estimated_miles 
                              ? `$${(load.rate / load.estimated_miles).toFixed(2)}`
                              : "N/A"}
                          </div>
                          <div className="text-xs text-foreground mt-0.5">
                            {load.rate && load.estimated_miles 
                              ? `$${(load.rate / load.estimated_miles).toFixed(2)}`
                              : "N/A"}
                          </div>
                        </TableCell>
                        <TableCell className="py-2 px-2">
                          <div className="text-xs font-semibold text-foreground">
                            {load.rate ? `$${load.rate.toFixed(2)}` : "N/A"}
                          </div>
                        </TableCell>
                        <TableCell className="py-2 px-2">
                          <div className="text-xs text-muted-foreground">-</div>
                          <div className="text-xs text-muted-foreground mt-0.5">-</div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground py-2 px-2">N/A</TableCell>
                        <TableCell className="text-xs text-muted-foreground py-2 px-2">N/A</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {/* Always visible pagination */}
              <div className="flex items-center justify-between px-4 py-3 border-t bg-background flex-shrink-0">
                <span className="text-sm text-muted-foreground">
                  Showing {((currentPage - 1) * ROWS_PER_PAGE) + 1}-{Math.min(currentPage * ROWS_PER_PAGE, filteredLoads.length)} of {filteredLoads.length}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="h-7 px-2"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm">Page {currentPage} of {Math.max(1, totalPages)}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                    className="h-7 px-2"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
