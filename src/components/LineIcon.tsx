import { ICONS, type IconId } from "@/lib/icons";

/** One of the little drawings, inked at the weight of the writing it sits
 *  beside. `aria-hidden` because it is never new information — it is always
 *  a restatement of a word already on the line, and a screen reader
 *  announcing "dumbbell, gym" twice is worse than silence. */
export function LineIcon({
  icon,
  className = "ruled__icon",
}: {
  icon: IconId;
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ICONS[icon].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
