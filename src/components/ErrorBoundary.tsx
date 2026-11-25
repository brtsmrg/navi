import { Component, type ErrorInfo, type ReactNode } from 'react';

/** If a screen crashes, show a way out instead of a blank page. Saved places and settings are untouched. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Navi crashed', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <main role="alert" className="grid h-dvh place-items-center bg-bg p-6 text-ink">
        <div className="max-w-sm space-y-4 text-center">
          <h1 className="font-display text-3xl font-semibold">Navi hit a problem</h1>
          <p className="text-[15px] leading-relaxed text-mute">
            Something went wrong on this screen. Your saved places and settings are safe. Reload to carry on.
          </p>
          <p className="break-words rounded-xl bg-panel p-3 text-left text-xs text-mute">{`${error.name}: ${error.message}`.slice(0, 240)}</p>
          <button
            type="button"
            onClick={() => location.reload()}
            className="min-h-12 w-full rounded-2xl bg-brand px-5 font-semibold text-white"
          >
            Reload Navi
          </button>
        </div>
      </main>
    );
  }
}
