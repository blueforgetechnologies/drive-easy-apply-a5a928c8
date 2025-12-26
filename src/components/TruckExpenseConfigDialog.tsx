import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { MERGEABLE_EXPENSE_COLUMNS } from "@/hooks/useExpenseGroup";

interface TruckExpenseConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  includedColumns: string[];
  onToggleColumn: (columnId: string) => void;
  onReset: () => void;
}

export function TruckExpenseConfigDialog({
  open,
  onOpenChange,
  includedColumns,
  onToggleColumn,
  onReset,
}: TruckExpenseConfigDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Configure Truck Expense</DialogTitle>
          <DialogDescription>
            Select which columns to merge into the "TRUCK EXPENSE" column when collapsed.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-3 py-4">
          {MERGEABLE_EXPENSE_COLUMNS.map((col) => (
            <div key={col.id} className="flex items-center space-x-3">
              <Checkbox
                id={`expense-${col.id}`}
                checked={includedColumns.includes(col.id)}
                onCheckedChange={() => onToggleColumn(col.id)}
              />
              <Label
                htmlFor={`expense-${col.id}`}
                className="text-sm font-medium cursor-pointer"
              >
                {col.label}
              </Label>
            </div>
          ))}
        </div>

        <DialogFooter className="flex justify-between sm:justify-between">
          <Button variant="outline" size="sm" onClick={onReset}>
            Reset to Default
          </Button>
          <Button size="sm" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
