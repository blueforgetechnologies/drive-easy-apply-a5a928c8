import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, AlertCircle, CheckCircle, Copy, Save, Database, Trash2, RefreshCw } from "lucide-react";
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

interface FieldAssignment {
  field: string;
  value: string;
  contextBefore: string;
  contextAfter: string;
}

interface ParserHint {
  id: string;
  email_source: string;
  field_name: string;
  pattern: string;
  example_value: string;
  is_active: boolean;
}

interface ParserHelperProps {
  initialLoadId?: string | null;
}

export default function ParserHelper({ initialLoadId }: ParserHelperProps) {
  const [searchId, setSearchId] = useState(initialLoadId || "");
  const [loading, setLoading] = useState(false);
  const [loadEmail, setLoadEmail] = useState<LoadEmail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<FieldAssignment[]>([]);
  const [savedHints, setSavedHints] = useState<ParserHint[]>([]);
  
  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; selectedText: string } | null>(null);
  const emailContentRef = useRef<HTMLDivElement>(null);

  // Auto-search when initialLoadId is provided
  useEffect(() => {
    if (initialLoadId) {
      setSearchId(initialLoadId);
      performSearch(initialLoadId);
    }
  }, [initialLoadId]);

  // Load saved hints when email loads
  useEffect(() => {
    if (loadEmail?.email_source) {
      loadSavedHints(loadEmail.email_source);
    }
  }, [loadEmail?.email_source]);

  // Close context menu on click outside
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  const loadSavedHints = async (source: string) => {
    const { data } = await supabase
      .from("parser_hints")
      .select("*")
      .eq("email_source", source)
      .eq("is_active", true)
      .order("field_name");
    
    if (data) setSavedHints(data);
  };

  const performSearch = async (idToSearch: string) => {
    if (!idToSearch.trim()) {
      toast.error("Please enter a load ID or match ID");
      return;
    }

    setLoading(true);
    setError(null);
    setLoadEmail(null);
    setAssignments([]);

    try {
      let { data, error: queryError } = await supabase
        .from("load_emails")
        .select("*")
        .eq("load_id", idToSearch.trim())
        .maybeSingle();

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

  const handleContextMenu = (e: React.MouseEvent) => {
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim();
    
    if (selectedText && selectedText.length > 0) {
      e.preventDefault();
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        selectedText,
      });
    }
  };

  const getContextAroundSelection = (selectedText: string): { before: string; after: string } => {
    const fullText = loadEmail?.body_text || "";
    const htmlText = loadEmail?.body_html || "";
    const searchIn = fullText || htmlText.replace(/<[^>]*>/g, ' ');
    
    const index = searchIn.indexOf(selectedText);
    if (index === -1) return { before: "", after: "" };
    
    const before = searchIn.substring(Math.max(0, index - 50), index).trim();
    const after = searchIn.substring(index + selectedText.length, index + selectedText.length + 50).trim();
    
    return { before, after };
  };

  const assignToField = (field: string) => {
    if (!contextMenu) return;
    
    const context = getContextAroundSelection(contextMenu.selectedText);
    
    // Remove any existing assignment for this field
    const filtered = assignments.filter(a => a.field !== field);
    
    setAssignments([
      ...filtered,
      {
        field,
        value: contextMenu.selectedText,
        contextBefore: context.before,
        contextAfter: context.after,
      }
    ]);
    
    setContextMenu(null);
    toast.success(`Assigned "${contextMenu.selectedText.substring(0, 30)}..." to ${field}`);
  };

  const removeAssignment = (field: string) => {
    setAssignments(assignments.filter(a => a.field !== field));
  };

  const saveHintsToDatabase = async () => {
    if (!loadEmail || assignments.length === 0) {
      toast.error("No assignments to save");
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    
    let savedCount = 0;
    for (const assignment of assignments) {
      // Create a regex pattern from the context
      const escapedValue = assignment.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      let pattern = escapedValue;
      
      // If we have context, create a more specific pattern
      if (assignment.contextBefore || assignment.contextAfter) {
        const beforePattern = assignment.contextBefore 
          ? assignment.contextBefore.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(-20) + '\\s*'
          : '';
        const afterPattern = assignment.contextAfter
          ? '\\s*' + assignment.contextAfter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 20)
          : '';
        pattern = `${beforePattern}(${escapedValue})${afterPattern}`;
      }

      const { error } = await supabase
        .from("parser_hints")
        .upsert({
          email_source: loadEmail.email_source,
          field_name: assignment.field,
          pattern: pattern,
          context_before: assignment.contextBefore,
          context_after: assignment.contextAfter,
          example_value: assignment.value,
          created_by: userData.user?.id,
        }, {
          onConflict: 'email_source,field_name,pattern'
        });

      if (!error) savedCount++;
    }

    if (savedCount > 0) {
      toast.success(`Saved ${savedCount} hint(s) to database`);
      loadSavedHints(loadEmail.email_source);
    }
  };

  const deleteHint = async (hintId: string) => {
    const { error } = await supabase
      .from("parser_hints")
      .delete()
      .eq("id", hintId);
    
    if (!error) {
      toast.success("Hint deleted");
      setSavedHints(savedHints.filter(h => h.id !== hintId));
    }
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

  const getMissingFields = () => {
    if (!loadEmail?.parsed_data) return expectedFields;
    return expectedFields.filter(field => {
      const value = loadEmail.parsed_data[field];
      return value === null || value === undefined || value === "";
    });
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

  const missingFields = getMissingFields();

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
        <>
          {/* Assignments Bar */}
          {assignments.length > 0 && (
            <Card className="border-green-500/50 bg-green-500/5">
              <CardHeader className="py-2">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Database className="h-4 w-4" />
                    Field Assignments ({assignments.length})
                  </span>
                  <Button size="sm" onClick={saveHintsToDatabase}>
                    <Save className="h-3 w-3 mr-1" /> Save Hints to Database
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="py-2">
                <div className="flex flex-wrap gap-2">
                  {assignments.map((a) => (
                    <Badge key={a.field} variant="outline" className="bg-green-500/10 gap-1">
                      <span className="font-semibold">{a.field}:</span>
                      <span className="text-muted-foreground">"{a.value.substring(0, 20)}{a.value.length > 20 ? '...' : ''}"</span>
                      <button onClick={() => removeAssignment(a.field)} className="ml-1 hover:text-destructive">×</button>
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-2 gap-4 h-[calc(100vh-340px)]">
            {/* Left: Parsed Data */}
            <Card className="overflow-hidden">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center justify-between">
                  <span>Parsed Data</span>
                  <div className="flex items-center gap-2">
                    <Badge>{loadEmail.load_id}</Badge>
                    <Badge variant="outline">{loadEmail.email_source}</Badge>
                    {missingFields.length > 0 && (
                      <Badge variant="destructive">{missingFields.length} missing</Badge>
                    )}
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-auto h-[calc(100%-60px)]">
                <div className="space-y-2 text-sm">
                  {expectedFields.map((field) => {
                    const value = loadEmail.parsed_data?.[field];
                    const isMissing = value === null || value === undefined || value === "";
                    const assignment = assignments.find(a => a.field === field);
                    
                    return (
                      <div key={field} className={`flex justify-between items-start py-1 border-b border-border/50 ${isMissing ? 'bg-destructive/10' : ''} ${assignment ? 'bg-green-500/10' : ''}`}>
                        <span className="font-medium text-muted-foreground w-1/3">{field}:</span>
                        <span className="w-2/3 text-right">
                          {assignment ? (
                            <span className="flex items-center justify-end gap-1 text-green-600">
                              <CheckCircle className="h-3 w-3" />
                              "{assignment.value.substring(0, 30)}{assignment.value.length > 30 ? '...' : ''}"
                            </span>
                          ) : isMissing ? (
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
                </div>
              </CardContent>
            </Card>

            {/* Right: Original Email */}
            <Card className="overflow-hidden">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center justify-between">
                  <span>Original Email</span>
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  <strong>Right-click</strong> on selected text to assign it to a missing field.
                </p>
              </CardHeader>
              <CardContent 
                ref={emailContentRef}
                className="overflow-auto h-[calc(100%-80px)]" 
                onContextMenu={handleContextMenu}
              >
                <div className="space-y-4">
                  <div className="border-b pb-2">
                    <p className="text-sm"><strong>From:</strong> {loadEmail.from_name} &lt;{loadEmail.from_email}&gt;</p>
                    <p className="text-sm"><strong>Subject:</strong> {loadEmail.subject}</p>
                    <p className="text-sm"><strong>Received:</strong> {new Date(loadEmail.received_at).toLocaleString()}</p>
                  </div>

                  <div 
                    className="text-sm bg-muted p-4 rounded prose prose-sm max-w-none dark:prose-invert select-text"
                    dangerouslySetInnerHTML={{ __html: loadEmail.body_html || loadEmail.body_text || "No body content" }}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Saved Hints */}
          {savedHints.length > 0 && (
            <Card>
              <CardHeader className="py-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  Saved Hints for {loadEmail.email_source} ({savedHints.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="py-2">
                <div className="flex flex-wrap gap-2">
                  {savedHints.map((hint) => (
                    <Badge key={hint.id} variant="secondary" className="gap-1">
                      <span className="font-semibold">{hint.field_name}:</span>
                      <span className="text-muted-foreground text-xs">"{hint.example_value?.substring(0, 15)}..."</span>
                      <button onClick={() => deleteHint(hint.id)} className="ml-1 hover:text-destructive">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Context Menu */}
      {contextMenu && missingFields.length > 0 && (
        <div
          className="fixed z-50 bg-popover border rounded-lg shadow-lg py-1 min-w-[200px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1 text-xs text-muted-foreground border-b">
            Assign to missing field:
          </div>
          <div className="max-h-[300px] overflow-auto">
            {missingFields.map((field) => (
              <button
                key={field}
                className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent flex items-center gap-2"
                onClick={() => assignToField(field)}
              >
                <AlertCircle className="h-3 w-3 text-destructive" />
                {field}
              </button>
            ))}
          </div>
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
