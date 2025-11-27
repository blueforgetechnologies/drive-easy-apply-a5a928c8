import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
import { ArrowLeft, FileText, DollarSign, CheckCircle, XCircle, Download } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface SettlementLoad {
  id: string;
  load_id: string;
  miles: number;
  rate: number;
  driver_pay: number;
}

export default function SettlementDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [settlement, setSettlement] = useState<any>(null);
  const [driver, setDriver] = useState<any>(null);
  const [loads, setLoads] = useState<SettlementLoad[]>([]);
  const [loadDetails, setLoadDetails] = useState<any[]>([]);

  useEffect(() => {
    if (id) {
      loadData();
    }
  }, [id]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load settlement
      const { data: settlementData, error: settlementError } = await supabase
        .from("settlements" as any)
        .select("*")
        .eq("id", id)
        .single();

      if (settlementError) throw settlementError;
      setSettlement(settlementData);

      // Load driver info
      if (settlementData && (settlementData as any).driver_id) {
        const { data: driverData } = await supabase
          .from("applications" as any)
          .select("personal_info, pay_method, pay_per_mile, weekly_salary")
          .eq("id", (settlementData as any).driver_id)
          .single();
        setDriver(driverData);
      }

      // Load settlement loads
      const { data: loadsData } = await supabase
        .from("settlement_loads" as any)
        .select("*")
        .eq("settlement_id", id);
      setLoads((loadsData as any) || []);

      // Load load details for each settlement load
      if (loadsData && loadsData.length > 0) {
        const loadIds = loadsData.map((l: any) => l.load_id);
        const { data: loadDetailsData } = await supabase
          .from("loads" as any)
          .select("id, load_number, pickup_location, delivery_location, actual_miles, rate")
          .in("id", loadIds);
        setLoadDetails((loadDetailsData as any) || []);
      }
    } catch (error: any) {
      toast.error("Error loading settlement details");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
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

  const handleMarkPaid = async () => {
    try {
      const { error } = await supabase
        .from("settlements" as any)
        .update({
          status: "paid",
          payment_date: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) throw error;
      toast.success("Settlement marked as paid");
      loadData();
    } catch (error: any) {
      toast.error("Failed to mark as paid: " + error.message);
    }
  };

  const handleCancel = async () => {
    try {
      const { error } = await supabase
        .from("settlements" as any)
        .update({
          status: "cancelled",
        })
        .eq("id", id);

      if (error) throw error;
      toast.success("Settlement cancelled");
      loadData();
    } catch (error: any) {
      toast.error("Failed to cancel settlement: " + error.message);
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

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  if (!settlement) {
    return <div className="text-center py-8">Settlement not found</div>;
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" onClick={() => navigate("/dashboard/settlements")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Settlement {settlement.settlement_number}</h1>
              <p className="text-muted-foreground">
                {driver ? `${driver.personal_info?.firstName} ${driver.personal_info?.lastName}` : "Driver"}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {settlement.status === "pending" && (
              <>
                <Button onClick={handleApprove} className="gap-2">
                  <CheckCircle className="h-4 w-4" />
                  Approve
                </Button>
                <Button variant="outline" onClick={handleCancel} className="gap-2">
                  <XCircle className="h-4 w-4" />
                  Cancel
                </Button>
              </>
            )}
            {settlement.status === "approved" && (
              <Button onClick={handleMarkPaid} className="gap-2">
                <DollarSign className="h-4 w-4" />
                Mark as Paid
              </Button>
            )}
            <Button variant="outline" className="gap-2">
              <Download className="h-4 w-4" />
              Download Statement
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Settlement Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Settlement Summary</span>
                  {getStatusBadge(settlement.status)}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Period Start</p>
                    <p className="font-medium">{format(new Date(settlement.period_start), "MMM d, yyyy")}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Period End</p>
                    <p className="font-medium">{format(new Date(settlement.period_end), "MMM d, yyyy")}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Loads</p>
                    <p className="font-medium">{settlement.total_loads || 0}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Miles</p>
                    <p className="font-medium">{settlement.total_miles || 0}</p>
                  </div>
                </div>

                {settlement.notes && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-sm text-muted-foreground mb-2">Notes</p>
                      <p className="text-sm">{settlement.notes}</p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Load Details */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Load Details
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loads.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4">No loads found</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Load #</TableHead>
                        <TableHead>Route</TableHead>
                        <TableHead>Miles</TableHead>
                        <TableHead>Rate</TableHead>
                        <TableHead>Driver Pay</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loads.map((load) => {
                        const detail = loadDetails.find(d => d.id === load.load_id);
                        return (
                          <TableRow key={load.id}>
                            <TableCell className="font-medium">{detail?.load_number || "N/A"}</TableCell>
                            <TableCell>
                              {detail ? `${detail.pickup_location} → ${detail.delivery_location}` : "N/A"}
                            </TableCell>
                            <TableCell>{load.miles}</TableCell>
                            <TableCell>${load.rate?.toFixed(2)}</TableCell>
                            <TableCell className="font-medium">${load.driver_pay?.toFixed(2)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar - Financial Summary */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <DollarSign className="h-4 w-4" />
                  Financial Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">Base Rate</p>
                  <p className="text-lg font-medium">
                    {driver?.pay_method === "per_mile" 
                      ? `$${settlement.base_rate}/mile` 
                      : `$${settlement.base_rate}/week`}
                  </p>
                </div>

                <Separator />

                <div>
                  <p className="text-sm text-muted-foreground mb-2">Gross Pay</p>
                  <p className="text-2xl font-bold text-green-600">${settlement.gross_pay?.toFixed(2) || "0.00"}</p>
                </div>

                <Separator />

                <div className="space-y-2">
                  <p className="text-sm font-semibold">Deductions</p>
                  {settlement.fuel_advance > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Fuel Advance</span>
                      <span className="text-red-600">-${settlement.fuel_advance?.toFixed(2)}</span>
                    </div>
                  )}
                  {settlement.equipment_lease > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Equipment Lease</span>
                      <span className="text-red-600">-${settlement.equipment_lease?.toFixed(2)}</span>
                    </div>
                  )}
                  {settlement.insurance_deduction > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Insurance</span>
                      <span className="text-red-600">-${settlement.insurance_deduction?.toFixed(2)}</span>
                    </div>
                  )}
                  {settlement.maintenance_deduction > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Maintenance</span>
                      <span className="text-red-600">-${settlement.maintenance_deduction?.toFixed(2)}</span>
                    </div>
                  )}
                  {settlement.other_deductions > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Other</span>
                      <span className="text-red-600">-${settlement.other_deductions?.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-medium pt-2 border-t">
                    <span>Total Deductions</span>
                    <span className="text-red-600">-${settlement.total_deductions?.toFixed(2)}</span>
                  </div>
                </div>

                <Separator />

                <div>
                  <p className="text-sm text-muted-foreground mb-2">Net Pay</p>
                  <p className="text-3xl font-bold text-green-700">${settlement.net_pay?.toFixed(2) || "0.00"}</p>
                </div>

                {settlement.payment_date && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-sm text-muted-foreground">Payment Date</p>
                      <p className="font-medium">{format(new Date(settlement.payment_date), "MMM d, yyyy")}</p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
