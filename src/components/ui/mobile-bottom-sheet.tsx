import * as React from "react";
import { cn } from "@/lib/utils";
import { Drawer, DrawerContent, DrawerTrigger, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter, DrawerClose } from "./drawer";
import { Button } from "./button";
import { X } from "lucide-react";

interface MobileBottomSheetProps {
  trigger: React.ReactNode;
  title?: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

export function MobileBottomSheet({
  trigger,
  title,
  description,
  children,
  footer,
  open,
  onOpenChange,
  className,
}: MobileBottomSheetProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerTrigger asChild>{trigger}</DrawerTrigger>
      <DrawerContent className={cn("max-h-[90vh]", className)}>
        {(title || description) && (
          <DrawerHeader className="text-left">
            {title && <DrawerTitle>{title}</DrawerTitle>}
            {description && <DrawerDescription>{description}</DrawerDescription>}
          </DrawerHeader>
        )}
        <div className="px-4 pb-4 overflow-y-auto flex-1">{children}</div>
        {footer && <DrawerFooter>{footer}</DrawerFooter>}
      </DrawerContent>
    </Drawer>
  );
}

interface MobileActionSheetProps {
  trigger: React.ReactNode;
  title?: string;
  actions: Array<{
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
    variant?: "default" | "destructive";
    disabled?: boolean;
  }>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function MobileActionSheet({
  trigger,
  title,
  actions,
  open,
  onOpenChange,
}: MobileActionSheetProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerTrigger asChild>{trigger}</DrawerTrigger>
      <DrawerContent>
        {title && (
          <DrawerHeader className="text-left pb-2">
            <DrawerTitle className="text-base">{title}</DrawerTitle>
          </DrawerHeader>
        )}
        <div className="px-4 pb-6 space-y-1">
          {actions.map((action, index) => (
            <button
              key={index}
              onClick={() => {
                action.onClick();
                onOpenChange?.(false);
              }}
              disabled={action.disabled}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left font-medium transition-colors active:scale-[0.98]",
                action.variant === "destructive"
                  ? "text-destructive hover:bg-destructive/10"
                  : "hover:bg-muted",
                action.disabled && "opacity-50 pointer-events-none"
              )}
            >
              {action.icon && <span className="w-5 h-5">{action.icon}</span>}
              {action.label}
            </button>
          ))}
        </div>
        <DrawerFooter className="pt-0">
          <DrawerClose asChild>
            <Button variant="outline" className="w-full h-12 rounded-xl">
              Cancel
            </Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
