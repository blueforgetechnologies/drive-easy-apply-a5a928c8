import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Save, RotateCcw, GripVertical, Plus, Minus, Calculator } from "lucide-react";
import { PaymentFormula, AVAILABLE_FORMULA_COLUMNS } from "@/hooks/usePaymentFormulas";

interface FormulaEditorProps {
  title: string;
  formulaName: string;
  formula: PaymentFormula | null;
  onSave: (formula: PaymentFormula) => void;
  saving: boolean;
}

function FormulaEditor({ title, formulaName, formula, onSave, saving }: FormulaEditorProps) {
  const [addColumns, setAddColumns] = useState<string[]>(formula?.add_columns || []);
  const [subtractColumns, setSubtractColumns] = useState<string[]>(formula?.subtract_columns || []);
  const [draggedItem, setDraggedItem] = useState<{ id: string; from: "available" | "add" | "subtract" } | null>(null);

  // Sync with prop changes
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

    // Remove from previous location
    if (draggedItem.from === "subtract") {
      setSubtractColumns((prev) => prev.filter((c) => c !== draggedItem.id));
    }

    // Add to add columns if not already there
    if (!addColumns.includes(draggedItem.id)) {
      setAddColumns((prev) => [...prev, draggedItem.id]);
    }

    setDraggedItem(null);
  };

  const handleDropOnSubtract = (e: React.DragEvent) => {
    e.preventDefault();
    if (!draggedItem) return;

    // Remove from previous location
    if (draggedItem.from === "add") {
      setAddColumns((prev) => prev.filter((c) => c !== draggedItem.id));
    }

    // Add to subtract columns if not already there
    if (!subtractColumns.includes(draggedItem.id)) {
      setSubtractColumns((prev) => [...prev, draggedItem.id]);
    }

    setDraggedItem(null);
  };

  const handleDropOnAvailable = (e: React.DragEvent) => {
    e.preventDefault();
    if (!draggedItem || draggedItem.from === "available") return;

    // Remove from add or subtract
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

  // Build formula preview
  const buildPreview = () => {
    if (addColumns.length === 0 && subtractColumns.length === 0) {
      return <span className="text-muted-foreground italic">Drag columns to build formula</span>;
    }

    const parts: React.ReactNode[] = [];
    addColumns.forEach((col, idx) => {
      if (idx > 0) parts.push(<span key={`plus-${idx}`} className="text-green-600 font-bold mx-1">+</span>);
      parts.push(
        <span key={`add-${col}`} className="text-foreground font-medium">{getLabel(col)}</span>
      );
    });
    subtractColumns.forEach((col, idx) => {
      parts.push(<span key={`minus-${idx}`} className="text-red-600 font-bold mx-1">−</span>);
      parts.push(
        <span key={`sub-${col}`} className="text-foreground font-medium">{getLabel(col)}</span>
      );
    });

    return <>{parts}</>;
  };

  const hasChanges = 
    JSON.stringify(addColumns) !== JSON.stringify(formula?.add_columns || []) ||
    JSON.stringify(subtractColumns) !== JSON.stringify(formula?.subtract_columns || []);

  return (
    <Card className="border-2">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Calculator className="h-5 w-5 text-primary" />
            {title}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              className="h-8"
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1" />
              Clear
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || !hasChanges}
              className="h-8"
            >
              <Save className="h-3.5 w-3.5 mr-1" />
              Save
            </Button>
          </div>
        </div>
        <CardDescription className="flex items-center gap-1 text-sm mt-2 font-mono">
          <span className="font-semibold text-foreground">{title} =</span>
          {buildPreview()}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Available Columns */}
        <div
          className={cn(
            "border-2 border-dashed rounded-lg p-3 min-h-[60px] transition-colors",
            draggedItem?.from !== "available" && "border-muted-foreground/30 bg-muted/30"
          )}
          onDragOver={handleDragOver}
          onDrop={handleDropOnAvailable}
        >
          <div className="text-xs font-medium text-muted-foreground mb-2">Available Columns</div>
          <div className="flex flex-wrap gap-2">
            {availableColumns.map((col) => (
              <Badge
                key={col.id}
                variant="secondary"
                className={cn(
                  "cursor-grab active:cursor-grabbing select-none py-1.5 px-3 text-sm",
                  draggedItem?.id === col.id && "opacity-50"
                )}
                draggable
                onDragStart={() => handleDragStart(col.id, "available")}
                onDragEnd={() => setDraggedItem(null)}
              >
                <GripVertical className="h-3 w-3 mr-1 opacity-50" />
                {col.label}
              </Badge>
            ))}
            {availableColumns.length === 0 && (
              <span className="text-xs text-muted-foreground italic">All columns assigned</span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Add Zone */}
          <div
            className={cn(
              "border-2 border-dashed rounded-lg p-3 min-h-[100px] transition-colors",
              draggedItem && "border-green-500/50 bg-green-50/50 dark:bg-green-950/20"
            )}
            onDragOver={handleDragOver}
            onDrop={handleDropOnAdd}
          >
            <div className="text-xs font-medium text-green-600 dark:text-green-400 mb-2 flex items-center gap-1">
              <Plus className="h-3.5 w-3.5" />
              Add (+)
            </div>
            <div className="flex flex-wrap gap-2">
              {addColumns.map((colId) => (
                <Badge
                  key={colId}
                  variant="outline"
                  className={cn(
                    "cursor-grab active:cursor-grabbing select-none py-1.5 px-3 text-sm border-green-500 bg-green-50 text-green-700 dark:bg-green-950/50 dark:text-green-300",
                    draggedItem?.id === colId && "opacity-50"
                  )}
                  draggable
                  onDragStart={() => handleDragStart(colId, "add")}
                  onDragEnd={() => setDraggedItem(null)}
                >
                  <GripVertical className="h-3 w-3 mr-1 opacity-50" />
                  {getLabel(colId)}
                </Badge>
              ))}
              {addColumns.length === 0 && (
                <span className="text-xs text-muted-foreground italic">Drop columns here to add</span>
              )}
            </div>
          </div>

          {/* Subtract Zone */}
          <div
            className={cn(
              "border-2 border-dashed rounded-lg p-3 min-h-[100px] transition-colors",
              draggedItem && "border-red-500/50 bg-red-50/50 dark:bg-red-950/20"
            )}
            onDragOver={handleDragOver}
            onDrop={handleDropOnSubtract}
          >
            <div className="text-xs font-medium text-red-600 dark:text-red-400 mb-2 flex items-center gap-1">
              <Minus className="h-3.5 w-3.5" />
              Subtract (−)
            </div>
            <div className="flex flex-wrap gap-2">
              {subtractColumns.map((colId) => (
                <Badge
                  key={colId}
                  variant="outline"
                  className={cn(
                    "cursor-grab active:cursor-grabbing select-none py-1.5 px-3 text-sm border-red-500 bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300",
                    draggedItem?.id === colId && "opacity-50"
                  )}
                  draggable
                  onDragStart={() => handleDragStart(colId, "subtract")}
                  onDragEnd={() => setDraggedItem(null)}
                >
                  <GripVertical className="h-3 w-3 mr-1 opacity-50" />
                  {getLabel(colId)}
                </Badge>
              ))}
              {subtractColumns.length === 0 && (
                <span className="text-xs text-muted-foreground italic">Drop columns here to subtract</span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
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
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">Payment Calculation</h2>
        <p className="text-muted-foreground">
          Configure how CARR NET, MY NET, and BROKERING NET are calculated. Drag columns to the Add (+) or Subtract (−) zones to build each formula.
        </p>
      </div>

      <FormulaEditor
        title="CARR NET"
        formulaName="carr_net"
        formula={formulas.carr_net}
        onSave={onSave}
        saving={saving}
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
