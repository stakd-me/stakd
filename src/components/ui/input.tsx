import { forwardRef, type InputHTMLAttributes } from "react";
import { controlBaseClass } from "@/lib/control-styles";
import { cn } from "@/lib/utils";

const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(controlBaseClass, className)}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };
