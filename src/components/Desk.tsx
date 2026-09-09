import type { ReactNode } from "react";
import "./desk.css";

export function Desk({ children }: { children: ReactNode }) {
  return (
    <div className="desk">
      <div className="desk__grain" aria-hidden="true" />
      <div className="desk__vignette" aria-hidden="true" />
      <div className="desk__stage">{children}</div>
    </div>
  );
}
