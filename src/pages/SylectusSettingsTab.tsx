import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Check, RefreshCw, Truck, Package, Trash2, Merge, Undo2 } from "lucide-react";

interface TypeEntry {
  value: string;
  count: number;
  isNew: boolean;
  isHidden: boolean;
  mappedTo: string | null;
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

      typeConfigs?.forEach((config) => {
        const configEntry = { original_value: config.original_value, mapped_to: config.mapped_to };
        if (config.type_category === "vehicle") {
          vehicleConfigs.set(config.original_value, configEntry);
        } else {
          loadConfigs.set(config.original_value, configEntry);
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
          return {
            value,
            count,
            isNew: !seenVehicleTypes.has(value),
            isHidden: config ? config.mapped_to === null : false,
            mappedTo: config?.mapped_to || null,
          };
        })
        .sort((a, b) => b.count - a.count);

      const loadEntries: TypeEntry[] = Object.entries(loadTypeCounts)
        .map(([value, count]) => {
          const config = loadConfigs.get(value);
          return {
            value,
            count,
            isNew: !seenLoadTypes.has(value),
            isHidden: config ? config.mapped_to === null : false,
            mappedTo: config?.mapped_to || null,
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

  const openMergeDialog = (category: "vehicle" | "load") => {
    const selected = category === "vehicle" ? selectedVehicleTypes : selectedLoadTypes;
    if (selected.size < 2) {
      toast.error("Select at least 2 types to merge");
      return;
    }
    setMergeCategory(category);
    setMergeTarget("");
    setMergeDialogOpen(true);
  };

  const handleMergeTypes = async () => {
    if (!mergeTarget) {
      toast.error("Select a target type");
      return;
    }

    const selected = mergeCategory === "vehicle" ? selectedVehicleTypes : selectedLoadTypes;
    const toMerge = [...selected].filter((v) => v !== mergeTarget);

    try {
      const inserts = toMerge.map((value) => ({
        type_category: mergeCategory,
        original_value: value,
        mapped_to: mergeTarget,
      }));

      const { error } = await supabase.from("sylectus_type_config").upsert(inserts, {
        onConflict: "type_category,original_value",
      });

      if (error) throw error;

      if (mergeCategory === "vehicle") {
        setVehicleTypes((prev) =>
          prev.map((t) => (toMerge.includes(t.value) ? { ...t, mappedTo: mergeTarget } : t))
        );
        setSelectedVehicleTypes(new Set());
      } else {
        setLoadTypes((prev) =>
          prev.map((t) => (toMerge.includes(t.value) ? { ...t, mappedTo: mergeTarget } : t))
        );
        setSelectedLoadTypes(new Set());
      }

      setMergeDialogOpen(false);
      toast.success(`${toMerge.length} type(s) merged into "${mergeTarget}"`);
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

  const filteredVehicleTypes = showHidden
    ? vehicleTypes
    : vehicleTypes.filter((t) => !t.isHidden && !t.mappedTo);
  const filteredLoadTypes = showHidden
    ? loadTypes
    : loadTypes.filter((t) => !t.isHidden && !t.mappedTo);

  const selectedItems = mergeCategory === "vehicle" ? selectedVehicleTypes : selectedLoadTypes;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Load Hunter / Sylectus Configuration</h3>
          <p className="text-sm text-muted-foreground">
            View all vehicle and load types extracted from Sylectus emails
          </p>
        </div>
        <div className="flex items-center gap-2">
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

        const canonicalEntries: Array<{ value: string; category: 'vehicle' | 'load'; mappedFrom: string[] }> = [];
        
        vehicleCanonicalTypes.forEach(canonical => {
          const mappedFrom = vehicleTypes.filter(t => t.mappedTo === canonical).map(t => t.value);
          canonicalEntries.push({ value: canonical, category: 'vehicle', mappedFrom });
        });
        
        loadCanonicalTypes.forEach(canonical => {
          const mappedFrom = loadTypes.filter(t => t.mappedTo === canonical).map(t => t.value);
          canonicalEntries.push({ value: canonical, category: 'load', mappedFrom });
        });

        const hiddenEntries = [
          ...vehicleTypes.filter(t => t.isHidden).map(t => ({ ...t, category: 'vehicle' as const })),
          ...loadTypes.filter(t => t.isHidden).map(t => ({ ...t, category: 'load' as const }))
        ];

        return (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Active Filters */}
            <Card>
              <CardHeader className="py-2 px-3">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">Sylectus Active Filters</CardTitle>
                </div>
                <CardDescription>
                  {canonicalEntries.length} canonical types, {hiddenEntries.length} hidden
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[600px] overflow-y-auto">
                  {/* Canonical Types Section */}
                  {canonicalEntries.length > 0 && (
                    <div className="border-b">
                      <div className="px-3 py-2 bg-muted/50">
                        <span className="text-xs font-medium text-muted-foreground">CANONICAL TYPES (for Hunt Plans)</span>
                      </div>
                      <Table>
                        <TableBody>
                          {canonicalEntries.map((entry) => (
                            <TableRow key={`canonical-${entry.category}-${entry.value}`}>
                              <TableCell className="font-medium text-sm">
                                <div className="flex items-center gap-2">
                                  <Badge variant="default" className="text-xs">
                                    {entry.value}
                                  </Badge>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs">
                                  {entry.category === 'vehicle' ? 'Vehicle' : 'Load'}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                ← {entry.mappedFrom.length} merged
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                  
                  {/* Hidden Types Section */}
                  {hiddenEntries.length > 0 && (
                    <div>
                      <div className="px-3 py-2 bg-muted/50">
                        <span className="text-xs font-medium text-muted-foreground">HIDDEN TYPES</span>
                      </div>
                      <Table>
                        <TableBody>
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
                        </TableBody>
                      </Table>
                    </div>
                  )}

                  {canonicalEntries.length === 0 && hiddenEntries.length === 0 && (
                    <div className="text-center text-muted-foreground py-8">
                      No active filters
                    </div>
                  )}
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
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteTypes("vehicle")}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete ({selectedVehicleTypes.size})
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openMergeDialog("vehicle")}>
                      <Merge className="h-4 w-4 mr-1" />
                      Merge
                    </Button>
                  </>
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
                          {type.isNew && !type.isHidden && !type.mappedTo && (
                            <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700">
                              NEW
                            </Badge>
                          )}
                          {type.isHidden && (
                            <Badge variant="outline" className="text-xs">
                              Hidden
                            </Badge>
                          )}
                          {type.mappedTo && (
                            <Badge variant="outline" className="text-xs">
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
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteTypes("load")}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete ({selectedLoadTypes.size})
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openMergeDialog("load")}>
                      <Merge className="h-4 w-4 mr-1" />
                      Merge
                    </Button>
                  </>
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
                          {type.isNew && !type.isHidden && !type.mappedTo && (
                            <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700">
                              NEW
                            </Badge>
                          )}
                          {type.isHidden && (
                            <Badge variant="outline" className="text-xs">
                              Hidden
                            </Badge>
                          )}
                          {type.mappedTo && (
                            <Badge variant="outline" className="text-xs">
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

      {/* Merge Dialog */}
      <Dialog open={mergeDialogOpen} onOpenChange={setMergeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge {mergeCategory === "vehicle" ? "Vehicle" : "Load"} Types</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Select the target type to merge the selected types into:
            </p>
            <Select value={mergeTarget} onValueChange={setMergeTarget}>
              <SelectTrigger>
                <SelectValue placeholder="Select target type" />
              </SelectTrigger>
              <SelectContent>
                {[...selectedItems].map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {selectedItems.size - (mergeTarget ? 1 : 0)} type(s) will be merged into the selected target.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleMergeTypes} disabled={!mergeTarget}>
              Merge Types
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
