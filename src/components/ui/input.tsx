import { cn } from "@/lib/utils";
import { InputHTMLAttributes, forwardRef } from "react";

const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, style, ...props }, ref) => (
    <input
      ref={ref}
      className={cn("flex h-8.5 w-full px-3 text-[13px]", className)}
      style={{
        background: "var(--bg-card)",
        color: "var(--text-primary)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
        height: "34px",
        ...style,
      }}
      {...props}
    />
  )
);
Input.displayName = "Input";
export { Input };
