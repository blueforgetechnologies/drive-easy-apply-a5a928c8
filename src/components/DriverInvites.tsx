import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { toast } from "sonner";

interface DriverInvite {
  id: string;
  email: string;
  name: string | null;
  invited_at: string;
  opened_at: string | null;
  application_started_at: string | null;
}

export function DriverInvites() {
  const [invites, setInvites] = useState<DriverInvite[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadInvites();
  }, []);

  const loadInvites = async () => {
    try {
      const { data, error } = await supabase
        .from("driver_invites")
        .select("*")
        .order("invited_at", { ascending: false });

      if (error) throw error;
      setInvites(data || []);
    } catch (error: any) {
      toast.error("Error loading driver invites");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading invites...</div>;
  }

  if (invites.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Driver Invitations</CardTitle>
          <CardDescription>Track sent application invitations</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground py-8">
            No driver invitations sent yet
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Driver Invitations</CardTitle>
        <CardDescription>Track sent application invitations and their status</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Sent</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invites.map((invite) => (
              <TableRow key={invite.id}>
                <TableCell className="font-medium">
                  {invite.name || "—"}
                </TableCell>
                <TableCell>{invite.email}</TableCell>
                <TableCell>
                  {format(new Date(invite.invited_at), "MMM d, yyyy h:mm a")}
                </TableCell>
                <TableCell>
                  {invite.application_started_at ? (
                    <Badge variant="default">Application Started</Badge>
                  ) : invite.opened_at ? (
                    <Badge variant="secondary">Opened {format(new Date(invite.opened_at), "MMM d, h:mm a")}</Badge>
                  ) : (
                    <Badge variant="outline">Not Opened</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
