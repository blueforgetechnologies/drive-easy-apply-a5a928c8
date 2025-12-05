import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { InviteDriverDialog } from "@/components/InviteDriverDialog";
import { AddDriverDialog } from "@/components/AddDriverDialog";
import { DraftApplications } from "@/components/DraftApplications";
import { RotateCw, FileText, Edit, Search } from "lucide-react";

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
}

export default function DriversTab() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = searchParams.get("filter") || "active";
  const [applications, setApplications] = useState<Application[]>([]);
  const [invites, setInvites] = useState<DriverInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    loadData();
  }, [filter]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (filter === "all") {
        await loadAllDrivers();
      } else if (filter === "active") {
        await loadActiveDrivers();
      } else if (filter === "pending") {
        await loadPendingDrivers();
      } else if (filter === "invitations") {
        await loadInvitations();
      } else if (filter === "inactive") {
        await loadInactiveDrivers();
      }
    } finally {
      setLoading(false);
    }
  };

  const loadAllDrivers = async () => {
    const { data, error } = await supabase
      .from("applications")
      .select("*")
      .not("submitted_at", "is", null)
      .order("submitted_at", { ascending: false });

    if (error) {
      toast.error("Error loading drivers");
      return;
    }
    setApplications(data || []);
  };

  const loadActiveDrivers = async () => {
    const { data, error } = await supabase
      .from("applications")
      .select("*")
      .not("submitted_at", "is", null)
      .eq("driver_status", "active")
      .order("submitted_at", { ascending: false });

    if (error) {
      toast.error("Error loading active drivers");
      return;
    }
    setApplications(data || []);
  };

  const loadPendingDrivers = async () => {
    const { data, error } = await supabase
      .from("applications")
      .select("*")
      .not("submitted_at", "is", null)
      .eq("driver_status", "pending")
      .order("submitted_at", { ascending: false });

    if (error) {
      toast.error("Error loading pending drivers");
      return;
    }
    setApplications(data || []);
  };

  const loadInvitations = async () => {
    const { data: invitesData, error: invitesError } = await supabase
      .from("driver_invites")
      .select("*")
      .order("invited_at", { ascending: false });

    if (invitesError) {
      toast.error("Error loading invitations");
      return;
    }

    // Check for completed applications
    const { data: applicationsData, error: appsError } = await supabase
      .from("applications")
      .select("id, personal_info, submitted_at, driver_status")
      .not("submitted_at", "is", null);

    if (appsError) {
      console.error("Error loading applications:", appsError);
    }

    // Match invitations with submitted applications
    const enrichedInvites = (invitesData || []).map((invite) => {
      const matchedApp = (applicationsData || []).find(
        (app: any) => app.personal_info?.email === invite.email
      );
      
      return {
        ...invite,
        completed: !!matchedApp,
        application_id: matchedApp?.id,
      };
    });

    setInvites(enrichedInvites);
  };

  const loadInactiveDrivers = async () => {
    const { data, error } = await supabase
      .from("applications")
      .select("*")
      .not("submitted_at", "is", null)
      .eq("driver_status", "inactive")
      .order("submitted_at", { ascending: false });

    if (error) {
      toast.error("Error loading inactive drivers");
      return;
    }
    setApplications(data || []);
  };

  const handleResendInvite = async (invite: DriverInvite) => {
    try {
      const { error } = await supabase.functions.invoke("send-driver-invite", {
        body: {
          email: invite.email,
          name: invite.name,
        },
      });

      if (error) throw error;
      toast.success("Invitation resent successfully");
    } catch (error: any) {
      toast.error("Failed to resend invitation");
    }
  };

  const handleDeleteInvite = async (inviteId: string) => {
    try {
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

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Driver Management</h2>
        <div className="flex gap-2">
          <AddDriverDialog onDriverAdded={loadData} />
          <InviteDriverDialog />
        </div>
      </div>

      {/* Tabs and Search */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex flex-wrap gap-2">
          <Button
            variant={filter === "invitations" ? "default" : "outline"}
            onClick={() => {
              setSearchParams({ filter: "invitations" });
              setSearchQuery("");
            }}
            className={filter === "invitations" ? "bg-primary text-primary-foreground" : ""}
          >
            Invitations
          </Button>
          <Button
            variant={filter === "pending" ? "default" : "outline"}
            onClick={() => {
              setSearchParams({ filter: "pending" });
              setSearchQuery("");
            }}
            className={filter === "pending" ? "bg-accent text-accent-foreground" : ""}
          >
            Pending
          </Button>
          <Button
            variant={filter === "active" ? "default" : "outline"}
            onClick={() => {
              setSearchParams({ filter: "active" });
              setSearchQuery("");
            }}
            className={filter === "active" ? "bg-green-600 text-white hover:bg-green-700" : ""}
          >
            Active
          </Button>
          <Button
            variant={filter === "inactive" ? "default" : "outline"}
            onClick={() => {
              setSearchParams({ filter: "inactive" });
              setSearchQuery("");
            }}
            className={filter === "inactive" ? "bg-muted text-muted-foreground" : ""}
          >
            Inactive
          </Button>
          <Button
            variant={filter === "all" ? "default" : "outline"}
            onClick={() => {
              setSearchParams({ filter: "all" });
              setSearchQuery("");
            }}
            className={filter === "all" ? "bg-blue-600 text-white hover:bg-blue-700" : ""}
          >
            All
          </Button>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {filter === "invitations" && (
        <Card>
          <CardHeader>
            <CardTitle>Driver Invitations</CardTitle>
            <CardDescription>Manage and track driver invitation status</CardDescription>
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
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Status</TableHead>
                    <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvites.map((invite) => (
                    <TableRow key={invite.id}>
                      <TableCell className="font-medium">{invite.name || "N/A"}</TableCell>
                      <TableCell>{invite.email}</TableCell>
                      <TableCell>
                        {invite.invited_at ? format(new Date(invite.invited_at), "MMM d, yyyy") : "N/A"}
                      </TableCell>
                      <TableCell>
                        {invite.opened_at ? (
                          <div className="text-sm">
                            <div>{format(new Date(invite.opened_at), "MMM d, yyyy")}</div>
                            <div className="text-muted-foreground">{format(new Date(invite.opened_at), "h:mm a")}</div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Not opened</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {invite.completed ? (
                          <Badge className="bg-green-600 hover:bg-green-700">Completed</Badge>
                        ) : invite.application_started_at ? (
                          <Badge variant="default">Started</Badge>
                        ) : invite.opened_at ? (
                          <Badge variant="secondary">Opened</Badge>
                        ) : (
                          <Badge variant="outline">Sent</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {invite.completed && invite.application_id ? (
                            <Button
                              onClick={() => viewApplication(invite.application_id!)}
                              size="sm"
                              variant="outline"
                              className="gap-2"
                            >
                              <FileText className="h-4 w-4" />
                              View
                            </Button>
                          ) : (
                            <Button
                              onClick={() => handleResendInvite(invite)}
                              size="sm"
                              variant="outline"
                              className="gap-2"
                            >
                              <RotateCw className="h-4 w-4" />
                              Resend
                            </Button>
                          )}
                          <Button
                            onClick={() => handleDeleteInvite(invite.id)}
                            size="sm"
                            variant="destructive"
                          >
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {(filter === "active" || filter === "inactive" || filter === "pending") && (
        <Card>
          <CardContent className="p-0">
            {filteredApplications.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                {searchQuery ? "No drivers match your search" : `No ${filter} drivers found`}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table className="text-sm">
                  <TableHeader>
                    <TableRow className="bg-gradient-to-r from-blue-50 to-slate-50 dark:from-blue-950/30 dark:to-slate-950/30 h-10 border-b-2 border-blue-100 dark:border-blue-900">
                      <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide w-[80px]">Status</TableHead>
                      <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Name/Phone</TableHead>
                      <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Salary</TableHead>
                      <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Age/DOB</TableHead>
                      <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">DL Class</TableHead>
                      <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">License Exp</TableHead>
                      <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">DOT Exp</TableHead>
                      <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Record Exp</TableHead>
                      <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">SS#</TableHead>
                      <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">App/DD</TableHead>
                      <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide">Hired/Term</TableHead>
                      <TableHead className="py-2 px-2 text-sm font-bold text-blue-700 dark:text-blue-400 tracking-wide w-[80px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredApplications.map((app) => {
                      const licenseInfo = app.license_info || {};
                      const personalInfo = app.personal_info || {};
                      const directDeposit = app.direct_deposit || {};
                      
                      return (
                        <TableRow key={app.id} className="h-10">
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
                          <TableCell className="py-1 px-2 text-destructive font-medium">
                            {app.payroll_policy?.salary || "N/A"}
                          </TableCell>
                          <TableCell className="py-1 px-2">
                            <div>{personalInfo.age || "N/A"}</div>
                            <div className="text-xs text-muted-foreground">
                              {personalInfo.dateOfBirth ? format(new Date(personalInfo.dateOfBirth), "yyyy-MM-dd") : "N/A"}
                            </div>
                          </TableCell>
                          <TableCell className="py-1 px-2">
                            <div>{licenseInfo.class || "N/A"}</div>
                            <div className="text-xs text-muted-foreground">{licenseInfo.endorsements || "None"}</div>
                          </TableCell>
                          <TableCell className="py-1 px-2">
                            {licenseInfo.expirationDate ? format(new Date(licenseInfo.expirationDate), "yyyy-MM-dd") : "N/A"}
                          </TableCell>
                          <TableCell className="py-1 px-2">
                            {licenseInfo.dotCardExpiration ? format(new Date(licenseInfo.dotCardExpiration), "yyyy-MM-dd") : "N/A"}
                          </TableCell>
                          <TableCell className="py-1 px-2">
                            {licenseInfo.driverRecordExpiry ? format(new Date(licenseInfo.driverRecordExpiry), "yyyy-MM-dd") : "N/A"}
                          </TableCell>
                          <TableCell className="py-1 px-2">
                            <div>{personalInfo.ssCard ? "Yes" : "No"}</div>
                            <div className="text-xs text-muted-foreground">{personalInfo.ssn || "N/A"}</div>
                          </TableCell>
                          <TableCell className="py-1 px-2">
                            <div>
                              {app.submitted_at ? format(new Date(app.submitted_at), "yyyy-MM-dd'T'HH:mm:ss.SSS'-'SS':'SS") : "N/A"}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {directDeposit.accountNumber ? "Yes" : "No"}
                            </div>
                          </TableCell>
                          <TableCell className="py-1 px-2">
                            <div>
                              {app.submitted_at ? format(new Date(app.submitted_at), "yyyy-MM-dd") : "N/A"}
                            </div>
                            <div className="text-xs text-muted-foreground">N/A</div>
                          </TableCell>
                          <TableCell className="py-1 px-2">
                            <div className="flex gap-1">
                              <Button
                                onClick={() => viewApplication(app.id)}
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                              >
                                <FileText className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                              >
                                <Edit className="h-3.5 w-3.5" />
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
          </CardContent>
        </Card>
      )}

      {filter === "active" && <DraftApplications />}
    </div>
  );
}