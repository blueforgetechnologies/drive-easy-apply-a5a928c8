import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Check, RefreshCw, Truck, Package, Trash2, Merge, Undo2, AlertTriangle, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type EmailSource = 'sylectus' | 'fullcircle' | '123loadboard' | 'truckstop';

interface LoadboardFilter {
  id: string;
  source: EmailSource;
  filter_type: 'vehicle' | 'load';
  original_value: string;
  canonical_value: string | null;
  is_hidden: boolean;
  auto_mapped: boolean;
  reviewed_at: string | null;
  created_at: string;
}

interface CanonicalFilter {
  value: string;
  filter_type: 'vehicle' | 'load';
  sources: { source: EmailSource; original_value: string; count: number }[];
  totalCount: number;
}

const SOURCE_LABELS: Record<EmailSource, string> = {
  sylectus: 'Sylectus',
  fullcircle: 'Full Circle TMS',
  '123loadboard': '123 Loadboard',
  truckstop: 'TruckStop.com'
};

const SOURCE_COLORS: Record<EmailSource, string> = {
  sylectus: 'bg-blue-600 text-white',
  fullcircle: 'bg-emerald-600 text-white',
  '123loadboard': 'bg-purple-600 text-white',
  truckstop: 'bg-orange-600 text-white'
};

