import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { ArrowLeft, Save, MapPin, Search } from "lucide-react";

interface CarrierData {
  id: string;
  name: string;
  mc_number: string | null;
  dot_number: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  status: string;
  safer_status: string | null;
  safety_rating: string | null;
  carrier_symbol: string | null;
  dispatch_name: string | null;
  dispatch_phone: string | null;
  dispatch_email: string | null;
  after_hours_phone: string | null;
  personal_business: string | null;
  dun_bradstreet: string | null;
  emergency_contact_name: string | null;
  emergency_contact_title: string | null;
  emergency_contact_home_phone: string | null;
  emergency_contact_cell_phone: string | null;
  emergency_contact_email: string | null;
}

export default function CarrierDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [carrier, setCarrier] = useState<CarrierData | null>(null);
  const [usdotLookup, setUsdotLookup] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);

  useEffect(() => {
    loadCarrier();
  }, [id]);

  const loadCarrier = async () => {
    try {
      const { data, error } = await supabase
        .from("carriers")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      setCarrier(data);
      setUsdotLookup(data.dot_number || "");
    } catch (error: any) {
      toast.error("Failed to load carrier details");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!carrier) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("carriers")
        .update({
          name: carrier.name,
          mc_number: carrier.mc_number,
          dot_number: carrier.dot_number,
          contact_name: carrier.contact_name,
          email: carrier.email,
          phone: carrier.phone,
          address: carrier.address,
          status: carrier.status,
          safer_status: carrier.safer_status,
          safety_rating: carrier.safety_rating,
          carrier_symbol: carrier.carrier_symbol,
          dispatch_name: carrier.dispatch_name,
          dispatch_phone: carrier.dispatch_phone,
          dispatch_email: carrier.dispatch_email,
          after_hours_phone: carrier.after_hours_phone,
          personal_business: carrier.personal_business,
          dun_bradstreet: carrier.dun_bradstreet,
          emergency_contact_name: carrier.emergency_contact_name,
          emergency_contact_title: carrier.emergency_contact_title,
          emergency_contact_home_phone: carrier.emergency_contact_home_phone,
          emergency_contact_cell_phone: carrier.emergency_contact_cell_phone,
          emergency_contact_email: carrier.emergency_contact_email,
        })
        .eq("id", id);

      if (error) throw error;
      toast.success("Carrier updated successfully");
    } catch (error: any) {
      toast.error("Failed to update carrier: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUsdotLookup = async () => {
    if (!usdotLookup.trim()) {
      toast.error("Please enter a USDOT number");
      return;
    }

    setLookupLoading(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-carrier-data`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ usdot: usdotLookup }),
        }
      );
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Carrier not found");
      }

      const data = await response.json();
      
      if (carrier) {
        setCarrier({
          ...carrier,
          name: data.dba_name || data.name || carrier.name,
          mc_number: data.mc_number || carrier.mc_number,
          dot_number: data.usdot || usdotLookup,
          phone: data.phone || carrier.phone,
          address: data.physical_address || carrier.address,
          safer_status: data.safer_status || carrier.safer_status,
          safety_rating: data.safety_rating || carrier.safety_rating,
        });
      }
      
      toast.success("Carrier information loaded successfully");
    } catch (error: any) {
      toast.error("Failed to fetch carrier data: " + error.message);
    } finally {
      setLookupLoading(false);
    }
  };

  const updateField = (field: keyof CarrierData, value: any) => {
    if (carrier) {
      setCarrier({ ...carrier, [field]: value });
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  if (!carrier) {
    return <div className="text-center py-8">Carrier not found</div>;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate("/dashboard/business?subtab=carriers")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Carriers
          </Button>
          <h1 className="text-3xl font-bold">{carrier.name}</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end gap-2">
            <Label className="text-sm font-semibold">Status:</Label>
            <Select value={carrier.status} onValueChange={(value) => updateField("status", value)}>
              <SelectTrigger className="w-[180px] bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Safer Status & Dispatch Info */}
        <div className="space-y-6">
          {/* Safer Status Section */}
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div>
                <Label className="text-sm text-muted-foreground">Safer Status:</Label>
                <Badge 
                  variant={
                    carrier.safer_status?.toUpperCase().includes('NOT AUTHORIZED') 
                      ? 'destructive' 
                      : 'default'
                  }
                  className="mt-2 w-full justify-center py-2 text-sm font-medium"
                >
                  {carrier.safer_status || "AUTHORIZED FOR PROPERTY"}
                </Badge>
              </div>

              <div>
                <Label className="text-sm text-muted-foreground">Safer Rating Check:</Label>
                <Badge 
                  variant={
                    carrier.safety_rating?.toUpperCase() === 'CONDITIONAL'
                      ? 'destructive'
                      : 'default'
                  }
                  className="mt-2 w-full justify-center py-2 text-sm font-medium"
                >
                  {carrier.safety_rating || "NONE"}
                </Badge>
              </div>

              <Separator />

              <div>
                <Label className="text-sm text-muted-foreground">Carrier Admins:</Label>
                <div className="mt-2 flex items-center justify-between p-2 border rounded">
                  <span className="text-sm">{carrier.contact_name || "Not Set"}</span>
                  <Button size="sm" variant="outline" className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white">
                    EDIT
                  </Button>
                </div>
              </div>

              <div>
                <Label className="text-sm text-muted-foreground">Carrier Payees:</Label>
                <div className="mt-2 flex items-center justify-between p-2 border rounded">
                  <span className="text-sm">{carrier.contact_name || "Not Set"}</span>
                  <Button size="sm" variant="outline" className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white">
                    EDIT
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Dispatch Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Dispatch Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Dispatch Name:</Label>
                <div className="relative">
                  <Input
                    value={carrier.dispatch_name || ""}
                    onChange={(e) => updateField("dispatch_name", e.target.value)}
                  />
                  <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500" />
                </div>
              </div>

              <div>
                <Label>Dispatch Phone:</Label>
                <div className="relative">
                  <Input
                    value={carrier.dispatch_phone || ""}
                    onChange={(e) => updateField("dispatch_phone", e.target.value)}
                  />
                  <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500" />
                </div>
              </div>

              <div>
                <Label>Dispatch Email:</Label>
                <div className="relative">
                  <Input
                    type="email"
                    value={carrier.dispatch_email || ""}
                    onChange={(e) => updateField("dispatch_email", e.target.value)}
                  />
                  <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500" />
                </div>
              </div>

              <div>
                <Label>After Hours Phone:</Label>
                <div className="relative">
                  <Input
                    value={carrier.after_hours_phone || ""}
                    onChange={(e) => updateField("after_hours_phone", e.target.value)}
                  />
                  <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500" />
                </div>
              </div>

              <div>
                <Label>Personal/Business:</Label>
                <Input
                  value={carrier.personal_business || ""}
                  onChange={(e) => updateField("personal_business", e.target.value)}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Middle Column - Contact Information */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Contact Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Carrier Symbol:</Label>
                <Input
                  value={carrier.carrier_symbol || ""}
                  onChange={(e) => updateField("carrier_symbol", e.target.value)}
                />
              </div>

              <div>
                <Label>Company Name:</Label>
                <Input
                  value={carrier.name}
                  onChange={(e) => updateField("name", e.target.value)}
                />
              </div>

              <div>
                <Label>Address:</Label>
                <div className="relative">
                  <Input
                    value={carrier.address || ""}
                    onChange={(e) => updateField("address", e.target.value)}
                  />
                  <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>USDOT:</Label>
                  <Input
                    value={usdotLookup}
                    onChange={(e) => setUsdotLookup(e.target.value)}
                  />
                </div>
                <div className="flex items-end">
                  <Button 
                    onClick={handleUsdotLookup} 
                    disabled={lookupLoading}
                    className="w-full bg-blue-500 hover:bg-blue-600"
                  >
                    {lookupLoading ? "Loading..." : "Search"}
                  </Button>
                </div>
              </div>

              <div>
                <Label>MC:</Label>
                <Input
                  value={carrier.mc_number || ""}
                  onChange={(e) => updateField("mc_number", e.target.value)}
                />
              </div>

              <div>
                <Label>Phone:</Label>
                <div className="relative">
                  <Input
                    value={carrier.phone || ""}
                    onChange={(e) => updateField("phone", e.target.value)}
                  />
                  <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500" />
                </div>
              </div>

              <div>
                <Label>DUN &Brad Street:</Label>
                <div className="relative">
                  <Input
                    value={carrier.dun_bradstreet || ""}
                    onChange={(e) => updateField("dun_bradstreet", e.target.value)}
                  />
                  <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500" />
                </div>
              </div>

              <Separator />

              <div>
                <h3 className="font-semibold mb-4">Emergency Contact</h3>
                <div className="space-y-4">
                  <div>
                    <Label>Contact Name:</Label>
                    <div className="relative">
                      <Input
                        value={carrier.emergency_contact_name || ""}
                        onChange={(e) => updateField("emergency_contact_name", e.target.value)}
                      />
                      <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500" />
                    </div>
                  </div>

                  <div>
                    <Label>Title:</Label>
                    <Input
                      value={carrier.emergency_contact_title || ""}
                      onChange={(e) => updateField("emergency_contact_title", e.target.value)}
                    />
                  </div>

                  <div>
                    <Label>Home Phone:</Label>
                    <div className="relative">
                      <Input
                        value={carrier.emergency_contact_home_phone || ""}
                        onChange={(e) => updateField("emergency_contact_home_phone", e.target.value)}
                      />
                      <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500" />
                    </div>
                  </div>

                  <div>
                    <Label>Cell Phone:</Label>
                    <div className="relative">
                      <Input
                        value={carrier.emergency_contact_cell_phone || ""}
                        onChange={(e) => updateField("emergency_contact_cell_phone", e.target.value)}
                      />
                      <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500" />
                    </div>
                  </div>

                  <div>
                    <Label>Email:</Label>
                    <div className="relative">
                      <Input
                        type="email"
                        value={carrier.emergency_contact_email || ""}
                        onChange={(e) => updateField("emergency_contact_email", e.target.value)}
                      />
                      <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500" />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Payee Information */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Payee Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="border-b pb-2">
                <span className="text-sm font-medium text-blue-600 cursor-pointer hover:underline">
                  {carrier.contact_name || "Not Set"}
                </span>
              </div>

              <div>
                <Label className="text-sm text-muted-foreground">Contact:</Label>
                <p className="text-sm mt-1">{carrier.contact_name || "—"}</p>
              </div>

              <div>
                <Label className="text-sm text-muted-foreground">Phone:</Label>
                <p className="text-sm mt-1">{carrier.phone || "—"}</p>
              </div>

              <div>
                <Label className="text-sm text-muted-foreground">Physical Address:</Label>
                <p className="text-sm mt-1">{carrier.address || "—"}</p>
              </div>

              <div>
                <Label className="text-sm text-muted-foreground">Email:</Label>
                <p className="text-sm mt-1">{carrier.email || "—"}</p>
              </div>

              <div>
                <Label className="text-sm text-muted-foreground">Pay Percentage:</Label>
                <p className="text-sm mt-1">0</p>
              </div>

              <div>
                <Label className="text-sm text-muted-foreground">Auto Approve:</Label>
                <p className="text-sm mt-1">true</p>
              </div>

              <div>
                <Label className="text-sm text-muted-foreground">W9:</Label>
                <p className="text-sm mt-1">—</p>
              </div>

              <div>
                <Label className="text-sm text-muted-foreground">EIN:</Label>
                <p className="text-sm mt-1">—</p>
              </div>

              <Button className="w-full bg-blue-500 hover:bg-blue-600">
                Go to Payee Details
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
