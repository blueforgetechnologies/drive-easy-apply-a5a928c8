import { useState, useEffect, useRef, useCallback } from "react";
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
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from "@/components/ui/context-menu";
import { toast } from "sonner";
import { Plus, Search, Wrench, Calendar, AlertTriangle, Truck, RefreshCw, ExternalLink, ChevronDown, ChevronRight, ClipboardList, Trash2, GripVertical, ArrowUp, ArrowDown, Palette, CheckCircle, Pencil, ChevronsUp } from "lucide-react";
import { format } from "date-fns";
import checkEngineIcon from '@/assets/check-engine-icon.png';
import oilChangeIcon from '@/assets/oil-change-icon.png';
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
  provider_status: string | null;
}

interface RepairItem {
  id: string;
  vehicle_id: string;
  description: string;
  urgency: number;
  color: string | null;
  status: string;
  notes: string | null;
  sort_order: number;
  vehicles?: { vehicle_number: string; make: string | null; model: string | null };
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
  const [repairs, setRepairs] = useState<RepairItem[]>([]);
  const [repairDialogOpen, setRepairDialogOpen] = useState(false);
  const [newRepair, setNewRepair] = useState({ vehicle_id: "", description: "", urgency: 3, color: "#fbbf24" });
  
  // Edit repair state
  const [editRepairDialogOpen, setEditRepairDialogOpen] = useState(false);
  const [editingRepair, setEditingRepair] = useState<RepairItem | null>(null);
  
  // Drag and drop state for repairs
  const [draggedRepair, setDraggedRepair] = useState<RepairItem | null>(null);
  const [draggedVehicleId, setDraggedVehicleId] = useState<string | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const dragNodeRef = useRef<HTMLDivElement | null>(null);
  
  // Drag and drop state for truck groups
  const [draggedTruckId, setDraggedTruckId] = useState<string | null>(null);
  const [truckDropTargetIndex, setTruckDropTargetIndex] = useState<number | null>(null);
  const [truckOrder, setTruckOrder] = useState<string[]>([]);
  const [justDroppedTruckId, setJustDroppedTruckId] = useState<string | null>(null);
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
    loadRepairs();
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
        .select("id, vehicle_number, make, model, fault_codes, last_updated, formatted_address, odometer, provider_status")
        .order("vehicle_number");

