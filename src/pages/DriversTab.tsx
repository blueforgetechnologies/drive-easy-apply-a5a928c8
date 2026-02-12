import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { format, differenceInYears } from "date-fns";
import { InviteDriverDialog } from "@/components/InviteDriverDialog";
import { AddDriverDialog } from "@/components/AddDriverDialog";
import { DraftApplications } from "@/components/DraftApplications";
import { ApplicationsManager } from "@/components/ApplicationsManager";
import { MissingOnboardingItemsDialog } from "@/components/MissingOnboardingItemsDialog";
import { RotateCw, FileText, Edit, Search, ChevronLeft, ChevronRight, Trash2, X, Download, Upload, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { useTenantFilter } from "@/hooks/useTenantFilter";
import { exportToExcel, mapExcelRowToEntity } from "@/lib/excel-utils";
import { ExcelImportDialog } from "@/components/ExcelImportDialog";
interface Application {
  id: string;
  personal_info: any;
  submitted_at: string;
  status: string;
  driver_status?: string;
  license_info?: any;
  direct_deposit?: any;
  payroll_policy?: any;
}

interface DriverInvite {
  id: string;
  email: string;
  name: string | null;
  invited_at: string;
  opened_at: string | null;
  application_started_at: string | null;
  completed?: boolean;
  application_id?: string;
  current_step?: number; // Track actual application progress
}

interface VehicleAssignment {
  id: string;
  vehicle_number: string;
  driver_1_id: string | null;
  driver_2_id: string | null;
}

export default function DriversTab() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = searchParams.get("filter") || "active";
  const [applications, setApplications] = useState<Application[]>([]);
  const [invites, setInvites] = useState<DriverInvite[]>([]);
  const [applicationsCount, setApplicationsCount] = useState(0); // Count for Invitations badge (invited + completed + approved)
  const [vehicles, setVehicles] = useState<VehicleAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedDrivers, setSelectedDrivers] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  
  // Missing items dialog state for activation failures
  const [missingItemsDialogOpen, setMissingItemsDialogOpen] = useState(false);
  const [missingItemsDriverName, setMissingItemsDriverName] = useState("");
  const [missingItems, setMissingItems] = useState<{ category: string; label: string }[]>([]);
  const [missingByCategory, setMissingByCategory] = useState<Record<string, string[]>>({});
  
  const ROWS_PER_PAGE = 50;
  const { tenantId, shouldFilter } = useTenantFilter();

  useEffect(() => {
    if (tenantId || !shouldFilter) {
      loadData();
    }
  }, [filter, tenantId, shouldFilter]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Always load vehicles for assignment display
      await loadVehicles();
      
      // Always load applications count for the Applications badge
      await loadApplicationsCount();
      
      // Always load invitations count for the Invitations badge
      await loadInvitations();
      
      if (filter === "all") {
        await loadAllDrivers();
      } else if (filter === "active") {
        await loadActiveDrivers();
      } else if (filter === "pending") {
        await loadPendingDrivers();
      } else if (filter === "inactive") {
        await loadInactiveDrivers();
      } else if (filter === "applications") {
        // Applications Manager handles its own loading
      } else if (filter === "invitations") {
        // Invitations loaded above
      }
    } finally {
      setLoading(false);
    }
  };
  
  // Load count of all non-hired applications for the Applications badge (excludes invited status)
  const loadApplicationsCount = async () => {
    try {
      let query = supabase
        .from("applications")
        .select("id", { count: "exact", head: true })
        .or("driver_status.is.null,driver_status.eq.rejected")
        .neq("status", "archived")
        .neq("status", "invited"); // Exclude invited - those show in Invitations tab
      
      if (shouldFilter && tenantId) {
        query = query.eq("tenant_id", tenantId);
      }
      
      const { count, error } = await query;
      
      if (!error) {
        setApplicationsCount(count ?? 0);
      }
    } catch (error) {
      console.error("Error loading applications count:", error);
    }
  };

  const loadVehicles = async () => {
    let query = supabase
      .from("vehicles")
      .select("id, vehicle_number, driver_1_id, driver_2_id")
      .eq("status", "active");
    
    if (shouldFilter && tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data, error } = await query;

    if (!error && data) {
      setVehicles(data);
    }
  };
  const getVehicleForDriver = (applicationId: string): string | null => {
    const vehicle = vehicles.find(
      v => v.driver_1_id === applicationId || v.driver_2_id === applicationId
    );
    return vehicle?.vehicle_number || null;
  };

  const loadAllDrivers = async () => {
    // Only show drivers who have been HIRED (driver_status is not null)
    // Non-hired applications should only appear in the Applications/Invitations section
    let query = supabase
      .from("applications")
      .select("*")
      .not("submitted_at", "is", null)
      .not("driver_status", "is", null)
      .order("submitted_at", { ascending: false });
    
    if (shouldFilter && tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data, error } = await query;

    if (error) {
      toast.error("Error loading drivers");
      return;
    }
    setApplications(data || []);
  };

  const loadActiveDrivers = async () => {
    let query = supabase
      .from("applications")
      .select("*")
      .not("submitted_at", "is", null)
      .eq("driver_status", "active")
      .order("submitted_at", { ascending: false });
    
    if (shouldFilter && tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data, error } = await query;

    if (error) {
      toast.error("Error loading active drivers");
      return;
    }
    setApplications(data || []);
  };

  const loadPendingDrivers = async () => {
    let query = supabase
      .from("applications")
      .select("*")
      .not("submitted_at", "is", null)
      .eq("driver_status", "pending")
      .order("submitted_at", { ascending: false });
    
    if (shouldFilter && tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data, error } = await query;

    if (error) {
      toast.error("Error loading pending drivers");
      return;
    }
    setApplications(data || []);
  };

  const loadInvitations = async () => {
    let invitesQuery = supabase
      .from("driver_invites")
      .select("*")
      .order("invited_at", { ascending: false });
    
    if (shouldFilter && tenantId) {
      invitesQuery = invitesQuery.eq("tenant_id", tenantId);
    }

    const { data: invitesData, error: invitesError } = await invitesQuery;

    if (invitesError) {
      toast.error("Error loading invitations");
      return;
    }

    // Load ALL applications linked to invites (including in_progress) to get their current_step
    let applicationsQuery = supabase
      .from("applications")
      .select("id, invite_id, personal_info, submitted_at, updated_at, driver_status, status, current_step");
    
    if (shouldFilter && tenantId) {
      applicationsQuery = applicationsQuery.eq("tenant_id", tenantId);
    }

    const { data: applicationsData, error: appsError } = await applicationsQuery;

    if (appsError) {
      console.error("Error loading applications:", appsError);
    }

    // Match invitations with applications:
    // 1. Primary: applications.invite_id === invite.id (FK relationship)
    // 2. Fallback: applications.personal_info.email === invite.email
    const enrichedInvites = (invitesData || []).map((invite) => {
      // Primary match by invite_id FK
      let matchedApp = (applicationsData || []).find(
        (app: any) => app.invite_id === invite.id
      );
      
      // Fallback: match by email if no FK match
      if (!matchedApp) {
        const emailMatches = (applicationsData || []).filter(
          (app: any) => 
            app.personal_info?.email?.toLowerCase() === invite.email?.toLowerCase()
        );
        // If multiple matches, pick the newest by submitted_at or updated_at
        if (emailMatches.length > 0) {
          matchedApp = emailMatches.sort((a: any, b: any) => {
            const dateA = new Date(a.submitted_at || a.updated_at || 0).getTime();
            const dateB = new Date(b.submitted_at || b.updated_at || 0).getTime();
            return dateB - dateA;
          })[0];
        }
      }
      
      // An application is "completed" if status is 'submitted' or beyond
      const isCompleted = matchedApp && 
        (matchedApp.status === 'submitted' || matchedApp.status === 'approved' || 
         matchedApp.status === 'training_completed' || matchedApp.status === 'rejected');
      
      return {
        ...invite,
        completed: isCompleted,
        application_id: matchedApp?.id || null,
        current_step: matchedApp?.current_step || 0, // Track actual progress
      };
    });

    // Filter out completed invitations - they should appear in Applications tab only
    const pendingInvites = enrichedInvites.filter((inv) => !inv.completed);
    setInvites(pendingInvites);
  };

  const loadInactiveDrivers = async () => {
    let query = supabase
      .from("applications")
      .select("*")
      .not("submitted_at", "is", null)
      .eq("driver_status", "inactive")
      .order("submitted_at", { ascending: false });
    
    if (shouldFilter && tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data, error } = await query;

    if (error) {
      toast.error("Error loading inactive drivers");
      return;
    }
    setApplications(data || []);
  };

  const handleResendInvite = async (invite: DriverInvite) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const { data, error } = await supabase.functions.invoke("resend-driver-invite", {
        body: {
          invite_id: invite.id,
          test_mode: localStorage.getItem("app_test_mode") === "true",
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Failed to resend invitation");
      
      toast.success(`Invitation resent to ${invite.email}`);
    } catch (error: any) {
      console.error("Error resending invite:", error);
      toast.error("Failed to resend invitation: " + error.message);
    }
  };

  const handleDeleteInvite = async (inviteId: string) => {
    try {
      // First, unlink any applications that reference this invite
      // This prevents FK constraint violations
      const { error: unlinkError } = await supabase
        .from("applications")
        .update({ invite_id: null })
        .eq("invite_id", inviteId);

      if (unlinkError) {
        console.warn("Error unlinking applications:", unlinkError);
        // Continue anyway - the applications may not have proper permissions or don't exist
      }

      // Now delete the invitation
      const { error } = await supabase
        .from("driver_invites")
        .delete()
        .eq("id", inviteId);

      if (error) throw error;
      toast.success("Invitation deleted successfully");
      loadData();
    } catch (error: any) {
      toast.error("Failed to delete invitation: " + error.message);
    }
  };

  const viewApplication = (id: string) => {
    navigate(`/dashboard/application/${id}`);
  };

  // Activate a pending driver - uses edge function for server-side validation
  const handleActivateDriver = async (id: string, driverName: string) => {
    setActivatingId(id);
    try {
      const { data, error } = await supabase.functions.invoke("activate-driver", {
        body: { application_id: id },
      });

      if (error) throw error;
      
      if (!data?.success) {
        // Show missing items dialog if onboarding incomplete
        if (data?.missing_by_category) {
          setMissingItemsDriverName(driverName);
          setMissingItems(data.missing_items || []);
          setMissingByCategory(data.missing_by_category);
          setMissingItemsDialogOpen(true);
          
          // Also show toast for quick visibility
          const categories = Object.entries(data.missing_by_category)
            .map(([cat, items]) => `${cat}: ${(items as string[]).join(", ")}`)
            .join("; ");
          toast.error(`Onboarding incomplete: ${categories}`, { duration: 5000 });
        } else {
          throw new Error(data?.error || "Failed to activate driver");
        }
        return;
      }

      toast.success(data.message || `${driverName} is now Active`);
      loadData();
    } catch (error: any) {
      toast.error("Failed to activate driver: " + error.message);
    } finally {
      setActivatingId(null);
    }
  };

  const handleDriverStatusChange = async (id: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from("applications")
        .update({ driver_status: newStatus })
        .eq("id", id);

      if (error) throw error;
      toast.success("Status updated");
      loadData();
    } catch (error: any) {
      toast.error("Failed to update status: " + error.message);
    }
  };

  const handleDeleteDriver = async (id: string) => {
    if (!confirm("Are you sure you want to delete this driver? This action cannot be undone.")) {
      return;
    }
    
    try {
      // First, unassign driver from any vehicles
      await supabase
        .from("vehicles")
        .update({ driver_1_id: null })
        .eq("driver_1_id", id);
      
      await supabase
        .from("vehicles")
        .update({ driver_2_id: null })
        .eq("driver_2_id", id);

      const { error } = await supabase
        .from("applications")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Driver deleted successfully");
      loadData();
    } catch (error: any) {
      toast.error("Failed to delete driver: " + error.message);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedDrivers.size === 0) return;
    
    if (!confirm(`Are you sure you want to delete ${selectedDrivers.size} driver(s)? This action cannot be undone.`)) {
      return;
    }
    
    setIsDeleting(true);
    try {
      const ids = Array.from(selectedDrivers);
      
      // First, unassign drivers from any vehicles
      for (const id of ids) {
        await supabase
          .from("vehicles")
          .update({ driver_1_id: null })
          .eq("driver_1_id", id);
        
        await supabase
          .from("vehicles")
          .update({ driver_2_id: null })
          .eq("driver_2_id", id);
      }

      const { error } = await supabase
        .from("applications")
        .delete()
        .in("id", ids);

      if (error) throw error;
      toast.success(`${selectedDrivers.size} driver(s) deleted successfully`);
      setSelectedDrivers(new Set());
      loadData();
    } catch (error: any) {
      toast.error("Failed to delete drivers: " + error.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleDriverSelection = (id: string) => {
    setSelectedDrivers(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAllDrivers = () => {
    if (selectedDrivers.size === paginatedApplications.length) {
      setSelectedDrivers(new Set());
    } else {
      setSelectedDrivers(new Set(paginatedApplications.map(app => app.id)));
    }
  };

  const filteredApplications = applications.filter((app) => {
    const personalInfo = app.personal_info || {};
    const fullName = `${personalInfo.firstName || ""} ${personalInfo.lastName || ""}`.toLowerCase();
    return fullName.includes(searchQuery.toLowerCase());
  });

  const filteredInvites = invites.filter((invite) => {
    const fullName = `${invite.name || ""}`.toLowerCase();
    const email = invite.email.toLowerCase();
    return fullName.includes(searchQuery.toLowerCase()) || email.includes(searchQuery.toLowerCase());
  });

  // Pagination for applications
  const totalPages = Math.ceil(filteredApplications.length / ROWS_PER_PAGE);
  const paginatedApplications = filteredApplications.slice(
    (currentPage - 1) * ROWS_PER_PAGE,
    currentPage * ROWS_PER_PAGE
  );

  // Reset to page 1 and clear selection when filter or search changes
  useEffect(() => {
    setCurrentPage(1);
    setSelectedDrivers(new Set());
  }, [filter, searchQuery]);

  // Export drivers to Excel
  const handleExportDrivers = () => {
    if (applications.length === 0) {
      toast.error("No drivers to export");
      return;
    }
    exportToExcel(applications, "drivers", `drivers_export_${format(new Date(), "yyyy-MM-dd")}`);
    toast.success(`Exported ${applications.length} drivers`);
  };

  // Import drivers from Excel
  const handleImportDrivers = async (data: any[]): Promise<{ success: number; errors: string[] }> => {
    if (!tenantId) {
      return { success: 0, errors: ["No tenant selected"] };
    }

    let success = 0;
    const errors: string[] = [];

    const normalizeValue = (val: any) => String(val || "").trim();

    // Load existing drivers for upsert matching
    const { data: existingDrivers, error: existingError } = await supabase
      .from("applications")
      .select("id, personal_info")
      .eq("tenant_id", tenantId);

    if (existingError) {
      errors.push(`Failed to load existing drivers: ${existingError.message}`);
    }

    // Build a map of existing drivers by first+last name (lowercased)
    const existingByName = new Map<string, string>();
    (existingDrivers || []).forEach((d: any) => {
      const pi = d.personal_info || {};
      const key = `${(pi.firstName || "").toLowerCase()}_${(pi.lastName || "").toLowerCase()}`;
      if (key !== "_") existingByName.set(key, d.id);
    });

    for (const item of data) {
      try {
        // ExcelImportDialog already maps rows via mapExcelRowToEntity; if raw rows are provided, map them here.
        const mapped =
          item && typeof item === "object" && ("personal_info" in item || "driver_status" in item || "license_info" in item)
            ? item
            : mapExcelRowToEntity(item, "drivers");
        // Get names from mapped data or raw item
        const firstName = normalizeValue(mapped.personal_info?.firstName || item['First Name'] || item.firstName || "");
        const lastName = normalizeValue(mapped.personal_info?.lastName || item['Last Name'] || item.lastName || "");
        
        if (!firstName && !lastName) {
          errors.push(`Missing name for row`);
          continue;
        }

        const personalInfo = {
          firstName: firstName,
          lastName: lastName,
          email: normalizeValue(mapped.personal_info?.email || item['Email'] || item.email || ""),
          phone: normalizeValue(mapped.cell_phone || item['Phone'] || item.cell_phone || ""),
        };

        const licenseInfo = {
          licenseNumber: normalizeValue(mapped.license_info?.licenseNumber || item['License Number'] || ""),
          licenseState: normalizeValue(mapped.license_info?.licenseState || item['License State'] || ""),
          licenseExpiry: normalizeValue(mapped.license_info?.licenseExpiry || item['License Expiry'] || ""),
        };

        // Check for existing driver by name
        const nameKey = `${firstName.toLowerCase()}_${lastName.toLowerCase()}`;
        const existingId = existingByName.get(nameKey);

        if (existingId) {
          // Update existing driver
          const updateData: any = {
            personal_info: personalInfo,
            license_info: licenseInfo,
            driver_status: normalizeValue(mapped.driver_status || item['Status'] || "") || undefined,
            cell_phone: normalizeValue(mapped.cell_phone || item['Phone'] || "") || undefined,
            driver_address: normalizeValue(mapped.driver_address || item['Address'] || "") || undefined,
            medical_card_expiry: normalizeValue(mapped.medical_card_expiry || item['Medical Card Expiry'] || "") || null,
            hired_date: normalizeValue(mapped.hired_date || item['Hired Date'] || "") || null,
            pay_method: normalizeValue(mapped.pay_method || item['Pay Method'] || "") || undefined,
            base_salary: mapped.base_salary ? parseFloat(String(mapped.base_salary)) : undefined,
            hourly_rate: mapped.hourly_rate ? parseFloat(String(mapped.hourly_rate)) : undefined,
            pay_per_mile: mapped.pay_per_mile ? parseFloat(String(mapped.pay_per_mile)) : undefined,
            bank_name: normalizeValue(mapped.bank_name || item['Bank Name'] || "") || undefined,
            routing_number: normalizeValue(mapped.routing_number || item['Routing Number'] || "") || undefined,
            checking_number: normalizeValue(mapped.checking_number || item['Account Number'] || "") || undefined,
          };

          // Remove undefined values
          Object.keys(updateData).forEach(key => {
            if (updateData[key] === undefined) delete updateData[key];
          });

          const { error } = await supabase.from("applications").update(updateData).eq("id", existingId);
          if (error) {
            errors.push(`${firstName} ${lastName}: ${error.message}`);
          } else {
            success++;
          }
        } else {
          // Insert new driver
          const rowData: any = {
            personal_info: personalInfo,
            license_info: licenseInfo,
            driver_status: normalizeValue(mapped.driver_status || item['Status'] || "") || "active",
            cell_phone: normalizeValue(mapped.cell_phone || item['Phone'] || ""),
            driver_address: normalizeValue(mapped.driver_address || item['Address'] || ""),
            medical_card_expiry: normalizeValue(mapped.medical_card_expiry || item['Medical Card Expiry'] || "") || null,
            hired_date: normalizeValue(mapped.hired_date || item['Hired Date'] || "") || null,
            pay_method: normalizeValue(mapped.pay_method || item['Pay Method'] || "") || null,
            base_salary: mapped.base_salary ? parseFloat(String(mapped.base_salary)) : null,
            hourly_rate: mapped.hourly_rate ? parseFloat(String(mapped.hourly_rate)) : null,
            pay_per_mile: mapped.pay_per_mile ? parseFloat(String(mapped.pay_per_mile)) : null,
            bank_name: normalizeValue(mapped.bank_name || item['Bank Name'] || "") || null,
            routing_number: normalizeValue(mapped.routing_number || item['Routing Number'] || "") || null,
            checking_number: normalizeValue(mapped.checking_number || item['Account Number'] || "") || null,
            status: "submitted",
            contractor_agreement: { signed: false },
            direct_deposit: { enrolled: false },
            document_upload: { files: [] },
            driver_dispatch_sheet: { completed: false },
            driving_history: { entries: [] },
            drug_alcohol_policy: { acknowledged: false },
            employment_history: { entries: [] },
            no_rider_policy: { acknowledged: false },
            payroll_policy: { acknowledged: false },
            safe_driving_policy: { acknowledged: false },
            why_hire_you: { response: "" },
            tenant_id: tenantId,
          };

          const { error } = await supabase.from("applications").insert(rowData);
          if (error) {
            errors.push(`${firstName} ${lastName}: ${error.message}`);
          } else {
            success++;
          }
        }
      } catch (err: any) {
        errors.push(`Row error: ${err.message}`);
      }
    }

    if (success > 0) {
      loadData();
    }

    return { success, errors };
  };

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="space-y-3">
      {/* Compact Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold">Driver Management</h2>
        <div className="flex gap-0">
          <InviteDriverDialog />
          <AddDriverDialog onDriverAdded={loadData} />
        </div>
      </div>

      {/* Filters Row */}
      {(() => {
        const statusCounts = {
          all: applications.length,
          active: applications.filter(a => a.driver_status === "active").length,
          inactive: applications.filter(a => a.driver_status === "inactive").length,
          pending: applications.filter(a => a.driver_status === "pending").length,
          applications: applicationsCount, // Count of invited + completed + approved (non-hired)
        };

        return (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-48">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search by name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-7 text-sm"
              />
            </div>
            {/* Main status filters */}
            <div className="flex items-center gap-0">
              {[
                { key: "all", label: "All", count: statusCounts.all, activeClass: "btn-glossy-dark", badgeClass: "badge-inset-dark", softBadgeClass: "badge-inset" },
                { key: "active", label: "Active", count: statusCounts.active, activeClass: "btn-glossy-success", badgeClass: "badge-inset-success", softBadgeClass: "badge-inset-soft-green" },
                { key: "inactive", label: "Inactive", count: statusCounts.inactive, activeClass: "btn-glossy", badgeClass: "badge-inset", softBadgeClass: "badge-inset" },
                { key: "pending", label: "Pending", count: statusCounts.pending, activeClass: "btn-glossy-warning", badgeClass: "badge-inset-warning", softBadgeClass: "badge-inset-soft-orange" },
              ].map((status, index, arr) => (
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
                  className={`h-[28px] px-2.5 text-[12px] font-medium gap-1 border-0 ${
                    index === 0 ? 'rounded-l-full rounded-r-none' : 
                    index === arr.length - 1 ? 'rounded-r-full rounded-l-none' : 'rounded-none'
                  } ${
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

            {/* Spacer - approximately 1 button width */}
            <div className="w-10" />

            {/* Invitations + Applications filter group */}
            <div className="flex gap-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const next = new URLSearchParams(searchParams);
                  next.set("filter", "invitations");
                  setSearchParams(next);
                  setSearchQuery("");
                  loadInvitations();
                }}
                className={`h-[28px] px-2.5 text-[12px] font-medium gap-1 rounded-l-full rounded-r-none border-0 ${
                  filter === "invitations" 
                    ? 'btn-glossy-warning text-white' 
                    : 'btn-glossy text-gray-700'
                }`}
              >
                Invitations
                <span className={`${filter === "invitations" ? 'badge-inset-warning' : 'badge-inset-soft-orange'} text-[10px] h-5`}>{invites.length}</span>
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const next = new URLSearchParams(searchParams);
                  next.set("filter", "applications");
                  setSearchParams(next);
                  setSearchQuery("");
                }}
                className={`h-[28px] px-2.5 text-[12px] font-medium gap-1 rounded-r-full rounded-l-none border-0 ${
                  filter === "applications" 
                    ? 'btn-glossy-primary text-white' 
                    : 'btn-glossy text-gray-700'
                }`}
              >
                Applications
                <span className={`${filter === "applications" ? 'badge-inset-primary' : 'badge-inset-soft-blue'} text-[10px] h-5`}>{statusCounts.applications}</span>
              </Button>
            </div>
            
            {/* Export/Import buttons - right aligned */}
            <div className="ml-auto flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-[28px] px-2.5 text-[12px] font-medium gap-1.5 border-0 rounded-full btn-glossy text-gray-700"
                onClick={handleExportDrivers}
              >
                <Download className="h-3.5 w-3.5" />
                Export
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-[28px] px-2.5 text-[12px] font-medium gap-1.5 border-0 rounded-full btn-glossy text-gray-700"
                onClick={() => setImportDialogOpen(true)}
              >
                <Upload className="h-3.5 w-3.5" />
                Import
              </Button>
            </div>

          </div>
        );
      })()}

      {filter === "invitations" && (
        <Card>
          <CardHeader>
            <CardTitle>Driver Invitations</CardTitle>
            <CardDescription>Track all driver invitations and their application progress</CardDescription>
          </CardHeader>
          <CardContent>
            {filteredInvites.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                {searchQuery ? "No invitations match your search" : "No invitations sent yet"}
              </p>
            ) : (
              <Table className="text-sm">
                <TableHeader>
                  <TableRow className="bg-gradient-to-r from-blue-50 to-slate-50 dark:from-blue-950/30 dark:to-slate-950/30 h-10 border-b-2 border-blue-100 dark:border-blue-900">
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Name</TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Email</TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Invited</TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Opened</TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Progress</TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Status</TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvites.map((invite) => {
                    // Use actual current_step from application, fallback to 0
                    const progress = invite.current_step || 0;
                    
                    return (
                      <TableRow key={invite.id}>
                        <TableCell className="font-medium">{invite.name || "N/A"}</TableCell>
                        <TableCell>{invite.email}</TableCell>
                        <TableCell>
                          {invite.invited_at ? format(new Date(invite.invited_at), "MM/dd/yyyy") : "N/A"}
                        </TableCell>
                        <TableCell>
                          {invite.opened_at ? (
                            <div className="text-sm">
                              <div>{format(new Date(invite.opened_at), "MM/dd/yyyy")}</div>
                              <div className="text-muted-foreground">{format(new Date(invite.opened_at), "h:mm a")}</div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">Not opened</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                              <div 
                                className={`h-full rounded-full transition-all ${
                                  progress === 9 ? 'bg-green-500' : progress > 0 ? 'bg-blue-500' : 'bg-gray-300'
                                }`}
                                style={{ width: `${(progress / 9) * 100}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {progress}/9
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {progress > 0 ? (
                            <Badge variant="default">In Progress</Badge>
                          ) : invite.opened_at ? (
                            <Badge variant="secondary">Opened</Badge>
                          ) : (
                            <Badge variant="outline">Sent</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              onClick={() => handleResendInvite(invite)}
                              size="sm"
                              variant="outline"
                              className="gap-2"
                            >
                              <RotateCw className="h-4 w-4" />
                              Resend
                            </Button>
                            <Button
                              onClick={() => handleDeleteInvite(invite.id)}
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {(filter === "active" || filter === "inactive" || filter === "pending" || filter === "all") && (
        <Card className="flex flex-col" style={{ height: 'calc(100vh - 220px)' }}>
          {/* Bulk Action Bar */}
          {selectedDrivers.size > 0 && (
            <div className="flex items-center justify-between px-4 py-2 bg-blue-50 dark:bg-blue-950/50 border-b">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium">
                  {selectedDrivers.size} driver{selectedDrivers.size > 1 ? 's' : ''} selected
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedDrivers(new Set())}
                  className="h-7 px-2"
                >
                  <X className="h-4 w-4 mr-1" />
                  Clear
                </Button>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleBulkDelete}
                disabled={isDeleting}
                className="h-7"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                {isDeleting ? 'Deleting...' : `Delete ${selectedDrivers.size}`}
              </Button>
            </div>
          )}
          <CardContent className="p-0 flex flex-col flex-1 overflow-hidden">
            {filteredApplications.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                {searchQuery ? "No drivers match your search" : `No ${filter} drivers found`}
              </p>
            ) : (
              <>
              <div className="flex-1 overflow-auto overflow-x-auto">
                <Table className="text-sm">
                  <TableHeader>
                    <TableRow className="bg-gradient-to-r from-blue-50 to-slate-50 dark:from-blue-950/30 dark:to-slate-950/30 h-10 border-b-2 border-blue-100 dark:border-blue-900">
                      <TableHead className="py-2 px-2 w-[40px]">
                        <Checkbox
                          checked={paginatedApplications.length > 0 && selectedDrivers.size === paginatedApplications.length}
                          onCheckedChange={toggleAllDrivers}
                        />
                      </TableHead>
                      <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide w-[80px]">Status</TableHead>
                      <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Name/Phone</TableHead>
                      <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Vehicle</TableHead>
                      <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Salary</TableHead>
                      <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Age/DOB</TableHead>
                      <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">DL Class</TableHead>
                      <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">License Exp</TableHead>
                      <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">DOT EXP</TableHead>
                      <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Record Exp</TableHead>
                      <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">SS#</TableHead>
                      <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">App/DD</TableHead>
                      <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Hired/Term</TableHead>
                      <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedApplications.map((app: any) => {
                      const licenseInfo = app.license_info || {};
                      const personalInfo = app.personal_info || {};
                      const directDeposit = app.direct_deposit || {};
                      const age = personalInfo.dateOfBirth 
                        ? differenceInYears(new Date(), new Date(personalInfo.dateOfBirth))
                        : null;
                      
                      return (
                        <TableRow key={app.id} className={`h-10 cursor-pointer hover:bg-muted/50 ${selectedDrivers.has(app.id) ? 'bg-blue-50 dark:bg-blue-950/30' : ''}`} onClick={() => viewApplication(app.id)}>
                          <TableCell className="py-1 px-2" onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={selectedDrivers.has(app.id)}
                              onCheckedChange={() => toggleDriverSelection(app.id)}
                            />
                          </TableCell>
                          <TableCell className="py-1 px-2" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-1">
                              <div 
                                className={`w-6 h-6 rounded flex items-center justify-center font-bold text-xs text-white ${
                                  app.driver_status === "active" 
                                    ? "bg-green-600" 
                                    : app.driver_status === "pending"
                                    ? "bg-orange-500"
                                    : "bg-gray-500"
                                }`}
                              >
                                0
                              </div>
                              <Select
                                value={app.driver_status || "pending"}
                                onValueChange={(value) => handleDriverStatusChange(app.id, value)}
                              >
                                <SelectTrigger className={`w-[80px] h-6 text-sm px-1 ${
                                  app.driver_status === "active"
                                    ? "bg-green-100 text-green-800 border-green-200"
                                    : app.driver_status === "pending"
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
                            <div>{personalInfo.firstName} {personalInfo.lastName}</div>
                            <div className="text-xs text-muted-foreground">{personalInfo.phone}</div>
                          </TableCell>
                          <TableCell className="py-1 px-2">
                            {getVehicleForDriver(app.id) ? (
                              <span className="text-blue-600 font-medium">{getVehicleForDriver(app.id)}</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="py-1 px-2">
                            {app.pay_method_active ? (
                              <div className="flex flex-col">
                                <span className={`font-medium ${
                                  app.pay_method === 'percentage' ? 'text-amber-600' :
                                  app.pay_method === 'salary' ? 'text-blue-600' :
                                  app.pay_method === 'hourly' ? 'text-green-600' :
                                  app.pay_method === 'mileage' ? 'text-purple-600' :
                                  'text-foreground'
                                }`}>
                                  {app.pay_method === 'percentage' && app.load_percentage ? `${app.load_percentage}%` :
                                   app.pay_method === 'salary' && app.weekly_salary ? `$${app.weekly_salary}/wk` :
                                   app.pay_method === 'hourly' && app.hourly_rate ? `$${app.hourly_rate}/hr` :
                                   app.pay_method === 'mileage' && app.pay_per_mile ? `$${app.pay_per_mile}/mi` :
                                   app.pay_method === 'hybrid' ? 'Hybrid' :
                                   'N/A'}
                                </span>
                                <span className="text-xs text-emerald-600">Fleet$</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">N/A</span>
                            )}
                          </TableCell>
                          <TableCell className="py-1 px-2">
                            <div>{age !== null ? age : "N/A"}</div>
                            <div className="text-xs text-muted-foreground">
                              {personalInfo.dateOfBirth ? format(new Date(personalInfo.dateOfBirth), "MM/dd/yyyy") : "N/A"}
                            </div>
                          </TableCell>
                          <TableCell className="py-1 px-2">
                            <div>{licenseInfo.class || "N/A"}</div>
                            <div className="text-xs text-muted-foreground">{licenseInfo.endorsements || "None"}</div>
                          </TableCell>
                          <TableCell className="py-1 px-2">
                            {licenseInfo.expirationDate ? format(new Date(licenseInfo.expirationDate), "MM/dd/yyyy") : "N/A"}
                          </TableCell>
                          <TableCell className="py-1 px-2">
                            {app.driver_record_expiry ? format(new Date(app.driver_record_expiry), "MM/dd/yyyy") : "N/A"}
                          </TableCell>
                          <TableCell className="py-1 px-2">
                            {licenseInfo.driverRecordExpiry ? format(new Date(licenseInfo.driverRecordExpiry), "MM/dd/yyyy") : "N/A"}
                          </TableCell>
                          <TableCell className="py-1 px-2">
                            <div>{personalInfo.ssCard ? "Yes" : "No"}</div>
                            <div className="text-xs text-muted-foreground">{personalInfo.ssn || "N/A"}</div>
                          </TableCell>
                          <TableCell className="py-1 px-2">
                            <div>
                              {app.submitted_at ? format(new Date(app.submitted_at), "MM/dd/yyyy") : "N/A"}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {directDeposit.accountNumber ? "Yes" : "No"}
                            </div>
                          </TableCell>
                          <TableCell className="py-1 px-2">
                            <div>
                              {app.hired_date ? format(new Date(app.hired_date), "MM/dd/yyyy") : "N/A"}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {app.termination_date ? format(new Date(app.termination_date), "MM/dd/yyyy") : "N/A"}
                            </div>
                          </TableCell>
                          <TableCell className="py-1 px-2" onClick={(e) => e.stopPropagation()}>
                            <div className="flex gap-1 items-center">
                              <Button
                                onClick={() => viewApplication(app.id)}
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                                title="View Details"
                              >
                                <FileText className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                                title="Edit"
                              >
                                <Edit className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                onClick={() => handleDeleteDriver(app.id)}
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 text-destructive hover:text-destructive"
                                title="Delete"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {/* Always visible pagination */}
              <div className="flex items-center justify-between px-4 py-3 border-t bg-background flex-shrink-0">
                <div className="text-sm text-muted-foreground">
                  Showing {filteredApplications.length === 0 ? 0 : ((currentPage - 1) * ROWS_PER_PAGE) + 1} to {Math.min(currentPage * ROWS_PER_PAGE, filteredApplications.length)} of {filteredApplications.length}
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
              </>
            )}
          </CardContent>
        </Card>
      )}

      {filter === "active" && <DraftApplications />}

      {filter === "applications" && <ApplicationsManager />}

      {/* Import Dialog */}
      <ExcelImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        entityType="drivers"
        entityLabel="Drivers"
        onImport={handleImportDrivers}
      />
      
      {/* Missing Onboarding Items Dialog */}
      <MissingOnboardingItemsDialog
        open={missingItemsDialogOpen}
        onOpenChange={setMissingItemsDialogOpen}
        driverName={missingItemsDriverName}
        missingItems={missingItems}
        missingByCategory={missingByCategory}
      />
    </div>
  );
}