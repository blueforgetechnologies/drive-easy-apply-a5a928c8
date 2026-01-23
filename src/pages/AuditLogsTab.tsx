import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, FileText } from "lucide-react";
import { format } from "date-fns";
import { useTenantQuery } from "@/hooks/useTenantQuery";

export default function AuditLogsTab() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const { query, isReady, tenantId } = useTenantQuery();

  useEffect(() => {
    if (isReady) {
      loadAuditLogs();
    }
  }, [isReady, tenantId]);

  const loadAuditLogs = async () => {
    try {
      const { data, error } = await query("audit_logs")
        .select("*")
        .order("timestamp", { ascending: false })
        .limit(500);

      if (error) throw error;
      setLogs(data || []);
    } catch (error: any) {
      console.error("Failed to load audit logs:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = logs.filter((log) =>
    log.entity_type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.action?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.user_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.field_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getActionColor = (action: string) => {
    switch (action) {
      case "created": return "bg-green-500";
      case "updated": return "bg-blue-500";
      case "deleted": return "bg-red-500";
      case "status_changed": return "bg-yellow-500";
      default: return "bg-gray-500";
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full">Loading...</div>;
  }

  return (
    <div className="space-y-3">
      {/* Filter Bar */}
      <div className="flex items-center justify-end gap-2">
        <Badge variant="secondary" className="text-xs">
          {filteredLogs.length} logs
        </Badge>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search audit logs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-8"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-l-4 border-l-primary border-b-0 bg-background">
              <TableHead className="text-primary font-medium uppercase text-xs">Action</TableHead>
              <TableHead className="text-primary font-medium uppercase text-xs">Entity Type</TableHead>
              <TableHead className="text-primary font-medium uppercase text-xs">Field</TableHead>
              <TableHead className="text-primary font-medium uppercase text-xs">Old Value</TableHead>
              <TableHead className="text-primary font-medium uppercase text-xs">New Value</TableHead>
              <TableHead className="text-primary font-medium uppercase text-xs">User</TableHead>
              <TableHead className="text-primary font-medium uppercase text-xs">Timestamp</TableHead>
              <TableHead className="text-primary font-medium uppercase text-xs">IP Address</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLogs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-12 text-center">
                  <div className="flex flex-col items-center justify-center text-muted-foreground">
                    <FileText className="h-10 w-10 mb-3 opacity-50" />
                    <p className="text-base font-medium">No audit logs</p>
                    <p className="text-sm">{searchTerm ? "No logs match your search" : "Activity logs will appear here"}</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredLogs.map((log) => (
                <TableRow key={log.id} className="hover:bg-muted/50">
                  <TableCell>
                    <Badge className={getActionColor(log.action)}>
                      {log.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium capitalize">{log.entity_type}</TableCell>
                  <TableCell className="text-muted-foreground">{log.field_name || "—"}</TableCell>
                  <TableCell className="text-muted-foreground max-w-[200px] truncate">{log.old_value || "—"}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{log.new_value || "—"}</TableCell>
                  <TableCell>{log.user_name || "System"}</TableCell>
                  <TableCell>{format(new Date(log.timestamp), "MM/dd/yyyy h:mm a")}</TableCell>
                  <TableCell className="text-muted-foreground">{log.ip_address || "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}