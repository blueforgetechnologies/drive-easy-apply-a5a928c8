import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

export default function LocationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [location, setLocation] = useState<any>(null);

  useEffect(() => {
    if (id) {
      loadLocation();
    }
  }, [id]);

  const loadLocation = async () => {
    try {
      const { data, error } = await supabase
        .from("locations")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      setLocation(data);
    } catch (error: any) {
      toast.error("Failed to load location details");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!location) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from("locations")
        .update({
          name: location.name,
          type: location.type,
          address: location.address,
          city: location.city,
          state: location.state,
          zip: location.zip,
          latitude: location.latitude,
          longitude: location.longitude,
          hours: location.hours,
          pickup_instructions: location.pickup_instructions,
          delivery_instructions: location.delivery_instructions,
          notes: location.notes,
          status: location.status,
        })
        .eq("id", id);

      if (error) throw error;
      toast.success("Location updated successfully");
    } catch (error: any) {
      toast.error("Failed to update location");
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: string, value: any) => {
    setLocation((prev: any) => ({ ...prev, [field]: value }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!location) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Location not found</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard/locations")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{location.name}</h1>
            <p className="text-muted-foreground">Location Details</p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Location Name</Label>
              <Input
                value={location.name || ""}
                onChange={(e) => updateField("name", e.target.value)}
              />
            </div>

            <div>
              <Label>Type</Label>
              <Select value={location.type || "shipper"} onValueChange={(value) => updateField("type", value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="shipper">Shipper</SelectItem>
                  <SelectItem value="consignee">Consignee</SelectItem>
                  <SelectItem value="yard">Yard</SelectItem>
                  <SelectItem value="shop">Shop</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Status</Label>
              <Select value={location.status || "active"} onValueChange={(value) => updateField("status", value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Hours</Label>
              <Input
                value={location.hours || ""}
                onChange={(e) => updateField("hours", e.target.value)}
                placeholder="Mon-Fri 8AM-5PM"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Address</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Street Address</Label>
              <Input
                value={location.address || ""}
                onChange={(e) => updateField("address", e.target.value)}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>City</Label>
                <Input
                  value={location.city || ""}
                  onChange={(e) => updateField("city", e.target.value)}
                />
              </div>

              <div>
                <Label>State</Label>
                <Input
                  value={location.state || ""}
                  onChange={(e) => updateField("state", e.target.value)}
                  maxLength={2}
                />
              </div>

              <div>
                <Label>ZIP</Label>
                <Input
                  value={location.zip || ""}
                  onChange={(e) => updateField("zip", e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Latitude</Label>
                <Input
                  type="number"
                  step="0.000001"
                  value={location.latitude || ""}
                  onChange={(e) => updateField("latitude", e.target.value)}
                />
              </div>

              <div>
                <Label>Longitude</Label>
                <Input
                  type="number"
                  step="0.000001"
                  value={location.longitude || ""}
                  onChange={(e) => updateField("longitude", e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Instructions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Pickup Instructions</Label>
            <Textarea
              value={location.pickup_instructions || ""}
              onChange={(e) => updateField("pickup_instructions", e.target.value)}
              placeholder="Enter pickup instructions..."
              rows={3}
            />
          </div>

          <div>
            <Label>Delivery Instructions</Label>
            <Textarea
              value={location.delivery_instructions || ""}
              onChange={(e) => updateField("delivery_instructions", e.target.value)}
              placeholder="Enter delivery instructions..."
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={location.notes || ""}
            onChange={(e) => updateField("notes", e.target.value)}
            placeholder="Additional notes about this location..."
            rows={4}
          />
        </CardContent>
      </Card>
    </div>
  );
}
