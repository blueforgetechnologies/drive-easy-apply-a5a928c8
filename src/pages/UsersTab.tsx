import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { format } from "date-fns";
import { InviteUserDialog } from "@/components/InviteUserDialog";
import { ChevronLeft, ChevronRight, KeyRound, Mail, RotateCw, Search, Trash2 } from "lucide-react";

const ROWS_PER_PAGE = 10;

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
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = searchParams.get("filter") || "active";
  const [users, setUsers] = useState<Profile[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loginHistory, setLoginHistory] = useState<LoginHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    loadData();
    setCurrentPage(1);
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

  const handleDeleteInvite = async (inviteId: string) => {
    try {
      const { error } = await supabase
        .from("invites")
        .delete()
        .eq("id", inviteId);

      if (error) throw error;
      toast.success("Invitation deleted successfully");
      loadData();
    } catch (error: any) {
      toast.error("Failed to delete invitation: " + error.message);
    }
  };

  const handleResetPassword = async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth?reset=true`,
      });

      if (error) throw error;
      toast.success(`Password reset email sent to ${email}`);
    } catch (error: any) {
      toast.error("Failed to send password reset: " + error.message);
    }
  };

  const handleSendLogin = async (user: Profile) => {
    try {
      const { error } = await supabase.functions.invoke("send-user-login", {
        body: {
          userId: user.id,
          userEmail: user.email,
          userName: user.full_name || user.email,
        },
      });

      if (error) throw error;
      toast.success(`Login credentials sent to ${user.email}`);
    } catch (error: any) {
      toast.error("Failed to send login: " + error.message);
    }
  };

  const filteredUsers = users.filter((user) => {
    const fullName = (user.full_name || "").toLowerCase();
    const email = user.email.toLowerCase();
    return fullName.includes(searchQuery.toLowerCase()) || email.includes(searchQuery.toLowerCase());
  });

  const filteredInvites = invites.filter((invite) => {
    const email = invite.email.toLowerCase();
    return email.includes(searchQuery.toLowerCase());
  });

  // Pagination calculations
  const totalUsers = filteredUsers.length;
  const totalUsersPages = Math.ceil(totalUsers / ROWS_PER_PAGE);
  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * ROWS_PER_PAGE,
    currentPage * ROWS_PER_PAGE
  );

  const totalInvites = filteredInvites.length;
  const totalInvitesPages = Math.ceil(totalInvites / ROWS_PER_PAGE);
  const paginatedInvites = filteredInvites.slice(
    (currentPage - 1) * ROWS_PER_PAGE,
    currentPage * ROWS_PER_PAGE
  );

  const totalHistory = loginHistory.length;
  const totalHistoryPages = Math.ceil(totalHistory / ROWS_PER_PAGE);
  const paginatedHistory = loginHistory.slice(
    (currentPage - 1) * ROWS_PER_PAGE,
    currentPage * ROWS_PER_PAGE
  );

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">User Management</h2>
        <InviteUserDialog />
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
            variant={filter === "active" ? "default" : "outline"}
            onClick={() => {
              setSearchParams({ filter: "active" });
              setSearchQuery("");
            }}
            className={filter === "active" ? "bg-green-600 text-white hover:bg-green-700" : ""}
          >
            Active Users
          </Button>
          <Button
            variant={filter === "inactive" ? "default" : "outline"}
            onClick={() => {
              setSearchParams({ filter: "inactive" });
              setSearchQuery("");
            }}
            className={filter === "inactive" ? "bg-muted text-muted-foreground" : ""}
          >
            Inactive Users
          </Button>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {filter === "invitations" && (
        <Card className="flex flex-col overflow-hidden" style={{ maxHeight: 'calc(100vh - 300px)' }}>
          <CardHeader className="flex-shrink-0">
            <CardTitle>User Invitations</CardTitle>
            <CardDescription>Manage team member invitations</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden flex flex-col p-0">
            {filteredInvites.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                {searchQuery ? "No invitations match your search" : "No invitations sent yet"}
              </p>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto px-6">
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
                      {paginatedInvites.map((invite) => (
                        <TableRow key={invite.id}>
                          <TableCell className="font-medium">{invite.email}</TableCell>
                          <TableCell>
                            {invite.invited_at ? format(new Date(invite.invited_at), "MM/dd/yyyy") : "N/A"}
                          </TableCell>
                          <TableCell>
                            {invite.accepted_at ? (
                              <Badge className="bg-green-600 hover:bg-green-700">Accepted</Badge>
                            ) : (
                              <Badge variant="secondary">Pending</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              {!invite.accepted_at && (
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
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {totalInvitesPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-2 border-t bg-background flex-shrink-0">
                    <span className="text-xs text-muted-foreground">
                      Showing {((currentPage - 1) * ROWS_PER_PAGE) + 1}-{Math.min(currentPage * ROWS_PER_PAGE, totalInvites)} of {totalInvites}
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
                      <span className="text-xs">Page {currentPage} of {totalInvitesPages}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => Math.min(totalInvitesPages, p + 1))}
                        disabled={currentPage >= totalInvitesPages}
                        className="h-6 w-6 p-0"
                      >
                        <ChevronRight className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {(filter === "active" || filter === "inactive") && (
        <>
          <Card className="flex flex-col overflow-hidden" style={{ maxHeight: 'calc(100vh - 300px)' }}>
            <CardHeader className="flex-shrink-0">
              <CardTitle>{filter === "active" ? "Active" : "Inactive"} Users</CardTitle>
              <CardDescription>
                {filter === "active" ? "Team members with admin access" : "Users without admin access"}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden flex flex-col p-0">
              {filteredUsers.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  {searchQuery ? "No users match your search" : `No ${filter} users found`}
                </p>
              ) : (
                <>
                  <div className="flex-1 overflow-y-auto px-6">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Joined</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedUsers.map((user) => (
                          <TableRow key={user.id}>
                            <TableCell className="font-medium">{user.full_name || "N/A"}</TableCell>
                            <TableCell>{user.email}</TableCell>
                            <TableCell>
                              {format(new Date(user.created_at), "MM/dd/yyyy")}
                            </TableCell>
                            <TableCell>
                              <Badge 
                                className={filter === "active" ? "bg-green-600 hover:bg-green-700" : "bg-gray-500 hover:bg-gray-600"}
                              >
                                {filter === "active" ? "Active" : "Inactive"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-2">
                                <Button
                                  onClick={() => handleSendLogin(user)}
                                  size="sm"
                                  variant="outline"
                                  className="gap-2"
                                >
                                  <Mail className="h-4 w-4" />
                                  Send Login
                                </Button>
                                <Button
                                  onClick={() => handleResetPassword(user.email)}
                                  size="sm"
                                  variant="outline"
                                  className="gap-2"
                                >
                                  <KeyRound className="h-4 w-4" />
                                  Reset
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {totalUsersPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-2 border-t bg-background flex-shrink-0">
                      <span className="text-xs text-muted-foreground">
                        Showing {((currentPage - 1) * ROWS_PER_PAGE) + 1}-{Math.min(currentPage * ROWS_PER_PAGE, totalUsers)} of {totalUsers}
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
                        <span className="text-xs">Page {currentPage} of {totalUsersPages}</span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(p => Math.min(totalUsersPages, p + 1))}
                          disabled={currentPage >= totalUsersPages}
                          className="h-6 w-6 p-0"
                        >
                          <ChevronRight className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {filter === "active" && loginHistory.length > 0 && (
            <Card className="flex flex-col overflow-hidden" style={{ maxHeight: 'calc(100vh - 300px)' }}>
              <CardHeader className="flex-shrink-0">
                <CardTitle>Recent Login Activity</CardTitle>
                <CardDescription>Track when users logged in and from where</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 overflow-hidden flex flex-col p-0">
                <div className="flex-1 overflow-y-auto px-6">
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
                      {paginatedHistory.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="font-medium">
                            {log.profile?.full_name || "Unknown"}
                          </TableCell>
                          <TableCell>{log.profile?.email || "N/A"}</TableCell>
                          <TableCell>
                            {format(new Date(log.logged_in_at), "MM/dd/yyyy h:mm a")}
                          </TableCell>
                          <TableCell>{log.ip_address || "N/A"}</TableCell>
                          <TableCell>{log.location || "N/A"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {totalHistoryPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-2 border-t bg-background flex-shrink-0">
                    <span className="text-xs text-muted-foreground">
                      Showing {((currentPage - 1) * ROWS_PER_PAGE) + 1}-{Math.min(currentPage * ROWS_PER_PAGE, totalHistory)} of {totalHistory}
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
                      <span className="text-xs">Page {currentPage} of {totalHistoryPages}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => Math.min(totalHistoryPages, p + 1))}
                        disabled={currentPage >= totalHistoryPages}
                        className="h-6 w-6 p-0"
                      >
                        <ChevronRight className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
