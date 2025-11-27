import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { format } from "date-fns";
import { ArrowLeft, MapPin, Truck, User, FileText, DollarSign, Clock, Navigation, Upload, X } from "lucide-react";
import { Separator } from "@/components/ui/separator";

interface Driver {
  id: string;
  personal_info: any;
}

interface Vehicle {
  id: string;
  vehicle_number: string;
  make: string;
  model: string;
}

interface LoadDocument {
  id: string;
  document_type: string;
  file_name: string;
  file_url: string;
  uploaded_at: string;
}

export default function LoadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [load, setLoad] = useState<any>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [documents, setDocuments] = useState<LoadDocument[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (id) {
      loadData();
    }
  }, [id]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load the specific load
      const { data: loadData, error: loadError } = await supabase
        .from("loads" as any)
        .select("*")
        .eq("id", id)
        .single();

      if (loadError) throw loadError;
      setLoad(loadData);

      // Load available drivers
      const { data: driversData } = await supabase
        .from("applications" as any)
        .select("id, personal_info")
        .eq("driver_status", "active");
      setDrivers((driversData as any) || []);

      // Load available vehicles
      const { data: vehiclesData } = await supabase
        .from("vehicles" as any)
        .select("id, vehicle_number, make, model")
        .eq("status", "active");
      setVehicles((vehiclesData as any) || []);

      // Load documents
      const { data: docsData } = await supabase
        .from("load_documents" as any)
        .select("*")
        .eq("load_id", id)
        .order("uploaded_at", { ascending: false });
      setDocuments((docsData as any) || []);
    } catch (error: any) {
      toast.error("Error loading load details");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("loads" as any)
        .update({
          ...load,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) throw error;
      toast.success("Load updated successfully");
    } catch (error: any) {
      toast.error("Failed to update load: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, docType: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      // Note: This requires storage bucket setup. For now, we'll simulate the upload.
      // In production, upload to Supabase Storage and store the URL
      const { error } = await supabase
        .from("load_documents" as any)
        .insert({
          load_id: id,
          document_type: docType,
          file_name: file.name,
          file_url: `uploads/${file.name}`, // Placeholder
          file_size: file.size,
        });

      if (error) throw error;
      toast.success("Document uploaded successfully");
      loadData();
    } catch (error: any) {
      toast.error("Failed to upload document: " + error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    try {
      const { error } = await supabase
        .from("load_documents" as any)
        .delete()
        .eq("id", docId);

      if (error) throw error;
      toast.success("Document deleted successfully");
      loadData();
    } catch (error: any) {
      toast.error("Failed to delete document: " + error.message);
    }
  };

  const getStatusBadge = (status: string) => {
    const configs: Record<string, { label: string; className: string }> = {
      pending: { label: "Pending", className: "bg-yellow-500 hover:bg-yellow-600" },
      dispatched: { label: "Dispatched", className: "bg-blue-500 hover:bg-blue-600" },
      in_transit: { label: "In Transit", className: "bg-purple-500 hover:bg-purple-600" },
      delivered: { label: "Delivered", className: "bg-green-600 hover:bg-green-700" },
      completed: { label: "Completed", className: "bg-green-800 hover:bg-green-900" },
      cancelled: { label: "Cancelled", className: "bg-red-500 hover:bg-red-600" },
    };
    const config = configs[status] || configs.pending;
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  if (!load) {
    return <div className="text-center py-8">Load not found</div>;
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" onClick={() => navigate("/dashboard/loads")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Load {load.load_number}</h1>
              <p className="text-muted-foreground">View and manage load details</p>
            </div>
          </div>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content - Left Side */}
          <div className="lg:col-span-2 space-y-6">
            {/* Status and Assignment */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Truck className="h-5 w-5" />
                  Load Status & Assignment
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Status</Label>
                    <Select value={load.status} onValueChange={(value) => setLoad({ ...load, status: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="dispatched">Dispatched</SelectItem>
                        <SelectItem value="in_transit">In Transit</SelectItem>
                        <SelectItem value="delivered">Delivered</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Load Type</Label>
                    <Select value={load.load_type || ""} onValueChange={(value) => setLoad({ ...load, load_type: value })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="internal">Internal</SelectItem>
                        <SelectItem value="broker">Broker</SelectItem>
                        <SelectItem value="load_board">Load Board</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Separator />

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="driver">Assigned Driver</Label>
                    <Select 
                      value={load.assigned_driver_id || ""} 
                      onValueChange={(value) => setLoad({ ...load, assigned_driver_id: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select driver" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Unassigned</SelectItem>
                        {drivers.map((driver) => (
                          <SelectItem key={driver.id} value={driver.id}>
                            {driver.personal_info?.firstName} {driver.personal_info?.lastName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="vehicle">Assigned Vehicle</Label>
                    <Select 
                      value={load.assigned_vehicle_id || ""} 
                      onValueChange={(value) => setLoad({ ...load, assigned_vehicle_id: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select vehicle" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Unassigned</SelectItem>
                        {vehicles.map((vehicle) => (
                          <SelectItem key={vehicle.id} value={vehicle.id}>
                            {vehicle.vehicle_number} - {vehicle.make} {vehicle.model}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Route Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Route Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Pickup */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase">Pickup Location</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <Label>Location</Label>
                      <Input 
                        value={load.pickup_location || ""} 
                        onChange={(e) => setLoad({ ...load, pickup_location: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>City</Label>
                      <Input 
                        value={load.pickup_city || ""} 
                        onChange={(e) => setLoad({ ...load, pickup_city: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>State</Label>
                      <Input 
                        value={load.pickup_state || ""} 
                        onChange={(e) => setLoad({ ...load, pickup_state: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Pickup Date/Time</Label>
                      <Input 
                        type="datetime-local"
                        value={load.pickup_date ? format(new Date(load.pickup_date), "yyyy-MM-dd'T'HH:mm") : ""} 
                        onChange={(e) => setLoad({ ...load, pickup_date: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Actual Pickup</Label>
                      <Input 
                        type="datetime-local"
                        value={load.actual_pickup_date ? format(new Date(load.actual_pickup_date), "yyyy-MM-dd'T'HH:mm") : ""} 
                        onChange={(e) => setLoad({ ...load, actual_pickup_date: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Delivery */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase">Delivery Location</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <Label>Location</Label>
                      <Input 
                        value={load.delivery_location || ""} 
                        onChange={(e) => setLoad({ ...load, delivery_location: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>City</Label>
                      <Input 
                        value={load.delivery_city || ""} 
                        onChange={(e) => setLoad({ ...load, delivery_city: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>State</Label>
                      <Input 
                        value={load.delivery_state || ""} 
                        onChange={(e) => setLoad({ ...load, delivery_state: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Delivery Date/Time</Label>
                      <Input 
                        type="datetime-local"
                        value={load.delivery_date ? format(new Date(load.delivery_date), "yyyy-MM-dd'T'HH:mm") : ""} 
                        onChange={(e) => setLoad({ ...load, delivery_date: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Actual Delivery</Label>
                      <Input 
                        type="datetime-local"
                        value={load.actual_delivery_date ? format(new Date(load.actual_delivery_date), "yyyy-MM-dd'T'HH:mm") : ""} 
                        onChange={(e) => setLoad({ ...load, actual_delivery_date: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Current Location */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase flex items-center gap-2">
                    <Navigation className="h-4 w-4" />
                    Real-Time Location
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <Label>Current Location</Label>
                      <Input 
                        value={load.current_location || ""} 
                        onChange={(e) => setLoad({ ...load, current_location: e.target.value })}
                        placeholder="Enter current location or coordinates"
                      />
                    </div>
                    <div>
                      <Label>ETA</Label>
                      <Input 
                        type="datetime-local"
                        value={load.eta ? format(new Date(load.eta), "yyyy-MM-dd'T'HH:mm") : ""} 
                        onChange={(e) => setLoad({ ...load, eta: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Cargo Details */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Truck className="h-5 w-5" />
                  Cargo Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Cargo Description</Label>
                  <Textarea 
                    value={load.cargo_description || ""} 
                    onChange={(e) => setLoad({ ...load, cargo_description: e.target.value })}
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>Weight (lbs)</Label>
                    <Input 
                      type="number"
                      value={load.cargo_weight || ""} 
                      onChange={(e) => setLoad({ ...load, cargo_weight: parseFloat(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label>Pieces</Label>
                    <Input 
                      type="number"
                      value={load.cargo_pieces || ""} 
                      onChange={(e) => setLoad({ ...load, cargo_pieces: parseInt(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label>Commodity Type</Label>
                    <Input 
                      value={load.commodity_type || ""} 
                      onChange={(e) => setLoad({ ...load, commodity_type: e.target.value })}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar - Right Side */}
          <div className="space-y-6">
            {/* Quick Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Quick Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Status</span>
                  {getStatusBadge(load.status)}
                </div>
                <Separator />
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Created</span>
                  <span className="text-sm font-medium">{format(new Date(load.created_at), "MMM d, yyyy")}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Estimated Miles</span>
                  <span className="text-sm font-medium">{load.estimated_miles || "—"}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Actual Miles</span>
                  <span className="text-sm font-medium">{load.actual_miles || "—"}</span>
                </div>
              </CardContent>
            </Card>

            {/* Financial */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <DollarSign className="h-4 w-4" />
                  Financial
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Rate</Label>
                  <Input 
                    type="number"
                    step="0.01"
                    value={load.rate || ""} 
                    onChange={(e) => setLoad({ ...load, rate: parseFloat(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Total Revenue</Label>
                  <Input 
                    type="number"
                    step="0.01"
                    value={load.total_revenue || ""} 
                    onChange={(e) => setLoad({ ...load, total_revenue: parseFloat(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Broker Fee</Label>
                  <Input 
                    type="number"
                    step="0.01"
                    value={load.broker_fee || ""} 
                    onChange={(e) => setLoad({ ...load, broker_fee: parseFloat(e.target.value) })}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Documents */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <FileText className="h-4 w-4" />
                  Documents
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="bol-upload">Bill of Lading</Label>
                  <Input 
                    id="bol-upload"
                    type="file"
                    onChange={(e) => handleFileUpload(e, "BOL")}
                    disabled={uploading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pod-upload">Proof of Delivery</Label>
                  <Input 
                    id="pod-upload"
                    type="file"
                    onChange={(e) => handleFileUpload(e, "POD")}
                    disabled={uploading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="other-upload">Other Documents</Label>
                  <Input 
                    id="other-upload"
                    type="file"
                    onChange={(e) => handleFileUpload(e, "Other")}
                    disabled={uploading}
                  />
                </div>

                {documents.length > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold">Uploaded Documents</h4>
                      {documents.map((doc) => (
                        <div key={doc.id} className="flex items-center justify-between p-2 border rounded">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{doc.file_name}</p>
                            <p className="text-xs text-muted-foreground">{doc.document_type}</p>
                          </div>
                          <Button 
                            size="icon" 
                            variant="ghost"
                            onClick={() => handleDeleteDocument(doc.id)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
