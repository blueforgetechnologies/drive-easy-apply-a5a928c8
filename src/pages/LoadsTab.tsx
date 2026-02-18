import React, { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
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
import { Search, Plus, Edit, Trash2, Truck, MapPin, DollarSign, Download, X, Check, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, FileText, CheckCircle2, ExternalLink, ShieldCheck, History, Calculator, Loader2, User } from "lucide-react";
import { AddCustomerDialog } from "@/components/AddCustomerDialog";
import { RateConfirmationUploader } from "@/components/RateConfirmationUploader";
import { NewCustomerPrompt } from "@/components/NewCustomerPrompt";
import { SearchableEntitySelect } from "@/components/SearchableEntitySelect";
import { PDFImageViewer } from "@/components/PDFImageViewer";
import { CreateLoadDialog } from "@/components/CreateLoadDialog";
import { CarrierRateHistoryDialog } from "@/components/CarrierRateHistoryDialog";
import { useTenantQuery } from '@/hooks/useTenantQuery';
import { useUserPermissions } from '@/hooks/useUserPermissions';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

interface LoadDocument {
  id: string;
  load_id: string;
  document_type: string;
  file_name: string;
  file_url: string;
}

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
  assigned_dispatcher_id: string | null;
  load_owner_id: string | null;
  carrier_id: string | null;
  rate: number | null;
  total_revenue: number | null;
  estimated_miles: number | null;
  empty_miles: number | null;
  cargo_weight: number | null;
  cargo_description: string | null;
  customer_id: string | null;
  broker_name: string | null;
  reference_number: string | null;
  email_source: string | null;
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
  customer?: {
    name: string | null;
  };
  dispatcher?: {
    first_name: string | null;
    last_name: string | null;
  };
  load_owner?: {
    first_name: string | null;
    last_name: string | null;
  };
}

