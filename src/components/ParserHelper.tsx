import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, AlertCircle, CheckCircle, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface LoadEmail {
  id: string;
  load_id: string;
  email_source: string;
  subject: string;
  from_email: string;
  from_name: string;
  body_html: string;
  body_text: string;
  parsed_data: any;
  received_at: string;
}

interface ParserHelperProps {
  initialLoadId?: string | null;
}

export default function ParserHelper({ initialLoadId }: ParserHelperProps) {
  const [searchId, setSearchId] = useState(initialLoadId || "");
  const [loading, setLoading] = useState(false);
  const [loadEmail, setLoadEmail] = useState<LoadEmail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [highlightedText, setHighlightedText] = useState<string[]>([]);

  // Auto-search when initialLoadId is provided
  useEffect(() => {
    if (initialLoadId) {
      setSearchId(initialLoadId);
      performSearch(initialLoadId);
    }
  }, [initialLoadId]);

  const performSearch = async (idToSearch: string) => {
    if (!idToSearch.trim()) {
      toast.error("Please enter a load ID or match ID");
      return;
    }

    setLoading(true);
    setError(null);
    setLoadEmail(null);
    setHighlightedText([]);

    try {
      // First try to find by load_id
      let { data, error: queryError } = await supabase
        .from("load_emails")
        .select("*")
        .eq("load_id", idToSearch.trim())
        .maybeSingle();

      // If not found, try by match ID
      if (!data) {
        const { data: matchData } = await supabase
          .from("load_hunt_matches")
          .select("load_email_id")
          .eq("id", idToSearch.trim())
          .maybeSingle();

        if (matchData?.load_email_id) {
          const { data: emailData } = await supabase
            .from("load_emails")
            .select("*")
            .eq("id", matchData.load_email_id)
            .single();
          data = emailData;
        }
      }

      // Also try by UUID directly
      if (!data) {
        const { data: emailData } = await supabase
          .from("load_emails")
          .select("*")
          .eq("id", idToSearch.trim())
          .maybeSingle();
        data = emailData;
      }

      if (queryError) throw queryError;

      if (!data) {
        setError(`No load found with ID: ${idToSearch}`);
        return;
      }

      setLoadEmail(data as LoadEmail);
    } catch (err: any) {
      setError(err.message || "Failed to fetch load");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => performSearch(searchId);

  const handleHighlight = () => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim()) {
      const text = selection.toString().trim();
      if (!highlightedText.includes(text)) {
        setHighlightedText([...highlightedText, text]);
        toast.success(`Highlighted: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
      }
    }
  };

  const copyHighlights = () => {
    const formatted = highlightedText.map((t, i) => `${i + 1}. "${t}"`).join("\n");
    navigator.clipboard.writeText(formatted);
    toast.success("Copied highlights to clipboard");
  };

  const clearHighlights = () => {
    setHighlightedText([]);
  };

  const renderParsedValue = (key: string, value: any) => {
    if (value === null || value === undefined) {
      return <span className="text-destructive">NULL</span>;
    }
    if (typeof value === "boolean") {
      return value ? (
        <Badge className="bg-green-500">true</Badge>
      ) : (
        <Badge variant="secondary">false</Badge>
      );
    }
    if (typeof value === "object") {
      return <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-32">{JSON.stringify(value, null, 2)}</pre>;
    }
    return <span className="text-foreground">{String(value)}</span>;
  };

  const expectedFields = [
    "broker_email", "broker_name", "broker_company", "broker_phone",
    "order_number", "order_number_secondary",
    "origin_city", "origin_state", "origin_zip",
    "destination_city", "destination_state", "destination_zip",
    "pickup_date", "pickup_time", "delivery_date", "delivery_time",
    "vehicle_type", "loaded_miles", "weight", "pieces",
    "rate", "posted_amount", "dock_level",
    "hazmat", "stackable", "has_multiple_stops", "stop_count",
    "expires_at", "notes", "mc_number", "customer_name"
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex-1 flex gap-2">
          <Input
            placeholder="Enter Load ID (LH-YYMMDD-XXX) or Match ID..."
            value={searchId}
            onChange={(e) => setSearchId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="max-w-md"
          />
          <Button onClick={handleSearch} disabled={loading}>
            <Search className="h-4 w-4 mr-2" />
            {loading ? "Searching..." : "Search"}
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          </CardContent>
        </Card>
      )}

      {loadEmail && (
        <div className="grid grid-cols-2 gap-4 h-[calc(100vh-280px)]">
          {/* Left: Parsed Data */}
          <Card className="overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center justify-between">
                <span>Parsed Data</span>
                <div className="flex items-center gap-2">
                  <Badge>{loadEmail.load_id}</Badge>
                  <Badge variant="outline">{loadEmail.email_source}</Badge>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-auto h-[calc(100%-60px)]">
              <div className="space-y-2 text-sm">
                {expectedFields.map((field) => {
                  const value = loadEmail.parsed_data?.[field];
                  const isMissing = value === null || value === undefined || value === "";
                  return (
                    <div key={field} className={`flex justify-between items-start py-1 border-b border-border/50 ${isMissing ? 'bg-destructive/10' : ''}`}>
                      <span className="font-medium text-muted-foreground w-1/3">{field}:</span>
                      <span className="w-2/3 text-right">
                        {isMissing ? (
                          <span className="text-destructive flex items-center justify-end gap-1">
                            <AlertCircle className="h-3 w-3" /> MISSING
                          </span>
                        ) : (
                          <span className="flex items-center justify-end gap-1">
                            <CheckCircle className="h-3 w-3 text-green-500" />
                            {renderParsedValue(field, value)}
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
                
                {/* Show any extra fields not in expected list */}
                {loadEmail.parsed_data && Object.keys(loadEmail.parsed_data)
                  .filter(k => !expectedFields.includes(k))
                  .map((field) => (
                    <div key={field} className="flex justify-between items-start py-1 border-b border-border/50 bg-blue-500/10">
                      <span className="font-medium text-blue-500 w-1/3">{field}:</span>
                      <span className="w-2/3 text-right">
                        {renderParsedValue(field, loadEmail.parsed_data[field])}
                      </span>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>

          {/* Right: Original Email */}
          <Card className="overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center justify-between">
                <span>Original Email</span>
                <div className="flex items-center gap-2">
                  {highlightedText.length > 0 && (
                    <>
                      <Badge variant="secondary">{highlightedText.length} highlighted</Badge>
                      <Button size="sm" variant="outline" onClick={copyHighlights}>
                        <Copy className="h-3 w-3 mr-1" /> Copy
                      </Button>
                      <Button size="sm" variant="ghost" onClick={clearHighlights}>
                        Clear
                      </Button>
                    </>
                  )}
                </div>
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Select text to highlight missing data. Then copy highlights to share.
              </p>
            </CardHeader>
            <CardContent className="overflow-auto h-[calc(100%-80px)]" onMouseUp={handleHighlight}>
              <div className="space-y-4">
                <div className="border-b pb-2">
                  <p className="text-sm"><strong>From:</strong> {loadEmail.from_name} &lt;{loadEmail.from_email}&gt;</p>
                  <p className="text-sm"><strong>Subject:</strong> {loadEmail.subject}</p>
                  <p className="text-sm"><strong>Received:</strong> {new Date(loadEmail.received_at).toLocaleString()}</p>
                </div>
                
                {highlightedText.length > 0 && (
                  <div className="bg-yellow-500/20 p-2 rounded border border-yellow-500/50">
                    <p className="text-xs font-medium mb-1">Highlighted (missed data):</p>
                    <ul className="text-xs space-y-1">
                      {highlightedText.map((text, i) => (
                        <li key={i} className="text-yellow-700 dark:text-yellow-300">
                          • "{text.substring(0, 100)}{text.length > 100 ? '...' : ''}"
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div 
                  className="text-sm bg-muted p-4 rounded prose prose-sm max-w-none dark:prose-invert"
                  dangerouslySetInnerHTML={{ __html: loadEmail.body_html || loadEmail.body_text || "No body content" }}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {!loadEmail && !error && !loading && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground text-center">
              Enter a Load ID (e.g., LH-251216-1147203) or Match ID to compare parsed data with the original email.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
