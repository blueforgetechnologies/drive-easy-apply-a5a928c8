import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, History } from "lucide-react";
import { format } from "date-fns";

export default function AuditLogsTab() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    loadAuditLogs();
  }, []);

  const loadAuditLogs = async () => {
    try {
      const { data, error } = await supabase
        .from("audit_logs")
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
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <History className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Audit Logs</h1>
          <p className="text-muted-foreground">Track all system changes and activities</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search audit logs..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="space-y-2">
        {filteredLogs.map((log) => (
          <Card key={log.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge className={getActionColor(log.action)}>
                      {log.action}
                    </Badge>
                    <span className="font-medium capitalize">{log.entity_type}</span>
                    {log.field_name && (
                      <span className="text-sm text-muted-foreground">
                        • {log.field_name}
                      </span>
                    )}
                  </div>
                  
                  {(log.old_value || log.new_value) && (
                    <div className="text-sm space-y-1">
                      {log.old_value && (
                        <div className="text-muted-foreground">
                          <span className="font-medium">Old:</span> {log.old_value}
                        </div>
                      )}
                      {log.new_value && (
                        <div className="text-muted-foreground">
                          <span className="font-medium">New:</span> {log.new_value}
                        </div>
                      )}
                    </div>
                  )}
                  
                  {log.notes && (
                    <p className="text-sm text-muted-foreground">{log.notes}</p>
                  )}
                  
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>By: {log.user_name || "System"}</span>
                    <span>•</span>
                    <span>{format(new Date(log.timestamp), "MMM d, yyyy h:mm a")}</span>
                    {log.ip_address && (
                      <>
                        <span>•</span>
                        <span>IP: {log.ip_address}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredLogs.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No audit logs found
        </div>
      )}
    </div>
  );
}
