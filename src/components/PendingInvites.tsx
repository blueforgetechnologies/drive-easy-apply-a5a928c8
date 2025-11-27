import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trash2, Mail, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

interface Invite {
  id: string;
  email: string;
  invited_at: string;
  accepted_at: string | null;
}

export function PendingInvites() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchInvites = async () => {
    try {
      const { data, error } = await supabase
        .from("invites")
        .select("*")
        .order("invited_at", { ascending: false });

      if (error) throw error;
      setInvites(data || []);
    } catch (error: any) {
      console.error("Error fetching invites:", error);
      toast({
        title: "Failed to load invites",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from("invites")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Invite removed",
        description: "The invitation has been deleted.",
      });

      fetchInvites();
    } catch (error: any) {
      console.error("Error deleting invite:", error);
      toast({
        title: "Failed to delete invite",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    fetchInvites();
  }, []);

  if (loading) {
    return <div className="text-muted-foreground">Loading invites...</div>;
  }

  if (invites.length === 0) {
    return null;
  }

  const pendingInvites = invites.filter(inv => !inv.accepted_at);
  const acceptedInvites = invites.filter(inv => inv.accepted_at);

  return (
    <div className="space-y-4">
      {pendingInvites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Pending Invitations
            </CardTitle>
            <CardDescription>
              Users who have been invited but haven't signed up yet
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pendingInvites.map((invite) => (
                <div
                  key={invite.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div>
                    <p className="font-medium">{invite.email}</p>
                    <p className="text-sm text-muted-foreground">
                      Invited {formatDistanceToNow(new Date(invite.invited_at), { addSuffix: true })}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(invite.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {acceptedInvites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5" />
              Accepted Invitations
            </CardTitle>
            <CardDescription>
              Users who have accepted their invitation and joined
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {acceptedInvites.map((invite) => (
                <div
                  key={invite.id}
                  className="flex items-center justify-between p-3 border rounded-lg bg-muted/50"
                >
                  <div>
                    <p className="font-medium">{invite.email}</p>
                    <p className="text-sm text-muted-foreground">
                      Joined {formatDistanceToNow(new Date(invite.accepted_at!), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
