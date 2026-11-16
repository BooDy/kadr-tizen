import React, { useState } from 'react';
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

  it('prevents ArrowDown from jumping across boundary into sidebar items', () => {
    function SidebarAndContentComponent() {
      const { focusedId } = useFocusContext();
      const sbTop = useFocusable({ id: 'nav-home', groupId: 'sidebar' });
      const sbBottom = useFocusable({ id: 'nav-switch-profile', groupId: 'sidebar' });
      const card1 = useFocusable({ id: 'card-1', groupId: 'content', autoFocus: true });
      const card2 = useFocusable({ id: 'card-2', groupId: 'content' });

      return (
        <div>
          <div data-testid="current-focus">{focusedId}</div>
          <button ref={sbTop.ref} tabIndex={-1} data-testid="nav-home">Home</button>
          <button ref={sbBottom.ref} tabIndex={-1} data-testid="nav-switch-profile">Profiles</button>
          <button ref={card1.ref} tabIndex={-1} data-testid="card-1">Card 1</button>
          <button ref={card2.ref} tabIndex={-1} data-testid="card-2">Card 2</button>
        </div>
      );
    }

    render(
      <FocusProvider>
        <SidebarAndContentComponent />
      </FocusProvider>
    );

    const sbTop = screen.getByTestId('nav-home');
    const sbBottom = screen.getByTestId('nav-switch-profile');
    const card1 = screen.getByTestId('card-1');
    const card2 = screen.getByTestId('card-2');

    // Sidebar: left: 0..100, Home: top: 0, Profiles: top: 900
    vi.spyOn(sbTop, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, width: 100, height: 50, right: 100, bottom: 50, toJSON: () => {},
    });
    vi.spyOn(sbBottom, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 900, left: 0, top: 900, width: 100, height: 50, right: 100, bottom: 950, toJSON: () => {},
    });
    // Content: left: 150..350, Card 1: top: 100, Card 2: top: 500
    vi.spyOn(card1, 'getBoundingClientRect').mockReturnValue({
      x: 150, y: 100, left: 150, top: 100, width: 200, height: 300, right: 350, bottom: 400, toJSON: () => {},
    });
    vi.spyOn(card2, 'getBoundingClientRect').mockReturnValue({
      x: 150, y: 500, left: 150, top: 500, width: 200, height: 300, right: 350, bottom: 800, toJSON: () => {},
    });

    expect(screen.getByTestId('current-focus').textContent).toBe('card-1');

    // ArrowDown from card-1 should navigate to card-2, NOT jump to sbBottom (Profiles)
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowDown' });
    });
    expect(screen.getByTestId('current-focus').textContent).toBe('card-2');

    // ArrowDown from card-2 (last content card) should stay on card-2, NOT jump to sbBottom
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowDown' });
    });
    expect(screen.getByTestId('current-focus').textContent).toBe('card-2');
  });

  it('moves Up/Down between a right-aligned header button and a left-aligned card that are not horizontally aligned', () => {
    function HeaderAndGridComponent() {
      const { focusedId } = useFocusContext();
      const header = useFocusable({ id: 'library-browse-folders-btn', groupId: 'browse-library-header' });
      const card = useFocusable({ id: 'grid-card-1', groupId: 'content', autoFocus: true });

      return (
        <div>
          <div data-testid="current-focus">{focusedId}</div>
          <button ref={header.ref} tabIndex={-1} data-testid="header-btn">Browse Folders</button>
          <button ref={card.ref} tabIndex={-1} data-testid="grid-card">Card</button>
        </div>
      );
    }

    render(
      <FocusProvider>
        <HeaderAndGridComponent />
      </FocusProvider>
    );

    // Header button far right (x ~1500), grid card far left (x ~200)
    vi.spyOn(screen.getByTestId('header-btn'), 'getBoundingClientRect').mockReturnValue({
      x: 1400, y: 40, left: 1400, top: 40, width: 280, height: 60, right: 1680, bottom: 100, toJSON: () => {},
    });
    vi.spyOn(screen.getByTestId('grid-card'), 'getBoundingClientRect').mockReturnValue({
      x: 150, y: 300, left: 150, top: 300, width: 200, height: 300, right: 350, bottom: 600, toJSON: () => {},
    });

    expect(screen.getByTestId('current-focus').textContent).toBe('grid-card-1');

    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowUp' });
    });
    expect(screen.getByTestId('current-focus').textContent).toBe('library-browse-folders-btn');

    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowDown' });
    });
    expect(screen.getByTestId('current-focus').textContent).toBe('grid-card-1');
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

  it('navigates deterministically across 1920x1080 6-column multi-row grids, partial rows, tall cards, and header buttons without random/diagonal jumps', () => {
    function makeRect(x: number, y: number, width: number, height: number): DOMRect {
      return {
        x,
        y,
        left: x,
        top: y,
        width,
        height,
        right: x + width,
        bottom: y + height,
        toJSON: () => {},
      };
    }

    function Realistic1080pBrowser() {
      const { focusedId } = useFocusContext();
      const closeBtn = useFocusable({ id: 'hdr-close', groupId: 'folder-browser-modal' });
      const crumbBtn = useFocusable({ id: 'hdr-crumb-0', groupId: 'folder-browser-modal' });
      const addBtn = useFocusable({ id: 'hdr-add-playlist', groupId: 'folder-browser-modal' });

      // 8 directory tiles (6 on row 0, 2 on partial row 1) + 6 tall media cards = 17 nodes (> V8 6.9 QuickSort 10-item threshold)
      // Intentionally omit `order` to verify geometric navigation never falls back to unstable sort
      const dirs = Array.from({ length: 8 }, (_, idx) =>
        // eslint-disable-next-line react-hooks/rules-of-hooks
        useFocusable({
          id: `dir-${idx}`,
          groupId: 'folder-browser-modal',
          autoFocus: idx === 0,
        })
      );
      const cards = Array.from({ length: 6 }, (_, idx) =>
        // eslint-disable-next-line react-hooks/rules-of-hooks
        useFocusable({
          id: `card-${idx}`,
          groupId: 'folder-browser-modal',
        })
      );

      return (
        <div>
          <div data-testid="current-focus">{focusedId}</div>
          <button ref={closeBtn.ref} id="hdr-close">Close</button>
          <button ref={crumbBtn.ref} id="hdr-crumb-0">Movies</button>
          <button ref={addBtn.ref} id="hdr-add-playlist">Add Folder</button>
          {dirs.map((d, idx) => (
            <button key={`dir-${idx}`} ref={d.ref} id={`dir-${idx}`}>Dir {idx}</button>
          ))}
          {cards.map((c, idx) => (
            <div key={`card-${idx}`} ref={c.ref} id={`card-${idx}`} role="button" tabIndex={-1}>
              Card {idx}
            </div>
          ))}
        </div>
      );
    }

    render(
      <FocusProvider>
        <Realistic1080pBrowser />
      </FocusProvider>
    );

    vi.spyOn(document.getElementById('hdr-close')!, 'getBoundingClientRect').mockReturnValue(
      makeRect(56, 60, 130, 56)
    );
    vi.spyOn(document.getElementById('hdr-crumb-0')!, 'getBoundingClientRect').mockReturnValue(
      makeRect(210, 66, 160, 44)
    );
    vi.spyOn(document.getElementById('hdr-add-playlist')!, 'getBoundingClientRect').mockReturnValue(
      makeRect(1580, 60, 280, 56)
    );

    // 6 columns across 1920px: x = 56 + col * (284 + 24)
    for (let i = 0; i < 8; i++) {
      const col = i % 6;
      const row = Math.floor(i / 6);
      vi.spyOn(document.getElementById(`dir-${i}`)!, 'getBoundingClientRect').mockReturnValue(
        makeRect(56 + col * 308, 220 + row * 136, 284, 112)
      );
    }
    // Tall TVCard media items below: height = 384px
    for (let i = 0; i < 6; i++) {
      vi.spyOn(document.getElementById(`card-${i}`)!, 'getBoundingClientRect').mockReturnValue(
        makeRect(56 + i * 308, 520, 224, 384)
      );
    }

    expect(screen.getByTestId('current-focus').textContent).toBe('dir-0');

    // ArrowLeft at leftmost edge stays put (never wraps or scrambles)
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowLeft', keyCode: TVKeys.LEFT });
    });
    expect(screen.getByTestId('current-focus').textContent).toBe('dir-0');

    // Traverse across all 6 columns in row 0
    for (let col = 1; col < 6; col++) {
      act(() => {
        fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
      });
      expect(screen.getByTestId('current-focus').textContent).toBe(`dir-${col}`);
    }

    // ArrowRight at rightmost column stays on dir-5 (does not jump diagonally to dir-6 or cards)
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
    });
    expect(screen.getByTestId('current-focus').textContent).toBe('dir-5');

    // ArrowUp from rightmost dir-5 reaches right-aligned header button hdr-add-playlist
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowUp', keyCode: TVKeys.UP });
    });
    expect(screen.getByTestId('current-focus').textContent).toBe('hdr-add-playlist');

    // Horizontal navigation across header row
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowLeft', keyCode: TVKeys.LEFT });
    });
    expect(screen.getByTestId('current-focus').textContent).toBe('hdr-crumb-0');
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowLeft', keyCode: TVKeys.LEFT });
    });
    expect(screen.getByTestId('current-focus').textContent).toBe('hdr-close');

    // ArrowDown from hdr-close lands on dir-0 -> dir-6 (partial row) -> card-0
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowDown', keyCode: TVKeys.DOWN });
    });
    expect(screen.getByTestId('current-focus').textContent).toBe('dir-0');
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowDown', keyCode: TVKeys.DOWN });
    });
    expect(screen.getByTestId('current-focus').textContent).toBe('dir-6');

    // Move right to dir-7 (last item in partial row 1), then press ArrowRight again:
    // MUST stay on dir-7 and NOT jump diagonally to row 0 (dir-2) or tall cards below (card-2)
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
    });
    expect(screen.getByTestId('current-focus').textContent).toBe('dir-7');
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
    });
    expect(screen.getByTestId('current-focus').textContent).toBe('dir-7');

    // ArrowDown from dir-7 (col 1) lands on card-1 (col 1)
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowDown', keyCode: TVKeys.DOWN });
    });
    expect(screen.getByTestId('current-focus').textContent).toBe('card-1');
  });

  it('selects full-width <input>/<textarea> controls from narrow buttons in 1920x1080 modal layouts and handles Tizen TV IME keys', () => {
    function makeRect(x: number, y: number, width: number, height: number): DOMRect {
      return {
        x,
        y,
        left: x,
        top: y,
        width,
        height,
        right: x + width,
        bottom: y + height,
        toJSON: () => {},
      };
    }

    function RealisticModalForm() {
      const { focusedId, activeTrap, pushTrap } = useFocusContext();
      const closeBtn = useFocusable<HTMLButtonElement>({ id: 'form-close', groupId: 'form-trap' });
      const nameInput = useFocusable<HTMLInputElement>({
        id: 'form-name',
        groupId: 'form-trap',
        autoFocus: true,
      });
      const descInput = useFocusable<HTMLTextAreaElement>({
        id: 'form-desc',
        groupId: 'form-trap',
      });
      const toggleBtn = useFocusable<HTMLButtonElement>({
        id: 'form-toggle',
        groupId: 'form-trap',
      });
      const submitBtn = useFocusable<HTMLButtonElement>({
        id: 'form-submit',
        groupId: 'form-trap',
      });

      return (
        <div>
          <div data-testid="current-focus">{focusedId}</div>
          <div data-testid="active-trap">{activeTrap ?? ''}</div>
          <button data-testid="push-trap" onClick={() => pushTrap('form-trap')}>Trap</button>
          <button ref={closeBtn.ref} id="form-close">X</button>
          <input ref={nameInput.ref} id="form-name" data-testid="form-name" />
          <textarea ref={descInput.ref} id="form-desc" data-testid="form-desc" />
          <button ref={toggleBtn.ref} id="form-toggle">Private</button>
          <button ref={submitBtn.ref} id="form-submit">Create</button>
        </div>
      );
    }

    render(
      <FocusProvider>
        <RealisticModalForm />
      </FocusProvider>
    );

    const closeEl = document.getElementById('form-close')!;
    const nameEl = screen.getByTestId('form-name') as HTMLInputElement;
    const descEl = screen.getByTestId('form-desc') as HTMLTextAreaElement;
    const toggleEl = document.getElementById('form-toggle')!;
    const submitEl = document.getElementById('form-submit')!;

    // Realistic 1920x1080 modal rects: narrow right Close (cx=1258), wide inputs (x=636..1284, cx=960),
    // narrow left Private toggle (x=636..816, cx=726), narrow right Create button (x=1106..1284, cx=1195)
    vi.spyOn(closeEl, 'getBoundingClientRect').mockReturnValue(makeRect(1236, 210, 44, 44));
    vi.spyOn(nameEl, 'getBoundingClientRect').mockReturnValue(makeRect(636, 320, 648, 56));
    vi.spyOn(descEl, 'getBoundingClientRect').mockReturnValue(makeRect(636, 420, 648, 96));
    vi.spyOn(toggleEl, 'getBoundingClientRect').mockReturnValue(makeRect(636, 556, 180, 48));
    vi.spyOn(submitEl, 'getBoundingClientRect').mockReturnValue(makeRect(1106, 650, 178, 52));

    act(() => {
      screen.getByTestId('push-trap').click();
    });

    // Move up to narrow top-right Close button, then press ArrowDown -> MUST hit wide Name input (not skip to Create!)
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowUp', keyCode: TVKeys.UP });
    });
    expect(screen.getByTestId('current-focus').textContent).toBe('form-close');

    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowDown', keyCode: TVKeys.DOWN });
    });
    expect(screen.getByTestId('current-focus').textContent).toBe('form-name');
    // Passive D-pad navigation onto an <input> must NOT auto-focus DOM activeElement
    expect(document.activeElement).not.toBe(nameEl);

    // Pressing Enter (OK) activates native .focus() on the <input> to open Samsung Tizen IME
    act(() => {
      fireEvent.keyDown(window, { key: 'Enter', keyCode: TVKeys.ENTER });
    });
    expect(document.activeElement).toBe(nameEl);

    // While typing in <input>, ArrowLeft / ArrowRight move text cursor and do NOT move D-pad focus
    act(() => {
      fireEvent.keyDown(nameEl, { key: 'ArrowLeft', keyCode: TVKeys.LEFT });
      fireEvent.keyDown(nameEl, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
    });
    expect(screen.getByTestId('current-focus').textContent).toBe('form-name');
    expect(document.activeElement).toBe(nameEl);

    // Tizen IME_DONE (65376) blurs the input without popping the modal trap
    act(() => {
      fireEvent.keyDown(nameEl, { keyCode: TVKeys.IME_DONE });
    });
    expect(document.activeElement).not.toBe(nameEl);
    expect(screen.getByTestId('active-trap').textContent).toBe('form-trap');
    expect(screen.getByTestId('current-focus').textContent).toBe('form-name');

    // Re-focus input with Enter, then dismiss with Tizen Return (10009): blurs input, keeps trap open
    act(() => {
      fireEvent.keyDown(window, { key: 'Enter', keyCode: TVKeys.ENTER });
    });
    expect(document.activeElement).toBe(nameEl);
    act(() => {
      fireEvent.keyDown(nameEl, { keyCode: TVKeys.BACK_TIZEN });
    });
    expect(document.activeElement).not.toBe(nameEl);
    expect(screen.getByTestId('active-trap').textContent).toBe('form-trap');

    // Re-focus input with Enter, then press ArrowDown: blurs input AND moves D-pad focus to Description
    act(() => {
      fireEvent.keyDown(window, { key: 'Enter', keyCode: TVKeys.ENTER });
    });
    expect(document.activeElement).toBe(nameEl);
    act(() => {
      fireEvent.keyDown(nameEl, { key: 'ArrowDown', keyCode: TVKeys.DOWN });
    });
    expect(document.activeElement).not.toBe(nameEl);
    expect(screen.getByTestId('current-focus').textContent).toBe('form-desc');

    // ArrowDown -> narrow-left Private toggle -> ArrowUp MUST hit wide Description -> ArrowUp MUST hit wide Name
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowDown', keyCode: TVKeys.DOWN });
    });
    expect(screen.getByTestId('current-focus').textContent).toBe('form-toggle');

    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowUp', keyCode: TVKeys.UP });
    });
    expect(screen.getByTestId('current-focus').textContent).toBe('form-desc');

    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowUp', keyCode: TVKeys.UP });
    });
    expect(screen.getByTestId('current-focus').textContent).toBe('form-name');
  });

  it('preserves stacked modal traps and ignores phantom unmounted useFocusable hooks', () => {
    function StackedTrapAndPhantomHookTest() {
      const { focusedId, activeTrap, pushTrap, popTrap } = useFocusContext();
      const [parentOpen, setParentOpen] = useState(false);
      const [childOpen, setChildOpen] = useState(false);

      const mainBtn = useFocusable({ id: 'bg-btn', groupId: 'main', autoFocus: true });
      // Conditional hook whose ref is only mounted when parentOpen is true
      const parentBtn = useFocusable({ id: 'parent-btn', groupId: 'parent-trap', order: 1 });
      const childBtn = useFocusable({ id: 'child-btn', groupId: 'child-trap', order: 1 });

      return (
        <div>
          <div data-testid="current-focus">{focusedId ?? ''}</div>
          <div data-testid="active-trap">{activeTrap ?? ''}</div>
          <button ref={mainBtn.ref} id="bg-btn">Background</button>
          {parentOpen && <button ref={parentBtn.ref} id="parent-btn">Parent Modal</button>}
          {childOpen && <button ref={childBtn.ref} id="child-btn">Child Modal</button>}
          <button
            data-testid="open-parent"
            onClick={() => {
              setParentOpen(true);
              setTimeout(() => pushTrap('parent-trap'), 0);
            }}
          >
            Open Parent
          </button>
          <button
            data-testid="open-child"
            onClick={() => {
              setChildOpen(true);
              setTimeout(() => pushTrap('child-trap'), 0);
            }}
          >
            Open Child
          </button>
          <button data-testid="pop-stale" onClick={() => popTrap('non-existent-trap')}>
            Pop Stale
          </button>
          <button
            data-testid="close-child"
            onClick={() => {
              setChildOpen(false);
              popTrap('child-trap');
            }}
          >
            Close Child
          </button>
          <button
            data-testid="close-parent"
            onClick={() => {
              setParentOpen(false);
              popTrap('parent-trap');
            }}
          >
            Close Parent
          </button>
        </div>
      );
    }

    vi.useFakeTimers();
    render(
      <FocusProvider>
        <StackedTrapAndPhantomHookTest />
      </FocusProvider>
    );

    expect(screen.getByTestId('current-focus').textContent).toBe('bg-btn');

    // Open parent modal
    act(() => {
      screen.getByTestId('open-parent').click();
      vi.runAllTimers();
    });
    expect(screen.getByTestId('active-trap').textContent).toBe('parent-trap');
    expect(screen.getByTestId('current-focus').textContent).toBe('parent-btn');

    // Open stacked child modal on top of parent modal
    act(() => {
      screen.getByTestId('open-child').click();
      vi.runAllTimers();
    });
    expect(screen.getByTestId('active-trap').textContent).toBe('child-trap');
    expect(screen.getByTestId('current-focus').textContent).toBe('child-btn');

    // Stale/mismatched popTrap('non-existent-trap') must NOT pop child-trap
    act(() => {
      screen.getByTestId('pop-stale').click();
    });
    expect(screen.getByTestId('active-trap').textContent).toBe('child-trap');
    expect(screen.getByTestId('current-focus').textContent).toBe('child-btn');

    // Closing child modal restores parent-trap and parent-btn focus
    act(() => {
      screen.getByTestId('close-child').click();
    });
    expect(screen.getByTestId('active-trap').textContent).toBe('parent-trap');
    expect(screen.getByTestId('current-focus').textContent).toBe('parent-btn');

    // Closing parent modal restores main background focus
    act(() => {
      screen.getByTestId('close-parent').click();
    });
    expect(screen.getByTestId('active-trap').textContent).toBe('');
    expect(screen.getByTestId('current-focus').textContent).toBe('bg-btn');

    vi.useRealTimers();
  });

  it('restores activeTrap and exact focusedId on stacked folder-browser-modal -> item-detail-modal close and blocks background focus steals', () => {
    const onOpenRandomBgVideo = vi.fn();
    const onOpenFolderVideo5 = vi.fn();

    function StackedFolderAndDetailHarness() {
      const { focusedId, activeTrap, setFocusedId, pushTrap, popTrap } = useFocusContext();
      const [folderOpen, setFolderOpen] = useState(false);
      const [detailOpen, setDetailOpen] = useState(false);

      const bgCard = useFocusable({
        id: 'browse-random-card',
        groupId: 'browse-row-0',
        autoFocus: true,
        onEnter: onOpenRandomBgVideo,
      });

      const folderItem0 = useFocusable({
        id: 'folder-item-0',
        groupId: 'folder-browser-modal',
        order: 1,
      });
      const folderItem5 = useFocusable({
        id: 'folder-item-5',
        groupId: 'folder-browser-modal',
        order: 2,
        onEnter: () => {
          onOpenFolderVideo5();
          setDetailOpen(true);
        },
      });

      const detailPlayBtn = useFocusable({
        id: 'detail-play-btn',
        groupId: 'item-detail-modal',
        order: 1,
      });

      return (
        <div>
          <div data-testid="current-focus">{focusedId ?? ''}</div>
          <div data-testid="active-trap">{activeTrap ?? ''}</div>
          <button ref={bgCard.ref} id="browse-random-card" data-testid="browse-random-card">
            Random Browse Video
          </button>
          <button
            data-testid="open-folder"
            onClick={() => {
              setFolderOpen(true);
              pushTrap('folder-browser-modal');
            }}
          >
            Open Folder
          </button>
          <button
            data-testid="steal-bg-focus"
            onClick={() => {
              // Simulate BrowseScreen background refresh trying to steal focus
              setFocusedId('browse-random-card');
            }}
          >
            Steal Focus
          </button>
          {folderOpen && (
            <div data-testid="folder-modal">
              <button ref={folderItem0.ref} id="folder-item-0" data-testid="folder-item-0">
                Folder Item 0 {folderItem0.isFocused ? '[SELECTED]' : ''}
              </button>
              <button ref={folderItem5.ref} id="folder-item-5" data-testid="folder-item-5">
                Folder Item 5 {folderItem5.isFocused ? '[SELECTED]' : ''}
              </button>
            </div>
          )}
          {detailOpen && (
            <div data-testid="detail-modal">
              <button ref={detailPlayBtn.ref} id="detail-play-btn" data-testid="detail-play-btn">
                Play
              </button>
            </div>
          )}
          <DetailTrapLifecycle
            isOpen={detailOpen}
            pushTrap={pushTrap}
            popTrap={popTrap}
          />
          <button data-testid="close-detail" onClick={() => setDetailOpen(false)}>
            Close Detail
          </button>
        </div>
      );
    }

    function DetailTrapLifecycle({
      isOpen,
      pushTrap,
      popTrap,
    }: {
      isOpen: boolean;
      pushTrap: (id: string) => void;
      popTrap: (id?: string) => void;
    }) {
      // Mirrors always-mounted <ItemDetailModal isOpen={Boolean(activeItem)} />
      useState(0);
      if (isOpen) {
        // effect registered below
      }
      return <DetailTrapEffect isOpen={isOpen} pushTrap={pushTrap} popTrap={popTrap} />;
    }

    function DetailTrapEffect({
      isOpen,
      pushTrap,
      popTrap,
    }: {
      isOpen: boolean;
      pushTrap: (id: string) => void;
      popTrap: (id?: string) => void;
    }) {
      const [, setTick] = useState(0);
      void setTick;
      React.useEffect(() => {
        if (isOpen) {
          pushTrap('item-detail-modal');
          return () => {
            popTrap('item-detail-modal');
          };
        }
      }, [isOpen, pushTrap, popTrap]);
      return null;
    }

    render(
      <FocusProvider>
        <StackedFolderAndDetailHarness />
      </FocusProvider>
    );

    expect(screen.getByTestId('current-focus').textContent).toBe('browse-random-card');

    // Open folder browser modal
    act(() => {
      screen.getByTestId('open-folder').click();
    });
    expect(screen.getByTestId('active-trap').textContent).toBe('folder-browser-modal');

    // Focus folder-item-0 then move right to folder-item-5
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
    });
    // Ensure we are on folder-item-5
    if (screen.getByTestId('current-focus').textContent !== 'folder-item-5') {
      act(() => {
        fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
      });
    }
    expect(screen.getByTestId('current-focus').textContent).toBe('folder-item-5');
    expect(screen.getByTestId('folder-item-5').textContent).toContain('[SELECTED]');

    // Press Enter on folder-item-5 -> opens ItemDetailModal
    act(() => {
      fireEvent.keyDown(window, { key: 'Enter', keyCode: TVKeys.ENTER });
    });
    expect(onOpenFolderVideo5).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('active-trap').textContent).toBe('item-detail-modal');
    expect(screen.getByTestId('current-focus').textContent).toBe('detail-play-btn');

    // Simulate stray native focus on background card + close ItemDetailModal (isOpen: true -> false)
    act(() => {
      screen.getByTestId('browse-random-card').focus();
      screen.getByTestId('close-detail').click();
    });

    // activeTrap MUST remain 'folder-browser-modal' and focus MUST be restored to 'folder-item-5'
    expect(screen.getByTestId('active-trap').textContent).toBe('folder-browser-modal');
    expect(screen.getByTestId('current-focus').textContent).toBe('folder-item-5');
    expect(screen.getByTestId('folder-item-5').textContent).toContain('[SELECTED]');
    expect(document.activeElement).toBe(screen.getByTestId('folder-item-5'));

    // Background BrowseScreen refresh attempting setFocusedId('browse-random-card') MUST be blocked
    act(() => {
      screen.getByTestId('steal-bg-focus').click();
    });
    expect(screen.getByTestId('current-focus').textContent).toBe('folder-item-5');

    // Pressing Enter again MUST re-open folder-item-5 (preventDefault = true) and NEVER open browse-random-card
    let enterPrevented = false;
    act(() => {
      const ev = new KeyboardEvent('keydown', {
        key: 'Enter',
        keyCode: TVKeys.ENTER,
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(ev);
      enterPrevented = ev.defaultPrevented;
    });
    expect(enterPrevented).toBe(true);
    expect(onOpenFolderVideo5).toHaveBeenCalledTimes(2);
    expect(onOpenRandomBgVideo).not.toHaveBeenCalled();
  });

  it('re-renders ONLY the 2 affected items when moving focus across 50 useFocusable items (O(1) subscription)', () => {
    const renderCounts = new Map<string, number>();

    function PerfItem({ id, autoFocus }: { id: string; autoFocus?: boolean }) {
      renderCounts.set(id, (renderCounts.get(id) ?? 0) + 1);
      const { ref, isFocused } = useFocusable<HTMLButtonElement>({
        id,
        groupId: 'perf-grid',
        autoFocus,
      });
      return (
        <button ref={ref} id={id} data-focused={isFocused ? 'true' : 'false'}>
          {id}
        </button>
      );
    }

    function FiftyItemsGrid() {
      return (
        <div>
          {Array.from({ length: 50 }, (_, idx) => (
            <PerfItem key={idx} id={`perf-item-${idx}`} autoFocus={idx === 0} />
          ))}
        </div>
      );
    }

    render(
      <FocusProvider>
        <FiftyItemsGrid />
      </FocusProvider>
    );

    expect(document.getElementById('perf-item-0')?.getAttribute('data-focused')).toBe('true');

    // Snapshot baseline render counts after initial mount + autoFocus
    const beforeMove = new Map(renderCounts);

    // Move focus from perf-item-0 -> perf-item-1
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
    });

    expect(document.getElementById('perf-item-0')?.getAttribute('data-focused')).toBe('false');
    expect(document.getElementById('perf-item-1')?.getAttribute('data-focused')).toBe('true');

    const rerenderedIds: string[] = [];
    for (let i = 0; i < 50; i++) {
      const id = `perf-item-${i}`;
      const delta = (renderCounts.get(id) ?? 0) - (beforeMove.get(id) ?? 0);
      if (delta > 0) {
        rerenderedIds.push(id);
      }
    }

    // Strictly O(1): ONLY perf-item-0 and perf-item-1 re-rendered; the other 48 items had 0 renders!
    expect(rerenderedIds).toEqual(['perf-item-0', 'perf-item-1']);
  });

  it('skips scrollIntoView when target element is already visible and uses instant nearest scroll when clipped', () => {
    function ScrollTestRow() {
      const f1 = useFocusable<HTMLButtonElement>({ id: 'vis-1', groupId: 'row', autoFocus: true });
      const f2 = useFocusable<HTMLButtonElement>({ id: 'vis-2', groupId: 'row' });
      const f3 = useFocusable<HTMLButtonElement>({ id: 'clipped-3', groupId: 'row' });
      return (
        <div>
          <button ref={f1.ref} id="vis-1">1</button>
          <button ref={f2.ref} id="vis-2">2</button>
          <button ref={f3.ref} id="clipped-3">3</button>
        </div>
      );
    }

    Object.defineProperty(window, 'innerWidth', { value: 1920, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 1080, configurable: true });

    render(
      <FocusProvider>
        <ScrollTestRow />
      </FocusProvider>
    );

    const el1 = document.getElementById('vis-1')!;
    const el2 = document.getElementById('vis-2')!;
    const el3 = document.getElementById('clipped-3')!;

    const scrollSpy2 = vi.fn();
    const scrollSpy3 = vi.fn();
    el2.scrollIntoView = scrollSpy2;
    el3.scrollIntoView = scrollSpy3;

    vi.spyOn(el1, 'getBoundingClientRect').mockReturnValue({
      x: 100, y: 200, left: 100, top: 200, width: 200, height: 100, right: 300, bottom: 300, toJSON: () => {},
    });
    vi.spyOn(el2, 'getBoundingClientRect').mockReturnValue({
      x: 350, y: 200, left: 350, top: 200, width: 200, height: 100, right: 550, bottom: 300, toJSON: () => {},
    });
    // el3 is clipped past the right edge of the 1920px viewport
    vi.spyOn(el3, 'getBoundingClientRect').mockReturnValue({
      x: 1800, y: 200, left: 1800, top: 200, width: 250, height: 100, right: 2050, bottom: 300, toJSON: () => {},
    });

    // Move right onto already-visible el2 -> scrollIntoView MUST NOT be called
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
    });
    expect(scrollSpy2).not.toHaveBeenCalled();

    // Move right onto clipped el3 -> scrollIntoView called once with instant nearest options (never smooth)
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
    });
    expect(scrollSpy3).toHaveBeenCalledTimes(1);
    expect(scrollSpy3).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
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
