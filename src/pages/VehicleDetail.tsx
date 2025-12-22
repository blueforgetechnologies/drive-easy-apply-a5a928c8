import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ArrowLeft, Save, X, RefreshCw, Pencil, Truck, Settings, Shield, Wrench, Users, FileText, MapPin, Gauge } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format, formatDistanceToNow } from "date-fns";
import MaintenanceReminderDialog from "@/components/MaintenanceReminderDialog";

export default function VehicleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<any>({});
  const [samsaraStats, setSamsaraStats] = useState<any>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [reminderDialogOpen, setReminderDialogOpen] = useState(false);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [dispatchers, setDispatchers] = useState<any[]>([]);
  const [carriers, setCarriers] = useState<any[]>([]);
  const [payees, setPayees] = useState<any[]>([]);

  useEffect(() => {
    loadVehicle();
    loadSamsaraStats();
    loadDrivers();
    loadDispatchers();
    loadCarriers();
    loadPayees();
  }, [id]);

  const loadVehicle = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        navigate("/auth");
        return;
      }

      const { data, error } = await supabase
        .from("vehicles")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      setFormData(data);
    } catch (error: any) {
      toast.error("Error loading asset");
      navigate("/dashboard/vehicles");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("vehicles")
        .update(formData)
        .eq("id", id);

      if (error) throw error;
      toast.success("Asset information updated successfully");
    } catch (error: any) {
      toast.error("Failed to update asset information: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      const { error } = await supabase
        .from("vehicles")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Asset deleted successfully");
      navigate("/dashboard/business?subtab=assets");
    } catch (error: any) {
      toast.error("Failed to delete asset: " + error.message);
    }
  };

  const updateField = (field: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }));
  };

  const loadDrivers = async () => {
    try {
      const { data, error } = await supabase
        .from('applications')
        .select('id, personal_info, driver_status')
        .in('driver_status', ['Active', 'active', 'ACTIVE']);
      
      if (error) throw error;
      setDrivers(data || []);
    } catch (error) {
      console.error('Error loading drivers:', error);
    }
  };

  const loadDispatchers = async () => {
    try {
      const { data, error } = await supabase
        .from('dispatchers')
        .select('id, first_name, last_name, status')
        .in('status', ['Active', 'active', 'ACTIVE']);
      
      if (error) throw error;
      setDispatchers(data || []);
    } catch (error) {
      console.error('Error loading dispatchers:', error);
    }
  };

  const loadCarriers = async () => {
    try {
      const { data, error } = await supabase
        .from('carriers')
        .select('id, name, status')
        .in('status', ['Active', 'active', 'ACTIVE']);
      
      if (error) throw error;
      setCarriers(data || []);
    } catch (error) {
      console.error('Error loading carriers:', error);
    }
  };

  const loadPayees = async () => {
    try {
      const { data, error } = await supabase
        .from('payees')
        .select('id, name, status')
        .in('status', ['Active', 'active', 'ACTIVE']);
      
      if (error) throw error;
      setPayees(data || []);
    } catch (error) {
      console.error('Error loading payees:', error);
    }
  };

  const loadSamsaraStats = async () => {
    setLoadingStats(true);
    try {
      const { data, error } = await supabase.functions.invoke('get-vehicle-stats', {
        body: { vehicleId: id }
      });

      if (error) {
        console.error('Error loading Samsara stats:', error);
        if (error.message?.includes('Provider ID')) {
          return;
        }
        return;
      }

      setSamsaraStats(data);
    } catch (error: any) {
      console.error('Error loading Samsara stats:', error);
    } finally {
      setLoadingStats(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-emerald-500/10 text-emerald-600 border-emerald-200';
      case 'pending': return 'bg-amber-500/10 text-amber-600 border-amber-200';
      case 'inactive': return 'bg-slate-500/10 text-slate-600 border-slate-200';
      default: return 'bg-slate-500/10 text-slate-600 border-slate-200';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button onClick={() => navigate("/dashboard/business?subtab=assets")} variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Asset Management
            </Button>
            <div className="hidden sm:flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-semibold">
                <Truck className="h-5 w-5" />
              </div>
              <div>
                <h1 className="font-semibold text-lg">
                  {formData.asset_type || 'TAL'}-{formData.vehicle_number || 'N/A'}
                </h1>
                <Badge variant="outline" className={getStatusColor(formData.status || 'pending')}>
                  {formData.status || 'Pending'}
                </Badge>
              </div>
            </div>

            {/* Live Stats */}
            <div className="hidden md:flex items-center gap-4 ml-4 pl-4 border-l">
              <div className="flex flex-col text-xs">
                <span className="text-muted-foreground">Odometer</span>
                <span className="font-medium">
                  {loadingStats ? '...' : (samsaraStats?.odometer || formData.odometer || 'N/A')}
                </span>
              </div>
              <div className="flex flex-col text-xs">
                <span className="text-muted-foreground">Location</span>
                <span className="font-medium truncate max-w-[120px]">
                  {loadingStats ? '...' : (samsaraStats?.location || formData.last_location || 'N/A')}
                </span>
              </div>
              <div className="flex flex-col text-xs">
                <span className="text-muted-foreground">Status</span>
                <span className="font-medium">
                  {loadingStats ? '...' : (samsaraStats?.stoppedStatus || 'N/A')}
                </span>
              </div>
              <div className="flex flex-col text-xs">
                <span className="text-muted-foreground">Updated</span>
                <span className="font-medium">
                  {loadingStats ? '...' : (
                    samsaraStats?.lastUpdated 
                      ? formatDistanceToNow(new Date(samsaraStats.lastUpdated), { addSuffix: true })
                      : 'N/A'
                  )}
                </span>
              </div>
              <Button 
                variant="ghost" 
                size="icon"
                onClick={loadSamsaraStats}
                disabled={loadingStats}
                className="h-8 w-8"
              >
                <RefreshCw className={`h-4 w-4 ${loadingStats ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>

          <div className="flex gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">Delete</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete the asset.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button variant="outline" onClick={() => navigate("/dashboard/business?subtab=assets")}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700">
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <Tabs defaultValue="assignment" className="space-y-6">
          <TabsList className="bg-white dark:bg-slate-800 p-1 shadow-sm">
            <TabsTrigger value="assignment" className="data-[state=active]:bg-blue-500 data-[state=active]:text-white">
              <Users className="w-4 h-4 mr-2" />
              Assignment
            </TabsTrigger>
            <TabsTrigger value="specs" className="data-[state=active]:bg-emerald-500 data-[state=active]:text-white">
              <Gauge className="w-4 h-4 mr-2" />
              Specifications
            </TabsTrigger>
            <TabsTrigger value="equipment" className="data-[state=active]:bg-amber-500 data-[state=active]:text-white">
              <Settings className="w-4 h-4 mr-2" />
              Equipment
            </TabsTrigger>
            <TabsTrigger value="maintenance" className="data-[state=active]:bg-violet-500 data-[state=active]:text-white">
              <Wrench className="w-4 h-4 mr-2" />
              Maintenance
            </TabsTrigger>
          </TabsList>

          {/* Assignment Tab */}
          <TabsContent value="assignment" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Vehicle Assignment */}
              <Card className="border-l-4 border-l-blue-500 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-blue-600">
                    <Truck className="w-5 h-5" />
                    Vehicle Assignment
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Asset Type</Label>
                      <Select value={formData.asset_type || ''} onValueChange={(value) => updateField('asset_type', value)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select Type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="TAL">TAL</SelectItem>
                          <SelectItem value="TRC">TRC</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Unit Number</Label>
                      <Input 
                        value={formData.vehicle_number || ''} 
                        onChange={(e) => updateField('vehicle_number', e.target.value)}
                        placeholder="21"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Status</Label>
                    <Select value={formData.status || 'active'} onValueChange={(value) => updateField('status', value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Carrier Name</Label>
                    <Select value={formData.carrier || 'none'} onValueChange={(value) => updateField('carrier', value === 'none' ? null : value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select Carrier" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Carrier</SelectItem>
                        {carriers.map((carrier) => (
                          <SelectItem key={carrier.id} value={carrier.id}>
                            {carrier.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Bid As</Label>
                    <Select value={formData.bid_as || 'none'} onValueChange={(value) => updateField('bid_as', value === 'none' ? null : value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Selection</SelectItem>
                        {carriers.map((carrier) => (
                          <SelectItem key={carrier.id} value={carrier.id}>
                            {carrier.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Payee</Label>
                    <Select value={formData.payee || 'none'} onValueChange={(value) => updateField('payee', value === 'none' ? null : value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select Payee" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Payee</SelectItem>
                        {payees.map((payee) => (
                          <SelectItem key={payee.id} value={payee.id}>
                            {payee.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* Driver & Dispatcher */}
              <Card className="border-l-4 border-l-emerald-500 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-emerald-600">
                    <Users className="w-5 h-5" />
                    Driver & Dispatcher
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Driver 1</Label>
                    <Select value={formData.driver_1_id || ''} onValueChange={(value) => updateField('driver_1_id', value === 'none' ? null : value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select Driver" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Driver Assigned</SelectItem>
                        {drivers.map((driver) => (
                          <SelectItem key={driver.id} value={driver.id}>
                            {driver.personal_info?.firstName} {driver.personal_info?.lastName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Driver 2</Label>
                    <Select value={formData.driver_2_id || ''} onValueChange={(value) => updateField('driver_2_id', value === 'none' ? null : value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select Driver" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Driver Assigned</SelectItem>
                        {drivers.map((driver) => (
                          <SelectItem key={driver.id} value={driver.id}>
                            {driver.personal_info?.firstName} {driver.personal_info?.lastName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Driver Paid By Carrier?</Label>
                    <RadioGroup defaultValue="no" className="flex gap-4">
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="yes" id="paid-yes" />
                        <Label htmlFor="paid-yes">Yes</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="no" id="paid-no" />
                        <Label htmlFor="paid-no">No</Label>
                      </div>
                    </RadioGroup>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Primary Dispatcher</Label>
                    <Select value={formData.primary_dispatcher_id || ''} onValueChange={(value) => updateField('primary_dispatcher_id', value === 'none' ? null : value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select Dispatcher" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Dispatcher Assigned</SelectItem>
                        {dispatchers.map((dispatcher) => (
                          <SelectItem key={dispatcher.id} value={dispatcher.id}>
                            {dispatcher.first_name} {dispatcher.last_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* Ownership & Costs */}
              <Card className="border-l-4 border-l-amber-500 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-amber-600">
                    <FileText className="w-5 h-5" />
                    Ownership & Costs
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Asset Ownership</Label>
                    <RadioGroup value={formData.asset_ownership || 'owned'} onValueChange={(value) => updateField('asset_ownership', value)} className="flex gap-4">
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="owned" id="owned" />
                        <Label htmlFor="owned">Owned</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="financed" id="financed" />
                        <Label htmlFor="financed">Financed</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="leased" id="leased" />
                        <Label htmlFor="leased">Leased</Label>
                      </div>
                    </RadioGroup>
                  </div>

                  {(formData.asset_ownership === 'owned' || formData.asset_ownership === 'financed') && (
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Monthly Payment</Label>
                      <Input 
                        type="number" 
                        step="0.01" 
                        value={formData.monthly_payment || ''} 
                        onChange={(e) => updateField('monthly_payment', e.target.value)} 
                        placeholder="0.00"
                      />
                    </div>
                  )}

                  {formData.asset_ownership === 'leased' && (
                    <>
                      <div className="space-y-2">
                        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Weekly Payment</Label>
                        <Input 
                          type="number" 
                          step="0.01" 
                          value={formData.weekly_payment || ''} 
                          onChange={(e) => updateField('weekly_payment', e.target.value)} 
                          placeholder="0.00"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Cents per Mile</Label>
                        <Input 
                          type="number" 
                          step="0.01" 
                          value={formData.cents_per_mile || ''} 
                          onChange={(e) => updateField('cents_per_mile', e.target.value)} 
                          placeholder="0.00"
                        />
                      </div>
                    </>
                  )}

                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Fuel Rate ($/gallon)</Label>
                    <Input type="number" step="0.01" value={formData.fuel_per_gallon || ''} onChange={(e) => updateField('fuel_per_gallon', e.target.value)} placeholder="7.50" />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Insurance Cost ($/month)</Label>
                    <Input type="number" step="0.01" value={formData.insurance_cost_per_month || ''} onChange={(e) => updateField('insurance_cost_per_month', e.target.value)} placeholder="1700" />
                  </div>
                </CardContent>
              </Card>

              {/* Vehicle Notes */}
              <Card className="border-l-4 border-l-violet-500 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-violet-600">
                    <FileText className="w-5 h-5" />
                    Vehicle Notes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={formData.notes || ''}
                    onChange={(e) => updateField('notes', e.target.value)}
                    rows={6}
                    placeholder="Enter vehicle notes..."
                    className="resize-none"
                  />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Specifications Tab */}
          <TabsContent value="specs" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Basic Specs */}
              <Card className="border-l-4 border-l-blue-500 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-blue-600">
                    <Truck className="w-5 h-5" />
                    Vehicle Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Year</Label>
                      <Input type="number" value={formData.year ?? ''} onChange={(e) => updateField('year', e.target.value ? parseInt(e.target.value) : null)} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Make</Label>
                      <Input value={formData.make || ''} onChange={(e) => updateField('make', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Model</Label>
                      <Input value={formData.model || ''} onChange={(e) => updateField('model', e.target.value)} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Reg Plate #</Label>
                      <Input value={formData.reg_plate || ''} onChange={(e) => updateField('reg_plate', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Reg State</Label>
                      <Input value={formData.reg_state || ''} onChange={(e) => updateField('reg_state', e.target.value)} placeholder="TX" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">VIN</Label>
                    <Input value={formData.vin || ''} onChange={(e) => updateField('vin', e.target.value)} />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Vehicle Size (ft)</Label>
                      <Input type="number" value={formData.vehicle_size ?? ''} onChange={(e) => updateField('vehicle_size', e.target.value ? parseInt(e.target.value) : null)} placeholder="26" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Asset Type</Label>
                      <Select value={formData.asset_subtype || ''} onValueChange={(value) => updateField('asset_subtype', value)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select Type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Large Straight">Large Straight</SelectItem>
                          <SelectItem value="Air Ride">Air Ride</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Axles</Label>
                      <Input type="number" value={formData.axles ?? ''} onChange={(e) => updateField('axles', e.target.value ? parseInt(e.target.value) : null)} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Payload (lbs)</Label>
                      <Input type="number" value={formData.payload ?? ''} onChange={(e) => updateField('payload', e.target.value ? parseInt(e.target.value) : null)} />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Specialty</Label>
                    <Input value={formData.suspension || ''} onChange={(e) => updateField('suspension', e.target.value)} />
                  </div>
                </CardContent>
              </Card>

              {/* Dimensions */}
              <Card className="border-l-4 border-l-emerald-500 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-emerald-600">
                    <Gauge className="w-5 h-5" />
                    Dimensions & Clearance
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Clearance (ft/in)</Label>
                    <div className="grid grid-cols-4 gap-2 items-center">
                      <Input value={formData.clearance || ''} onChange={(e) => updateField('clearance', e.target.value)} placeholder="13" />
                      <span className="text-sm text-muted-foreground">ft</span>
                      <Input value={formData.clearance_inches || ''} onChange={(e) => updateField('clearance_inches', e.target.value)} placeholder="0" />
                      <span className="text-sm text-muted-foreground">in</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Dimensions L×W×H (inch)</Label>
                    <div className="grid grid-cols-5 gap-2 items-center">
                      <Input type="number" placeholder="312" value={formData.dimensions_length ?? ''} onChange={(e) => updateField('dimensions_length', e.target.value ? parseInt(e.target.value) : null)} />
                      <span className="text-center text-muted-foreground">×</span>
                      <Input type="number" placeholder="97" value={formData.dimensions_width ?? ''} onChange={(e) => updateField('dimensions_width', e.target.value ? parseInt(e.target.value) : null)} />
                      <span className="text-center text-muted-foreground">×</span>
                      <Input type="number" placeholder="97" value={formData.dimensions_height ?? ''} onChange={(e) => updateField('dimensions_height', e.target.value ? parseInt(e.target.value) : null)} />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Door Dims H×W (inch)</Label>
                    <div className="grid grid-cols-3 gap-2 items-center">
                      <Input type="number" placeholder="88" value={formData.door_dims_height ?? ''} onChange={(e) => updateField('door_dims_height', e.target.value ? parseInt(e.target.value) : null)} />
                      <span className="text-center text-muted-foreground">×</span>
                      <Input type="number" placeholder="93" value={formData.door_dims_width ?? ''} onChange={(e) => updateField('door_dims_width', e.target.value ? parseInt(e.target.value) : null)} />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Door Type</Label>
                    <Select value={formData.door_type || ''} onValueChange={(value) => updateField('door_type', value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="roll-up">Roll Up</SelectItem>
                        <SelectItem value="swing">Swing</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Dock High?</Label>
                      <RadioGroup defaultValue="yes" className="flex gap-4">
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="yes" id="dock-yes" />
                          <Label htmlFor="dock-yes">Yes</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="no" id="dock-no" />
                          <Label htmlFor="dock-no">No</Label>
                        </div>
                      </RadioGroup>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Air Ride?</Label>
                      <RadioGroup value={formData.air_ride ? 'yes' : 'no'} onValueChange={(value) => updateField('air_ride', value === 'yes')} className="flex gap-4">
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="yes" id="air-yes" />
                          <Label htmlFor="air-yes">Yes</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="no" id="air-no" />
                          <Label htmlFor="air-no">No</Label>
                        </div>
                      </RadioGroup>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Has Side Door?</Label>
                    <RadioGroup value={formData.has_side_door ? 'yes' : 'no'} onValueChange={(value) => updateField('has_side_door', value === 'yes')} className="flex gap-4">
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="yes" id="side-yes" />
                        <Label htmlFor="side-yes">Yes</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="no" id="side-no" />
                        <Label htmlFor="side-no">No</Label>
                      </div>
                    </RadioGroup>
                  </div>
                </CardContent>
              </Card>

              {/* Lift Gate */}
              <Card className="border-l-4 border-l-amber-500 shadow-sm lg:col-span-2">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-amber-600">
                    <Settings className="w-5 h-5" />
                    Lift Gate & E-Track
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Lift Gate?</Label>
                      <RadioGroup value={formData.lift_gate ? 'yes' : 'no'} onValueChange={(value) => updateField('lift_gate', value === 'yes')} className="flex gap-4">
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="yes" id="lift-yes" />
                          <Label htmlFor="lift-yes">Yes</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="no" id="lift-no" />
                          <Label htmlFor="lift-no">No</Label>
                        </div>
                      </RadioGroup>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Lift Gate Capacity</Label>
                      <Input type="number" value={formData.lift_gate_capacity ?? ''} onChange={(e) => updateField('lift_gate_capacity', e.target.value ? parseInt(e.target.value) : null)} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Lift Gate Dims</Label>
                      <Input value={formData.lift_gate_dims || ''} onChange={(e) => updateField('lift_gate_dims', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Vertical E-Track Rows</Label>
                      <Input type="number" value={formData.vertical_etrack_rows ?? ''} onChange={(e) => updateField('vertical_etrack_rows', e.target.value ? parseInt(e.target.value) : null)} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Horizontal E-Tracks</Label>
                      <Input type="number" value={formData.horizontal_etracks ?? ''} onChange={(e) => updateField('horizontal_etracks', e.target.value ? parseInt(e.target.value) : null)} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Equipment Tab */}
          <TabsContent value="equipment" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Provider Devices */}
              <Card className="border-l-4 border-l-blue-500 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-blue-600">
                    <MapPin className="w-5 h-5" />
                    Provider & Tracking
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Toll Device S/N</Label>
                    <Input value={formData.toll_device_sn || ''} onChange={(e) => updateField('toll_device_sn', e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Tracking Device IMEI</Label>
                    <Input value={formData.tracking_device_imei || ''} onChange={(e) => updateField('tracking_device_imei', e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">ELD Device S/N</Label>
                    <Input value={formData.eld_device_sn || ''} onChange={(e) => updateField('eld_device_sn', e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Dash Cam S/N</Label>
                    <Input value={formData.dash_cam_sn || ''} onChange={(e) => updateField('dash_cam_sn', e.target.value)} />
                  </div>
                </CardContent>
              </Card>

              {/* Cargo Equipment */}
              <Card className="border-l-4 border-l-emerald-500 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-emerald-600">
                    <Settings className="w-5 h-5" />
                    Cargo Equipment
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Straps Count</Label>
                      <Input type="number" value={formData.straps_count || ''} onChange={(e) => updateField('straps_count', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Blankets</Label>
                      <Input type="number" value={formData.blankets || ''} onChange={(e) => updateField('blankets', e.target.value)} />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Pallet Jack</Label>
                    <RadioGroup value={formData.pallet_jack ? 'yes' : 'no'} onValueChange={(value) => updateField('pallet_jack', value === 'yes')} className="flex gap-4">
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="yes" id="pj-yes" />
                        <Label htmlFor="pj-yes">Yes</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="no" id="pj-no" />
                        <Label htmlFor="pj-no">No</Label>
                      </div>
                    </RadioGroup>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Pallet Jack Capacity</Label>
                    <Input type="number" value={formData.pallet_jack_capacity || ''} onChange={(e) => updateField('pallet_jack_capacity', e.target.value)} />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Load Bars (E-Track)</Label>
                      <Input type="number" value={formData.load_bars_etrack || ''} onChange={(e) => updateField('load_bars_etrack', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Load Bars (Non E-Track)</Label>
                      <Input type="number" value={formData.load_bars_non_etrack || ''} onChange={(e) => updateField('load_bars_non_etrack', e.target.value)} />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Sensors & Features */}
              <Card className="border-l-4 border-l-amber-500 shadow-sm lg:col-span-2">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-amber-600">
                    <Shield className="w-5 h-5" />
                    Sensors & Features
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Trailer Tracking</Label>
                      <RadioGroup value={formData.trailer_tracking ? 'yes' : 'no'} onValueChange={(value) => updateField('trailer_tracking', value === 'yes')} className="flex gap-3">
                        <div className="flex items-center space-x-1">
                          <RadioGroupItem value="yes" id="tt-yes" />
                          <Label htmlFor="tt-yes" className="text-sm">Yes</Label>
                        </div>
                        <div className="flex items-center space-x-1">
                          <RadioGroupItem value="no" id="tt-no" />
                          <Label htmlFor="tt-no" className="text-sm">No</Label>
                        </div>
                      </RadioGroup>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Door Sensors</Label>
                      <RadioGroup value={formData.door_sensors ? 'yes' : 'no'} onValueChange={(value) => updateField('door_sensors', value === 'yes')} className="flex gap-3">
                        <div className="flex items-center space-x-1">
                          <RadioGroupItem value="yes" id="ds-yes" />
                          <Label htmlFor="ds-yes" className="text-sm">Yes</Label>
                        </div>
                        <div className="flex items-center space-x-1">
                          <RadioGroupItem value="no" id="ds-no" />
                          <Label htmlFor="ds-no" className="text-sm">No</Label>
                        </div>
                      </RadioGroup>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Temp Control</Label>
                      <RadioGroup value={formData.temp_control ? 'yes' : 'no'} onValueChange={(value) => updateField('temp_control', value === 'yes')} className="flex gap-3">
                        <div className="flex items-center space-x-1">
                          <RadioGroupItem value="yes" id="tc-yes" />
                          <Label htmlFor="tc-yes" className="text-sm">Yes</Label>
                        </div>
                        <div className="flex items-center space-x-1">
                          <RadioGroupItem value="no" id="tc-no" />
                          <Label htmlFor="tc-no" className="text-sm">No</Label>
                        </div>
                      </RadioGroup>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Panic Button</Label>
                      <RadioGroup value={formData.panic_button ? 'yes' : 'no'} onValueChange={(value) => updateField('panic_button', value === 'yes')} className="flex gap-3">
                        <div className="flex items-center space-x-1">
                          <RadioGroupItem value="yes" id="pb-yes" />
                          <Label htmlFor="pb-yes" className="text-sm">Yes</Label>
                        </div>
                        <div className="flex items-center space-x-1">
                          <RadioGroupItem value="no" id="pb-no" />
                          <Label htmlFor="pb-no" className="text-sm">No</Label>
                        </div>
                      </RadioGroup>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Team</Label>
                      <RadioGroup value={formData.team ? 'yes' : 'no'} onValueChange={(value) => updateField('team', value === 'yes')} className="flex gap-3">
                        <div className="flex items-center space-x-1">
                          <RadioGroupItem value="yes" id="team-yes" />
                          <Label htmlFor="team-yes" className="text-sm">Yes</Label>
                        </div>
                        <div className="flex items-center space-x-1">
                          <RadioGroupItem value="no" id="team-no" />
                          <Label htmlFor="team-no" className="text-sm">No</Label>
                        </div>
                      </RadioGroup>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Maintenance Tab */}
          <TabsContent value="maintenance" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Coverage */}
              <Card className="border-l-4 border-l-blue-500 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-blue-600">
                    <Shield className="w-5 h-5" />
                    Coverage & Registration
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-3 text-xs font-semibold text-muted-foreground border-b pb-2">
                    <div>Type</div>
                    <div>Status</div>
                    <div>Exp Date</div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 items-center">
                    <Label className="text-sm">Physical Coverage</Label>
                    <Input type="text" placeholder="Status" value={formData.physical_coverage_status || ''} onChange={(e) => updateField('physical_coverage_status', e.target.value)} />
                    <Input type="date" value={formData.physical_coverage_exp || ''} onChange={(e) => updateField('physical_coverage_exp', e.target.value)} />
                  </div>
                  <div className="grid grid-cols-3 gap-3 items-center">
                    <Label className="text-sm">Cargo Coverage</Label>
                    <Input type="text" placeholder="Status" value={formData.cargo_coverage_status || ''} onChange={(e) => updateField('cargo_coverage_status', e.target.value)} />
                    <Input type="date" value={formData.cargo_coverage_exp || ''} onChange={(e) => updateField('cargo_coverage_exp', e.target.value)} />
                  </div>
                  <div className="grid grid-cols-3 gap-3 items-center">
                    <Label className="text-sm">Registration</Label>
                    <Input type="text" placeholder="Status" value={formData.registration_status || ''} onChange={(e) => updateField('registration_status', e.target.value)} />
                    <Input type="date" value={formData.registration_exp || ''} onChange={(e) => updateField('registration_exp', e.target.value)} />
                  </div>
                  <div className="grid grid-cols-3 gap-3 items-center">
                    <Label className="text-sm">Liability Coverage</Label>
                    <Input type="text" placeholder="Status" value={formData.liability_coverage_status || ''} onChange={(e) => updateField('liability_coverage_status', e.target.value)} />
                    <Input type="date" value={formData.liability_coverage_exp || ''} onChange={(e) => updateField('liability_coverage_exp', e.target.value)} />
                  </div>
                </CardContent>
              </Card>

              {/* Maintenance Reminders */}
              <Card className="border-l-4 border-l-amber-500 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between text-amber-600">
                    <div className="flex items-center gap-2">
                      <Wrench className="w-5 h-5" />
                      Maintenance Reminders
                    </div>
                    <Button 
                      variant="default" 
                      size="sm" 
                      className="bg-amber-500 hover:bg-amber-600 text-black"
                      onClick={() => setReminderDialogOpen(true)}
                    >
                      Add Reminder
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-4 gap-3 text-xs font-semibold text-muted-foreground border-b pb-2">
                    <div>Type</div>
                    <div>Due by</div>
                    <div>Remaining</div>
                    <div></div>
                  </div>
                  
                  {formData.oil_change_due && (
                    <div className="grid grid-cols-4 gap-3 items-center">
                      <span className="text-sm font-medium">Oil Change</span>
                      <span className="text-sm">{formData.oil_change_due} mi</span>
                      <span className={`text-sm font-medium ${(() => {
                        const currentOdo = samsaraStats?.odometer || formData.odometer || 0;
                        const remaining = formData.oil_change_due - currentOdo;
                        return remaining < 0 ? "text-destructive" : "text-emerald-600";
                      })()}`}>
                        {(() => {
                          const currentOdo = samsaraStats?.odometer || formData.odometer || 0;
                          return formData.oil_change_due - currentOdo;
                        })()} mi
                      </span>
                      <div className="flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setReminderDialogOpen(true)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive"
                          onClick={async () => {
                            try {
                              const { error } = await supabase
                                .from("vehicles")
                                .update({ oil_change_due: null, oil_change_remaining: null })
                                .eq("id", id);
                              if (error) throw error;
                              toast.success("Reminder deleted");
                              loadVehicle();
                            } catch (error: any) {
                              toast.error("Failed to delete: " + error.message);
                            }
                          }}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  )}

                  {formData.next_service_date && (
                    <div className="grid grid-cols-4 gap-3 items-center">
                      <span className="text-sm font-medium">Next Service</span>
                      <span className="text-sm">{format(new Date(formData.next_service_date), "MM/dd/yyyy")}</span>
                      <span className="text-sm">-</span>
                      <div className="flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setReminderDialogOpen(true)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive"
                          onClick={async () => {
                            try {
                              const { error } = await supabase
                                .from("vehicles")
                                .update({ next_service_date: null })
                                .eq("id", id);
                              if (error) throw error;
                              toast.success("Reminder deleted");
                              loadVehicle();
                            } catch (error: any) {
                              toast.error("Failed to delete: " + error.message);
                            }
                          }}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  )}

                  {!formData.oil_change_due && !formData.next_service_date && (
                    <div className="text-center py-6 text-muted-foreground">
                      No maintenance reminders set
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      <MaintenanceReminderDialog
        open={reminderDialogOpen}
        onOpenChange={setReminderDialogOpen}
        vehicleId={id!}
        currentOdometer={samsaraStats?.odometer || formData.odometer}
        onSuccess={loadVehicle}
      />
    </div>
  );
}
