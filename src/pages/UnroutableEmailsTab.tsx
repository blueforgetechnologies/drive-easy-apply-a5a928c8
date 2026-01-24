import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RefreshCw, Copy, Eye, AlertTriangle, Mail, Clock } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

interface UnroutableEmail {
  id: string;
  gmail_message_id: string;
  gmail_history_id: string | null;
  received_at: string;
  delivered_to_header: string | null;
  x_original_to_header: string | null;
  x_gm_original_to_header: string | null;
  x_forwarded_to_header: string | null;
  envelope_to_header: string | null;
  to_header: string | null;
  cc_header: string | null;
  from_header: string | null;
  subject: string | null;
  extracted_alias: string | null;
  extraction_source: string | null;
  failure_reason: string | null;
  raw_headers: { name: string; value: string }[] | null;
  status: string;
  resolved_at: string | null;
  resolution_notes: string | null;
}

export default function UnroutableEmailsTab() {
  const [timeRange, setTimeRange] = useState<"24h" | "7d" | "30d">("24h");
  const [failureFilter, setFailureFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedEmail, setSelectedEmail] = useState<UnroutableEmail | null>(null);

  const getTimeFilter = () => {
    const now = new Date();
    switch (timeRange) {
      case "24h":
        return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      case "7d":
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      case "30d":
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    }
  };

  const { data: emails, isLoading, refetch } = useQuery({
    queryKey: ["unroutable-emails", timeRange, failureFilter, searchTerm],
    queryFn: async () => {
      let query = supabase
        .from("unroutable_emails")
        .select("*")
        .gte("received_at", getTimeFilter())
        .order("received_at", { ascending: false })
        .limit(500);

      if (failureFilter !== "all") {
        query = query.ilike("failure_reason", `%${failureFilter}%`);
      }

      if (searchTerm) {
        query = query.or(
          `from_header.ilike.%${searchTerm}%,subject.ilike.%${searchTerm}%,extracted_alias.ilike.%${searchTerm}%,to_header.ilike.%${searchTerm}%`
        );
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as UnroutableEmail[];
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["unroutable-stats", timeRange],
    queryFn: async () => {
      const timeFilter = getTimeFilter();
      
      const { data, error } = await supabase
        .from("unroutable_emails")
        .select("failure_reason, status")
        .gte("received_at", timeFilter);

      if (error) throw error;

      const total = data.length;
      const noAlias = data.filter(e => e.failure_reason?.includes("No alias")).length;
      const unknownAlias = data.filter(e => e.failure_reason?.includes("No tenant")).length;
      const quarantined = data.filter(e => e.status === "quarantined").length;
      const resolved = data.filter(e => e.status === "resolved").length;

      return { total, noAlias, unknownAlias, quarantined, resolved };
    },
  });

  const copyHeaders = (email: UnroutableEmail) => {
    const headers = email.raw_headers || [];
    const formatted = headers.map(h => `${h.name}: ${h.value}`).join("\n");
    navigator.clipboard.writeText(formatted);
    toast.success("Headers copied to clipboard");
  };

  const copyEmailDetails = (email: UnroutableEmail) => {
    const details = `
Gmail Message ID: ${email.gmail_message_id}
Received: ${email.received_at}
From: ${email.from_header || "N/A"}
Subject: ${email.subject || "N/A"}
Delivered-To: ${email.delivered_to_header || "N/A"}
X-Original-To: ${email.x_original_to_header || "N/A"}
X-Gm-Original-To: ${email.x_gm_original_to_header || "N/A"}
X-Forwarded-To: ${email.x_forwarded_to_header || "N/A"}
Envelope-To: ${email.envelope_to_header || "N/A"}
To: ${email.to_header || "N/A"}
Cc: ${email.cc_header || "N/A"}
Extracted Alias: ${email.extracted_alias || "N/A"}
Extraction Source: ${email.extraction_source || "N/A"}
Failure Reason: ${email.failure_reason || "N/A"}
Status: ${email.status}
`.trim();
    navigator.clipboard.writeText(details);
    toast.success("Email details copied to clipboard");
  };

  const truncate = (str: string | null, len: number) => {
    if (!str) return "—";
    return str.length > len ? str.substring(0, len) + "..." : str;
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-yellow-500" />
            Unroutable Emails
          </h1>
          <p className="text-muted-foreground">
            Quarantined emails that could not be routed to a tenant
          </p>
        </div>
        <Button onClick={() => refetch()} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{stats?.total || 0}</div>
            <p className="text-xs text-muted-foreground">Total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-red-500">{stats?.noAlias || 0}</div>
            <p className="text-xs text-muted-foreground">No Alias Found</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-orange-500">{stats?.unknownAlias || 0}</div>
            <p className="text-xs text-muted-foreground">Unknown Alias</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-yellow-500">{stats?.quarantined || 0}</div>
            <p className="text-xs text-muted-foreground">Quarantined</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-green-500">{stats?.resolved || 0}</div>
            <p className="text-xs text-muted-foreground">Resolved</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4">
            <div className="w-32">
              <Select value={timeRange} onValueChange={(v: "24h" | "7d" | "30d") => setTimeRange(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24h">Last 24h</SelectItem>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-48">
              <Select value={failureFilter} onValueChange={setFailureFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Failure reason" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Failures</SelectItem>
                  <SelectItem value="No alias">No Alias Found</SelectItem>
                  <SelectItem value="No tenant">Unknown Alias</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Input
              placeholder="Search from, subject, alias..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-64"
            />
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Quarantined Emails ({emails?.length || 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : emails?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No unroutable emails found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[140px]">Received</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Extracted Alias</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Failure</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {emails?.map((email) => (
                    <TableRow key={email.id}>
                      <TableCell className="text-xs">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDistanceToNow(new Date(email.received_at), { addSuffix: true })}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-xs">
                        {truncate(email.from_header, 30)}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-xs">
                        {truncate(email.subject, 40)}
                      </TableCell>
                      <TableCell>
                        {email.extracted_alias ? (
                          <Badge variant="outline" className="font-mono">
                            {email.extracted_alias}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">None</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {email.extraction_source || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={email.failure_reason?.includes("No alias") ? "destructive" : "secondary"}
                          className="text-xs"
                        >
                          {truncate(email.failure_reason, 20)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={email.status === "resolved" ? "default" : "outline"}
                        >
                          {email.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button 
                                size="sm" 
                                variant="ghost"
                                onClick={() => setSelectedEmail(email)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl max-h-[80vh]">
                              <DialogHeader>
                                <DialogTitle>Email Details</DialogTitle>
                              </DialogHeader>
                              <ScrollArea className="h-[60vh]">
                                <div className="space-y-4 pr-4">
                                  <div className="flex justify-end gap-2">
                                    <Button 
                                      size="sm" 
                                      variant="outline"
                                      onClick={() => copyEmailDetails(email)}
                                    >
                                      <Copy className="h-4 w-4 mr-1" />
                                      Copy Details
                                    </Button>
                                    <Button 
                                      size="sm" 
                                      variant="outline"
                                      onClick={() => copyHeaders(email)}
                                    >
                                      <Copy className="h-4 w-4 mr-1" />
                                      Copy Headers
                                    </Button>
                                  </div>
                                  
                                  <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                      <label className="text-muted-foreground">Gmail Message ID</label>
                                      <p className="font-mono text-xs break-all">{email.gmail_message_id}</p>
                                    </div>
                                    <div>
                                      <label className="text-muted-foreground">Received</label>
                                      <p>{format(new Date(email.received_at), "PPpp")}</p>
                                    </div>
                                  </div>

                                  <div className="border-t pt-4">
                                    <h4 className="font-semibold mb-2">Routing Headers</h4>
                                    <div className="space-y-2 text-sm">
                                      <div>
                                        <label className="text-muted-foreground">Delivered-To</label>
                                        <p className="font-mono text-xs bg-muted p-1 rounded">
                                          {email.delivered_to_header || "NULL"}
                                        </p>
                                      </div>
                                      <div>
                                        <label className="text-muted-foreground">X-Original-To</label>
                                        <p className="font-mono text-xs bg-muted p-1 rounded">
                                          {email.x_original_to_header || "NULL"}
                                        </p>
                                      </div>
                                      <div>
                                        <label className="text-muted-foreground">X-Gm-Original-To</label>
                                        <p className="font-mono text-xs bg-muted p-1 rounded">
                                          {email.x_gm_original_to_header || "NULL"}
                                        </p>
                                      </div>
                                      <div>
                                        <label className="text-muted-foreground">X-Forwarded-To</label>
                                        <p className="font-mono text-xs bg-muted p-1 rounded">
                                          {email.x_forwarded_to_header || "NULL"}
                                        </p>
                                      </div>
                                      <div>
                                        <label className="text-muted-foreground">Envelope-To</label>
                                        <p className="font-mono text-xs bg-muted p-1 rounded">
                                          {email.envelope_to_header || "NULL"}
                                        </p>
                                      </div>
                                      <div>
                                        <label className="text-muted-foreground">To</label>
                                        <p className="font-mono text-xs bg-muted p-1 rounded">
                                          {email.to_header || "NULL"}
                                        </p>
                                      </div>
                                      <div>
                                        <label className="text-muted-foreground">Cc</label>
                                        <p className="font-mono text-xs bg-muted p-1 rounded">
                                          {email.cc_header || "NULL"}
                                        </p>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="border-t pt-4">
                                    <h4 className="font-semibold mb-2">Message Info</h4>
                                    <div className="space-y-2 text-sm">
                                      <div>
                                        <label className="text-muted-foreground">From</label>
                                        <p className="font-mono text-xs">{email.from_header || "NULL"}</p>
                                      </div>
                                      <div>
                                        <label className="text-muted-foreground">Subject</label>
                                        <p className="text-xs">{email.subject || "NULL"}</p>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="border-t pt-4">
                                    <h4 className="font-semibold mb-2">Extraction Result</h4>
                                    <div className="grid grid-cols-2 gap-4 text-sm">
                                      <div>
                                        <label className="text-muted-foreground">Extracted Alias</label>
                                        <p className="font-mono">{email.extracted_alias || "NULL"}</p>
                                      </div>
                                      <div>
                                        <label className="text-muted-foreground">Extraction Source</label>
                                        <p>{email.extraction_source || "NULL"}</p>
                                      </div>
                                      <div className="col-span-2">
                                        <label className="text-muted-foreground">Failure Reason</label>
                                        <p className="text-red-500">{email.failure_reason || "NULL"}</p>
                                      </div>
                                    </div>
                                  </div>

                                  {email.raw_headers && email.raw_headers.length > 0 && (
                                    <div className="border-t pt-4">
                                      <h4 className="font-semibold mb-2">
                                        Raw Headers ({email.raw_headers.length})
                                      </h4>
                                      <div className="bg-muted p-2 rounded text-xs font-mono max-h-[200px] overflow-auto">
                                        {email.raw_headers.map((h, i) => (
                                          <div key={i} className="break-all">
                                            <span className="text-blue-500">{h.name}:</span> {h.value}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </ScrollArea>
                            </DialogContent>
                          </Dialog>
                          <Button 
                            size="sm" 
                            variant="ghost"
                            onClick={() => copyHeaders(email)}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
