import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Search, Wrench, Calendar } from "lucide-react";
import { format } from "date-fns";

export default function MaintenanceTab() {
  const [records, setRecords] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newRecord, setNewRecord] = useState({
    asset_id: "",
    maintenance_type: "PM",
    service_date: "",
    odometer: "",
    description: "",
    cost: "",
    vendor: "",
    invoice_number: "",
    next_service_date: "",
    next_service_odometer: "",
    downtime_hours: "",
    status: "completed",
    performed_by: "",
    notes: "",
  });

  useEffect(() => {
    loadMaintenanceRecords();
    loadVehicles();
  }, []);

  const loadMaintenanceRecords = async () => {
    try {
      const { data, error } = await supabase
        .from("maintenance_records")
        .select("*, vehicles(vehicle_number, make, model)")
        .order("service_date", { ascending: false });

      if (error) throw error;
      setRecords(data || []);
    } catch (error: any) {
      toast.error("Failed to load maintenance records");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const loadVehicles = async () => {
    try {
      const { data, error } = await supabase
        .from("vehicles")
        .select("id, vehicle_number, make, model")
        .eq("status", "active")
        .order("vehicle_number");

      if (error) throw error;
      setVehicles(data || []);
    } catch (error: any) {
      console.error("Failed to load vehicles:", error);
    }
  };

  const handleAddRecord = async () => {
    try {
      const { error } = await supabase.from("maintenance_records").insert([{
        ...newRecord,
        cost: newRecord.cost ? parseFloat(newRecord.cost) : null,
        odometer: newRecord.odometer ? parseInt(newRecord.odometer) : null,
        next_service_odometer: newRecord.next_service_odometer ? parseInt(newRecord.next_service_odometer) : null,
        downtime_hours: newRecord.downtime_hours ? parseFloat(newRecord.downtime_hours) : null,
      }]);
      
      if (error) throw error;
      toast.success("Maintenance record added successfully");
      setDialogOpen(false);
      setNewRecord({
        asset_id: "",
        maintenance_type: "PM",
        service_date: "",
        odometer: "",
        description: "",
        cost: "",
        vendor: "",
        invoice_number: "",
        next_service_date: "",
        next_service_odometer: "",
        downtime_hours: "",
        status: "completed",
        performed_by: "",
        notes: "",
      });
      loadMaintenanceRecords();
    } catch (error: any) {
      toast.error("Failed to add maintenance record");
      console.error(error);
    }
  };

  const filteredRecords = records.filter((record) =>
    record.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    record.maintenance_type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    record.vendor?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    record.vehicles?.vehicle_number?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed": return "bg-green-500";
      case "in_progress": return "bg-blue-500";
      case "scheduled": return "bg-yellow-500";
      case "cancelled": return "bg-gray-500";
      default: return "bg-gray-500";
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Wrench className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Maintenance Records</h1>
            <p className="text-muted-foreground">Track vehicle maintenance and repairs</p>
          </div>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Add Record</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add Maintenance Record</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Vehicle *</Label>
                  <Select value={newRecord.asset_id} onValueChange={(value) => setNewRecord({ ...newRecord, asset_id: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select vehicle" />
                    </SelectTrigger>
                    <SelectContent>
                      {vehicles.map((vehicle) => (
                        <SelectItem key={vehicle.id} value={vehicle.id}>
                          {vehicle.vehicle_number} - {vehicle.make} {vehicle.model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label>Type *</Label>
                  <Select value={newRecord.maintenance_type} onValueChange={(value) => setNewRecord({ ...newRecord, maintenance_type: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PM">PM Service</SelectItem>
                      <SelectItem value="repair">Repair</SelectItem>
                      <SelectItem value="inspection">Inspection</SelectItem>
                      <SelectItem value="tire">Tire</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Service Date *</Label>
                  <Input
                    type="date"
                    value={newRecord.service_date}
                    onChange={(e) => setNewRecord({ ...newRecord, service_date: e.target.value })}
                  />
                </div>
                
                <div>
                  <Label>Odometer</Label>
                  <Input
                    type="number"
                    value={newRecord.odometer}
                    onChange={(e) => setNewRecord({ ...newRecord, odometer: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <Label>Description *</Label>
                <Textarea
                  value={newRecord.description}
                  onChange={(e) => setNewRecord({ ...newRecord, description: e.target.value })}
                  placeholder="Describe the maintenance work..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Cost</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={newRecord.cost}
                    onChange={(e) => setNewRecord({ ...newRecord, cost: e.target.value })}
                  />
                </div>
                
                <div>
                  <Label>Downtime (hours)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={newRecord.downtime_hours}
                    onChange={(e) => setNewRecord({ ...newRecord, downtime_hours: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Vendor</Label>
                  <Input
                    value={newRecord.vendor}
                    onChange={(e) => setNewRecord({ ...newRecord, vendor: e.target.value })}
                  />
                </div>
                
                <div>
                  <Label>Invoice Number</Label>
                  <Input
                    value={newRecord.invoice_number}
                    onChange={(e) => setNewRecord({ ...newRecord, invoice_number: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Next Service Date</Label>
                  <Input
                    type="date"
                    value={newRecord.next_service_date}
                    onChange={(e) => setNewRecord({ ...newRecord, next_service_date: e.target.value })}
                  />
                </div>
                
                <div>
                  <Label>Next Service Odometer</Label>
                  <Input
                    type="number"
                    value={newRecord.next_service_odometer}
                    onChange={(e) => setNewRecord({ ...newRecord, next_service_odometer: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <Label>Performed By</Label>
                <Input
                  value={newRecord.performed_by}
                  onChange={(e) => setNewRecord({ ...newRecord, performed_by: e.target.value })}
                />
              </div>

              <div>
                <Label>Notes</Label>
                <Textarea
                  value={newRecord.notes}
                  onChange={(e) => setNewRecord({ ...newRecord, notes: e.target.value })}
                />
              </div>
            </div>
            <Button onClick={handleAddRecord} className="w-full">Add Record</Button>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search maintenance records..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="space-y-3">
        {filteredRecords.map((record) => (
          <Card key={record.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-lg">
                    {record.vehicles?.vehicle_number} - {record.maintenance_type}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {record.vehicles?.make} {record.vehicles?.model}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={getStatusColor(record.status)}>
                    {record.status}
                  </Badge>
                  {record.cost && (
                    <Badge variant="outline">${record.cost.toLocaleString()}</Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm">{record.description}</p>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Service Date</p>
                  <p className="font-medium flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {format(new Date(record.service_date), "MMM d, yyyy")}
                  </p>
                </div>
                
                {record.odometer && (
                  <div>
                    <p className="text-muted-foreground">Odometer</p>
                    <p className="font-medium">{record.odometer.toLocaleString()} mi</p>
                  </div>
                )}
                
                {record.vendor && (
                  <div>
                    <p className="text-muted-foreground">Vendor</p>
                    <p className="font-medium">{record.vendor}</p>
                  </div>
                )}
                
                {record.downtime_hours && (
                  <div>
                    <p className="text-muted-foreground">Downtime</p>
                    <p className="font-medium">{record.downtime_hours} hrs</p>
                  </div>
                )}
              </div>

              {record.next_service_date && (
                <div className="text-sm">
                  <p className="text-muted-foreground">
                    Next service due: {format(new Date(record.next_service_date), "MMM d, yyyy")}
                    {record.next_service_odometer && ` at ${record.next_service_odometer.toLocaleString()} mi`}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredRecords.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No maintenance records found
        </div>
      )}
    </div>
  );
}
