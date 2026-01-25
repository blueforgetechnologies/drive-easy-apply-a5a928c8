import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";

interface MissingItem {
  category: string;
  label: string;
}

interface MissingOnboardingItemsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driverName: string;
  missingItems: MissingItem[];
  missingByCategory: Record<string, string[]>;
}

export function MissingOnboardingItemsDialog({
  open,
  onOpenChange,
  driverName,
  missingItems,
  missingByCategory,
}: MissingOnboardingItemsDialogProps) {
  const categories = Object.entries(missingByCategory);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="h-5 w-5" />
            Onboarding Incomplete
          </DialogTitle>
          <DialogDescription>
            {driverName} cannot be activated until the following items are complete:
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {categories.map(([category, items]) => (
            <div key={category} className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-semibold">
                  {category}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {items.length} missing
                </span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground ml-2">
                {items.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="text-xs text-muted-foreground bg-muted/50 rounded p-3">
          💡 Ask the driver to complete their application or update their records manually.
        </div>
      </DialogContent>
    </Dialog>
  );
}
