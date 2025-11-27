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
import { ArrowLeft, Save, X, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";

export default function VehicleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<any>({});
  const [samsaraStats, setSamsaraStats] = useState<any>(null);
  const [loadingStats, setLoadingStats] = useState(false);

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
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex gap-4">
            <Button onClick={() => navigate("/dashboard/vehicles?filter=active")} variant="outline" size="sm">
              Go To Basic
            </Button>
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground">Vehicle Status</span>
              <Select 
                value={formData.status || 'active'} 
                onValueChange={(value) => updateField('status', value)}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex flex-col text-sm">
                <div className="flex gap-4">
                  <span className="text-muted-foreground">Odometer</span>
                  <span className="font-medium">
                    {loadingStats ? '...' : (samsaraStats?.odometer || formData.odometer || 'N/A')}
                  </span>
                </div>
                <div className="flex gap-4">
                  <span className="text-muted-foreground">Location</span>
                  <span className="font-medium">
                    {loadingStats ? '...' : (samsaraStats?.location || formData.last_location || 'N/A')}
                  </span>
                </div>
              </div>
              <div className="flex flex-col text-sm">
                <div className="flex gap-4">
                  <span className="text-muted-foreground">Speed</span>
                  <span className="font-medium">
                    {loadingStats ? '...' : (samsaraStats?.stoppedStatus || formData.stopped_status || 'N/A')}
                  </span>
                </div>
                <div className="flex gap-4">
                  <span className="text-muted-foreground">Last Updated</span>
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
                className="h-8"
              >
                <RefreshCw className={`h-4 w-4 ${loadingStats ? 'animate-spin' : ''}`} />
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
            <Button variant="outline" onClick={() => navigate("/dashboard/vehicles?filter=active")}>
              CANCEL
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "SAVING..." : "SUBMIT"}
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column */}
          <div className="space-y-6">
            <Card>
              <CardContent className="pt-6 space-y-4">
                <h3 className="font-semibold mb-4">Update Vehicle</h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>UNIT ID:</Label>
                    <Select value={formData.vehicle_number || ''} onValueChange={(value) => updateField('vehicle_number', value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select Unit" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NATL">NATL</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Input value="6" readOnly className="bg-muted" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Carrier Name</Label>
                  <Select value={formData.carrier || ''} onValueChange={(value) => updateField('carrier', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select Carrier" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALLIED FREIGHTLINE LLC">ALLIED FREIGHTLINE LLC</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Bid As</Label>
                  <Select value={formData.bid_as || ''} onValueChange={(value) => updateField('bid_as', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TALBI LOGISTICS LLC">TALBI LOGISTICS LLC</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Payee</Label>
                  <Select value={formData.payee || ''} onValueChange={(value) => updateField('payee', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select Payee" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Sofiane Talbi">Sofiane Talbi</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Driver 1</Label>
                  <Select value={formData.driver_1_id || ''} onValueChange={(value) => updateField('driver_1_id', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select Driver" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="jose">Jose Lopez</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Driver 2</Label>
                  <Select value={formData.driver_2_id || ''} onValueChange={(value) => updateField('driver_2_id', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select Driver" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Driver Paid By Carrier?</Label>
                  <RadioGroup defaultValue="no">
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="yes" id="paid-yes" />
                        <Label htmlFor="paid-yes">Yes</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="no" id="paid-no" />
                        <Label htmlFor="paid-no">No</Label>
                      </div>
                    </div>
                  </RadioGroup>
                </div>

                <div className="space-y-2">
                  <Label>Primary Dispatcher</Label>
                  <Select value={formData.primary_dispatcher_id || ''} onValueChange={(value) => updateField('primary_dispatcher_id', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Raymond Jones" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="raymond">Raymond Jones</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Asset Ownership</Label>
                  <RadioGroup value={formData.asset_ownership || 'owned'} onValueChange={(value) => updateField('asset_ownership', value)}>
                    <div className="flex items-center space-x-4">
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
                    </div>
                  </RadioGroup>
                </div>

                <div className="space-y-2">
                  <Label>Pickup Date & Odometer</Label>
                  <Button variant="link" className="p-0 h-auto text-primary">VIEW PICS</Button>
                </div>

                <div className="space-y-2">
                  <Label>Return Date & Odometer</Label>
                  <Button variant="link" className="p-0 h-auto text-destructive">Upload</Button>
                </div>

                <div className="space-y-2">
                  <Label>View leasing Historical records</Label>
                  <Button variant="link" className="p-0 h-auto text-primary underline">View leasing Historical records</Button>
                </div>

                <div className="space-y-2">
                  <Label>Issues Per Gallon</Label>
                  <Input type="number" step="0.01" value={formData.fuel_per_gallon || '7.5'} onChange={(e) => updateField('fuel_per_gallon', e.target.value)} />
                </div>

                <div className="space-y-2">
                  <Label>Insurance Cost per Month</Label>
                  <Input type="number" step="0.01" value={formData.insurance_cost_per_month || '1700'} onChange={(e) => updateField('insurance_cost_per_month', e.target.value)} />
                </div>
              </CardContent>
            </Card>

            {/* Coverage Table */}
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <div className="grid grid-cols-4 gap-2 text-sm font-semibold border-b pb-2">
                    <div>Type</div>
                    <div>Status</div>
                    <div>Exp Date</div>
                    <div>Remaining</div>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-sm">
                    <div>Physical Coverage</div>
                    <div>
                      <Input type="date" className="h-8 text-xs" />
                    </div>
                    <div>
                      <Input type="date" className="h-8 text-xs" />
                    </div>
                    <div></div>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-sm">
                    <div>Cargo Coverage</div>
                    <div>
                      <Input type="date" className="h-8 text-xs" />
                    </div>
                    <div>
                      <Input type="date" className="h-8 text-xs" />
                    </div>
                    <div></div>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-sm">
                    <div>Registration</div>
                    <div>
                      <Input type="date" className="h-8 text-xs" />
                    </div>
                    <div>
                      <Input type="date" className="h-8 text-xs" />
                    </div>
                    <div></div>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-sm">
                    <div>Liability Coverage</div>
                    <div>
                      <Input type="date" className="h-8 text-xs" />
                    </div>
                    <div>
                      <Input type="date" className="h-8 text-xs" />
                    </div>
                    <div></div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Maintenance Type */}
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="font-semibold">Maintenance Type</h3>
                    <Button variant="default" size="sm" className="bg-yellow-500 hover:bg-yellow-600 text-black">
                      Add Reminder
                    </Button>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-sm font-semibold border-b pb-2">
                    <div>Type</div>
                    <div>Due by</div>
                    <div>Due</div>
                    <div>Remaining</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="space-y-2">
                  <Label>Year</Label>
                  <Input value={formData.year || ''} onChange={(e) => updateField('year', parseInt(e.target.value))} />
                </div>

                <div className="space-y-2">
                  <Label>Make</Label>
                  <Input value={formData.make || ''} onChange={(e) => updateField('make', e.target.value)} />
                </div>

                <div className="space-y-2">
                  <Label>Model</Label>
                  <Input value={formData.model || ''} onChange={(e) => updateField('model', e.target.value)} />
                </div>

                <div className="space-y-2">
                  <Label>Reg Plate #</Label>
                  <Input value={formData.reg_plate || ''} onChange={(e) => updateField('reg_plate', e.target.value)} />
                </div>

                <div className="space-y-2">
                  <Label>Reg State</Label>
                  <Input value={formData.reg_state || 'CA'} onChange={(e) => updateField('reg_state', e.target.value)} />
                </div>

                <div className="space-y-2">
                  <Label>VIN</Label>
                  <Input value={formData.vin || ''} onChange={(e) => updateField('vin', e.target.value)} />
                </div>

                <div className="space-y-2">
                  <Label>Asset Size / Type</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <Input placeholder="24" value={formData.dimensions_length || ''} onChange={(e) => updateField('dimensions_length', e.target.value)} />
                    <span className="flex items-center">ft.</span>
                    <Select value={formData.asset_type || ''} onValueChange={(value) => updateField('asset_type', value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Large Straight" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Large Straight">Large Straight</SelectItem>
                        <SelectItem value="Air Ride">Air Ride</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Axles</Label>
                  <Input type="number" value={formData.axles || '2'} onChange={(e) => updateField('axles', e.target.value)} />
                </div>

                <div className="space-y-2">
                  <Label>Specialty</Label>
                  <Input value="" />
                </div>

                <div className="space-y-2">
                  <Label>Clearance</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <Input value={formData.clearance || '13'} onChange={(e) => updateField('clearance', e.target.value)} />
                    <span className="flex items-center">ft</span>
                    <span className="flex items-center">in</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Payload</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Input value={formData.payload || '9000'} onChange={(e) => updateField('payload', e.target.value)} />
                    <span className="flex items-center">lbs</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Dock High</Label>
                  <RadioGroup defaultValue="yes">
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="yes" id="dock-yes" />
                        <Label htmlFor="dock-yes">Yes</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="no" id="dock-no" />
                        <Label htmlFor="dock-no">No</Label>
                      </div>
                    </div>
                  </RadioGroup>
                </div>

                <div className="space-y-2">
                  <Label>Suspension</Label>
                  <Input value={formData.suspension || ''} onChange={(e) => updateField('suspension', e.target.value)} />
                </div>

                <div className="space-y-2">
                  <Label>Air Ride?</Label>
                  <RadioGroup value={formData.air_ride ? 'yes' : 'no'} onValueChange={(value) => updateField('air_ride', value === 'yes')}>
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="yes" id="air-yes" />
                        <Label htmlFor="air-yes">Yes</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="no" id="air-no" />
                        <Label htmlFor="air-no">No</Label>
                      </div>
                    </div>
                  </RadioGroup>
                </div>

                <div className="space-y-2">
                  <Label>Dimensions LxWxH (inch)</Label>
                  <div className="grid grid-cols-5 gap-2">
                    <Input placeholder="288" value={formData.dimensions_length || ''} onChange={(e) => updateField('dimensions_length', e.target.value)} />
                    <span className="flex items-center">X</span>
                    <Input placeholder="96" value={formData.dimensions_width || ''} onChange={(e) => updateField('dimensions_width', e.target.value)} />
                    <span className="flex items-center">X</span>
                    <Input placeholder="103" value={formData.dimensions_height || ''} onChange={(e) => updateField('dimensions_height', e.target.value)} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Door Dims HxW (inch)</Label>
                  <div className="grid grid-cols-4 gap-2">
                    <Input placeholder="96" value={formData.door_dims_height || ''} onChange={(e) => updateField('door_dims_height', e.target.value)} />
                    <span className="flex items-center">X</span>
                    <Input placeholder="94" value={formData.door_dims_width || ''} onChange={(e) => updateField('door_dims_width', e.target.value)} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Door Type</Label>
                  <Select value={formData.door_type || ''} onValueChange={(value) => updateField('door_type', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Roll Up" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="roll-up">Roll Up</SelectItem>
                      <SelectItem value="swing">Swing</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Has Side Door?</Label>
                  <RadioGroup value={formData.has_side_door ? 'yes' : 'no'} onValueChange={(value) => updateField('has_side_door', value === 'yes')}>
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="yes" id="side-yes" />
                        <Label htmlFor="side-yes">Yes</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="no" id="side-no" />
                        <Label htmlFor="side-no">No</Label>
                      </div>
                    </div>
                  </RadioGroup>
                </div>

                <div className="space-y-2">
                  <Label>Vertical E-Track Rows</Label>
                  <Input type="number" value={formData.vertical_etrack_rows || '0'} onChange={(e) => updateField('vertical_etrack_rows', e.target.value)} />
                </div>

                <div className="space-y-2">
                  <Label>Horizontal E-Tracks</Label>
                  <Input type="number" value={formData.horizontal_etracks || '2'} onChange={(e) => updateField('horizontal_etracks', e.target.value)} />
                </div>

                <div className="space-y-2">
                  <Label>Lift Gate?</Label>
                  <RadioGroup value={formData.lift_gate ? 'yes' : 'no'} onValueChange={(value) => updateField('lift_gate', value === 'yes')}>
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="yes" id="lift-yes" />
                        <Label htmlFor="lift-yes">Yes</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="no" id="lift-no" />
                        <Label htmlFor="lift-no">No</Label>
                      </div>
                    </div>
                  </RadioGroup>
                </div>

                <div className="space-y-2">
                  <Label>Lift Gate Capacity</Label>
                  <Input type="number" value={formData.lift_gate_capacity || '0'} onChange={(e) => updateField('lift_gate_capacity', e.target.value)} />
                </div>

                <div className="space-y-2">
                  <Label>Lift Gate Dims</Label>
                  <Input value={formData.lift_gate_dims || ''} onChange={(e) => updateField('lift_gate_dims', e.target.value)} />
                </div>
              </CardContent>
            </Card>

            {/* Provider Section */}
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-semibold">Provider</h3>
                  <Button variant="default" size="sm" className="bg-yellow-500 hover:bg-yellow-600 text-black">
                    Add Tracker
                  </Button>
                </div>
                
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Toll device S/N</Label>
                    <Input value={formData.toll_device_sn || ''} onChange={(e) => updateField('toll_device_sn', e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Id</Label>
                    <Input value={formData.provider_id || ''} onChange={(e) => updateField('provider_id', e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Input value={formData.provider_status || ''} onChange={(e) => updateField('provider_status', e.target.value)} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Tracking device IMEI</Label>
                  <Input value={formData.tracking_device_imei || ''} onChange={(e) => updateField('tracking_device_imei', e.target.value)} />
                </div>

                <div className="space-y-2">
                  <Label>ELD device S/N</Label>
                  <Input value={formData.eld_device_sn || ''} onChange={(e) => updateField('eld_device_sn', e.target.value)} />
                </div>

                <div className="space-y-2">
                  <Label>Dash Cam S/N</Label>
                  <Input value={formData.dash_cam_sn || ''} onChange={(e) => updateField('dash_cam_sn', e.target.value)} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Straps Count</Label>
                    <Input type="number" value={formData.straps_count || '10'} onChange={(e) => updateField('straps_count', e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Blankets</Label>
                    <Input type="number" value={formData.blankets || '10'} onChange={(e) => updateField('blankets', e.target.value)} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Pallet Jack</Label>
                  <RadioGroup value={formData.pallet_jack ? 'yes' : 'no'} onValueChange={(value) => updateField('pallet_jack', value === 'yes')}>
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="yes" id="pj-yes" />
                        <Label htmlFor="pj-yes">Yes</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="no" id="pj-no" />
                        <Label htmlFor="pj-no">No</Label>
                      </div>
                    </div>
                  </RadioGroup>
                </div>

                <div className="space-y-2">
                  <Label>Pallet Jack Capacity</Label>
                  <Input type="number" value={formData.pallet_jack_capacity || ''} onChange={(e) => updateField('pallet_jack_capacity', e.target.value)} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Load bars (E-Track)</Label>
                    <Input type="number" value={formData.load_bars_etrack || '2'} onChange={(e) => updateField('load_bars_etrack', e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Load bars (Non E-Track)</Label>
                    <Input type="number" value={formData.load_bars_non_etrack || ''} onChange={(e) => updateField('load_bars_non_etrack', e.target.value)} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Trailer Tracking</Label>
                  <RadioGroup value={formData.trailer_tracking ? 'yes' : 'no'} onValueChange={(value) => updateField('trailer_tracking', value === 'yes')}>
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="yes" id="tt-yes" />
                        <Label htmlFor="tt-yes">Yes</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="no" id="tt-no" />
                        <Label htmlFor="tt-no">No</Label>
                      </div>
                    </div>
                  </RadioGroup>
                </div>

                <div className="space-y-2">
                  <Label>Door Sensors</Label>
                  <RadioGroup value={formData.door_sensors ? 'yes' : 'no'} onValueChange={(value) => updateField('door_sensors', value === 'yes')}>
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="yes" id="ds-yes" />
                        <Label htmlFor="ds-yes">Yes</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="no" id="ds-no" />
                        <Label htmlFor="ds-no">No</Label>
                      </div>
                    </div>
                  </RadioGroup>
                </div>

                <div className="space-y-2">
                  <Label>Temp Control</Label>
                  <RadioGroup value={formData.temp_control ? 'yes' : 'no'} onValueChange={(value) => updateField('temp_control', value === 'yes')}>
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="yes" id="tc-yes" />
                        <Label htmlFor="tc-yes">Yes</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="no" id="tc-no" />
                        <Label htmlFor="tc-no">No</Label>
                      </div>
                    </div>
                  </RadioGroup>
                </div>

                <div className="space-y-2">
                  <Label>Panic Button</Label>
                  <RadioGroup value={formData.panic_button ? 'yes' : 'no'} onValueChange={(value) => updateField('panic_button', value === 'yes')}>
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="yes" id="pb-yes" />
                        <Label htmlFor="pb-yes">Yes</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="no" id="pb-no" />
                        <Label htmlFor="pb-no">No</Label>
                      </div>
                    </div>
                  </RadioGroup>
                </div>

                <div className="space-y-2">
                  <Label>Team</Label>
                  <RadioGroup value={formData.team ? 'yes' : 'no'} onValueChange={(value) => updateField('team', value === 'yes')}>
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="yes" id="team-yes" />
                        <Label htmlFor="team-yes">Yes</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="no" id="team-no" />
                        <Label htmlFor="team-no">No</Label>
                      </div>
                    </div>
                  </RadioGroup>
                </div>
              </CardContent>
            </Card>

            {/* Vehicle Note */}
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-semibold">Vehicle Note</h3>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <X className="h-4 w-4 text-destructive" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <Save className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                <Textarea
                  value={formData.notes || 'send home for thanksgiving'}
                  onChange={(e) => updateField('notes', e.target.value)}
                  rows={3}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
