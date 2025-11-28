import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Search, Plus, Edit, Trash2, FileText } from "lucide-react";

interface Carrier {
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
  created_at: string;
}

export default function CarriersTab() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = searchParams.get("filter") || "active";
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    mc_number: "",
    dot_number: "",
    contact_name: "",
    email: "",
    phone: "",
    address: "",
  });
  const [usdotLookup, setUsdotLookup] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, [filter]);

  const loadData = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("carriers" as any)
        .select("*")
        .order("created_at", { ascending: false });
      
      if (filter !== "all") {
        query = query.eq("status", filter);
      }

      const { data, error } = await query;

      if (error) {
        toast.error("Error loading carriers");
        return;
      }
      setCarriers((data as any) || []);
    } finally {
      setLoading(false);
    }
  };

  const handleAddCarrier = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase
        .from("carriers" as any)
        .insert({
          ...formData,
          status: "active",
        });

      if (error) throw error;
      toast.success("Carrier added successfully");
      setDialogOpen(false);
      setFormData({
        name: "",
        mc_number: "",
        dot_number: "",
        contact_name: "",
        email: "",
        phone: "",
        address: "",
      });
      loadData();
    } catch (error: any) {
      toast.error("Failed to add carrier: " + error.message);
    }
  };

  const handleDeleteCarrier = async (id: string) => {
    try {
      const { error } = await supabase
        .from("carriers" as any)
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Carrier deleted successfully");
      loadData();
    } catch (error: any) {
      toast.error("Failed to delete carrier: " + error.message);
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
      
      setFormData({
        name: data.dba_name || data.name || "",
        mc_number: data.mc_number || "",
        dot_number: data.usdot || usdotLookup,
        contact_name: "",
        email: "",
        phone: data.phone || "",
        address: data.physical_address || "",
      });
      
      toast.success("Carrier information loaded successfully");
    } catch (error: any) {
      toast.error("Failed to fetch carrier data: " + error.message);
    } finally {
      setLookupLoading(false);
    }
  };

  const filteredCarriers = carriers.filter((carrier) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      (carrier.name || "").toLowerCase().includes(searchLower) ||
      (carrier.mc_number || "").toLowerCase().includes(searchLower) ||
      (carrier.dot_number || "").toLowerCase().includes(searchLower) ||
      (carrier.contact_name || "").toLowerCase().includes(searchLower)
    );
  });

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Carrier Management</h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Add Carrier
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Carrier</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddCarrier} className="space-y-4">
              <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                <Label htmlFor="usdot_lookup">USDOT Lookup</Label>
                <div className="flex gap-2">
                  <Input
                    id="usdot_lookup"
                    placeholder="Enter USDOT number"
                    value={usdotLookup}
                    onChange={(e) => setUsdotLookup(e.target.value)}
                  />
                  <Button 
                    type="button" 
                    onClick={handleUsdotLookup}
                    disabled={lookupLoading}
                  >
                    {lookupLoading ? "Loading..." : "Lookup"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Enter a USDOT number to auto-fill carrier information from SaferWeb
                </p>
              </div>
              
              <div>
                <Label htmlFor="name">Carrier Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="mc_number">MC Number</Label>
                <Input
                  id="mc_number"
                  value={formData.mc_number}
                  onChange={(e) => setFormData({ ...formData, mc_number: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="dot_number">DOT Number</Label>
                <Input
                  id="dot_number"
                  value={formData.dot_number}
                  onChange={(e) => setFormData({ ...formData, dot_number: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="contact_name">Contact Name</Label>
                <Input
                  id="contact_name"
                  value={formData.contact_name}
                  onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                />
              </div>
              <Button type="submit" className="w-full">Add Carrier</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex flex-wrap gap-2">
          <Button
            variant={filter === "active" ? "default" : "outline"}
            onClick={() => {
              setSearchParams({ filter: "active" });
              setSearchQuery("");
            }}
            className={filter === "active" ? "bg-green-600 text-white hover:bg-green-700" : ""}
          >
            Active
          </Button>
          <Button
            variant={filter === "pending" ? "default" : "outline"}
            onClick={() => {
              setSearchParams({ filter: "pending" });
              setSearchQuery("");
            }}
            className={filter === "pending" ? "bg-orange-500 text-white hover:bg-orange-600" : ""}
          >
            Pending
          </Button>
          <Button
            variant={filter === "inactive" ? "default" : "outline"}
            onClick={() => {
              setSearchParams({ filter: "inactive" });
              setSearchQuery("");
            }}
            className={filter === "inactive" ? "bg-muted text-muted-foreground" : ""}
          >
            Inactive
          </Button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search carriers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Carriers</CardTitle>
          <CardDescription>Manage carrier companies</CardDescription>
        </CardHeader>
        <CardContent>
          {filteredCarriers.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {searchQuery ? "No carriers match your search" : "No carriers found"}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="w-[80px]">Status</TableHead>
                    <TableHead className="min-w-[180px]">
                      <div>Carrier Name</div>
                      <div className="text-xs font-normal text-muted-foreground">USDOT #</div>
                    </TableHead>
                    <TableHead className="min-w-[150px]">
                      <div>Contact</div>
                      <div className="text-xs font-normal text-muted-foreground">Phone</div>
                    </TableHead>
                    <TableHead className="min-w-[200px]">
                      <div>Physical Address</div>
                      <div className="text-xs font-normal text-muted-foreground">Email Address</div>
                    </TableHead>
                    <TableHead className="min-w-[120px]">
                      <div>W9</div>
                      <div className="text-xs font-normal text-muted-foreground">EIN</div>
                    </TableHead>
                    <TableHead className="min-w-[140px]">
                      <div>Insurance</div>
                      <div className="text-xs font-normal text-muted-foreground">Expiration Date</div>
                    </TableHead>
                    <TableHead className="min-w-[160px]">
                      <div>Workman Compensation</div>
                      <div className="text-xs font-normal text-muted-foreground">Expiration Date</div>
                    </TableHead>
                    <TableHead className="min-w-[140px]">
                      <div>Carrier Agreement</div>
                      <div className="text-xs font-normal text-muted-foreground">Direct Deposit</div>
                    </TableHead>
                    <TableHead className="min-w-[160px]">
                      <div>Authority status</div>
                      <div className="text-xs font-normal text-muted-foreground">Safer Rating Check</div>
                    </TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCarriers.map((carrier) => (
                    <TableRow 
                      key={carrier.id} 
                      className="cursor-pointer hover:bg-muted/30"
                      onClick={() => navigate(`/dashboard/carrier/${carrier.id}`)}
                    >
                      <TableCell>
                        <Badge
                          variant={
                            carrier.status === "active"
                              ? "default"
                              : carrier.status === "pending"
                              ? "secondary"
                              : "outline"
                          }
                          className={`w-full justify-center ${
                            carrier.status === "active"
                              ? "bg-green-100 text-green-800 hover:bg-green-200 border-green-200"
                              : carrier.status === "pending"
                              ? "bg-orange-100 text-orange-800 hover:bg-orange-200 border-orange-200"
                              : "bg-gray-100 text-gray-800 hover:bg-gray-200 border-gray-200"
                          }`}
                        >
                          <span className="mr-1">0</span>
                          {carrier.status.charAt(0).toUpperCase() + carrier.status.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-blue-600 hover:underline">{carrier.name}</div>
                        <div className="text-xs text-muted-foreground">{carrier.dot_number || ""}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{carrier.contact_name || ""}</div>
                        <div className="text-xs text-muted-foreground">{carrier.phone || ""}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{carrier.address || ""}</div>
                        <div className="text-xs text-muted-foreground">{carrier.email || ""}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">—</div>
                        <div className="text-xs text-muted-foreground">—</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">—</div>
                        <div className="text-xs text-muted-foreground">—</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">—</div>
                        <div className="text-xs text-muted-foreground">—</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">—</div>
                        <div className="text-xs text-muted-foreground">—</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {carrier.safer_status?.toUpperCase().includes('NOT AUTHORIZED') ? (
                            <span className="text-destructive font-medium">{carrier.safer_status}</span>
                          ) : (
                            <span className="text-green-700 font-medium">{carrier.safer_status || "AUTHORIZED FOR Property"}</span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {carrier.safety_rating?.toUpperCase() === 'CONDITIONAL' ? (
                            <span className="text-destructive">{carrier.safety_rating}</span>
                          ) : (
                            <span>{carrier.safety_rating || "None"}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/dashboard/carrier/${carrier.id}`);
                          }}
                        >
                          <FileText className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
