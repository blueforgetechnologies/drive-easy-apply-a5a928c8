import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { format } from "date-fns";
import { useTenantFilter } from "@/hooks/useTenantFilter";
import { useTenantContext } from "@/contexts/TenantContext";
import { 
  Download, 
  ExternalLink, 
  RotateCw, 
  Search, 
  ChevronLeft, 
  ChevronRight,
  Loader2,
  Eye,
  UserPlus,
  FileSearch,
  CheckCircle2,
  XCircle,
  Archive,
  Filter,
  AlertTriangle,
  MoreHorizontal,
  Trash2,
  Briefcase,
  Upload,
  FileText,
  ChevronDown,
} from "lucide-react";
import { InternalApplicationPreview } from "./InternalApplicationPreview";
import { PDFPreviewDialog } from "./PDFPreviewDialog";
import { ApplicationReviewDrawer } from "./ApplicationReviewDrawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

// Extended interface to include more fields for the drawer
interface ApplicationRow {
  id: string;
  personal_info: any;
  license_info?: any;
  employment_history?: any;
  driving_history?: any;
  document_upload?: any;
  emergency_contacts?: any;
  status: string;
  driver_status: string | null;
  current_step: number | null;
  updated_at: string | null;
  submitted_at: string | null;
  invite_id: string | null;
}

interface InviteWithToken {
  id: string;
  public_token: string;
  email: string;
  name?: string | null;
  invited_at?: string | null;
}

// Pending invite that hasn't started an application yet
interface PendingInvite {
  id: string;
  email: string;
  name: string | null;
  public_token: string;
  invited_at: string | null;
  opened_at: string | null;
}

type StatusFilter = "all" | "in_progress" | "submitted" | "approved" | "rejected" | "archived" | "needs_review";

