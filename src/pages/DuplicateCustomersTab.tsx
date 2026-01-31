import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Trash2, Merge, RefreshCw, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface Customer {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  mc_number: string | null;
  address: string | null;
  status: string | null;
}

interface DuplicatePair {
  customer1: Customer;
  customer2: Customer;
  resolved: boolean;
}

export default function DuplicateCustomersTab() {
  const navigate = useNavigate();
  const [duplicates, setDuplicates] = useState<DuplicatePair[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedToDelete, setSelectedToDelete] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadDuplicates();
  }, []);

  const loadDuplicates = async () => {
    setLoading(true);
    try {
      const { data: customers, error: queryError } = await supabase
        .from("customers")
        .select("id, name, contact_name, email, phone, mc_number, address, status")
        .order("name");
      
      if (queryError) throw queryError;
      
      // Helper to strip HTML tags
      const stripHtml = (str: string | null) => {
        if (!str) return null;
        return str.replace(/<[^>]*>/g, '').trim();
      };

      const allCustomers: Customer[] = (customers || []).map((c: any) => ({
        id: c.id,
        name: c.name,
        contact_name: stripHtml(c.contact_name),
        email: c.email,
        phone: c.phone,
        mc_number: c.mc_number,
        address: c.address,
        status: c.status
      }));

      // Find duplicates using multiple strategies
      const duplicateMap = new Map<string, Set<string>>(); // key -> set of customer IDs
      
      allCustomers.forEach((c1, i) => {
        allCustomers.slice(i + 1).forEach((c2) => {
          if (arePotentialDuplicates(c1.name, c2.name)) {
            // Create a consistent pair key
            const pairKey = [c1.id, c2.id].sort().join('|');
            if (!duplicateMap.has(pairKey)) {
              duplicateMap.set(pairKey, new Set([c1.id, c2.id]));
            }
          }
        });
      });

      // Convert to pairs
      const customerById = new Map(allCustomers.map(c => [c.id, c]));
      const pairs: DuplicatePair[] = [];
      
      duplicateMap.forEach((ids) => {
        const idArray = Array.from(ids);
        const c1 = customerById.get(idArray[0])!;
        const c2 = customerById.get(idArray[1])!;
        
        // Sort by data completeness - customer with more data first
        const sorted = [c1, c2].sort((a, b) => getDataScore(b) - getDataScore(a));
        
        pairs.push({
          customer1: sorted[0],
          customer2: sorted[1],
          resolved: false
        });
      });

      // Sort pairs by first customer name
      pairs.sort((a, b) => a.customer1.name.localeCompare(b.customer1.name));
      
      setDuplicates(pairs);
    } catch (error) {
      console.error("Error loading duplicates:", error);
      toast.error("Failed to load duplicates");
    } finally {
      setLoading(false);
    }
  };

  // Check if two names are potential duplicates
  const arePotentialDuplicates = (name1: string, name2: string): boolean => {
    const n1 = normalizeName(name1);
    const n2 = normalizeName(name2);
    
    // Exact match after normalization
    if (n1 === n2) return true;
    
    // First two words match (for cases like "MILLHOUSE LOGISTICS INC" vs "MILLHOUSE LOGISTICS SERVICES LLC")
    const words1 = n1.split(' ').filter(w => w.length > 0);
    const words2 = n2.split(' ').filter(w => w.length > 0);
    
    if (words1.length >= 2 && words2.length >= 2) {
      if (words1[0] === words2[0] && words1[1] === words2[1]) {
        return true;
      }
    }
    
    // First word matches and it's a substantial word (>5 chars)
    if (words1.length >= 1 && words2.length >= 1) {
      if (words1[0] === words2[0] && words1[0].length > 5) {
        return true;
      }
    }
    
    return false;
  };

  const normalizeName = (name: string): string => {
    return name
      .toLowerCase()
      .replace(/\./g, '')
      .replace(/,/g, '')
      .replace(/\s+/g, ' ')
      .replace(/\s*(llc|inc|corp|incorporated|corporation|co\.?)(\s|$)/gi, '')
      .trim();
  };

  const getDataScore = (c: Customer): number => {
    let score = 0;
    if (c.contact_name) score++;
    if (c.email) score++;
    if (c.phone) score++;
    if (c.mc_number) score++;
    if (c.address) score++;
    return score;
  };

  const handleDeleteSelected = async () => {
    if (selectedToDelete.size === 0) {
      toast.error("No customers selected for deletion");
      return;
    }

    if (!confirm(`Delete ${selectedToDelete.size} selected customer(s)?`)) return;

    try {
      const { error } = await supabase
        .from("customers")
        .delete()
        .in("id", Array.from(selectedToDelete));

      if (error) throw error;

      toast.success(`Deleted ${selectedToDelete.size} customer(s)`);
      setSelectedToDelete(new Set());
      loadDuplicates();
    } catch (error: any) {
      toast.error("Failed to delete: " + error.message);
    }
  };

  const handleMergeAndDelete = async (keepId: string, deleteId: string) => {
    try {
      // Get both records
      const { data: records, error: fetchError } = await supabase
        .from("customers")
        .select("*")
        .in("id", [keepId, deleteId]);

      if (fetchError) throw fetchError;

      const keepRecord = records?.find(r => r.id === keepId);
      const deleteRecord = records?.find(r => r.id === deleteId);

      if (!keepRecord || !deleteRecord) throw new Error("Records not found");

      // Merge: fill in null fields from deleteRecord
      const updates: Record<string, any> = {};
      const fields = ['contact_name', 'email', 'phone', 'mc_number', 'address', 'city', 'state', 'zip', 'payment_terms', 'credit_limit', 'notes'];
      
      fields.forEach(field => {
        if (!keepRecord[field] && deleteRecord[field]) {
          updates[field] = deleteRecord[field];
        }
      });

      // Update keep record if there are fields to merge
      if (Object.keys(updates).length > 0) {
        const { error: updateError } = await supabase
          .from("customers")
          .update(updates)
          .eq("id", keepId);

        if (updateError) throw updateError;
      }

      // Delete the duplicate
      const { error: deleteError } = await supabase
        .from("customers")
        .delete()
        .eq("id", deleteId);

      if (deleteError) throw deleteError;

      toast.success("Merged and deleted duplicate");
      loadDuplicates();
    } catch (error: any) {
      toast.error("Failed to merge: " + error.message);
    }
  };

  const handleQuickDelete = async (id: string) => {
    if (!confirm("Delete this customer?")) return;

    try {
      const { error } = await supabase
        .from("customers")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Deleted customer");
      loadDuplicates();
    } catch (error: any) {
      toast.error("Failed to delete: " + error.message);
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedToDelete);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedToDelete(newSet);
  };

  if (loading) {
    return <div className="text-center py-8">Loading duplicates...</div>;
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard/business?subtab=customers")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Customers
          </Button>
          <h1 className="text-xl font-bold">Duplicate Customer Review</h1>
          <span className="text-muted-foreground">({duplicates.length} potential duplicates)</span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadDuplicates}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
          {selectedToDelete.size > 0 && (
            <Button variant="destructive" size="sm" onClick={handleDeleteSelected}>
              <Trash2 className="h-4 w-4 mr-1" />
              Delete Selected ({selectedToDelete.size})
            </Button>
          )}
        </div>
      </div>

      {duplicates.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No duplicate customers found!
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {duplicates.map((pair, idx) => (
            <Card key={idx} className="border-orange-200 dark:border-orange-800">
              <CardHeader className="py-2 px-4 bg-orange-50 dark:bg-orange-950/30">
                <CardTitle className="text-sm font-medium text-orange-700 dark:text-orange-400">
                  Potential Duplicate #{idx + 1}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3">
                <div className="grid grid-cols-2 gap-3">
                  {/* Customer 1 - Usually has more data */}
                  <div className={`p-3 rounded border-2 ${getDataScore(pair.customer1) >= getDataScore(pair.customer2) ? 'border-green-300 bg-green-50 dark:bg-green-950/20' : 'border-muted'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <Checkbox
                        checked={selectedToDelete.has(pair.customer1.id)}
                        onCheckedChange={() => toggleSelect(pair.customer1.id)}
                      />
                      <span className="font-bold text-sm">{pair.customer1.name}</span>
                      {getDataScore(pair.customer1) >= getDataScore(pair.customer2) && (
                        <span className="text-xs bg-green-500 text-white px-1.5 py-0.5 rounded">KEEP</span>
                      )}
                    </div>
                    <div className="text-xs space-y-0.5 text-muted-foreground">
                      <div>Contact: <span className={pair.customer1.contact_name ? 'text-foreground' : 'text-red-400'}>{pair.customer1.contact_name || 'null'}</span></div>
                      <div>Email: <span className={pair.customer1.email ? 'text-foreground' : 'text-red-400'}>{pair.customer1.email || 'null'}</span></div>
                      <div>Phone: <span className={pair.customer1.phone ? 'text-foreground' : 'text-red-400'}>{pair.customer1.phone || 'null'}</span></div>
                      <div>MC: <span className={pair.customer1.mc_number ? 'text-foreground' : 'text-red-400'}>{pair.customer1.mc_number || 'null'}</span></div>
                    </div>
                    <div className="flex gap-1 mt-2">
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="h-6 text-xs"
                        onClick={() => handleMergeAndDelete(pair.customer1.id, pair.customer2.id)}
                      >
                        <Merge className="h-3 w-3 mr-1" />
                        Keep This & Merge
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="h-6 text-xs text-red-500"
                        onClick={() => handleQuickDelete(pair.customer1.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  {/* Customer 2 */}
                  <div className={`p-3 rounded border-2 ${getDataScore(pair.customer2) > getDataScore(pair.customer1) ? 'border-green-300 bg-green-50 dark:bg-green-950/20' : 'border-muted'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <Checkbox
                        checked={selectedToDelete.has(pair.customer2.id)}
                        onCheckedChange={() => toggleSelect(pair.customer2.id)}
                      />
                      <span className="font-bold text-sm">{pair.customer2.name}</span>
                      {getDataScore(pair.customer2) > getDataScore(pair.customer1) && (
                        <span className="text-xs bg-green-500 text-white px-1.5 py-0.5 rounded">KEEP</span>
                      )}
                    </div>
                    <div className="text-xs space-y-0.5 text-muted-foreground">
                      <div>Contact: <span className={pair.customer2.contact_name ? 'text-foreground' : 'text-red-400'}>{pair.customer2.contact_name || 'null'}</span></div>
                      <div>Email: <span className={pair.customer2.email ? 'text-foreground' : 'text-red-400'}>{pair.customer2.email || 'null'}</span></div>
                      <div>Phone: <span className={pair.customer2.phone ? 'text-foreground' : 'text-red-400'}>{pair.customer2.phone || 'null'}</span></div>
                      <div>MC: <span className={pair.customer2.mc_number ? 'text-foreground' : 'text-red-400'}>{pair.customer2.mc_number || 'null'}</span></div>
                    </div>
                    <div className="flex gap-1 mt-2">
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="h-6 text-xs"
                        onClick={() => handleMergeAndDelete(pair.customer2.id, pair.customer1.id)}
                      >
                        <Merge className="h-3 w-3 mr-1" />
                        Keep This & Merge
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="h-6 text-xs text-red-500"
                        onClick={() => handleQuickDelete(pair.customer2.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
