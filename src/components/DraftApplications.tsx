import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

interface DraftApplication {
  id: string;
  personal_info: any;
  status: string;
  submitted_at: string | null;
}

export function DraftApplications() {
  const navigate = useNavigate();
  const [drafts, setDrafts] = useState<DraftApplication[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDrafts();
  }, []);

  const loadDrafts = async () => {
    try {
      const { data, error } = await supabase
        .from("applications")
        .select("*")
        .is("submitted_at", null)
        .order("id", { ascending: false });

      if (error) throw error;
      setDrafts(data || []);
    } catch (error: any) {
      toast.error("Error loading draft applications");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const viewApplication = (id: string) => {
    navigate(`/dashboard/application/${id}`);
  };

  if (loading) {
    return <div className="text-center py-8">Loading drafts...</div>;
  }

  if (drafts.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>In-Progress Applications</CardTitle>
        <CardDescription>Applications that have been started but not submitted</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {drafts.map((app) => (
              <TableRow key={app.id}>
                <TableCell className="font-medium">
                  {app.personal_info?.firstName && app.personal_info?.lastName
                    ? `${app.personal_info.firstName} ${app.personal_info.lastName}`
                    : "—"}
                </TableCell>
                <TableCell>{app.personal_info?.email || "—"}</TableCell>
                <TableCell>{app.personal_info?.phone || "—"}</TableCell>
                <TableCell>
                  <Badge variant="outline">Draft</Badge>
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
      </CardContent>
    </Card>
  );
}
