/** A tiny time-based spring integrator — enough for the page-turn, no deps.
 *  Drives a single scalar from `from` toward `to`, seeded with `velocity`
 *  (units per second). Calls `onUpdate` every frame and `onSettle` once
 *  the value has come to rest. Returns a cancel function. */

export interface SpringConfig {
  /** higher = snappier */
  stiffness?: number;
  /** higher = less oscillation */
  damping?: number;
  mass?: number;
  /** stop when both distance and speed fall below this */
  restThreshold?: number;
}

export function runSpring(
  from: number,
  to: number,
  velocity: number,
  onUpdate: (value: number) => void,
  onSettle: () => void,
  config: SpringConfig = {},
): () => void {
  const stiffness = config.stiffness ?? 200;
  const damping = config.damping ?? 26;
  const mass = config.mass ?? 1;
  const rest = config.restThreshold ?? 0.0004;

  let pos = from;
  let vel = velocity;
  let raf = 0;
  let prev = performance.now();
  let cancelled = false;

  const frame = (now: number) => {
    if (cancelled) return;
    let dt = (now - prev) / 1000;
    prev = now;
    if (dt > 1 / 30) dt = 1 / 30; // ignore long gaps (tab was hidden)

    // sub-step for stability at stiff settings / high refresh rates
    const substeps = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / substeps;
    for (let i = 0; i < substeps; i++) {
      const spring = -stiffness * (pos - to);
      const friction = -damping * vel;
      vel += ((spring + friction) / mass) * h;
      pos += vel * h;
    }

    if (Math.abs(to - pos) < rest && Math.abs(vel) < rest) {
      onUpdate(to);
      onSettle();
      return;
    }
    onUpdate(pos);
    raf = requestAnimationFrame(frame);
  };

  raf = requestAnimationFrame(frame);

  return () => {
    cancelled = true;
    cancelAnimationFrame(raf);
  };
}

export const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);
