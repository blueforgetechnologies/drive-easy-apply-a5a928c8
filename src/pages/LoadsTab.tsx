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
import { Search, Plus, Edit, Trash2, Truck, MapPin, DollarSign, Download, X, Check, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, FileText, CheckCircle2, ExternalLink, ShieldCheck, History } from "lucide-react";
import { AddCustomerDialog } from "@/components/AddCustomerDialog";
import { RateConfirmationUploader } from "@/components/RateConfirmationUploader";
import { NewCustomerPrompt } from "@/components/NewCustomerPrompt";
import { SearchableEntitySelect } from "@/components/SearchableEntitySelect";
import { PDFImageViewer } from "@/components/PDFImageViewer";
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
  const [customers, setCustomers] = useState<any[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [dateFilter, setDateFilter] = useState<{ from: string; to: string }>({ from: "", to: "" });
  const [pendingCustomerData, setPendingCustomerData] = useState<any>(null);
  const [matchedCustomerId, setMatchedCustomerId] = useState<string | null>(null);
  const [rateConfirmationFile, setRateConfirmationFile] = useState<File | null>(null);
  const [loadDocuments, setLoadDocuments] = useState<Record<string, LoadDocument[]>>({});
  const [documentDialogOpen, setDocumentDialogOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<{ url: string; name: string; type: string } | null>(null);
  const [loadApprovalMode, setLoadApprovalMode] = useState(false);
  const [vehiclesRequiringApproval, setVehiclesRequiringApproval] = useState<string[]>([]);
  const [rateHistoryDialogOpen, setRateHistoryDialogOpen] = useState(false);
  const [selectedLoadForHistory, setSelectedLoadForHistory] = useState<{ id: string; loadNumber: string } | null>(null);
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
  
  // Generate manual load number in ME-YYMMDD-XXX format
  const generateManualLoadNumber = () => {
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `ME-${year}${month}${day}-${random}`;
  };
  
  const [formData, setFormData] = useState({
    load_number: generateManualLoadNumber(),
    load_type: "internal",
    shipper_load_id: "",
    reference_number: "",
    broker_name: "",
    broker_address: "",
    broker_city: "",
    broker_state: "",
    broker_zip: "",
    broker_contact: "",
    broker_phone: "",
    broker_email: "",
    broker_mc_number: "",
    billing_party_name: "",
    billing_party_address: "",
    billing_party_city: "",
    billing_party_state: "",
    billing_party_zip: "",
    billing_party_contact: "",
    billing_party_phone: "",
    billing_party_email: "",
    // Pickup/Origin (consolidated from shipper + pickup)
    shipper_name: "",
    shipper_address: "",
    shipper_city: "",
    shipper_state: "",
    shipper_zip: "",
    shipper_contact: "",
    shipper_phone: "",
    shipper_email: "",
    pickup_date: "",
    // Delivery/Destination (consolidated from receiver + delivery)
    receiver_name: "",
    receiver_address: "",
    receiver_city: "",
    receiver_state: "",
    receiver_zip: "",
    receiver_contact: "",
    receiver_phone: "",
    receiver_email: "",
    delivery_date: "",
    // Cargo & Equipment
    cargo_description: "",
    cargo_weight: "",
    cargo_pieces: "",
    estimated_miles: "",
    rate: "",
    customer_id: "",
    equipment_type: "",
    vehicle_size: "",
    carrier_id: "",
  });
  const [defaultCarrierId, setDefaultCarrierId] = useState<string | null>(null);
  const [currentUserDispatcherId, setCurrentUserDispatcherId] = useState<string | null>(null);

  // Reload when tenant changes - use isReady for proper guard
  useEffect(() => {
    if (isReady) {
      loadData();
      loadDriversAndVehicles();
    }
  }, [tenantId, isReady]);

  // Set default carrier in form when loaded
  useEffect(() => {
    if (defaultCarrierId) {
      setFormData(prev => ({ ...prev, carrier_id: defaultCarrierId }));
    }
  }, [defaultCarrierId]);

  const loadDriversAndVehicles = async () => {
    // Guard: wait until tenant context is ready
    if (!isReady) return;
    
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      
      // Use tenant-scoped queries for all tenant-owned tables
      const [driversResult, vehiclesResult, customersResult, companyProfileResult, dispatcherResult, vehiclesApprovalResult] = await Promise.all([
        query("applications").select("id, personal_info").eq("driver_status", "active"),
        query("vehicles").select("id, vehicle_number, requires_load_approval").eq("status", "active"),
        query("customers").select("id, name, contact_name, mc_number, email, phone, city, state").eq("status", "active"),
        supabase.from("company_profile").select("default_carrier_id").limit(1).maybeSingle(),
        user?.id ? query("dispatchers").select("id").eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null }),
        query("vehicles").select("id").eq("requires_load_approval", true),
      ]);
      
      if (driversResult.data) setDrivers(driversResult.data);
      if (vehiclesResult.data) setVehicles(vehiclesResult.data);
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
  const findMatchingCustomer = useCallback((customerName: string | undefined, mcNumber: string | undefined, email: string | undefined) => {
    if (!customerName && !mcNumber && !email) return null;
    
    // Normalize for comparison
    const normalizedName = customerName?.toLowerCase().trim();
    const normalizedMc = mcNumber?.replace(/[^0-9]/g, '');
    const normalizedEmail = email?.toLowerCase().trim();
    
    // First pass: Check MC number match (most reliable identifier)
    if (normalizedMc) {
      for (const customer of customers) {
        if (customer.mc_number) {
          const customerMc = customer.mc_number.replace(/[^0-9]/g, '');
          if (customerMc === normalizedMc) {
            return customer;
          }
        }
      }
    }
    
    // Second pass: Check exact name match (prioritize company name over email)
    if (normalizedName) {
      for (const customer of customers) {
        if (customer.name) {
          const customerNameLower = customer.name.toLowerCase().trim();
          if (customerNameLower === normalizedName) {
            return customer;
          }
        }
      }
    }
    
    // Third pass: Check name similarity (contains match)
    if (normalizedName) {
      for (const customer of customers) {
        if (customer.name) {
          const customerNameLower = customer.name.toLowerCase().trim();
          if (customerNameLower.includes(normalizedName) || 
              normalizedName.includes(customerNameLower)) {
            return customer;
          }
        }
      }
    }
    
    // Fourth pass: Check full email match (only if name didn't match)
    // Note: Email matching is lowest priority because billing emails like AP@xyz.com 
    // may not represent the actual customer company name
    if (normalizedEmail) {
      for (const customer of customers) {
        if (customer.email?.toLowerCase().trim() === normalizedEmail) {
          return customer;
        }
      }
    }
    
    return null;
  }, [customers]);

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

  // Helper function to calculate distance between two locations
  const calculateDistance = async (
    pickupCity: string, 
    pickupState: string, 
    deliveryCity: string, 
    deliveryState: string
  ): Promise<number | null> => {
    try {
      // Geocode pickup location
      const pickupQuery = `${pickupCity}, ${pickupState}`;
      const { data: pickupData, error: pickupError } = await supabase.functions.invoke('geocode', {
        body: { query: pickupQuery }
      });
      
      if (pickupError || !pickupData?.lat || !pickupData?.lng) {
        console.error('Failed to geocode pickup:', pickupError);
        return null;
      }

      // Geocode delivery location
      const deliveryQuery = `${deliveryCity}, ${deliveryState}`;
      const { data: deliveryData, error: deliveryError } = await supabase.functions.invoke('geocode', {
        body: { query: deliveryQuery }
      });

      if (deliveryError || !deliveryData?.lat || !deliveryData?.lng) {
        console.error('Failed to geocode delivery:', deliveryError);
        return null;
      }

      // Calculate distance using Haversine formula (approximation)
      const R = 3959; // Earth's radius in miles
      const dLat = (deliveryData.lat - pickupData.lat) * Math.PI / 180;
      const dLon = (deliveryData.lng - pickupData.lng) * Math.PI / 180;
      const lat1 = pickupData.lat * Math.PI / 180;
      const lat2 = deliveryData.lat * Math.PI / 180;

      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const directDistance = R * c;

      // Apply road distance multiplier (typically 1.2-1.4 for driving vs straight line)
      const estimatedRoadDistance = Math.round(directDistance * 1.25);

      console.log(`Calculated distance: ${pickupQuery} -> ${deliveryQuery} = ${estimatedRoadDistance} miles`);
      return estimatedRoadDistance;
    } catch (error) {
      console.error('Error calculating distance:', error);
      return null;
    }
  };

  const handleAddLoad = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // CRITICAL: Ensure tenant_id is set to prevent cross-tenant data leakage
    if (!tenantId) {
      toast.error("No tenant selected. Please select an organization first.");
      return;
    }
    
    try {
      const estimatedMiles = formData.estimated_miles ? parseFloat(formData.estimated_miles) : null;
      
      // Exclude broker_mc_number from insert (it's UI-only, MC stored in customers table)
      const { broker_mc_number, ...formDataForInsert } = formData;
      
      const { data: insertedLoad, error } = await (supabase
        .from("loads") as any)
        .insert({
          ...formDataForInsert,
          tenant_id: tenantId, // CRITICAL: Explicitly set tenant_id
          status: "available",
          // Copy shipper data to pickup fields for display consistency
          pickup_city: formData.shipper_city || null,
          pickup_state: formData.shipper_state || null,
          pickup_location: formData.shipper_address || null,
          pickup_zip: formData.shipper_zip || null,
          // Copy receiver data to delivery fields for display consistency
          delivery_city: formData.receiver_city || null,
          delivery_state: formData.receiver_state || null,
          delivery_location: formData.receiver_address || null,
          delivery_zip: formData.receiver_zip || null,
          cargo_weight: formData.cargo_weight ? parseFloat(formData.cargo_weight) : null,
          cargo_pieces: formData.cargo_pieces ? parseInt(formData.cargo_pieces, 10) : null,
          estimated_miles: estimatedMiles,
          rate: formData.rate ? parseFloat(formData.rate) : null,
          customer_id: formData.customer_id || null,
          carrier_id: formData.carrier_id || null,
          assigned_dispatcher_id: currentUserDispatcherId || null,
          load_owner_id: currentUserDispatcherId || null,
        })
        .select('id')
        .single();

      if (error) throw error;
      
      const loadId = (insertedLoad as any)?.id as string | undefined;

      // If no miles were provided, calculate distance from shipper/receiver cities
      if (!estimatedMiles && loadId && formData.shipper_city && formData.shipper_state && formData.receiver_city && formData.receiver_state) {
        const calculatedMiles = await calculateDistance(
          formData.shipper_city,
          formData.shipper_state,
          formData.receiver_city,
          formData.receiver_state
        );

        if (calculatedMiles && calculatedMiles > 0) {
          // Update the load with calculated miles
          const { error: updateError } = await supabase
            .from("loads" as any)
            .update({ estimated_miles: calculatedMiles })
            .eq('id', loadId);

          if (updateError) {
            console.error('Failed to update load with calculated miles:', updateError);
          } else {
            toast.success(`Distance calculated: ${calculatedMiles} miles`);
          }
        }
      }

      // Upload rate confirmation file if present
      if (rateConfirmationFile && loadId) {
        try {
          const fileExt = rateConfirmationFile.name.split('.').pop();
          const fileName = `${loadId}/rate_confirmation/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

          // Upload to storage
          const { error: uploadError } = await supabase.storage
            .from('load-documents')
            .upload(fileName, rateConfirmationFile);

          if (uploadError) throw uploadError;

          // Save document record
          const { error: dbError } = await supabase
            .from('load_documents')
            .insert({
              load_id: loadId,
              tenant_id: tenantId, // CRITICAL: Explicitly set tenant_id
              document_type: 'rate_confirmation',
              file_name: rateConfirmationFile.name,
              file_url: fileName,
              file_size: rateConfirmationFile.size,
            });

          if (dbError) throw dbError;
          
          toast.success("Rate confirmation saved to documents");
        } catch (uploadErr: any) {
          console.error("Failed to save rate confirmation:", uploadErr);
          toast.error("Load created but failed to save rate confirmation");
        }
      }

      toast.success("Load created successfully");
      setDialogOpen(false);
      setRateConfirmationFile(null);
      setFormData({
        load_number: generateManualLoadNumber(),
        load_type: "internal",
        shipper_load_id: "",
        reference_number: "",
        broker_name: "",
        broker_address: "",
        broker_city: "",
        broker_state: "",
        broker_zip: "",
        broker_contact: "",
        broker_phone: "",
        broker_email: "",
        broker_mc_number: "",
        billing_party_name: "",
        billing_party_address: "",
        billing_party_city: "",
        billing_party_state: "",
        billing_party_zip: "",
        billing_party_contact: "",
        billing_party_phone: "",
        billing_party_email: "",
        shipper_name: "",
        shipper_address: "",
        shipper_city: "",
        shipper_state: "",
        shipper_zip: "",
        shipper_contact: "",
        shipper_phone: "",
        shipper_email: "",
        pickup_date: "",
        receiver_name: "",
        receiver_address: "",
        receiver_city: "",
        receiver_state: "",
        receiver_zip: "",
        receiver_contact: "",
        receiver_phone: "",
        receiver_email: "",
        delivery_date: "",
        cargo_description: "",
        cargo_weight: "",
        cargo_pieces: "",
        estimated_miles: "",
        rate: "",
        customer_id: "",
        equipment_type: "",
        vehicle_size: "",
        carrier_id: defaultCarrierId || "",
      });
      loadData();
    } catch (error: any) {
      toast.error("Failed to create load: " + error.message);
    }
  };

  const handleAddNewCustomer = async (name: string, additionalData: Record<string, string>) => {
    // Automatic customer creation is disabled - users must add customers manually via the Customers tab
    toast.error("Please add customers manually from the Customers tab (Business Manager → Customers → Add Customer)");
    return;
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
          <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) {
              // Reset customer matching state when dialog closes
              setPendingCustomerData(null);
              setMatchedCustomerId(null);
            }
          }}>
            <DialogTrigger asChild>
              <Button className="gap-2 flex-1 sm:flex-none h-11 sm:h-10 rounded-xl">
                <Plus className="h-4 w-4" />
                Create Load
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto mx-4 sm:mx-auto rounded-2xl p-0">
            <DialogHeader className="px-6 pt-5 pb-3 border-b bg-gradient-to-r from-primary/5 to-transparent">
              <DialogTitle className="text-xl font-bold">Create New Load</DialogTitle>
            </DialogHeader>
            
            <div className="px-6 py-4 space-y-4">
              {/* Rate Confirmation Upload - Premium styled */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-md bg-blue-500/10">
                    <FileText className="h-4 w-4 text-blue-500" />
                  </div>
                  <h3 className="font-semibold text-sm text-blue-600 dark:text-blue-400">Quick Fill from Rate Confirmation</h3>
                </div>
                <RateConfirmationUploader
                  onDataExtracted={(data) => {
                    const extractTime = (timeStr: string | undefined): string | null => {
                      if (!timeStr) return null;
                      const rangeMatch = timeStr.match(/^(\d{1,2}:\d{2})/);
                      if (rangeMatch) return rangeMatch[1].padStart(5, '0');
                      const simpleMatch = timeStr.match(/^(\d{1,2}):(\d{2})/);
                      if (simpleMatch) return `${simpleMatch[1].padStart(2, '0')}:${simpleMatch[2]}`;
                      return null;
                    };

                    const pickupTime = extractTime(data.pickup_time);
                    const deliveryTime = extractTime(data.delivery_time);

                    setFormData(prev => ({
                      ...prev,
                      shipper_load_id: data.customer_load_id || prev.shipper_load_id,
                      reference_number: data.customer_load_id || data.reference_number || prev.reference_number,
                      broker_name: data.customer_name || prev.broker_name,
                      broker_address: data.customer_address || prev.broker_address,
                      broker_city: data.customer_city || prev.broker_city,
                      broker_state: data.customer_state || prev.broker_state,
                      broker_zip: data.customer_zip || prev.broker_zip,
                      broker_contact: data.customer_contact || prev.broker_contact,
                      broker_phone: data.customer_phone || prev.broker_phone,
                      broker_email: data.customer_email || prev.broker_email,
                      // Billing party - AI extracts or falls back to broker in the edge function
                      billing_party_name: data.billing_party_name || prev.billing_party_name,
                      billing_party_address: data.billing_party_address || prev.billing_party_address,
                      billing_party_city: data.billing_party_city || prev.billing_party_city,
                      billing_party_state: data.billing_party_state || prev.billing_party_state,
                      billing_party_zip: data.billing_party_zip || prev.billing_party_zip,
                      billing_party_contact: data.billing_party_contact || prev.billing_party_contact,
                      billing_party_phone: data.billing_party_phone || prev.billing_party_phone,
                      billing_party_email: data.billing_party_email || prev.billing_party_email,
                      shipper_name: data.shipper_name || prev.shipper_name,
                      shipper_address: data.shipper_address || prev.shipper_address,
                      shipper_city: data.shipper_city || prev.shipper_city,
                      shipper_state: data.shipper_state || prev.shipper_state,
                      shipper_zip: data.shipper_zip || prev.shipper_zip,
                      shipper_contact: data.shipper_contact || prev.shipper_contact,
                      shipper_phone: data.shipper_phone || data.stops?.[0]?.contact_phone || prev.shipper_phone,
                      shipper_email: data.shipper_email || prev.shipper_email,
                      pickup_date: data.pickup_date && pickupTime 
                        ? `${data.pickup_date}T${pickupTime}` 
                        : data.pickup_date 
                          ? `${data.pickup_date}T08:00` 
                          : prev.pickup_date,
                      receiver_name: data.receiver_name || prev.receiver_name,
                      receiver_address: data.receiver_address || prev.receiver_address,
                      receiver_city: data.receiver_city || prev.receiver_city,
                      receiver_state: data.receiver_state || prev.receiver_state,
                      receiver_zip: data.receiver_zip || prev.receiver_zip,
                      receiver_contact: data.receiver_contact || prev.receiver_contact,
                      receiver_phone: data.receiver_phone || data.stops?.[1]?.contact_phone || prev.receiver_phone,
                      receiver_email: data.receiver_email || prev.receiver_email,
                      delivery_date: data.delivery_date && deliveryTime 
                        ? `${data.delivery_date}T${deliveryTime}` 
                        : data.delivery_date 
                          ? `${data.delivery_date}T08:00` 
                          : prev.delivery_date,
                      cargo_description: data.cargo_description || prev.cargo_description,
                      cargo_weight: data.cargo_weight?.toString() || prev.cargo_weight,
                      cargo_pieces: data.cargo_pieces?.toString() || prev.cargo_pieces,
                      estimated_miles: data.estimated_miles?.toString() || prev.estimated_miles,
                      rate: data.rate?.toString() || prev.rate,
                      equipment_type: data.equipment_type || prev.equipment_type,
                      vehicle_size: data.vehicle_size || prev.vehicle_size,
                    }));

                    if (data.customer_name) {
                      const matchedCustomer = findMatchingCustomer(
                        data.customer_name,
                        data.customer_mc_number,
                        data.customer_email
                      );

                      if (matchedCustomer) {
                        // Populate form with EXISTING customer data (not just extracted RC data)
                        setFormData(prev => ({ 
                          ...prev, 
                          customer_id: matchedCustomer.id,
                          // Use matched customer's data for broker/customer fields
                          broker_name: matchedCustomer.name || prev.broker_name,
                          broker_address: matchedCustomer.address || prev.broker_address,
                          broker_city: matchedCustomer.city || prev.broker_city,
                          broker_state: matchedCustomer.state || prev.broker_state,
                          broker_zip: matchedCustomer.zip || prev.broker_zip,
                          broker_phone: matchedCustomer.phone || prev.broker_phone,
                          broker_email: matchedCustomer.email || prev.broker_email,
                          broker_contact: matchedCustomer.contact_name || prev.broker_contact,
                          broker_mc_number: matchedCustomer.mc_number || prev.broker_mc_number,
                        }));
                        setMatchedCustomerId(matchedCustomer.id);
                        setPendingCustomerData(null);
                        toast.success(`Matched existing customer: ${matchedCustomer.name}`);
                      } else {
                        setMatchedCustomerId(null);
                        setPendingCustomerData({
                          customer_name: data.customer_name,
                          customer_address: data.customer_address,
                          customer_city: data.customer_city,
                          customer_state: data.customer_state,
                          customer_zip: data.customer_zip,
                          customer_mc_number: data.customer_mc_number,
                          customer_email: data.customer_email,
                          customer_phone: data.customer_phone,
                          customer_contact: data.customer_contact,
                        });
                      }
                    }
                  }}
                  onFileSelected={(file) => setRateConfirmationFile(file)}
                />

                {matchedCustomerId && (
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-green-500/10 border border-green-500/30">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <span className="text-sm text-green-600 font-medium">
                      Customer matched: {customers.find(c => c.id === matchedCustomerId)?.name}
                    </span>
                  </div>
                )}

                {pendingCustomerData && (
                  <NewCustomerPrompt
                    extractedData={pendingCustomerData}
                    onCustomerAdded={async (customerId) => {
                      await loadDriversAndVehicles();
                      setFormData(prev => ({ ...prev, customer_id: customerId }));
                      setMatchedCustomerId(customerId);
                      setPendingCustomerData(null);
                    }}
                    onDismiss={() => setPendingCustomerData(null)}
                  />
                )}
              </div>
            
              <form onSubmit={handleAddLoad} className="space-y-4">
                {/* Load Identification - Compact 3 column grid */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="load_number" className="text-xs font-medium text-muted-foreground">Our Load Number</Label>
                    <Input
                      id="load_number"
                      value={formData.load_number}
                      onChange={(e) => setFormData({ ...formData, load_number: e.target.value })}
                      className="h-9"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="shipper_load_id" className="text-xs font-medium text-muted-foreground">Customer Load ID</Label>
                    <Input
                      id="shipper_load_id"
                      value={formData.shipper_load_id}
                      onChange={(e) => setFormData({ ...formData, shipper_load_id: e.target.value })}
                      placeholder="Pro#, Order#, Ref#..."
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="load_type" className="text-xs font-medium text-muted-foreground">Load Type</Label>
                    <Select value={formData.load_type} onValueChange={(value) => setFormData({ ...formData, load_type: value })}>
                      <SelectTrigger className="h-9">
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

                {/* Customer/Broker Information */}
                <div className="rounded-lg border border-amber-200 dark:border-amber-800/60 bg-gradient-to-br from-amber-100/80 to-amber-50/40 dark:from-amber-950/40 dark:to-amber-900/20 p-3 space-y-3">
                  <div className="flex items-center gap-2 pb-1.5 border-b border-amber-300/60 dark:border-amber-700/60">
                    <div className="p-1 rounded-md bg-amber-500/20">
                      <DollarSign className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <h3 className="font-semibold text-sm text-amber-700 dark:text-amber-400">Customer/Broker Information</h3>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <div className="col-span-2 space-y-1">
                      <Label htmlFor="broker_name" className="text-xs font-medium text-muted-foreground">Company Name</Label>
                      <SearchableEntitySelect
                        entities={customers.map(c => ({ id: c.id, name: c.name, city: c.city, state: c.state }))}
                        value={formData.broker_name}
                        placeholder="Search customers..."
                        onSelect={(entity) => {
                          const customer = customers.find(c => c.id === entity.id);
                          setFormData(prev => ({
                            ...prev,
                            broker_name: entity.name,
                            customer_id: entity.id,
                            broker_contact: customer?.contact_name || prev.broker_contact,
                            broker_phone: customer?.phone || prev.broker_phone,
                            broker_email: customer?.email || prev.broker_email,
                            broker_address: customer?.address || prev.broker_address,
                            broker_city: customer?.city || prev.broker_city,
                            broker_state: customer?.state || prev.broker_state,
                            broker_zip: customer?.zip || prev.broker_zip,
                          }));
                        }}
                        onAddNew={handleAddNewCustomer}
                        entityType="customer"
                        className="h-8"
                      />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label htmlFor="broker_address" className="text-xs font-medium text-muted-foreground">Address</Label>
                      <Input id="broker_address" value={formData.broker_address} onChange={(e) => setFormData({ ...formData, broker_address: e.target.value })} className="h-8" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="broker_city" className="text-xs font-medium text-muted-foreground">City</Label>
                      <Input id="broker_city" value={formData.broker_city} onChange={(e) => setFormData({ ...formData, broker_city: e.target.value })} className="h-8" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="broker_state" className="text-xs font-medium text-muted-foreground">State</Label>
                      <Input id="broker_state" value={formData.broker_state} onChange={(e) => setFormData({ ...formData, broker_state: e.target.value })} placeholder="CA" className="h-8" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="broker_zip" className="text-xs font-medium text-muted-foreground">ZIP</Label>
                      <Input id="broker_zip" value={formData.broker_zip} onChange={(e) => setFormData({ ...formData, broker_zip: e.target.value })} className="h-8" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="broker_contact" className="text-xs font-medium text-muted-foreground">Contact</Label>
                      <Input id="broker_contact" value={formData.broker_contact} onChange={(e) => setFormData({ ...formData, broker_contact: e.target.value })} className="h-8" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="broker_phone" className="text-xs font-medium text-muted-foreground">Phone</Label>
                      <Input id="broker_phone" type="tel" value={formData.broker_phone} onChange={(e) => setFormData({ ...formData, broker_phone: e.target.value })} className="h-8" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="broker_email" className="text-xs font-medium text-muted-foreground">Email</Label>
                      <Input id="broker_email" type="email" value={formData.broker_email} onChange={(e) => setFormData({ ...formData, broker_email: e.target.value })} className="h-8" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="broker_mc_number" className="text-xs font-medium text-muted-foreground">MC Number</Label>
                      <Input id="broker_mc_number" value={formData.broker_mc_number || ""} onChange={(e) => setFormData({ ...formData, broker_mc_number: e.target.value })} className="h-8" placeholder="MC#" />
                    </div>
                  </div>
                </div>

                {/* Billing Party Information */}
                <div className="rounded-lg border border-violet-200 dark:border-violet-800/60 bg-gradient-to-br from-violet-100/80 to-violet-50/40 dark:from-violet-950/40 dark:to-violet-900/20 p-3 space-y-3">
                  <div className="flex items-center gap-2 pb-1.5 border-b border-violet-300/60 dark:border-violet-700/60">
                    <div className="p-1 rounded-md bg-violet-500/20">
                      <FileText className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
                    </div>
                    <h3 className="font-semibold text-sm text-violet-700 dark:text-violet-400">Billing Party (Invoice To)</h3>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <div className="col-span-2 space-y-1">
                      <Label htmlFor="billing_party_name" className="text-xs font-medium text-muted-foreground">Company Name</Label>
                      <Input 
                        id="billing_party_name" 
                        value={formData.billing_party_name} 
                        onChange={(e) => setFormData({ ...formData, billing_party_name: e.target.value })} 
                        placeholder="Defaults to Customer/Broker if empty" 
                        className="h-8" 
                      />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label htmlFor="billing_party_address" className="text-xs font-medium text-muted-foreground">Address</Label>
                      <Input id="billing_party_address" value={formData.billing_party_address} onChange={(e) => setFormData({ ...formData, billing_party_address: e.target.value })} className="h-8" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="billing_party_city" className="text-xs font-medium text-muted-foreground">City</Label>
                      <Input id="billing_party_city" value={formData.billing_party_city} onChange={(e) => setFormData({ ...formData, billing_party_city: e.target.value })} className="h-8" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="billing_party_state" className="text-xs font-medium text-muted-foreground">State</Label>
                      <Input id="billing_party_state" value={formData.billing_party_state} onChange={(e) => setFormData({ ...formData, billing_party_state: e.target.value })} placeholder="CA" className="h-8" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="billing_party_zip" className="text-xs font-medium text-muted-foreground">ZIP</Label>
                      <Input id="billing_party_zip" value={formData.billing_party_zip} onChange={(e) => setFormData({ ...formData, billing_party_zip: e.target.value })} className="h-8" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="billing_party_contact" className="text-xs font-medium text-muted-foreground">Contact</Label>
                      <Input id="billing_party_contact" value={formData.billing_party_contact} onChange={(e) => setFormData({ ...formData, billing_party_contact: e.target.value })} className="h-8" />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label htmlFor="billing_party_phone" className="text-xs font-medium text-muted-foreground">Phone</Label>
                      <Input id="billing_party_phone" type="tel" value={formData.billing_party_phone} onChange={(e) => setFormData({ ...formData, billing_party_phone: e.target.value })} className="h-8" />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label htmlFor="billing_party_email" className="text-xs font-medium text-muted-foreground">Email</Label>
                      <Input id="billing_party_email" type="email" value={formData.billing_party_email} onChange={(e) => setFormData({ ...formData, billing_party_email: e.target.value })} className="h-8" />
                    </div>
                  </div>
                </div>

                {/* Shipper/Pickup Information */}
                <div className="rounded-lg border border-emerald-200 dark:border-emerald-800/60 bg-gradient-to-br from-emerald-100/80 to-emerald-50/40 dark:from-emerald-950/40 dark:to-emerald-900/20 p-3 space-y-2">
                  <div className="flex items-center gap-2 pb-1.5 border-b border-emerald-300/60 dark:border-emerald-700/60">
                    <div className="p-1 rounded-md bg-emerald-500/20">
                      <MapPin className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <h3 className="font-semibold text-sm text-emerald-700 dark:text-emerald-400">Shipper/Pickup Information</h3>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <div className="col-span-2 space-y-1">
                      <Label htmlFor="shipper_name" className="text-xs font-medium text-muted-foreground">Company Name</Label>
                      <Input id="shipper_name" value={formData.shipper_name} onChange={(e) => setFormData({ ...formData, shipper_name: e.target.value })} placeholder="Company name" className="h-8" />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label htmlFor="shipper_address" className="text-xs font-medium text-muted-foreground">Address</Label>
                      <Input id="shipper_address" value={formData.shipper_address} onChange={(e) => setFormData({ ...formData, shipper_address: e.target.value })} className="h-8" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="shipper_city" className="text-xs font-medium text-muted-foreground">City</Label>
                      <Input id="shipper_city" value={formData.shipper_city} onChange={(e) => setFormData({ ...formData, shipper_city: e.target.value })} className="h-8" required />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="shipper_state" className="text-xs font-medium text-muted-foreground">State</Label>
                      <Input id="shipper_state" value={formData.shipper_state} onChange={(e) => setFormData({ ...formData, shipper_state: e.target.value })} placeholder="CA" className="h-8" required />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="shipper_zip" className="text-xs font-medium text-muted-foreground">ZIP</Label>
                      <Input id="shipper_zip" value={formData.shipper_zip} onChange={(e) => setFormData({ ...formData, shipper_zip: e.target.value })} className="h-8" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="shipper_contact" className="text-xs font-medium text-muted-foreground">Contact</Label>
                      <Input id="shipper_contact" value={formData.shipper_contact} onChange={(e) => setFormData({ ...formData, shipper_contact: e.target.value })} className="h-8" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="shipper_phone" className="text-xs font-medium text-muted-foreground">Phone</Label>
                      <Input id="shipper_phone" type="tel" value={formData.shipper_phone} onChange={(e) => setFormData({ ...formData, shipper_phone: e.target.value })} className="h-8" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="shipper_email" className="text-xs font-medium text-muted-foreground">Email</Label>
                      <Input id="shipper_email" type="email" value={formData.shipper_email} onChange={(e) => setFormData({ ...formData, shipper_email: e.target.value })} className="h-8" />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label htmlFor="pickup_date" className="text-xs font-medium text-muted-foreground">Pickup Date & Time</Label>
                      <Input id="pickup_date" type="datetime-local" value={formData.pickup_date} onChange={(e) => setFormData({ ...formData, pickup_date: e.target.value })} className="h-8" required />
                    </div>
                  </div>
                </div>

                {/* Receiver/Delivery Information */}
                <div className="rounded-lg border border-rose-200 dark:border-rose-800/60 bg-gradient-to-br from-rose-100/80 to-rose-50/40 dark:from-rose-950/40 dark:to-rose-900/20 p-3 space-y-2">
                  <div className="flex items-center gap-2 pb-1.5 border-b border-rose-300/60 dark:border-rose-700/60">
                    <div className="p-1 rounded-md bg-rose-500/20">
                      <MapPin className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
                    </div>
                    <h3 className="font-semibold text-sm text-rose-700 dark:text-rose-400">Receiver/Delivery Information</h3>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <div className="col-span-2 space-y-1">
                      <Label htmlFor="receiver_name" className="text-xs font-medium text-muted-foreground">Company Name</Label>
                      <Input id="receiver_name" value={formData.receiver_name} onChange={(e) => setFormData({ ...formData, receiver_name: e.target.value })} placeholder="Company name" className="h-8" />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label htmlFor="receiver_address" className="text-xs font-medium text-muted-foreground">Address</Label>
                      <Input id="receiver_address" value={formData.receiver_address} onChange={(e) => setFormData({ ...formData, receiver_address: e.target.value })} className="h-8" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="receiver_city" className="text-xs font-medium text-muted-foreground">City</Label>
                      <Input id="receiver_city" value={formData.receiver_city} onChange={(e) => setFormData({ ...formData, receiver_city: e.target.value })} className="h-8" required />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="receiver_state" className="text-xs font-medium text-muted-foreground">State</Label>
                      <Input id="receiver_state" value={formData.receiver_state} onChange={(e) => setFormData({ ...formData, receiver_state: e.target.value })} placeholder="NY" className="h-8" required />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="receiver_zip" className="text-xs font-medium text-muted-foreground">ZIP</Label>
                      <Input id="receiver_zip" value={formData.receiver_zip} onChange={(e) => setFormData({ ...formData, receiver_zip: e.target.value })} className="h-8" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="receiver_contact" className="text-xs font-medium text-muted-foreground">Contact</Label>
                      <Input id="receiver_contact" value={formData.receiver_contact} onChange={(e) => setFormData({ ...formData, receiver_contact: e.target.value })} className="h-8" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="receiver_phone" className="text-xs font-medium text-muted-foreground">Phone</Label>
                      <Input id="receiver_phone" type="tel" value={formData.receiver_phone} onChange={(e) => setFormData({ ...formData, receiver_phone: e.target.value })} className="h-8" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="receiver_email" className="text-xs font-medium text-muted-foreground">Email</Label>
                      <Input id="receiver_email" type="email" value={formData.receiver_email} onChange={(e) => setFormData({ ...formData, receiver_email: e.target.value })} className="h-8" />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label htmlFor="delivery_date" className="text-xs font-medium text-muted-foreground">Delivery Date & Time</Label>
                      <Input id="delivery_date" type="datetime-local" value={formData.delivery_date} onChange={(e) => setFormData({ ...formData, delivery_date: e.target.value })} className="h-8" required />
                    </div>
                  </div>
                </div>

                {/* Equipment & Cargo */}
                <div className="rounded-lg border border-slate-200 dark:border-slate-700/60 bg-gradient-to-br from-slate-100/80 to-slate-50/40 dark:from-slate-900/50 dark:to-slate-800/30 p-3 space-y-2">
                  <div className="flex items-center gap-2 pb-1.5 border-b border-slate-300/60 dark:border-slate-600/60">
                    <div className="p-1 rounded-md bg-slate-500/20">
                      <Truck className="h-3.5 w-3.5 text-slate-600 dark:text-slate-400" />
                    </div>
                    <h3 className="font-semibold text-sm text-slate-700 dark:text-slate-400">Equipment & Cargo</h3>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="equipment_type" className="text-xs font-medium text-muted-foreground">Equipment</Label>
                      <Select value={formData.equipment_type} onValueChange={(value) => setFormData({ ...formData, equipment_type: value })}>
                        <SelectTrigger className="h-8">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent className="bg-background z-50">
                          <SelectItem value="dry_van">Dry Van</SelectItem>
                          <SelectItem value="reefer">Reefer</SelectItem>
                          <SelectItem value="flatbed">Flatbed</SelectItem>
                          <SelectItem value="step_deck">Step Deck</SelectItem>
                          <SelectItem value="box_truck">Box Truck</SelectItem>
                          <SelectItem value="sprinter">Sprinter</SelectItem>
                          <SelectItem value="conestoga">Conestoga</SelectItem>
                          <SelectItem value="lowboy">Lowboy</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="vehicle_size" className="text-xs font-medium text-muted-foreground">Size</Label>
                      <Input id="vehicle_size" value={formData.vehicle_size} onChange={(e) => setFormData({ ...formData, vehicle_size: e.target.value })} placeholder="53ft" className="h-8" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="cargo_weight" className="text-xs font-medium text-muted-foreground">Weight (lbs)</Label>
                      <Input id="cargo_weight" type="number" value={formData.cargo_weight} onChange={(e) => setFormData({ ...formData, cargo_weight: e.target.value })} className="h-8" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="cargo_pieces" className="text-xs font-medium text-muted-foreground">Pieces</Label>
                      <Input id="cargo_pieces" type="number" value={formData.cargo_pieces} onChange={(e) => setFormData({ ...formData, cargo_pieces: e.target.value })} className="h-8" />
                    </div>
                    <div className="col-span-3 space-y-1">
                      <Label htmlFor="cargo_description" className="text-xs font-medium text-muted-foreground">Cargo Description</Label>
                      <Textarea id="cargo_description" value={formData.cargo_description} onChange={(e) => setFormData({ ...formData, cargo_description: e.target.value })} rows={1} className="min-h-[32px] resize-none" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="estimated_miles" className="text-xs font-medium text-muted-foreground">Loaded Miles</Label>
                      <Input id="estimated_miles" type="number" value={formData.estimated_miles} onChange={(e) => setFormData({ ...formData, estimated_miles: e.target.value })} className="h-8" />
                    </div>
                  </div>
                </div>

                {/* Financial */}
                <div className="rounded-lg border border-green-200 dark:border-green-800/60 bg-gradient-to-br from-green-100/80 to-green-50/40 dark:from-green-950/40 dark:to-green-900/20 p-3 space-y-2">
                  <div className="flex items-center gap-2 pb-1.5 border-b border-green-300/60 dark:border-green-700/60">
                    <div className="p-1 rounded-md bg-green-500/20">
                      <DollarSign className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                    </div>
                    <h3 className="font-semibold text-sm text-green-700 dark:text-green-400">Financial</h3>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <div className="col-span-3 space-y-1">
                      <Label htmlFor="customer_id" className="text-xs font-medium text-muted-foreground">Customer (Who Pays)</Label>
                      <SearchableEntitySelect
                        entities={customers.map(c => ({ id: c.id, name: c.name, city: c.city, state: c.state }))}
                        value={customers.find(c => c.id === formData.customer_id)?.name || ""}
                        placeholder="Search customers..."
                        onSelect={(entity) => {
                          setFormData(prev => ({
                            ...prev,
                            customer_id: entity.id,
                          }));
                        }}
                        onAddNew={handleAddNewCustomer}
                        entityType="customer"
                        className="h-8"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="rate" className="text-xs font-medium text-muted-foreground">Rate ($)</Label>
                      <Input id="rate" type="number" step="0.01" value={formData.rate} onChange={(e) => setFormData({ ...formData, rate: e.target.value })} className="h-8" />
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 pt-2 pb-4">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1 h-10">
                    Cancel
                  </Button>
                  <Button type="submit" className="flex-1 h-10 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70">
                    Create Load
                  </Button>
                </div>
              </form>
            </div>
          </DialogContent>
        </Dialog>
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
          { key: "all", label: "All", count: statusCounts.all, activeClass: "btn-glossy-dark", badgeClass: "badge-inset" },
          { key: "action_needed", label: "Action Needed", count: statusCounts.action_needed, activeClass: "btn-glossy-danger", badgeClass: "badge-inset-danger" },
          { key: "pending_dispatch", label: "Pending", count: statusCounts.pending_dispatch, activeClass: "btn-glossy-warning", badgeClass: "badge-inset-warning" },
          { key: "available", label: "Available", count: statusCounts.available, activeClass: "btn-glossy-primary", badgeClass: "badge-inset-primary" },
          { key: "booked", label: "Booked", count: statusCounts.booked, activeClass: "btn-glossy-success", badgeClass: "badge-inset-success" },
          { key: "dispatched", label: "Dispatched", count: statusCounts.dispatched, activeClass: "btn-glossy-primary", badgeClass: "badge-inset-primary" },
          { key: "at_pickup", label: "Pickup", count: statusCounts.at_pickup, activeClass: "btn-glossy-warning", badgeClass: "badge-inset-warning" },
          { key: "in_transit", label: "Transit", count: statusCounts.in_transit, activeClass: "btn-glossy-primary", badgeClass: "badge-inset-primary" },
          { key: "at_delivery", label: "Delivery", count: statusCounts.at_delivery, activeClass: "btn-glossy-primary", badgeClass: "badge-inset-primary" },
          { key: "delivered", label: "Delivered", count: statusCounts.delivered, activeClass: "btn-glossy-success", badgeClass: "badge-inset-success" },
          { key: "completed", label: "Completed", count: statusCounts.completed, activeClass: "btn-glossy-success", badgeClass: "badge-inset-success" },
          { key: "closed", label: "CLOSED", count: statusCounts.closed, activeClass: "bg-black text-white dark:bg-white dark:text-black", badgeClass: "bg-white/20 text-white dark:bg-black/20 dark:text-black" },
          { key: "ready_for_audit", label: "Ready for Audit", count: statusCounts.ready_for_audit, activeClass: "btn-glossy-primary", badgeClass: "badge-inset-primary" },
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
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className={`py-2 px-2 ${isActionNeeded ? 'text-red-700 dark:text-red-300' : ''}`}>
                              <div className="font-semibold text-xs">
                                {load.vehicle?.vehicle_number || "N/A"}
                              </div>
                              <div className="text-xs text-muted-foreground mt-0.5">
                                {load.driver?.personal_info?.firstName && load.driver?.personal_info?.lastName
                                  ? `${load.driver.personal_info.firstName} ${load.driver.personal_info.lastName}`
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
