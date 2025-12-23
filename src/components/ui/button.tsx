import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { playClickSound } from "@/hooks/useClickSound";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90 border border-primary/30",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 border border-destructive/30",
        outline: "btn-glossy text-gray-700 border-0",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-secondary/30",
        ghost: "hover:bg-accent/50 hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-11 rounded-lg px-6 text-base",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  soundType?: 'click' | 'success' | 'soft' | 'toggle' | 'nav';
  disableSound?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, soundType, disableSound = false, onClick, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    
    const handleClick = React.useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
      if (!disableSound && !props.disabled) {
        // Determine sound type based on variant if not specified
        let sound = soundType;
        if (!sound) {
          if (variant === 'destructive') sound = 'toggle';
          else if (variant === 'ghost' || variant === 'link') sound = 'soft';
          else if (variant === 'default') sound = 'click';
          else sound = 'click';
        }
        playClickSound(sound);
      }
      onClick?.(e);
    }, [disableSound, onClick, props.disabled, soundType, variant]);
    
    return (
      <Comp 
        className={cn(buttonVariants({ variant, size, className }))} 
        ref={ref} 
        onClick={handleClick}
        {...props} 
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
