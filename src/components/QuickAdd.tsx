import { GLYPH, QUICK_KINDS } from "@/lib/rapidlog";
import { useSession } from "@/state/session";
import { useOverlay } from "@/state/overlay";
import { useQuickAdd } from "@/state/quickadd";
import "./quick-add.css";

const LABEL: Record<string, string> = {
  task: "task",
  priority: "priority",
  event: "event",
  idea: "idea",
  note: "note",
};

export function QuickAdd() {
  const open = useSession((s) => s.open);
  const overlay = useOverlay((s) => s.open !== null);
  const request = useQuickAdd((s) => s.request);

  if (!open || overlay) return null;

  return (
    <div className="qadd" role="group" aria-label="Add a line">
      {QUICK_KINDS.map((kind) => (
        <button
          key={kind}
          type="button"
          className={`qadd__nib qadd__nib--${kind}`}
          title={`Add a ${LABEL[kind]}`}
          aria-label={`Add a ${LABEL[kind]}`}
          onClick={() => request(kind)}
        >
          {GLYPH[kind]}
        </button>
      ))}
    </div>
  );
}
