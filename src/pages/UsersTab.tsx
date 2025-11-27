import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { format } from "date-fns";
import { InviteUserDialog } from "@/components/InviteUserDialog";
import { PendingInvites } from "@/components/PendingInvites";
import { RotateCw } from "lucide-react";

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
}

interface Invite {
  id: string;
  email: string;
  invited_at: string;
  accepted_at: string | null;
}

interface LoginHistory {
  id: string;
  user_id: string;
  logged_in_at: string;
  ip_address: string | null;
  location: string | null;
  profile?: {
    email: string;
    full_name: string | null;
  };
}

export default function UsersTab() {
  const [searchParams] = useSearchParams();
  const filter = searchParams.get("filter") || "active";
  const [users, setUsers] = useState<Profile[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loginHistory, setLoginHistory] = useState<LoginHistory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [filter]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (filter === "active") {
        await loadActiveUsers();
      } else if (filter === "invitations") {
        await loadInvitations();
      } else if (filter === "inactive") {
        await loadInactiveUsers();
      }
    } finally {
      setLoading(false);
    }
  };

  const loadActiveUsers = async () => {
    const { data: profilesData, error: profilesError } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (profilesError) {
      toast.error("Error loading users");
      return;
    }

    const { data: rolesData } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    const adminIds = new Set(rolesData?.map((r) => r.user_id) || []);
    const activeUsers = profilesData?.filter((p) => adminIds.has(p.id)) || [];
    setUsers(activeUsers);

    // Load login history for active users
    const { data: historyData } = await supabase
      .from("login_history")
      .select("*")
      .order("logged_in_at", { ascending: false })
      .limit(50);

    if (historyData) {
      const enrichedHistory = historyData.map((h) => ({
        ...h,
        profile: activeUsers.find((u) => u.id === h.user_id),
      }));
      setLoginHistory(enrichedHistory);
    }
  };

  const loadInvitations = async () => {
    const { data, error } = await supabase
      .from("invites")
      .select("*")
      .order("invited_at", { ascending: false });

    if (error) {
      toast.error("Error loading invitations");
      return;
    }
    setInvites(data || []);
  };

  const loadInactiveUsers = async () => {
    const { data: profilesData, error: profilesError } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (profilesError) {
      toast.error("Error loading users");
      return;
    }

    const { data: rolesData } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    const adminIds = new Set(rolesData?.map((r) => r.user_id) || []);
    const inactiveUsers = profilesData?.filter((p) => !adminIds.has(p.id)) || [];
    setUsers(inactiveUsers);
  };

  const handleResendInvite = async (invite: Invite) => {
    try {
      const { error } = await supabase.functions.invoke("send-invite", {
        body: { email: invite.email },
      });

      if (error) throw error;
      toast.success("Invitation resent successfully");
    } catch (error: any) {
      toast.error("Failed to resend invitation");
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold">Users Management</h2>
        {filter !== "invitations" && <InviteUserDialog />}
      </div>

      {filter === "invitations" && (
        <Card>
          <CardHeader>
            <CardTitle>User Invitations</CardTitle>
            <CardDescription>Manage team member invitations</CardDescription>
          </CardHeader>
          <CardContent>
            {invites.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No invitations sent yet</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Invited</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invites.map((invite) => (
                    <TableRow key={invite.id}>
                      <TableCell className="font-medium">{invite.email}</TableCell>
                      <TableCell>
                        {invite.invited_at ? format(new Date(invite.invited_at), "MMM d, yyyy") : "N/A"}
                      </TableCell>
                      <TableCell>
                        {invite.accepted_at ? (
                          <Badge variant="default">Accepted</Badge>
                        ) : (
                          <Badge variant="secondary">Pending</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          onClick={() => handleResendInvite(invite)}
                          size="sm"
                          variant="outline"
                          className="gap-2"
                          disabled={!!invite.accepted_at}
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
        <>
          <Card>
            <CardHeader>
              <CardTitle>{filter === "active" ? "Active" : "Inactive"} Users</CardTitle>
              <CardDescription>
                {filter === "active" ? "Team members with admin access" : "Users without admin access"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {users.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No {filter} users found
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Joined</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.full_name || "N/A"}</TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>
                          {format(new Date(user.created_at), "MMM d, yyyy")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {filter === "active" && loginHistory.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Recent Login Activity</CardTitle>
                <CardDescription>Track when users logged in and from where</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Login Time</TableHead>
                      <TableHead>IP Address</TableHead>
                      <TableHead>Location</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loginHistory.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="font-medium">
                          {log.profile?.full_name || "Unknown"}
                        </TableCell>
                        <TableCell>{log.profile?.email || "N/A"}</TableCell>
                        <TableCell>
                          {format(new Date(log.logged_in_at), "MMM d, yyyy HH:mm")}
                        </TableCell>
                        <TableCell>{log.ip_address || "N/A"}</TableCell>
                        <TableCell>{log.location || "N/A"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}