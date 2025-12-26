import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Save, RotateCcw, GripVertical, Plus, Minus, ChevronDown, ChevronRight } from "lucide-react";
import { PaymentFormula, AVAILABLE_FORMULA_COLUMNS } from "@/hooks/usePaymentFormulas";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface FormulaEditorProps {
  title: string;
  formulaName: string;
  formula: PaymentFormula | null;
  onSave: (formula: PaymentFormula) => void;
  saving: boolean;
  defaultOpen?: boolean;
}

function FormulaEditor({ title, formulaName, formula, onSave, saving, defaultOpen = false }: FormulaEditorProps) {
  const [addColumns, setAddColumns] = useState<string[]>(formula?.add_columns || []);
  const [subtractColumns, setSubtractColumns] = useState<string[]>(formula?.subtract_columns || []);
  const [draggedItem, setDraggedItem] = useState<{ id: string; from: "available" | "add" | "subtract" } | null>(null);
  const [isOpen, setIsOpen] = useState(defaultOpen);

  useEffect(() => {
    setAddColumns(formula?.add_columns || []);
    setSubtractColumns(formula?.subtract_columns || []);
  }, [formula]);

  const availableColumns = AVAILABLE_FORMULA_COLUMNS.filter(
    (col) => !addColumns.includes(col.id) && !subtractColumns.includes(col.id)
  );

  const handleDragStart = (id: string, from: "available" | "add" | "subtract") => {
    setDraggedItem({ id, from });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDropOnAdd = (e: React.DragEvent) => {
    e.preventDefault();
    if (!draggedItem) return;
    if (draggedItem.from === "subtract") {
      setSubtractColumns((prev) => prev.filter((c) => c !== draggedItem.id));
    }
    if (!addColumns.includes(draggedItem.id)) {
      setAddColumns((prev) => [...prev, draggedItem.id]);
    }
    setDraggedItem(null);
  };

  const handleDropOnSubtract = (e: React.DragEvent) => {
    e.preventDefault();
    if (!draggedItem) return;
    if (draggedItem.from === "add") {
      setAddColumns((prev) => prev.filter((c) => c !== draggedItem.id));
    }
    if (!subtractColumns.includes(draggedItem.id)) {
      setSubtractColumns((prev) => [...prev, draggedItem.id]);
    }
    setDraggedItem(null);
  };

  const handleDropOnAvailable = (e: React.DragEvent) => {
    e.preventDefault();
    if (!draggedItem || draggedItem.from === "available") return;
    if (draggedItem.from === "add") {
      setAddColumns((prev) => prev.filter((c) => c !== draggedItem.id));
    } else if (draggedItem.from === "subtract") {
      setSubtractColumns((prev) => prev.filter((c) => c !== draggedItem.id));
    }
    setDraggedItem(null);
  };

  const handleSave = () => {
    onSave({
      formula_name: formulaName,
      add_columns: addColumns,
      subtract_columns: subtractColumns,
    });
  };

  const handleReset = () => {
    setAddColumns([]);
    setSubtractColumns([]);
  };

  const getLabel = (id: string) =>
    AVAILABLE_FORMULA_COLUMNS.find((c) => c.id === id)?.label || id;

  const buildPreview = () => {
    if (addColumns.length === 0 && subtractColumns.length === 0) {
      return <span className="text-muted-foreground text-xs">Not configured</span>;
    }
    const parts: React.ReactNode[] = [];
    addColumns.forEach((col, idx) => {
      if (idx > 0) parts.push(<span key={`plus-${idx}`} className="text-emerald-500 mx-0.5">+</span>);
      parts.push(<span key={`add-${col}`} className="text-foreground">{getLabel(col)}</span>);
    });
    subtractColumns.forEach((col, idx) => {
      parts.push(<span key={`minus-${idx}`} className="text-red-500 mx-0.5">−</span>);
      parts.push(<span key={`sub-${col}`} className="text-foreground">{getLabel(col)}</span>);
    });
    return <span className="text-xs">{parts}</span>;
  };

  const hasChanges = 
    JSON.stringify(addColumns) !== JSON.stringify(formula?.add_columns || []) ||
    JSON.stringify(subtractColumns) !== JSON.stringify(formula?.subtract_columns || []);

  const isConfigured = addColumns.length > 0 || subtractColumns.length > 0;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="border border-border/60 rounded-lg bg-card/50 overflow-hidden">
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-3">
              {isOpen ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="font-semibold text-sm">{title}</span>
              {isConfigured ? (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-0">
                  Configured
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 bg-muted text-muted-foreground border-0">
                  Not set
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
              {buildPreview()}
            </div>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-4 pb-4 pt-1 space-y-3 border-t border-border/40">
            {/* Compact three-column layout */}
            <div className="grid grid-cols-3 gap-3">
              {/* Available */}
              <div
                className={cn(
                  "rounded-md border border-dashed p-2 min-h-[80px] transition-colors",
                  draggedItem?.from !== "available" ? "border-border bg-muted/20" : "border-primary/30"
                )}
                onDragOver={handleDragOver}
                onDrop={handleDropOnAvailable}
              >
                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Available</div>
                <div className="flex flex-wrap gap-1">
                  {availableColumns.map((col) => (
                    <Badge
                      key={col.id}
                      variant="secondary"
                      className={cn(
                        "cursor-grab active:cursor-grabbing select-none text-[11px] py-0.5 px-2 h-6",
                        draggedItem?.id === col.id && "opacity-50"
                      )}
                      draggable
                      onDragStart={() => handleDragStart(col.id, "available")}
                      onDragEnd={() => setDraggedItem(null)}
                    >
                      <GripVertical className="h-2.5 w-2.5 mr-0.5 opacity-40" />
                      {col.label}
                    </Badge>
                  ))}
                  {availableColumns.length === 0 && (
                    <span className="text-[10px] text-muted-foreground italic">All assigned</span>
                  )}
                </div>
              </div>

              {/* Add Zone */}
              <div
                className={cn(
                  "rounded-md border border-dashed p-2 min-h-[80px] transition-colors",
                  draggedItem ? "border-emerald-500/50 bg-emerald-500/5" : "border-emerald-500/30 bg-emerald-500/5"
                )}
                onDragOver={handleDragOver}
                onDrop={handleDropOnAdd}
              >
                <div className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                  <Plus className="h-3 w-3" /> Add
                </div>
                <div className="flex flex-wrap gap-1">
                  {addColumns.map((colId) => (
                    <Badge
                      key={colId}
                      className={cn(
                        "cursor-grab active:cursor-grabbing select-none text-[11px] py-0.5 px-2 h-6 bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30",
                        draggedItem?.id === colId && "opacity-50"
                      )}
                      draggable
                      onDragStart={() => handleDragStart(colId, "add")}
                      onDragEnd={() => setDraggedItem(null)}
                    >
                      <GripVertical className="h-2.5 w-2.5 mr-0.5 opacity-40" />
                      {getLabel(colId)}
                    </Badge>
                  ))}
                  {addColumns.length === 0 && (
                    <span className="text-[10px] text-muted-foreground italic">Drop here</span>
                  )}
                </div>
              </div>

              {/* Subtract Zone */}
              <div
                className={cn(
                  "rounded-md border border-dashed p-2 min-h-[80px] transition-colors",
                  draggedItem ? "border-red-500/50 bg-red-500/5" : "border-red-500/30 bg-red-500/5"
                )}
                onDragOver={handleDragOver}
                onDrop={handleDropOnSubtract}
              >
                <div className="text-[10px] font-medium text-red-600 dark:text-red-400 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                  <Minus className="h-3 w-3" /> Subtract
                </div>
                <div className="flex flex-wrap gap-1">
                  {subtractColumns.map((colId) => (
                    <Badge
                      key={colId}
                      className={cn(
                        "cursor-grab active:cursor-grabbing select-none text-[11px] py-0.5 px-2 h-6 bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/40 hover:bg-red-500/30",
                        draggedItem?.id === colId && "opacity-50"
                      )}
                      draggable
                      onDragStart={() => handleDragStart(colId, "subtract")}
                      onDragEnd={() => setDraggedItem(null)}
                    >
                      <GripVertical className="h-2.5 w-2.5 mr-0.5 opacity-40" />
                      {getLabel(colId)}
                    </Badge>
                  ))}
                  {subtractColumns.length === 0 && (
                    <span className="text-[10px] text-muted-foreground italic">Drop here</span>
                  )}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                className="h-7 text-xs px-2"
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Clear
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving || !hasChanges}
                className="h-7 text-xs px-3"
              >
                <Save className="h-3 w-3 mr-1" />
                Save
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

interface PaymentFormulaBuilderProps {
  formulas: {
    carr_net: PaymentFormula | null;
    my_net: PaymentFormula | null;
    brokering_net: PaymentFormula | null;
  };
  onSave: (formula: PaymentFormula) => void;
  saving: boolean;
}

export function PaymentFormulaBuilder({ formulas, onSave, saving }: PaymentFormulaBuilderProps) {
  return (
    <div className="space-y-3 max-w-4xl">
      <div className="mb-4">
        <h3 className="text-base font-semibold">Payment Formulas</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Drag columns to configure how each NET value is calculated
        </p>
      </div>

      <FormulaEditor
        title="CARR NET"
        formulaName="carr_net"
        formula={formulas.carr_net}
        onSave={onSave}
        saving={saving}
        defaultOpen={true}
      />

      <FormulaEditor
        title="MY NET"
        formulaName="my_net"
        formula={formulas.my_net}
        onSave={onSave}
        saving={saving}
      />

      <FormulaEditor
        title="BROKERING NET"
        formulaName="brokering_net"
        formula={formulas.brokering_net}
        onSave={onSave}
        saving={saving}
      />
    </div>
  );
}
