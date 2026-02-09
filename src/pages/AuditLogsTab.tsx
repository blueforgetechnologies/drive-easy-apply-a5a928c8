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

  const getActionBadgeClass = (action: string) => {
    switch (action) {
      case "created": return "badge-puffy badge-puffy-green";
      case "updated": return "badge-puffy badge-puffy-blue";
      case "deleted": return "badge-puffy badge-puffy-red";
      case "status_changed": return "badge-puffy badge-puffy-amber";
      case "hire": return "badge-puffy badge-puffy-green";
      case "approve": return "badge-puffy badge-puffy-blue";
      case "invoice_return_to_audit": return "badge-puffy badge-puffy-blue";
      case "audit_create_invoice_override": return "badge-puffy badge-puffy-amber";
      default: return "badge-puffy badge-puffy-outline";
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
              <TableHead className="text-primary font-medium uppercase text-xs py-2 px-3">
                <div>Action</div>
                <div className="text-muted-foreground font-normal normal-case">Entity Type</div>
              </TableHead>
              <TableHead className="text-primary font-medium uppercase text-xs py-2 px-3">Field</TableHead>
              <TableHead className="text-primary font-medium uppercase text-xs py-2 px-3">
                <div>Old Value</div>
                <div className="text-muted-foreground font-normal normal-case">New Value</div>
              </TableHead>
              <TableHead className="text-primary font-medium uppercase text-xs py-2 px-3">
                <div>User</div>
                <div className="text-muted-foreground font-normal normal-case">IP Address</div>
              </TableHead>
              <TableHead className="text-primary font-medium uppercase text-xs py-2 px-3">Timestamp</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLogs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-12 text-center">
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
                  {/* Action / Entity Type stacked */}
                  <TableCell className="py-2 px-3">
                    <div className="mb-1">
                      <span className={`${getActionBadgeClass(log.action)} text-xs`}>
                        {log.action}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground capitalize">{log.entity_type}</div>
                  </TableCell>
                  <TableCell className="py-2 px-3 text-sm text-muted-foreground">{log.field_name || "—"}</TableCell>
                  {/* Old Value / New Value stacked */}
                  <TableCell className="py-2 px-3">
                    <div className="text-xs text-muted-foreground truncate max-w-[250px]">{log.old_value || "—"}</div>
                    <div className="text-xs truncate max-w-[250px] mt-0.5">{log.new_value || "—"}</div>
                  </TableCell>
                  {/* User / IP Address stacked */}
                  <TableCell className="py-2 px-3">
                    <div className="text-sm">{log.user_name || "System"}</div>
                    <div className="text-xs text-muted-foreground">{log.ip_address || "—"}</div>
                  </TableCell>
                  <TableCell className="py-2 px-3 text-sm">{format(new Date(log.timestamp), "MM/dd/yyyy h:mm a")}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}