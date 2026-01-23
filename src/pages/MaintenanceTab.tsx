import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTenantQuery } from "@/hooks/useTenantQuery";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { Plus, Search, Wrench, Calendar, AlertTriangle, Truck, RefreshCw, ExternalLink, ChevronDown, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import checkEngineIcon from '@/assets/check-engine-icon.png';
import { getDTCInfo, getDTCLookupUrl, getSeverityColor, parseDTCCode } from "@/lib/dtc-lookup";

interface VehicleBasic {
  id: string;
  vehicle_number: string;
  make: string | null;
  model: string | null;
}

interface VehicleWithFaults {
  id: string;
  vehicle_number: string;
  make: string | null;
  model: string | null;
  fault_codes: unknown;
  last_updated: string | null;
  formatted_address: string | null;
  odometer: number | null;
}

export default function MaintenanceTab() {
  const [searchParams] = useSearchParams();
  const vehicleIdFromUrl = searchParams.get('vehicle');
  const { query, tenantId, isReady } = useTenantQuery();
  const [records, setRecords] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<VehicleBasic[]>([]);
  const [allVehicles, setAllVehicles] = useState<VehicleWithFaults[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(vehicleIdFromUrl ? "faults" : "records");
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleWithFaults | null>(null);
  const [syncing, setSyncing] = useState(false);
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
    if (!isReady) return;
    loadMaintenanceRecords();
    loadVehicles();
    loadAllVehiclesWithFaults();
  }, [isReady, tenantId]);

  // Auto-select vehicle from URL parameter
  useEffect(() => {
    if (vehicleIdFromUrl && allVehicles.length > 0) {
      const vehicle = allVehicles.find(v => v.id === vehicleIdFromUrl);
      if (vehicle) {
        setSelectedVehicle(vehicle);
        setActiveTab("faults");
      }
    }
  }, [vehicleIdFromUrl, allVehicles]);

  const loadMaintenanceRecords = async () => {
    if (!isReady) return;
    try {
      const { data, error } = await query("maintenance_records")
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
    if (!isReady) return;
    try {
      const { data, error } = await query("vehicles")
        .select("id, vehicle_number, make, model")
        .eq("status", "active")
        .order("vehicle_number");

      if (error) throw error;
      setVehicles((data as unknown as VehicleBasic[]) || []);
    } catch (error: any) {
      console.error("Failed to load vehicles:", error);
    }
  };

  const loadAllVehiclesWithFaults = async () => {
    if (!isReady) return;
    try {
      const { data, error } = await query("vehicles")
        .select("id, vehicle_number, make, model, fault_codes, last_updated, formatted_address, odometer")
        .order("vehicle_number");

      if (error) throw error;
      setAllVehicles((data as unknown as VehicleWithFaults[]) || []);
    } catch (error: any) {
      console.error("Failed to load vehicles with faults:", error);
    }
  };

  const handleSyncSamsara = async () => {
    if (!tenantId) {
      toast.error("No tenant selected");
      return;
    }
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-vehicles-samsara', {
        body: { tenant_id: tenantId }
      });
      if (error) throw error;
      toast.success(data.message || "Vehicles synced successfully");
      await loadAllVehiclesWithFaults();
    } catch (error: any) {
      toast.error("Failed to sync: " + (error.message || "Unknown error"));
      console.error(error);
    } finally {
      setSyncing(false);
    }
  };

  const handleAddRecord = async () => {
    if (!tenantId) {
      toast.error("No tenant selected");
      return;
    }
    if (!isReady) {
      toast.error("Tenant context not ready");
      return;
    }
    try {
      // Use the query helper with withTenant for proper tenant scoping
      const { error } = await supabase.from("maintenance_records").insert([{
        ...newRecord,
        tenant_id: tenantId, // Explicit tenant_id
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

  // Helper to safely get fault codes as array
  const getFaultCodes = (vehicle: VehicleWithFaults): string[] => {
    if (Array.isArray(vehicle.fault_codes)) {
      return vehicle.fault_codes as string[];
    }
    return [];
  };

  // Count vehicles with fault codes
  const vehiclesWithFaults = allVehicles.filter(v => getFaultCodes(v).length > 0);
  const totalFaultCodes = allVehicles.reduce((sum, v) => sum + getFaultCodes(v).length, 0);

  if (loading) {
    return <div className="flex items-center justify-center h-full">Loading...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Wrench className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Maintenance</h1>
            <p className="text-muted-foreground">Track vehicle maintenance and diagnostics</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-0 mb-4">
        <button
          onClick={() => setActiveTab('records')}
          className={`h-[32px] px-4 text-[13px] font-medium rounded-l-full border-0 flex items-center gap-2 transition-all ${
            activeTab === 'records' 
              ? 'btn-glossy-primary text-white' 
              : 'btn-glossy text-gray-700 hover:opacity-90'
          }`}
        >
          <Calendar className="h-4 w-4" />
          Records
        </button>
        <button
          onClick={() => setActiveTab('faults')}
          className={`h-[32px] px-4 text-[13px] font-medium rounded-r-full border-0 flex items-center gap-2 transition-all ${
            activeTab === 'faults' 
              ? 'btn-glossy-danger text-white' 
              : 'btn-glossy text-gray-700 hover:opacity-90'
          }`}
        >
          <img src={checkEngineIcon} alt="Faults" className="h-4 w-4" />
          Fault Codes
          {totalFaultCodes > 0 && (
            <span className={`${activeTab === 'faults' ? 'badge-inset-danger' : 'badge-inset-soft-red'} text-[10px] h-5`}>
              {totalFaultCodes}
            </span>
          )}
        </button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">

        {/* Records Tab */}
        <TabsContent value="records" className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search maintenance records..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
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
                        {format(new Date(record.service_date), "MM/dd/yyyy")}
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
                        Next service due: {format(new Date(record.next_service_date), "MM/dd/yyyy")}
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
        </TabsContent>

        {/* Fault Codes Tab */}
        <TabsContent value="faults" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Badge variant={vehiclesWithFaults.length > 0 ? "destructive" : "secondary"} className="text-sm px-3 py-1">
                <img src={checkEngineIcon} alt="Faults" className="h-4 w-4 mr-2" />
                {vehiclesWithFaults.length} vehicle{vehiclesWithFaults.length !== 1 ? 's' : ''} with faults
              </Badge>
              <span className="text-sm text-muted-foreground">
                {totalFaultCodes} total fault code{totalFaultCodes !== 1 ? 's' : ''}
              </span>
            </div>
            <Button variant="outline" onClick={handleSyncSamsara} disabled={syncing}>
              <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync from Samsara'}
            </Button>
          </div>

          <div className="flex gap-4 h-[calc(100vh-320px)] min-h-[400px]">
            {/* Vehicle Sidebar */}
            <Card className="w-72 flex-shrink-0">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm font-medium">Fleet Vehicles</CardTitle>
              </CardHeader>
              <ScrollArea className="h-[calc(100%-56px)]">
                <div className="px-2 pb-2 space-y-1">
                  {allVehicles.map((vehicle) => {
                    const vehicleFaults = getFaultCodes(vehicle);
                    const hasFaults = vehicleFaults.length > 0;
                    const isSelected = selectedVehicle?.id === vehicle.id;
                    
                    return (
                      <div
                        key={vehicle.id}
                        onClick={() => setSelectedVehicle(vehicle)}
                        className={`p-3 rounded-lg cursor-pointer transition-colors border ${
                          isSelected 
                            ? 'bg-primary/10 border-primary' 
                            : 'hover:bg-muted/50 border-transparent'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Truck className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium text-sm">
                              {vehicle.vehicle_number}
                            </span>
                          </div>
                          {hasFaults && (
                            <Badge variant="destructive" className="h-5 min-w-5 px-1.5 text-xs">
                              {vehicleFaults.length}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 ml-6">
                          {vehicle.make} {vehicle.model}
                        </p>
                        {hasFaults && (
                          <div className="flex items-center gap-1 mt-1 ml-6">
                            <img src={checkEngineIcon} alt="Check engine" className="h-3 w-3" />
                            <span className="text-xs text-red-500 font-medium">
                              {vehicleFaults.length} fault{vehicleFaults.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </Card>

            {/* Fault Details Panel */}
            <Card className="flex-1">
              {selectedVehicle ? (
                (() => {
                  const selectedFaults = getFaultCodes(selectedVehicle);
                  return (
                    <>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle className="flex items-center gap-2">
                              <Truck className="h-5 w-5" />
                              Vehicle {selectedVehicle.vehicle_number}
                            </CardTitle>
                            <p className="text-sm text-muted-foreground">
                              {selectedVehicle.make} {selectedVehicle.model}
                            </p>
                          </div>
                          {selectedFaults.length > 0 ? (
                            <Badge variant="destructive" className="text-sm px-3 py-1">
                              <img src={checkEngineIcon} alt="Faults" className="h-4 w-4 mr-2" />
                              {selectedFaults.length} Active Fault{selectedFaults.length !== 1 ? 's' : ''}
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-sm px-3 py-1">
                              No Active Faults
                            </Badge>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-3 gap-4 mb-6">
                          <div className="p-3 bg-muted/30 rounded-lg">
                            <p className="text-xs text-muted-foreground">Odometer</p>
                            <p className="font-semibold">
                              {selectedVehicle.odometer?.toLocaleString() || 'N/A'} mi
                            </p>
                          </div>
                          <div className="p-3 bg-muted/30 rounded-lg">
                            <p className="text-xs text-muted-foreground">Last Updated</p>
                            <p className="font-semibold text-sm">
                              {selectedVehicle.last_updated 
                                ? format(new Date(selectedVehicle.last_updated), "MM/dd/yy HH:mm")
                                : 'N/A'
                              }
                            </p>
                          </div>
                          <div className="p-3 bg-muted/30 rounded-lg">
                            <p className="text-xs text-muted-foreground">Location</p>
                            <p className="font-semibold text-sm truncate">
                              {selectedVehicle.formatted_address || 'Unknown'}
                            </p>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <h3 className="font-semibold text-sm flex items-center gap-2">
                            <img src={checkEngineIcon} alt="Faults" className="h-4 w-4" />
                            Diagnostic Trouble Codes (DTCs)
                          </h3>
                          
                          {selectedFaults.length > 0 ? (
                            <div className="space-y-2">
                              {selectedFaults.map((code, index) => {
                                const dtcInfo = getDTCInfo(code);
                                const parsed = parseDTCCode(code);
                                const colors = dtcInfo ? getSeverityColor(dtcInfo.severity) : getSeverityColor('warning');
                                const lookupUrl = parsed.spn ? getDTCLookupUrl(parsed.spn, parsed.fmi ?? undefined) : null;
                                
                                return (
                                  <Collapsible key={index}>
                                    <div className={`p-3 ${colors.bg} border ${colors.border} rounded-lg`}>
                                      <CollapsibleTrigger className="w-full">
                                        <div className="flex items-start gap-2">
                                          <AlertTriangle className={`h-4 w-4 ${colors.text} mt-0.5 flex-shrink-0`} />
                                          <div className="flex-1 text-left">
                                            <div className="flex items-center justify-between">
                                              <p className={`font-mono text-sm font-medium ${colors.text}`}>
                                                {code}
                                              </p>
                                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                            </div>
                                            {dtcInfo && (
                                              <p className="text-xs text-muted-foreground mt-1">
                                                {dtcInfo.component} - Click for details
                                              </p>
                                            )}
                                          </div>
                                        </div>
                                      </CollapsibleTrigger>
                                      
                                      <CollapsibleContent className="mt-3 pt-3 border-t border-current/10">
                                        <div className="space-y-2 text-sm">
                                          {dtcInfo && (
                                            <>
                                              <div>
                                                <span className="font-medium">Component:</span>{" "}
                                                <span className="text-muted-foreground">{dtcInfo.component}</span>
                                              </div>
                                              <div>
                                                <span className="font-medium">Description:</span>{" "}
                                                <span className="text-muted-foreground">{dtcInfo.description}</span>
                                              </div>
                                              {dtcInfo.possibleCauses && dtcInfo.possibleCauses.length > 0 && (
                                                <div>
                                                  <span className="font-medium">Failure Mode:</span>{" "}
                                                  <span className="text-muted-foreground">{dtcInfo.possibleCauses[0]}</span>
                                                </div>
                                              )}
                                              <div>
                                                <span className="font-medium">Severity:</span>{" "}
                                                <Badge 
                                                  variant={dtcInfo.severity === 'critical' ? 'destructive' : dtcInfo.severity === 'warning' ? 'secondary' : 'outline'}
                                                  className="ml-1 text-xs"
                                                >
                                                  {dtcInfo.severity.toUpperCase()}
                                                </Badge>
                                              </div>
                                              {dtcInfo.recommendedAction && (
                                                <div className="p-2 bg-background/50 rounded text-xs">
                                                  <span className="font-medium">Recommended Action:</span>{" "}
                                                  {dtcInfo.recommendedAction}
                                                </div>
                                              )}
                                            </>
                                          )}
                                          
                                          {lookupUrl && (
                                            <a
                                              href={lookupUrl}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-2"
                                            >
                                              <ExternalLink className="h-3 w-3" />
                                              Look up full diagnostic details
                                            </a>
                                          )}
                                        </div>
                                      </CollapsibleContent>
                                    </div>
                                  </Collapsible>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="p-8 text-center bg-muted/30 rounded-lg">
                              <div className="flex flex-col items-center gap-2">
                                <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-950 flex items-center justify-center">
                                  <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                </div>
                                <p className="font-medium text-green-700 dark:text-green-400">No Active Faults</p>
                                <p className="text-sm text-muted-foreground">
                                  This vehicle has no diagnostic trouble codes
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </>
                  );
                })()
              ) : (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center text-muted-foreground">
                    <Truck className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>Select a vehicle to view fault codes</p>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
