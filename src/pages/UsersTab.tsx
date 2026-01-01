import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTenantFilter } from "@/hooks/useTenantFilter";
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

interface TenantUser {
  id: string;
  user_id: string;
  role: string;
  is_active: boolean;
  joined_at: string;
  profile?: {
    id: string;
    email: string;
    full_name: string | null;
  };
}

interface Invite {
  id: string;
  email: string;
  invited_at: string;
  accepted_at: string | null;
  tenant_id: string | null;
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
  const navigate = useNavigate();
  const { tenantId, shouldFilter } = useTenantFilter();
  const filter = searchParams.get("filter") || "active";
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loginHistory, setLoginHistory] = useState<LoginHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    if (tenantId || !shouldFilter) {
      loadData();
      setCurrentPage(1);
    }
  }, [filter, tenantId, shouldFilter]);

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
    if (!tenantId && shouldFilter) return;

    // Get users from tenant_users for the current tenant
    let query = supabase
      .from("tenant_users")
      .select(`
        id,
        user_id,
        role,
        is_active,
        joined_at,
        profiles:user_id (
          id,
          email,
          full_name
        )
      `)
      .eq("is_active", true)
      .order("joined_at", { ascending: false });

    if (shouldFilter && tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data, error } = await query;

    if (error) {
      toast.error("Error loading users");
      console.error(error);
      return;
    }

    // Transform the data to flatten profile info
    const transformedUsers = (data || []).map((tu: any) => ({
      ...tu,
      profile: tu.profiles,
    }));

    setUsers(transformedUsers);

    // Load login history for active users
    const userIds = transformedUsers.map(u => u.user_id);
    if (userIds.length > 0) {
      const { data: historyData } = await supabase
        .from("login_history")
        .select("*")
        .in("user_id", userIds)
        .order("logged_in_at", { ascending: false })
        .limit(50);

      if (historyData) {
        const enrichedHistory = historyData.map((h) => ({
          ...h,
          profile: transformedUsers.find((u) => u.user_id === h.user_id)?.profile,
        }));
        setLoginHistory(enrichedHistory);
      }
    }
  };

  const loadInvitations = async () => {
    if (!tenantId && shouldFilter) return;

    let query = supabase
      .from("invites")
      .select("*")
      .order("invited_at", { ascending: false });

    if (shouldFilter && tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data, error } = await query;

    if (error) {
      toast.error("Error loading invitations");
      return;
    }
    setInvites(data || []);
  };

  const loadInactiveUsers = async () => {
    if (!tenantId && shouldFilter) return;

    // Get inactive users from tenant_users for the current tenant
    let query = supabase
      .from("tenant_users")
      .select(`
        id,
        user_id,
        role,
        is_active,
        joined_at,
        profiles:user_id (
          id,
          email,
          full_name
        )
      `)
      .eq("is_active", false)
      .order("joined_at", { ascending: false });

    if (shouldFilter && tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data, error } = await query;

    if (error) {
      toast.error("Error loading users");
      console.error(error);
      return;
    }

    const transformedUsers = (data || []).map((tu: any) => ({
      ...tu,
      profile: tu.profiles,
    }));

    setUsers(transformedUsers);
  };

  const handleResendInvite = async (invite: Invite) => {
    try {
      const { error } = await supabase.functions.invoke("send-invite", {
        body: { email: invite.email, tenantId },
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

  const handleSendLogin = async (user: TenantUser) => {
    if (!user.profile) return;
    
    try {
      const { error } = await supabase.functions.invoke("send-user-login", {
        body: {
          userId: user.user_id,
          userEmail: user.profile.email,
          userName: user.profile.full_name || user.profile.email,
        },
      });

      if (error) throw error;
      toast.success(`Login credentials sent to ${user.profile.email}`);
    } catch (error: any) {
      toast.error("Failed to send login: " + error.message);
    }
  };

  const filteredUsers = users.filter((user) => {
    const fullName = (user.profile?.full_name || "").toLowerCase();
    const email = (user.profile?.email || "").toLowerCase();
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

  if (!tenantId && shouldFilter) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Please select a tenant to view users.
      </div>
    );
  }

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
        <Card>
          <CardHeader>
            <CardTitle>User Invitations</CardTitle>
            <CardDescription>Manage team member invitations</CardDescription>
          </CardHeader>
          <CardContent>
            {filteredInvites.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                {searchQuery ? "No invitations match your search" : "No invitations sent yet"}
              </p>
            ) : (
              <>
                <div className="max-h-96 overflow-y-auto">
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
                  <div className="flex items-center justify-between px-4 py-2 border-t bg-muted/30">
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
          <Card>
            <CardHeader>
              <CardTitle>{filter === "active" ? "Active" : "Inactive"} Users</CardTitle>
              <CardDescription>
                {filter === "active" ? "Team members with access to this organization" : "Users without active access"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filteredUsers.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  {searchQuery ? "No users match your search" : `No ${filter} users found`}
                </p>
              ) : (
                <>
                  <div className="max-h-96 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Joined</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedUsers.map((user) => (
                          <TableRow 
                            key={user.id} 
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => navigate(`/dashboard/user/${user.user_id}`)}
                          >
                            <TableCell className="font-medium">{user.profile?.full_name || "N/A"}</TableCell>
                            <TableCell>{user.profile?.email || "N/A"}</TableCell>
                            <TableCell>
                              <Badge 
                                className={
                                  user.role === "owner" 
                                    ? "badge-glossy-primary" 
                                    : user.role === "admin" 
                                    ? "badge-glossy-success"
                                    : "badge-glossy-muted"
                                }
                              >
                                {user.role}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {format(new Date(user.joined_at), "MM/dd/yyyy")}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
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
                                  onClick={() => user.profile && handleResetPassword(user.profile.email)}
                                  size="sm"
                                  variant="outline"
                                  className="gap-2"
                                >
                                  <KeyRound className="h-4 w-4" />
                                  Reset Password
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {totalUsersPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-2 border-t bg-muted/30">
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
            <Card>
              <CardHeader>
                <CardTitle>Recent Login History</CardTitle>
                <CardDescription>Latest login activity for your team</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-h-64 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Time</TableHead>
                        <TableHead>IP Address</TableHead>
                        <TableHead>Location</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedHistory.map((history) => (
                        <TableRow key={history.id}>
                          <TableCell className="font-medium">
                            {history.profile?.full_name || history.profile?.email || "Unknown"}
                          </TableCell>
                          <TableCell>
                            {format(new Date(history.logged_in_at), "MM/dd/yyyy HH:mm")}
                          </TableCell>
                          <TableCell>{history.ip_address || "N/A"}</TableCell>
                          <TableCell>{history.location || "N/A"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}