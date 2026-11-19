import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FocusProvider, useFocusContext } from '../../src/navigation/FocusContext';
import { TVButton } from '../../src/components/tv/TVButton';
import { TVKeys } from '../../src/navigation/keys';
import { ExitConfirmModal } from '../../src/components/tv/ExitConfirmModal';

describe('ExitConfirmModal', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <FocusProvider>
        <ExitConfirmModal isOpen={false} onCancel={vi.fn()} onConfirmExit={vi.fn()} />
      </FocusProvider>
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders zero gap-* classes and focuses Cancel (exit-cancel-btn) by default', () => {
    function TestHarness() {
      const { focusedId } = useFocusContext();
      return (
        <div>
          <div data-testid="focused-id">{focusedId}</div>
          <TVButton id="bg-sidebar-btn" groupId="sidebar" autoFocus>
            Home
          </TVButton>
          <ExitConfirmModal isOpen={true} onCancel={vi.fn()} onConfirmExit={vi.fn()} />
        </div>
      );
    }

    render(
      <FocusProvider>
        <TestHarness />
      </FocusProvider>
    );

    const dialog = screen.getByRole('dialog', { name: /Exit Kadr/i });
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');

    // Verify zero gap-* classes anywhere inside the rendered modal
    const allElements = [dialog, ...Array.from(dialog.querySelectorAll('*'))];
    for (const el of allElements) {
      expect(el.className).not.toMatch(/\bgap-/);
    }

    const cancelBtn = document.getElementById('exit-cancel-btn');
    const confirmBtn = document.getElementById('exit-confirm-btn');
    expect(cancelBtn).toBeInTheDocument();
    expect(confirmBtn).toBeInTheDocument();
    expect(cancelBtn).toHaveTextContent('Cancel');
    expect(confirmBtn).toHaveTextContent('Exit Kadr');

    expect(screen.getByTestId('focused-id').textContent).toBe('exit-cancel-btn');
    expect(cancelBtn).toHaveClass('tv-focus-ring');
    expect(document.activeElement).toBe(cancelBtn);
  });

  it('closes via onCancel on TVKeys.BACK_TIZEN (10009), Escape, and Backspace with stopImmediatePropagation', () => {
    const onCancel = vi.fn();
    const afterListener = vi.fn();

    render(
      <FocusProvider>
        <ExitConfirmModal isOpen={true} onCancel={onCancel} onConfirmExit={vi.fn()} />
      </FocusProvider>
    );

    window.addEventListener('keydown', afterListener);
    try {
      const tizenBackEvent = new KeyboardEvent('keydown', {
        keyCode: TVKeys.BACK_TIZEN,
        bubbles: true,
        cancelable: true,
      });
      const stopImmSpy = vi.spyOn(tizenBackEvent, 'stopImmediatePropagation');
      window.dispatchEvent(tizenBackEvent);

      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(tizenBackEvent.defaultPrevented).toBe(true);
      expect(stopImmSpy).toHaveBeenCalledTimes(1);
      expect(afterListener).not.toHaveBeenCalled();

      fireEvent.keyDown(window, { key: 'Escape', keyCode: TVKeys.BACK_WEB });
      expect(onCancel).toHaveBeenCalledTimes(2);

      fireEvent.keyDown(window, { key: 'Backspace', keyCode: TVKeys.BACKSPACE });
      expect(onCancel).toHaveBeenCalledTimes(3);
    } finally {
      window.removeEventListener('keydown', afterListener);
    }
  });

  it('navigates between Cancel and Exit Kadr with ArrowRight/ArrowLeft and invokes onConfirmExit on Enter or click', () => {
    const onCancel = vi.fn();
    const onConfirmExit = vi.fn();

    render(
      <FocusProvider>
        <ExitConfirmModal isOpen={true} onCancel={onCancel} onConfirmExit={onConfirmExit} />
      </FocusProvider>
    );

    const cancelBtn = document.getElementById('exit-cancel-btn')!;
    const confirmBtn = document.getElementById('exit-confirm-btn')!;

    expect(cancelBtn).toHaveClass('tv-focus-ring');

    // ArrowRight moves focus to Exit Kadr
    fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
    expect(confirmBtn).toHaveClass('tv-focus-ring');
    expect(cancelBtn).not.toHaveClass('tv-focus-ring');

    // Enter invokes onConfirmExit
    fireEvent.keyDown(window, { key: 'Enter', keyCode: TVKeys.ENTER });
    expect(onConfirmExit).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();

    // ArrowLeft returns focus to Cancel
    fireEvent.keyDown(window, { key: 'ArrowLeft', keyCode: TVKeys.LEFT });
    expect(cancelBtn).toHaveClass('tv-focus-ring');

    // Clicking Exit Kadr invokes onConfirmExit; clicking Cancel invokes onCancel
    fireEvent.click(confirmBtn);
    expect(onConfirmExit).toHaveBeenCalledTimes(2);
    fireEvent.click(cancelBtn);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('restores focus to previous element when closed via onCancel', () => {
    function ToggleHarness({ open }: { open: boolean }) {
      return (
        <FocusProvider>
          <div>
            <TVButton id="nav-screen-home" groupId="sidebar" autoFocus>
              Home
            </TVButton>
            <ExitConfirmModal isOpen={open} onCancel={vi.fn()} onConfirmExit={vi.fn()} />
          </div>
        </FocusProvider>
      );
    }

    const { rerender } = render(<ToggleHarness open={false} />);
    expect(document.getElementById('nav-screen-home')).toHaveClass('tv-focus-ring');

    rerender(<ToggleHarness open={true} />);
    expect(document.getElementById('exit-cancel-btn')).toHaveClass('tv-focus-ring');

    rerender(<ToggleHarness open={false} />);
    expect(document.getElementById('nav-screen-home')).toHaveClass('tv-focus-ring');
    expect(document.activeElement).toBe(document.getElementById('nav-screen-home'));
  });

  it('ignores Back key when activeTrap belongs to a different trap group', () => {
    const onCancel = vi.fn();
    function TrapHarness() {
      const { pushTrap } = useFocusContext();
      return (
        <div>
          <button type="button" data-testid="push-other" onClick={() => pushTrap('other-modal')}>
            Push Other
          </button>
          <ExitConfirmModal isOpen={true} onCancel={onCancel} onConfirmExit={vi.fn()} />
        </div>
      );
    }

    render(
      <FocusProvider>
        <TrapHarness />
      </FocusProvider>
    );

    fireEvent.click(screen.getByTestId('push-other'));
    fireEvent.keyDown(window, { keyCode: TVKeys.BACK_TIZEN, key: 'Escape' });
    expect(onCancel).not.toHaveBeenCalled();
  });
});