export default function LoadboardFiltersTab() {
  const [filters, setFilters] = useState<LoadboardFilter[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSource, setActiveSource] = useState<'canonical' | EmailSource>('canonical');
  const [selectedFilters, setSelectedFilters] = useState<Set<string>>(new Set());
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [customTargetName, setCustomTargetName] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [emailCounts, setEmailCounts] = useState<Record<string, Record<string, number>>>({});

  // Fetch filters from database
  const loadFilters = async () => {
    setLoading(true);
    try {
      const { data: dbFilters, error } = await supabase
        .from("loadboard_filters")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch email counts for each source
      const { data: emails, error: emailError } = await supabase
        .from("load_emails")
        .select("email_source, parsed_data")
        .not("parsed_data", "is", null)
        .limit(50000);

      if (emailError) throw emailError;

      // Count vehicle and load types per source
      const counts: Record<string, Record<string, number>> = {
        sylectus: {},
        fullcircle: {},
        '123loadboard': {},
        truckstop: {}
      };

      emails?.forEach((email) => {
        const source = email.email_source as EmailSource || 'sylectus';
        const parsed = email.parsed_data as Record<string, unknown>;
        
        const vehicleType = (parsed?.vehicle_type || parsed?.vehicleType) as string | undefined;
        const loadType = (parsed?.load_type || parsed?.loadType) as string | undefined;

        if (vehicleType?.trim()) {
          const key = `vehicle:${vehicleType.trim()}`;
          counts[source][key] = (counts[source][key] || 0) + 1;
        }
        if (loadType?.trim()) {
          const key = `load:${loadType.trim()}`;
          counts[source][key] = (counts[source][key] || 0) + 1;
        }
      });

      setEmailCounts(counts);

      // Auto-create filters for new types found in emails
      const existingFilters = new Map(
        (dbFilters || []).map(f => [`${f.source}:${f.filter_type}:${f.original_value}`, f])
      );

      const newFilters: Array<{
        source: EmailSource;
        filter_type: 'vehicle' | 'load';
        original_value: string;
        canonical_value: string;
        auto_mapped: boolean;
      }> = [];

      Object.entries(counts).forEach(([source, typeCounts]) => {
        Object.keys(typeCounts).forEach((key) => {
          const [filterType, value] = key.split(':');
          const existingKey = `${source}:${filterType}:${value}`;
          
          if (!existingFilters.has(existingKey)) {
            // Auto-create with auto-mapping to uppercase version
            newFilters.push({
              source: source as EmailSource,
              filter_type: filterType as 'vehicle' | 'load',
              original_value: value,
              canonical_value: value.toUpperCase(),
              auto_mapped: true
            });
          }
        });
      });

      // Insert new filters
      if (newFilters.length > 0) {
        const { error: insertError } = await supabase
          .from("loadboard_filters")
          .insert(newFilters);

        if (insertError) {
          console.error("Error inserting new filters:", insertError);
        } else {
          // Refetch to get updated list
          const { data: updatedFilters } = await supabase
            .from("loadboard_filters")
            .select("*")
            .order("created_at", { ascending: false });
          
          setFilters((updatedFilters || []).map(f => ({
            ...f,
            filter_type: f.filter_type as 'vehicle' | 'load',
            source: f.source as EmailSource
          })));
          setLoading(false);
          return;
        }
      }

      setFilters((dbFilters || []).map(f => ({
        ...f,
        filter_type: f.filter_type as 'vehicle' | 'load',
        source: f.source as EmailSource
      })));
    } catch (error) {
      console.error("Error loading filters:", error);
      toast.error("Failed to load filters");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFilters();
  }, []);

  // Get count for a specific filter
  const getFilterCount = (source: EmailSource, filterType: string, value: string): number => {
    const key = `${filterType}:${value}`;
    return emailCounts[source]?.[key] || 0;
  };

  // Compute canonical filters (grouped by canonical_value)
  const getCanonicalFilters = (): CanonicalFilter[] => {
    const canonicalMap = new Map<string, CanonicalFilter>();

    filters.filter(f => f.canonical_value && !f.is_hidden).forEach(f => {
      const key = `${f.filter_type}:${f.canonical_value}`;
      
      if (!canonicalMap.has(key)) {
        canonicalMap.set(key, {
          value: f.canonical_value!,
          filter_type: f.filter_type,
          sources: [],
          totalCount: 0
        });
      }

      const canonical = canonicalMap.get(key)!;
      const count = getFilterCount(f.source, f.filter_type, f.original_value);
      canonical.sources.push({
        source: f.source,
        original_value: f.original_value,
        count
      });
      canonical.totalCount += count;
    });

    return Array.from(canonicalMap.values()).sort((a, b) => b.totalCount - a.totalCount);
  };

  // Get filters for a specific source
  const getSourceFilters = (source: EmailSource) => {
    return filters.filter(f => f.source === source);
  };

  // Filters needing attention (auto_mapped but not reviewed)
  const getNeedsAttention = () => {
    return filters.filter(f => f.auto_mapped && !f.reviewed_at);
  };

  // Mark filter as reviewed
  const markAsReviewed = async (filterId: string) => {
    try {
      const { error } = await supabase
        .from("loadboard_filters")
        .update({ reviewed_at: new Date().toISOString() })
        .eq("id", filterId);

      if (error) throw error;

      setFilters(prev => prev.map(f => 
        f.id === filterId ? { ...f, reviewed_at: new Date().toISOString() } : f
      ));
      toast.success("Filter marked as reviewed");
    } catch (error) {
      console.error("Error marking as reviewed:", error);
      toast.error("Failed to mark as reviewed");
    }
  };

  // Update canonical mapping
  const updateCanonicalMapping = async (filterId: string, newCanonical: string) => {
    try {
      const { error } = await supabase
        .from("loadboard_filters")
        .update({ 
          canonical_value: newCanonical.toUpperCase(),
          reviewed_at: new Date().toISOString()
        })
        .eq("id", filterId);

      if (error) throw error;

      setFilters(prev => prev.map(f => 
        f.id === filterId ? { 
          ...f, 
          canonical_value: newCanonical.toUpperCase(),
          reviewed_at: new Date().toISOString()
        } : f
      ));
      toast.success("Mapping updated");
    } catch (error) {
      console.error("Error updating mapping:", error);
      toast.error("Failed to update mapping");
    }
  };

  // Toggle filter visibility
  const toggleFilterHidden = async (filterId: string, isHidden: boolean) => {
    try {
      const { error } = await supabase
        .from("loadboard_filters")
        .update({ is_hidden: isHidden })
        .eq("id", filterId);

      if (error) throw error;

      setFilters(prev => prev.map(f => 
        f.id === filterId ? { ...f, is_hidden: isHidden } : f
      ));
      toast.success(isHidden ? "Filter hidden" : "Filter restored");
    } catch (error) {
      console.error("Error toggling visibility:", error);
      toast.error("Failed to update filter");
    }
  };

  // Merge selected filters
  const handleMergeFilters = async () => {
    if (!customTargetName.trim()) {
      toast.error("Enter a canonical name");
      return;
    }

    const selectedFiltersList = filters.filter(f => selectedFilters.has(f.id));
    
    try {
      const { error } = await supabase
        .from("loadboard_filters")
        .update({ 
          canonical_value: customTargetName.trim().toUpperCase(),
          reviewed_at: new Date().toISOString()
        })
        .in("id", [...selectedFilters]);

      if (error) throw error;

      setFilters(prev => prev.map(f => 
        selectedFilters.has(f.id) ? { 
          ...f, 
          canonical_value: customTargetName.trim().toUpperCase(),
          reviewed_at: new Date().toISOString()
        } : f
      ));
      
      setSelectedFilters(new Set());
      setMergeDialogOpen(false);
      setCustomTargetName("");
      toast.success(`${selectedFiltersList.length} filter(s) mapped to "${customTargetName.trim().toUpperCase()}"`);
    } catch (error) {
      console.error("Error merging filters:", error);
      toast.error("Failed to merge filters");
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedFilters(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const needsAttention = getNeedsAttention();
  const canonicalFilters = getCanonicalFilters();
  const vehicleCanonicals = canonicalFilters.filter(c => c.filter_type === 'vehicle');
  const loadCanonicals = canonicalFilters.filter(c => c.filter_type === 'load');

  const activeSources: EmailSource[] = ['sylectus', 'fullcircle'];

  return (
    <div className="space-y-4">
      {/* Needs Attention Alert */}
      {needsAttention.length > 0 && (
        <Alert variant="destructive" className="border-destructive/50 bg-destructive/10">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle className="font-semibold">
            {needsAttention.length} Auto-Mapped Filter{needsAttention.length !== 1 ? 's' : ''} Need Review
          </AlertTitle>
          <AlertDescription className="text-sm">
            These filters were automatically mapped. Review them to confirm or correct the mappings.
            <div className="flex flex-wrap gap-2 mt-2">
              {needsAttention.slice(0, 5).map(f => (
                <Badge key={f.id} variant="outline" className="text-xs">
                  {f.original_value} → {f.canonical_value}
                </Badge>
              ))}
              {needsAttention.length > 5 && (
                <Badge variant="secondary" className="text-xs">
                  +{needsAttention.length - 5} more
                </Badge>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Load Board Filter Configuration</h3>
          <p className="text-sm text-muted-foreground">
            Manage filters across all load board sources
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedFilters.size >= 1 && (
            <Button variant="default" size="sm" onClick={() => setMergeDialogOpen(true)}>
              <Merge className="h-4 w-4 mr-1" />
              {selectedFilters.size === 1 ? "Rename" : `Merge (${selectedFilters.size})`}
            </Button>
          )}
          <Button
            variant={showHidden ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowHidden(!showHidden)}
          >
            {showHidden ? <EyeOff className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
            {showHidden ? "Hide Hidden" : "Show Hidden"}
          </Button>
          <Button variant="outline" size="sm" onClick={loadFilters} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <Tabs value={activeSource} onValueChange={(v) => setActiveSource(v as typeof activeSource)}>
        <TabsList className="w-full justify-start">
          <TabsTrigger value="canonical" className="text-xs sm:text-sm">
            Canonical Filters
          </TabsTrigger>
          {activeSources.map(source => {
            const sourceFilters = getSourceFilters(source);
            const unreviewed = sourceFilters.filter(f => f.auto_mapped && !f.reviewed_at);
            return (
              <TabsTrigger key={source} value={source} className="text-xs sm:text-sm relative">
                {SOURCE_LABELS[source]}
                {unreviewed.length > 0 && (
                  <Badge variant="destructive" className="ml-1 h-4 px-1 text-[10px]">
                    {unreviewed.length}
                  </Badge>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {/* Canonical Filters Tab */}
        <TabsContent value="canonical" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Vehicle Canonical Filters */}
            <Card>
              <CardHeader className="py-2 px-3">
                <div className="flex items-center gap-2">
                  <Truck className="h-5 w-5 text-muted-foreground" />
                  <CardTitle className="text-base">Vehicle Types</CardTitle>
                  <Badge variant="secondary" className="text-xs">
                    {vehicleCanonicals.length}
                  </Badge>
                </div>
                <CardDescription>Unified vehicle type filters</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[500px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Canonical Name</TableHead>
                        <TableHead>Sources</TableHead>
                        <TableHead className="text-right w-20">Count</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {vehicleCanonicals.map((canonical) => (
                        <TableRow key={`vehicle-${canonical.value}`}>
                          <TableCell className="font-medium">
                            <Badge variant="default" className="text-xs">
                              {canonical.value}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {canonical.sources.map((s, i) => (
                                <span
                                  key={i} 
                                  className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold ${SOURCE_COLORS[s.source]}`}
                                >
                                  {s.original_value}
                                </span>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {canonical.totalCount}
                          </TableCell>
                        </TableRow>
                      ))}
                      {vehicleCanonicals.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                            No canonical vehicle filters
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Load Canonical Filters */}
            <Card>
              <CardHeader className="py-2 px-3">
                <div className="flex items-center gap-2">
                  <Package className="h-5 w-5 text-muted-foreground" />
                  <CardTitle className="text-base">Load Types</CardTitle>
                  <Badge variant="secondary" className="text-xs">
                    {loadCanonicals.length}
                  </Badge>
                </div>
                <CardDescription>Unified load type filters</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[500px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Canonical Name</TableHead>
                        <TableHead>Sources</TableHead>
                        <TableHead className="text-right w-20">Count</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadCanonicals.map((canonical) => (
                        <TableRow key={`load-${canonical.value}`}>
                          <TableCell className="font-medium">
                            <Badge variant="default" className="text-xs">
                              {canonical.value}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {canonical.sources.map((s, i) => (
                                <span
                                  key={i} 
                                  className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold ${SOURCE_COLORS[s.source]}`}
                                >
                                  {s.original_value}
                                </span>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {canonical.totalCount}
                          </TableCell>
                        </TableRow>
                      ))}
                      {loadCanonicals.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                            No canonical load filters
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Source-specific Tabs */}
        {activeSources.map(source => {
          const sourceFilters = getSourceFilters(source);
          const vehicleFilters = sourceFilters.filter(f => f.filter_type === 'vehicle' && (showHidden || !f.is_hidden));
          const loadFilters_ = sourceFilters.filter(f => f.filter_type === 'load' && (showHidden || !f.is_hidden));

          return (
            <TabsContent key={source} value={source} className="mt-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Vehicle Filters for this source */}
                <Card>
                  <CardHeader className="py-2 px-3">
                    <div className="flex items-center gap-2">
                      <Truck className="h-5 w-5 text-muted-foreground" />
                      <CardTitle className="text-base">Vehicle Types</CardTitle>
                      <Badge variant="secondary" className="text-xs">
                        {vehicleFilters.length}
                      </Badge>
                    </div>
                    <CardDescription>{SOURCE_LABELS[source]} vehicle types</CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="max-h-[500px] overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-8"></TableHead>
                            <TableHead>Original</TableHead>
                            <TableHead>Maps To</TableHead>
                            <TableHead className="text-right w-16">Count</TableHead>
                            <TableHead className="w-20">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {vehicleFilters.map((filter) => {
                            const count = getFilterCount(source, 'vehicle', filter.original_value);
                            const needsReview = filter.auto_mapped && !filter.reviewed_at;
                            
                            return (
                              <TableRow 
                                key={filter.id}
                                className={filter.is_hidden ? "opacity-50" : needsReview ? "bg-amber-50 dark:bg-amber-950/20" : ""}
                              >
                                <TableCell>
                                  <Checkbox
                                    checked={selectedFilters.has(filter.id)}
                                    onCheckedChange={() => toggleSelection(filter.id)}
                                    disabled={filter.is_hidden}
                                  />
                                </TableCell>
                                <TableCell className="font-medium">
                                  <div className="flex items-center gap-2">
                                    <span className={filter.is_hidden ? "line-through" : ""}>
                                      {filter.original_value}
                                    </span>
                                    {needsReview && (
                                      <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-400">
                                        Auto
                                      </Badge>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="secondary" className="text-xs">
                                    {filter.canonical_value || '-'}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right text-muted-foreground">
                                  {count}
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-1">
                                    {needsReview && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 w-6 p-0 text-emerald-600"
                                        onClick={() => markAsReviewed(filter.id)}
                                        title="Mark as reviewed"
                                      >
                                        <CheckCircle2 className="h-3 w-3" />
                                      </Button>
                                    )}
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 w-6 p-0"
                                      onClick={() => toggleFilterHidden(filter.id, !filter.is_hidden)}
                                      title={filter.is_hidden ? "Restore" : "Hide"}
                                    >
                                      {filter.is_hidden ? <Undo2 className="h-3 w-3" /> : <Trash2 className="h-3 w-3" />}
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                          {vehicleFilters.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                                No vehicle types for {SOURCE_LABELS[source]}
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>

                {/* Load Filters for this source */}
                <Card>
                  <CardHeader className="py-2 px-3">
                    <div className="flex items-center gap-2">
                      <Package className="h-5 w-5 text-muted-foreground" />
                      <CardTitle className="text-base">Load Types</CardTitle>
                      <Badge variant="secondary" className="text-xs">
                        {loadFilters_.length}
                      </Badge>
                    </div>
                    <CardDescription>{SOURCE_LABELS[source]} load types</CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="max-h-[500px] overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-8"></TableHead>
                            <TableHead>Original</TableHead>
                            <TableHead>Maps To</TableHead>
                            <TableHead className="text-right w-16">Count</TableHead>
                            <TableHead className="w-20">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {loadFilters_.map((filter) => {
                            const count = getFilterCount(source, 'load', filter.original_value);
                            const needsReview = filter.auto_mapped && !filter.reviewed_at;
                            
                            return (
                              <TableRow 
                                key={filter.id}
                                className={filter.is_hidden ? "opacity-50" : needsReview ? "bg-amber-50 dark:bg-amber-950/20" : ""}
                              >
                                <TableCell>
                                  <Checkbox
                                    checked={selectedFilters.has(filter.id)}
                                    onCheckedChange={() => toggleSelection(filter.id)}
                                    disabled={filter.is_hidden}
                                  />
                                </TableCell>
                                <TableCell className="font-medium">
                                  <div className="flex items-center gap-2">
                                    <span className={filter.is_hidden ? "line-through" : ""}>
                                      {filter.original_value}
                                    </span>
                                    {needsReview && (
                                      <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-400">
                                        Auto
                                      </Badge>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="secondary" className="text-xs">
                                    {filter.canonical_value || '-'}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right text-muted-foreground">
                                  {count}
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-1">
                                    {needsReview && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 w-6 p-0 text-emerald-600"
                                        onClick={() => markAsReviewed(filter.id)}
                                        title="Mark as reviewed"
                                      >
                                        <CheckCircle2 className="h-3 w-3" />
                                      </Button>
                                    )}
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 w-6 p-0"
                                      onClick={() => toggleFilterHidden(filter.id, !filter.is_hidden)}
                                      title={filter.is_hidden ? "Restore" : "Hide"}
                                    >
                                      {filter.is_hidden ? <Undo2 className="h-3 w-3" /> : <Trash2 className="h-3 w-3" />}
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                          {loadFilters_.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                                No load types for {SOURCE_LABELS[source]}
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          );
        })}
      </Tabs>

      {/* Merge/Rename Dialog */}
      <Dialog open={mergeDialogOpen} onOpenChange={setMergeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedFilters.size === 1 ? "Rename Filter" : `Merge ${selectedFilters.size} Filters`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Canonical Name</Label>
              <Input
                value={customTargetName}
                onChange={(e) => setCustomTargetName(e.target.value)}
                placeholder="Enter canonical filter name"
              />
              <p className="text-xs text-muted-foreground">
                This will be the unified name shown in hunt plans
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Selected filters:</Label>
              <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                {filters.filter(f => selectedFilters.has(f.id)).map(f => (
                  <Badge key={f.id} variant="outline" className="text-xs">
                    <span className={`w-2 h-2 rounded-full mr-1 ${SOURCE_COLORS[f.source]}`}></span>
                    {f.original_value}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleMergeFilters} disabled={!customTargetName.trim()}>
              {selectedFilters.size === 1 ? "Rename" : "Merge"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
