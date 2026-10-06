import { useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { FocusProvider, useFocusContext } from '../../src/navigation/FocusContext';
import { useFocusable } from '../../src/navigation/useFocusable';
import { TVKeys, registerTizenKeys } from '../../src/navigation/keys';

function TestFocusComponent({ onEnterBtn1 }: { onEnterBtn1?: () => void }) {
  const { focusedId } = useFocusContext();
  const f1 = useFocusable({ id: 'btn-1', groupId: 'row-1', autoFocus: true, onEnter: onEnterBtn1 });
  const f2 = useFocusable({ id: 'btn-2', groupId: 'row-1' });

  return (
    <div>
      <div data-testid="current-focus">{focusedId}</div>
      <button ref={f1.ref} tabIndex={-1} data-testid="b1">
        B1 {f1.isFocused ? '(focused)' : ''}
      </button>
      <button ref={f2.ref} tabIndex={-1} data-testid="b2">
        B2 {f2.isFocused ? '(focused)' : ''}
      </button>
    </div>
  );
}

function GridFocusComponent() {
  const { focusedId } = useFocusContext();
  const r1c1 = useFocusable({ id: 'r1-c1', groupId: 'grid', autoFocus: true });
  const r1c2 = useFocusable({ id: 'r1-c2', groupId: 'grid' });
  const r2c1 = useFocusable({ id: 'r2-c1', groupId: 'grid' });
  const r2c2 = useFocusable({ id: 'r2-c2', groupId: 'grid' });

  return (
    <div>
      <div data-testid="current-focus">{focusedId}</div>
      <button ref={r1c1.ref} tabIndex={-1} data-testid="r1-c1">R1C1</button>
      <button ref={r1c2.ref} tabIndex={-1} data-testid="r1-c2">R1C2</button>
      <button ref={r2c1.ref} tabIndex={-1} data-testid="r2-c1">R2C1</button>
      <button ref={r2c2.ref} tabIndex={-1} data-testid="r2-c2">R2C2</button>
    </div>
  );
}

function ModalTrapComponent() {
  const { focusedId, pushTrap, popTrap, pushFocusTrap, popFocusTrap } = useFocusContext();
  const [modalOpen, setModalOpen] = useState(false);
  const [useAlias, setUseAlias] = useState(false);

  const mainBtn1 = useFocusable({ id: 'main-1', groupId: 'main', autoFocus: true });
  const mainBtn2 = useFocusable({ id: 'main-2', groupId: 'main' });

  const modalBtn1 = useFocusable({ id: 'modal-1', groupId: 'modal' });
  const modalBtn2 = useFocusable({ id: 'modal-2', groupId: 'modal' });

  const openModal = (alias = false) => {
    setModalOpen(true);
    setUseAlias(alias);
    if (alias) {
      pushFocusTrap('modal');
    } else {
      pushTrap('modal');
    }
  };

  const closeModal = () => {
    setModalOpen(false);
    if (useAlias) {
      popFocusTrap();
    } else {
      popTrap();
    }
  };

  return (
    <div>
      <div data-testid="current-focus">{focusedId}</div>
      <button ref={mainBtn1.ref} tabIndex={-1} data-testid="main-1" onClick={() => openModal(false)}>
        Open Modal
      </button>
      <button ref={mainBtn2.ref} tabIndex={-1} data-testid="main-2" onClick={() => openModal(true)}>
        Open Modal Alias
      </button>

      {modalOpen && (
        <div data-testid="modal-container">
          <button ref={modalBtn1.ref} tabIndex={-1} data-testid="modal-1">
            Modal Confirm
          </button>
          <button ref={modalBtn2.ref} tabIndex={-1} data-testid="modal-2" onClick={closeModal}>
            Modal Cancel
          </button>
        </div>
      )}
    </div>
  );
}

function TransientItem() {
  const f = useFocusable({ id: 'transient', groupId: 'list', autoFocus: true });
  return <button ref={f.ref} data-testid="transient">Transient</button>;
}

function DynamicUnmountComponent() {
  const { focusedId } = useFocusContext();
  const [showItem, setShowItem] = useState(true);

  const f1 = useFocusable({ id: 'persisted', groupId: 'list', autoFocus: false });

  return (
    <div>
      <div data-testid="current-focus">{focusedId}</div>
      <button ref={f1.ref} data-testid="persisted">Persisted</button>
      {showItem && <TransientItem />}
      <button data-testid="toggle" onClick={() => setShowItem(false)}>Remove Transient</button>
    </div>
  );
}

function InlineCallbacksComponent({ count }: { count: number }) {
  const { focusedId } = useFocusContext();
  const f1 = useFocusable({
    id: 'btn-inline-1',
    groupId: 'row-inline',
    autoFocus: true,
    onEnter: () => {},
    onBack: () => {},
  });
  const f2 = useFocusable({
    id: 'btn-inline-2',
    groupId: 'row-inline',
    onEnter: () => {},
  });

  return (
    <div>
      <div data-testid="current-focus">{focusedId}</div>
      <button ref={f1.ref} tabIndex={-1} data-testid="btn-inline-1">
        B1 count: {count}
      </button>
      <button ref={f2.ref} tabIndex={-1} data-testid="btn-inline-2">
        B2 count: {count}
      </button>
    </div>
  );
}

function BackCallbackComponent({ onBack }: { onBack: () => void }) {
  const { focusedId } = useFocusContext();
  const f1 = useFocusable({
    id: 'btn-back',
    groupId: 'main',
    autoFocus: true,
    onBack,
  });

  return (
    <div>
      <div data-testid="current-focus">{focusedId}</div>
      <button ref={f1.ref} data-testid="btn-back">Back Button</button>
    </div>
  );
}

function EmptyTrapPopComponent() {
  const { focusedId, popTrap } = useFocusContext();
  const f1 = useFocusable({ id: 'btn-empty-1', groupId: 'row', autoFocus: false });
  const f2 = useFocusable({ id: 'btn-empty-2', groupId: 'row', autoFocus: true });

  return (
    <div>
      <div data-testid="current-focus">{focusedId}</div>
      <button ref={f1.ref} data-testid="b1">B1</button>
      <button ref={f2.ref} data-testid="b2">B2</button>
      <button data-testid="pop" onClick={() => popTrap()}>Pop</button>
    </div>
  );
}

describe('Spatial Navigation', () => {
  it('assigns initial autoFocus to first element', () => {
    render(
      <FocusProvider>
        <TestFocusComponent />
      </FocusProvider>
    );
    expect(screen.getByTestId('current-focus').textContent).toBe('btn-1');
    expect(screen.getByTestId('b1').textContent).toContain('(focused)');
  });

  it('moves focus right when ArrowRight is pressed', () => {
    render(
      <FocusProvider>
        <TestFocusComponent />
      </FocusProvider>
    );

    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowRight' });
    });

    expect(screen.getByTestId('current-focus').textContent).toBe('btn-2');
    expect(screen.getByTestId('b2').textContent).toContain('(focused)');
  });

  it('moves focus left when ArrowLeft is pressed', () => {
    render(
      <FocusProvider>
        <TestFocusComponent />
      </FocusProvider>
    );

    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowRight' });
    });
    expect(screen.getByTestId('current-focus').textContent).toBe('btn-2');

    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowLeft' });
    });
    expect(screen.getByTestId('current-focus').textContent).toBe('btn-1');
  });

  it('moves focus using TV remote numeric keyCode values', () => {
    render(
      <FocusProvider>
        <TestFocusComponent />
      </FocusProvider>
    );

    // TVKeys.RIGHT = 39
    act(() => {
      fireEvent.keyDown(window, { keyCode: TVKeys.RIGHT });
    });
    expect(screen.getByTestId('current-focus').textContent).toBe('btn-2');

    // TVKeys.LEFT = 37
    act(() => {
      fireEvent.keyDown(window, { keyCode: TVKeys.LEFT });
    });
    expect(screen.getByTestId('current-focus').textContent).toBe('btn-1');
  });

  it('triggers onEnter callback when Enter key or keyCode 13 is pressed', () => {
    const onEnter = vi.fn();
    render(
      <FocusProvider>
        <TestFocusComponent onEnterBtn1={onEnter} />
      </FocusProvider>
    );

    expect(screen.getByTestId('current-focus').textContent).toBe('btn-1');

    act(() => {
      fireEvent.keyDown(window, { key: 'Enter' });
    });
    expect(onEnter).toHaveBeenCalledTimes(1);

    act(() => {
      fireEvent.keyDown(window, { keyCode: TVKeys.ENTER });
    });
    expect(onEnter).toHaveBeenCalledTimes(2);
  });

  it('traps focus inside modal and restores previous focus on popTrap', () => {
    render(
      <FocusProvider>
        <ModalTrapComponent />
      </FocusProvider>
    );

    expect(screen.getByTestId('current-focus').textContent).toBe('main-1');

    // Open modal via button click
    act(() => {
      screen.getByTestId('main-1').click();
    });

    // Focus moves into modal
    expect(screen.getByTestId('current-focus').textContent).toBe('modal-1');

    // Navigating right within modal
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowRight' });
    });
    expect(screen.getByTestId('current-focus').textContent).toBe('modal-2');

    // Further navigation does not escape modal group
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowRight' });
    });
    expect(screen.getByTestId('current-focus').textContent).toBe('modal-2');

    // Close modal (popTrap)
    act(() => {
      screen.getByTestId('modal-2').click();
    });

    // Previous focus restored to main-1
    expect(screen.getByTestId('current-focus').textContent).toBe('main-1');
  });

  it('supports pushFocusTrap and popFocusTrap aliases', () => {
    render(
      <FocusProvider>
        <ModalTrapComponent />
      </FocusProvider>
    );

    // Focus main-2 first
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowRight' });
    });
    expect(screen.getByTestId('current-focus').textContent).toBe('main-2');

    // Open with alias
    act(() => {
      screen.getByTestId('main-2').click();
    });
    expect(screen.getByTestId('current-focus').textContent).toBe('modal-1');

    // Close with alias
    act(() => {
      screen.getByTestId('modal-2').click();
    });
    expect(screen.getByTestId('current-focus').textContent).toBe('main-2');
  });

  it('pops active focus trap on Back key (Escape and TVKeys.BACK_TIZEN)', () => {
    render(
      <FocusProvider>
        <ModalTrapComponent />
      </FocusProvider>
    );

    act(() => {
      screen.getByTestId('main-1').click();
    });
    expect(screen.getByTestId('current-focus').textContent).toBe('modal-1');

    // Press Escape
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(screen.getByTestId('current-focus').textContent).toBe('main-1');

    // Open again and press Tizen BACK key (10009)
    act(() => {
      screen.getByTestId('main-1').click();
    });
    expect(screen.getByTestId('current-focus').textContent).toBe('modal-1');

    act(() => {
      fireEvent.keyDown(window, { keyCode: TVKeys.BACK_TIZEN });
    });
    expect(screen.getByTestId('current-focus').textContent).toBe('main-1');
  });

  it('unregisters node on unmount and clears focusedId if active node is removed', () => {
    render(
      <FocusProvider>
        <DynamicUnmountComponent />
      </FocusProvider>
    );

    expect(screen.getByTestId('current-focus').textContent).toBe('transient');

    act(() => {
      screen.getByTestId('toggle').click();
    });

    // Focused id was unset because the focused node unmounted
    expect(screen.getByTestId('current-focus').textContent).toBe('');
  });

  it('performs 2D spatial distance navigation with getBoundingClientRect', () => {
    render(
      <FocusProvider>
        <GridFocusComponent />
      </FocusProvider>
    );

    const r1c1 = screen.getByTestId('r1-c1');
    const r1c2 = screen.getByTestId('r1-c2');
    const r2c1 = screen.getByTestId('r2-c1');
    const r2c2 = screen.getByTestId('r2-c2');

    // Mock bounding client rects for a 2x2 grid
    // Row 1: y=0, Row 2: y=100
    // Col 1: x=0, Col 2: x=200
    vi.spyOn(r1c1, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, width: 100, height: 50, right: 100, bottom: 50, toJSON: () => {},
    });
    vi.spyOn(r1c2, 'getBoundingClientRect').mockReturnValue({
      x: 200, y: 0, left: 200, top: 0, width: 100, height: 50, right: 300, bottom: 50, toJSON: () => {},
    });
    vi.spyOn(r2c1, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 100, left: 0, top: 100, width: 100, height: 50, right: 100, bottom: 150, toJSON: () => {},
    });
    vi.spyOn(r2c2, 'getBoundingClientRect').mockReturnValue({
      x: 200, y: 100, left: 200, top: 100, width: 100, height: 50, right: 300, bottom: 150, toJSON: () => {},
    });

    expect(screen.getByTestId('current-focus').textContent).toBe('r1-c1');

    // Move Down from r1-c1 -> r2-c1
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowDown' });
    });
    expect(screen.getByTestId('current-focus').textContent).toBe('r2-c1');

    // Move Right from r2-c1 -> r2-c2
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowRight' });
    });
    expect(screen.getByTestId('current-focus').textContent).toBe('r2-c2');

    // Move Up from r2-c2 -> r1-c2
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowUp' });
    });
    expect(screen.getByTestId('current-focus').textContent).toBe('r1-c2');

    // Move Left from r1-c2 -> r1-c1
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowLeft' });
    });
    expect(screen.getByTestId('current-focus').textContent).toBe('r1-c1');
  });

  it('throws error when useFocusContext is used outside FocusProvider', () => {
    function InvalidComponent() {
      useFocusContext();
      return null;
    }

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<InvalidComponent />)).toThrow(
      'useFocusContext must be used within a FocusProvider'
    );
    consoleSpy.mockRestore();
  });

  it('preserves focus across component re-renders when inline callbacks are passed', () => {
    const { rerender } = render(
      <FocusProvider>
        <InlineCallbacksComponent count={0} />
      </FocusProvider>
    );

    // Initial focus on btn-inline-1
    expect(screen.getByTestId('current-focus').textContent).toBe('btn-inline-1');

    // Move focus right to btn-inline-2
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowRight' });
    });
    expect(screen.getByTestId('current-focus').textContent).toBe('btn-inline-2');

    // Re-render component with new props (new inline callback closures)
    rerender(
      <FocusProvider>
        <InlineCallbacksComponent count={1} />
      </FocusProvider>
    );

    // Focus must still be preserved on btn-inline-2!
    expect(screen.getByTestId('current-focus').textContent).toBe('btn-inline-2');
  });

  it('invokes onBack callback on focused element when Escape or TV Back key is pressed', () => {
    const onBack = vi.fn();
    render(
      <FocusProvider>
        <BackCallbackComponent onBack={onBack} />
      </FocusProvider>
    );

    expect(screen.getByTestId('current-focus').textContent).toBe('btn-back');

    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(onBack).toHaveBeenCalledTimes(1);

    act(() => {
      fireEvent.keyDown(window, { keyCode: TVKeys.BACK_TIZEN });
    });
    expect(onBack).toHaveBeenCalledTimes(2);
  });

  it('does not corrupt or reset focus when popTrap is called with an empty trap stack', () => {
    render(
      <FocusProvider>
        <EmptyTrapPopComponent />
      </FocusProvider>
    );

    expect(screen.getByTestId('current-focus').textContent).toBe('btn-empty-2');

    act(() => {
      screen.getByTestId('pop').click();
    });

    // Focus must remain on btn-empty-2, not get reset to btn-empty-1
    expect(screen.getByTestId('current-focus').textContent).toBe('btn-empty-2');
  });
});