      if (error) throw error;
      setAllVehicles((data as unknown as VehicleWithFaults[]) || []);
    } catch (error: any) {
      console.error("Failed to load vehicles with faults:", error);
    }
  };

  const loadRepairs = async () => {
    if (!isReady) return;
    try {
      const { data, error } = await query("repairs_needed")
        .select("*, vehicles(vehicle_number, make, model)")
        .eq("status", "pending")
        .order("urgency", { ascending: true })
        .order("sort_order", { ascending: true });

      if (error) throw error;
      setRepairs((data as unknown as RepairItem[]) || []);
    } catch (error: any) {
      console.error("Failed to load repairs:", error);
    }
  };

  const handleAddRepair = async () => {
    if (!tenantId || !newRepair.vehicle_id || !newRepair.description) {
      toast.error("Please fill in all required fields");
      return;
    }
    try {
      const { error } = await query("repairs_needed").insert({
        tenant_id: tenantId,
        vehicle_id: newRepair.vehicle_id,
        description: newRepair.description,
        urgency: newRepair.urgency,
        color: newRepair.color,
        status: "pending",
        sort_order: repairs.length
      });
      if (error) throw error;
      toast.success("Repair added");
      setRepairDialogOpen(false);
      setNewRepair({ vehicle_id: "", description: "", urgency: 3, color: "#fbbf24" });
      loadRepairs();
    } catch (error: any) {
      toast.error("Failed to add repair");
      console.error(error);
    }
  };

  const handleDeleteRepair = async (id: string) => {
    try {
      const { error } = await query("repairs_needed").delete().eq("id", id);
      if (error) throw error;
      toast.success("Repair removed");
      loadRepairs();
    } catch (error: any) {
      toast.error("Failed to delete repair");
      console.error(error);
    }
  };

  const handleCompleteRepair = async (id: string) => {
    try {
      const { error } = await query("repairs_needed")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      toast.success("Repair marked complete");
      loadRepairs();
    } catch (error: any) {
      toast.error("Failed to update repair");
      console.error(error);
    }
  };

  const handleMoveToTop = async (vehicleId: string, repairId: string) => {
    const vehicleRepairs = repairs
      .filter(r => r.vehicle_id === vehicleId)
      .sort((a, b) => a.sort_order - b.sort_order);
    
    const currentIndex = vehicleRepairs.findIndex(r => r.id === repairId);
    if (currentIndex <= 0) return; // Already at top or not found
    
    try {
      // Move to position 0, shift others down
      const updates = vehicleRepairs.map((repair, idx) => {
        if (repair.id === repairId) {
          return query("repairs_needed").update({ sort_order: 0 }).eq("id", repair.id);
        } else if (idx < currentIndex) {
          return query("repairs_needed").update({ sort_order: idx + 1 }).eq("id", repair.id);
        }
        return null;
      }).filter(Boolean);
      
      await Promise.all(updates);
      toast.success("Moved to top");
      loadRepairs();
    } catch (error: any) {
      toast.error("Failed to move");
      console.error(error);
    }
  };

  const handleChangeColor = async (repairId: string, color: string) => {
    try {
      const { error } = await query("repairs_needed")
        .update({ color })
        .eq("id", repairId);
      if (error) throw error;
      loadRepairs();
    } catch (error: any) {
      toast.error("Failed to change color");
      console.error(error);
    }
  };

  const handleEditRepair = async () => {
    if (!editingRepair) return;
    try {
      const { error } = await query("repairs_needed")
        .update({ 
          description: editingRepair.description,
          urgency: editingRepair.urgency,
          color: editingRepair.color
        })
        .eq("id", editingRepair.id);
      if (error) throw error;
      toast.success("Repair updated");
      setEditRepairDialogOpen(false);
      setEditingRepair(null);
      loadRepairs();
    } catch (error: any) {
      toast.error("Failed to update repair");
      console.error(error);
    }
  };

  const handleMoveRepair = async (vehicleId: string, repairId: string, direction: 'up' | 'down') => {
    const vehicleRepairs = repairs
      .filter(r => r.vehicle_id === vehicleId)
      .sort((a, b) => a.sort_order - b.sort_order);
    
    const currentIndex = vehicleRepairs.findIndex(r => r.id === repairId);
    if (currentIndex === -1) return;
    
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= vehicleRepairs.length) return;
    
    const currentRepair = vehicleRepairs[currentIndex];
    const targetRepair = vehicleRepairs[targetIndex];
    
    try {
      // Swap sort_order values
      await Promise.all([
        query("repairs_needed").update({ sort_order: targetRepair.sort_order }).eq("id", currentRepair.id),
        query("repairs_needed").update({ sort_order: currentRepair.sort_order }).eq("id", targetRepair.id)
      ]);
      loadRepairs();
    } catch (error: any) {
      toast.error("Failed to reorder");
      console.error(error);
    }
  };

  // Drag and drop handlers for smooth reordering
  const handleDragStart = useCallback((e: React.DragEvent, repair: RepairItem, vehicleId: string) => {
    setDraggedRepair(repair);
    setDraggedVehicleId(vehicleId);
    
    // Create custom drag image with shadow effect
    const target = e.currentTarget as HTMLDivElement;
    dragNodeRef.current = target;
    
    // Clone for drag image
    const clone = target.cloneNode(true) as HTMLDivElement;
    clone.style.transform = 'rotate(2deg) scale(1.05)';
    clone.style.boxShadow = '0 20px 40px rgba(0,0,0,0.3)';
    clone.style.opacity = '0.95';
    clone.style.position = 'absolute';
    clone.style.top = '-1000px';
    document.body.appendChild(clone);
    e.dataTransfer.setDragImage(clone, target.offsetWidth / 2, target.offsetHeight / 2);
    setTimeout(() => document.body.removeChild(clone), 0);
    
    e.dataTransfer.effectAllowed = 'move';
    
    // Add dragging class with delay for smooth animation
    requestAnimationFrame(() => {
      target.classList.add('opacity-40', 'scale-95');
    });
  }, []);

  const handleDragEnd = useCallback(() => {
    if (dragNodeRef.current) {
      dragNodeRef.current.classList.remove('opacity-40', 'scale-95');
    }
    setDraggedRepair(null);
    setDraggedVehicleId(null);
    setDropTargetIndex(null);
    dragNodeRef.current = null;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, vehicleId: string, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    // Only allow drop in same vehicle group
    if (draggedVehicleId === vehicleId) {
      setDropTargetIndex(index);
    }
  }, [draggedVehicleId]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only clear if leaving the container entirely
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) {
      setDropTargetIndex(null);
    }
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, vehicleId: string, targetIndex: number) => {
    e.preventDefault();
    
    if (!draggedRepair || draggedVehicleId !== vehicleId) {
      handleDragEnd();
      return;
    }
    
    const vehicleRepairs = repairs
      .filter(r => r.vehicle_id === vehicleId)
      .sort((a, b) => a.sort_order - b.sort_order);
    
    const currentIndex = vehicleRepairs.findIndex(r => r.id === draggedRepair.id);
    if (currentIndex === -1 || currentIndex === targetIndex) {
      handleDragEnd();
      return;
    }
    
    // Build new order array
    const newOrder = [...vehicleRepairs];
    const [removed] = newOrder.splice(currentIndex, 1);
    newOrder.splice(targetIndex, 0, removed);
    
    // Update sort_order for all affected items
    try {
      const updates = newOrder.map((repair, idx) => 
        query("repairs_needed").update({ sort_order: idx }).eq("id", repair.id)
      );
      await Promise.all(updates);
      loadRepairs();
    } catch (error: any) {
      toast.error("Failed to reorder");
      console.error(error);
    }
    
    handleDragEnd();
  }, [draggedRepair, draggedVehicleId, repairs, query, loadRepairs, handleDragEnd]);

  // Truck group drag handlers
  const handleTruckDragStart = useCallback((e: React.DragEvent, vehicleId: string) => {
    setDraggedTruckId(vehicleId);
    e.dataTransfer.effectAllowed = 'move';
    const target = e.currentTarget as HTMLDivElement;
    target.classList.add('opacity-50', 'scale-95');
  }, []);

  const handleTruckDragEnd = useCallback(() => {
    setDraggedTruckId(null);
    setTruckDropTargetIndex(null);
  }, []);

  const handleTruckDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedTruckId) {
      setTruckDropTargetIndex(index);
    }
  }, [draggedTruckId]);

  const handleTruckDrop = useCallback((e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (!draggedTruckId) return;
    
    // Build complete order including any new trucks not yet in truckOrder
    const allVehicleIds = Array.from(new Set(repairs.map(r => r.vehicle_id)));
    let currentOrder: string[];
    
    if (truckOrder.length > 0) {
      // Start with existing order, then add any new trucks at the end
      currentOrder = [...truckOrder];
      allVehicleIds.forEach(id => {
        if (!currentOrder.includes(id)) {
          currentOrder.push(id);
        }
      });
      // Remove any trucks that no longer have repairs
      currentOrder = currentOrder.filter(id => allVehicleIds.includes(id));
    } else {
      currentOrder = allVehicleIds;
    }
    
    const currentIndex = currentOrder.indexOf(draggedTruckId);
    
    if (currentIndex !== -1 && currentIndex !== targetIndex) {
      const newOrder = [...currentOrder];
      const [removed] = newOrder.splice(currentIndex, 1);
      // Adjust target index if needed when moving right
      const adjustedTarget = targetIndex > currentIndex ? targetIndex - 1 : targetIndex;
      newOrder.splice(adjustedTarget, 0, removed);
      setTruckOrder(newOrder);
      
      // Trigger glow effect on dropped truck
      setJustDroppedTruckId(draggedTruckId);
      setTimeout(() => setJustDroppedTruckId(null), 1000);
    }
    
    handleTruckDragEnd();
  }, [draggedTruckId, truckOrder, repairs, handleTruckDragEnd]);

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

  // Get max severity for a vehicle's faults (critical > warning > info > none)
  const getVehicleSeverity = (vehicle: VehicleWithFaults): number => {
    const faults = getFaultCodes(vehicle);
    if (faults.length === 0) return 0;
    
    let maxSeverity = 1; // default to info level if has faults
    for (const code of faults) {
      const dtcInfo = getDTCInfo(code);
      if (dtcInfo?.severity === 'critical') return 3;
      if (dtcInfo?.severity === 'warning' && maxSeverity < 2) maxSeverity = 2;
    }
    return maxSeverity;
  };

  // Sort vehicles: no Samsara connection at bottom, then by severity (most severe first), then by fault count
  const sortedVehicles = [...allVehicles].sort((a, b) => {
    // Vehicles without Samsara connection go to bottom
    const hasConnectionA = a.provider_status !== null;
    const hasConnectionB = b.provider_status !== null;
    if (hasConnectionA !== hasConnectionB) return hasConnectionB ? 1 : -1;
    
    // Then sort by severity
    const severityA = getVehicleSeverity(a);
    const severityB = getVehicleSeverity(b);
    if (severityB !== severityA) return severityB - severityA;
    return getFaultCodes(b).length - getFaultCodes(a).length;
  });

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
          onClick={() => setActiveTab('repairs')}
          className={`h-[32px] px-4 text-[13px] font-medium rounded-none border-0 flex items-center gap-2 transition-all ${
            activeTab === 'repairs' 
              ? 'bg-gradient-to-b from-amber-400 to-amber-600 text-white shadow-md' 
              : 'btn-glossy text-gray-700 hover:opacity-90'
          }`}
        >
          <ClipboardList className="h-4 w-4" />
          Repairs Needed
          {repairs.length > 0 && (
            <span className={`${activeTab === 'repairs' ? 'bg-amber-800/40 text-white' : 'bg-amber-100 text-amber-700'} text-[10px] h-5 px-1.5 rounded-full flex items-center justify-center font-bold`}>
              {repairs.length}
            </span>
          )}
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
              <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium shadow-md ${
                vehiclesWithFaults.length > 0 
                  ? 'bg-gradient-to-b from-red-500 to-red-600 text-white' 
                  : 'bg-gradient-to-b from-gray-100 to-gray-200 text-gray-700'
              }`}>
                <img src={checkEngineIcon} alt="Faults" className="h-4 w-4" />
                {vehiclesWithFaults.length} vehicle{vehiclesWithFaults.length !== 1 ? 's' : ''} with faults
              </div>
              <span className="text-sm text-muted-foreground">
                {totalFaultCodes} total fault code{totalFaultCodes !== 1 ? 's' : ''}
              </span>
            </div>
            <Button 
              variant="outline" 
              onClick={handleSyncSamsara} 
              disabled={syncing}
              className="bg-gradient-to-b from-white to-gray-50 border-gray-200 shadow-md hover:shadow-lg transition-all"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync from Samsara'}
            </Button>
          </div>

          <div className="flex gap-3 h-[calc(100vh-240px)] min-h-[500px]">
            {/* Vehicle Sidebar - Classic Theme Style */}
            <div className="w-64 flex-shrink-0 space-y-1 overflow-y-auto pr-2 border-r">
              {sortedVehicles.map((vehicle) => {
                const vehicleFaults = getFaultCodes(vehicle);
                const hasFaults = vehicleFaults.length > 0;
                const isSelected = selectedVehicle?.id === vehicle.id;
                const severity = getVehicleSeverity(vehicle);
                
                // Check if vehicle has Samsara connection (provider_status is not null)
                const hasSamsaraConnection = vehicle.provider_status !== null;
                
                // Severity-based styling
                const getSeverityStyle = () => {
                  if (!hasSamsaraConnection) return { border: '4px solid #1f2937', bg: 'from-gray-200 to-gray-300/70' }; // No Samsara - blackish/dark gray
                  if (severity === 3) return { border: '4px solid #dc2626', bg: 'from-red-50 to-red-100/50' }; // Critical - red
                  if (severity === 2) return { border: '4px solid #f59e0b', bg: 'from-amber-50 to-amber-100/50' }; // Warning - amber
                  if (severity === 1) return { border: '4px solid #3b82f6', bg: 'from-blue-50 to-blue-100/50' }; // Info - blue
                  return { border: '4px solid #22c55e', bg: 'from-green-50 to-green-100/50' }; // Healthy - green
                };
                
                const severityStyle = getSeverityStyle();
                const badgeColors = severity === 3 
                  ? 'from-red-500 to-red-700' 
                  : severity === 2 
                    ? 'from-amber-400 to-amber-600' 
                    : 'from-blue-400 to-blue-600';
                
                return (
                  <div 
                    key={vehicle.id} 
                    className={`px-2 py-1.5 cursor-pointer rounded-md relative transition-all duration-200 ${
                      isSelected 
                        ? 'card-glossy-selected' 
                        : `bg-gradient-to-b ${severityStyle.bg} border border-current/20 shadow-sm hover:shadow-md`
                    }`}
                    style={{ 
                      borderLeft: severityStyle.border
                    }}
                    onClick={() => setSelectedVehicle(vehicle)}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Truck className={`h-4 w-4 flex-shrink-0 ${
                          isSelected ? 'text-blue-600' : 
                          !hasSamsaraConnection ? 'text-gray-700' :
                          severity === 3 ? 'text-red-500' : 
                          severity === 2 ? 'text-amber-500' : 
                          severity === 1 ? 'text-blue-500' : 'text-green-600'
                        }`} />
                        <div className="min-w-0 flex-1">
                          <div className={`font-bold text-base leading-none truncate ${
                            isSelected ? 'text-blue-700' : 
                            !hasSamsaraConnection ? 'text-gray-800' :
                            severity === 3 ? 'text-red-700' : 
                            severity === 2 ? 'text-amber-700' : 
                            severity === 1 ? 'text-blue-700' : 'text-green-800'
                          }`}>
                            {vehicle.vehicle_number}
                          </div>
                          <div className={`text-sm leading-none truncate mt-0.5 ${!hasSamsaraConnection ? 'text-gray-600' : 'text-gray-500'}`}>
                            {vehicle.make} {vehicle.model}
                          </div>
                        </div>
                      </div>
                      
                      {/* Fault count badge */}
                      {hasFaults && (
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <img src={checkEngineIcon} alt="Faults" className="h-3.5 w-3.5" />
                          <span className={`text-sm font-bold text-white bg-gradient-to-b ${badgeColors} px-1.5 py-0.5 rounded shadow-[inset_0_1px_1px_rgba(255,255,255,0.3)]`}>
                            {vehicleFaults.length}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Fault Details Panel */}
            <div className="flex-1 bg-gradient-to-b from-white to-gray-50/50 rounded-xl shadow-lg border border-gray-100 overflow-hidden flex flex-col">
              {selectedVehicle ? (
                (() => {
                  const selectedFaults = getFaultCodes(selectedVehicle);
                  return (
                    <>
                      <div className="px-5 py-3 border-b border-gray-100 bg-gradient-to-b from-gray-50 to-white flex-shrink-0">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-gradient-to-b from-violet-100 to-violet-200 shadow-sm">
                              <Truck className="h-4 w-4 text-violet-600" />
                            </div>
                            <div>
                              <h2 className="text-base font-bold text-gray-900">
                                Vehicle {selectedVehicle.vehicle_number}
                              </h2>
                              <p className="text-xs text-gray-500">
                                {selectedVehicle.make} {selectedVehicle.model}
                              </p>
                            </div>
                          </div>
                          {selectedFaults.length > 0 ? (
                            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-gradient-to-b from-red-500 to-red-600 text-white shadow-md">
                              <img src={checkEngineIcon} alt="Faults" className="h-3.5 w-3.5" />
                              {selectedFaults.length} Active Fault{selectedFaults.length !== 1 ? 's' : ''}
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-gradient-to-b from-green-500 to-green-600 text-white shadow-md">
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              No Faults
                            </div>
                          )}
                        </div>
                      </div>
                      <ScrollArea className="flex-1">
                        <div className="p-4">
                          {/* Stats Grid - Compact */}
                          <div className="grid grid-cols-3 gap-3 mb-4">
                            <div className="p-3 bg-gradient-to-b from-white to-blue-50/50 rounded-lg border border-blue-100 shadow-sm">
                              <p className="text-[10px] font-medium text-blue-600 uppercase tracking-wide">Odometer</p>
                              <p className="text-sm font-bold text-gray-900 mt-0.5">
                                {selectedVehicle.odometer?.toLocaleString() || 'N/A'} mi
                              </p>
                            </div>
                            <div className="p-3 bg-gradient-to-b from-white to-violet-50/50 rounded-lg border border-violet-100 shadow-sm">
                              <p className="text-[10px] font-medium text-violet-600 uppercase tracking-wide">Last Updated</p>
                              <p className="text-sm font-bold text-gray-900 mt-0.5">
                                {selectedVehicle.last_updated 
                                  ? format(new Date(selectedVehicle.last_updated), "MM/dd/yy HH:mm")
                                  : 'N/A'
                                }
                              </p>
                            </div>
                            <div className="p-3 bg-gradient-to-b from-white to-emerald-50/50 rounded-lg border border-emerald-100 shadow-sm">
                              <p className="text-[10px] font-medium text-emerald-600 uppercase tracking-wide">Location</p>
                              <p className="text-xs font-bold text-gray-900 mt-0.5 truncate">
                                {selectedVehicle.formatted_address || 'Unknown'}
                              </p>
                            </div>
                          </div>

                        {/* DTCs Section */}
                        <div className="space-y-4">
                          <h3 className="font-bold text-sm flex items-center gap-2 text-gray-800">
                            <img src={checkEngineIcon} alt="Faults" className="h-5 w-5" />
                            Diagnostic Trouble Codes (DTCs)
                          </h3>
                          
                          {selectedFaults.length > 0 ? (
                            <div className="space-y-3">
                              {selectedFaults.map((code, index) => {
                                const dtcInfo = getDTCInfo(code);
                                const parsed = parseDTCCode(code);
                                const severity = dtcInfo?.severity || 'warning';
                                const lookupUrl = parsed.spn ? getDTCLookupUrl(parsed.spn, parsed.fmi ?? undefined) : null;
                                
                                const severityStyles = {
                                  critical: 'from-red-50 to-red-100/50 border-red-200 text-red-700',
                                  warning: 'from-amber-50 to-amber-100/50 border-amber-200 text-amber-700',
                                  info: 'from-blue-50 to-blue-100/50 border-blue-200 text-blue-700'
                                };
                                
                                const iconStyles = {
                                  critical: 'text-red-500',
                                  warning: 'text-amber-500',
                                  info: 'text-blue-500'
                                };
                                
                                return (
                                  <Collapsible key={index}>
                                    <div className={`p-4 bg-gradient-to-b ${severityStyles[severity]} border-2 rounded-xl shadow-sm transition-all hover:shadow-md`}>
                                      <CollapsibleTrigger className="w-full">
                                        <div className="flex items-start gap-3">
                                          <div className={`p-1.5 rounded-lg bg-white/80 shadow-sm`}>
                                            <AlertTriangle className={`h-4 w-4 ${iconStyles[severity]}`} />
                                          </div>
                                          <div className="flex-1 text-left">
                                            <div className="flex items-center justify-between">
                                              <p className="font-mono text-sm font-bold">
                                                {code}
                                              </p>
                                              <ChevronDown className="h-4 w-4 text-gray-400" />
                                            </div>
                                            {dtcInfo && (
                                              <p className="text-xs text-gray-600 mt-1">
                                                {dtcInfo.component} - Click for details
                                              </p>
                                            )}
                                          </div>
                                        </div>
                                      </CollapsibleTrigger>
                                      
                                      <CollapsibleContent className="mt-4 pt-4 border-t border-current/10">
                                        <div className="space-y-3 text-sm">
                                          {dtcInfo && (
                                            <>
                                              <div className="flex gap-2">
                                                <span className="font-semibold text-gray-700 w-24">Component:</span>
                                                <span className="text-gray-600">{dtcInfo.component}</span>
                                              </div>
                                              <div className="flex gap-2">
                                                <span className="font-semibold text-gray-700 w-24">Description:</span>
                                                <span className="text-gray-600">{dtcInfo.description}</span>
                                              </div>
                                              {dtcInfo.possibleCauses && dtcInfo.possibleCauses.length > 0 && (
                                                <div className="flex gap-2">
                                                  <span className="font-semibold text-gray-700 w-24">Failure Mode:</span>
                                                  <span className="text-gray-600">{dtcInfo.possibleCauses[0]}</span>
                                                </div>
                                              )}
                                              <div className="flex items-center gap-2">
                                                <span className="font-semibold text-gray-700 w-24">Severity:</span>
                                                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold shadow-sm ${
                                                  severity === 'critical' 
                                                    ? 'bg-gradient-to-b from-red-500 to-red-600 text-white' 
                                                    : severity === 'warning'
                                                    ? 'bg-gradient-to-b from-amber-500 to-amber-600 text-white'
                                                    : 'bg-gradient-to-b from-blue-500 to-blue-600 text-white'
                                                }`}>
                                                  {severity.toUpperCase()}
                                                </span>
                                              </div>
                                              {dtcInfo.recommendedAction && (
                                                <div className="p-3 bg-white/60 rounded-lg border border-current/10 text-xs">
                                                  <span className="font-semibold text-gray-700">Recommended Action:</span>{" "}
                                                  <span className="text-gray-600">{dtcInfo.recommendedAction}</span>
                                                </div>
                                              )}
                                            </>
                                          )}
                                          
                                          {lookupUrl && (
                                            <a
                                              href={lookupUrl}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="inline-flex items-center gap-1.5 text-xs text-violet-600 hover:text-violet-700 font-medium mt-2 hover:underline"
                                            >
                                              <ExternalLink className="h-3.5 w-3.5" />
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
                            <div className="p-10 text-center bg-gradient-to-b from-green-50 to-emerald-50/50 rounded-xl border-2 border-green-100 shadow-sm">
                              <div className="flex flex-col items-center gap-3">
                                <div className="h-14 w-14 rounded-full bg-gradient-to-b from-green-400 to-green-500 flex items-center justify-center shadow-md">
                                  <svg className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                  </svg>
                                </div>
                                <p className="font-bold text-green-700">No Active Faults</p>
                                <p className="text-sm text-green-600">
                                  This vehicle has no diagnostic trouble codes
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                        </div>
                      </ScrollArea>
                    </>
                  );
                })()
              ) : (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center">
                    <div className="p-4 rounded-2xl bg-gradient-to-b from-gray-100 to-gray-200 inline-block mb-4 shadow-sm">
                      <Truck className="h-12 w-12 text-gray-400" />
                    </div>
                    <p className="text-gray-500 font-medium">Select a vehicle to view fault codes</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Repairs Needed Tab */}
        <TabsContent value="repairs" className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-amber-600" />
              <span className="text-sm text-muted-foreground">
                {repairs.length} pending repair{repairs.length !== 1 ? 's' : ''}
              </span>
            </div>
            <Dialog open={repairDialogOpen} onOpenChange={setRepairDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-to-b from-amber-400 to-amber-600 hover:from-amber-500 hover:to-amber-700 text-white border-0">
                  <Plus className="mr-2 h-4 w-4" /> Add Repair
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Repair Needed</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Vehicle *</Label>
                    <Select value={newRepair.vehicle_id} onValueChange={(v) => setNewRepair({ ...newRepair, vehicle_id: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select vehicle" />
                      </SelectTrigger>
                      <SelectContent>
                        {vehicles.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.vehicle_number} - {v.make} {v.model}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Description *</Label>
                    <Textarea
                      value={newRepair.description}
                      onChange={(e) => setNewRepair({ ...newRepair, description: e.target.value })}
                      placeholder="e.g., DEF Fluid Filter, Windshield Crack..."
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Urgency</Label>
                      <Select value={String(newRepair.urgency)} onValueChange={(v) => setNewRepair({ ...newRepair, urgency: Number(v) })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">🔴 Critical</SelectItem>
                          <SelectItem value="2">🟠 High</SelectItem>
                          <SelectItem value="3">🟡 Medium</SelectItem>
                          <SelectItem value="4">🟢 Low</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Color</Label>
                      <div className="flex gap-2 mt-1">
                        {['#ef4444', '#f97316', '#fbbf24', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'].map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setNewRepair({ ...newRepair, color: c })}
                            className={`w-7 h-7 rounded-full border-2 ${newRepair.color === c ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                <Button onClick={handleAddRepair} className="w-full mt-4 bg-gradient-to-b from-amber-400 to-amber-600 text-white border-0">
                  Add Repair
                </Button>
              </DialogContent>
            </Dialog>
          </div>

          {/* Repairs grid by vehicle - scrollable with truck drag */}
          <ScrollArea className="h-[calc(100vh-280px)] min-h-[400px]">
            <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-9 2xl:grid-cols-12 gap-1 p-1">
              {/* Group repairs by vehicle, use custom order or sort by vehicle number */}
              {(() => {
                const vehicleGroups = Array.from(new Set(repairs.map(r => r.vehicle_id)))
                  .map(vehicleId => ({
                    vehicleId,
                    repairs: repairs.filter(r => r.vehicle_id === vehicleId).sort((a, b) => a.sort_order - b.sort_order)
                  }));
                
                // Build complete order including any new trucks
                const allVehicleIds = vehicleGroups.map(g => g.vehicleId);
                let completeOrder: string[];
                
                if (truckOrder.length > 0) {
                  completeOrder = [...truckOrder];
                  allVehicleIds.forEach(id => {
                    if (!completeOrder.includes(id)) completeOrder.push(id);
                  });
                  completeOrder = completeOrder.filter(id => allVehicleIds.includes(id));
                } else {
                  completeOrder = allVehicleIds.sort((a, b) => {
                    const numA = parseInt(vehicleGroups.find(g => g.vehicleId === a)?.repairs[0]?.vehicles?.vehicle_number || '999');
                    const numB = parseInt(vehicleGroups.find(g => g.vehicleId === b)?.repairs[0]?.vehicles?.vehicle_number || '999');
                    return numA - numB;
                  });
                }
                
                const sortedGroups = completeOrder
                  .map(id => vehicleGroups.find(g => g.vehicleId === id)!)
                  .filter(Boolean);
                
                const totalGroups = sortedGroups.length;
                
                return (
                  <>
                    {sortedGroups.map(({ vehicleId, repairs: vehicleRepairs }, groupIndex) => {
                      const vehicle = vehicleRepairs[0]?.vehicles;
                      const isTruckDragging = draggedTruckId === vehicleId;
                      const isTruckDropTarget = truckDropTargetIndex === groupIndex && draggedTruckId && draggedTruckId !== vehicleId;
                      const isJustDropped = justDroppedTruckId === vehicleId;
                      const isLastItem = groupIndex === totalGroups - 1;
                      const isEndDropTarget = truckDropTargetIndex === totalGroups && draggedTruckId && isLastItem;
                      
                      // Get vehicle fault data from allVehicles
                      const vehicleData = allVehicles.find(v => v.id === vehicleId);
                      const faultCodes = vehicleData ? getFaultCodes(vehicleData) : [];
                      const severity = vehicleData ? getVehicleSeverity(vehicleData) : 0;
                      
                      // Check if any repair mentions oil change
                      const hasOilChange = vehicleRepairs.some(r => 
                        r.description.toLowerCase().includes('oil') || 
                        r.description.toLowerCase().includes('lube')
                      );
                      
                      return (
                        <div key={vehicleId} className="relative flex">
                          {/* Drop indicator line - shows to the LEFT of the target */}
                          {isTruckDropTarget && (
                            <div className="absolute -left-0.5 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-400 via-blue-500 to-blue-400 z-50 shadow-[0_0_12px_4px_rgba(59,130,246,0.7)]" />
                          )}
                          
                          {/* Drop indicator on RIGHT for last item when dropping at end */}
                          {isEndDropTarget && (
                            <div className="absolute -right-0.5 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-400 via-blue-500 to-blue-400 z-50 shadow-[0_0_12px_4px_rgba(59,130,246,0.7)]" />
                          )}
                      
                      <div 
                        draggable
                        onDragStart={(e) => { e.stopPropagation(); handleTruckDragStart(e, vehicleId); }}
                        onDragEnd={(e) => { e.currentTarget.classList.remove('opacity-50', 'scale-95'); handleTruckDragEnd(); }}
                        onDragOver={(e) => handleTruckDragOver(e, groupIndex)}
                        onDrop={(e) => handleTruckDrop(e, groupIndex)}
                        className={`
                          flex-1 bg-gradient-to-b from-slate-200 to-slate-300/80 overflow-hidden rounded-lg
                          shadow-[0_2px_8px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.9)] 
                          border border-slate-400/40 transition-all duration-300
                          ${isTruckDragging ? 'opacity-50 scale-95' : ''}
                          ${isJustDropped ? 'ring-2 ring-green-500 shadow-[0_0_20px_6px_rgba(34,197,94,0.5)]' : ''}
                        `}
                      >
                      {/* Puffy raised Vehicle header - Darker squared theme */}
                      <div className="relative bg-gradient-to-b from-gray-200 via-gray-300 to-gray-400 shadow-[inset_0_2px_4px_rgba(255,255,255,0.8),inset_0_-3px_6px_rgba(0,0,0,0.2),0_4px_12px_rgba(0,0,0,0.25),0_2px_4px_rgba(0,0,0,0.15)] cursor-grab active:cursor-grabbing rounded-t-sm overflow-hidden border border-gray-400/80 border-b-gray-500">
                        {/* Strong glossy top highlight */}
                        <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-white/30 via-white/80 to-white/30" />
                        
                        {/* Header content - taller padding */}
                        <div className="flex items-center justify-between px-2.5 py-2.5">
                          {/* Truck number with elegant dark text */}
                          <span className="text-slate-700 text-xs font-bold tracking-wider drop-shadow-[0_1px_0_rgba(255,255,255,1)]">
                            #{vehicle?.vehicle_number || '?'}
                          </span>
                          
                          {/* Status indicators */}
                          <div className="flex items-center gap-1.5">
                            {/* Oil change indicator - tilted oil can pouring */}
                            {hasOilChange && (
                              <div 
                                className="relative" 
                                title="Oil Change Needed"
                              >
                                <svg 
                                  viewBox="0 0 48 42" 
                                  className="h-5 w-6 animate-pulse"
                                  style={{
                                    filter: 'drop-shadow(0 0 3px rgba(251, 191, 36, 1)) drop-shadow(0 0 6px rgba(234, 88, 12, 0.8)) drop-shadow(0 0 10px rgba(251, 191, 36, 0.5))'
                                  }}
                                >
                                  {/* Skinny oil can body - tilted down to the left */}
                                  <path 
                                    d="M18 6 L38 10 C42 11, 44 15, 42 19 L38 28 C36 32, 32 33, 28 31 L12 24 C8 22, 8 18, 10 14 L14 8 C16 5, 17 5, 18 6 Z" 
                                    fill="#dc2626"
                                    stroke="#1f2937"
                                    strokeWidth="1.5"
                                    strokeLinejoin="round"
                                  />
                                  {/* Round handle on right - slightly up */}
                                  <circle 
                                    cx="44" cy="6" r="3.5"
                                    fill="none"
                                    stroke="#374151"
                                    strokeWidth="2.5"
                                  />
                                  {/* Handle connector */}
                                  <path 
                                    d="M41 8 L40 10" 
                                    stroke="#374151"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                  />
                                  {/* Long tube spout tilted down */}
                                  <path 
                                    d="M10 16 L6 20 L3 26 L1 25 L3 20 L8 14 L12 12" 
                                    fill="#dc2626"
                                    stroke="#1f2937"
                                    strokeWidth="1.5"
                                    strokeLinejoin="round"
                                    strokeLinecap="round"
                                  />
                                  {/* Big oil drop - teardrop shape */}
                                  <path 
                                    d="M3 30 C1 28, 4 30, 6 34 C7 38, 5 42, 3 42 C1 42, -1 38, 0 34 C1 30, 3 28, 3 30 Z" 
                                    fill="#374151"
                                  />
                                </svg>
                              </div>
                            )}
                            
                            {/* Check engine light - authentic MIL symbol */}
                            {faultCodes.length > 0 && (
                              <div 
                                className="relative"
                                title={`${faultCodes.length} fault code${faultCodes.length > 1 ? 's' : ''}`}
                              >
                                <svg 
                                  viewBox="0 0 48 32" 
                                  className={`h-5 w-7 ${severity === 3 ? 'animate-pulse' : ''}`}
                                  style={{
                                    filter: severity === 3 
                                      ? 'drop-shadow(0 0 4px rgba(239, 68, 68, 1)) drop-shadow(0 0 8px rgba(239, 68, 68, 0.8)) drop-shadow(0 0 12px rgba(239, 68, 68, 0.5))'
                                      : 'drop-shadow(0 0 3px rgba(251, 146, 60, 1)) drop-shadow(0 0 6px rgba(251, 146, 60, 0.7))'
                                  }}
                                >
                                  {/* Main engine block outline - side profile */}
                                  <path 
                                    d="M6 12 L6 8 L12 8 L12 6 L36 6 L36 8 L42 8 L42 12 L44 12 L44 20 L42 20 L42 24 L36 24 L36 26 L12 26 L12 24 L6 24 L6 20 L4 20 L4 12 Z" 
                                    fill={severity === 3 ? '#dc2626' : '#f97316'}
                                    stroke="#0f172a"
                                    strokeWidth="1.5"
                                    strokeLinejoin="round"
                                  />
                                  {/* Intake manifold runners on top */}
                                  <rect x="16" y="2" width="3" height="4" fill={severity === 3 ? '#dc2626' : '#f97316'} stroke="#0f172a" strokeWidth="1" />
                                  <rect x="22" y="2" width="3" height="4" fill={severity === 3 ? '#dc2626' : '#f97316'} stroke="#0f172a" strokeWidth="1" />
                                  <rect x="28" y="2" width="3" height="4" fill={severity === 3 ? '#dc2626' : '#f97316'} stroke="#0f172a" strokeWidth="1" />
                                  {/* Exhaust manifold on left side */}
                                  <path d="M4 14 L1 14 L1 18 L4 18" fill={severity === 3 ? '#dc2626' : '#f97316'} stroke="#0f172a" strokeWidth="1" />
                                  {/* Alternator/pulley on right */}
                                  <circle cx="44" cy="16" r="3" fill={severity === 3 ? '#b91c1c' : '#ea580c'} stroke="#0f172a" strokeWidth="1" />
                                  {/* Valve cover detail lines */}
                                  <line x1="14" y1="10" x2="34" y2="10" stroke="#0f172a" strokeWidth="1" />
                                  {/* Crankcase detail */}
                                  <line x1="14" y1="22" x2="34" y2="22" stroke="#0f172a" strokeWidth="1" />
                                  {/* Center bolt pattern */}
                                  <circle cx="18" cy="16" r="1.5" fill="#0f172a" />
                                  <circle cx="24" cy="16" r="1.5" fill="#0f172a" />
                                  <circle cx="30" cy="16" r="1.5" fill="#0f172a" />
                                </svg>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {/* Engraved divider between header and repairs */}
                        <div className="h-[5px] bg-gradient-to-b from-gray-400/60 via-gray-500/40 to-white/70 shadow-[inset_0_2px_3px_rgba(0,0,0,0.3),inset_0_-1px_0_rgba(255,255,255,0.9)]" />
                      </div>
                      
                      {/* Repairs list with drag-and-drop - engraved separators */}
                      <div 
                        className="min-h-[40px] bg-gradient-to-b from-slate-200/80 to-slate-300/50 shadow-[inset_0_2px_4px_rgba(0,0,0,0.1)]"
                        onDragLeave={handleDragLeave}
                      >
                      {vehicleRepairs.map((repair, index) => {
                        const bgColor = repair.color || '#fbbf24';
                        const isDragging = draggedRepair?.id === repair.id;
                        const isDropTarget = draggedVehicleId === vehicleId && dropTargetIndex === index;
                        
                        return (
                          <ContextMenu key={repair.id}>
                            <ContextMenuTrigger asChild>
                              <div className="relative">
                                {/* Drop indicator - shows above the item */}
                                {isDropTarget && !isDragging && (
                                  <div className="absolute -top-0.5 left-0 right-0 h-1.5 bg-gradient-to-r from-blue-400 via-blue-500 to-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.8)] z-30" />
                                )}
                                
                                {/* Engraved separator between items */}
                                {index > 0 && (
                                  <div className="h-[3px] bg-gradient-to-b from-slate-500/40 via-slate-600/30 to-white/60" />
                                )}
                                
                                <div
                                  draggable
                                  onDragStart={(e) => handleDragStart(e, repair, vehicleId)}
                                  onDragEnd={handleDragEnd}
                                  onDragOver={(e) => handleDragOver(e, vehicleId, index)}
                                  onDrop={(e) => handleDrop(e, vehicleId, index)}
                                  className={`
                                    relative px-2 py-2 flex items-center gap-1.5 group
                                    transition-all duration-150 ease-out
                                    cursor-grab active:cursor-grabbing
                                    shadow-[inset_0_2px_4px_rgba(255,255,255,0.9),inset_0_-2px_4px_rgba(0,0,0,0.1),0_1px_2px_rgba(0,0,0,0.1)]
                                    border-x border-white/30
                                    ${isDragging 
                                      ? 'opacity-30 scale-95 shadow-none' 
                                      : 'hover:scale-[1.02] hover:shadow-[inset_0_2px_6px_rgba(255,255,255,1),0_8px_20px_rgba(0,0,0,0.2)] hover:z-20'
                                    }
                                    ${!isDragging && 'hover:-translate-y-0.5'}
                                  `}
                                  style={{ 
                                    background: `linear-gradient(to bottom, ${bgColor}70, ${bgColor}50, ${bgColor}60)`,
                                  }}
                                >
                                  {/* Description */}
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[11px] font-medium leading-tight text-gray-900" style={{ wordBreak: 'break-word' }}>
                                      {repair.description}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </ContextMenuTrigger>
                            
                            <ContextMenuContent className="w-48 bg-white border shadow-xl">
                              {/* Change Color submenu */}
                              <ContextMenuSub>
                                <ContextMenuSubTrigger className="flex items-center gap-2">
                                  <Palette className="h-4 w-4" />
                                  Change Color
                                </ContextMenuSubTrigger>
                                <ContextMenuSubContent className="bg-white border shadow-lg p-2">
                                  <div className="flex gap-1.5 flex-wrap w-32">
                                    {['#ef4444', '#f97316', '#fbbf24', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b'].map((c) => (
                                      <button
                                        key={c}
                                        onClick={() => handleChangeColor(repair.id, c)}
                                        className={`w-6 h-6 rounded border-2 transition-transform hover:scale-110 ${repair.color === c ? 'border-gray-800 ring-2 ring-offset-1 ring-gray-400' : 'border-gray-300'}`}
                                        style={{ backgroundColor: c }}
                                      />
                                    ))}
                                  </div>
                                </ContextMenuSubContent>
                              </ContextMenuSub>
                              
                              <ContextMenuItem 
                                className="flex items-center gap-2 cursor-pointer"
                                onClick={() => handleMoveToTop(vehicleId, repair.id)}
                                disabled={index === 0}
                              >
                                <ChevronsUp className="h-4 w-4" />
                                Move to Top
                              </ContextMenuItem>
                              
                              <ContextMenuItem 
                                className="flex items-center gap-2 cursor-pointer"
                                onClick={() => handleCompleteRepair(repair.id)}
                              >
                                <CheckCircle className="h-4 w-4 text-green-600" />
                                Mark as Completed
                              </ContextMenuItem>
                              
                              <ContextMenuSeparator />
                              
                              <ContextMenuItem 
                                className="flex items-center gap-2 cursor-pointer"
                                onClick={() => { setEditingRepair(repair); setEditRepairDialogOpen(true); }}
                              >
                                <Pencil className="h-4 w-4" />
                                Edit
                              </ContextMenuItem>
                              
                              <ContextMenuItem 
                                className="flex items-center gap-2 cursor-pointer text-red-600 focus:text-red-600"
                                onClick={() => handleDeleteRepair(repair.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                                Delete
                              </ContextMenuItem>
                            </ContextMenuContent>
                          </ContextMenu>
                        );
                      })}
                      
                      {/* Drop zone at end of list */}
                      {draggedVehicleId === vehicleId && dropTargetIndex === vehicleRepairs.length && (
                        <div className="h-1 mx-1 bg-gradient-to-r from-blue-400 via-blue-500 to-blue-400 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.6)] animate-pulse" />
                      )}
                      <div 
                        className="h-4 -mb-1"
                        onDragOver={(e) => handleDragOver(e, vehicleId, vehicleRepairs.length)}
                        onDrop={(e) => handleDrop(e, vehicleId, vehicleRepairs.length)}
                      />
                    </div>
                          {/* Invisible drop zone on the right side for last item */}
                          {isLastItem && draggedTruckId && draggedTruckId !== vehicleId && (
                            <div 
                              className="absolute -right-2 top-0 bottom-0 w-4 z-40"
                              onDragOver={(e) => { e.preventDefault(); handleTruckDragOver(e, totalGroups); }}
                              onDrop={(e) => handleTruckDrop(e, totalGroups)}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                  </>
                );
              })()}
            </div>
          </ScrollArea>

          {repairs.length === 0 && (
            <div className="text-center py-16">
              <div className="p-4 rounded-2xl bg-gradient-to-b from-amber-50 to-amber-100 inline-block mb-4 shadow-sm">
                <ClipboardList className="h-12 w-12 text-amber-400" />
              </div>
              <p className="text-gray-500 font-medium">No repairs needed</p>
              <p className="text-sm text-muted-foreground mt-1">Click "Add Repair" to track repairs for your vehicles</p>
            </div>
          )}
          
          {/* Edit Repair Dialog */}
          <Dialog open={editRepairDialogOpen} onOpenChange={setEditRepairDialogOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Edit Repair</DialogTitle>
              </DialogHeader>
              {editingRepair && (
                <div className="space-y-4 py-4">
                  <div>
                    <Label>Description</Label>
                    <Textarea
                      value={editingRepair.description}
                      onChange={(e) => setEditingRepair({ ...editingRepair, description: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Urgency</Label>
                      <Select 
                        value={String(editingRepair.urgency)} 
                        onValueChange={(v) => setEditingRepair({ ...editingRepair, urgency: Number(v) })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">🔴 Critical</SelectItem>
                          <SelectItem value="2">🟠 High</SelectItem>
                          <SelectItem value="3">🟡 Medium</SelectItem>
                          <SelectItem value="4">🟢 Low</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Color</Label>
                      <div className="flex gap-2 mt-1 flex-wrap">
                        {['#ef4444', '#f97316', '#fbbf24', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b'].map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setEditingRepair({ ...editingRepair, color: c })}
                            className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 ${editingRepair.color === c ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                  <Button onClick={handleEditRepair} className="w-full">
                    Save Changes
                  </Button>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </TabsContent>
      </Tabs>
    </div>
  );
}
