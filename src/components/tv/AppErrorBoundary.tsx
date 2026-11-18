import { Component, Fragment, type ErrorInfo, type ReactNode } from 'react';
import { TVKeys } from '../../navigation/keys';
import { BOOT_ERROR_ELEMENT_ID } from '../../utils/bootTrap';

export interface AppErrorBoundaryProps {
  children: ReactNode;
  onReload?: () => void;
}

export interface AppErrorBoundaryState {
  error: Error | null;
  focusedAction: 'recover' | 'reload';
  resetCount: number;
}

const DEFAULT_ERROR_MESSAGE = 'An unexpected application error occurred.';

function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  if (typeof error === 'string') {
    return new Error(error.trim() ? error : DEFAULT_ERROR_MESSAGE);
  }
  if (
    error !== null &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    const msg = (error as { message: string }).message;
    return new Error(msg.trim() ? msg : DEFAULT_ERROR_MESSAGE);
  }
  if (error === null || error === undefined) {
    return new Error(DEFAULT_ERROR_MESSAGE);
  }
  const str = String(error);
  return new Error(str.trim() ? str : DEFAULT_ERROR_MESSAGE);
}

/**
 * Root React ErrorBoundary for Samsung Tizen 5.5 / Chromium 69.
 * Renders zero wrapper DOM elements during normal operation so hardware
 * AVPlay video planes remain unobstructed, and displays a D-pad / TV-Back
 * recoverable modal when a fatal render error occurs.
 */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  private keyListenerAttached = false;

  constructor(props: AppErrorBoundaryProps) {
    super(props);
    this.state = {
      error: null,
      focusedAction: 'recover',
      resetCount: 0,
    };
  }

  static getDerivedStateFromError(error: unknown): Partial<AppErrorBoundaryState> {
    return {
      error: normalizeError(error),
      focusedAction: 'recover',
    };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    if (typeof window !== 'undefined') {
      window.__kadrDisarmBootTrap?.();
    }
    if (typeof document !== 'undefined') {
      document.getElementById(BOOT_ERROR_ELEMENT_ID)?.remove();
    }
    console.error('[AppErrorBoundary] Uncaught render error:', error, info);
  }

  componentDidMount(): void {
    this.syncKeyListener();
  }

  componentDidUpdate(): void {
    this.syncKeyListener();
  }

  componentWillUnmount(): void {
    this.detachKeyListener();
  }

  private syncKeyListener(): void {
    if (this.state.error !== null) {
      this.attachKeyListener();
    } else {
      this.detachKeyListener();
    }
  }

  private attachKeyListener(): void {
    if (this.keyListenerAttached || typeof window === 'undefined') return;
    window.addEventListener('keydown', this.handleKeyDown, true);
    this.keyListenerAttached = true;
  }

  private detachKeyListener(): void {
    if (!this.keyListenerAttached || typeof window === 'undefined') return;
    window.removeEventListener('keydown', this.handleKeyDown, true);
    this.keyListenerAttached = false;
  }

  private handleRecover = (): void => {
    this.setState((prev) => ({
      error: null,
      focusedAction: 'recover',
      resetCount: prev.resetCount + 1,
    }));
  };

  private handleReload = (): void => {
    if (this.props.onReload) {
      this.props.onReload();
      return;
    }
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (this.state.error === null) return;

    const code = e.keyCode || e.which;
    const key = e.key || '';

    if (code === TVKeys.LEFT || key === 'ArrowLeft') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      this.setState({ focusedAction: 'recover' });
      return;
    }

    if (code === TVKeys.RIGHT || key === 'ArrowRight') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      this.setState({ focusedAction: 'reload' });
      return;
    }

    if (code === TVKeys.ENTER || key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (this.state.focusedAction === 'reload') {
        this.handleReload();
      } else {
        this.handleRecover();
      }
      return;
    }

    if (
      code === TVKeys.BACK_TIZEN ||
      code === TVKeys.BACK_WEB ||
      code === TVKeys.BACKSPACE ||
      key === 'Escape' ||
      key === 'Backspace' ||
      key === 'XF86Back'
    ) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      this.handleRecover();
    }
  };

  render(): ReactNode {
    if (this.state.error === null) {
      return <Fragment key={this.state.resetCount}>{this.props.children}</Fragment>;
    }

    const { error, focusedAction } = this.state;
    const isRecoverFocused = focusedAction === 'recover';
    const isReloadFocused = focusedAction === 'reload';
    const message = error?.message || DEFAULT_ERROR_MESSAGE;

    return (
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="kadr-error-title"
        aria-describedby="kadr-error-message"
        className="fixed inset-0 z-50 bg-[#2A0A0A]/90 flex items-center justify-center p-8"
      >
        <div className="w-full max-w-2xl bg-[#3B1111] border border-[rgba(245,229,229,0.08)] rounded-3xl p-10 flex flex-col items-center text-center shadow-2xl">
          <h1
            id="kadr-error-title"
            className="text-3xl font-bold text-[#F5E5E5] tracking-tight mb-3"
          >
            Something went wrong
          </h1>
          <p
            id="kadr-error-message"
            className="w-full max-h-48 overflow-hidden text-base font-mono text-[#F5E5E5]/85 bg-[#2A0A0A]/75 border border-[rgba(245,229,229,0.08)] rounded-xl px-5 py-4 mb-6 break-words"
          >
            {message}
          </p>

          <div className="flex items-center justify-center">
            <button
              type="button"
              tabIndex={-1}
              onClick={this.handleRecover}
              aria-current={isRecoverFocused ? 'true' : undefined}
              className={`px-8 py-4 rounded-xl font-semibold text-xl tracking-wide transition-transform duration-75 outline-none flex items-center justify-center cursor-pointer select-none border mr-4 ${
                isRecoverFocused
                  ? 'bg-[#FF6B00] text-white border-transparent tv-focus-ring'
                  : 'bg-[#4A1616] text-[#F5E5E5] border-[rgba(245,229,229,0.08)]'
              }`}
            >
              Try Again
            </button>
            <button
              type="button"
              tabIndex={-1}
              onClick={this.handleReload}
              aria-current={isReloadFocused ? 'true' : undefined}
              className={`px-8 py-4 rounded-xl font-semibold text-xl tracking-wide transition-transform duration-75 outline-none flex items-center justify-center cursor-pointer select-none border ${
                isReloadFocused
                  ? 'bg-[#FF6B00] text-white border-transparent tv-focus-ring'
                  : 'bg-[#4A1616] text-[#F5E5E5] border-[rgba(245,229,229,0.08)]'
              }`}
            >
              Reload App
            </button>
          </div>

          <p className="mt-6 text-sm text-[#F5E5E5]/60">
            Use Left / Right to select, OK to confirm, or Back to retry.
          </p>
        </div>
      </div>
    );
  }
}
