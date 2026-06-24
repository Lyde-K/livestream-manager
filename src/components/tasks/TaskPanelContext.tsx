"use client";
import { createContext, useContext, useState } from "react";

interface TaskPanelCtx { open: boolean; setOpen: (v: boolean) => void; }
const Ctx = createContext<TaskPanelCtx>({ open: false, setOpen: () => {} });

export function TaskPanelProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return <Ctx.Provider value={{ open, setOpen }}>{children}</Ctx.Provider>;
}

export function useTaskPanel() { return useContext(Ctx); }
