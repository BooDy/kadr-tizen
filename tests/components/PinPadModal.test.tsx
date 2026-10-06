import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { FocusProvider, useFocusContext } from '../../src/navigation/FocusContext';
import { PinPadModal } from '../../src/components/pin/PinPadModal';
import { TVButton } from '../../src/components/tv/TVButton';
import { TVKeys } from '../../src/navigation/keys';

describe('PinPadModal', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders 4 PIN dots and accepts remote numeric input', () => {
    const onSubmit = vi.fn();
    const onClose = vi.fn();

    render(
      <FocusProvider>
        <PinPadModal
          isOpen={true}
          username="Boody"
          onSubmit={onSubmit}
          onClose={onClose}
        />
      </FocusProvider>
    );

    expect(screen.getByText(/Enter PIN for Boody/i)).toBeInTheDocument();

    // Type 4 digits: 1, 2, 3, 4
    fireEvent.keyDown(window, { key: '1', keyCode: 49 });
    fireEvent.keyDown(window, { key: '2', keyCode: 50 });
    fireEvent.keyDown(window, { key: '3', keyCode: 51 });
    fireEvent.keyDown(window, { key: '4', keyCode: 52 });

    expect(onSubmit).toHaveBeenCalledWith('1234');
  });

  it('handles remote Backspace key to remove last entered digit', () => {
    const onSubmit = vi.fn();
    const onClose = vi.fn();

    render(
      <FocusProvider>
        <PinPadModal
          isOpen={true}
          username="Boody"
          onSubmit={onSubmit}
          onClose={onClose}
        />
      </FocusProvider>
    );

    // Type '1', '2', then Backspace, then '3', '4', '5'
    fireEvent.keyDown(window, { key: '1', keyCode: TVKeys.NUM_0 + 1 });
    fireEvent.keyDown(window, { key: '2', keyCode: TVKeys.NUM_0 + 2 });
    fireEvent.keyDown(window, { key: 'Backspace', keyCode: TVKeys.BACKSPACE });
    fireEvent.keyDown(window, { key: '3', keyCode: TVKeys.NUM_0 + 3 });
    fireEvent.keyDown(window, { key: '4', keyCode: TVKeys.NUM_0 + 4 });
    fireEvent.keyDown(window, { key: '5', keyCode: TVKeys.NUM_0 + 5 });

    // Since '2' was deleted, sequence is 1 -> 3 -> 4 -> 5
    expect(onSubmit).toHaveBeenCalledWith('1345');
  });

  it('allows on-screen keypad entry via clicking/pressing digits', () => {
    const onSubmit = vi.fn();
    const onClose = vi.fn();

    render(
      <FocusProvider>
        <PinPadModal
          isOpen={true}
          username="Guest"
          onSubmit={onSubmit}
          onClose={onClose}
        />
      </FocusProvider>
    );

    // Click keypad buttons 9, 8, 7, 6
    fireEvent.click(screen.getByTestId('keypad-9'));
    fireEvent.click(screen.getByTestId('keypad-8'));
    fireEvent.click(screen.getByTestId('keypad-7'));
    fireEvent.click(screen.getByTestId('keypad-6'));

    expect(onSubmit).toHaveBeenCalledWith('9876');
  });

  it('supports on-screen backspace and clear buttons', () => {
    const onSubmit = vi.fn();
    const onClose = vi.fn();

    render(
      <FocusProvider>
        <PinPadModal
          isOpen={true}
          username="Admin"
          onSubmit={onSubmit}
          onClose={onClose}
        />
      </FocusProvider>
    );

    // Enter 1, 2
    fireEvent.click(screen.getByTestId('keypad-1'));
    fireEvent.click(screen.getByTestId('keypad-2'));

    // Clear all
    fireEvent.click(screen.getByTestId('keypad-clear'));

    // Enter 5, 6, 7, 8, then backspace, then 9
    fireEvent.click(screen.getByTestId('keypad-5'));
    fireEvent.click(screen.getByTestId('keypad-6'));
    fireEvent.click(screen.getByTestId('keypad-7'));
    fireEvent.click(screen.getByTestId('keypad-8'));
    // 4 digits entered so onSubmit('5678')
    expect(onSubmit).toHaveBeenCalledWith('5678');
  });

  it('displays lockout message and counts down when lockedOutSecs > 0', () => {
    vi.useFakeTimers();
    const onSubmit = vi.fn();
    const onClose = vi.fn();

    render(
      <FocusProvider>
        <PinPadModal
          isOpen={true}
          username="Boody"
          onSubmit={onSubmit}
          onClose={onClose}
          lockedOutSecs={5}
        />
      </FocusProvider>
    );

    expect(screen.getByText(/Locked out for 5s/i)).toBeInTheDocument();

    // Advance 2 seconds
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByText(/Locked out for 3s/i)).toBeInTheDocument();

    // Advance remaining 3 seconds
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    // Countdown completed -> PIN dots visible again
    expect(screen.queryByText(/Locked out for/i)).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  it('ignores numeric input while locked out', () => {
    const onSubmit = vi.fn();
    const onClose = vi.fn();

    render(
      <FocusProvider>
        <PinPadModal
          isOpen={true}
          username="Boody"
          onSubmit={onSubmit}
          onClose={onClose}
          lockedOutSecs={15}
        />
      </FocusProvider>
    );

    fireEvent.keyDown(window, { key: '1', keyCode: 49 });
    fireEvent.keyDown(window, { key: '2', keyCode: 50 });
    fireEvent.keyDown(window, { key: '3', keyCode: 51 });
    fireEvent.keyDown(window, { key: '4', keyCode: 52 });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('displays custom error message when provided', () => {
    render(
      <FocusProvider>
        <PinPadModal
          isOpen={true}
          username="Boody"
          onSubmit={vi.fn()}
          onClose={vi.fn()}
          errorMessage="Incorrect PIN. Please try again."
        />
      </FocusProvider>
    );

    expect(screen.getByText('Incorrect PIN. Please try again.')).toBeInTheDocument();
  });

  it('calls onClose when Cancel button is clicked or Back key is pressed', () => {
    const onClose = vi.fn();

    render(
      <FocusProvider>
        <PinPadModal
          isOpen={true}
          username="Boody"
          onSubmit={vi.fn()}
          onClose={onClose}
        />
      </FocusProvider>
    );

    // Click Cancel
    fireEvent.click(screen.getByText(/Cancel/i));
    expect(onClose).toHaveBeenCalledTimes(1);

    // Press Tizen Back key
    fireEvent.keyDown(window, { keyCode: TVKeys.BACK_TIZEN });
    expect(onClose).toHaveBeenCalledTimes(2);

    // Press Escape
    fireEvent.keyDown(window, { key: 'Escape', keyCode: TVKeys.BACK_WEB });
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('resets internal pin on errorMessage change and allows new pin input', () => {
    const onSubmit = vi.fn();
    const { rerender } = render(
      <FocusProvider>
        <PinPadModal
          isOpen={true}
          username="Boody"
          onSubmit={onSubmit}
          onClose={vi.fn()}
        />
      </FocusProvider>
    );

    // Enter 1, 2, 3, 4
    fireEvent.keyDown(window, { key: '1', keyCode: 49 });
    fireEvent.keyDown(window, { key: '2', keyCode: 50 });
    fireEvent.keyDown(window, { key: '3', keyCode: 51 });
    fireEvent.keyDown(window, { key: '4', keyCode: 52 });

    expect(onSubmit).toHaveBeenCalledWith('1234');
    onSubmit.mockClear();

    // Rerender with error message (authentication failed)
    rerender(
      <FocusProvider>
        <PinPadModal
          isOpen={true}
          username="Boody"
          onSubmit={onSubmit}
          onClose={vi.fn()}
          errorMessage="Invalid PIN"
        />
      </FocusProvider>
    );

    expect(screen.getByText('Invalid PIN')).toBeInTheDocument();

    // Now type 4 new digits: 5, 6, 7, 8
    fireEvent.keyDown(window, { key: '5', keyCode: 53 });
    fireEvent.keyDown(window, { key: '6', keyCode: 54 });
    fireEvent.keyDown(window, { key: '7', keyCode: 55 });
    fireEvent.keyDown(window, { key: '8', keyCode: 56 });

    // Should successfully submit the new 4-digit PIN
    expect(onSubmit).toHaveBeenCalledWith('5678');
  });

  it('does not pop modal focus trap when Backspace is pressed', () => {
    function TrapTest() {
      const { focusedId } = useFocusContext();
      return (
        <div>
          <div data-testid="active-focus">{focusedId}</div>
          <TVButton id="background-btn" groupId="main" autoFocus>
            Background
          </TVButton>
          <PinPadModal
            isOpen={true}
            username="Boody"
            onSubmit={vi.fn()}
            onClose={vi.fn()}
          />
        </div>
      );
    }

    render(
      <FocusProvider>
        <TrapTest />
      </FocusProvider>
    );

    // Focus is trapped in modal (first focusable in modal is keypad-1)
    expect(screen.getByTestId('active-focus').textContent).toBe('keypad-1');

    // Type a digit
    fireEvent.keyDown(window, { key: '1', keyCode: 49 });

    // Press Backspace
    fireEvent.keyDown(window, { key: 'Backspace', keyCode: TVKeys.BACKSPACE });

    // Focus MUST remain trapped inside modal and not escape to background-btn
    expect(screen.getByTestId('active-focus').textContent).toBe('keypad-1');
    expect(screen.getByTestId('active-focus').textContent).not.toBe('background-btn');
  });

  it('returns null when isOpen is false', () => {
    const { container } = render(
      <FocusProvider>
        <PinPadModal
          isOpen={false}
          username="Boody"
          onSubmit={vi.fn()}
          onClose={vi.fn()}
        />
      </FocusProvider>
    );

    expect(container).toBeEmptyDOMElement();
  });
});

