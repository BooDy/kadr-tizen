import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppErrorBoundary } from '../../src/components/tv/AppErrorBoundary';
import { TVKeys } from '../../src/navigation/keys';
import { BOOT_ERROR_ELEMENT_ID } from '../../src/utils/bootTrap';

describe('AppErrorBoundary', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    delete window.__kadrDisarmBootTrap;
    document.getElementById(BOOT_ERROR_ELEMENT_ID)?.remove();
  });

  it('renders children directly with zero extra wrapper elements during normal operation', () => {
    const { container } = render(
      <AppErrorBoundary>
        <div data-testid="healthy-child">Video Plane Clear</div>
      </AppErrorBoundary>
    );

    expect(container.firstElementChild).toBe(screen.getByTestId('healthy-child'));
  });

  it('renders a zero-gap TV recovery dialog on fatal React render crash and recovers on TV Back or Try Again', () => {
    let shouldCrash = true;
    function FlakyScreen() {
      if (shouldCrash) {
        throw new Error('Unexpected render crash in widget');
      }
      return <div data-testid="recovered-screen">Browse Screen Active</div>;
    }

    const { container } = render(
      <AppErrorBoundary>
        <FlakyScreen />
      </AppErrorBoundary>
    );

    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText(/Unexpected render crash in widget/i)).toBeInTheDocument();

    // Verify zero CSS flex gap-* classes anywhere in recovery UI
    container.querySelectorAll('*').forEach((el) => {
      const cls = typeof el.className === 'string' ? el.className : '';
      expect(cls).not.toMatch(/\bgap-\S+/);
    });

    // Fix underlying condition and press TV Back (10009) -> boundary resets and mounts FlakyScreen cleanly
    shouldCrash = false;
    fireEvent.keyDown(window, { keyCode: TVKeys.BACK_TIZEN, key: 'Escape' });

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('recovered-screen')).toBeInTheDocument();
  });

  it('navigates between Try Again and Reload App via D-pad Left/Right + Enter', () => {
    const onReload = vi.fn();
    function AlwaysCrash(): never {
      throw new Error('Fatal crash');
    }

    render(
      <AppErrorBoundary onReload={onReload}>
        <AlwaysCrash />
      </AppErrorBoundary>
    );

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    // Move focus right to Reload App and press Enter
    fireEvent.keyDown(window, { keyCode: TVKeys.RIGHT, key: 'ArrowRight' });
    fireEvent.keyDown(window, { keyCode: TVKeys.ENTER, key: 'Enter' });

    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it('moves focus back to Try Again on D-pad Left and recovers on Enter or button click', () => {
    let shouldCrash = true;
    const onReload = vi.fn();
    function FlakyScreen() {
      if (shouldCrash) {
        throw new Error('Transient crash');
      }
      return <div data-testid="recovered-screen">Recovered</div>;
    }

    render(
      <AppErrorBoundary onReload={onReload}>
        <FlakyScreen />
      </AppErrorBoundary>
    );

    // Move right then left back to Try Again, then press Enter
    fireEvent.keyDown(window, { keyCode: TVKeys.RIGHT, key: 'ArrowRight' });
    fireEvent.keyDown(window, { keyCode: TVKeys.LEFT, key: 'ArrowLeft' });
    shouldCrash = false;
    fireEvent.keyDown(window, { keyCode: TVKeys.ENTER, key: 'Enter' });

    expect(onReload).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('recovered-screen')).toBeInTheDocument();
  });

  it('supports clicking Try Again and Reload App buttons directly', () => {
    let shouldCrash = true;
    const onReload = vi.fn();
    function FlakyScreen() {
      if (shouldCrash) {
        throw new Error('Clickable crash');
      }
      return <div data-testid="recovered-screen">Recovered via click</div>;
    }

    const { rerender } = render(
      <AppErrorBoundary onReload={onReload}>
        <FlakyScreen />
      </AppErrorBoundary>
    );

    const reloadBtn = screen.getByRole('button', { name: /Reload App/i });
    fireEvent.click(reloadBtn);
    expect(onReload).toHaveBeenCalledTimes(1);

    shouldCrash = false;
    const tryAgainBtn = screen.getByRole('button', { name: /Try Again/i });
    fireEvent.click(tryAgainBtn);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('recovered-screen')).toBeInTheDocument();

    // Ensure rerender remains healthy
    rerender(
      <AppErrorBoundary onReload={onReload}>
        <FlakyScreen />
      </AppErrorBoundary>
    );
    expect(screen.getByTestId('recovered-screen')).toBeInTheDocument();
  });

  it('disarms the pre-boot startup error trap if a crash occurs during initial render', () => {
    const disarmSpy = vi.fn();
    window.__kadrDisarmBootTrap = disarmSpy;
    const banner = document.createElement('div');
    banner.id = BOOT_ERROR_ELEMENT_ID;
    document.body.appendChild(banner);

    function InitialCrash(): never {
      throw new Error('Initial render crash');
    }

    render(
      <AppErrorBoundary>
        <InitialCrash />
      </AppErrorBoundary>
    );

    expect(disarmSpy).toHaveBeenCalledTimes(1);
    expect(document.getElementById(BOOT_ERROR_ELEMENT_ID)).toBeNull();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });
});
