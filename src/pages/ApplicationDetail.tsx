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
import { ArrowLeft, Save, Trash2 } from "lucide-react";

export default function ApplicationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<any>({});

  useEffect(() => {
    loadApplication();
  }, [id]);

  const loadApplication = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        navigate("/auth");
        return;
      }

      const { data, error } = await supabase
        .from("applications")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      setFormData(data);
    } catch (error: any) {
      toast.error("Error loading application");
      navigate("/dashboard");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("applications")
        .update(formData)
        .eq("id", id);

      if (error) throw error;
      toast.success("Driver information updated successfully");
    } catch (error: any) {
      toast.error("Failed to update driver information: " + error.message);
      console.error("Save error:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      const { error } = await supabase
        .from("applications")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Driver deleted successfully");
      navigate("/dashboard/drivers?filter=active");
    } catch (error: any) {
      toast.error("Failed to delete driver: " + error.message);
      console.error("Delete error:", error);
    }
  };

  const updateField = (field: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }));
  };

  const updateNestedField = (parent: string, field: string, value: any) => {
    setFormData((prev: any) => ({
      ...prev,
      [parent]: { ...prev[parent], [field]: value }
    }));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!formData) {
    return null;
  }

  const personalInfo = formData.personal_info || {};
  const licenseInfo = formData.license_info || {};
  const directDeposit = formData.direct_deposit || {};
  const emergencyContacts = formData.emergency_contacts || [];
  const primaryContact = emergencyContacts[0] || {};

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <Button onClick={() => navigate("/dashboard/drivers?filter=active")} variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Drivers
          </Button>
          <div className="flex gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Driver
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete the driver and all associated data.
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
            <Button onClick={handleSave} disabled={saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column */}
          <div className="space-y-4">
            {/* Status */}
            <div className="space-y-2">
              <Label>Status:</Label>
              <Select 
                value={formData.driver_status || 'pending'} 
                onValueChange={(value) => updateField('driver_status', value)}
              >
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

            {/* Driver Names */}
            <div className="space-y-2">
              <Label>Driver First Name:</Label>
              <Input 
                value={personalInfo.firstName || ''} 
                onChange={(e) => updateNestedField('personal_info', 'firstName', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Driver Last Name:</Label>
              <Input 
                value={personalInfo.lastName || ''} 
                onChange={(e) => updateNestedField('personal_info', 'lastName', e.target.value)}
              />
            </div>

            {/* Address */}
            <div className="space-y-2">
              <Label>Address:</Label>
              <Input 
                value={formData.driver_address || personalInfo.address || ''} 
                onChange={(e) => updateField('driver_address', e.target.value)}
              />
            </div>

            {/* Phones */}
            <div className="space-y-2">
              <Label>Home Phone:</Label>
              <Input 
                value={formData.home_phone || ''} 
                onChange={(e) => updateField('home_phone', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Cell Phone:</Label>
              <Input 
                value={formData.cell_phone || personalInfo.phone || ''} 
                onChange={(e) => updateField('cell_phone', e.target.value)}
              />
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label>Email:</Label>
              <Input 
                type="email"
                value={personalInfo.email || ''} 
                onChange={(e) => updateNestedField('personal_info', 'email', e.target.value)}
              />
            </div>

            {/* DOB & Age */}
            <div className="space-y-2">
              <Label>DOB:</Label>
              <Input 
                type="date"
                value={personalInfo.dateOfBirth || ''} 
                onChange={(e) => updateNestedField('personal_info', 'dateOfBirth', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Age:</Label>
              <Input 
                value={personalInfo.age || ''} 
                onChange={(e) => updateNestedField('personal_info', 'age', e.target.value)}
                readOnly
                className="bg-muted"
              />
            </div>

            {/* Emergency Contact */}
            <div className="pt-4">
              <h3 className="font-semibold mb-3">Emergency Contact</h3>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Contact Name 1:</Label>
                  <Input 
                    value={`${primaryContact.firstName || ''} ${primaryContact.lastName || ''}`.trim()} 
                    onChange={(e) => {
                      const [firstName, ...lastNameParts] = e.target.value.split(' ');
                      const updatedContacts = [...emergencyContacts];
                      updatedContacts[0] = {
                        ...updatedContacts[0],
                        firstName: firstName || '',
                        lastName: lastNameParts.join(' ') || ''
                      };
                      updateField('emergency_contacts', updatedContacts);
                    }}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Phone:</Label>
                  <Input 
                    value={primaryContact.phone || ''} 
                    onChange={(e) => {
                      const updatedContacts = [...emergencyContacts];
                      updatedContacts[0] = { ...updatedContacts[0], phone: e.target.value };
                      updateField('emergency_contacts', updatedContacts);
                    }}
                  />
                </div>

                <div className="space-y-2">
                  <Label>RelationShip:</Label>
                  <Input 
                    value={primaryContact.relationship || ''} 
                    onChange={(e) => {
                      const updatedContacts = [...emergencyContacts];
                      updatedContacts[0] = { ...updatedContacts[0], relationship: e.target.value };
                      updateField('emergency_contacts', updatedContacts);
                    }}
                  />
                </div>
              </div>
            </div>


            {/* Score Card */}
            <div className="space-y-2">
              <Label>Score Card</Label>
              <Input 
                value={formData.score_card || ''} 
                onChange={(e) => updateField('score_card', e.target.value)}
              />
            </div>
          </div>

          {/* Middle Column */}
          <div className="space-y-4">
            {/* Driver License */}
            <div className="border rounded-lg p-4">
              <h3 className="font-semibold mb-3">Driver Licence</h3>
              <div className="space-y-3">
                <Button variant="link" className="p-0 h-auto text-destructive">Upload</Button>
                
                <div className="space-y-2">
                  <Label>License #</Label>
                  <Input 
                    value={licenseInfo.licenseNumber || ''} 
                    onChange={(e) => updateNestedField('license_info', 'licenseNumber', e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Class:</Label>
                  <Input 
                    value={licenseInfo.class || ''} 
                    onChange={(e) => updateNestedField('license_info', 'class', e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Endorcements:</Label>
                  <Input 
                    value={licenseInfo.endorsements || ''} 
                    onChange={(e) => updateNestedField('license_info', 'endorsements', e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Issued Date:</Label>
                  <Input 
                    type="date"
                    value={licenseInfo.issuedDate || ''} 
                    onChange={(e) => updateNestedField('license_info', 'issuedDate', e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Expiration Date:</Label>
                  <Input 
                    type="date"
                    value={licenseInfo.expirationDate || ''} 
                    onChange={(e) => updateNestedField('license_info', 'expirationDate', e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Issued State:</Label>
                  <Input 
                    value={licenseInfo.state || ''} 
                    onChange={(e) => updateNestedField('license_info', 'state', e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Social Security Card */}
            <div className="space-y-3">
              <h3 className="font-semibold">Social Security Card</h3>
              <Button variant="link" className="p-0 h-auto text-primary">View</Button>
              <div className="space-y-2">
                <Label>SS#</Label>
                <Input 
                  value={personalInfo.ssn || ''} 
                  onChange={(e) => updateNestedField('personal_info', 'ssn', e.target.value)}
                />
              </div>
            </div>

            {/* Driver Record */}
            <div className="space-y-3">
              <h3 className="font-semibold">Driver Record</h3>
              <Button variant="link" className="p-0 h-auto text-destructive">Upload</Button>
              <div className="space-y-2">
                <Label>Expiration Date:</Label>
                <Input 
                  type="date"
                  value={formData.driver_record_expiry || ''} 
                  onChange={(e) => updateField('driver_record_expiry', e.target.value)}
                />
              </div>
            </div>

            {/* Medical Card */}
            <div className="space-y-3">
              <h3 className="font-semibold">Medical Card:</h3>
              <Button variant="link" className="p-0 h-auto text-primary">View</Button>
              <div className="space-y-2">
                <Label>Expiration Date:</Label>
                <Input 
                  type="date"
                  value={formData.medical_card_expiry || licenseInfo.dotCardExpiration || ''} 
                  onChange={(e) => updateField('medical_card_expiry', e.target.value)}
                />
              </div>
            </div>

            {/* Restrictions */}
            <div className="space-y-2">
              <Label>Restrictions:</Label>
              <Input 
                value={formData.restrictions || ''} 
                onChange={(e) => updateField('restrictions', e.target.value)}
              />
            </div>

            {/* National Registry */}
            <div className="space-y-2">
              <Label>National Registry</Label>
              <Input 
                value={formData.national_registry || ''} 
                onChange={(e) => updateField('national_registry', e.target.value)}
              />
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-4">
            {/* Bank Information */}
            <div className="border rounded-lg p-4">
              <h3 className="font-semibold mb-3">Banking Information</h3>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Bank Name</Label>
                  <Input 
                    value={formData.bank_name || directDeposit.bankName || ''} 
                    onChange={(e) => updateField('bank_name', e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Name on the account</Label>
                  <Input 
                    value={formData.account_name || `${directDeposit.firstName} ${directDeposit.lastName}`.trim() || ''} 
                    onChange={(e) => updateField('account_name', e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Routing #</Label>
                  <Input 
                    value={formData.routing_number || directDeposit.routingNumber || ''} 
                    onChange={(e) => updateField('routing_number', e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Checking #</Label>
                  <Input 
                    value={formData.checking_number || directDeposit.checkingNumber || ''} 
                    onChange={(e) => updateField('checking_number', e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Business/Personal</Label>
                  <Input 
                    value={formData.account_type || directDeposit.accountType || ''} 
                    onChange={(e) => updateField('account_type', e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Pay Method */}
            <div className="space-y-3">
              <Label>Pay Method</Label>
              <RadioGroup 
                value={formData.pay_method || 'salary'} 
                onValueChange={(value) => updateField('pay_method', value)}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="salary" id="salary" />
                  <Label htmlFor="salary">Salary</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="mileage" id="mileage" />
                  <Label htmlFor="mileage">Mileage</Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label>Pay Per Mile:</Label>
              <Input 
                type="number"
                step="0.01"
                value={formData.pay_per_mile || ''} 
                onChange={(e) => updateField('pay_per_mile', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Weekly Salary:</Label>
              <Input 
                type="number"
                step="0.01"
                value={formData.weekly_salary || ''} 
                onChange={(e) => updateField('weekly_salary', e.target.value)}
              />
            </div>

            {/* Work Permit */}
            <div className="space-y-3">
              <h3 className="font-semibold">Work Permit</h3>
              <Button variant="link" className="p-0 h-auto text-primary">View</Button>
              <div className="space-y-2">
                <Label>Expiration Date:</Label>
                <Input 
                  type="date"
                  value={formData.work_permit_expiry || ''} 
                  onChange={(e) => updateField('work_permit_expiry', e.target.value)}
                />
              </div>
            </div>

            {/* Green Card */}
            <div className="space-y-3">
              <h3 className="font-semibold">Green Card</h3>
              <Button variant="link" className="p-0 h-auto text-primary">View</Button>
              <div className="space-y-2">
                <Label>Expiration Date:</Label>
                <Input 
                  type="date"
                  value={formData.green_card_expiry || ''} 
                  onChange={(e) => updateField('green_card_expiry', e.target.value)}
                />
              </div>
            </div>

            {/* Job Application */}
            <div className="space-y-3">
              <h3 className="font-semibold">Job Application</h3>
              <Button variant="link" className="p-0 h-auto text-primary">View</Button>
              
              <div className="space-y-2">
                <Label>Application Date</Label>
                <Input 
                  type="date"
                  value={formData.application_date || formData.submitted_at?.split('T')[0] || ''} 
                  onChange={(e) => updateField('application_date', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Hired Date:</Label>
                <Input 
                  type="date"
                  value={formData.hired_date || ''} 
                  onChange={(e) => updateField('hired_date', e.target.value)}
                />
              </div>
            </div>

            {/* Driver Notes */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-primary">Driver Notes</Label>
                <div className="flex gap-1">
                  <Button 
                    variant="ghost" 
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => updateField('vehicle_note', '')}
                  >
                    Clear
                  </Button>
                  <Button 
                    variant="default" 
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={async () => {
                      try {
                        const { error } = await supabase
                          .from("applications")
                          .update({ vehicle_note: formData.vehicle_note })
                          .eq("id", id);
                        if (error) throw error;
                        toast.success("Driver notes saved");
                      } catch (error: any) {
                        toast.error("Failed to save notes: " + error.message);
                      }
                    }}
                  >
                    Save
                  </Button>
                </div>
              </div>
              <Textarea 
                value={formData.vehicle_note || ''} 
                onChange={(e) => updateField('vehicle_note', e.target.value)}
                rows={4}
                className="resize-none"
                placeholder="Dispatcher will be able to view this in the Load Hunter"
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}