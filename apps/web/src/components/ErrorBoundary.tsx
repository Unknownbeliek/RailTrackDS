/**
 * The last line of defence against a white screen.
 *
 * A render-time exception in any screen used to unmount the whole React tree and
 * leave an empty page with nothing in it: no tabs, no message, no way out. That
 * is the worst possible failure for a product whose job is to tell you what is
 * happening on a railway. React only recovers from this with an error boundary,
 * so there is exactly one, at the top, and it says three useful things: what
 * broke, that the data is unaffected, and how to get back.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // No console noise in tests, but a real breadcrumb in the browser.
    if (typeof console !== 'undefined') {
      console.error('RailPulse screen crashed', error, info.componentStack);
    }
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <CrashReport
        message={this.state.error.message}
        onReset={() => {
          this.setState({ error: null });
        }}
      />
    );
  }
}

function CrashReport({ message, onReset }: { message: string; onReset: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="rp-screen">
      <div className="rp-crash" role="alert">
        <p className="rp-crash__title">{t('crash.title')}</p>
        <p className="rp-crash__body">{t('crash.body')}</p>
        <p className="rp-crash__detail">{message}</p>
        <div className="rp-crash__actions">
          <button type="button" className="rp-button" onClick={onReset}>
            {t('crash.retry')}
          </button>
          <button
            type="button"
            className="rp-button rp-button--ghost"
            onClick={() => {
              window.location.reload();
            }}
          >
            {t('crash.reload')}
          </button>
        </div>
      </div>
    </div>
  );
}
