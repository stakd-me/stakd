import { forwardRef, type SelectHTMLAttributes } from "react";
import { controlBaseClass } from "@/lib/control-styles";
import { cn } from "@/lib/utils";

const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => {
  return (
    <select
      className={cn(controlBaseClass, "py-0", className)}
      ref={ref}
      {...props}
    />
  );
});
Select.displayName = "Select";

export { Select };
