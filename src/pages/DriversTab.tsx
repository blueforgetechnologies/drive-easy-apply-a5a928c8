import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { NavLink } from "@/components/NavLink";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { format } from "date-fns";
import { InviteDriverDialog } from "@/components/InviteDriverDialog";
import { AddDriverDialog } from "@/components/AddDriverDialog";
import { DriverInvites } from "@/components/DriverInvites";
import { DraftApplications } from "@/components/DraftApplications";
import { RotateCw, FileText, Edit } from "lucide-react";

interface Application {
  id: string;
  personal_info: any;
  submitted_at: string;
  status: string;
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
  const [searchParams] = useSearchParams();
  const filter = searchParams.get("filter") || "active";
  const [applications, setApplications] = useState<Application[]>([]);
  const [invites, setInvites] = useState<DriverInvite[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [filter]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (filter === "active") {
        await loadActiveDrivers();
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
      .eq("status", "pending")
      .order("submitted_at", { ascending: false });

    if (error) {
      toast.error("Error loading active drivers");
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
      .neq("status", "pending")
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

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="flex gap-6">
      {/* Sidebar */}
      <div className="w-48 flex-shrink-0">
        <div className="space-y-1">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Filter Drivers</h3>
          <NavLink
            to="/dashboard/drivers?filter=active"
            className="block px-3 py-2 text-sm rounded-md hover:bg-muted"
            activeClassName="bg-muted text-primary font-medium"
            end
          >
            Active Drivers
          </NavLink>
          <NavLink
            to="/dashboard/drivers?filter=invitations"
            className="block px-3 py-2 text-sm rounded-md hover:bg-muted"
            activeClassName="bg-muted text-primary font-medium"
            end
          >
            Invitations
          </NavLink>
          <NavLink
            to="/dashboard/drivers?filter=inactive"
            className="block px-3 py-2 text-sm rounded-md hover:bg-muted"
            activeClassName="bg-muted text-primary font-medium"
            end
          >
            Inactive Drivers
          </NavLink>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 space-y-6">
        {/* Filter Buttons */}
        <div className="flex justify-between items-center gap-3">
          <div className="flex items-center gap-2">
            <Button 
              variant="destructive" 
              size="sm"
              onClick={() => navigate("/dashboard/drivers?filter=active")}
            >
              Reset Filters
            </Button>
            <Button 
              variant={filter === "active" ? "default" : "outline"}
              size="sm"
              onClick={() => navigate("/dashboard/drivers?filter=active")}
            >
              Active
            </Button>
            <Button 
              variant={filter === "pending" ? "default" : "outline"}
              size="sm"
              onClick={() => navigate("/dashboard/drivers?filter=pending")}
            >
              Pending
            </Button>
            <Button 
              variant={filter === "inactive" ? "default" : "outline"}
              size="sm"
              onClick={() => navigate("/dashboard/drivers?filter=inactive")}
            >
              Inactive
            </Button>
            <Button 
              variant="outline"
              size="sm"
            >
              Driver Status
            </Button>
          </div>
          <div className="flex gap-2">
            <AddDriverDialog onDriverAdded={loadData} />
            <InviteDriverDialog />
          </div>
        </div>

      {filter === "invitations" && (
        <Card>
          <CardHeader>
            <CardTitle>Driver Invitations</CardTitle>
            <CardDescription>Manage and track driver invitation status</CardDescription>
          </CardHeader>
          <CardContent>
            {invites.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No invitations sent yet</p>
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
                  {invites.map((invite) => (
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

      {(filter === "active" || filter === "inactive") && (
        <Card>
          <CardContent className="p-0">
            {applications.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No {filter} drivers found
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
                    {applications.map((app) => {
                      const licenseInfo = app.license_info || {};
                      const personalInfo = app.personal_info || {};
                      const directDeposit = app.direct_deposit || {};
                      
                      return (
                        <TableRow key={app.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded bg-green-500 text-white flex items-center justify-center font-bold text-xs">
                                0
                              </div>
                              <Badge variant="secondary" className="bg-green-100 text-green-800 hover:bg-green-100">
                                Active
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
    </div>
  );
}