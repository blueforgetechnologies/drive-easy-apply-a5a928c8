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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Check, RefreshCw, Truck, Package, Trash2, Merge, Undo2, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface TypeEntry {
  value: string;
  count: number;
  isNew: boolean;
  isHidden: boolean;
  mappedTo: string | null;
  isCanonical: boolean; // true if other types are merged into this one
  mergedCount: number;  // number of types merged into this one
}

interface TypeConfig {
  original_value: string;
  mapped_to: string | null;
}

const SEEN_VEHICLE_TYPES_KEY = "sylectus_seen_vehicle_types";
const SEEN_LOAD_TYPES_KEY = "sylectus_seen_load_types";

export default function SylectusSettingsTab() {
  const [vehicleTypes, setVehicleTypes] = useState<TypeEntry[]>([]);
  const [loadTypes, setLoadTypes] = useState<TypeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVehicleTypes, setSelectedVehicleTypes] = useState<Set<string>>(new Set());
  const [selectedLoadTypes, setSelectedLoadTypes] = useState<Set<string>>(new Set());
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergeCategory, setMergeCategory] = useState<"vehicle" | "load">("vehicle");
  const [mergeTarget, setMergeTarget] = useState<string>("");
  const [customTargetName, setCustomTargetName] = useState<string>("");
  const [useCustomName, setUseCustomName] = useState(false);
  const [showHidden, setShowHidden] = useState(false);

  const getSeenTypes = (key: string): Set<string> => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  };

  const saveSeenTypes = (key: string, types: Set<string>) => {
    localStorage.setItem(key, JSON.stringify([...types]));
  };

  const loadTypes_data = async () => {
    setLoading(true);
    try {
      // Fetch type configs from database
      const { data: typeConfigs, error: configError } = await supabase
        .from("sylectus_type_config")
        .select("type_category, original_value, mapped_to");

      if (configError) throw configError;

      const vehicleConfigs: Map<string, TypeConfig> = new Map();
      const loadConfigs: Map<string, TypeConfig> = new Map();
      
      // Track canonical types (merge targets) across ALL categories
      const allCanonicalTypes: Map<string, number> = new Map(); // value -> count of things merged into it

      typeConfigs?.forEach((config) => {
        const configEntry = { original_value: config.original_value, mapped_to: config.mapped_to };
        if (config.type_category === "vehicle") {
          vehicleConfigs.set(config.original_value, configEntry);
        } else {
          loadConfigs.set(config.original_value, configEntry);
        }
        
        // Track canonical types (what things are merged INTO)
        if (config.mapped_to) {
          allCanonicalTypes.set(config.mapped_to, (allCanonicalTypes.get(config.mapped_to) || 0) + 1);
        }
      });

      const { data: emails, error } = await supabase
        .from("load_emails")
        .select("parsed_data, received_at")
        .not("parsed_data", "is", null)
        .order("received_at", { ascending: false })
        .limit(30000);

      if (error) throw error;

      const vehicleTypeCounts: Record<string, number> = {};
      const loadTypeCounts: Record<string, number> = {};

      emails?.forEach((email) => {
        const parsed = email.parsed_data as Record<string, unknown> | null;
        if (!parsed) return;

        const vehicleType = (parsed.vehicle_type || parsed.vehicleType) as string | undefined;
        const loadType = (parsed.load_type || parsed.loadType) as string | undefined;

        if (vehicleType && typeof vehicleType === "string" && vehicleType.trim()) {
          const normalized = vehicleType.trim();
          vehicleTypeCounts[normalized] = (vehicleTypeCounts[normalized] || 0) + 1;
        }

        if (loadType && typeof loadType === "string" && loadType.trim()) {
          const normalized = loadType.trim();
          loadTypeCounts[normalized] = (loadTypeCounts[normalized] || 0) + 1;
        }
      });

      const seenVehicleTypes = getSeenTypes(SEEN_VEHICLE_TYPES_KEY);
      const seenLoadTypes = getSeenTypes(SEEN_LOAD_TYPES_KEY);

      const vehicleEntries: TypeEntry[] = Object.entries(vehicleTypeCounts)
        .map(([value, count]) => {
          const config = vehicleConfigs.get(value);
          const mergedCount = allCanonicalTypes.get(value) || 0;
          return {
            value,
            count,
            isNew: !seenVehicleTypes.has(value),
            isHidden: config ? config.mapped_to === null : false,
            mappedTo: config?.mapped_to || null,
            isCanonical: mergedCount > 0,
            mergedCount,
          };
        })
        .sort((a, b) => b.count - a.count);

      const loadEntries: TypeEntry[] = Object.entries(loadTypeCounts)
        .map(([value, count]) => {
          const config = loadConfigs.get(value);
          const mergedCount = allCanonicalTypes.get(value) || 0;
          return {
            value,
            count,
            isNew: !seenLoadTypes.has(value),
            isHidden: config ? config.mapped_to === null : false,
            mappedTo: config?.mapped_to || null,
            isCanonical: mergedCount > 0,
            mergedCount,
          };
        })
        .sort((a, b) => b.count - a.count);

      setVehicleTypes(vehicleEntries);
      setLoadTypes(loadEntries);
    } catch (error) {
      console.error("Error loading types:", error);
      toast.error("Failed to load Sylectus types");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTypes_data();
  }, []);

  const markAllVehicleTypesSeen = () => {
    const allTypes = new Set(vehicleTypes.map((t) => t.value));
    saveSeenTypes(SEEN_VEHICLE_TYPES_KEY, allTypes);
    setVehicleTypes((prev) => prev.map((t) => ({ ...t, isNew: false })));
    toast.success("All vehicle types marked as seen");
  };

  const markAllLoadTypesSeen = () => {
    const allTypes = new Set(loadTypes.map((t) => t.value));
    saveSeenTypes(SEEN_LOAD_TYPES_KEY, allTypes);
    setLoadTypes((prev) => prev.map((t) => ({ ...t, isNew: false })));
    toast.success("All load types marked as seen");
  };

  const markVehicleTypeSeen = (value: string) => {
    const seenTypes = getSeenTypes(SEEN_VEHICLE_TYPES_KEY);
    seenTypes.add(value);
    saveSeenTypes(SEEN_VEHICLE_TYPES_KEY, seenTypes);
    setVehicleTypes((prev) =>
      prev.map((t) => (t.value === value ? { ...t, isNew: false } : t))
    );
  };

  const markLoadTypeSeen = (value: string) => {
    const seenTypes = getSeenTypes(SEEN_LOAD_TYPES_KEY);
    seenTypes.add(value);
    saveSeenTypes(SEEN_LOAD_TYPES_KEY, seenTypes);
    setLoadTypes((prev) =>
      prev.map((t) => (t.value === value ? { ...t, isNew: false } : t))
    );
  };

  const handleDeleteTypes = async (category: "vehicle" | "load") => {
    const selected = category === "vehicle" ? selectedVehicleTypes : selectedLoadTypes;
    if (selected.size === 0) return;

    try {
      const inserts = [...selected].map((value) => ({
        type_category: category,
        original_value: value,
        mapped_to: null,
      }));

      const { error } = await supabase.from("sylectus_type_config").upsert(inserts, {
        onConflict: "type_category,original_value",
      });

      if (error) throw error;

      if (category === "vehicle") {
        setVehicleTypes((prev) =>
          prev.map((t) => (selected.has(t.value) ? { ...t, isHidden: true } : t))
        );
        setSelectedVehicleTypes(new Set());
      } else {
        setLoadTypes((prev) =>
          prev.map((t) => (selected.has(t.value) ? { ...t, isHidden: true } : t))
        );
        setSelectedLoadTypes(new Set());
      }

      toast.success(`${selected.size} type(s) hidden`);
    } catch (error) {
      console.error("Error hiding types:", error);
      toast.error("Failed to hide types");
    }
  };

  const handleRestoreType = async (category: "vehicle" | "load", value: string) => {
    try {
      const { error } = await supabase
        .from("sylectus_type_config")
        .delete()
        .eq("type_category", category)
        .eq("original_value", value);

      if (error) throw error;

      if (category === "vehicle") {
        setVehicleTypes((prev) =>
          prev.map((t) => (t.value === value ? { ...t, isHidden: false, mappedTo: null } : t))
        );
      } else {
        setLoadTypes((prev) =>
          prev.map((t) => (t.value === value ? { ...t, isHidden: false, mappedTo: null } : t))
        );
      }

      toast.success("Type restored");
    } catch (error) {
      console.error("Error restoring type:", error);
      toast.error("Failed to restore type");
    }
  };

  // Get all selected types across both categories
  const getAllSelectedTypes = (): Array<{ value: string; category: "vehicle" | "load" }> => {
    const all: Array<{ value: string; category: "vehicle" | "load" }> = [];
    selectedVehicleTypes.forEach(v => all.push({ value: v, category: "vehicle" }));
    selectedLoadTypes.forEach(v => all.push({ value: v, category: "load" }));
    return all;
  };

  const totalSelectedCount = selectedVehicleTypes.size + selectedLoadTypes.size;

  const openUnifiedMergeDialog = () => {
    if (totalSelectedCount < 1) {
      toast.error("Select at least 1 type to rename/merge");
      return;
    }
    setMergeTarget("");
    setCustomTargetName("");
    setUseCustomName(totalSelectedCount === 1); // Default to custom name if only 1 selected
    setMergeDialogOpen(true);
  };

  const handleMergeTypes = async () => {
    const effectiveTarget = useCustomName ? customTargetName.trim().toUpperCase() : mergeTarget;
    
    if (!effectiveTarget) {
      toast.error(useCustomName ? "Enter a target name" : "Select a target type");
      return;
    }

    const allSelected = getAllSelectedTypes();
    const toMerge = allSelected.filter((item) => item.value !== effectiveTarget);

    // If using custom name, all selected items get merged
    const itemsToMerge = useCustomName ? allSelected : toMerge;

    if (itemsToMerge.length === 0) {
      toast.error("No items to merge");
      return;
    }

    try {
      // Create inserts for both categories - each selected type maps to the target
      const inserts = itemsToMerge.map((item) => ({
        type_category: item.category,
        original_value: item.value,
        mapped_to: effectiveTarget,
      }));

      const { error } = await supabase.from("sylectus_type_config").upsert(inserts, {
        onConflict: "type_category,original_value",
      });

      if (error) throw error;

      // Update local state for both categories
      const vehicleValuesToMerge = itemsToMerge.filter(t => t.category === "vehicle").map(t => t.value);
      const loadValuesToMerge = itemsToMerge.filter(t => t.category === "load").map(t => t.value);
      const totalMerged = itemsToMerge.length;

      // Update vehicle types - mark merged ones and update canonical target
      setVehicleTypes((prev) =>
        prev.map((t) => {
          if (vehicleValuesToMerge.includes(t.value)) {
            return { ...t, mappedTo: effectiveTarget };
          }
          if (t.value === effectiveTarget) {
            return { ...t, isCanonical: true, mergedCount: t.mergedCount + totalMerged };
          }
          return t;
        })
      );

      // Update load types - mark merged ones and update canonical target
      setLoadTypes((prev) =>
        prev.map((t) => {
          if (loadValuesToMerge.includes(t.value)) {
            return { ...t, mappedTo: effectiveTarget };
          }
          if (t.value === effectiveTarget) {
            return { ...t, isCanonical: true, mergedCount: t.mergedCount + totalMerged };
          }
          return t;
        })
      );

      setSelectedVehicleTypes(new Set());
      setSelectedLoadTypes(new Set());
      setMergeDialogOpen(false);
      toast.success(`${itemsToMerge.length} type(s) merged into "${effectiveTarget}"`);
    } catch (error) {
      console.error("Error merging types:", error);
      toast.error("Failed to merge types");
    }
  };

  const toggleSelection = (category: "vehicle" | "load", value: string) => {
    if (category === "vehicle") {
      setSelectedVehicleTypes((prev) => {
        const next = new Set(prev);
        if (next.has(value)) next.delete(value);
        else next.add(value);
        return next;
      });
    } else {
      setSelectedLoadTypes((prev) => {
        const next = new Set(prev);
        if (next.has(value)) next.delete(value);
        else next.add(value);
        return next;
      });
    }
  };

  const newVehicleCount = vehicleTypes.filter((t) => t.isNew && !t.isHidden && !t.mappedTo).length;
  const newLoadCount = loadTypes.filter((t) => t.isNew && !t.isHidden && !t.mappedTo).length;

  // Unmapped types = types that are not hidden, not mapped to anything, and not canonical (no types mapped TO them)
  const unmappedVehicleTypes = vehicleTypes.filter((t) => !t.isHidden && !t.mappedTo && !t.isCanonical);
  const unmappedLoadTypes = loadTypes.filter((t) => !t.isHidden && !t.mappedTo && !t.isCanonical);
  const totalUnmappedCount = unmappedVehicleTypes.length + unmappedLoadTypes.length;

  const filteredVehicleTypes = showHidden
    ? vehicleTypes
    : vehicleTypes.filter((t) => !t.isHidden && !t.mappedTo);
  const filteredLoadTypes = showHidden
    ? loadTypes
    : loadTypes.filter((t) => !t.isHidden && !t.mappedTo);

  // Unified selected items for merge dialog
  const allSelectedItems = getAllSelectedTypes();

  return (
    <div className="space-y-4">
      {/* Needs Attention Alert */}
      {totalUnmappedCount > 0 && (
        <Alert variant="destructive" className="border-destructive/50 bg-destructive/10">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle className="font-semibold">
            {totalUnmappedCount} Unmapped Type{totalUnmappedCount !== 1 ? 's' : ''} Need Attention
          </AlertTitle>
          <AlertDescription className="text-sm">
            New vehicle or load types detected that haven't been merged into a canonical type. 
            Select them from the tables below and click "Rename" or "Merge" to categorize them.
            <div className="flex gap-4 mt-2 text-xs">
              {unmappedVehicleTypes.length > 0 && (
                <span className="font-medium">{unmappedVehicleTypes.length} vehicle type{unmappedVehicleTypes.length !== 1 ? 's' : ''}</span>
              )}
              {unmappedLoadTypes.length > 0 && (
                <span className="font-medium">{unmappedLoadTypes.length} load type{unmappedLoadTypes.length !== 1 ? 's' : ''}</span>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Load Hunter / Sylectus Configuration</h3>
          <p className="text-sm text-muted-foreground">
            View all vehicle and load types extracted from Sylectus emails
          </p>
        </div>
        <div className="flex items-center gap-2">
          {totalSelectedCount >= 1 && (
            <Button variant="default" size="sm" onClick={openUnifiedMergeDialog}>
              <Merge className="h-4 w-4 mr-1" />
              {totalSelectedCount === 1 ? "Rename" : `Merge (${totalSelectedCount})`}
            </Button>
          )}
          <Button
            variant={showHidden ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowHidden(!showHidden)}
          >
            {showHidden ? "Hide Deleted" : "Show Deleted"}
          </Button>
          <Button variant="outline" size="sm" onClick={loadTypes_data} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Compute canonical types (merge targets) */}
      {(() => {
        const vehicleCanonicalTypes = new Set<string>();
        const loadCanonicalTypes = new Set<string>();
        
        vehicleTypes.forEach(t => {
          if (t.mappedTo) vehicleCanonicalTypes.add(t.mappedTo);
        });
        loadTypes.forEach(t => {
          if (t.mappedTo) loadCanonicalTypes.add(t.mappedTo);
        });

        // Consolidate canonical types by name across both categories
        const allCanonicals = new Set([...vehicleCanonicalTypes, ...loadCanonicalTypes]);
        const canonicalEntries: Array<{ value: string; categories: ('vehicle' | 'load')[]; mappedFrom: string[] }> = [];
        
        allCanonicals.forEach(canonical => {
          const vehicleMapped = vehicleTypes.filter(t => t.mappedTo === canonical).map(t => t.value);
          const loadMapped = loadTypes.filter(t => t.mappedTo === canonical).map(t => t.value);
          const categories: ('vehicle' | 'load')[] = [];
          if (vehicleMapped.length > 0) categories.push('vehicle');
          if (loadMapped.length > 0) categories.push('load');
          canonicalEntries.push({ 
            value: canonical, 
            categories, 
            mappedFrom: [...vehicleMapped, ...loadMapped] 
          });
        });

        const hiddenEntries = [
          ...vehicleTypes.filter(t => t.isHidden).map(t => ({ ...t, category: 'vehicle' as const })),
          ...loadTypes.filter(t => t.isHidden).map(t => ({ ...t, category: 'load' as const }))
        ];

        const totalActiveFilters = canonicalEntries.length + hiddenEntries.length;

        return (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Active Filters */}
            <Card>
              <CardHeader className="py-2 px-3">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">Sylectus Active Filters</CardTitle>
                </div>
                <CardDescription>
                  {totalActiveFilters} active filter{totalActiveFilters !== 1 ? 's' : ''}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[600px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {/* Canonical/Merged Types */}
                      {canonicalEntries.map((entry) => (
                        <TableRow key={`canonical-${entry.value}`}>
                          <TableCell className="font-medium text-sm">
                            <div className="space-y-1">
                              <Badge variant="default" className="text-xs">
                                {entry.value}
                              </Badge>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {entry.mappedFrom.map(mapped => (
                                  <Badge key={mapped} variant="secondary" className="text-xs opacity-70">
                                    {mapped}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {entry.categories.map(cat => (
                                <Badge key={cat} variant="outline" className="text-xs">
                                  {cat === 'vehicle' ? 'Vehicle' : 'Load'}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {entry.mappedFrom.length + 1} combined
                          </TableCell>
                        </TableRow>
                      ))}
                      
                      {/* Hidden Types */}
                      {hiddenEntries.map((type) => (
                        <TableRow key={`hidden-${type.category}-${type.value}`}>
                          <TableCell className="font-medium text-sm">
                            <span className="line-through text-muted-foreground">
                              {type.value}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {type.category === 'vehicle' ? 'Vehicle' : 'Load'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={() => handleRestoreType(type.category, type.value)}
                            >
                              <Undo2 className="h-3 w-3" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}

                      {totalActiveFilters === 0 && (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                            No active filters
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

        {/* Vehicle Types */}
        <Card>
          <CardHeader className="py-2 px-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Truck className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-base">Vehicle Types</CardTitle>
                {newVehicleCount > 0 && (
                  <Badge variant="destructive" className="text-xs">
                    {newVehicleCount} new
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1">
                {selectedVehicleTypes.size > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteTypes("vehicle")}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete ({selectedVehicleTypes.size})
                  </Button>
                )}
                {newVehicleCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={markAllVehicleTypesSeen}>
                    <Check className="h-4 w-4 mr-1" />
                    Mark all seen
                  </Button>
                )}
              </div>
            </div>
            <CardDescription>
              {filteredVehicleTypes.length} unique vehicle types found
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[600px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right w-20">Count</TableHead>
                    <TableHead className="w-16"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredVehicleTypes.map((type) => (
                    <TableRow
                      key={type.value}
                      className={type.isHidden || type.mappedTo ? "opacity-50" : ""}
                    >
                      <TableCell>
                        <Checkbox
                          checked={selectedVehicleTypes.has(type.value)}
                          onCheckedChange={() => toggleSelection("vehicle", type.value)}
                          disabled={type.isHidden || !!type.mappedTo}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={type.isHidden ? "line-through" : ""}>
                            {type.value}
                          </span>
                          {type.isCanonical && !type.isHidden && !type.mappedTo && (
                            <Badge className="text-xs bg-emerald-600 text-white font-medium border-0">
                              ← {type.mergedCount} merged
                            </Badge>
                          )}
                          {!type.isHidden && !type.mappedTo && !type.isCanonical && (
                            <Badge className="text-xs bg-orange-500 text-white font-medium border-0">
                              Unmapped
                            </Badge>
                          )}
                          {type.isHidden && (
                            <Badge variant="outline" className="text-xs font-medium">
                              Hidden
                            </Badge>
                          )}
                          {type.mappedTo && (
                            <Badge className="text-xs bg-blue-500 text-white font-medium border-0">
                              → {type.mappedTo}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {type.count}
                      </TableCell>
                      <TableCell>
                        {(type.isHidden || type.mappedTo) ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => handleRestoreType("vehicle", type.value)}
                          >
                            <Undo2 className="h-3 w-3" />
                          </Button>
                        ) : type.isNew ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => markVehicleTypeSeen(type.value)}
                          >
                            <Check className="h-3 w-3" />
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredVehicleTypes.length === 0 && !loading && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        No vehicle types found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Load Types */}
        <Card>
          <CardHeader className="py-2 px-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-base">Load Types</CardTitle>
                {newLoadCount > 0 && (
                  <Badge variant="destructive" className="text-xs">
                    {newLoadCount} new
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1">
                {selectedLoadTypes.size > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteTypes("load")}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete ({selectedLoadTypes.size})
                  </Button>
                )}
                {newLoadCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={markAllLoadTypesSeen}>
                    <Check className="h-4 w-4 mr-1" />
                    Mark all seen
                  </Button>
                )}
              </div>
            </div>
            <CardDescription>
              {filteredLoadTypes.length} unique load types found
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[600px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right w-20">Count</TableHead>
                    <TableHead className="w-16"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLoadTypes.map((type) => (
                    <TableRow
                      key={type.value}
                      className={type.isHidden || type.mappedTo ? "opacity-50" : ""}
                    >
                      <TableCell>
                        <Checkbox
                          checked={selectedLoadTypes.has(type.value)}
                          onCheckedChange={() => toggleSelection("load", type.value)}
                          disabled={type.isHidden || !!type.mappedTo}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={type.isHidden ? "line-through" : ""}>
                            {type.value}
                          </span>
                          {type.isCanonical && !type.isHidden && !type.mappedTo && (
                            <Badge className="text-xs bg-emerald-600 text-white font-medium border-0">
                              ← {type.mergedCount} merged
                            </Badge>
                          )}
                          {!type.isHidden && !type.mappedTo && !type.isCanonical && (
                            <Badge className="text-xs bg-orange-500 text-white font-medium border-0">
                              Unmapped
                            </Badge>
                          )}
                          {type.isHidden && (
                            <Badge variant="outline" className="text-xs font-medium">
                              Hidden
                            </Badge>
                          )}
                          {type.mappedTo && (
                            <Badge className="text-xs bg-blue-500 text-white font-medium border-0">
                              → {type.mappedTo}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {type.count}
                      </TableCell>
                      <TableCell>
                        {(type.isHidden || type.mappedTo) ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => handleRestoreType("load", type.value)}
                          >
                            <Undo2 className="h-3 w-3" />
                          </Button>
                        ) : type.isNew ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => markLoadTypeSeen(type.value)}
                          >
                            <Check className="h-3 w-3" />
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredLoadTypes.length === 0 && !loading && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        No load types found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
          </div>
        );
      })()}

      {/* Merge/Rename Dialog */}
      <Dialog open={mergeDialogOpen} onOpenChange={setMergeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{totalSelectedCount === 1 ? "Rename Type" : "Merge Types"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {totalSelectedCount > 1 && (
              <div className="flex items-center gap-4">
                <Button
                  variant={!useCustomName ? "default" : "outline"}
                  size="sm"
                  onClick={() => setUseCustomName(false)}
                >
                  Use Existing
                </Button>
                <Button
                  variant={useCustomName ? "default" : "outline"}
                  size="sm"
                  onClick={() => setUseCustomName(true)}
                >
                  Custom Name
                </Button>
              </div>
            )}
            
            {useCustomName ? (
              <div className="space-y-2">
                <Label htmlFor="customName">Enter canonical name (will be uppercased)</Label>
                <Input
                  id="customName"
                  value={customTargetName}
                  onChange={(e) => setCustomTargetName(e.target.value)}
                  placeholder="e.g., SPRINTER"
                />
                <p className="text-xs text-muted-foreground">
                  {allSelectedItems.length} type(s) will be mapped to "{customTargetName.trim().toUpperCase() || "..."}".
                </p>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Select the target type to merge the selected types into:
                </p>
                <Select value={mergeTarget} onValueChange={setMergeTarget}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select target type" />
                  </SelectTrigger>
                  <SelectContent>
                    {allSelectedItems.map((item) => (
                      <SelectItem key={`${item.category}-${item.value}`} value={item.value}>
                        {item.value} <span className="text-muted-foreground text-xs ml-1">({item.category})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {allSelectedItems.length - (mergeTarget ? 1 : 0)} type(s) will be merged into the selected target.
                </p>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleMergeTypes} 
              disabled={useCustomName ? !customTargetName.trim() : !mergeTarget}
            >
              {useCustomName ? "Save" : "Merge Types"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
