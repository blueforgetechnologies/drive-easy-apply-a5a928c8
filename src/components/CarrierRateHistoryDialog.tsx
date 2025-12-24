import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { History, ArrowRight, DollarSign } from "lucide-react";

interface RateHistoryEntry {
  id: string;
  old_rate: number | null;
  new_rate: number;
  changed_by_name: string | null;
  changed_at: string;
  notes: string | null;
}

interface CarrierRateHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loadId: string;
  loadNumber: string;
}

export function CarrierRateHistoryDialog({
  open,
  onOpenChange,
  loadId,
  loadNumber,
}: CarrierRateHistoryDialogProps) {
  const [history, setHistory] = useState<RateHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open && loadId) {
      fetchHistory();
    }
  }, [open, loadId]);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("carrier_rate_history")
        .select("*")
        .eq("load_id", loadId)
        .order("changed_at", { ascending: false });

      if (error) throw error;
      setHistory(data || []);
    } catch (error) {
      console.error("Error fetching rate history:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number | null) => {
    if (value === null || value === undefined) return "-";
    return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Rate History - {loadNumber}
          </DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="max-h-[400px]">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              Loading history...
            </div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <DollarSign className="h-8 w-8 mb-2 opacity-50" />
              <p>No rate changes recorded</p>
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((entry, index) => (
                <div
                  key={entry.id}
                  className="border rounded-lg p-3 bg-card"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      {entry.old_rate !== null ? (
                        <>
                          <span className="text-muted-foreground line-through">
                            {formatCurrency(entry.old_rate)}
                          </span>
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                          <span className="text-green-600 font-bold">
                            {formatCurrency(entry.new_rate)}
                          </span>
                        </>
                      ) : (
                        <span className="text-green-600 font-bold">
                          Initial: {formatCurrency(entry.new_rate)}
                        </span>
                      )}
                    </div>
                    {index === 0 && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                        Current
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <span>
                      {format(new Date(entry.changed_at), "MMM d, yyyy 'at' h:mm a")}
                    </span>
                    {entry.changed_by_name && (
                      <span className="ml-2">by {entry.changed_by_name}</span>
                    )}
                  </div>
                  {entry.notes && (
                    <p className="text-xs text-muted-foreground mt-1 italic">
                      {entry.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
