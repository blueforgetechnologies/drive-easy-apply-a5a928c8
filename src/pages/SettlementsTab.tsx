import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { Search, Plus, FileText, DollarSign, CheckCircle } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useTenantFilter } from "@/hooks/useTenantFilter";
import { useAccountingCounts } from "@/hooks/useAccountingCounts";

interface Settlement {
  id: string;
  settlement_number: string;
  driver_id: string;
  payee_id: string | null;
  period_start: string;
  period_end: string;
  status: string;
  total_loads: number;
  total_miles: number;
  base_rate: number;
  gross_pay: number;
  total_deductions: number;
  net_pay: number;
  payment_date: string | null;
  created_at: string;
}

interface Driver {
  id: string;
  personal_info: any;
  pay_method: string;
  pay_per_mile: number;
  weekly_salary: number;
}

export default function SettlementsTab() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { tenantId, shouldFilter } = useTenantFilter();
  const { settlementsByStatus } = useAccountingCounts();
  const filter = searchParams.get("filter") || "pending";
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [formData, setFormData] = useState({
    driver_id: "",
    period_start: "",
    period_end: "",
    fuel_advance: "0",
    equipment_lease: "0",
    insurance_deduction: "0",
    maintenance_deduction: "0",
    other_deductions: "0",
    notes: "",
  });

  useEffect(() => {
    loadData();
    loadDrivers();
  }, [filter, tenantId, shouldFilter]);

  const loadData = async () => {
    if (shouldFilter && !tenantId) return;
    
    setLoading(true);
    try {
      let query = supabase
        .from("settlements" as any)
        .select("*")
        .eq("status", filter)
        .order("created_at", { ascending: false });
      
      if (shouldFilter && tenantId) {
        query = query.eq("tenant_id", tenantId);
      }

      const { data, error } = await query;

      if (error) throw error;
      setSettlements((data as any) || []);
    } catch (error) {
      toast.error("Error loading settlements");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const loadDrivers = async () => {
    if (shouldFilter && !tenantId) return;
    
    try {
      let query = supabase
        .from("applications" as any)
        .select("id, personal_info, pay_method, pay_per_mile, weekly_salary")
        .eq("driver_status", "active");
      
      if (shouldFilter && tenantId) {
        query = query.eq("tenant_id", tenantId);
      }

      const { data, error } = await query;

      if (error) throw error;
      setDrivers((data as any) || []);
    } catch (error) {
      console.error("Error loading drivers:", error);
    }
  };

  const calculateSettlement = async () => {
    if (!formData.driver_id || !formData.period_start || !formData.period_end) {
      toast.error("Please select driver and date range");
      return;
    }

    setCalculating(true);
    try {
      // Get driver info
      const driver = drivers.find(d => d.id === formData.driver_id);
      if (!driver) throw new Error("Driver not found");

      // Fetch completed loads for the driver in the period
      const { data: loads, error: loadsError } = await supabase
        .from("loads" as any)
        .select("*")
        .eq("assigned_driver_id", formData.driver_id)
        .eq("status", "completed")
        .gte("completed_at", formData.period_start)
        .lte("completed_at", formData.period_end);

      if (loadsError) throw loadsError;

      if (!loads || loads.length === 0) {
        toast.error("No completed loads found for this period");
        setCalculating(false);
        return;
      }

      // Calculate totals
      const totalMiles = loads.reduce((sum: number, load: any) => sum + (load.actual_miles || 0), 0);
      const totalLoads = loads.length;
      
      let grossPay = 0;
      if (driver.pay_method === "per_mile") {
        grossPay = totalMiles * (driver.pay_per_mile || 0);
      } else if (driver.pay_method === "salary") {
        grossPay = driver.weekly_salary || 0;
      } else {
        // Percentage of revenue or other methods - sum up load rates
        grossPay = loads.reduce((sum: number, load: any) => sum + (load.rate || 0), 0);
      }

      // Calculate deductions
      const totalDeductions = 
        parseFloat(formData.fuel_advance) +
        parseFloat(formData.equipment_lease) +
        parseFloat(formData.insurance_deduction) +
        parseFloat(formData.maintenance_deduction) +
        parseFloat(formData.other_deductions);

      const netPay = grossPay - totalDeductions;

      // Create settlement
      const settlementData = {
        settlement_number: `SET${Date.now()}`,
        driver_id: formData.driver_id,
        period_start: formData.period_start,
        period_end: formData.period_end,
        status: "pending",
        total_loads: totalLoads,
        total_miles: totalMiles,
        base_rate: driver.pay_per_mile || driver.weekly_salary || 0,
        gross_pay: grossPay,
        fuel_advance: parseFloat(formData.fuel_advance),
        equipment_lease: parseFloat(formData.equipment_lease),
        insurance_deduction: parseFloat(formData.insurance_deduction),
        maintenance_deduction: parseFloat(formData.maintenance_deduction),
        other_deductions: parseFloat(formData.other_deductions),
        total_deductions: totalDeductions,
        net_pay: netPay,
        notes: formData.notes,
      };

      const { data: settlement, error: settlementError } = await supabase
        .from("settlements" as any)
        .insert(settlementData)
        .select()
        .single();

      if (settlementError) throw settlementError;

      const settlementId = (settlement as any)?.id;
      if (settlementId) {
        // Create settlement_loads entries
        const settlementLoads = loads.map((load: any) => ({
          settlement_id: settlementId,
          load_id: load.id,
          miles: load.actual_miles || 0,
          rate: load.rate || 0,
          driver_pay: driver.pay_method === "per_mile" 
            ? (load.actual_miles || 0) * (driver.pay_per_mile || 0)
            : (load.rate || 0),
        }));

        const { error: loadsInsertError } = await supabase
          .from("settlement_loads" as any)
          .insert(settlementLoads);

        if (loadsInsertError) throw loadsInsertError;
      }

      toast.success("Settlement created successfully");
      setDialogOpen(false);
      resetForm();
      loadData();
    } catch (error: any) {
      toast.error("Failed to create settlement: " + error.message);
    } finally {
      setCalculating(false);
    }
  };

  const resetForm = () => {
    setFormData({
      driver_id: "",
      period_start: "",
      period_end: "",
      fuel_advance: "0",
      equipment_lease: "0",
      insurance_deduction: "0",
      maintenance_deduction: "0",
      other_deductions: "0",
      notes: "",
    });
  };

  const viewSettlementDetail = (id: string) => {
    navigate(`/dashboard/settlement/${id}`);
  };

  const handleApprove = async (id: string) => {
    try {
      const { error } = await supabase
        .from("settlements" as any)
        .update({
          status: "approved",
          approved_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) throw error;
      toast.success("Settlement approved");
      loadData();
    } catch (error: any) {
      toast.error("Failed to approve settlement: " + error.message);
    }
  };

  const getStatusBadge = (status: string) => {
    const configs: Record<string, { label: string; className: string }> = {
      pending: { label: "Pending", className: "bg-yellow-500 hover:bg-yellow-600" },
      approved: { label: "Approved", className: "bg-green-600 hover:bg-green-700" },
      paid: { label: "Paid", className: "bg-green-800 hover:bg-green-900" },
      cancelled: { label: "Cancelled", className: "bg-red-500 hover:bg-red-600" },
    };
    const config = configs[status] || configs.pending;
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  const filteredSettlements = settlements.filter((settlement) => {
    const searchLower = searchQuery.toLowerCase();
    return settlement.settlement_number.toLowerCase().includes(searchLower);
  });

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <div /> {/* Spacer for alignment */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Create Settlement
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Settlement</DialogTitle>
            </DialogHeader>
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="driver">Driver</Label>
                  <Select value={formData.driver_id} onValueChange={(value) => setFormData({ ...formData, driver_id: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select driver" />
                    </SelectTrigger>
                    <SelectContent>
                      {drivers.map((driver) => (
                        <SelectItem key={driver.id} value={driver.id}>
                          {driver.personal_info?.firstName} {driver.personal_info?.lastName} 
                          ({driver.pay_method === "per_mile" ? `$${driver.pay_per_mile}/mi` : `$${driver.weekly_salary}/wk`})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="period_start">Period Start</Label>
                  <Input
                    id="period_start"
                    type="date"
                    value={formData.period_start}
                    onChange={(e) => setFormData({ ...formData, period_start: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="period_end">Period End</Label>
                  <Input
                    id="period_end"
                    type="date"
                    value={formData.period_end}
                    onChange={(e) => setFormData({ ...formData, period_end: e.target.value })}
                  />
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Deductions
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="fuel_advance">Fuel Advance ($)</Label>
                    <Input
                      id="fuel_advance"
                      type="number"
                      step="0.01"
                      value={formData.fuel_advance}
                      onChange={(e) => setFormData({ ...formData, fuel_advance: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="equipment_lease">Equipment Lease ($)</Label>
                    <Input
                      id="equipment_lease"
                      type="number"
                      step="0.01"
                      value={formData.equipment_lease}
                      onChange={(e) => setFormData({ ...formData, equipment_lease: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="insurance_deduction">Insurance ($)</Label>
                    <Input
                      id="insurance_deduction"
                      type="number"
                      step="0.01"
                      value={formData.insurance_deduction}
                      onChange={(e) => setFormData({ ...formData, insurance_deduction: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="maintenance_deduction">Maintenance ($)</Label>
                    <Input
                      id="maintenance_deduction"
                      type="number"
                      step="0.01"
                      value={formData.maintenance_deduction}
                      onChange={(e) => setFormData({ ...formData, maintenance_deduction: e.target.value })}
                    />
                  </div>
                  <div className="col-span-2">
                    <Label htmlFor="other_deductions">Other Deductions ($)</Label>
                    <Input
                      id="other_deductions"
                      type="number"
                      step="0.01"
                      value={formData.other_deductions}
                      onChange={(e) => setFormData({ ...formData, other_deductions: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div>
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">
                  Cancel
                </Button>
                <Button onClick={calculateSettlement} disabled={calculating} className="flex-1">
                  {calculating ? "Calculating..." : "Calculate & Create"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex items-center gap-0">
          {[
            { key: "pending", label: "Pending", activeClass: "btn-glossy-warning", activeBadgeClass: "badge-inset-warning", softBadgeClass: "badge-inset-soft-orange" },
            { key: "approved", label: "Approved", activeClass: "btn-glossy-success", activeBadgeClass: "badge-inset-success", softBadgeClass: "badge-inset-soft-green" },
            { key: "paid", label: "Paid", activeClass: "btn-glossy-success", activeBadgeClass: "badge-inset-success", softBadgeClass: "badge-inset-soft-green" },
          ].map((status) => (
            <Button
              key={status.key}
              variant="ghost"
              size="sm"
              onClick={() => {
                const next = new URLSearchParams(searchParams);
                next.set("filter", status.key);
                setSearchParams(next);
                setSearchQuery("");
              }}
              className={`h-[28px] px-3 text-[12px] font-medium gap-1.5 rounded-none first:rounded-l-full last:rounded-r-full border-0 ${
                filter === status.key 
                  ? `${status.activeClass} text-white` 
                  : 'btn-glossy text-gray-700'
              }`}
            >
              {status.label}
              <span className={`${filter === status.key ? status.activeBadgeClass : status.softBadgeClass} text-[10px] h-5`}>
                {settlementsByStatus[status.key as keyof typeof settlementsByStatus]}
              </span>
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            {filteredSettlements.length} settlements
          </Badge>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search settlements..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-8"
            />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-l-4 border-l-primary border-b-0 bg-background">
              <TableHead className="text-primary font-medium uppercase text-xs">Settlement #</TableHead>
              <TableHead className="text-primary font-medium uppercase text-xs">Period</TableHead>
              <TableHead className="text-primary font-medium uppercase text-xs">Loads</TableHead>
              <TableHead className="text-primary font-medium uppercase text-xs">Miles</TableHead>
              <TableHead className="text-primary font-medium uppercase text-xs">Gross Pay</TableHead>
              <TableHead className="text-primary font-medium uppercase text-xs">Deductions</TableHead>
              <TableHead className="text-primary font-medium uppercase text-xs">Net Pay</TableHead>
              <TableHead className="text-primary font-medium uppercase text-xs">Status</TableHead>
              <TableHead className="text-primary font-medium uppercase text-xs">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredSettlements.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-12 text-center">
                  <div className="flex flex-col items-center justify-center text-muted-foreground">
                    <DollarSign className="h-10 w-10 mb-3 opacity-50" />
                    <p className="text-base font-medium">No {filter} settlements</p>
                    <p className="text-sm">{searchQuery ? "No settlements match your search" : `${filter.charAt(0).toUpperCase() + filter.slice(1)} settlements will appear here`}</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredSettlements.map((settlement) => (
                <TableRow key={settlement.id} className="cursor-pointer hover:bg-muted/50" onClick={() => viewSettlementDetail(settlement.id)}>
                      <TableCell className="font-medium">{settlement.settlement_number}</TableCell>
                      <TableCell>
                        {format(new Date(settlement.period_start), "MM/dd")} - {format(new Date(settlement.period_end), "MM/dd/yyyy")}
                      </TableCell>
                      <TableCell>{settlement.total_loads || 0}</TableCell>
                      <TableCell>{settlement.total_miles || 0}</TableCell>
                      <TableCell>${settlement.gross_pay?.toFixed(2) || "0.00"}</TableCell>
                      <TableCell className="text-red-600">${settlement.total_deductions?.toFixed(2) || "0.00"}</TableCell>
                      <TableCell className="font-semibold">${settlement.net_pay?.toFixed(2) || "0.00"}</TableCell>
                      <TableCell>{getStatusBadge(settlement.status)}</TableCell>
                      <TableCell>
                        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                          {settlement.status === "pending" && (
                            <Button size="sm" variant="outline" onClick={() => handleApprove(settlement.id)}>
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                          )}
                          <Button size="sm" variant="outline" onClick={() => viewSettlementDetail(settlement.id)}>
                            <FileText className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
