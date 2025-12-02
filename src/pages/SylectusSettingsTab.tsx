import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Check, RefreshCw, Truck, Package } from "lucide-react";

interface TypeEntry {
  value: string;
  count: number;
  isNew: boolean;
}

const SEEN_VEHICLE_TYPES_KEY = "sylectus_seen_vehicle_types";
const SEEN_LOAD_TYPES_KEY = "sylectus_seen_load_types";

export default function SylectusSettingsTab() {
  const [vehicleTypes, setVehicleTypes] = useState<TypeEntry[]>([]);
  const [loadTypes, setLoadTypes] = useState<TypeEntry[]>([]);
  const [loading, setLoading] = useState(true);

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
      const { data: emails, error } = await supabase
        .from("load_emails")
        .select("parsed_data")
        .not("parsed_data", "is", null);

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
        .map(([value, count]) => ({
          value,
          count,
          isNew: !seenVehicleTypes.has(value),
        }))
        .sort((a, b) => b.count - a.count);

      const loadEntries: TypeEntry[] = Object.entries(loadTypeCounts)
        .map(([value, count]) => ({
          value,
          count,
          isNew: !seenLoadTypes.has(value),
        }))
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

  const newVehicleCount = vehicleTypes.filter((t) => t.isNew).length;
  const newLoadCount = loadTypes.filter((t) => t.isNew).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Load Hunter / Sylectus Configuration</h3>
          <p className="text-sm text-muted-foreground">
            View all vehicle and load types extracted from Sylectus emails
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadTypes_data} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Vehicle Types */}
        <Card>
          <CardHeader className="pb-3">
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
              {newVehicleCount > 0 && (
                <Button variant="ghost" size="sm" onClick={markAllVehicleTypesSeen}>
                  <Check className="h-4 w-4 mr-1" />
                  Mark all seen
                </Button>
              )}
            </div>
            <CardDescription>
              {vehicleTypes.length} unique vehicle types found
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right w-20">Count</TableHead>
                    <TableHead className="w-16"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vehicleTypes.map((type) => (
                    <TableRow key={type.value}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {type.value}
                          {type.isNew && (
                            <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700">
                              NEW
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {type.count}
                      </TableCell>
                      <TableCell>
                        {type.isNew && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => markVehicleTypeSeen(type.value)}
                          >
                            <Check className="h-3 w-3" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {vehicleTypes.length === 0 && !loading && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
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
          <CardHeader className="pb-3">
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
              {newLoadCount > 0 && (
                <Button variant="ghost" size="sm" onClick={markAllLoadTypesSeen}>
                  <Check className="h-4 w-4 mr-1" />
                  Mark all seen
                </Button>
              )}
            </div>
            <CardDescription>
              {loadTypes.length} unique load types found
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right w-20">Count</TableHead>
                    <TableHead className="w-16"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadTypes.map((type) => (
                    <TableRow key={type.value}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {type.value}
                          {type.isNew && (
                            <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700">
                              NEW
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {type.count}
                      </TableCell>
                      <TableCell>
                        {type.isNew && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => markLoadTypeSeen(type.value)}
                          >
                            <Check className="h-3 w-3" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {loadTypes.length === 0 && !loading && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
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
    </div>
  );
}
