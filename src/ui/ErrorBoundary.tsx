import { Component, type ReactNode } from "react";

// A render crash used to blank the whole screen (React unmounts the tree). This
// catches it, shows what went wrong, and offers a reload — much better than a
// white screen, and it surfaces the actual error for debugging.

interface Props {
  children: ReactNode;
  onReset?: () => void;
}
interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("Render crash:", error);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="app screen">
          <div className="screen-body" style={{ textAlign: "center", gap: "1rem", paddingTop: "3rem" }}>
            <h1>Something broke</h1>
            <p className="cr-lbl">The screen hit an error. Reloading usually fixes it.</p>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                fontSize: "0.72rem",
                opacity: 0.7,
                maxHeight: "8rem",
                overflow: "auto",
                textAlign: "left",
              }}
            >
              {this.state.error.message}
            </pre>
            <button className="big play-primary" onClick={() => window.location.reload()}>
              Reload
            </button>
            {this.props.onReset && (
              <button
                className="big"
                onClick={() => {
                  this.setState({ error: null });
                  this.props.onReset?.();
                }}
              >
                Back to games
              </button>
            )}
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}
