import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** A crash used to unmount everything and leave a bare desk — no book, no
 *  controls, nothing to press. On an app holding someone's journal that
 *  reads like the writing is gone, when in fact it is safe in IndexedDB and
 *  a reload would have brought it straight back. Say so, and offer the
 *  reload. */
export class Boundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Marginalia crashed:", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="blocked">
        <div className="blocked__card">
          <h1 className="blocked__title">Something came unstuck</h1>
          <p className="blocked__body">
            Your journal is safe — it lives in this browser's own storage, and
            nothing here touched it. Reloading should put the notebook back on
            the desk.
          </p>
          <p className="blocked__detail">{error.message}</p>
          <div className="set__row">
            <button
              type="button"
              className="sheet__btn"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
            <button
              type="button"
              className="sheet__btn"
              onClick={() => this.setState({ error: null })}
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }
}
