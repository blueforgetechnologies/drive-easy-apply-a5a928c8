import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

export default function DispatcherDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dispatcher, setDispatcher] = useState<any>(null);

  useEffect(() => {
    if (id) {
      loadDispatcher();
    }
  }, [id]);

  const loadDispatcher = async () => {
    try {
      const { data, error } = await supabase
        .from("dispatchers")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      setDispatcher(data);
    } catch (error: any) {
      toast.error("Failed to load dispatcher details");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!dispatcher) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from("dispatchers")
        .update({
          first_name: dispatcher.first_name,
          last_name: dispatcher.last_name,
          email: dispatcher.email,
          phone: dispatcher.phone,
          address: dispatcher.address,
          status: dispatcher.status,
          hire_date: dispatcher.hire_date,
          termination_date: dispatcher.termination_date,
          pay_percentage: dispatcher.pay_percentage,
          dob: dispatcher.dob,
          license_number: dispatcher.license_number,
          license_issued_date: dispatcher.license_issued_date,
          license_expiration_date: dispatcher.license_expiration_date,
          application_status: dispatcher.application_status,
          contract_agreement: dispatcher.contract_agreement,
          emergency_contact_1_name: dispatcher.emergency_contact_1_name,
          emergency_contact_1_phone: dispatcher.emergency_contact_1_phone,
          emergency_contact_1_relationship: dispatcher.emergency_contact_1_relationship,
          emergency_contact_2_name: dispatcher.emergency_contact_2_name,
          emergency_contact_2_phone: dispatcher.emergency_contact_2_phone,
          emergency_contact_2_relationship: dispatcher.emergency_contact_2_relationship,
          role: dispatcher.role,
          notes: dispatcher.notes,
        })
        .eq("id", id);

      if (error) throw error;
      toast.success("Dispatcher updated successfully");
    } catch (error: any) {
      toast.error("Failed to update dispatcher");
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: string, value: any) => {
    setDispatcher((prev: any) => ({ ...prev, [field]: value }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!dispatcher) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Dispatcher not found</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard/dispatchers")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {dispatcher.first_name} {dispatcher.last_name}
            </h1>
            <p className="text-muted-foreground">Dispatcher Details</p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Status</Label>
              <Select value={dispatcher.status || "active"} onValueChange={(value) => updateField("status", value)}>
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

            <div>
              <Label>Hired Date</Label>
              <Input
                type="date"
                value={dispatcher.hire_date || ""}
                onChange={(e) => updateField("hire_date", e.target.value)}
              />
            </div>

            <div>
              <Label>Pay Percentage</Label>
              <Input
                type="number"
                step="0.001"
                placeholder="0.0685"
                value={dispatcher.pay_percentage || ""}
                onChange={(e) => updateField("pay_percentage", e.target.value)}
              />
            </div>

            <div>
              <Label>Termination Date</Label>
              <Input
                type="date"
                value={dispatcher.termination_date || ""}
                onChange={(e) => updateField("termination_date", e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>First Name</Label>
              <Input
                value={dispatcher.first_name || ""}
                onChange={(e) => updateField("first_name", e.target.value)}
              />
            </div>

            <div>
              <Label>Last Name</Label>
              <Input
                value={dispatcher.last_name || ""}
                onChange={(e) => updateField("last_name", e.target.value)}
              />
            </div>

            <div>
              <Label>Address</Label>
              <Input
                value={dispatcher.address || ""}
                onChange={(e) => updateField("address", e.target.value)}
              />
            </div>

            <div>
              <Label>Cell Phone</Label>
              <Input
                value={dispatcher.phone || ""}
                onChange={(e) => updateField("phone", e.target.value)}
              />
            </div>

            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={dispatcher.email || ""}
                onChange={(e) => updateField("email", e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Role Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Assign Role</Label>
              <Select value={dispatcher.role || ""} onValueChange={(value) => updateField("role", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Dispatcher">Dispatcher</SelectItem>
                  <SelectItem value="Dispatcher Lead">Dispatcher Lead</SelectItem>
                  <SelectItem value="Operations Manager">Operations Manager</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Emergency Contact 1</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Contact Name</Label>
              <Input
                value={dispatcher.emergency_contact_1_name || ""}
                onChange={(e) => updateField("emergency_contact_1_name", e.target.value)}
              />
            </div>

            <div>
              <Label>Phone</Label>
              <Input
                value={dispatcher.emergency_contact_1_phone || ""}
                onChange={(e) => updateField("emergency_contact_1_phone", e.target.value)}
              />
            </div>

            <div>
              <Label>Relationship</Label>
              <Input
                value={dispatcher.emergency_contact_1_relationship || ""}
                onChange={(e) => updateField("emergency_contact_1_relationship", e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Emergency Contact 2</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Contact Name</Label>
              <Input
                value={dispatcher.emergency_contact_2_name || ""}
                onChange={(e) => updateField("emergency_contact_2_name", e.target.value)}
              />
            </div>

            <div>
              <Label>Phone</Label>
              <Input
                value={dispatcher.emergency_contact_2_phone || ""}
                onChange={(e) => updateField("emergency_contact_2_phone", e.target.value)}
              />
            </div>

            <div>
              <Label>Relationship</Label>
              <Input
                value={dispatcher.emergency_contact_2_relationship || ""}
                onChange={(e) => updateField("emergency_contact_2_relationship", e.target.value)}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dispatcher License</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div>
            <Label>License Number</Label>
            <Input
              value={dispatcher.license_number || ""}
              onChange={(e) => updateField("license_number", e.target.value)}
            />
          </div>

          <div>
            <Label>Issued Date</Label>
            <Input
              type="date"
              value={dispatcher.license_issued_date || ""}
              onChange={(e) => updateField("license_issued_date", e.target.value)}
            />
          </div>

          <div>
            <Label>Expiration Date</Label>
            <Input
              type="date"
              value={dispatcher.license_expiration_date || ""}
              onChange={(e) => updateField("license_expiration_date", e.target.value)}
            />
          </div>

          <div>
            <Label>Application Status</Label>
            <Input
              value={dispatcher.application_status || ""}
              onChange={(e) => updateField("application_status", e.target.value)}
            />
          </div>

          <div>
            <Label>Contract Agreement</Label>
            <Input
              value={dispatcher.contract_agreement || ""}
              onChange={(e) => updateField("contract_agreement", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <textarea
            className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={dispatcher.notes || ""}
            onChange={(e) => updateField("notes", e.target.value)}
            placeholder="Additional notes about this dispatcher..."
          />
        </CardContent>
      </Card>
    </div>
  );
}