export function ApplicationsManager() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [applications, setApplications] = useState<ApplicationRow[]>([]);
  const [invites, setInvites] = useState<Map<string, InviteWithToken>>(new Map());
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]); // Invites without applications
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [creatingSample, setCreatingSample] = useState(false);
  
  // Status filter
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  
  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [hiringId, setHiringId] = useState<string | null>(null);
  const [uploadingMvrId, setUploadingMvrId] = useState<string | null>(null);
  
  // Review drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedApplication, setSelectedApplication] = useState<ApplicationRow | null>(null);
  
  // PDF Preview state (in-app modal)
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewPdf, setPreviewPdf] = useState<string | null>(null);
  const [previewFilename, setPreviewFilename] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewDocuments, setPreviewDocuments] = useState<any>(null);
  
  // MVR Preview state
  const [mvrPreviewOpen, setMvrPreviewOpen] = useState(false);
  const [mvrPreviewUrl, setMvrPreviewUrl] = useState<string | null>(null);
  const [mvrPreviewLoading, setMvrPreviewLoading] = useState(false);
  
  // Rejection dialog state
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectingApp, setRejectingApp] = useState<ApplicationRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);
  
  // Test Mode toggle - disables mandatory field validation for testing
  const [testModeEnabled, setTestModeEnabled] = useState(() => {
    return localStorage.getItem("app_test_mode") === "true";
  });
  
  const ROWS_PER_PAGE = 25;
  const { tenantId, shouldFilter } = useTenantFilter();
  const { isPlatformAdmin, effectiveTenant } = useTenantContext();
  
  // Internal gating for sample creation button (platform admin OR internal channel)
  const canCreateSample = isPlatformAdmin || effectiveTenant?.release_channel === "internal";

  useEffect(() => {
    if (tenantId || !shouldFilter) {
      loadApplications();
    }
  }, [tenantId, shouldFilter]);

  const loadApplications = async () => {
    setLoading(true);
    try {
      // Load applications that are NOT yet hired (driver_status is null or rejected)
      // Once hired (driver_status = 'pending' or 'active'), they move to Drivers tab
      let query = supabase
        .from("applications")
        .select(`
          id, personal_info, license_info, employment_history, driving_history, 
          document_upload, emergency_contacts, status, driver_status, 
          current_step, updated_at, submitted_at, invite_id,
          rejected_at, rejected_by, rejected_by_name, rejection_reason
        `)
        .or("driver_status.is.null,driver_status.eq.rejected")
        .order("updated_at", { ascending: false });

      if (shouldFilter && tenantId) {
        query = query.eq("tenant_id", tenantId);
      }

      const { data, error } = await query;

      if (error) {
        toast.error("Error loading applications");
        console.error("Error:", error);
        return;
      }

      setApplications(data || []);

      // Load invite tokens for applications that have invite_id
      const inviteIds = (data || [])
        .filter((app) => app.invite_id)
        .map((app) => app.invite_id);

      if (inviteIds.length > 0) {
        let inviteQuery = supabase
          .from("driver_invites")
          .select("id, public_token, email")
          .in("id", inviteIds);

        if (shouldFilter && tenantId) {
          inviteQuery = inviteQuery.eq("tenant_id", tenantId);
        }

        const { data: inviteData } = await inviteQuery;

        if (inviteData) {
          const inviteMap = new Map<string, InviteWithToken>();
          inviteData.forEach((inv) => {
            inviteMap.set(inv.id, inv);
          });
          setInvites(inviteMap);
        }
      }
      
      // Load pending invites (invites without corresponding applications)
      await loadPendingInvites(data || []);
    } finally {
      setLoading(false);
    }
  };
  
  // Load invites that haven't started an application yet
  const loadPendingInvites = async (currentApps: ApplicationRow[]) => {
    try {
      // Get all invite IDs that already have applications
      const usedInviteIds = new Set(
        currentApps
          .filter((app) => app.invite_id)
          .map((app) => app.invite_id)
      );
      
      // Load all invites
      let query = supabase
        .from("driver_invites")
        .select("id, email, name, public_token, invited_at, opened_at")
        .order("invited_at", { ascending: false });
      
      if (shouldFilter && tenantId) {
        query = query.eq("tenant_id", tenantId);
      }
      
      const { data, error } = await query;
      
      if (error) {
        console.error("Error loading pending invites:", error);
        return;
      }
      
      // Filter to only invites without applications
      const pending = (data || []).filter(
        (inv) => !usedInviteIds.has(inv.id)
      );
      
      setPendingInvites(pending);
    } catch (error) {
      console.error("Error in loadPendingInvites:", error);
    }
  };
  
  // Resend invitation email for pending invites (no application yet)
  const handleResendPendingInvite = async (invite: PendingInvite) => {
    setResendingId(invite.id);
    try {
      const { data, error } = await supabase.functions.invoke("resend-driver-invite", {
        body: { 
          invite_id: invite.id,
          test_mode: testModeEnabled,
        },
      });
      
      if (error) throw error;
      
      if (!data?.success) {
        throw new Error(data?.error || "Failed to resend invitation");
      }
      
      toast.success(`Invitation resent to ${invite.email}`);
    } catch (error: any) {
      console.error("Error resending invite:", error);
      toast.error("Failed to resend invitation: " + error.message);
    } finally {
      setResendingId(null);
    }
  };

  const handleViewApplication = (id: string) => {
    navigate(`/dashboard/application/${id}`);
  };

  const handleOpenDrawer = (app: ApplicationRow) => {
    setSelectedApplication(app);
    setDrawerOpen(true);
  };

  const handleDownloadPDF = async (applicationId: string) => {
    setDownloadingId(applicationId);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.access_token) {
        toast.error("You must be logged in to download");
        return;
      }

      const { data, error } = await supabase.functions.invoke("generate-application-pdf", {
        body: { application_id: applicationId },
      });

      if (error) {
        throw error;
      }

      if (!data.success) {
        throw new Error(data.error || "Failed to generate PDF");
      }

      // Convert base64 to blob and download
      const byteCharacters = atob(data.pdf_base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: "application/pdf" });
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success("PDF downloaded");
    } catch (error: any) {
      console.error("Error downloading PDF:", error);
      toast.error("Failed to download PDF: " + (error.message || "Unknown error"));
    } finally {
      setDownloadingId(null);
    }
  };

  const handlePreviewPDF = async (applicationId: string, documentUpload?: any) => {
    // Open in-app modal with pdf.js rendering (no new tab, no Chrome blocking)
    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewPdf(null);
    setPreviewFilename("");
    setPreviewDocuments(documentUpload || null);

    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.access_token) {
        toast.error("You must be logged in to preview");
        setPreviewOpen(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke("generate-application-pdf", {
        body: { application_id: applicationId },
      });

      if (error) {
        throw error;
      }

      if (!data.success) {
        throw new Error(data.error || "Failed to generate PDF");
      }

      setPreviewPdf(data.pdf_base64);
      setPreviewFilename(data.filename || "application.pdf");
    } catch (error: any) {
      console.error("Error generating PDF preview:", error);
      toast.error("Failed to preview PDF: " + (error.message || "Unknown error"));
      setPreviewOpen(false);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleOpenPublicLink = (inviteId: string) => {
    const invite = invites.get(inviteId);
    if (!invite?.public_token) {
      toast.error("No invitation link available");
      return;
    }

    // Use /apply?token= path, NOT just /?token=
    // Append &preview=true if Test Mode is enabled
    const baseUrl = `${window.location.origin}/apply?token=${invite.public_token}`;
    const url = testModeEnabled ? `${baseUrl}&preview=true` : baseUrl;
    
    if (testModeEnabled) {
      toast.info("Opening in Test Mode - validation disabled");
    }
    
    window.open(url, "_blank");
  };

  const handleResendInvite = async (application: ApplicationRow) => {
    if (!application.invite_id) {
      toast.error("No invitation associated with this application");
      return;
    }

    setResendingId(application.id);
    try {
      // Use resend-driver-invite which does NOT create new invite/application rows
      const { error } = await supabase.functions.invoke("resend-driver-invite", {
        body: {
          invite_id: application.invite_id,
        },
      });

      if (error) throw error;
      toast.success("Invitation resent successfully");
    } catch (error: any) {
      toast.error("Failed to resend invitation: " + error.message);
    } finally {
      setResendingId(null);
    }
  };

  const handleCreateSampleApplication = async (profile: 'john_smith' | 'john_wick' | 'donald_trump' = 'john_smith') => {
    if (!tenantId) {
      toast.error("No tenant context available");
      return;
    }
    
    const profileNames = {
      john_smith: 'John Smith',
      john_wick: 'John Wick',
      donald_trump: 'Donald Trump',
    };
    
    setCreatingSample(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-sample-application", {
        body: { tenant_id: tenantId, profile },
      });

      // Surface full error details
      if (error) {
        console.error("Edge function error:", error);
        toast.error(`Edge function error: ${JSON.stringify(error)}`);
        return;
      }

      if (!data?.success) {
        console.error("Create sample failed:", data);
        toast.error(`Failed: ${data?.error || 'Unknown error'} - ${JSON.stringify(data?.details || {})}`);
        return;
      }

      toast.success(
        data.updated 
          ? `Sample application updated (${profileNames[profile]})` 
          : `Sample application created for ${profileNames[profile]}`
      );
      
      // Refresh the list, auto-search for the name, and reset to page 1
      await loadApplications();
      const searchName = profile === 'donald_trump' ? 'donald' : 'john';
      setSearchQuery(searchName);
      setCurrentPage(1);
      
      // Log the application ID for debugging
      if (data.application_id) {
        console.log(`Sample application ID: ${data.application_id}`);
      }
    } catch (error: any) {
      console.error("Error creating sample application:", error);
      toast.error("Failed to create sample: " + (error.message || "Unknown error"));
    } finally {
      setCreatingSample(false);
    }
  };

  // Quick approve a single application (inline row action) - uses edge function for proper workflow
  const handleQuickApprove = async (applicationId: string) => {
    setApprovingId(applicationId);
    try {
      const { data, error } = await supabase.functions.invoke("approve-application", {
        body: { application_id: applicationId },
      });

      if (error) throw error;
      
      if (!data?.success) {
        throw new Error(data?.error || "Failed to approve application");
      }

      toast.success(data.message || "Application approved - ready for hiring decision");
      await loadApplications();
    } catch (error: any) {
      toast.error("Failed to approve: " + error.message);
    } finally {
      setApprovingId(null);
    }
  };

  // Hire an approved applicant - creates pending driver
  const handleHire = async (applicationId: string) => {
    setHiringId(applicationId);
    try {
      const { data, error } = await supabase.functions.invoke("hire-driver", {
        body: { application_id: applicationId },
      });

      if (error) throw error;
      
      if (!data?.success) {
        throw new Error(data?.error || "Failed to hire driver");
      }

      toast.success(data.message || "Driver hired and added to Pending Drivers");
      
      // Invalidate business manager counts so Pending badge updates immediately
      queryClient.invalidateQueries({ queryKey: ["business-manager-counts"] });
      
      await loadApplications();
    } catch (error: any) {
      toast.error("Failed to hire: " + error.message);
    } finally {
      setHiringId(null);
    }
  };

  // Bulk actions - use edge function for proper workflow
  const handleBulkApprove = async () => {
    if (selectedIds.size === 0) return;
    setIsBulkProcessing(true);
    let successCount = 0;
    let errorCount = 0;
    
    try {
      // Call edge function for each application
      for (const appId of Array.from(selectedIds)) {
        const { data, error } = await supabase.functions.invoke("approve-application", {
          body: { application_id: appId },
        });
        
        if (error || !data?.success) {
          errorCount++;
        } else {
          successCount++;
        }
      }

      if (successCount > 0) {
        toast.success(`${successCount} application(s) approved - ready for hiring decisions`);
      }
      if (errorCount > 0) {
        toast.error(`${errorCount} application(s) failed to approve`);
      }
      
      setSelectedIds(new Set());
      await loadApplications();
    } catch (error: any) {
      toast.error("Bulk approve failed: " + error.message);
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const handleBulkArchive = async () => {
    if (selectedIds.size === 0) return;
    setIsBulkProcessing(true);
    try {
      const { error } = await supabase
        .from("applications")
        .update({ 
          status: "archived",
          updated_at: new Date().toISOString() 
        })
        .in("id", Array.from(selectedIds));

      if (error) throw error;
      toast.success(`${selectedIds.size} application(s) archived`);
      setSelectedIds(new Set());
      await loadApplications();
    } catch (error: any) {
      toast.error("Bulk archive failed: " + error.message);
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} application(s)? This cannot be undone.`)) {
      return;
    }
    setIsBulkProcessing(true);
    try {
      const { error } = await supabase
        .from("applications")
        .delete()
        .in("id", Array.from(selectedIds));

      if (error) throw error;
      toast.success(`${selectedIds.size} application(s) deleted`);
      setSelectedIds(new Set());
      await loadApplications();
    } catch (error: any) {
      toast.error("Bulk delete failed: " + error.message);
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === paginatedApplications.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedApplications.map((a) => a.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const getStatusBadge = (app: ApplicationRow) => {
    if (app.status === "approved") {
      return <Badge className="bg-green-600">Approved</Badge>;
    }
    if (app.status === "rejected") {
      return <Badge variant="destructive">Rejected</Badge>;
    }
    if (app.status === "archived") {
      return <Badge variant="secondary">Archived</Badge>;
    }
    if (app.status === "submitted") {
      return <Badge className="bg-blue-600">Completed</Badge>;
    }
    if (app.status === "in_progress") {
      return <Badge variant="default">In Progress (Step {app.current_step || 1}/9)</Badge>;
    }
    if (app.status === "invited") {
      return <Badge variant="secondary">Invitation Sent</Badge>;
    }
    // Handle "pending" status (legacy/manual entries)
    if (app.status === "pending") {
      return <Badge variant="outline" className="border-amber-500 text-amber-600">Pending Review</Badge>;
    }
    return <Badge variant="outline">{app.status || "Unknown"}</Badge>;
  };

  const getDriverStatusBadge = (status: string | null) => {
    if (status === "active") {
      return <Badge className="bg-emerald-600">Active</Badge>;
    }
    if (status === "pending") {
      return <Badge className="bg-amber-500">Pending</Badge>;
    }
    if (status === "inactive" || status === "rejected") {
      return <Badge variant="secondary">{status}</Badge>;
    }
    return <Badge variant="outline">—</Badge>;
  };

  const getApplicantName = (personalInfo: any) => {
    if (!personalInfo) return "Unknown";
    const first = personalInfo.firstName || "";
    const last = personalInfo.lastName || "";
    return `${first} ${last}`.trim() || "Unknown";
  };

  const needsReview = (app: ApplicationRow) => {
    const docs = app.document_upload || {};
    const requiredDocs = ["driversLicense", "socialSecurity", "medicalCard", "mvr"];
    const missingDocs = requiredDocs.filter((d) => !docs[d]);
    return missingDocs.length > 0 || (app.current_step || 0) < 9;
  };

  const isMvrMissing = (app: ApplicationRow) => {
    const docs = app.document_upload || {};
    return !docs.mvr;
  };

  const handleUploadMvr = async (applicationId: string, file: File) => {
    setUploadingMvrId(applicationId);
    try {
      // Validate file
      if (file.size > 10 * 1024 * 1024) {
        toast.error("File size must be less than 10MB");
        return;
      }
      const validTypes = ["image/jpeg", "image/png", "image/jpg", "application/pdf"];
      if (!validTypes.includes(file.type)) {
        toast.error("Please upload JPG, PNG, or PDF files only");
        return;
      }

      // Upload to storage
      const ext = file.name.split(".").pop() || "pdf";
      const storagePath = `${tenantId || "shared"}/applications/${applicationId}/mvr.${ext}`;
      
      const { error: uploadError } = await supabase.storage
        .from("load-documents")
        .upload(storagePath, file, { upsert: true });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        toast.error("Failed to upload MVR");
        return;
      }

      // Update application's document_upload field
      const app = applications.find((a) => a.id === applicationId);
      const currentDocs = app?.document_upload || {};
      
      const { error: updateError } = await supabase
        .from("applications")
        .update({
          document_upload: {
            ...currentDocs,
            mvr: storagePath,
          },
        })
        .eq("id", applicationId);

      if (updateError) {
        console.error("Update error:", updateError);
        toast.error("Failed to update application");
        return;
      }

      toast.success("MVR uploaded successfully");
      loadApplications();
    } catch (error) {
      console.error("Error uploading MVR:", error);
      toast.error("Failed to upload MVR");
    } finally {
      setUploadingMvrId(null);
    }
  };

  const handleViewMvr = async (app: ApplicationRow) => {
    const mvrPath = app.document_upload?.mvr;
    if (!mvrPath) {
      toast.error("No MVR uploaded");
      return;
    }

    setMvrPreviewLoading(true);
    setMvrPreviewOpen(true);

    try {
      const { data, error } = await supabase.storage
        .from("load-documents")
        .createSignedUrl(mvrPath, 3600);

      if (error) {
        console.error("Error creating signed URL:", error);
        toast.error("Could not load MVR document");
        setMvrPreviewOpen(false);
        return;
      }

      if (data?.signedUrl) {
        setMvrPreviewUrl(data.signedUrl);
      } else {
        toast.error("Could not generate MVR link");
        setMvrPreviewOpen(false);
      }
    } catch (error) {
      console.error("Error viewing MVR:", error);
      toast.error("Failed to view MVR");
      setMvrPreviewOpen(false);
    } finally {
      setMvrPreviewLoading(false);
    }
  };

  const triggerMvrUpload = (app: ApplicationRow, requireConfirmation: boolean) => {
    if (requireConfirmation && !isMvrMissing(app)) {
      const confirmed = window.confirm("An MVR is already uploaded. Do you want to replace it?");
      if (!confirmed) return;
    }

    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,.jpg,.jpeg,.png";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) handleUploadMvr(app.id, file);
    };
    input.click();
  };

  const handleDeleteMvr = async (app: ApplicationRow) => {
    const mvrPath = app.document_upload?.mvr;
    if (!mvrPath) {
      toast.error("No MVR to delete");
      return;
    }

    const confirmed = window.confirm("Are you sure you want to delete this MVR? This action cannot be undone.");
    if (!confirmed) return;

    try {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from("load-documents")
        .remove([mvrPath]);

      if (storageError) {
        console.error("Error deleting MVR from storage:", storageError);
        toast.error("Failed to delete MVR file");
        return;
      }

      // Update application record to remove MVR path
      const updatedDocUpload = { ...app.document_upload };
      delete updatedDocUpload.mvr;

      const { error: updateError } = await supabase
        .from("applications")
        .update({ document_upload: updatedDocUpload })
        .eq("id", app.id);

      if (updateError) {
        console.error("Error updating application:", updateError);
        toast.error("Failed to update application record");
        return;
      }

      toast.success("MVR deleted successfully");
      loadApplications();
    } catch (error) {
      console.error("Error deleting MVR:", error);
      toast.error("Failed to delete MVR");
    }
  };

  // Handle rejection with reason
  const handleOpenRejectDialog = (app: ApplicationRow) => {
    setRejectingApp(app);
    setRejectReason("");
    setRejectDialogOpen(true);
  };

  const handleReject = async () => {
    if (!rejectingApp) return;
    if (!rejectReason.trim()) {
      toast.error("Please provide a reason for rejection");
      return;
    }
    setIsRejecting(true);
    try {
      // Get current user info for tracking who rejected
      const { data: { user } } = await supabase.auth.getUser();
      let rejectedByName = "Unknown";
      
      if (user) {
        // Try to get user's name from profiles
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, email")
          .eq("id", user.id)
          .maybeSingle();
        
        if (profile) {
          rejectedByName = profile.full_name || profile.email || user.email || "Unknown";
        } else {
          rejectedByName = user.email || "Unknown";
        }
      }

      const { error } = await supabase
        .from("applications")
        .update({ 
          status: "rejected", 
          driver_status: "rejected", 
          updated_at: new Date().toISOString(),
          rejected_at: new Date().toISOString(),
          rejected_by: user?.id || null,
          rejected_by_name: rejectedByName,
          rejection_reason: rejectReason.trim(),
        })
        .eq("id", rejectingApp.id);
      
      if (error) throw error;
      
      toast.success("Application rejected");
      setRejectDialogOpen(false);
      setRejectingApp(null);
      setRejectReason("");
      loadApplications();
    } catch (error: any) {
      console.error("Error rejecting application:", error);
      toast.error("Failed to reject application");
    } finally {
      setIsRejecting(false);
    }
  };

  // Filter applications by status - now excludes "invited" since those are shown in separate Invitations tab
  const statusFilteredApplications = applications.filter((app) => {
    // Always exclude invited status from ApplicationsManager (handled in Invitations tab)
    if (app.status === "invited") return false;
    
    if (statusFilter === "all") return app.status !== "archived";
    if (statusFilter === "archived") return app.status === "archived";
    if (statusFilter === "needs_review") return needsReview(app) && app.status !== "archived";
    // "Completed" = driver actually finished & submitted (step 9/9 AND status submitted/pending)
    if (statusFilter === "submitted") {
      const isSubmittedStatus = app.status === "submitted" || app.status === "pending";
      return isSubmittedStatus && app.current_step === 9;
    }
    return app.status === statusFilter;
  });

  // Search filter (name, email, phone)
  const filteredApplications = statusFilteredApplications.filter((app) => {
    const name = getApplicantName(app.personal_info).toLowerCase();
    const email = (app.personal_info?.email || "").toLowerCase();
    const phone = (app.personal_info?.phone || "").replace(/\D/g, "");
    const query = searchQuery.toLowerCase();
    const queryDigits = searchQuery.replace(/\D/g, "");
    return name.includes(query) || email.includes(query) || (queryDigits.length >= 3 && phone.includes(queryDigits));
  });

  const totalPages = Math.ceil(filteredApplications.length / ROWS_PER_PAGE);
  const paginatedApplications = filteredApplications.slice(
    (currentPage - 1) * ROWS_PER_PAGE,
    currentPage * ROWS_PER_PAGE
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter]);

  // Status filter counts - excludes invited since those are in separate Invitations tab
  const nonInvitedApps = applications.filter((a) => a.status !== "invited");
  const statusCounts = {
    all: nonInvitedApps.filter((a) => a.status !== "archived").length,
    in_progress: nonInvitedApps.filter((a) => a.status === "in_progress").length,
    submitted: nonInvitedApps.filter((a) => (a.status === "submitted" || a.status === "pending") && a.current_step === 9).length,
    approved: nonInvitedApps.filter((a) => a.status === "approved").length,
    rejected: nonInvitedApps.filter((a) => a.status === "rejected").length,
    archived: nonInvitedApps.filter((a) => a.status === "archived").length,
    needs_review: nonInvitedApps.filter((a) => needsReview(a) && a.status !== "archived").length,
  };
  
  // Filter pending invites by search
  const filteredPendingInvites = pendingInvites.filter((inv) => {
    if (!searchQuery) return true;
    const name = (inv.name || "").toLowerCase();
    const email = inv.email.toLowerCase();
    const query = searchQuery.toLowerCase();
    return name.includes(query) || email.includes(query);
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card className="flex flex-col" style={{ height: "calc(100vh - 220px)" }}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Applications Manager</CardTitle>
            <CardDescription>
              Manage driver applications with workflow actions
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {/* INTERNAL ONLY: Create Sample Application Dropdown */}
            {canCreateSample && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={creatingSample}
                    className="gap-2"
                  >
                    {creatingSample ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <UserPlus className="h-4 w-4" />
                    )}
                    Create Sample
                    <ChevronDown className="h-3 w-3" />
                    <Badge variant="secondary" className="ml-1 text-xs">INTERNAL</Badge>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-background">
                  <DropdownMenuItem onClick={() => handleCreateSampleApplication('john_smith')}>
                    <UserPlus className="h-4 w-4 mr-2" />
                    John Smith
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleCreateSampleApplication('john_wick')}>
                    <UserPlus className="h-4 w-4 mr-2" />
                    John Wick
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleCreateSampleApplication('donald_trump')}>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Donald Trump
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {/* View Fillable Application Button - Opens application form in preview mode */}
            {canCreateSample && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open("/apply?preview=true", "_blank")}
                className="gap-2"
              >
                <Eye className="h-4 w-4" />
                View Fillable Application
              </Button>
            )}
            {/* Test Mode Toggle - Disables mandatory field validation globally */}
            {canCreateSample && (
              <Button
                variant={testModeEnabled ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  const newValue = !testModeEnabled;
                  setTestModeEnabled(newValue);
                  localStorage.setItem("app_test_mode", newValue ? "true" : "false");
                  toast.success(newValue 
                    ? "Test Mode ON - Mandatory field validation disabled" 
                    : "Test Mode OFF - Mandatory field validation restored"
                  );
                }}
                className={`gap-2 ${testModeEnabled ? "bg-amber-500 hover:bg-amber-600 border-amber-600" : ""}`}
              >
                <AlertTriangle className="h-4 w-4" />
                Test Mode {testModeEnabled ? "ON" : "OFF"}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="p-0 flex flex-col flex-1 overflow-hidden">
        {/* Status Filter Toolbar - Glossy style matching Loads */}
        <div className="px-4 py-2 border-b bg-muted/30 flex items-center gap-0">
          <Filter className="h-4 w-4 text-muted-foreground mr-2" />
          {[
            { key: "all" as StatusFilter, label: "All", activeClass: "btn-glossy-dark", badgeClass: "badge-inset-dark", softBadgeClass: "badge-inset" },
            { key: "submitted" as StatusFilter, label: "Completed", activeClass: "btn-glossy-primary", badgeClass: "badge-inset-primary", softBadgeClass: "badge-inset-soft-blue" },
            { key: "approved" as StatusFilter, label: "Approved", activeClass: "btn-glossy-success", badgeClass: "badge-inset-success", softBadgeClass: "badge-inset-soft-green" },
            { key: "rejected" as StatusFilter, label: "Rejected", activeClass: "btn-glossy-danger", badgeClass: "badge-inset-danger", softBadgeClass: "badge-inset-soft-red" },
            { key: "archived" as StatusFilter, label: "Archived", activeClass: "btn-glossy-dark", badgeClass: "badge-inset-dark", softBadgeClass: "badge-inset" },
          ].map((status) => (
            <Button
              key={status.key}
              variant="ghost"
              size="sm"
              onClick={() => setStatusFilter(status.key)}
              className={`h-[28px] px-2.5 text-[12px] font-medium gap-1 rounded-none first:rounded-l-full last:rounded-r-full border-0 ${
                statusFilter === status.key 
                  ? `${status.activeClass} text-white` 
                  : 'btn-glossy text-gray-700'
              }`}
            >
              {status.label}
              <span className={`${statusFilter === status.key ? status.badgeClass : status.softBadgeClass} text-[10px] h-5`}>
                {statusCounts[status.key]}
              </span>
            </Button>
          ))}
        </div>

        {/* Search + Bulk Actions + Tip */}
        <div className="px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search name, email, or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8"
              />
            </div>
            <span className="text-xs text-muted-foreground hidden md:inline">
              💡 Click a row to review and approve
            </span>
          </div>

          {/* Bulk Actions */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {selectedIds.size} selected
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleBulkApprove}
                disabled={isBulkProcessing}
                className="gap-1 h-7"
              >
                <CheckCircle2 className="h-3 w-3" />
                Approve
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleBulkArchive}
                disabled={isBulkProcessing}
                className="gap-1 h-7"
              >
                <Archive className="h-3 w-3" />
                Archive
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleBulkDelete}
                disabled={isBulkProcessing}
                className="gap-1 h-7 text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-3 w-3" />
                Delete
              </Button>
            </div>
          )}
        </div>

        {filteredApplications.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            {searchQuery ? "No applications match your search" : "No applications found"}
          </p>
        ) : (
          <>
            <div className="flex-1 overflow-auto">
              <Table className="text-sm">
                <TableHeader>
                  <TableRow className="bg-gradient-to-r from-blue-50 to-slate-50 dark:from-blue-950/30 dark:to-slate-950/30">
                    <TableHead className="w-[40px]">
                      <Checkbox
                        checked={selectedIds.size === paginatedApplications.length && paginatedApplications.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead className="font-bold text-blue-700 dark:text-blue-400">Applicant</TableHead>
                    <TableHead className="font-bold text-blue-700 dark:text-blue-400">Email / Phone</TableHead>
                    <TableHead className="font-bold text-blue-700 dark:text-blue-400">Status</TableHead>
                    <TableHead className="font-bold text-blue-700 dark:text-blue-400">Progress</TableHead>
                    <TableHead className="font-bold text-blue-700 dark:text-blue-400">Completed</TableHead>
                    <TableHead className="font-bold text-blue-700 dark:text-blue-400 w-[140px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedApplications.map((app) => {
                    const isSubmittedOrPending = app.status === "submitted" || app.status === "pending";
                    // Show Approve button for submitted/pending, step 9, not already approved/rejected
                    const isFormComplete = isSubmittedOrPending && app.current_step === 9;
                    const showApproveButton = isFormComplete && app.status !== "approved" && app.status !== "rejected";
                    const mvrMissing = isMvrMissing(app);
                    const canApprove = showApproveButton && !mvrMissing;
                    
                    return (
                      <TableRow 
                        key={app.id} 
                        className="hover:bg-muted/50 cursor-pointer group"
                        onClick={(e) => {
                          // Don't open drawer if clicking on interactive elements
                          const target = e.target as HTMLElement;
                          if (target.closest('button, [role="menuitem"], [role="checkbox"], a')) return;
                          handleOpenDrawer(app);
                        }}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.has(app.id)}
                            onCheckedChange={() => toggleSelect(app.id)}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {getApplicantName(app.personal_info)}
                            {needsReview(app) && (
                              <AlertTriangle className="h-3 w-3 text-amber-500" />
                            )}
                            {isSubmittedOrPending && app.current_step === 9 && !needsReview(app) && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 border-green-500 text-green-600">
                                Ready
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{app.personal_info?.email || "—"}</div>
                          <div className="text-xs text-muted-foreground">
                            {app.personal_info?.phone || "—"}
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(app)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-primary rounded-full transition-all"
                                style={{ width: `${((app.current_step || 1) / 9) * 100}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {app.current_step || 1}/9
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {app.submitted_at
                            ? format(new Date(app.submitted_at), "MM/dd/yy HH:mm")
                            : "—"}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="flex gap-1 items-center">
                            {/* Status-aware row actions */}
                            
                            {/* INVITED: Resend Invite + View */}
                            {app.status === "invited" && (
                              <>
                                {app.invite_id && invites.has(app.invite_id) && (
                                  <Button
                                    onClick={() => handleResendInvite(app)}
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2 gap-1"
                                    disabled={resendingId === app.id}
                                  >
                                    {resendingId === app.id ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <RotateCw className="h-3 w-3" />
                                    )}
                                    Resend
                                  </Button>
                                )}
                                <Button
                                  onClick={() => handleOpenDrawer(app)}
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  title="View Application"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </>
                            )}

                            {/* SUBMITTED/PENDING: MVR Dropdown + Approve (if ready) or View + Reject */}
                            {isSubmittedOrPending && (
                              <>
                                {/* MVR Dropdown - View/Upload actions */}
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className={`h-7 px-2 gap-1 ${
                                        isMvrMissing(app)
                                          ? "border-amber-500 text-amber-700 hover:bg-amber-50"
                                          : "border-green-500 text-green-700 hover:bg-green-50"
                                      }`}
                                      disabled={uploadingMvrId === app.id}
                                    >
                                      {uploadingMvrId === app.id ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : isMvrMissing(app) ? (
                                        <Upload className="h-3 w-3" />
                                      ) : (
                                        <CheckCircle2 className="h-3 w-3" />
                                      )}
                                      {isMvrMissing(app) ? "MVR" : "MVR ✓"}
                                      <ChevronDown className="h-3 w-3" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="start" className="bg-background z-50">
                                    {!isMvrMissing(app) && (
                                      <DropdownMenuItem onClick={() => handleViewMvr(app)}>
                                        <FileText className="h-4 w-4 mr-2" />
                                        View MVR
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem onClick={() => triggerMvrUpload(app, !isMvrMissing(app))}>
                                      <Upload className="h-4 w-4 mr-2" />
                                      {isMvrMissing(app) ? "Upload MVR" : "Replace MVR"}
                                    </DropdownMenuItem>
                                    {!isMvrMissing(app) && (
                                      <DropdownMenuItem 
                                        onClick={() => handleDeleteMvr(app)}
                                        className="text-destructive focus:text-destructive"
                                      >
                                        <Trash2 className="h-4 w-4 mr-2" />
                                        Delete MVR
                                      </DropdownMenuItem>
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                                {showApproveButton ? (
                                  <Button
                                    onClick={() => {
                                      if (mvrMissing) {
                                        toast.error("MVR is required before approval. Please upload the Motor Vehicle Record.");
                                        return;
                                      }
                                      handleQuickApprove(app.id);
                                    }}
                                    size="sm"
                                    className={`h-7 px-2 gap-1 ${
                                      mvrMissing 
                                        ? "bg-muted text-muted-foreground cursor-not-allowed hover:bg-muted" 
                                        : "bg-green-600 hover:bg-green-700 text-white"
                                    }`}
                                    disabled={approvingId === app.id}
                                  >
                                    {approvingId === app.id ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <CheckCircle2 className="h-3 w-3" />
                                    )}
                                    Approve
                                  </Button>
                                ) : (
                                  <Button
                                    onClick={() => handleOpenDrawer(app)}
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7"
                                    title={`Not ready: ${(app.current_step || 1) < 9 ? `Step ${app.current_step || 1}/9` : ""}${needsReview(app) ? " Missing docs" : ""}`}
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                )}
                                <Button
                                  onClick={() => handleOpenRejectDialog(app)}
                                  size="sm"
                                  variant="destructive"
                                  className="h-7 px-2 gap-1"
                                >
                                  <XCircle className="h-3 w-3" />
                                  Reject
                                </Button>
                              </>
                            )}

                            {/* APPROVED: Show Hire button (if not already hired) or View */}
                            {app.status === "approved" && (
                              <>
                                {/* Only show Hire if driver_status is null (not yet hired) */}
                                {!app.driver_status && (
                                  <Button
                                    onClick={() => handleHire(app.id)}
                                    size="sm"
                                    className="h-7 px-2 bg-blue-600 hover:bg-blue-700 text-white gap-1"
                                    disabled={hiringId === app.id}
                                  >
                                    {hiringId === app.id ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <Briefcase className="h-3 w-3" />
                                    )}
                                    Hire
                                  </Button>
                                )}
                                {app.driver_status === "pending" && (
                                  <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                                    Hired - Pending
                                  </Badge>
                                )}
                                <Button
                                  onClick={() => handleOpenDrawer(app)}
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  title="View Application"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </>
                            )}

                            {/* REJECTED: Archive button + View */}
                            {app.status === "rejected" && (
                              <>
                                <Button
                                  onClick={async () => {
                                    try {
                                      const { error } = await supabase
                                        .from("applications")
                                        .update({ 
                                          status: "archived",
                                          updated_at: new Date().toISOString() 
                                        })
                                        .eq("id", app.id);
                                      if (error) throw error;
                                      toast.success("Application archived");
                                      await loadApplications();
                                    } catch (err: any) {
                                      toast.error("Failed to archive: " + err.message);
                                    }
                                  }}
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 gap-1"
                                >
                                  <Archive className="h-3 w-3" />
                                  Archive
                                </Button>
                                <Button
                                  onClick={() => handleOpenDrawer(app)}
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  title="View Application"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </>
                            )}

                            {/* ARCHIVED: View only */}
                            {app.status === "archived" && (
                              <Button
                                onClick={() => handleOpenDrawer(app)}
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                title="View Application"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            )}

                            {/* IN_PROGRESS: View only */}
                            {app.status === "in_progress" && (
                              <Button
                                onClick={() => handleOpenDrawer(app)}
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                title="View Application (In Progress)"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            )}
                            
                            {/* More actions dropdown - always available */}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleOpenDrawer(app)}>
                                  <Eye className="h-4 w-4 mr-2" />
                                  View Application
                                </DropdownMenuItem>
                                
                                {/* Download PDF - row action only */}
                                <DropdownMenuItem 
                                  onClick={() => handleDownloadPDF(app.id)} 
                                  disabled={downloadingId === app.id}
                                >
                                  {downloadingId === app.id ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  ) : (
                                    <Download className="h-4 w-4 mr-2" />
                                  )}
                                  Download PDF
                                </DropdownMenuItem>
                                
                                <DropdownMenuSeparator />
                                
                                <DropdownMenuItem onClick={() => handleViewApplication(app.id)}>
                                  <ExternalLink className="h-4 w-4 mr-2" />
                                  View Full Details
                                </DropdownMenuItem>
                                
                                {/* Resend Invite - only for invited with invite_id */}
                                {app.status === "invited" && app.invite_id && invites.has(app.invite_id) && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => handleOpenPublicLink(app.invite_id!)}>
                                      <ExternalLink className="h-4 w-4 mr-2" />
                                      Open Public Link
                                    </DropdownMenuItem>
                                    <DropdownMenuItem 
                                      onClick={() => handleResendInvite(app)}
                                      disabled={resendingId === app.id}
                                    >
                                      {resendingId === app.id ? (
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                      ) : (
                                        <RotateCw className="h-4 w-4 mr-2" />
                                      )}
                                      Resend Invite
                                    </DropdownMenuItem>
                                  </>
                                )}
                                
                                {/* Archive - available unless already archived */}
                                {app.status !== "archived" && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem 
                                      onClick={async () => {
                                        try {
                                          const { error } = await supabase
                                            .from("applications")
                                            .update({ 
                                              status: "archived",
                                              updated_at: new Date().toISOString() 
                                            })
                                            .eq("id", app.id);
                                          if (error) throw error;
                                          toast.success("Application archived");
                                          await loadApplications();
                                        } catch (err: any) {
                                          toast.error("Failed to archive: " + err.message);
                                        }
                                      }}
                                    >
                                      <Archive className="h-4 w-4 mr-2" />
                                      Archive
                                    </DropdownMenuItem>
                                  </>
                                )}
                                
                                {/* Restore - for archived applications, restore to appropriate status */}
                                {app.status === "archived" && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem 
                                      onClick={async () => {
                                        // Determine appropriate status based on progress
                                        let newStatus = "invited"; // default
                                        if (app.current_step === 9) {
                                          newStatus = "submitted"; // completed application
                                        } else if ((app.current_step || 0) > 1) {
                                          newStatus = "in_progress"; // partially completed
                                        }
                                        
                                        try {
                                          const { error } = await supabase
                                            .from("applications")
                                            .update({ 
                                              status: newStatus,
                                              updated_at: new Date().toISOString() 
                                            })
                                            .eq("id", app.id);
                                          if (error) throw error;
                                          
                                          const statusLabel = newStatus === "submitted" ? "Completed" : 
                                                             newStatus === "in_progress" ? "In Progress" : "Invited";
                                          toast.success(`Application restored to ${statusLabel}`);
                                          await loadApplications();
                                        } catch (err: any) {
                                          toast.error("Failed to restore: " + err.message);
                                        }
                                      }}
                                    >
                                      <RotateCw className="h-4 w-4 mr-2" />
                                      Restore
                                    </DropdownMenuItem>
                                  </>
                                )}
                                
                                {/* Delete - permanently remove application */}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem 
                                  onClick={async () => {
                                    if (!confirm(`Delete application for ${getApplicantName(app.personal_info)}? This cannot be undone.`)) {
                                      return;
                                    }
                                    try {
                                      const { error } = await supabase
                                        .from("applications")
                                        .delete()
                                        .eq("id", app.id);
                                      if (error) throw error;
                                      toast.success("Application deleted");
                                      await loadApplications();
                                    } catch (err: any) {
                                      toast.error("Failed to delete: " + err.message);
                                    }
                                  }}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {/* Pending invites moved to separate Invitations tab in DriversTab */}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-3 border-t bg-background flex-shrink-0">
              <div className="text-sm text-muted-foreground">
                Showing {((currentPage - 1) * ROWS_PER_PAGE) + 1} to{" "}
                {Math.min(currentPage * ROWS_PER_PAGE, filteredApplications.length)} of{" "}
                {filteredApplications.length}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="h-7"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm">
                  Page {currentPage} of {Math.max(1, totalPages)}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="h-7"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
      
      {/* PDF Preview Dialog (renders pages as images via pdf.js) */}
      <PDFPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        pdfBase64={previewPdf}
        filename={previewFilename}
        isLoading={previewLoading}
        documents={previewDocuments}
      />

      {/* Application Review Drawer */}
      <ApplicationReviewDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        application={selectedApplication}
        onPreviewPDF={handlePreviewPDF}
        onStatusChange={() => {
          loadApplications();
          setDrawerOpen(false);
        }}
      />

      {/* MVR Preview Dialog */}
      <Dialog open={mvrPreviewOpen} onOpenChange={setMvrPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0 overflow-hidden">
          <DialogHeader className="px-6 py-4 border-b">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Motor Vehicle Record (MVR)
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            {mvrPreviewLoading ? (
              <div className="flex items-center justify-center h-96">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : mvrPreviewUrl ? (
              (() => {
                const isPdf = mvrPreviewUrl.toLowerCase().includes('.pdf') || 
                              mvrPreviewUrl.toLowerCase().includes('application/pdf');
                const isImage = /\.(jpg|jpeg|png|gif|webp)/i.test(mvrPreviewUrl);
                
                if (isImage) {
                  return (
                    <div className="p-4 flex items-center justify-center bg-muted/30">
                      <img
                        src={mvrPreviewUrl}
                        alt="Motor Vehicle Record"
                        className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-lg"
                      />
                    </div>
                  );
                }
                
                // For PDFs, use Google Docs viewer
                const googleDocsUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(mvrPreviewUrl)}&embedded=true`;
                return (
                  <iframe
                    src={googleDocsUrl}
                    className="w-full h-[70vh] border-0"
                    title="MVR Preview"
                  />
                );
              })()
            ) : (
              <div className="flex items-center justify-center h-96 text-muted-foreground">
                No document available
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Rejection Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <XCircle className="h-5 w-5" />
              Reject Application
            </DialogTitle>
          </DialogHeader>
          
          {rejectingApp && (
            <div className="space-y-4">
              {/* Driver Details */}
              <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-lg">
                    {getApplicantName(rejectingApp.personal_info)}
                  </span>
                </div>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>{rejectingApp.personal_info?.email || "No email"}</p>
                  <p>{rejectingApp.personal_info?.phone || "No phone"}</p>
                </div>
              </div>

              {/* Reason Field */}
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Reason for Rejection <span className="text-destructive">*</span>
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Enter the reason for rejecting this application..."
                  className="w-full min-h-[100px] p-3 border rounded-md text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setRejectDialogOpen(false)}
                  disabled={isRejecting}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleReject}
                  disabled={isRejecting || !rejectReason.trim()}
                >
                  {isRejecting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Rejecting...
                    </>
                  ) : (
                    "Reject Application"
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
