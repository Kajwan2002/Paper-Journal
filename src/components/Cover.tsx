import type { CoverStyle } from "@/lib/db";
import "./cover.css";

interface Props {
  title: string;
  cover: CoverStyle;
  open: boolean;
}

export function Cover({ title, cover, open }: Props) {
  return (
    <div
      className={`cover cover--${cover} ${open ? "cover--open" : ""}`}
      aria-hidden="true"
    >
      <span className="cover__grain" />
      <span className="cover__frame" />
      <span className="cover__title">{title}</span>
      <span className="cover__spinelip" />
    </div>
  );
}