export default function LoadsTab() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { query, withTenant, tenantId, shouldFilter, isReady } = useTenantQuery();
  const { hasPermission } = useUserPermissions();
  const filter = searchParams.get("filter") || "all";
  const [loads, setLoads] = useState<Load[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedLoadIds, setSelectedLoadIds] = useState<string[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [carriers, setCarriers] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [dateFilter, setDateFilter] = useState<{ from: string; to: string }>({ from: "", to: "" });
  // pendingCustomerData, matchedCustomerId, rateConfirmationFile moved to CreateLoadDialog
  const [loadDocuments, setLoadDocuments] = useState<Record<string, LoadDocument[]>>({});
  const [documentDialogOpen, setDocumentDialogOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<{ url: string; name: string; type: string } | null>(null);
  const [loadApprovalMode, setLoadApprovalMode] = useState(false);
  const [vehiclesRequiringApproval, setVehiclesRequiringApproval] = useState<string[]>([]);
  const [rateHistoryDialogOpen, setRateHistoryDialogOpen] = useState(false);
  const [selectedLoadForHistory, setSelectedLoadForHistory] = useState<{ id: string; loadNumber: string } | null>(null);
  // calculatingMiles moved to CreateLoadDialog
  const ROWS_PER_PAGE = 14;
  
  // Permission checks for Load Approval features
  const canUseApprovalMode = hasPermission("feature_load_approval_mode");
  const canAccessApprovalPage = hasPermission("feature_load_approval_page");
  
  // Status priority order matching the tab order - action_needed first!
  const STATUS_ORDER = [
    'action_needed',
    'pending_dispatch',
    'available',
    'booked', 
    'dispatched',
    'at_pickup',
    'in_transit',
    'at_delivery',
    'delivered',
    'completed',
    'closed',
    'cancelled',
    'tonu'
  ];
  
  // Sorting state
  type SortField = 'status' | 'pickup_date' | 'delivery_date' | 'rate' | 'load_number' | 'created_at';
  type SortDirection = 'asc' | 'desc' | null;
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Cycle through: asc -> desc -> null (default status order)
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortDirection(null);
        setSortField(null);
      } else {
        setSortDirection('asc');
      }
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };
  
  const SortableHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <div 
      className="flex items-center gap-1 cursor-pointer hover:text-primary/80 select-none"
      onClick={() => handleSort(field)}
    >
      {children}
      {sortField === field ? (
        sortDirection === 'asc' ? (
          <ArrowUp className="h-3 w-3" />
        ) : (
          <ArrowDown className="h-3 w-3" />
        )
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-50" />
      )}
    </div>
  );
  // generateManualLoadNumber moved to CreateLoadDialog
  
  // formData moved to CreateLoadDialog
  const [defaultCarrierId, setDefaultCarrierId] = useState<string | null>(null);
  const [currentUserDispatcherId, setCurrentUserDispatcherId] = useState<string | null>(null);

  // Reload when tenant changes - use isReady for proper guard
  useEffect(() => {
    if (isReady) {
      loadData();
      loadDriversAndVehicles();
    }
  }, [tenantId, isReady]);

  // Default carrier handling moved to CreateLoadDialog

  const loadDriversAndVehicles = async () => {
    // Guard: wait until tenant context is ready
    if (!isReady) return;
    
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      
      // Use tenant-scoped queries for all tenant-owned tables
      const [driversResult, vehiclesResult, customersResult, companyProfileResult, dispatcherResult, vehiclesApprovalResult, carriersResult] = await Promise.all([
        query("applications").select("id, personal_info").eq("driver_status", "active"),
        query("vehicles").select("id, vehicle_number, requires_load_approval, carrier_id, driver_1_id, driver_2_id, assigned_driver_id, truck_type, contractor_percentage").eq("status", "active"),
        query("customers").select("id, name, contact_name, mc_number, email, phone, city, state").eq("status", "active"),
        supabase.from("company_profile").select("default_carrier_id").limit(1).maybeSingle(),
        user?.id ? query("dispatchers").select("id").eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null }),
        query("vehicles").select("id").eq("requires_load_approval", true),
        query("carriers").select("id, name").eq("status", "active"),
      ]);
      
      if (driversResult.data) setDrivers(driversResult.data);
      if (vehiclesResult.data) setVehicles(vehiclesResult.data);
      if (carriersResult.data) setCarriers(carriersResult.data);
      if (customersResult.data) setCustomers(customersResult.data);
      if (vehiclesApprovalResult.data) {
        setVehiclesRequiringApproval(vehiclesApprovalResult.data.map((v: any) => v.id));
      }
      if (companyProfileResult.data && 'default_carrier_id' in companyProfileResult.data) {
        setDefaultCarrierId((companyProfileResult.data as any).default_carrier_id);
      }
      if (dispatcherResult.data && 'id' in dispatcherResult.data) {
        setCurrentUserDispatcherId((dispatcherResult.data as any).id);
      }
    } catch (error) {
      console.error("Error loading drivers/vehicles/customers:", error);
    }
  };

  // Function to find matching customer from extracted data
  // Priority: 1) MC number, 2) Exact name, 3) Similar name, 4) Email (lowest - billing emails often differ from customer)
  // findMatchingCustomer moved to CreateLoadDialog

  const loadData = async () => {
    if (!isReady) return;
    
    setLoading(true);
    try {
      // Always fetch ALL loads to get accurate counts for tabs (use tenant-scoped query helper)
      let loadsQuery = query("loads")
        .select(`
          *,
          vehicle:vehicles!assigned_vehicle_id(vehicle_number, requires_load_approval, truck_type, contractor_percentage),
          driver:applications!assigned_driver_id(personal_info),
          carrier:carriers!carrier_id(name),
          customer:customers!customer_id(name),
          dispatcher:dispatchers!assigned_dispatcher_id(first_name, last_name),
          load_owner:dispatchers!load_owner_id(first_name, last_name)
        `)
        .order("created_at", { ascending: false });
      
      const { data, error } = await loadsQuery;

      if (error) {
        toast.error("Error loading loads");
        console.error(error);
        return;
      }
      setLoads((data as any) || []);
      
      // Fetch documents for all loads (tenant-scoped)
      if (data && data.length > 0) {
        const loadIds = data.map((l: any) => l.id);
        const { data: docsData } = await query("load_documents")
          .select("id, load_id, document_type, file_name, file_url")
          .in("load_id", loadIds);
        
        if (docsData) {
          const docsMap: Record<string, LoadDocument[]> = {};
          docsData.forEach((doc: any) => {
            if (!docsMap[doc.load_id]) {
              docsMap[doc.load_id] = [];
            }
            docsMap[doc.load_id].push(doc);
          });
          setLoadDocuments(docsMap);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDocument = async (doc: LoadDocument, docType: string) => {
    try {
      const { data } = await supabase.storage
        .from('load-documents')
        .createSignedUrl(doc.file_url, 3600); // 1 hour expiry
      
      if (data?.signedUrl) {
        setSelectedDocument({
          url: data.signedUrl,
          name: doc.file_name,
          type: docType
        });
        setDocumentDialogOpen(true);
      }
    } catch (error) {
      console.error("Error getting document URL:", error);
      toast.error("Failed to load document");
    }
  };

  const getDocumentByType = (loadId: string, docType: string): LoadDocument | undefined => {
    const docs = loadDocuments[loadId] || [];
    return docs.find(d => d.document_type === docType);
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
      const update: Record<string, any> = { [field]: value };

      // If assigning a vehicle that requires load approval, force it back into approval workflow
      if (field === 'assigned_vehicle_id') {
        const v = vehicles.find((veh: any) => veh.id === value);
        if (v?.requires_load_approval === true) {
          update.carrier_approved = false;
          update.approved_payload = null;
        }
      }

      const { error } = await supabase
        .from("loads" as any)
        .update(update)
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
      case "action_needed":
        // Force solid red pill (avoid glossy gradient causing low contrast)
        return { label: "Action Needed", color: "bg-none !bg-red-600 !border-red-600 !text-white" };
      case "pending_dispatch":
        return { label: "Pending Dispatch", color: "bg-transparent border-yellow-400 text-yellow-500" };
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
      case "closed":
        return { label: "CLOSED", color: "bg-transparent border-black text-black dark:border-white dark:text-white" };
      case "ready_for_audit":
        return { label: "Ready for Audit", color: "bg-transparent border-cyan-600 text-cyan-600" };
      case "cancelled":
        return { label: "Cancelled", color: "bg-transparent border-red-500 text-red-600" };
      case "tonu":
        return { label: "TONU", color: "bg-transparent border-orange-500 text-orange-600" };
      default:
        return { label: status, color: "bg-transparent border-muted text-muted-foreground" };
    }
  };

  // calculateDistance, handleAddLoad, handleAddNewCustomer moved to CreateLoadDialog

  const handleDeleteLoad = async (id: string) => {
    try {
      // 1. Fetch attached documents so we can clean up storage files
      const { data: docs } = await supabase
        .from("load_documents" as any)
        .select("file_url")
        .eq("load_id", id);

      // 2. Delete the load (cascades to load_documents, load_stops, load_expenses, carrier_rate_history)
      const { error } = await supabase
        .from("loads" as any)
        .delete()
        .eq("id", id);

      if (error) {
        // Handle FK constraint errors from invoices/settlements gracefully
        if (error.code === "23503") {
          throw new Error("This load is linked to an invoice or settlement. Remove those first before deleting.");
        }
        throw error;
      }

      // 3. Clean up storage files (best-effort, don't fail the delete)
      if (docs && docs.length > 0) {
        const filePaths = docs.map((d: any) => d.file_url).filter(Boolean);
        if (filePaths.length > 0) {
          await supabase.storage.from("load-documents").remove(filePaths);
        }
      }

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
    action_needed: loads.filter(l => l.status === 'action_needed').length,
    pending_dispatch: loads.filter(l => l.status === 'pending_dispatch').length,
    available: loads.filter(l => l.status === 'available').length,
    booked: loads.filter(l => l.status === 'booked').length,
    dispatched: loads.filter(l => l.status === 'dispatched').length,
    at_pickup: loads.filter(l => l.status === 'at_pickup').length,
    in_transit: loads.filter(l => l.status === 'in_transit').length,
    at_delivery: loads.filter(l => l.status === 'at_delivery').length,
    delivered: loads.filter(l => l.status === 'delivered').length,
    completed: loads.filter(l => l.status === 'completed').length,
    closed: loads.filter(l => l.status === 'closed').length,
    ready_for_audit: loads.filter(l => l.status === 'ready_for_audit').length,
    cancelled: loads.filter(l => l.status === 'cancelled').length,
    tonu: loads.filter(l => l.status === 'tonu').length,
  };

  const filteredLoads = loads
    .filter((load) => {
      // Load Approval Mode filter - only show loads needing approval
      if (loadApprovalMode) {
        const isFromApprovalRequiredVehicle = vehiclesRequiringApproval.includes(load.assigned_vehicle_id || '');
        const carrierApproved = (load as any).carrier_approved === true;
        const approvedPayload = (load as any).approved_payload as number | string | null | undefined;

        // Needs approval if not approved yet OR if payload changed since approval (or baseline is missing)
        const payloadChanged = carrierApproved && (
          approvedPayload == null || Number(load.rate) !== Number(approvedPayload)
        );
        const needsCarrierApproval = !carrierApproved || payloadChanged;

        if (!isFromApprovalRequiredVehicle || !needsCarrierApproval) {
          return false;
        }
      }
      
      // Status filter from URL param
      const matchesStatus = filter === "all" || load.status === filter;
      
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = (
        (load.load_number || "").toLowerCase().includes(searchLower) ||
        (load.pickup_location || "").toLowerCase().includes(searchLower) ||
        (load.delivery_location || "").toLowerCase().includes(searchLower) ||
        (load.broker_name || "").toLowerCase().includes(searchLower)
      );
      
      // Date filtering
      let matchesDate = true;
      if (dateFilter.from || dateFilter.to) {
        const loadDate = load.pickup_date ? new Date(load.pickup_date) : null;
        if (loadDate) {
          if (dateFilter.from) {
            const fromDate = new Date(dateFilter.from);
            fromDate.setHours(0, 0, 0, 0);
            if (loadDate < fromDate) matchesDate = false;
          }
          if (dateFilter.to) {
            const toDate = new Date(dateFilter.to);
            toDate.setHours(23, 59, 59, 999);
            if (loadDate > toDate) matchesDate = false;
          }
        } else {
          // If no pickup date and date filter is active, exclude
          matchesDate = false;
        }
      }
      
      return matchesStatus && matchesSearch && matchesDate;
    })
    // Apply sorting
    .sort((a, b) => {
      // If a column sort is active, use that
      if (sortField && sortDirection) {
        let comparison = 0;
        
        switch (sortField) {
          case 'pickup_date':
            const pickupA = a.pickup_date ? new Date(a.pickup_date).getTime() : 0;
            const pickupB = b.pickup_date ? new Date(b.pickup_date).getTime() : 0;
            comparison = pickupA - pickupB;
            break;
          case 'delivery_date':
            const deliveryA = a.delivery_date ? new Date(a.delivery_date).getTime() : 0;
            const deliveryB = b.delivery_date ? new Date(b.delivery_date).getTime() : 0;
            comparison = deliveryA - deliveryB;
            break;
          case 'rate':
            comparison = (a.rate || 0) - (b.rate || 0);
            break;
          case 'load_number':
            comparison = (a.load_number || '').localeCompare(b.load_number || '');
            break;
          case 'created_at':
            const createdA = new Date(a.created_at || 0).getTime();
            const createdB = new Date(b.created_at || 0).getTime();
            comparison = createdA - createdB;
            break;
          case 'status':
            const statusOrderA = STATUS_ORDER.indexOf(a.status?.toLowerCase() || '');
            const statusOrderB = STATUS_ORDER.indexOf(b.status?.toLowerCase() || '');
            comparison = (statusOrderA === -1 ? STATUS_ORDER.length : statusOrderA) - 
                        (statusOrderB === -1 ? STATUS_ORDER.length : statusOrderB);
            break;
        }
        
        return sortDirection === 'desc' ? -comparison : comparison;
      }
      
      // Default: sort by status priority order, then by created_at within same status
      const statusA = STATUS_ORDER.indexOf(a.status?.toLowerCase() || '');
      const statusB = STATUS_ORDER.indexOf(b.status?.toLowerCase() || '');
      
      const orderA = statusA === -1 ? STATUS_ORDER.length : statusA;
      const orderB = statusB === -1 ? STATUS_ORDER.length : statusB;
      
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      
      // Within same status, sort by created_at descending (newest first)
      const dateA = new Date(a.created_at || 0).getTime();
      const dateB = new Date(b.created_at || 0).getTime();
      return dateB - dateA;
    });

  // Pagination
  const totalPages = Math.ceil(filteredLoads.length / ROWS_PER_PAGE);
  const paginatedLoads = filteredLoads.slice(
    (currentPage - 1) * ROWS_PER_PAGE,
    currentPage * ROWS_PER_PAGE
  );

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      pending_dispatch: "bg-yellow-500 hover:bg-yellow-600",
      available: "bg-sky-500 hover:bg-sky-600",
      booked: "bg-indigo-500 hover:bg-indigo-600",
      dispatched: "bg-blue-500 hover:bg-blue-600",
      at_pickup: "bg-amber-500 hover:bg-amber-600",
      in_transit: "bg-purple-500 hover:bg-purple-600",
      at_delivery: "bg-teal-500 hover:bg-teal-600",
      delivered: "bg-green-600 hover:bg-green-700",
      completed: "bg-green-800 hover:bg-green-900",
      closed: "bg-black hover:bg-gray-900 dark:bg-white dark:text-black dark:hover:bg-gray-200",
      ready_for_audit: "bg-cyan-600 hover:bg-cyan-700",
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
    <>
    <div className="flex flex-col flex-1 min-h-0 px-3 md:px-0 gap-4">
      {/* Header - Mobile optimized */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <h2 className="text-xl sm:text-2xl font-bold">Booked Loads</h2>
        <div className="flex gap-2 w-full sm:w-auto">
          {canUseApprovalMode && (
            <Button 
              variant={loadApprovalMode ? "default" : "outline"}
              className={cn(
                "gap-2 flex-1 sm:flex-none h-11 sm:h-10 rounded-xl",
                loadApprovalMode && "bg-green-600 hover:bg-green-700"
              )}
              onClick={() => setLoadApprovalMode(!loadApprovalMode)}
            >
              <CheckCircle2 className="h-4 w-4" />
              {loadApprovalMode ? "Exit Approval Mode" : "Load Approval MODE"}
            </Button>
          )}
          {canAccessApprovalPage && (
            <Button 
              variant="outline"
              className="gap-2 flex-1 sm:flex-none h-11 sm:h-10 rounded-xl"
              onClick={() => navigate("/dashboard/load-approval")}
            >
              <CheckCircle2 className="h-4 w-4" />
              Load Approval
            </Button>
          )}
          <Button className="gap-2 flex-1 sm:flex-none h-11 sm:h-10 rounded-xl" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            Create Load
          </Button>
          <CreateLoadDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            tenantId={tenantId}
            vehicles={vehicles}
            drivers={drivers}
            carriers={carriers}
            customers={customers}
            defaultCarrierId={defaultCarrierId}
            currentUserDispatcherId={currentUserDispatcherId}
            onLoadCreated={() => { loadData(); }}
            onCustomersRefresh={loadDriversAndVehicles}
          />
        </div>
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
                    <DropdownMenuItem onClick={() => handleBulkStatusUpdate("closed")}>
                      CLOSED
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

                <Button 
                  variant="outline" 
                  size="sm" 
                  className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
                  onClick={() => {
                    if (confirm(`Delete ${selectedLoadIds.length} selected load(s)?`)) {
                      Promise.all(selectedLoadIds.map(id => handleDeleteLoad(id))).then(() => {
                        setSelectedLoadIds([]);
                      });
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top row: Search and Date filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        {/* Search - left side */}
        <div className="relative w-full sm:w-56">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search loads..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-7 text-xs"
          />
        </div>

        {/* Spacer */}
        <div className="hidden sm:block w-8" />

        <div className="flex items-center gap-2 flex-wrap">
          {/* Date filters */}
          <div className="flex items-center gap-1">
            <Input
              type="date"
              value={dateFilter.from}
              onChange={(e) => setDateFilter(prev => ({ ...prev, from: e.target.value }))}
              className="h-7 text-xs w-32"
              placeholder="From"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              type="date"
              value={dateFilter.to}
              onChange={(e) => setDateFilter(prev => ({ ...prev, to: e.target.value }))}
              className="h-7 text-xs w-32"
              placeholder="To"
            />
            {(dateFilter.from || dateFilter.to) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setDateFilter({ from: "", to: "" })}
              >
                Clear
              </Button>
            )}
          </div>
          
          {/* Reset Sort Button */}
          {sortField && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs border-dashed"
              onClick={() => {
                setSortField(null);
                setSortDirection('asc');
              }}
            >
              <X className="h-3 w-3 mr-1" />
              Reset Sort
            </Button>
          )}
        </div>
      </div>

      {/* Status filter tabs - full width */}
      <div className="flex items-center gap-0 overflow-x-auto pb-1">
        {[
          { key: "all", label: "All", count: statusCounts.all, activeClass: "btn-glossy-dark", badgeClass: "badge-inset-dark", softBadgeClass: "badge-inset" },
          { key: "action_needed", label: "Action Needed", count: statusCounts.action_needed, activeClass: "btn-glossy-danger", badgeClass: "badge-inset-danger", softBadgeClass: "badge-inset-soft-red" },
          { key: "pending_dispatch", label: "Pending", count: statusCounts.pending_dispatch, activeClass: "btn-glossy-warning", badgeClass: "badge-inset-warning", softBadgeClass: "badge-inset-soft-orange" },
          { key: "available", label: "Available", count: statusCounts.available, activeClass: "btn-glossy-primary", badgeClass: "badge-inset-primary", softBadgeClass: "badge-inset-soft-blue" },
          { key: "booked", label: "Booked", count: statusCounts.booked, activeClass: "btn-glossy-success", badgeClass: "badge-inset-success", softBadgeClass: "badge-inset-soft-green" },
          { key: "dispatched", label: "Dispatched", count: statusCounts.dispatched, activeClass: "btn-glossy-primary", badgeClass: "badge-inset-primary", softBadgeClass: "badge-inset-soft-blue" },
          { key: "at_pickup", label: "Pickup", count: statusCounts.at_pickup, activeClass: "btn-glossy-warning", badgeClass: "badge-inset-warning", softBadgeClass: "badge-inset-soft-orange" },
          { key: "in_transit", label: "Transit", count: statusCounts.in_transit, activeClass: "btn-glossy-primary", badgeClass: "badge-inset-primary", softBadgeClass: "badge-inset-soft-blue" },
          { key: "at_delivery", label: "Delivery", count: statusCounts.at_delivery, activeClass: "btn-glossy-primary", badgeClass: "badge-inset-primary", softBadgeClass: "badge-inset-soft-blue" },
          { key: "delivered", label: "Delivered", count: statusCounts.delivered, activeClass: "btn-glossy-success", badgeClass: "badge-inset-success", softBadgeClass: "badge-inset-soft-green" },
          { key: "completed", label: "Completed", count: statusCounts.completed, activeClass: "btn-glossy-success", badgeClass: "badge-inset-success", softBadgeClass: "badge-inset-soft-green" },
          { key: "ready_for_audit", label: "Ready for Audit", count: statusCounts.ready_for_audit, activeClass: "btn-glossy-primary", badgeClass: "badge-inset-primary", softBadgeClass: "badge-inset-soft-blue" },
          { key: "cancelled", label: "Cancelled", count: statusCounts.cancelled, activeClass: "btn-glossy-danger", badgeClass: "badge-inset-danger", softBadgeClass: "badge-inset-soft-red" },
          { key: "tonu", label: "TONU", count: statusCounts.tonu, activeClass: "btn-glossy-warning", badgeClass: "badge-inset-warning", softBadgeClass: "badge-inset-soft-orange" },
          { key: "closed", label: "CLOSED", count: statusCounts.closed, activeClass: "bg-black text-white dark:bg-white dark:text-black", badgeClass: "bg-white/20 text-white dark:bg-black/20 dark:text-black", softBadgeClass: "badge-inset" },
        ].map((status) => (
          <Button
            key={status.key}
            variant="ghost"
            size="sm"
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.set("filter", status.key);
              setSearchParams(next);
              setSearchQuery("");
            }}
            className={`h-[30px] px-3 text-[13px] font-medium gap-1 rounded-none first:rounded-l-full last:rounded-r-full border-0 ${
              filter === status.key 
                ? `${status.activeClass} text-white` 
                : 'btn-glossy text-gray-700'
            }`}
          >
            {status.label}
            <span className={`${filter === status.key ? status.badgeClass : status.softBadgeClass} text-[10px] h-5`}>{status.count}</span>
          </Button>
        ))}
      </div>

      <Card className="flex flex-col flex-1 min-h-0 overflow-hidden">
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
                      <TableHead className="text-primary text-xs py-2 px-2">
                        <SortableHeader field="status">Status</SortableHeader>
                      </TableHead>
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
                        <div className="text-muted-foreground">Customer Load</div>
                      </TableHead>
                      <TableHead className="text-primary text-xs py-2 px-2">
                        <div>Origin</div>
                        <div>Destination</div>
                      </TableHead>
                      <TableHead className="text-primary text-xs py-2 px-2">
                        <SortableHeader field="pickup_date">
                          <div>Pickup</div>
                        </SortableHeader>
                        <SortableHeader field="delivery_date">
                          <div className="text-muted-foreground">Delivery</div>
                        </SortableHeader>
                      </TableHead>
                      <TableHead className="text-primary text-xs py-2 px-2">
                        <div>DH</div>
                        <div>Loaded</div>
                      </TableHead>
                      <TableHead className="text-primary text-xs py-2 px-2">
                        <div>Loaded $/Mi</div>
                        <div>Total $/Mi</div>
                      </TableHead>
                      <TableHead className="text-primary text-xs py-2 px-2">
                        <div>Payload</div>
                      </TableHead>
                      <TableHead className="text-primary text-xs py-2 px-2">
                        <div>Carr Pay</div>
                      </TableHead>
                      <TableHead className="text-primary text-xs py-2 px-2">
                        <div>Load Owner</div>
                        <div>Dispatcher</div>
                      </TableHead>
                      <TableHead className="text-primary text-xs py-2 px-2">RC</TableHead>
                      <TableHead className="text-primary text-xs py-2 px-2">BOL</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedLoads.map((load, index) => {
                      const isActionNeeded = load.status === 'action_needed';
                      const nextLoad = paginatedLoads[index + 1];
                      const isLastActionNeeded = isActionNeeded && nextLoad && nextLoad.status !== 'action_needed';
                      
                      return (
                        <React.Fragment key={load.id}>
                          <TableRow 
                            className={`cursor-pointer transition-colors ${
                              isActionNeeded 
                                ? 'bg-red-600/25 dark:bg-red-800/50 hover:bg-red-600/35 dark:hover:bg-red-800/60' 
                                : 'hover:bg-muted/40 border-b border-border/50'
                            }`}
                            onClick={() => loadApprovalMode ? navigate("/dashboard/load-approval") : viewLoadDetail(load.id)}
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
                                  className={`h-7 text-xs font-semibold border rounded-md shadow-none [text-shadow:none] ${load.status !== 'action_needed' ? '[background:none]' : ''} ${getStatusDisplay(load.status).color}`}
                                >
                                  <SelectValue>
                                    {getStatusDisplay(load.status).label}
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="action_needed">Action Needed</SelectItem>
                                  <SelectItem value="pending_dispatch">Pending Dispatch</SelectItem>
                                  <SelectItem value="available">Available</SelectItem>
                                  <SelectItem value="booked">Booked</SelectItem>
                                  <SelectItem value="dispatched">Dispatched</SelectItem>
                                  <SelectItem value="at_pickup">At Pickup</SelectItem>
                                  <SelectItem value="in_transit">In Transit</SelectItem>
                                  <SelectItem value="at_delivery">At Delivery</SelectItem>
                                  <SelectItem value="delivered">Delivered</SelectItem>
                                  <SelectItem value="completed">Completed</SelectItem>
                                  <SelectItem value="ready_for_audit">Ready for Audit</SelectItem>
                                  <SelectItem value="cancelled">Cancelled</SelectItem>
                                  <SelectItem value="tonu">TONU</SelectItem>
                                  <SelectItem value="closed">CLOSED</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className={`py-2 px-2 ${isActionNeeded ? 'text-red-700 dark:text-red-300' : ''}`}>
                              <div className="font-semibold text-xs">
                                {load.vehicle?.vehicle_number || "N/A"}
                              </div>
                              <div className="text-xs text-muted-foreground mt-0.5">
                                {(load.driver?.personal_info?.firstName || load.driver?.personal_info?.lastName)
                                  ? `${load.driver.personal_info.firstName || ''} ${load.driver.personal_info.lastName || ''}`.trim()
                                  : "-"}
                              </div>
                            </TableCell>
                            <TableCell className={`py-2 px-2 ${isActionNeeded ? 'text-red-700 dark:text-red-300' : ''}`}>
                              <div className="text-xs">{load.carrier?.name || "-"}</div>
                              <div className="text-xs text-muted-foreground mt-0.5">{load.customer?.name || "-"}</div>
                            </TableCell>
                            <TableCell className={`py-2 px-2 ${isActionNeeded ? 'text-red-700 dark:text-red-300' : ''}`}>
                              <div className="font-medium text-xs">{load.load_number}</div>
                              <div className="text-xs text-muted-foreground mt-0.5">{load.reference_number || "-"}</div>
                            </TableCell>
                            <TableCell className={`py-2 px-2 ${isActionNeeded ? 'text-red-700 dark:text-red-300' : ''}`}>
                              <div className="text-xs">{load.pickup_city}, {load.pickup_state}</div>
                              <div className="text-xs text-muted-foreground mt-0.5">{load.delivery_city}, {load.delivery_state}</div>
                            </TableCell>
                            <TableCell className={`py-2 px-2 ${isActionNeeded ? 'text-red-700 dark:text-red-300' : ''}`}>
                              <div className="text-xs whitespace-nowrap">
                                {load.pickup_date ? format(new Date(load.pickup_date), "MM/dd/yy HH:mm") : "N/A"}
                              </div>
                              <div className="text-xs whitespace-nowrap mt-0.5">
                                {load.delivery_date ? format(new Date(load.delivery_date), "MM/dd/yy HH:mm") : "N/A"}
                              </div>
                            </TableCell>
                            <TableCell className={`py-2 px-2 ${isActionNeeded ? 'text-red-700 dark:text-red-300' : ''}`}>
                              <div className="text-xs">
                                {load.empty_miles ? Math.round(load.empty_miles) : 0}
                              </div>
                              <div className="text-xs mt-0.5">{load.estimated_miles ? Math.round(load.estimated_miles) : "-"}</div>
                            </TableCell>
                            <TableCell className={`py-2 px-2 ${isActionNeeded ? 'text-red-700 dark:text-red-300' : ''}`}>
                              <div className="text-xs">
                                {load.rate && load.estimated_miles 
                                  ? `$${(load.rate / load.estimated_miles).toFixed(2)}`
                                  : "N/A"}
                              </div>
                              <div className="text-xs mt-0.5">
                                {load.rate && load.estimated_miles 
                                  ? `$${(load.rate / load.estimated_miles).toFixed(2)}`
                                  : "N/A"}
                              </div>
                            </TableCell>
                            <TableCell className="py-2 px-2">
                              {(() => {
                                const vehicleRequiresApproval = (load.vehicle as any)?.requires_load_approval;
                                const isApproved = (load as any).carrier_approved === true;
                                const approvedPayload = (load as any).approved_payload;
                                const rate = load.rate;
                                const payloadChanged = isApproved && 
                                                       approvedPayload !== null && 
                                                       approvedPayload !== undefined &&
                                                       rate !== approvedPayload;
                                
                                // If approved and payload hasn't changed, use normal text color
                                // If action needed (not approved or payload changed), use red
                                const needsAction = vehicleRequiresApproval && (!isApproved || payloadChanged);
                                
                                return (
                                  <div className={`text-xs font-semibold ${needsAction ? 'text-red-700 dark:text-red-300' : ''}`}>
                                    {load.rate ? `$${load.rate.toFixed(2)}` : "N/A"}
                                  </div>
                                );
                              })()}
                            </TableCell>
                            <TableCell className={`py-2 px-2 ${isActionNeeded ? 'text-red-700 dark:text-red-300' : ''}`}>
                              {(() => {
                                const vehicleRequiresApproval = (load.vehicle as any)?.requires_load_approval;
                                const isApproved = (load as any).carrier_approved === true;
                                const carrierRate = (load as any).carrier_rate;
                                const approvedPayload = (load as any).approved_payload;
                                const rate = load.rate;
                                
                                // Check if payload changed after approval (needs re-approval)
                                const payloadChanged = isApproved && 
                                                       approvedPayload !== null && 
                                                       approvedPayload !== undefined &&
                                                       rate !== approvedPayload;
                                
                                const handleCarrierPayClick = (e: React.MouseEvent) => {
                                  e.stopPropagation();
                                  setSelectedLoadForHistory({ id: load.id, loadNumber: load.load_number });
                                  setRateHistoryDialogOpen(true);
                                };
                                
                                if (vehicleRequiresApproval && !isApproved) {
                                  // Vehicle requires approval but not yet approved - show DB-stored calculated carrier pay with LA badge
                                  return (
                                    <div className="flex items-center gap-1 text-xs font-semibold">
                                      <span 
                                        className="text-orange-600 font-bold cursor-pointer hover:underline"
                                        onClick={handleCarrierPayClick}
                                        title="View rate history"
                                      >
                                        ${Number(carrierRate ?? 0).toFixed(2)}
                                      </span>
                                      <Badge 
                                        variant="outline" 
                                        className="text-[8px] px-0.5 py-0 bg-amber-50 text-amber-700 border-amber-300 scale-[0.85]"
                                        title="Load Approval Required"
                                      >
                                        <ShieldCheck className="h-2 w-2 mr-0.5" />
                                        LA
                                      </Badge>
                                    </div>
                                  );
                                } else if (vehicleRequiresApproval && payloadChanged) {
                                  // Payload changed after approval - show strikethrough rate with LA badge
                                  return (
                                    <div className="flex items-center gap-1 text-xs font-semibold">
                                      <span 
                                        className="text-red-600 font-bold line-through cursor-pointer hover:underline"
                                        onClick={handleCarrierPayClick}
                                        title="View rate history"
                                      >
                                        ${carrierRate?.toFixed(2) || "0.00"}
                                      </span>
                                      <Badge 
                                        variant="outline" 
                                        className="text-[8px] px-0.5 py-0 bg-amber-50 text-amber-700 border-amber-300 scale-[0.85]"
                                        title="Payload Changed - Re-approval Required"
                                      >
                                        <ShieldCheck className="h-2 w-2 mr-0.5" />
                                        LA
                                      </Badge>
                                    </div>
                                  );
                                } else if (vehicleRequiresApproval && isApproved && carrierRate) {
                                  // Approved - show the approved carrier rate WITH LA badge
                                  return (
                                    <div className="flex items-center gap-1 text-xs font-semibold">
                                      <span 
                                        className="text-green-600 cursor-pointer hover:underline"
                                        onClick={handleCarrierPayClick}
                                        title="View rate history"
                                      >
                                        ${carrierRate.toFixed(2)}
                                      </span>
                                      <Badge 
                                        variant="outline" 
                                        className="text-[8px] px-0.5 py-0 bg-green-50 text-green-700 border-green-300 scale-[0.85]"
                                        title="Load Approval Enabled"
                                      >
                                        <ShieldCheck className="h-2 w-2 mr-0.5" />
                                        LA
                                      </Badge>
                                    </div>
                                  );
                                } else {
                                  // No approval required - calculate carrier pay based on truck type
                                  const truckType = (load.vehicle as any)?.truck_type;
                                  const contractorPercentage = (load.vehicle as any)?.contractor_percentage || 0;
                                  const isMyTruck = truckType === 'my_truck' || !truckType;
                                  const isContractorTruck = truckType === 'contractor_truck';
                                  
                                  // "My Truck" always gets 100% of the rate
                                  // "Contractor Truck" uses carrier_rate or calculates from percentage
                                  let displayCarrierPay: number | undefined;
                                  if (isMyTruck && rate) {
                                    displayCarrierPay = rate;
                                  } else if (carrierRate) {
                                    displayCarrierPay = carrierRate;
                                  } else if (rate) {
                                    displayCarrierPay = isContractorTruck && contractorPercentage > 0
                                      ? rate * (contractorPercentage / 100)
                                      : rate;
                                  }
                                  
                                  return (
                                    <div 
                                      className="text-xs font-semibold text-green-600 cursor-pointer hover:underline"
                                      onClick={handleCarrierPayClick}
                                      title="View rate history"
                                    >
                                      {displayCarrierPay ? `$${displayCarrierPay.toFixed(2)}` : "-"}
                                    </div>
                                  );
                                }
                              })()}
                            </TableCell>
                            <TableCell className={`py-2 px-2 ${isActionNeeded ? 'text-red-700 dark:text-red-300' : ''}`}>
                              <div className="text-xs">
                                {load.load_owner?.first_name && load.load_owner?.last_name
                                  ? `${load.load_owner.first_name} ${load.load_owner.last_name}`
                                  : "-"}
                              </div>
                              <div className="text-xs text-muted-foreground mt-0.5">
                                {load.dispatcher?.first_name && load.dispatcher?.last_name
                                  ? `${load.dispatcher.first_name} ${load.dispatcher.last_name}`
                                  : "-"}
                              </div>
                            </TableCell>
                            <TableCell 
                              className={`text-xs py-2 px-2 ${isActionNeeded ? 'text-red-700 dark:text-red-300' : ''}`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {(() => {
                                const rcDoc = getDocumentByType(load.id, 'rate_confirmation');
                                return rcDoc ? (
                                  <button
                                    onClick={() => handleOpenDocument(rcDoc, 'Rate Confirmation')}
                                    className="inline-flex items-center justify-center px-2.5 py-1 text-[11px] font-semibold text-green-700 dark:text-green-400 bg-gradient-to-b from-green-100 to-green-50 dark:from-green-900/30 dark:to-green-800/20 rounded-full shadow-[0_2px_8px_-2px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.8)] hover:shadow-[0_4px_12px_-2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.9)] hover:scale-105 transition-all duration-200 cursor-pointer border border-green-300/50 dark:border-green-600/30"
                                  >
                                    RC
                                  </button>
                                ) : (
                                  <span className="text-muted-foreground text-xs">N/A</span>
                                );
                              })()}
                            </TableCell>
                            <TableCell 
                              className={`text-xs py-2 px-2 ${isActionNeeded ? 'text-red-700 dark:text-red-300' : ''}`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {(() => {
                                const bolDoc = getDocumentByType(load.id, 'bill_of_lading');
                                return bolDoc ? (
                                  <button
                                    onClick={() => handleOpenDocument(bolDoc, 'Bill of Lading')}
                                    className="inline-flex items-center justify-center px-2.5 py-1 text-[11px] font-semibold text-green-700 dark:text-green-400 bg-gradient-to-b from-green-100 to-green-50 dark:from-green-900/30 dark:to-green-800/20 rounded-full shadow-[0_2px_8px_-2px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.8)] hover:shadow-[0_4px_12px_-2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.9)] hover:scale-105 transition-all duration-200 cursor-pointer border border-green-300/50 dark:border-green-600/30"
                                  >
                                    BOL
                                  </button>
                                ) : (
                                  <span className="text-muted-foreground text-xs">N/A</span>
                                );
                              })()}
                            </TableCell>
                          </TableRow>
                          {/* Red separator line after last action_needed load */}
                          {isLastActionNeeded && (
                            <TableRow className="h-1 bg-transparent border-0 p-0">
                              <TableCell colSpan={14} className="p-0 border-0">
                                <div className="h-1 bg-red-500 dark:bg-red-600 shadow-md shadow-red-500/50" />
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {/* Always visible pagination */}
              <div className="flex items-center justify-between px-3 py-1.5 border-t bg-background flex-shrink-0">
                <span className="text-xs text-muted-foreground">
                  Showing {((currentPage - 1) * ROWS_PER_PAGE) + 1}-{Math.min(currentPage * ROWS_PER_PAGE, filteredLoads.length)} of {filteredLoads.length}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="h-6 w-6 p-0"
                  >
                    <ChevronLeft className="h-3 w-3" />
                  </Button>
                  <span className="text-xs">Page {currentPage} of {Math.max(1, totalPages)}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                    className="h-6 w-6 p-0"
                  >
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
    
    {/* Document Preview Dialog */}
    <Dialog open={documentDialogOpen} onOpenChange={setDocumentDialogOpen}>
      <DialogContent className="max-w-4xl h-[80vh]">
        <DialogHeader>
          <DialogTitle>{selectedDocument?.type}: {selectedDocument?.name}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-hidden flex flex-col">
          {selectedDocument?.url && (
            <>
              {selectedDocument.name.toLowerCase().endsWith('.pdf') ? (
                <PDFImageViewer url={selectedDocument.url} fileName={selectedDocument.name} />
              ) : (
                <img
                  src={selectedDocument.url}
                  alt={selectedDocument.name}
                  className="max-w-full max-h-[60vh] object-contain mx-auto"
                />
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
    
    {/* Carrier Rate History Dialog */}
    {selectedLoadForHistory && (
      <CarrierRateHistoryDialog
        open={rateHistoryDialogOpen}
        onOpenChange={setRateHistoryDialogOpen}
        loadId={selectedLoadForHistory.id}
        loadNumber={selectedLoadForHistory.loadNumber}
      />
    )}
    </>
  );
}
