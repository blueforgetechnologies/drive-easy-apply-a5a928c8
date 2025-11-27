import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
      if (filter === "active") {
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
    const { data, error } = await supabase
      .from("driver_invites")
      .select("*")
      .order("invited_at", { ascending: false });

    if (error) {
      toast.error("Error loading invitations");
      return;
    }
    setInvites(data || []);
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

  const viewApplication = (id: string) => {
    navigate(`/dashboard/application/${id}`);
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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Invited</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
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
                        {invite.application_started_at ? (
                          <Badge variant="default">Started</Badge>
                        ) : invite.opened_at ? (
                          <Badge variant="secondary">Opened</Badge>
                        ) : (
                          <Badge variant="outline">Sent</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          onClick={() => handleResendInvite(invite)}
                          size="sm"
                          variant="outline"
                          className="gap-2"
                        >
                          <RotateCw className="h-4 w-4" />
                          Resend
                        </Button>
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
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-[80px]">Status</TableHead>
                      <TableHead>Driver Name<br/>Phone</TableHead>
                      <TableHead>Driver Salary</TableHead>
                      <TableHead>Age<br/>DOB</TableHead>
                      <TableHead>DL Class<br/>Endorsements</TableHead>
                      <TableHead>Driver's License<br/>Expiration Date</TableHead>
                      <TableHead>DOT Card<br/>Expiration Date</TableHead>
                      <TableHead>Driver Record<br/>Expiry Date</TableHead>
                      <TableHead>SS Card<br/>SS#</TableHead>
                      <TableHead>Application<br/>Direct Deposit</TableHead>
                      <TableHead>Hired Date<br/>Termination Date</TableHead>
                      <TableHead className="w-[120px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredApplications.map((app) => {
                      const licenseInfo = app.license_info || {};
                      const personalInfo = app.personal_info || {};
                      const directDeposit = app.direct_deposit || {};
                      
                      return (
                        <TableRow key={app.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div 
                                className={`w-8 h-8 rounded flex items-center justify-center font-bold text-xs text-white ${
                                  app.driver_status === "active" 
                                    ? "bg-green-600" 
                                    : app.driver_status === "pending"
                                    ? "bg-orange-500"
                                    : "bg-gray-500"
                                }`}
                              >
                                0
                              </div>
                              <Badge 
                                variant="secondary" 
                                className={`${
                                  app.driver_status === "active"
                                    ? "bg-green-100 text-green-800 hover:bg-green-100"
                                    : app.driver_status === "pending"
                                    ? "bg-orange-100 text-orange-800 hover:bg-orange-100"
                                    : "bg-gray-100 text-gray-800 hover:bg-gray-100"
                                }`}
                              >
                                {app.driver_status ? app.driver_status.charAt(0).toUpperCase() + app.driver_status.slice(1) : "Unknown"}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="font-medium">
                            <div>{personalInfo.firstName} {personalInfo.lastName}</div>
                            <div className="text-sm text-muted-foreground">{personalInfo.phone}</div>
                          </TableCell>
                          <TableCell className="text-destructive font-medium">
                            {app.payroll_policy?.salary || "N/A"}
                          </TableCell>
                          <TableCell>
                            <div>{personalInfo.age || "N/A"}</div>
                            <div className="text-sm text-muted-foreground">
                              {personalInfo.dateOfBirth ? format(new Date(personalInfo.dateOfBirth), "yyyy-MM-dd") : "N/A"}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>{licenseInfo.class || "N/A"}</div>
                            <div className="text-sm text-muted-foreground">{licenseInfo.endorsements || "None"}</div>
                          </TableCell>
                          <TableCell>
                            {licenseInfo.expirationDate ? format(new Date(licenseInfo.expirationDate), "yyyy-MM-dd") : "N/A"}
                          </TableCell>
                          <TableCell>
                            {licenseInfo.dotCardExpiration ? format(new Date(licenseInfo.dotCardExpiration), "yyyy-MM-dd") : "N/A"}
                          </TableCell>
                          <TableCell>
                            {licenseInfo.driverRecordExpiry ? format(new Date(licenseInfo.driverRecordExpiry), "yyyy-MM-dd") : "N/A"}
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">{personalInfo.ssCard ? "Yes" : "No"}</div>
                            <div className="text-sm text-muted-foreground">{personalInfo.ssn || "N/A"}</div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              {app.submitted_at ? format(new Date(app.submitted_at), "yyyy-MM-dd'T'HH:mm:ss.SSS'-'SS':'SS") : "N/A"}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {directDeposit.accountNumber ? "Yes" : "No"}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              {app.submitted_at ? format(new Date(app.submitted_at), "yyyy-MM-dd") : "N/A"}
                            </div>
                            <div className="text-sm text-muted-foreground">N/A</div>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button
                                onClick={() => viewApplication(app.id)}
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                              >
                                <FileText className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                              >
                                <Edit className="h-4 w-4" />
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