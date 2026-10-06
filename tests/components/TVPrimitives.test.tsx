import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FocusProvider, useFocusContext } from '../../src/navigation/FocusContext';
import { TVButton } from '../../src/components/tv/TVButton';
import { TVCard } from '../../src/components/tv/TVCard';
import { TVModal } from '../../src/components/tv/TVModal';
import { KeypadGrid } from '../../src/components/pin/KeypadGrid';
import { TVKeys } from '../../src/navigation/keys';

describe('TVButton', () => {
  it('renders with default primary variant and focus ring when focused', () => {
    function TestButtons() {
      return (
        <div>
          <TVButton id="btn-1" groupId="row" autoFocus>
            Click Me
          </TVButton>
          <TVButton id="btn-2" groupId="row" variant="secondary">
            Secondary
          </TVButton>
          <TVButton id="btn-3" groupId="row" variant="danger">
            Danger
          </TVButton>
        </div>
      );
    }

    render(
      <FocusProvider>
        <TestButtons />
      </FocusProvider>
    );

    const btn1 = screen.getByText('Click Me');
    expect(btn1).toHaveClass('tv-focus-ring');
    expect(btn1).toHaveClass('bg-sky-500');

    const btn2 = screen.getByText('Secondary');
    expect(btn2).not.toHaveClass('tv-focus-ring');
    expect(btn2).toHaveClass('bg-zinc-900');

    const btn3 = screen.getByText('Danger');
    expect(btn3).not.toHaveClass('tv-focus-ring');
    expect(btn3).toHaveClass('text-rose-400');
  });

  it('triggers onEnter when Enter key is pressed', () => {
    const onEnter = vi.fn();
    render(
      <FocusProvider>
        <TVButton id="btn-enter" groupId="row" autoFocus onEnter={onEnter}>
          Action
        </TVButton>
      </FocusProvider>
    );

    fireEvent.keyDown(window, { key: 'Enter', keyCode: TVKeys.ENTER });
    expect(onEnter).toHaveBeenCalledTimes(1);
  });

  it('does not invoke onEnter or onClick when disabled', () => {
    const onEnter = vi.fn();
    const onClick = vi.fn();

    render(
      <FocusProvider>
        <TVButton
          id="btn-disabled"
          groupId="row"
          disabled
          onEnter={onEnter}
          onClick={onClick}
          autoFocus
        >
          Disabled Button
        </TVButton>
      </FocusProvider>
    );

    fireEvent.keyDown(window, { key: 'Enter', keyCode: TVKeys.ENTER });
    expect(onEnter).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Disabled Button'));
    expect(onEnter).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('TVCard', () => {
  it('renders initial letter when imageUrl is omitted', () => {
    render(
      <FocusProvider>
        <TVCard
          id="card-1"
          groupId="cards"
          title="Inception"
          subtitle="Sci-Fi / 2010"
          badge="4K"
          progressPercent={65}
          autoFocus
        />
      </FocusProvider>
    );

    expect(screen.getByText('Inception')).toBeInTheDocument();
    expect(screen.getByText('Sci-Fi / 2010')).toBeInTheDocument();
    expect(screen.getByText('4K')).toBeInTheDocument();
    // First letter of "Inception" is "I"
    expect(screen.getByText('I')).toBeInTheDocument();
  });

  it('renders image when imageUrl is provided', () => {
    render(
      <FocusProvider>
        <TVCard
          id="card-img"
          groupId="cards"
          title="Avatar"
          imageUrl="https://example.com/poster.jpg"
        />
      </FocusProvider>
    );

    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', 'https://example.com/poster.jpg');
    expect(img).toHaveAttribute('alt', 'Avatar');
  });

  it('triggers onSelect when clicked or Enter is pressed', () => {
    const onSelect = vi.fn();
    render(
      <FocusProvider>
        <TVCard
          id="card-select"
          groupId="cards"
          title="The Matrix"
          onSelect={onSelect}
          autoFocus
        />
      </FocusProvider>
    );

    fireEvent.keyDown(window, { key: 'Enter', keyCode: TVKeys.ENTER });
    expect(onSelect).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button'));
    expect(onSelect).toHaveBeenCalledTimes(2);
  });
});

describe('TVModal', () => {
  it('traps focus inside modal and triggers onClose on Escape', () => {
    const onClose = vi.fn();

    function ModalTest() {
      const { focusedId } = useFocusContext();
      return (
        <div>
          <div data-testid="active-focus">{focusedId}</div>
          <TVButton id="main-btn" groupId="main" autoFocus>
            Background
          </TVButton>
          <TVModal isOpen={true} onClose={onClose} trapGroupId="test-modal">
            <TVButton id="modal-btn-1" groupId="test-modal" autoFocus>
              Modal Button 1
            </TVButton>
            <TVButton id="modal-btn-2" groupId="test-modal">
              Modal Button 2
            </TVButton>
          </TVModal>
        </div>
      );
    }

    render(
      <FocusProvider>
        <ModalTest />
      </FocusProvider>
    );

    expect(screen.getByTestId('active-focus').textContent).toBe('modal-btn-1');

    fireEvent.keyDown(window, { key: 'Escape', keyCode: TVKeys.BACK_WEB });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('KeypadGrid', () => {
  it('renders all 12 keypad buttons and fires callbacks', () => {
    const onDigit = vi.fn();
    const onBackspace = vi.fn();
    const onClear = vi.fn();

    render(
      <FocusProvider>
        <KeypadGrid
          groupId="keypad"
          onDigit={onDigit}
          onBackspace={onBackspace}
          onClear={onClear}
        />
      </FocusProvider>
    );

    // Click 1, 5, 0
    fireEvent.click(screen.getByTestId('keypad-1'));
    expect(onDigit).toHaveBeenCalledWith('1');

    fireEvent.click(screen.getByTestId('keypad-5'));
    expect(onDigit).toHaveBeenCalledWith('5');

    fireEvent.click(screen.getByTestId('keypad-0'));
    expect(onDigit).toHaveBeenCalledWith('0');

    // Click Clear
    fireEvent.click(screen.getByTestId('keypad-clear'));
    expect(onClear).toHaveBeenCalledTimes(1);

    // Click Backspace
    fireEvent.click(screen.getByTestId('keypad-backspace'));
    expect(onBackspace).toHaveBeenCalledTimes(1);
  });

  it('suppresses callbacks when disabled', () => {
    const onDigit = vi.fn();
    const onBackspace = vi.fn();
    const onClear = vi.fn();

    render(
      <FocusProvider>
        <KeypadGrid
          groupId="keypad"
          onDigit={onDigit}
          onBackspace={onBackspace}
          onClear={onClear}
          disabled={true}
        />
      </FocusProvider>
    );

    fireEvent.click(screen.getByTestId('keypad-3'));
    fireEvent.click(screen.getByTestId('keypad-clear'));
    fireEvent.click(screen.getByTestId('keypad-backspace'));

    expect(onDigit).not.toHaveBeenCalled();
    expect(onClear).not.toHaveBeenCalled();
    expect(onBackspace).not.toHaveBeenCalled();
  });
});