describe('Tizen Remote Key Registration', () => {
  beforeEach(() => {
    delete (window as any).tizen;
  });

  afterEach(() => {
    delete (window as any).tizen;
  });

  it('safely handles environments without window.tizen', () => {
    expect(() => registerTizenKeys()).not.toThrow();
  });

  it('registers media and numeric keys with tizen.tvinputdevice', () => {
    const registerKeyMock = vi.fn();
    (window as any).tizen = {
      tvinputdevice: {
        registerKey: registerKeyMock,
      },
    };

    registerTizenKeys();

    expect(registerKeyMock).toHaveBeenCalledWith('MediaPlay');
    expect(registerKeyMock).toHaveBeenCalledWith('MediaPause');
    expect(registerKeyMock).toHaveBeenCalledWith('MediaPlayPause');
    expect(registerKeyMock).toHaveBeenCalledWith('MediaStop');
    expect(registerKeyMock).toHaveBeenCalledWith('MediaFastForward');
    expect(registerKeyMock).toHaveBeenCalledWith('MediaRewind');
    for (let i = 0; i <= 9; i++) {
      expect(registerKeyMock).toHaveBeenCalledWith(String(i));
    }
  });

  it('ignores errors thrown by tizen.tvinputdevice.registerKey', () => {
    (window as any).tizen = {
      tvinputdevice: {
        registerKey: vi.fn().mockImplementation(() => {
          throw new Error('Key already registered');
        }),
      },
    };

    expect(() => registerTizenKeys()).not.toThrow();
  });
});
