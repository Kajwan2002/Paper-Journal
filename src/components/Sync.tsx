import { useEffect, useState } from "react";
import { useSync } from "@/state/sync";
import { connectWithToken, makeSyncCode, readSyncCode } from "@/lib/pairing";
import { startSync, stopSync, syncNow } from "@/lib/sync";
import "./sync.css";

const TOKEN_URL =
  "https://github.com/settings/tokens/new?scopes=gist&description=Marginalia%20sync";

type Pane = "closed" | "first" | "join" | "code";

function ago(at: number): string {
  const secs = Math.round((Date.now() - at) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** Setting up sync, in as few steps as the thing allows.
 *
 *  First device: paste a GitHub token. Second device: paste the sync code the
 *  first one shows you. That's it — no accounts to make, no server to run,
 *  nothing to pay, because it rides on a GitHub account you already have. */
export function Sync() {
  const config = useSync((s) => s.config);
  const phase = useSync((s) => s.phase);
  const error = useSync((s) => s.error);
  const lastSynced = useSync((s) => s.lastSynced);
  const connect = useSync((s) => s.connect);
  const disconnect = useSync((s) => s.disconnect);

  const [pane, setPane] = useState<Pane>("closed");
  const [token, setToken] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const start = async () => {
    setBusy(true);
    setNote(null);
    try {
      const next = await connectWithToken(token);
      connect(next);
      setToken("");
      setPane("code");
      startSync();
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Couldn't connect.");
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    setBusy(true);
    setNote(null);
    try {
      connect(readSyncCode(code));
      setCode("");
      setPane("closed");
      startSync();
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Couldn't read that code.");
    } finally {
      setBusy(false);
    }
  };

  const copyCode = async () => {
    if (!config) return;
    try {
      await navigator.clipboard.writeText(makeSyncCode(config));
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
          {phase === "working"
            ? "Syncing…"
            : phase === "error"
              ? (error ?? "Sync failed.")
              : lastSynced
                ? `Synced ${ago(lastSynced)}`
                : "Connected"}
        </p>

        {pane === "code" ? (
          <>
            <p className="set__note">
              On your other device, open this same page and choose “I have a
              sync code”, then paste this:
            </p>
            <textarea
              className="sync__code"
              readOnly
              rows={3}
              value={makeSyncCode(config)}
              onFocus={(e) => e.currentTarget.select()}
            />
            <p className="sync__warn">
              Treat this like a password — it carries your GitHub token. Send it
              to yourself, not to anyone else.
            </p>
          </>
        ) : null}

        <div className="set__row">
          <button
            type="button"
            className="sheet__btn"
            onClick={() => void syncNow()}
          >
            Sync now
          </button>
          <button
            type="button"
            className="sheet__btn"
            onClick={() => setPane(pane === "code" ? "closed" : "code")}
          >
            {pane === "code" ? "Hide code" : "Add a device"}
          </button>
          {pane === "code" ? (
            <button type="button" className="sheet__btn" onClick={copyCode}>
              {copied ? "Copied" : "Copy"}
            </button>
          ) : null}
          <button
            type="button"
            className="sheet__btn sheet__btn--danger"
            onClick={() => {
              stopSync();
              disconnect();
              setPane("closed");
            }}
          >
            Disconnect
          </button>
        </div>
        <p className="set__note">
          Disconnecting stops syncing on this device only. Your journal stays
          here, and the copy on GitHub stays there.
        </p>
      </fieldset>
    );
  }

  return (
    <fieldset className="set__group">
      <legend className="set__label">Sync</legend>
      <p className="set__note">
        Keep this notebook the same on every device, through a private gist in
        your own GitHub account. Free, no new account, and encrypted here before
        it leaves — GitHub only ever holds ciphertext.
      </p>

      {pane === "closed" ? (
        <div className="set__row">
          <button
            type="button"
            className="sheet__btn"
            onClick={() => setPane("first")}
          >
            Set up on this device
          </button>
          <button
            type="button"
            className="sheet__btn"
            onClick={() => setPane("join")}
          >
            I have a sync code
          </button>
        </div>
      ) : null}

      {pane === "first" ? (
        <>
          <ol className="sync__steps">
            <li>
              <a href={TOKEN_URL} target="_blank" rel="noreferrer">
                Open GitHub's token page
              </a>{" "}
              — “gist” is already ticked for you.
            </li>
            <li>Scroll down, press “Generate token”, and copy it.</li>
            <li>Paste it here.</li>
          </ol>
          <input
            className="set__input"
            type="password"
            placeholder="ghp_…"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <div className="set__row">
            <button
              type="button"
              className="sheet__btn"
              disabled={busy || !token.trim()}
              onClick={() => void start()}
            >
              {busy ? "Connecting…" : "Connect"}
            </button>
            <button
              type="button"
              className="sheet__btn"
              onClick={() => setPane("closed")}
            >
              Cancel
            </button>
          </div>
        </>
      ) : null}

      {pane === "join" ? (
        <>
          <p className="set__note">
            Paste the sync code from the device you set up first.
          </p>
          <textarea
            className="sync__code"
            rows={3}
            placeholder="marg1.…"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <div className="set__row">
            <button
              type="button"
              className="sheet__btn"
              disabled={busy || !code.trim()}
              onClick={() => void join()}
            >
              {busy ? "Joining…" : "Join"}
            </button>
            <button
              type="button"
              className="sheet__btn"
              onClick={() => setPane("closed")}
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
