import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
import { Search, Plus, Edit, Trash2, FileText, User, ChevronLeft, ChevronRight, Mail, Loader2, Phone, MapPin, Calendar, Download, Upload } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTenantFilter } from "@/hooks/useTenantFilter";
import { exportToExcel } from "@/lib/excel-utils";
import { ExcelImportDialog } from "@/components/ExcelImportDialog";

interface Dispatcher {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  address: string | null;
  status: string;
  hire_date: string | null;
  termination_date: string | null;
  pay_percentage: number | null;
  assigned_trucks: number | null;
  dob: string | null;
  license_number: string | null;
  license_expiration_date: string | null;
  application_status: string | null;
  contract_agreement: string | null;
  notes: string | null;
  created_at: string;
}

export default function DispatchersTab() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { tenantId, shouldFilter } = useTenantFilter();
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = searchParams.get("filter") || "active";
  const [dispatchers, setDispatchers] = useState<Dispatcher[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const ROWS_PER_PAGE = 50;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sendingLoginTo, setSendingLoginTo] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
  });

  const handleSendLoginLink = async (dispatcher: Dispatcher) => {
    setSendingLoginTo(dispatcher.id);
    try {
      const { data, error } = await supabase.functions.invoke('send-dispatcher-login', {
        body: {
          dispatcherId: dispatcher.id,
          dispatcherEmail: dispatcher.email,
          dispatcherName: `${dispatcher.first_name} ${dispatcher.last_name}`,
        },
      });

      if (error) throw error;
      
      toast.success(`Login credentials sent to ${dispatcher.email}`);
    } catch (error: any) {
      console.error('Error sending login link:', error);
      toast.error(`Failed to send login: ${error.message}`);
    } finally {
      setSendingLoginTo(null);
    }
  };

  useEffect(() => {
    loadData();
  }, [filter, tenantId]);

  const loadData = async () => {
    if (!tenantId && shouldFilter) return;
    
    setLoading(true);
    try {
      let query = supabase
        .from("dispatchers")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (filter !== "all") {
        query = query.eq("status", filter);
      }
      
      if (shouldFilter && tenantId) {
        query = query.eq("tenant_id", tenantId);
      }
      
      const { data, error } = await query;

      if (error) {
        toast.error("Error loading dispatchers");
        return;
      }
      setDispatchers(data || []);
    } finally {
      setLoading(false);
    }
  };

  const handleAddDispatcher = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!tenantId) {
      toast.error("No tenant selected");
      return;
    }
    
    try {
      const { error } = await supabase
        .from("dispatchers")
        .insert([{
          ...formData,
          status: "active",
          hire_date: new Date().toISOString().split('T')[0],
          tenant_id: tenantId,
        }]);

      if (error) throw error;
      toast.success("Dispatcher added successfully");
      setDialogOpen(false);
      setFormData({
        first_name: "",
        last_name: "",
        email: "",
        phone: "",
      });
      loadData();
    } catch (error: any) {
      toast.error("Failed to add dispatcher: " + error.message);
    }
  };

  const handleDeleteDispatcher = async (id: string) => {
    try {
      const { error } = await supabase
        .from("dispatchers")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Dispatcher deleted successfully");
      loadData();
    } catch (error: any) {
      toast.error("Failed to delete dispatcher: " + error.message);
    }
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from("dispatchers")
        .update({ status: newStatus })
        .eq("id", id);

      if (error) throw error;
      toast.success("Status updated");
      loadData();
    } catch (error: any) {
      toast.error("Failed to update status: " + error.message);
    }
  };

  const filteredDispatchers = dispatchers.filter((dispatcher) => {
    const searchLower = searchQuery.toLowerCase();
    const fullName = `${dispatcher.first_name} ${dispatcher.last_name}`.toLowerCase();
    return (
      fullName.includes(searchLower) ||
      dispatcher.email.toLowerCase().includes(searchLower) ||
      (dispatcher.phone || "").toLowerCase().includes(searchLower)
    );
  });

  // Pagination
  const totalPages = Math.ceil(filteredDispatchers.length / ROWS_PER_PAGE);
  const paginatedDispatchers = filteredDispatchers.slice(
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
        <h2 className="text-xl font-bold">Dispatcher Management</h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5 h-8">
              <Plus className="h-3.5 w-3.5" />
              Add Dispatcher
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Dispatcher</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddDispatcher} className="space-y-4">
              <div>
                <Label htmlFor="first_name">First Name</Label>
                <Input
                  id="first_name"
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="last_name">Last Name</Label>
                <Input
                  id="last_name"
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  required
                />
              </div>
              <Button type="submit" className="w-full">Add Dispatcher</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters Row */}
      {(() => {
        const statusCounts = {
          all: dispatchers.length,
          active: dispatchers.filter(d => d.status === "active").length,
          inactive: dispatchers.filter(d => d.status === "inactive").length,
          pending: dispatchers.filter(d => d.status === "pending").length,
        };

        return (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-48">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search dispatchers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-7 text-sm"
              />
            </div>
            <div className="flex items-center gap-0">
              {[
                { key: "all", label: "All", count: statusCounts.all, activeClass: "btn-glossy-dark", badgeClass: "badge-inset-dark", softBadgeClass: "badge-inset" },
                { key: "active", label: "Active", count: statusCounts.active, activeClass: "btn-glossy-success", badgeClass: "badge-inset-success", softBadgeClass: "badge-inset-soft-green" },
                { key: "inactive", label: "Inactive", count: statusCounts.inactive, activeClass: "btn-glossy", badgeClass: "badge-inset", softBadgeClass: "badge-inset" },
                { key: "pending", label: "Pending", count: statusCounts.pending, activeClass: "btn-glossy-warning", badgeClass: "badge-inset-warning", softBadgeClass: "badge-inset-soft-orange" },
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
                  className={`h-[28px] px-2.5 text-[12px] font-medium gap-1 rounded-none first:rounded-l-full last:rounded-r-full border-0 ${
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
          </div>
        );
      })()}

      <Card>
        <CardHeader className={isMobile ? "pb-2" : ""}>
          <CardTitle>Dispatchers</CardTitle>
          <CardDescription>Manage your dispatch team</CardDescription>
        </CardHeader>
        <CardContent>
          {filteredDispatchers.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {searchQuery ? "No dispatchers match your search" : "No dispatchers found"}
            </p>
          ) : isMobile ? (
            // Mobile Card Layout
            <div className="space-y-3">
              {paginatedDispatchers.map((dispatcher) => {
                const age = dispatcher.dob 
                  ? Math.floor((new Date().getTime() - new Date(dispatcher.dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
                  : null;
                
                return (
                  <Card 
                    key={dispatcher.id} 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/dashboard/dispatchers/${dispatcher.id}`)}
                  >
                    <CardContent className="p-3 space-y-2">
                      {/* Header Row */}
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <Badge 
                            variant={
                              dispatcher.status === "active" ? "default" : 
                              dispatcher.status === "pending" ? "secondary" : "outline"
                            }
                            className={
                              dispatcher.status === "active" ? "bg-green-600 hover:bg-green-700" :
                              dispatcher.status === "pending" ? "bg-orange-500 hover:bg-orange-600 text-white" :
                              ""
                            }
                          >
                            {dispatcher.status}
                          </Badge>
                        </div>
                        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button 
                            size="icon" 
                            variant={sendingLoginTo === dispatcher.id ? "default" : "outline"}
                            className="h-8 w-8"
                            title="Send Login Link"
                            disabled={sendingLoginTo === dispatcher.id}
                            onClick={() => handleSendLoginLink(dispatcher)}
                          >
                            {sendingLoginTo === dispatcher.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Mail className="h-4 w-4" />
                            )}
                          </Button>
                          <Button 
                            size="icon" 
                            variant="outline"
                            className="h-8 w-8"
                            title="View Details"
                            onClick={() => navigate(`/dashboard/dispatchers/${dispatcher.id}`)}
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      {/* Name */}
                      <div>
                        <p className="font-semibold text-base">
                          {dispatcher.first_name} {dispatcher.last_name}
                        </p>
                        <p className="text-xs text-muted-foreground">{dispatcher.email}</p>
                      </div>

                      {/* Details Row */}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {dispatcher.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {dispatcher.phone}
                          </span>
                        )}
                        {dispatcher.pay_percentage && (
                          <span>Pay: {dispatcher.pay_percentage}%</span>
                        )}
                        {dispatcher.assigned_trucks && (
                          <span>Trucks: {dispatcher.assigned_trucks}</span>
                        )}
                        {age && <span>Age: {age}</span>}
                      </div>

                      {/* Dates Row */}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground border-t pt-2">
                        {dispatcher.hire_date && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Hired: {format(new Date(dispatcher.hire_date), "MM/dd/yy")}
                          </span>
                        )}
                        {dispatcher.contract_agreement && (
                          <span className="text-green-600">✓ Contract</span>
                        )}
                        {dispatcher.application_status && (
                          <span>App: {dispatcher.application_status}</span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            // Desktop Table Layout
            <div className="overflow-x-auto">
              <Table className="text-sm">
                <TableHeader>
                  <TableRow className="bg-gradient-to-r from-blue-50 to-slate-50 dark:from-blue-950/30 dark:to-slate-950/30 h-10 border-b-2 border-blue-100 dark:border-blue-900">
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide w-12">Status</TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Name</TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Phone</TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Pay %</TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Trucks</TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Address</TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Email</TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Age</TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">License</TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">DOB</TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Exp Date</TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">App</TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">DD</TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Contract</TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Hired</TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Term</TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedDispatchers.map((dispatcher) => {
                    const age = dispatcher.dob 
                      ? Math.floor((new Date().getTime() - new Date(dispatcher.dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
                      : null;
                    
                    return (
                      <TableRow key={dispatcher.id} className="h-10 cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/dashboard/dispatchers/${dispatcher.id}`)}>
                        <TableCell className="py-1 px-2" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <div className={`w-6 h-6 rounded flex items-center justify-center text-white font-bold text-xs ${
                              dispatcher.status === "active" 
                                ? "bg-green-600" 
                                : dispatcher.status === "pending"
                                ? "bg-orange-500"
                                : "bg-gray-500"
                            }`}>
                              0
                            </div>
                            <Select
                              value={dispatcher.status}
                              onValueChange={(value) => handleStatusChange(dispatcher.id, value)}
                            >
                              <SelectTrigger className={`w-[80px] h-6 text-sm px-1 ${
                                dispatcher.status === "active"
                                  ? "bg-green-100 text-green-800 border-green-200"
                                  : dispatcher.status === "pending"
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
                        <TableCell className="py-1 px-2 font-medium">
                          {dispatcher.first_name} {dispatcher.last_name}
                        </TableCell>
                        <TableCell className="py-1 px-2">{dispatcher.phone || "-"}</TableCell>
                        <TableCell className="py-1 px-2">{dispatcher.pay_percentage || "-"}</TableCell>
                        <TableCell className="py-1 px-2">{dispatcher.assigned_trucks || "0"}</TableCell>
                        <TableCell className="py-1 px-2 max-w-[150px] truncate">{dispatcher.address || "-"}</TableCell>
                        <TableCell className="py-1 px-2">{dispatcher.email}</TableCell>
                        <TableCell className="py-1 px-2">{age || "-"}</TableCell>
                        <TableCell className="py-1 px-2">{dispatcher.license_number || "-"}</TableCell>
                        <TableCell className="py-1 px-2">
                          {dispatcher.dob ? format(new Date(dispatcher.dob), "MM/dd/yy") : "-"}
                        </TableCell>
                        <TableCell className="py-1 px-2">
                          {dispatcher.license_expiration_date 
                            ? format(new Date(dispatcher.license_expiration_date), "MM/dd/yy") 
                            : "-"}
                        </TableCell>
                        <TableCell className="py-1 px-2">{dispatcher.application_status || "-"}</TableCell>
                        <TableCell className="py-1 px-2">-</TableCell>
                        <TableCell className="py-1 px-2">{dispatcher.contract_agreement ? "Yes" : "-"}</TableCell>
                        <TableCell className="py-1 px-2">
                          {dispatcher.hire_date
                            ? format(new Date(dispatcher.hire_date), "MM/dd/yy")
                            : "-"}
                        </TableCell>
                        <TableCell className="py-1 px-2">
                          {dispatcher.termination_date
                            ? format(new Date(dispatcher.termination_date), "MM/dd/yy")
                            : "-"}
                        </TableCell>
                        <TableCell className="py-1 px-2">
                          <div className="flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="h-6 w-6"
                              title="Send Login Link"
                              disabled={sendingLoginTo === dispatcher.id}
                              onClick={() => handleSendLoginLink(dispatcher)}
                            >
                              {sendingLoginTo === dispatcher.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Mail className="h-3.5 w-3.5" />
                              )}
                            </Button>
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="h-6 w-6"
                              title="View Details"
                              onClick={() => navigate(`/dashboard/dispatchers/${dispatcher.id}`)}
                            >
                              <FileText className="h-3.5 w-3.5" />
                            </Button>
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="h-6 w-6"
                              title="Edit Dispatcher"
                              onClick={() => navigate(`/dashboard/dispatchers/${dispatcher.id}`)}
                            >
                              <User className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          {/* Pagination */}
          <div className={`flex items-center ${isMobile ? "flex-col gap-2" : "justify-between"} px-4 py-3 border-t`}>
            <div className="text-sm text-muted-foreground">
              Showing {filteredDispatchers.length === 0 ? 0 : ((currentPage - 1) * ROWS_PER_PAGE) + 1} to {Math.min(currentPage * ROWS_PER_PAGE, filteredDispatchers.length)} of {filteredDispatchers.length}
            </div>
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
              <span className="text-sm">
                Page {currentPage} of {Math.max(1, totalPages)}
              </span>
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
        </CardContent>
      </Card>
    </div>
  );
}
