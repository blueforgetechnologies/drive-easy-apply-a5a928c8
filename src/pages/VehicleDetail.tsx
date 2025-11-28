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
import { toast } from "sonner";
import { ArrowLeft, Save, X, RefreshCw, Pencil } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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

  useEffect(() => {
    loadVehicle();
    loadSamsaraStats();
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
      navigate("/dashboard/vehicles?filter=active");
    } catch (error: any) {
      toast.error("Failed to delete asset: " + error.message);
    }
  };

  const updateField = (field: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }));
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
          // Silent fail if no Samsara ID configured
          return;
        }
        toast.error('Failed to load live vehicle data');
        return;
      }

      setSamsaraStats(data);
    } catch (error: any) {
      console.error('Error loading Samsara stats:', error);
    } finally {
      setLoadingStats(false);
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
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card px-3 py-2 flex justify-between items-center">
        <div className="flex gap-2 items-center">
          <Button onClick={() => navigate(-1)} variant="outline" size="sm" className="gap-2 bg-primary/10 hover:bg-primary/20 border-primary/20">
            <ArrowLeft className="h-4 w-4" />
            <span className="font-semibold">Asset Management</span>
          </Button>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">Status</span>
            <Select 
              value={formData.status || 'active'} 
              onValueChange={(value) => updateField('status', value)}
            >
              <SelectTrigger className="w-28 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex flex-col text-xs gap-1">
              <div className="flex gap-2">
                <span className="text-muted-foreground w-16">Odometer</span>
                <span className="font-medium">
                  {loadingStats ? '...' : (samsaraStats?.odometer || formData.odometer || 'N/A')}
                </span>
              </div>
              <div className="flex gap-2">
                <span className="text-muted-foreground w-16">Location</span>
                <span className="font-medium truncate max-w-[150px]">
                  {loadingStats ? '...' : (samsaraStats?.location || formData.last_location || 'N/A')}
                </span>
              </div>
            </div>
            <div className="flex flex-col text-xs gap-1">
              <div className="flex gap-2">
                <span className="text-muted-foreground w-20">Speed</span>
                <span className="font-medium">
                  {loadingStats ? '...' : (samsaraStats?.stoppedStatus || formData.stopped_status || 'N/A')}
                </span>
              </div>
              <div className="flex gap-2">
                <span className="text-muted-foreground w-20">Updated</span>
                <span className="font-medium">
                  {loadingStats ? '...' : (
                    samsaraStats?.lastUpdated 
                      ? formatDistanceToNow(new Date(samsaraStats.lastUpdated), { addSuffix: true })
                      : 'N/A'
                  )}
                </span>
              </div>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={loadSamsaraStats}
              disabled={loadingStats}
              className="h-7 w-7 p-0"
            >
              <RefreshCw className={`h-3 w-3 ${loadingStats ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
        <div className="flex gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                DELETE
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete the asset.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>CANCEL</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  DELETE
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button variant="outline" onClick={() => navigate("/dashboard/business?subtab=assets")}>
            CANCEL
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "SAVING..." : "SUBMIT"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
          {/* Left Column - Update Vehicle + Coverage + Maintenance */}
          <div className="space-y-2">
            <Card>
              <CardContent className="pt-2 space-y-2">
                <h3 className="font-semibold text-xs mb-1">Update Vehicle</h3>
                
                <div className="space-y-1">
                  <Label className="text-[10px]">UNIT ID:</Label>
                  <div className="grid grid-cols-2 gap-1">
                    <Select value={formData.asset_type || ''} onValueChange={(value) => updateField('asset_type', value)}>
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue placeholder="TAL" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="TAL">TAL</SelectItem>
                        <SelectItem value="TRC">TRC</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input 
                      value={formData.vehicle_number || ''} 
                      onChange={(e) => updateField('vehicle_number', e.target.value)}
                      placeholder="21"
                      className="h-7 text-xs"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px]">Carrier Name</Label>
                  <Select value={formData.carrier || ''} onValueChange={(value) => updateField('carrier', value)}>
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue placeholder="Select Carrier" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GULF COAST ROAD RUNNER LLC">GULF COAST ROAD RUNNER LLC</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px]">Bid As</Label>
                  <Select value={formData.bid_as || ''} onValueChange={(value) => updateField('bid_as', value)}>
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TALBI LOGISTICS LLC">TALBI LOGISTICS LLC</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px]">Payee</Label>
                  <Select value={formData.payee || ''} onValueChange={(value) => updateField('payee', value)}>
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue placeholder="Select Payee" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ROY">ROY</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px]">Driver 1</Label>
                  <Select value={formData.driver_1_id || ''} onValueChange={(value) => updateField('driver_1_id', value)}>
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue placeholder="Select Driver" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="jose">Jose Lopez</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px]">Driver 2</Label>
                  <Select value={formData.driver_2_id || ''} onValueChange={(value) => updateField('driver_2_id', value)}>
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue placeholder="Select Driver" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px]">Driver Paid By Carrier?</Label>
                  <RadioGroup defaultValue="no">
                    <div className="flex items-center space-x-2">
                      <div className="flex items-center space-x-1">
                        <RadioGroupItem value="yes" id="paid-yes" className="h-3 w-3" />
                        <Label htmlFor="paid-yes" className="text-[10px]">Yes</Label>
                      </div>
                      <div className="flex items-center space-x-1">
                        <RadioGroupItem value="no" id="paid-no" className="h-3 w-3" />
                        <Label htmlFor="paid-no" className="text-[10px]">No</Label>
                      </div>
                    </div>
                  </RadioGroup>
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px]">Primary Dispatcher</Label>
                  <Select value={formData.primary_dispatcher_id || ''} onValueChange={(value) => updateField('primary_dispatcher_id', value)}>
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue placeholder="Raymond Jones" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="raymond">Raymond Jones</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px]">Asset Ownership</Label>
                  <RadioGroup value={formData.asset_ownership || 'owned'} onValueChange={(value) => updateField('asset_ownership', value)}>
                    <div className="flex items-center space-x-2">
                      <div className="flex items-center space-x-1">
                        <RadioGroupItem value="owned" id="owned" className="h-3 w-3" />
                        <Label htmlFor="owned" className="text-[10px]">Owned</Label>
                      </div>
                      <div className="flex items-center space-x-1">
                        <RadioGroupItem value="financed" id="financed" className="h-3 w-3" />
                        <Label htmlFor="financed" className="text-[10px]">Financed</Label>
                      </div>
                      <div className="flex items-center space-x-1">
                        <RadioGroupItem value="leased" id="leased" className="h-3 w-3" />
                        <Label htmlFor="leased" className="text-[10px]">Leased</Label>
                      </div>
                    </div>
                  </RadioGroup>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <Label className="text-[10px]">Pickup Date & Odometer</Label>
                    <Button variant="link" className="p-0 h-auto text-primary text-[10px]">VIEW PICS</Button>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <Label className="text-[10px]">Return Date & Odometer</Label>
                    <Button variant="link" className="p-0 h-auto text-destructive text-[10px]">Upload</Button>
                  </div>
                </div>

                <div className="space-y-1">
                  <Button variant="link" className="p-0 h-auto text-primary underline text-[10px]">View leasing Historical records</Button>
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px]">Rates Per Gallon</Label>
                  <Input type="number" step="0.01" value={formData.fuel_per_gallon || '7.5'} onChange={(e) => updateField('fuel_per_gallon', e.target.value)} className="h-7 text-xs" />
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px]">Insurance Cost per Month</Label>
                  <Input type="number" step="0.01" value={formData.insurance_cost_per_month || '1700'} onChange={(e) => updateField('insurance_cost_per_month', e.target.value)} className="h-7 text-xs" />
                </div>
              </CardContent>
            </Card>

            {/* Coverage Table */}
            <Card>
              <CardContent className="pt-2">
                <div className="space-y-1">
                  <div className="grid grid-cols-4 gap-1 text-[10px] font-semibold border-b pb-1">
                    <div>Type</div>
                    <div>Status</div>
                    <div>Exp Date</div>
                    <div>Remaining</div>
                  </div>
                  <div className="grid grid-cols-4 gap-1 text-[10px]">
                    <div>Physical Coverage</div>
                    <div>
                      <Input type="text" className="h-6 text-[10px]" placeholder="mm/dd/yyyy" />
                    </div>
                    <div>
                      <Input type="date" className="h-6 text-[10px]" />
                    </div>
                    <div></div>
                  </div>
                  <div className="grid grid-cols-4 gap-1 text-[10px]">
                    <div>Cargo Coverage</div>
                    <div>
                      <Input type="text" className="h-6 text-[10px]" placeholder="mm/dd/yyyy" />
                    </div>
                    <div>
                      <Input type="date" className="h-6 text-[10px]" />
                    </div>
                    <div></div>
                  </div>
                  <div className="grid grid-cols-4 gap-1 text-[10px]">
                    <div>Registration</div>
                    <div>
                      <Input type="text" className="h-6 text-[10px]" placeholder="mm/dd/yyyy" />
                    </div>
                    <div>
                      <Input type="date" className="h-6 text-[10px]" />
                    </div>
                    <div></div>
                  </div>
                  <div className="grid grid-cols-4 gap-1 text-[10px]">
                    <div>Liability Coverage</div>
                    <div>
                      <Input type="text" className="h-6 text-[10px]" placeholder="mm/dd/yyyy" />
                    </div>
                    <div>
                      <Input type="date" className="h-6 text-[10px]" />
                    </div>
                    <div></div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Maintenance Type */}
            <Card>
              <CardContent className="pt-2">
                <div className="space-y-1">
                  <div className="grid grid-cols-5 gap-1 text-[10px] font-semibold border-b pb-1">
                    <div>Maintenance Type</div>
                    <div>Due by</div>
                    <div>Due</div>
                    <div>Remaining</div>
                    <div></div>
                  </div>
                  {formData.oil_change_due && (
                    <div className="grid grid-cols-5 gap-1 text-[10px] items-center">
                      <div>Oil Change</div>
                      <div>Miles</div>
                      <div>{formData.oil_change_due}</div>
                      <div className={(() => {
                        const currentOdo = samsaraStats?.odometer || formData.odometer || 0;
                        const remaining = formData.oil_change_due - currentOdo;
                        return remaining < 0 ? "text-destructive font-semibold" : "";
                      })()}>
                        {(() => {
                          const currentOdo = samsaraStats?.odometer || formData.odometer || 0;
                          const remaining = formData.oil_change_due - currentOdo;
                          return remaining;
                        })()} mi
                      </div>
                      <div className="flex gap-1 justify-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-5 w-5 p-0"
                          onClick={() => setReminderDialogOpen(true)}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-5 w-5 p-0"
                          onClick={async () => {
                            try {
                              const { error } = await supabase
                                .from("vehicles")
                                .update({ 
                                  oil_change_due: null, 
                                  oil_change_remaining: null 
                                })
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
                    <div className="grid grid-cols-5 gap-1 text-[10px] items-center">
                      <div>Next Service</div>
                      <div>Date</div>
                      <div>{format(new Date(formData.next_service_date), "yyyy-MM-dd")}</div>
                      <div>-</div>
                      <div className="flex gap-1 justify-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-5 w-5 p-0"
                          onClick={() => setReminderDialogOpen(true)}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-5 w-5 p-0"
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
                  <Button 
                    variant="default" 
                    size="sm" 
                    className="bg-yellow-500 hover:bg-yellow-600 text-black h-6 text-[10px] mt-2"
                    onClick={() => setReminderDialogOpen(true)}
                  >
                    Add Reminder
                  </Button>
                </div>
              </CardContent>
            </Card>
            
            <MaintenanceReminderDialog
              open={reminderDialogOpen}
              onOpenChange={setReminderDialogOpen}
              vehicleId={id!}
              currentOdometer={samsaraStats?.odometer || formData.odometer}
              onSuccess={loadVehicle}
            />
          </div>

          {/* Middle Column - Vehicle Specifications */}
          <div className="space-y-2">
            <Card>
              <CardContent className="pt-2 space-y-2">
                <div className="space-y-1">
                  <Label className="text-[10px]">Year</Label>
                  <Input value={formData.year || ''} onChange={(e) => updateField('year', parseInt(e.target.value))} className="h-7 text-xs" />
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px]">Make</Label>
                  <Input value={formData.make || ''} onChange={(e) => updateField('make', e.target.value)} className="h-7 text-xs" />
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px]">Model</Label>
                  <Input value={formData.model || ''} onChange={(e) => updateField('model', e.target.value)} className="h-7 text-xs" />
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px]">Reg Plate #</Label>
                  <Input value={formData.reg_plate || ''} onChange={(e) => updateField('reg_plate', e.target.value)} className="h-7 text-xs" />
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px]">Reg State</Label>
                  <Input value={formData.reg_state || 'CA'} onChange={(e) => updateField('reg_state', e.target.value)} className="h-7 text-xs" />
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px]">VIN</Label>
                  <Input value={formData.vin || ''} onChange={(e) => updateField('vin', e.target.value)} className="h-7 text-xs" />
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px]">Asset Size / Type</Label>
                  <div className="grid grid-cols-3 gap-1 items-center">
                    <Input placeholder="26" value={formData.dimensions_length || ''} onChange={(e) => updateField('dimensions_length', e.target.value)} className="h-7 text-xs" />
                    <span className="text-[10px]">ft.</span>
                    <Select value={formData.asset_subtype || ''} onValueChange={(value) => updateField('asset_subtype', value)}>
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue placeholder="Large Straight" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Large Straight">Large Straight</SelectItem>
                        <SelectItem value="Air Ride">Air Ride</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px]">Axles</Label>
                  <Input type="number" value={formData.axles || '1'} onChange={(e) => updateField('axles', e.target.value)} className="h-7 text-xs" />
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px]">Specialty</Label>
                  <Input value={formData.suspension || ''} onChange={(e) => updateField('suspension', e.target.value)} className="h-7 text-xs" />
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px]">Clearance</Label>
                  <div className="grid grid-cols-5 gap-1 items-center">
                    <Input value={formData.clearance || '13'} onChange={(e) => updateField('clearance', e.target.value)} className="h-7 text-xs" />
                    <span className="text-[10px]">ft</span>
                    <Input value="0" className="h-7 text-xs" />
                    <span className="text-[10px]">in</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px]">Payload</Label>
                  <div className="grid grid-cols-2 gap-1 items-center">
                    <Input value={formData.payload || '9000'} onChange={(e) => updateField('payload', e.target.value)} className="h-7 text-xs" />
                    <span className="text-[10px]">lbs</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px]">Dock High</Label>
                  <RadioGroup defaultValue="yes">
                    <div className="flex items-center space-x-2">
                      <div className="flex items-center space-x-1">
                        <RadioGroupItem value="yes" id="dock-yes" className="h-3 w-3" />
                        <Label htmlFor="dock-yes" className="text-[10px]">Yes</Label>
                      </div>
                      <div className="flex items-center space-x-1">
                        <RadioGroupItem value="no" id="dock-no" className="h-3 w-3" />
                        <Label htmlFor="dock-no" className="text-[10px]">No</Label>
                      </div>
                    </div>
                  </RadioGroup>
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px]">Suspension</Label>
                  <RadioGroup value={formData.air_ride ? 'yes' : 'no'} onValueChange={(value) => updateField('air_ride', value === 'yes')}>
                    <div className="flex items-center space-x-2">
                      <div className="flex items-center space-x-1">
                        <RadioGroupItem value="yes" id="air-yes" className="h-3 w-3" />
                        <Label htmlFor="air-yes" className="text-[10px]">Air Ride?</Label>
                      </div>
                      <div className="flex items-center space-x-1">
                        <RadioGroupItem value="no" id="air-no" className="h-3 w-3" />
                        <Label htmlFor="air-no" className="text-[10px]">No</Label>
                      </div>
                    </div>
                  </RadioGroup>
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px]">Dimensions LxWxH (inch)</Label>
                  <div className="grid grid-cols-5 gap-1 items-center">
                    <Input placeholder="312" value={formData.dimensions_length || ''} onChange={(e) => updateField('dimensions_length', e.target.value)} className="h-7 text-xs" />
                    <span className="text-[10px]">X</span>
                    <Input placeholder="97" value={formData.dimensions_width || ''} onChange={(e) => updateField('dimensions_width', e.target.value)} className="h-7 text-xs" />
                    <span className="text-[10px]">X</span>
                    <Input placeholder="97" value={formData.dimensions_height || ''} onChange={(e) => updateField('dimensions_height', e.target.value)} className="h-7 text-xs" />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px]">Door Dims HxW (inch)</Label>
                  <div className="grid grid-cols-4 gap-1 items-center">
                    <Input placeholder="88" value={formData.door_dims_height || ''} onChange={(e) => updateField('door_dims_height', e.target.value)} className="h-7 text-xs" />
                    <span className="text-[10px]">X</span>
                    <Input placeholder="93" value={formData.door_dims_width || ''} onChange={(e) => updateField('door_dims_width', e.target.value)} className="h-7 text-xs" />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px]">Door Type</Label>
                  <Select value={formData.door_type || ''} onValueChange={(value) => updateField('door_type', value)}>
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue placeholder="Roll Up" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="roll-up">Roll Up</SelectItem>
                      <SelectItem value="swing">Swing</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px]">Has Side Door?</Label>
                  <RadioGroup value={formData.has_side_door ? 'yes' : 'no'} onValueChange={(value) => updateField('has_side_door', value === 'yes')}>
                    <div className="flex items-center space-x-2">
                      <div className="flex items-center space-x-1">
                        <RadioGroupItem value="yes" id="side-yes" className="h-3 w-3" />
                        <Label htmlFor="side-yes" className="text-[10px]">Yes</Label>
                      </div>
                      <div className="flex items-center space-x-1">
                        <RadioGroupItem value="no" id="side-no" className="h-3 w-3" />
                        <Label htmlFor="side-no" className="text-[10px]">No</Label>
                      </div>
                    </div>
                  </RadioGroup>
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px]">Vertical E-Track Rows</Label>
                  <Input type="number" value={formData.vertical_etrack_rows || '0'} onChange={(e) => updateField('vertical_etrack_rows', e.target.value)} className="h-7 text-xs" />
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px]">Horizontal E-Tracks</Label>
                  <Input type="number" value={formData.horizontal_etracks || '2'} onChange={(e) => updateField('horizontal_etracks', e.target.value)} className="h-7 text-xs" />
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px]">Lift Gate?</Label>
                  <RadioGroup value={formData.lift_gate ? 'yes' : 'no'} onValueChange={(value) => updateField('lift_gate', value === 'yes')}>
                    <div className="flex items-center space-x-2">
                      <div className="flex items-center space-x-1">
                        <RadioGroupItem value="yes" id="lift-yes" className="h-3 w-3" />
                        <Label htmlFor="lift-yes" className="text-[10px]">Yes</Label>
                      </div>
                      <div className="flex items-center space-x-1">
                        <RadioGroupItem value="no" id="lift-no" className="h-3 w-3" />
                        <Label htmlFor="lift-no" className="text-[10px]">No</Label>
                      </div>
                    </div>
                  </RadioGroup>
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px]">Lift Gate Capacity</Label>
                  <Input type="number" value={formData.lift_gate_capacity || '0'} onChange={(e) => updateField('lift_gate_capacity', e.target.value)} className="h-7 text-xs" />
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px]">Lift Gate Dims</Label>
                  <Input value={formData.lift_gate_dims || ''} onChange={(e) => updateField('lift_gate_dims', e.target.value)} className="h-7 text-xs" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Provider + Equipment + Vehicle Note */}
          <div className="space-y-2">
            <Card>
              <CardContent className="pt-2 space-y-2">
                <div className="flex justify-between items-center mb-1">
                  <h3 className="font-semibold text-xs">Provider</h3>
                  <Button variant="default" size="sm" className="bg-yellow-500 hover:bg-yellow-600 text-black h-6 text-[10px]">
                    Add Tracker
                  </Button>
                </div>
                
                <div className="grid grid-cols-3 gap-1 text-[10px] font-semibold border-b pb-1">
                  <div>Provider</div>
                  <div>Id</div>
                  <div>Status</div>
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px]">Toll device S/N</Label>
                  <Input value={formData.toll_device_sn || ''} onChange={(e) => updateField('toll_device_sn', e.target.value)} className="h-7 text-xs" />
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px]">Tracking device IMEI</Label>
                  <Input value={formData.tracking_device_imei || ''} onChange={(e) => updateField('tracking_device_imei', e.target.value)} className="h-7 text-xs" />
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px]">ELD device S/N</Label>
                  <Input value={formData.eld_device_sn || '01381285'} onChange={(e) => updateField('eld_device_sn', e.target.value)} className="h-7 text-xs" />
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px]">Dash Cam S/N</Label>
                  <Input value={formData.dash_cam_sn || ''} onChange={(e) => updateField('dash_cam_sn', e.target.value)} className="h-7 text-xs" />
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px]">Straps Count</Label>
                  <Input type="number" value={formData.straps_count || '12'} onChange={(e) => updateField('straps_count', e.target.value)} className="h-7 text-xs" />
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px]">Blankets</Label>
                  <Input type="number" value={formData.blankets || '10'} onChange={(e) => updateField('blankets', e.target.value)} className="h-7 text-xs" />
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px]">Pallet Jack</Label>
                  <RadioGroup value={formData.pallet_jack ? 'yes' : 'no'} onValueChange={(value) => updateField('pallet_jack', value === 'yes')}>
                    <div className="flex items-center space-x-2">
                      <div className="flex items-center space-x-1">
                        <RadioGroupItem value="yes" id="pj-yes" className="h-3 w-3" />
                        <Label htmlFor="pj-yes" className="text-[10px]">Yes</Label>
                      </div>
                      <div className="flex items-center space-x-1">
                        <RadioGroupItem value="no" id="pj-no" className="h-3 w-3" />
                        <Label htmlFor="pj-no" className="text-[10px]">No</Label>
                      </div>
                    </div>
                  </RadioGroup>
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px]">Pallet Jack Capacity</Label>
                  <Input type="number" value={formData.pallet_jack_capacity || ''} onChange={(e) => updateField('pallet_jack_capacity', e.target.value)} className="h-7 text-xs" />
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px]">Load bars (E-Track)</Label>
                  <Input type="number" value={formData.load_bars_etrack || '2'} onChange={(e) => updateField('load_bars_etrack', e.target.value)} className="h-7 text-xs" />
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px]">Load bars (Non E-Track)</Label>
                  <Input type="number" value={formData.load_bars_non_etrack || ''} onChange={(e) => updateField('load_bars_non_etrack', e.target.value)} className="h-7 text-xs" />
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px]">Trailer Tracking</Label>
                  <RadioGroup value={formData.trailer_tracking ? 'yes' : 'no'} onValueChange={(value) => updateField('trailer_tracking', value === 'yes')}>
                    <div className="flex items-center space-x-2">
                      <div className="flex items-center space-x-1">
                        <RadioGroupItem value="yes" id="tt-yes" className="h-3 w-3" />
                        <Label htmlFor="tt-yes" className="text-[10px]">Yes</Label>
                      </div>
                      <div className="flex items-center space-x-1">
                        <RadioGroupItem value="no" id="tt-no" className="h-3 w-3" />
                        <Label htmlFor="tt-no" className="text-[10px]">No</Label>
                      </div>
                    </div>
                  </RadioGroup>
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px]">Door Sensors</Label>
                  <RadioGroup value={formData.door_sensors ? 'yes' : 'no'} onValueChange={(value) => updateField('door_sensors', value === 'yes')}>
                    <div className="flex items-center space-x-2">
                      <div className="flex items-center space-x-1">
                        <RadioGroupItem value="yes" id="ds-yes" className="h-3 w-3" />
                        <Label htmlFor="ds-yes" className="text-[10px]">Yes</Label>
                      </div>
                      <div className="flex items-center space-x-1">
                        <RadioGroupItem value="no" id="ds-no" className="h-3 w-3" />
                        <Label htmlFor="ds-no" className="text-[10px]">No</Label>
                      </div>
                    </div>
                  </RadioGroup>
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px]">Temp Control</Label>
                  <RadioGroup value={formData.temp_control ? 'yes' : 'no'} onValueChange={(value) => updateField('temp_control', value === 'yes')}>
                    <div className="flex items-center space-x-2">
                      <div className="flex items-center space-x-1">
                        <RadioGroupItem value="yes" id="tc-yes" className="h-3 w-3" />
                        <Label htmlFor="tc-yes" className="text-[10px]">Yes</Label>
                      </div>
                      <div className="flex items-center space-x-1">
                        <RadioGroupItem value="no" id="tc-no" className="h-3 w-3" />
                        <Label htmlFor="tc-no" className="text-[10px]">No</Label>
                      </div>
                    </div>
                  </RadioGroup>
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px]">Panic Button</Label>
                  <RadioGroup value={formData.panic_button ? 'yes' : 'no'} onValueChange={(value) => updateField('panic_button', value === 'yes')}>
                    <div className="flex items-center space-x-2">
                      <div className="flex items-center space-x-1">
                        <RadioGroupItem value="yes" id="pb-yes" className="h-3 w-3" />
                        <Label htmlFor="pb-yes" className="text-[10px]">Yes</Label>
                      </div>
                      <div className="flex items-center space-x-1">
                        <RadioGroupItem value="no" id="pb-no" className="h-3 w-3" />
                        <Label htmlFor="pb-no" className="text-[10px]">No</Label>
                      </div>
                    </div>
                  </RadioGroup>
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px]">Team</Label>
                  <RadioGroup value={formData.team ? 'yes' : 'no'} onValueChange={(value) => updateField('team', value === 'yes')}>
                    <div className="flex items-center space-x-2">
                      <div className="flex items-center space-x-1">
                        <RadioGroupItem value="yes" id="team-yes" className="h-3 w-3" />
                        <Label htmlFor="team-yes" className="text-[10px]">Yes</Label>
                      </div>
                      <div className="flex items-center space-x-1">
                        <RadioGroupItem value="no" id="team-no" className="h-3 w-3" />
                        <Label htmlFor="team-no" className="text-[10px]">No</Label>
                      </div>
                    </div>
                  </RadioGroup>
                </div>
              </CardContent>
            </Card>

            {/* Vehicle Note */}
            <Card>
              <CardContent className="pt-2 space-y-1">
                <div className="flex justify-between items-center">
                  <h3 className="font-semibold text-xs">Vehicle Note</h3>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-5 w-5">
                      <X className="h-3 w-3 text-destructive" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-5 w-5">
                      <Save className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                </div>
                <Textarea
                  value={formData.notes || 'Would like to be in Atlanta Georgia this weekend'}
                  onChange={(e) => updateField('notes', e.target.value)}
                  rows={3}
                  className="text-xs"
                />
              </CardContent>
            </Card>
          </div>
        </div>
    </div>
  );
}
