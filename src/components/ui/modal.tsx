"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}

export function Modal({
  open,
  onClose,
  title,
  children,
  size = "md",
}: ModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", h);

    const html = document.documentElement;
    const prevOverflow = html.style.overflow;
    html.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", h);
      html.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  const sizes = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-2xl",
  };

  const node = (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 backdrop-blur-sm"
        style={{ background: "rgba(0,0,0,.45)" }}
        onClick={onClose}
      />
      <div
        className={cn(
          "relative w-full modal-in rounded-xl flex flex-col max-h-[90vh]",
          sizes[size],
        )}
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        {title && (
          <div
            className="flex items-center justify-between px-5 py-3.5 border-b shrink-0"
            style={{ borderColor: "var(--border)" }}
          >
            <h2
              className="text-[14px] font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              {title}
            </h2>
            <button
              onClick={onClose}
              className="rounded-md p-1 transition-colors cursor-pointer hover:[background:var(--bg-hover)]"
              style={{ color: "var(--text-muted)" }}
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
        )}
        <div
          className="p-5 overflow-y-auto"
          style={{ scrollBehavior: "smooth" }}
        >
          {children}
        </div>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
