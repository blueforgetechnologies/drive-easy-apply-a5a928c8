import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { format } from "date-fns";
import { InviteDriverDialog } from "@/components/InviteDriverDialog";
import { DriverInvites } from "@/components/DriverInvites";
import { DraftApplications } from "@/components/DraftApplications";
import { RotateCw } from "lucide-react";

interface Application {
  id: string;
  personal_info: any;
  submitted_at: string;
  status: string;
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
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold">Drivers Management</h2>
        {filter !== "invitations" && <InviteDriverDialog />}
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
          <CardHeader>
            <CardTitle>{filter === "active" ? "Active" : "Inactive"} Drivers</CardTitle>
            <CardDescription>
              View and manage {filter} driver applications
            </CardDescription>
          </CardHeader>
          <CardContent>
            {applications.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No {filter} drivers found
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {applications.map((app) => (
                    <TableRow key={app.id}>
                      <TableCell className="font-medium">
                        {app.personal_info.firstName} {app.personal_info.lastName}
                      </TableCell>
                      <TableCell>{app.personal_info.email}</TableCell>
                      <TableCell>{app.personal_info.phone}</TableCell>
                      <TableCell>
                        {format(new Date(app.submitted_at), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell>
                        <Badge variant={app.status === "pending" ? "secondary" : "default"}>
                          {app.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          onClick={() => viewApplication(app.id)}
                          size="sm"
                          variant="outline"
                        >
                          View
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

      {filter === "active" && <DraftApplications />}
    </div>
  );
}