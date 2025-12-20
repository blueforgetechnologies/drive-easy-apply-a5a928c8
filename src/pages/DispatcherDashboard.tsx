import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth, parseISO } from "date-fns";
import { DollarSign, Truck, TrendingUp, Calendar, Loader2, FileText, Clock, CheckCircle2, XCircle } from "lucide-react";

interface Load {
  id: string;
  load_number: string;
  status: string;
  rate: number | null;
  pickup_city: string | null;
  pickup_state: string | null;
  delivery_city: string | null;
  delivery_state: string | null;
  pickup_date: string | null;
  delivery_date: string | null;
  customer_id: string | null;
  created_at: string;
  assigned_vehicle_id: string | null;
  assigned_driver_id: string | null;
}

interface LoadWithDetails extends Load {
  vehicleNumber?: string | null;
  driverName?: string | null;
  customerName?: string | null;
}

interface Dispatcher {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  pay_percentage: number | null;
  user_id: string | null;
}

export default function DispatcherDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [dispatcher, setDispatcher] = useState<Dispatcher | null>(null);
  const [loads, setLoads] = useState<LoadWithDetails[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  // Generate month and year options
  const months = [
    { value: 1, label: "January" },
    { value: 2, label: "February" },
    { value: 3, label: "March" },
    { value: 4, label: "April" },
    { value: 5, label: "May" },
    { value: 6, label: "June" },
    { value: 7, label: "July" },
    { value: 8, label: "August" },
    { value: 9, label: "September" },
    { value: 10, label: "October" },
    { value: 11, label: "November" },
    { value: 12, label: "December" },
  ];

  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, i) => currentYear - i);
  }, []);

  useEffect(() => {
    loadDispatcherData();
  }, []);

  useEffect(() => {
    if (dispatcher) {
      loadLoads();
    }
  }, [dispatcher, selectedMonth, selectedYear]);

  const loadDispatcherData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Please log in to view your dashboard");
        navigate("/auth");
        return;
      }

      // Find dispatcher by user_id
      const { data: dispatcherData, error } = await supabase
        .from("dispatchers")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (error || !dispatcherData) {
        toast.error("Dispatcher profile not found");
        setLoading(false);
        return;
      }

      setDispatcher(dispatcherData);
    } catch (error: any) {
      toast.error("Error loading dispatcher data");
      console.error(error);
    }
  };

  const loadLoads = async () => {
    if (!dispatcher) return;
    
    setLoading(true);
    try {
      const startDate = startOfMonth(new Date(selectedYear, selectedMonth - 1));
      const endDate = endOfMonth(new Date(selectedYear, selectedMonth - 1));

      // Fetch loads
      const { data: loadsData, error: loadsError } = await supabase
        .from("loads")
        .select("*")
        .eq("load_owner_id", dispatcher.id)
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString())
        .order("created_at", { ascending: false });

      if (loadsError) throw loadsError;

      // Get unique IDs for lookups
      const vehicleIds = [...new Set((loadsData || []).map(l => l.assigned_vehicle_id).filter(Boolean))];
      const driverIds = [...new Set((loadsData || []).map(l => l.assigned_driver_id).filter(Boolean))];
      const customerIds = [...new Set((loadsData || []).map(l => l.customer_id).filter(Boolean))];

      // Fetch related data in parallel
      const [vehiclesRes, driversRes, customersRes] = await Promise.all([
        vehicleIds.length > 0 
          ? supabase.from("vehicles").select("id, vehicle_number").in("id", vehicleIds)
          : { data: [] },
        driverIds.length > 0 
          ? supabase.from("applications").select("id, personal_info").in("id", driverIds)
          : { data: [] },
        customerIds.length > 0 
          ? supabase.from("customers").select("id, name").in("id", customerIds)
          : { data: [] },
      ]);

      // Create lookup maps
      const vehicleMap = new Map((vehiclesRes.data || []).map(v => [v.id, v.vehicle_number]));
      const driverMap = new Map((driversRes.data || []).map(d => {
        const info = d.personal_info as { firstName?: string; lastName?: string } | null;
        const name = info ? `${info.firstName || ''} ${info.lastName || ''}`.trim() : null;
        return [d.id, name];
      }));
      const customerMap = new Map((customersRes.data || []).map(c => [c.id, c.name]));

      // Combine data
      const enrichedLoads: LoadWithDetails[] = (loadsData || []).map(load => ({
        ...load,
        vehicleNumber: load.assigned_vehicle_id ? vehicleMap.get(load.assigned_vehicle_id) : null,
        driverName: load.assigned_driver_id ? driverMap.get(load.assigned_driver_id) : null,
        customerName: load.customer_id ? customerMap.get(load.customer_id) : null,
      }));

      setLoads(enrichedLoads);
    } catch (error: any) {
      toast.error("Error loading loads");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate earnings
  const stats = useMemo(() => {
    const payPercentage = dispatcher?.pay_percentage || 0;
    
    const totalRevenue = loads.reduce((sum, load) => sum + (load.rate || 0), 0);
    const totalEarnings = totalRevenue * (payPercentage / 100);
    
    const statusCounts = loads.reduce((acc, load) => {
      const status = load.status || "unknown";
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const bookedLoads = loads.filter(l => 
      ["booked", "dispatched", "in_transit", "picked_up"].includes(l.status || "")
    ).length;
    
    const completedLoads = loads.filter(l => 
      ["delivered", "completed"].includes(l.status || "")
    ).length;

    const cancelledLoads = loads.filter(l => 
      ["cancelled"].includes(l.status || "")
    ).length;

    return {
      totalLoads: loads.length,
      totalRevenue,
      totalEarnings,
      bookedLoads,
      completedLoads,
      cancelledLoads,
      payPercentage,
      statusCounts,
    };
  }, [loads, dispatcher]);

  const getStatusBadge = (status: string | null) => {
    const statusLower = (status || "unknown").toLowerCase();
    const styles: Record<string, { bg: string; text: string }> = {
      action_needed: { bg: "#dc2626", text: "#fff" },
      pending_dispatch: { bg: "#eab308", text: "#000" },
      available: { bg: "#0ea5e9", text: "#fff" },
      booked: { bg: "#6366f1", text: "#fff" },
      dispatched: { bg: "#3b82f6", text: "#fff" },
      at_pickup: { bg: "#f59e0b", text: "#000" },
      in_transit: { bg: "#a855f7", text: "#fff" },
      at_delivery: { bg: "#14b8a6", text: "#fff" },
      delivered: { bg: "#16a34a", text: "#fff" },
      completed: { bg: "#166534", text: "#fff" },
      ready_for_audit: { bg: "#0891b2", text: "#fff" },
      cancelled: { bg: "#ef4444", text: "#fff" },
      tonu: { bg: "#f97316", text: "#000" },
    };
    
    const labels: Record<string, string> = {
      action_needed: "Action Needed",
      pending_dispatch: "Pending",
      available: "Available",
      booked: "Booked",
      dispatched: "Dispatched",
      at_pickup: "At Pickup",
      in_transit: "In Transit",
      at_delivery: "At Delivery",
      delivered: "Delivered",
      completed: "Completed",
      ready_for_audit: "Ready for Audit",
      cancelled: "Cancelled",
      tonu: "TONU",
    };
    
    const style = styles[statusLower] || { bg: "#6b7280", text: "#fff" };
    const label = labels[statusLower] || status || "Unknown";
    
    return (
      <span 
        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold"
        style={{ backgroundColor: style.bg, color: style.text }}
      >
        {label}
      </span>
    );
  };

  if (loading && !dispatcher) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!dispatcher) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No dispatcher profile found for your account.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            Welcome, {dispatcher.first_name} {dispatcher.last_name}
          </h1>
          <p className="text-muted-foreground">
            Pay Rate: <span className="font-semibold text-primary">{dispatcher.pay_percentage || 0}%</span>
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          <Select
            value={selectedMonth.toString()}
            onValueChange={(value) => setSelectedMonth(parseInt(value))}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Month" />
            </SelectTrigger>
            <SelectContent>
              {months.map((month) => (
                <SelectItem key={month.value} value={month.value.toString()}>
                  {month.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={selectedYear.toString()}
            onValueChange={(value) => setSelectedYear(parseInt(value))}
          >
            <SelectTrigger className="w-[100px]">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              {years.map((year) => (
                <SelectItem key={year} value={year.toString()}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Your Earnings</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                  ${stats.totalEarnings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <Truck className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Loads</p>
                <p className="text-2xl font-bold">{stats.totalLoads}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                <TrendingUp className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Revenue</p>
                <p className="text-2xl font-bold">
                  ${stats.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <CheckCircle2 className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Completed</p>
                <p className="text-2xl font-bold">{stats.completedLoads}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Status Summary */}
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline" className="gap-1">
          <Clock className="h-3 w-3" /> Booked: {stats.bookedLoads}
        </Badge>
        <Badge variant="outline" className="gap-1">
          <CheckCircle2 className="h-3 w-3 text-green-500" /> Completed: {stats.completedLoads}
        </Badge>
        <Badge variant="outline" className="gap-1">
          <XCircle className="h-3 w-3 text-red-500" /> Cancelled: {stats.cancelledLoads}
        </Badge>
      </div>

      {/* Loads Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            {months.find(m => m.value === selectedMonth)?.label} {selectedYear} Loads
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : loads.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No loads found for this period
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Load #</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Truck ID</TableHead>
                    <TableHead>Driver</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Origin</TableHead>
                    <TableHead>Destination</TableHead>
                    <TableHead>Pickup Date</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Your Pay</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loads.map((load) => {
                    const yourPay = (load.rate || 0) * ((dispatcher.pay_percentage || 0) / 100);
                    return (
                      <TableRow key={load.id} className="cursor-pointer hover:bg-muted/50">
                        <TableCell className="font-medium">{load.load_number}</TableCell>
                        <TableCell>{load.customerName || "-"}</TableCell>
                        <TableCell>{load.vehicleNumber || "-"}</TableCell>
                        <TableCell>{load.driverName || "-"}</TableCell>
                        <TableCell>{getStatusBadge(load.status)}</TableCell>
                        <TableCell>
                          {load.pickup_city && load.pickup_state 
                            ? `${load.pickup_city}, ${load.pickup_state}` 
                            : "-"}
                        </TableCell>
                        <TableCell>
                          {load.delivery_city && load.delivery_state 
                            ? `${load.delivery_city}, ${load.delivery_state}` 
                            : "-"}
                        </TableCell>
                        <TableCell>
                          {load.pickup_date 
                            ? format(parseISO(load.pickup_date), "MM/dd/yyyy") 
                            : "-"}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          ${(load.rate || 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-medium text-green-600 dark:text-green-400">
                          ${yourPay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => navigate(`/dashboard/load/${load.id}`)}
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
