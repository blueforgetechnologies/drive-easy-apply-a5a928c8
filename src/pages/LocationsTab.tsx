import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Search, MapPin, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function LocationsTab() {
  const navigate = useNavigate();
  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState("active");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newLocation, setNewLocation] = useState({
    name: "",
    type: "shipper",
    address: "",
    city: "",
    state: "",
    zip: "",
    phone: "",
    hours: "",
    pickup_instructions: "",
    delivery_instructions: "",
    notes: "",
  });

  useEffect(() => {
    loadLocations();
  }, [activeFilter]);

  const loadLocations = async () => {
    try {
      let query = supabase.from("locations").select("*").order("name");
      
      if (activeFilter !== "all") {
        query = query.eq("status", activeFilter);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      setLocations(data || []);
    } catch (error: any) {
      toast.error("Failed to load locations");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddLocation = async () => {
    try {
      const { error } = await supabase.from("locations").insert([newLocation]);
      if (error) throw error;
      toast.success("Location added successfully");
      setDialogOpen(false);
      setNewLocation({
        name: "",
        type: "shipper",
        address: "",
        city: "",
        state: "",
        zip: "",
        phone: "",
        hours: "",
        pickup_instructions: "",
        delivery_instructions: "",
        notes: "",
      });
      loadLocations();
    } catch (error: any) {
      toast.error("Failed to add location");
      console.error(error);
    }
  };

  const handleDeleteLocation = async (id: string) => {
    if (!confirm("Are you sure you want to delete this location?")) return;
    
    try {
      const { error } = await supabase.from("locations").delete().eq("id", id);
      if (error) throw error;
      toast.success("Location deleted successfully");
      loadLocations();
    } catch (error: any) {
      toast.error("Failed to delete location");
      console.error(error);
    }
  };

  const filteredLocations = locations.filter((location) =>
    location.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    location.city?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    location.type?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const locationCounts = {
    active: locations.filter(l => l.status === "active").length,
    inactive: locations.filter(l => l.status === "inactive").length,
    all: locations.length
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Locations</h1>
          <p className="text-muted-foreground">Manage facilities and delivery locations</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Add Location</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New Location</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Location Name *</Label>
                  <Input
                    value={newLocation.name}
                    onChange={(e) => setNewLocation({ ...newLocation, name: e.target.value })}
                    placeholder="ABC Warehouse"
                  />
                </div>
                <div>
                  <Label>Type *</Label>
                  <Select value={newLocation.type} onValueChange={(value) => setNewLocation({ ...newLocation, type: value })}>
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
              </div>
              
              <div>
                <Label>Address</Label>
                <Input
                  value={newLocation.address}
                  onChange={(e) => setNewLocation({ ...newLocation, address: e.target.value })}
                  placeholder="123 Main St"
                />
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>City</Label>
                  <Input
                    value={newLocation.city}
                    onChange={(e) => setNewLocation({ ...newLocation, city: e.target.value })}
                  />
                </div>
                <div>
                  <Label>State</Label>
                  <Input
                    value={newLocation.state}
                    onChange={(e) => setNewLocation({ ...newLocation, state: e.target.value })}
                    maxLength={2}
                  />
                </div>
                <div>
                  <Label>ZIP</Label>
                  <Input
                    value={newLocation.zip}
                    onChange={(e) => setNewLocation({ ...newLocation, zip: e.target.value })}
                  />
                </div>
              </div>
              
              <div>
                <Label>Hours</Label>
                <Input
                  value={newLocation.hours}
                  onChange={(e) => setNewLocation({ ...newLocation, hours: e.target.value })}
                  placeholder="Mon-Fri 8AM-5PM"
                />
              </div>
              
              <div>
                <Label>Pickup Instructions</Label>
                <Input
                  value={newLocation.pickup_instructions}
                  onChange={(e) => setNewLocation({ ...newLocation, pickup_instructions: e.target.value })}
                />
              </div>
              
              <div>
                <Label>Delivery Instructions</Label>
                <Input
                  value={newLocation.delivery_instructions}
                  onChange={(e) => setNewLocation({ ...newLocation, delivery_instructions: e.target.value })}
                />
              </div>
              
              <div>
                <Label>Notes</Label>
                <Input
                  value={newLocation.notes}
                  onChange={(e) => setNewLocation({ ...newLocation, notes: e.target.value })}
                />
              </div>
            </div>
            <Button onClick={handleAddLocation} className="w-full">Add Location</Button>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={activeFilter} onValueChange={setActiveFilter}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="active" className="data-[state=active]:bg-green-500">
            Active ({locationCounts.active})
          </TabsTrigger>
          <TabsTrigger value="inactive" className="data-[state=active]:bg-gray-500">
            Inactive ({locationCounts.inactive})
          </TabsTrigger>
          <TabsTrigger value="all" className="data-[state=active]:bg-blue-500">
            All ({locationCounts.all})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search locations..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredLocations.map((location) => (
          <Card key={location.id} className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => navigate(`/dashboard/locations/${location.id}`)}>
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
              <div className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-muted-foreground" />
                <div>
                  <CardTitle className="text-lg">{location.name}</CardTitle>
                  <p className="text-sm text-muted-foreground capitalize">{location.type}</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteLocation(location.id);
                }}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </CardHeader>
            <CardContent>
              <div className="text-sm space-y-1">
                <p>{location.address}</p>
                <p>{location.city}, {location.state} {location.zip}</p>
                {location.hours && <p className="text-muted-foreground">Hours: {location.hours}</p>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredLocations.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No locations found
        </div>
      )}
    </div>
  );
}
