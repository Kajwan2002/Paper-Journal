import { useEffect, useState } from "react";
import { useCloud } from "@/state/cloud";
import {
  disconnectCloud,
  explain,
  joinWithCode,
  newPairingCode,
  readPairingCode,
  signInWithGoogle,
  spacedCode,
  startCloud,
} from "@/lib/cloud";
import "./sync.css";

type Pane = "closed" | "join" | "show";

function ago(at: number): string {
  const secs = Math.round((Date.now() - at) / 1000);
  if (secs < 45) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** Setting sync up, in one paste, once.
 *
 *  The pairing code is the headline rather than the Google account, which
 *  reads backwards until you have watched a sign-in popup get sandboxed
 *  inside a home-screen app on iOS. The code cannot fail that way: there is
 *  no account, no popup, nothing to leave the app for, and nothing that
 *  expires — which was the whole complaint about the token this replaces.
 *  The Google button stays for the one thing a code can't do, which is get
 *  you back in on a device you haven't paired yet. */
export function Cloud() {
  const config = useCloud((s) => s.config);
  const phase = useCloud((s) => s.phase);
  const error = useCloud((s) => s.error);
  const lastAt = useCloud((s) => s.lastAt);
  const connect = useCloud((s) => s.connect);

  const [pane, setPane] = useState<Pane>("closed");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const run = async (label: string, job: () => Promise<void>) => {
    setBusy(label);
    setNote(null);
    try {
      await job();
    } catch (err) {
      setNote(explain(err));
    } finally {
      setBusy(null);
    }
  };

  const begin = () =>
    void run("Turning on…", async () => {
      connect(await joinWithCode(newPairingCode()));
      setPane("show");
      await startCloud();
    });

  const join = () =>
    void run("Joining…", async () => {
      const id = readPairingCode(typed);
      connect(await joinWithCode(id));
      setTyped("");
      setPane("closed");
      await startCloud();
    });

  const google = () =>
    void run("Opening…", async () => {
      const next = await signInWithGoogle();
      if (!next) return; // leaving for the redirect; App finishes it on return
      connect(next);
      setPane("closed");
      await startCloud();
    });

  const copy = async () => {
    if (!config) return;
    try {
      await navigator.clipboard.writeText(spacedCode(config.journalId));
      setCopied(true);
    } catch {
      setNote("Couldn't reach the clipboard — select the code and copy it.");
    }
  };

  if (config) {
    return (
      <fieldset className="set__group">
        <legend className="set__label">Sync</legend>
        <p className="sync__state" role="status">
          <span
            className={`sync__dot sync__dot--${phase}`}
            aria-hidden="true"
          />
          {phase === "connecting"
            ? "Connecting…"
            : phase === "error"
              ? (error ?? "Sync failed.")
              : lastAt
                ? `In sync · ${ago(lastAt)}`
                : "Connected"}
        </p>
        <p className="set__note">
          {config.mode === "google"
            ? `Signed in${config.label ? ` as ${config.label}` : ""}. Changes go both ways on their own — nothing to press.`
            : "Changes go both ways on their own — nothing to press, and nothing that expires."}
        </p>

        {pane === "show" ? (
          config.mode === "code" ? (
            <>
              <p className="set__note">
                On your other device, open this same page and choose “I have a
                code”, then type or paste this:
              </p>
              <textarea
                className="sync__code"
                readOnly
                rows={2}
                value={spacedCode(config.journalId)}
                onFocus={(e) => e.currentTarget.select()}
              />
              <p className="sync__warn">
                This code is the only thing guarding the journal — keep it to
                yourself. It doesn't expire, so you only ever do this once.
              </p>
            </>
          ) : (
            <p className="set__note">
              Sign in with the same Google account on the other device. There's
              no code to carry.
            </p>
          )
        ) : null}

        <div className="set__row">
          <button
            type="button"
            className="sheet__btn"
            onClick={() => setPane(pane === "show" ? "closed" : "show")}
          >
            {pane === "show" ? "Hide" : "Add a device"}
          </button>
          {pane === "show" && config.mode === "code" ? (
            <button
              type="button"
              className="sheet__btn"
              onClick={() => void copy()}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          ) : null}
          <button
            type="button"
            className="sheet__btn sheet__btn--danger"
            onClick={() => {
              setPane("closed");
              void disconnectCloud();
            }}
          >
            Disconnect
          </button>
        </div>
        {note ? (
          <p className="sync__warn" role="status">
            {note}
          </p>
        ) : null}
        <p className="set__note">
          Disconnecting stops syncing on this device only. The journal stays
          here, and the copy your other device syncs with stays there — keep the
          code and you can rejoin it.
        </p>
      </fieldset>
    );
  }

  return (
    <fieldset className="set__group">
      <legend className="set__label">Sync</legend>
      <p className="set__note">
        Keep this notebook the same on every device. Changes land in about a
        second, in the background, with nothing to press and no account to make.
      </p>

      {pane === "closed" ? (
        <>
          <div className="set__row">
            <button
              type="button"
              className="sheet__btn"
              disabled={busy !== null}
              onClick={begin}
            >
              {busy ?? "Turn on sync"}
            </button>
            <button
              type="button"
              className="sheet__btn"
              disabled={busy !== null}
              onClick={() => {
                setNote(null);
                setPane("join");
              }}
            >
              I have a code
            </button>
          </div>
          <p className="set__note">
            Turn it on here first, then type the code it gives you into your
            other device — once, and never again. Or{" "}
            <button
              type="button"
              className="sync__link"
              disabled={busy !== null}
              onClick={google}
            >
              use a Google account
            </button>{" "}
            instead, if you'd rather have nothing to carry.
          </p>
        </>
      ) : null}

      {pane === "join" ? (
        <>
          <p className="set__note">
            Type the code from the device you turned sync on first. Spaces don't
            matter.
          </p>
          <textarea
            className="sync__code"
            rows={2}
            placeholder="c1a2b3 c4d5e6 …"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
          <div className="set__row">
            <button
              type="button"
              className="sheet__btn"
              disabled={busy !== null || !typed.trim()}
              onClick={join}
            >
              {busy ?? "Join"}
            </button>
            <button
              type="button"
              className="sheet__btn"
              onClick={() => {
                setPane("closed");
                setNote(null);
              }}
            >
              Cancel
            </button>
          </div>
        </>
      ) : null}

      {note ? (
        <p className="sync__warn" role="status">
          {note}
        </p>
      ) : null}
    </fieldset>
  );
}
