import type { ReactNode } from "react";
import { DeskControls } from "@/components/DeskControls";
import { QuickAdd } from "@/components/QuickAdd";
import "./desk.css";

export function Desk({ children }: { children: ReactNode }) {
  return (
    <div className="desk">
      <div className="desk__grain" aria-hidden="true" />
      <div className="desk__vignette" aria-hidden="true" />
      <div className="desk__stage">{children}</div>
      <QuickAdd />
      <DeskControls />
    </div>
  );
}
