import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, FileCheck, DollarSign, Truck, Calendar, MapPin } from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";

export default function ReadyForAuditTab() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");

  const { data: loads, isLoading } = useQuery({
    queryKey: ["ready-for-audit-loads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loads")
        .select(`
          *,
          customers(name),
          vehicles(vehicle_number),
          dispatchers:assigned_dispatcher_id(first_name, last_name)
        `)
        .eq("status", "ready_for_audit")
        .order("completed_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const filteredLoads = loads?.filter((load) => {
    const search = searchTerm.toLowerCase();
    return (
      load.load_number?.toLowerCase().includes(search) ||
      load.customers?.name?.toLowerCase().includes(search) ||
      load.pickup_city?.toLowerCase().includes(search) ||
      load.delivery_city?.toLowerCase().includes(search) ||
      load.reference_number?.toLowerCase().includes(search)
    );
  });

  const formatCurrency = (amount: number | null) => {
    if (!amount) return "-";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const formatDate = (date: string | null) => {
    if (!date) return "-";
    return format(new Date(date), "MMM d, yyyy");
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full max-w-sm" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-2">
          <FileCheck className="h-5 w-5 text-cyan-600" />
          <h3 className="text-lg font-semibold">Loads Ready for Audit</h3>
          <Badge variant="secondary" className="bg-cyan-100 text-cyan-700">
            {filteredLoads?.length || 0}
          </Badge>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search loads..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {filteredLoads?.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <FileCheck className="h-12 w-12 mb-4 opacity-50" />
          <p className="text-lg font-medium">No loads ready for audit</p>
          <p className="text-sm">Loads marked as "Ready for Audit" will appear here</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Load #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Route</TableHead>
                <TableHead>Completed</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLoads?.map((load) => (
                <TableRow 
                  key={load.id} 
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => navigate(`/dashboard/loads/${load.id}`)}
                >
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <Truck className="h-4 w-4 text-muted-foreground" />
                      {load.load_number}
                    </div>
                  </TableCell>
                  <TableCell>{load.customers?.name || "-"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-sm">
                      <MapPin className="h-3 w-3 text-muted-foreground" />
                      <span>{load.pickup_city}, {load.pickup_state}</span>
                      <span className="text-muted-foreground">→</span>
                      <span>{load.delivery_city}, {load.delivery_state}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-sm">
                      <Calendar className="h-3 w-3 text-muted-foreground" />
                      {formatDate(load.completed_at)}
                    </div>
                  </TableCell>
                  <TableCell>{load.vehicles?.vehicle_number || "-"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <DollarSign className="h-3 w-3 text-muted-foreground" />
                      {formatCurrency(load.rate)}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/dashboard/loads/${load.id}`);
                      }}
                    >
                      Review
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
