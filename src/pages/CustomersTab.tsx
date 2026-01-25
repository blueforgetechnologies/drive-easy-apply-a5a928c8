import { useEffect, useState, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Search, Plus, Edit, Trash2, Sparkles, ChevronLeft, ChevronRight, GitMerge, X, ChevronDown, Download, Upload } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useTenantFilter } from "@/hooks/useTenantFilter";
import { exportToExcel } from "@/lib/excel-utils";
import { ExcelImportDialog } from "@/components/ExcelImportDialog";

interface Customer {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  email_secondary: string | null;
  phone: string | null;
  phone_secondary: string | null;
  phone_mobile: string | null;
  phone_fax: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  status: string;
  payment_terms: string | null;
  credit_limit: number | null;
  notes: string | null;
  mc_number: string | null;
  dot_number: string | null;
  factoring_approval: string | null;
  customer_type: string | null;
}

type CustomerTypeFilter = 'all' | 'broker' | 'shipper' | 'receiver' | 'shipper_receiver';

export default function CustomersTab() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = searchParams.get("filter") || "active";
  const typeFilter = (searchParams.get("type") || "all") as CustomerTypeFilter;
  const { tenantId, shouldFilter } = useTenantFilter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [lookupValue, setLookupValue] = useState("");
  const [lookupType, setLookupType] = useState<"usdot" | "mc">("usdot");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [totalCustomerCount, setTotalCustomerCount] = useState(0);
  const ROWS_PER_PAGE = 50;

  // Close search dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Function to normalize names for duplicate detection
  const normalizeName = (name: string): string => {
    return name
      .toLowerCase()
      .replace(/\./g, '')
      .replace(/,/g, '')
      .replace(/\s+/g, ' ')
      .replace(/\s*(llc|inc|corp|incorporated|corporation|co\.?)(\s|$)/gi, '')
      .trim();
  };

  // Check if two names are potential duplicates
  const arePotentialDuplicates = (name1: string, name2: string): boolean => {
    const n1 = normalizeName(name1);
    const n2 = normalizeName(name2);
    
    // Exact match after normalization
    if (n1 === n2) return true;
    
    // First two words match
    const words1 = n1.split(' ').filter(w => w.length > 0);
    const words2 = n2.split(' ').filter(w => w.length > 0);
    
    if (words1.length >= 2 && words2.length >= 2) {
      if (words1[0] === words2[0] && words1[1] === words2[1]) {
        return true;
      }
    }
    
    // First word matches and it's substantial (>5 chars)
    if (words1.length >= 1 && words2.length >= 1) {
      if (words1[0] === words2[0] && words1[0].length > 5) {
        return true;
      }
    }
    
    return false;
  };

  // Count duplicates using improved matching
  const countDuplicates = (allCustomers: { id: string; name: string }[]) => {
    const duplicatePairs = new Set<string>();
    
    allCustomers.forEach((c1, i) => {
      allCustomers.slice(i + 1).forEach((c2) => {
        if (arePotentialDuplicates(c1.name, c2.name)) {
          duplicatePairs.add([c1.id, c2.id].sort().join('|'));
        }
      });
    });

    return duplicatePairs.size;
  };

  const aiUpdateMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('ai-update-customers');
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`AI update complete: ${data.created} created, ${data.updated} updated from ${data.processed} emails`);
      if (data.errors > 0) {
        toast.warning(`${data.errors} emails had parsing errors`);
      }
      loadData();
    },
    onError: (error: any) => {
      toast.error(`AI update failed: ${error.message}`);
    },
  });
  const [formData, setFormData] = useState({
    name: "",
    contact_name: "",
    email: "",
    email_secondary: "",
    phone: "",
    phone_secondary: "",
    phone_mobile: "",
    phone_fax: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    payment_terms: "Net 30",
    credit_limit: "",
    notes: "",
    mc_number: "",
    dot_number: "",
    factoring_approval: "pending",
    customer_type: "broker",
  });

  useEffect(() => {
    if (tenantId || !shouldFilter) {
      loadData();
    }
  }, [filter, typeFilter, tenantId, shouldFilter]);

  const loadData = async () => {
    if (shouldFilter && !tenantId) return;
    
    setLoading(true);
    try {
      // Get all customers for duplicate detection (must be tenant-scoped)
      let allQuery = supabase
        .from("customers" as any)
        .select("id, name")
        .order("name", { ascending: true });
      
      if (shouldFilter && tenantId) {
        allQuery = allQuery.eq("tenant_id", tenantId);
      }

      const { data: allData, error: allError } = await allQuery;

      if (!allError && allData) {
        setTotalCustomerCount(allData.length);
        setDuplicateCount(countDuplicates(allData as any));
      }

      let query = supabase
        .from("customers" as any)
        .select("*")
        .order("name", { ascending: true });
      
      if (filter !== "all") {
        query = query.eq("status", filter);
      }
      
      if (typeFilter !== "all") {
        query = query.eq("customer_type", typeFilter);
      }
      
      // CRITICAL: Apply tenant filter
      if (shouldFilter && tenantId) {
        query = query.eq("tenant_id", tenantId);
      }

      const { data, error } = await query;

      if (error) throw error;
      setCustomers((data as any) || []);
    } catch (error) {
      toast.error("Error loading customers");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const customerData = {
        ...formData,
        credit_limit: formData.credit_limit ? parseFloat(formData.credit_limit) : null,
        status: filter,
      };

      // Check for duplicate when adding new customer
      if (!editingCustomer) {
        const normalizedNewName = normalizeName(formData.name);
        
        // Fetch all customer names to check for duplicates
        const { data: existingCustomers, error: fetchError } = await supabase
          .from("customers" as any)
          .select("id, name");
        
        if (fetchError) throw fetchError;
        
        const duplicate = (existingCustomers as any[])?.find(
          (c) => normalizeName(c.name) === normalizedNewName
        );
        
        if (duplicate) {
          toast.error(`Duplicate customer detected: "${duplicate.name}" already exists. Please use the existing record or merge duplicates.`);
          return;
        }
      }

      if (editingCustomer) {
        const { error } = await supabase
          .from("customers" as any)
          .update(customerData)
          .eq("id", editingCustomer.id);
        if (error) throw error;
        toast.success("Customer updated successfully");
      } else {
        const { error } = await supabase
          .from("customers" as any)
          .insert(customerData);
        if (error) throw error;
        toast.success("Customer created successfully");
      }

      setDialogOpen(false);
      resetForm();
      loadData();
    } catch (error: any) {
      toast.error("Failed to save customer: " + error.message);
    }
  };

  const handleEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormData({
      name: customer.name || "",
      contact_name: customer.contact_name || "",
      email: customer.email || "",
      email_secondary: customer.email_secondary || "",
      phone: customer.phone || "",
      phone_secondary: customer.phone_secondary || "",
      phone_mobile: customer.phone_mobile || "",
      phone_fax: customer.phone_fax || "",
      address: customer.address || "",
      city: customer.city || "",
      state: customer.state || "",
      zip: customer.zip || "",
      payment_terms: customer.payment_terms || "Net 30",
      credit_limit: customer.credit_limit?.toString() || "",
      notes: customer.notes || "",
      mc_number: customer.mc_number || "",
      dot_number: customer.dot_number || "",
      factoring_approval: customer.factoring_approval || "pending",
      customer_type: customer.customer_type || "broker",
    });
    setLookupValue(customer.dot_number || "");
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this customer?")) return;
    try {
      const { error } = await supabase
        .from("customers" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
      toast.success("Customer deleted successfully");
      loadData();
    } catch (error: any) {
      toast.error("Failed to delete customer: " + error.message);
    }
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from("customers" as any)
        .update({ status: newStatus })
        .eq("id", id);

      if (error) throw error;
      toast.success("Status updated");
      loadData();
    } catch (error: any) {
      toast.error("Failed to update status: " + error.message);
    }
  };

  const resetForm = () => {
    setEditingCustomer(null);
    setLookupValue("");
    setFormData({
      name: "",
      contact_name: "",
      email: "",
      email_secondary: "",
      phone: "",
      phone_secondary: "",
      phone_mobile: "",
      phone_fax: "",
      address: "",
      city: "",
      state: "",
      zip: "",
      payment_terms: "Net 30",
      credit_limit: "",
      notes: "",
      mc_number: "",
      dot_number: "",
      factoring_approval: "pending",
      customer_type: "broker",
    });
  };

  const setTypeFilter = (type: CustomerTypeFilter) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set("type", type);
    setSearchParams(newParams);
  };

  const getTypeLabel = (type: string | null) => {
    switch (type) {
      case 'broker': return 'Broker';
      case 'shipper': return 'Shipper';
      case 'receiver': return 'Receiver';
      case 'shipper_receiver': return 'Shipper/Receiver';
      default: return 'Broker';
    }
  };

  const getTypeColor = (type: string | null) => {
    switch (type) {
      case 'broker': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'shipper': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'receiver': return 'bg-green-100 text-green-800 border-green-200';
      case 'shipper_receiver': return 'bg-amber-100 text-amber-800 border-amber-200';
      default: return 'bg-purple-100 text-purple-800 border-purple-200';
    }
  };

  const handleLookup = async () => {
    if (!lookupValue.trim()) {
      toast.error(`Please enter a ${lookupType === "usdot" ? "USDOT" : "MC"} number`);
      return;
    }

    setLookupLoading(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-carrier-data`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(lookupType === "usdot" ? { usdot: lookupValue } : { mc: lookupValue }),
        }
      );
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Company not found");
      }

      const data = await response.json();
      
      setFormData({
        ...formData,
        name: data.dba_name || data.name || formData.name,
        mc_number: data.mc_number || formData.mc_number,
        dot_number: data.usdot || lookupValue,
        phone: data.phone || formData.phone,
        address: data.physical_address || formData.address,
      });
      
      toast.success("Company information loaded from FMCSA");
    } catch (error: any) {
      toast.error("Failed to fetch FMCSA data: " + error.message);
    } finally {
      setLookupLoading(false);
    }
  };

  const filteredCustomers = customers
    .filter((customer) => {
      if (!searchQuery) return true;
      const searchLower = searchQuery.toLowerCase();
      return (
        customer.name.toLowerCase().includes(searchLower) ||
        (customer.contact_name || "").toLowerCase().includes(searchLower) ||
        (customer.email || "").toLowerCase().includes(searchLower)
      );
    })
    .sort((a, b) => {
      if (!searchQuery) return a.name.localeCompare(b.name);
      const searchLower = searchQuery.toLowerCase();
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();
      
      // Prioritize names starting with search term
      const aStartsWith = aName.startsWith(searchLower);
      const bStartsWith = bName.startsWith(searchLower);
      
      if (aStartsWith && !bStartsWith) return -1;
      if (!aStartsWith && bStartsWith) return 1;
      
      // Then prioritize earlier position of match
      const aIndex = aName.indexOf(searchLower);
      const bIndex = bName.indexOf(searchLower);
      
      if (aIndex !== bIndex) return aIndex - bIndex;
      
      // Fall back to alphabetical
      return aName.localeCompare(bName);
    });

  // Pagination
  const totalPages = Math.ceil(filteredCustomers.length / ROWS_PER_PAGE);
  const paginatedCustomers = filteredCustomers.slice(
    (currentPage - 1) * ROWS_PER_PAGE,
    currentPage * ROWS_PER_PAGE
  );

  // Reset to page 1 when filter or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filter, searchQuery]);

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="space-y-3">
      {/* Compact Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold">Customers</h2>
          <Badge variant="secondary" className="text-xs">
            {totalCustomerCount.toLocaleString()}
          </Badge>
        </div>
        <div className="flex gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 h-8 relative"
            onClick={() => navigate("/dashboard/duplicate-customers")}
          >
            <GitMerge className="h-3.5 w-3.5" />
            Merge Duplicates
            {duplicateCount > 0 && (
              <Badge variant="destructive" className="absolute -top-2 -right-2 h-5 min-w-5 px-1 text-xs">
                {duplicateCount}
              </Badge>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 h-8"
            onClick={() => aiUpdateMutation.mutate()}
            disabled={aiUpdateMutation.isPending}
          >
            <Sparkles className="h-3.5 w-3.5" />
            {aiUpdateMutation.isPending ? "Updating..." : "AI Update"}
          </Button>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5 h-8">
                <Plus className="h-3.5 w-3.5" />
                Add Customer
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingCustomer ? "Edit Customer" : "Add New Customer"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* FMCSA Lookup Section */}
              <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                <Label className="text-sm font-semibold text-blue-700 dark:text-blue-400">Search FMCSA</Label>
                <div className="flex gap-1 mt-2 mb-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={lookupType === "usdot" ? "default" : "outline"}
                    onClick={() => setLookupType("usdot")}
                    className="flex-1"
                  >
                    By USDOT
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={lookupType === "mc" ? "default" : "outline"}
                    onClick={() => setLookupType("mc")}
                    className="flex-1"
                  >
                    By MC
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Input
                    value={lookupValue}
                    onChange={(e) => setLookupValue(e.target.value)}
                    placeholder={lookupType === "usdot" ? "Enter USDOT number" : "Enter MC number"}
                    className="flex-1"
                  />
                  <Button 
                    type="button"
                    onClick={handleLookup} 
                    disabled={lookupLoading}
                    className="bg-blue-500 hover:bg-blue-600"
                  >
                    <Search className="h-4 w-4 mr-2" />
                    {lookupLoading ? "Searching..." : "Search"}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="dot_number">USDOT Number</Label>
                  <Input
                    id="dot_number"
                    value={formData.dot_number}
                    onChange={(e) => setFormData({ ...formData, dot_number: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="mc_number">MC Number</Label>
                  <Input
                    id="mc_number"
                    value={formData.mc_number}
                    onChange={(e) => setFormData({ ...formData, mc_number: e.target.value })}
                    placeholder="MC-XXXXXX"
                  />
                </div>
                <div>
                  <Label htmlFor="customer_type">Customer Type</Label>
                  <Select 
                    value={formData.customer_type} 
                    onValueChange={(value) => setFormData({ ...formData, customer_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="broker">Broker</SelectItem>
                      <SelectItem value="shipper">Shipper</SelectItem>
                      <SelectItem value="receiver">Receiver</SelectItem>
                      <SelectItem value="shipper_receiver">Shipper/Receiver</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="factoring_approval">Factoring Approval</Label>
                  <Select 
                    value={formData.factoring_approval} 
                    onValueChange={(value) => setFormData({ ...formData, factoring_approval: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="not_approved">Not Approved</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="name">Company Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="contact_name">Contact Name</Label>
                  <Input
                    id="contact_name"
                    value={formData.contact_name}
                    onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="email_secondary">Secondary Email</Label>
                  <Input
                    id="email_secondary"
                    type="email"
                    value={formData.email_secondary}
                    onChange={(e) => setFormData({ ...formData, email_secondary: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="phone_secondary">Secondary Phone</Label>
                  <Input
                    id="phone_secondary"
                    type="tel"
                    value={formData.phone_secondary}
                    onChange={(e) => setFormData({ ...formData, phone_secondary: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="phone_mobile">Mobile</Label>
                  <Input
                    id="phone_mobile"
                    type="tel"
                    value={formData.phone_mobile}
                    onChange={(e) => setFormData({ ...formData, phone_mobile: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="phone_fax">Fax</Label>
                  <Input
                    id="phone_fax"
                    type="tel"
                    value={formData.phone_fax}
                    onChange={(e) => setFormData({ ...formData, phone_fax: e.target.value })}
                  />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="address">Address</Label>
                  <Input
                    id="address"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="state">State</Label>
                  <Input
                    id="state"
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    placeholder="e.g., CA"
                  />
                </div>
                <div>
                  <Label htmlFor="zip">ZIP Code</Label>
                  <Input
                    id="zip"
                    value={formData.zip}
                    onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="payment_terms">Payment Terms</Label>
                  <Input
                    id="payment_terms"
                    value={formData.payment_terms}
                    onChange={(e) => setFormData({ ...formData, payment_terms: e.target.value })}
                    placeholder="e.g., Net 30"
                  />
                </div>
                <div>
                  <Label htmlFor="credit_limit">Credit Limit ($)</Label>
                  <Input
                    id="credit_limit"
                    type="number"
                    step="0.01"
                    value={formData.credit_limit}
                    onChange={(e) => setFormData({ ...formData, credit_limit: e.target.value })}
                  />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">
                  Cancel
                </Button>
                <Button type="submit" className="flex-1">
                  {editingCustomer ? "Update" : "Create"} Customer
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Filters Row */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search field - now on the left */}
        <div ref={searchContainerRef} className="relative w-72">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search name, contact, email..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsSearchOpen(true);
              }}
              onFocus={() => setIsSearchOpen(true)}
              className="pl-9 pr-16 h-8 text-sm bg-background border-input focus:ring-2 focus:ring-primary/20"
            />
            <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setIsSearchOpen(false);
                  }}
                  className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsSearchOpen(!isSearchOpen)}
                className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded"
              >
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isSearchOpen ? 'rotate-180' : ''}`} />
              </button>
            </div>
          </div>
          
          {/* Search Dropdown */}
          {isSearchOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-lg shadow-lg z-50 max-h-72 overflow-hidden">
              {/* Alphabet quick jump */}
              <div className="flex flex-wrap gap-0.5 p-2 border-b bg-muted/30">
                {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((letter) => {
                  const hasCustomers = customers.some(c => c.name.toUpperCase().startsWith(letter));
                  return (
                    <button
                      key={letter}
                      type="button"
                      disabled={!hasCustomers}
                      onClick={() => {
                        setSearchQuery(letter);
                        setCurrentPage(1);
                      }}
                      className={`w-5 h-5 text-[10px] font-semibold rounded transition-colors ${
                        hasCustomers
                          ? 'hover:bg-primary hover:text-primary-foreground text-foreground'
                          : 'text-muted-foreground/40 cursor-not-allowed'
                      } ${searchQuery.toUpperCase() === letter ? 'bg-primary text-primary-foreground' : ''}`}
                    >
                      {letter}
                    </button>
                  );
                })}
              </div>
              
              {/* Customer list */}
              <div className="max-h-52 overflow-y-auto">
                {filteredCustomers.length > 0 ? (
                  filteredCustomers.slice(0, 15).map((customer) => (
                    <button
                      key={customer.id}
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground transition-colors flex items-center justify-between gap-2"
                      onClick={() => {
                        navigate(`/dashboard/customer/${customer.id}`);
                        setIsSearchOpen(false);
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <span className="font-medium block truncate">{customer.name}</span>
                        {(customer.city || customer.state) && (
                          <span className="text-xs text-muted-foreground">
                            {[customer.city, customer.state].filter(Boolean).join(", ")}
                          </span>
                        )}
                      </div>
                      <Badge variant="outline" className={`text-[10px] shrink-0 ${getTypeColor(customer.customer_type)}`}>
                        {getTypeLabel(customer.customer_type)}
                      </Badge>
                    </button>
                  ))
                ) : searchQuery ? (
                  <p className="px-3 py-4 text-sm text-muted-foreground text-center">
                    No customers match "{searchQuery}"
                  </p>
                ) : (
                  <p className="px-3 py-4 text-sm text-muted-foreground text-center">
                    Type to search or click a letter above
                  </p>
                )}
                
                {filteredCustomers.length > 15 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground border-t bg-muted/20 text-center">
                    Showing 15 of {filteredCustomers.length} results
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Status Filters */}
        <div className="flex items-center gap-0">
          {[
            { key: "all", label: "All", activeClass: "btn-glossy-dark" },
            { key: "active", label: "Active", activeClass: "btn-glossy-success" },
            { key: "inactive", label: "Inactive", activeClass: "btn-glossy" },
            { key: "pending", label: "Pending", activeClass: "btn-glossy-warning" },
          ].map((status) => (
            <Button
              key={status.key}
              variant="ghost"
              size="sm"
              onClick={() => {
                const newParams = new URLSearchParams(searchParams);
                newParams.set("filter", status.key);
                setSearchParams(newParams);
                setSearchQuery("");
              }}
              className={`h-[28px] px-2.5 text-[12px] font-medium gap-1 rounded-none first:rounded-l-full last:rounded-r-full border-0 ${
                filter === status.key 
                  ? `${status.activeClass} text-white` 
                  : 'btn-glossy text-gray-700'
              }`}
            >
              {status.label}
            </Button>
          ))}
        </div>

        {/* Type Filters */}
        <div className="flex items-center gap-0 border-l pl-2 ml-1">
          {[
            { key: "all", label: "All Types", activeClass: "btn-glossy-dark" },
            { key: "broker", label: "Brokers", activeClass: "btn-glossy-violet" },
            { key: "shipper", label: "Shippers", activeClass: "btn-glossy-primary" },
            { key: "receiver", label: "Receivers", activeClass: "btn-glossy-success" },
            { key: "shipper_receiver", label: "Ship/Recv", activeClass: "btn-glossy-warning" },
          ].map((type) => (
            <Button
              key={type.key}
              variant="ghost"
              size="sm"
              onClick={() => setTypeFilter(type.key as CustomerTypeFilter)}
              className={`h-[28px] px-2.5 text-[12px] font-medium gap-1 rounded-none first:rounded-l-full last:rounded-r-full border-0 ${
                typeFilter === type.key 
                  ? `${type.activeClass} text-white` 
                  : 'btn-glossy text-gray-700'
              }`}
            >
              {type.label}
            </Button>
          ))}
        </div>
      </div>

      <Card className="flex flex-col" style={{ height: 'calc(100vh - 220px)' }}>
        <CardContent className="p-0 flex flex-col flex-1 overflow-hidden">
          {filteredCustomers.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {searchQuery ? "No customers match your search" : `No ${filter} customers found`}
            </p>
          ) : (
            <>
              <div className="flex-1 overflow-auto">
                <Table className="text-sm">
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow className="bg-gradient-to-r from-blue-50 to-slate-50 dark:from-blue-950/30 dark:to-slate-950/30 h-10 border-b-2 border-blue-100 dark:border-blue-900">
                      <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Status</TableHead>
                      <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide w-40">Company Name</TableHead>
                      <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Type</TableHead>
                      <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide whitespace-nowrap w-32">Factoring / MC</TableHead>
                      <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide w-32">Contact</TableHead>
                      <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Email</TableHead>
                      <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Phone</TableHead>
                      <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Location</TableHead>
                      <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Terms</TableHead>
                      <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Credit Limit</TableHead>
                      <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedCustomers.map((customer) => (
                      <TableRow key={customer.id} className="h-10 hover:bg-muted/50 cursor-pointer" onClick={() => navigate(`/dashboard/customer/${customer.id}`)}>
                        <TableCell className="py-1 px-2" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <div className={`w-6 h-6 rounded flex items-center justify-center text-white font-bold text-xs ${
                              customer.status === "active" 
                                ? "bg-green-600" 
                                : customer.status === "pending"
                                ? "bg-orange-500"
                                : "bg-gray-500"
                            }`}>
                              0
                            </div>
                            <Select
                              value={customer.status}
                              onValueChange={(value) => handleStatusChange(customer.id, value)}
                            >
                              <SelectTrigger className={`w-[80px] h-6 text-sm px-1 ${
                                customer.status === "active"
                                  ? "bg-green-100 text-green-800 border-green-200"
                                  : customer.status === "pending"
                                  ? "bg-orange-100 text-orange-800 border-orange-200"
                                  : "bg-gray-100 text-gray-800 border-gray-200"
                              }`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="active" className="text-sm">Active</SelectItem>
                                <SelectItem value="pending" className="text-sm">Pending</SelectItem>
                                <SelectItem value="inactive" className="text-sm">Inactive</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </TableCell>
                        <TableCell className="py-1 px-2 font-medium">{customer.name}</TableCell>
                        <TableCell className="py-1 px-2">
                          <Badge variant="outline" className={`text-xs ${getTypeColor(customer.customer_type)}`}>
                            {getTypeLabel(customer.customer_type)}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-1 px-2">
                          <div className="flex flex-col">
                            <span className={`text-xs font-medium ${
                              customer.factoring_approval === 'approved' 
                                ? 'text-green-600' 
                                : customer.factoring_approval === 'not_approved'
                                ? 'text-red-600'
                                : 'text-orange-500'
                            }`}>
                              {customer.factoring_approval === 'approved' ? 'Approved' : 
                               customer.factoring_approval === 'not_approved' ? 'Not Approved' : 'Pending'}
                            </span>
                            <span className="text-xs text-muted-foreground">{customer.mc_number || '—'}</span>
                          </div>
                        </TableCell>
                        <TableCell className="py-1 px-2">{customer.contact_name || "—"}</TableCell>
                        <TableCell className="py-1 px-2">{customer.email || "—"}</TableCell>
                        <TableCell className="py-1 px-2">{customer.phone || "—"}</TableCell>
                        <TableCell className="py-1 px-2">
                          {customer.city && customer.state ? `${customer.city}, ${customer.state}` : "—"}
                        </TableCell>
                        <TableCell className="py-1 px-2">{customer.payment_terms || "—"}</TableCell>
                        <TableCell className="py-1 px-2">
                          {customer.credit_limit ? `$${customer.credit_limit.toLocaleString()}` : "—"}
                        </TableCell>
                        <TableCell className="py-1 px-2" onClick={(e) => e.stopPropagation()}>
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleEdit(customer)}>
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleDelete(customer.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {/* Always visible pagination */}
              <div className="flex items-center justify-between px-4 py-3 border-t bg-background flex-shrink-0">
                <span className="text-sm text-muted-foreground">
                  Showing {((currentPage - 1) * ROWS_PER_PAGE) + 1}-{Math.min(currentPage * ROWS_PER_PAGE, filteredCustomers.length)} of {filteredCustomers.length}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm px-2">Page {currentPage} of {Math.max(1, totalPages)}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
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
