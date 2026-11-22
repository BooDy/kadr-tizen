import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { useEffect, useLayoutEffect, useState } from 'react';
import { FocusProvider, useFocusContext } from '../../../src/navigation/FocusContext';
import { useFocusable } from '../../../src/navigation/useFocusable';
import { TVKeys } from '../../../src/navigation/keys';
import { CatalogGridWidget } from '../../../src/components/widgets/CatalogGridWidget';
import { BrowseScreen } from '../../../src/screens/BrowseScreen';
import { ApiClient } from '../../../src/api/client';
import * as screensApi from '../../../src/api/screens';
import * as librariesApi from '../../../src/api/libraries';
import { GridWidgetNode } from '../../../src/types/ast';

function makeGridWidget(count: number, id = 'movies', columns = 6): GridWidgetNode {
  return {
    type: 'grid',
    id,
    title: 'All Movies',
    columns,
    total_count: count,
    items: Array.from({ length: count }, (_, idx) => ({
      id: idx + 1,
      title: `Movie ${idx + 1}`,
      media_type: 'movie',
      release_year: 2020 + (idx % 6),
    })),
  };
}

function FocusProbe() {
  const { focusedId } = useFocusContext();
  return <div data-testid="probe-focus">{focusedId ?? ''}</div>;
}

function FirstFramePresetGrid({
  widget,
  targetFocusId,
  onSelectItem,
}: {
  widget: GridWidgetNode;
  targetFocusId: string;
  onSelectItem: (itemId: number) => void;
}) {
  const { focusedId, setFocusedId } = useFocusContext();
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    setFocusedId(targetFocusId);
    setReady(true);
  }, [targetFocusId, setFocusedId]);

  return (
    <>
      <div data-testid="probe-focus">{focusedId ?? ''}</div>
      {ready && (
        <CatalogGridWidget
          widget={widget}
          serverUrl="http://localhost:8492"
          onSelectItem={onSelectItem}
          autoFocusFirstItem
        />
      )}
    </>
  );
}

function FocusSetter({ targetId }: { targetId: string }) {
  const { setFocusedId } = useFocusContext();
  useLayoutEffect(() => {
    setFocusedId(targetId);
  }, [targetId, setFocusedId]);
  return null;
}

function assertZeroGapClasses(container: HTMLElement) {
  const gapElements = Array.from(container.querySelectorAll('*')).filter((el) =>
    Array.from(el.classList).some((cls) => cls.startsWith('gap-'))
  );
  expect(gapElements).toHaveLength(0);
}

describe('CatalogGridWidget virtualization & zero-gap layout', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a 24-item grid un-virtualized with zero gap-* classes and inline gridGap: 24px', () => {
    const widget = makeGridWidget(24);
    const { container } = render(
      <FocusProvider>
        <CatalogGridWidget
          widget={widget}
          serverUrl="http://localhost:8492"
          onSelectItem={vi.fn()}
          autoFocusFirstItem
        />
      </FocusProvider>
    );

    assertZeroGapClasses(container);

    const mountedCards = container.querySelectorAll('[id^="grid-movies-"]');
    expect(mountedCards).toHaveLength(24);

    const gridEl = mountedCards[0].parentElement as HTMLElement;
    expect(gridEl.style.display).toBe('grid');
    expect(gridEl.style.gridTemplateColumns).toBe('repeat(6, minmax(0, 1fr))');
    expect(gridEl.style.gridGap).toBe('24px');
    expect(gridEl.style.paddingTop).toBe('');
    expect(gridEl.style.paddingBottom).toBe('');
  });

  it('handles empty items safely even without FocusProvider', () => {
    const emptyWidget = makeGridWidget(0);
    const { container } = render(
      <CatalogGridWidget
        widget={emptyWidget}
        serverUrl="http://localhost:8492"
        onSelectItem={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('virtualizes a 180-item (30-row, 6-col) grid with < 90 mounted cards and zero gap-* classes', () => {
    const widget = makeGridWidget(180);
    const { container } = render(
      <FocusProvider>
        <FocusProbe />
        <CatalogGridWidget
          widget={widget}
          serverUrl="http://localhost:8492"
          onSelectItem={vi.fn()}
          autoFocusFirstItem
        />
      </FocusProvider>
    );

    assertZeroGapClasses(container);

    const mountedCards = container.querySelectorAll('[id^="grid-movies-"]');
    expect(mountedCards.length).toBeGreaterThan(0);
    expect(mountedCards.length).toBeLessThan(90);

    const gridEl = mountedCards[0].parentElement as HTMLElement;
    expect(gridEl.style.gridGap).toBe('24px');
    expect(parseInt(gridEl.style.paddingBottom || '0', 10)).toBeGreaterThan(0);
    expect(screen.getByTestId('probe-focus').textContent).toBe('grid-movies-1');
  });

  it('jumps +5/-5 rows on CH_DOWN and CH_UP, shifting the mounted window cleanly', () => {
    const widget = makeGridWidget(180);
    const { container } = render(
      <FocusProvider>
        <FocusProbe />
        <main style={{ height: '760px', overflowY: 'auto' }}>
          <CatalogGridWidget
            widget={widget}
            serverUrl="http://localhost:8492"
            onSelectItem={vi.fn()}
            autoFocusFirstItem
          />
        </main>
      </FocusProvider>
    );

    expect(screen.getByTestId('probe-focus').textContent).toBe('grid-movies-1');
    expect(document.activeElement?.id).toBe('grid-movies-1');

    // Row 0 -> Row 5 (grid-movies-31)
    act(() => {
      fireEvent.keyDown(window, { key: 'ChannelDown', keyCode: TVKeys.CH_DOWN });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('grid-movies-31');
    expect(document.activeElement?.id).toBe('grid-movies-31');
    expect(container.querySelectorAll('[id^="grid-movies-"]').length).toBeLessThan(90);

    // Row 5 -> Row 10 (grid-movies-61)
    act(() => {
      fireEvent.keyDown(window, { key: 'ChannelDown', keyCode: TVKeys.CH_DOWN });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('grid-movies-61');
    expect(document.activeElement?.id).toBe('grid-movies-61');
    expect(document.getElementById('grid-movies-1')).toBeNull();
    expect(container.querySelectorAll('[id^="grid-movies-"]').length).toBeLessThan(90);

    const gridAtRow10 = document.getElementById('grid-movies-61')?.parentElement as HTMLElement;
    expect(parseInt(gridAtRow10.style.paddingTop || '0', 10)).toBeGreaterThan(0);

    // Step -5 rows back up via CH_UP: Row 10 -> Row 5 (grid-movies-31) -> Row 0 (grid-movies-1)
    act(() => {
      fireEvent.keyDown(window, { key: 'ChannelUp', keyCode: TVKeys.CH_UP });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('grid-movies-31');
    expect(document.activeElement?.id).toBe('grid-movies-31');

    act(() => {
      fireEvent.keyDown(window, { key: 'ChannelUp', keyCode: TVKeys.CH_UP });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('grid-movies-1');
    expect(document.activeElement?.id).toBe('grid-movies-1');

    // Column preservation + PageDown / PageUp aliases
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
      fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('grid-movies-3');

    act(() => {
      fireEvent.keyDown(window, { key: 'PageDown', keyCode: TVKeys.PAGE_DOWN });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('grid-movies-33');

    act(() => {
      fireEvent.keyDown(window, { key: 'PageUp', keyCode: TVKeys.PAGE_UP });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('grid-movies-3');
  });

  it('centers window on row 25 and mounts grid-movies-151 immediately when focusedId is pre-set on initial render', () => {
    const widget = makeGridWidget(180);
    const onSelectItem = vi.fn();

    const { container } = render(
      <FocusProvider>
        <FirstFramePresetGrid
          widget={widget}
          targetFocusId="grid-movies-151"
          onSelectItem={onSelectItem}
        />
      </FocusProvider>
    );

    const targetCard = document.getElementById('grid-movies-151');
    expect(targetCard).not.toBeNull();
    expect(document.getElementById('grid-movies-1')).toBeNull();
    expect(screen.getByTestId('probe-focus').textContent).toBe('grid-movies-151');
    expect(document.activeElement?.id).toBe('grid-movies-151');
    expect(container.querySelectorAll('[id^="grid-movies-"]').length).toBeLessThan(90);

    const gridEl = targetCard!.parentElement as HTMLElement;
    expect(parseInt(gridEl.style.paddingTop || '0', 10)).toBeGreaterThan(0);

    fireEvent.click(targetCard!);
    expect(onSelectItem).toHaveBeenCalledWith(151);
  });

  it('re-centers window onto row 25 when FocusContext updates focusedId to grid-movies-151', () => {
    const widget = makeGridWidget(180);
    const { container } = render(
      <FocusProvider>
        <FocusProbe />
        <FocusSetter targetId="grid-movies-151" />
        <CatalogGridWidget
          widget={widget}
          serverUrl="http://localhost:8492"
          onSelectItem={vi.fn()}
          autoFocusFirstItem
        />
      </FocusProvider>
    );

    const targetCard = document.getElementById('grid-movies-151');
    expect(targetCard).not.toBeNull();
    expect(document.getElementById('grid-movies-1')).toBeNull();
    expect(screen.getByTestId('probe-focus').textContent).toBe('grid-movies-151');
    expect(document.activeElement?.id).toBe('grid-movies-151');
    expect(container.querySelectorAll('[id^="grid-movies-"]').length).toBeLessThan(90);
  });

  it('updates window when scrolling ancestor <main> and clamps CH_DOWN on final partial row', async () => {
    const widget = makeGridWidget(182); // 31 rows; row 30 has 2 items (181, 182)
    const { container } = render(
      <FocusProvider>
        <FocusProbe />
        <main data-testid="browse-main" style={{ height: '760px', overflowY: 'auto' }}>
          <CatalogGridWidget
            widget={widget}
            serverUrl="http://localhost:8492"
            onSelectItem={vi.fn()}
            autoFocusFirstItem
          />
        </main>
      </FocusProvider>
    );

    const mainEl = screen.getByTestId('browse-main') as HTMLElement;
    Object.defineProperty(mainEl, 'clientHeight', { value: 760, configurable: true });

    // Scroll main down to ~row 25 (25 * 408 = 10200px) and focus moves off-grid or stays un-anchored
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
      fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
      fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
    });
    // Now at col 3 (grid-movies-4). Jump down 6 times (row 0 -> 5 -> 10 -> 15 -> 20 -> 25 -> 30)
    // On row 30, col 3 does not exist (only 2 items: 181, 182), so it must clamp to item 182.
    for (let i = 0; i < 6; i++) {
      act(() => {
        fireEvent.keyDown(window, { key: 'ChannelDown', keyCode: TVKeys.CH_DOWN });
      });
    }
    expect(screen.getByTestId('probe-focus').textContent).toBe('grid-movies-182');
    expect(mainEl.scrollTop).toBeGreaterThan(0);

    // External scroll event on <main>
    act(() => {
      mainEl.scrollTop = 408 * 10; // row 10
      fireEvent.scroll(mainEl);
    });

    await waitFor(() => {
      expect(container.querySelectorAll('[id^="grid-movies-"]').length).toBeLessThan(90);
    });
  });

  it('ignores CH_DOWN / CH_UP when a modal dialog is open or focus is outside the grid', () => {
    const widget = makeGridWidget(180);
    render(
      <FocusProvider>
        <FocusProbe />
        <CatalogGridWidget
          widget={widget}
          serverUrl="http://localhost:8492"
          onSelectItem={vi.fn()}
          autoFocusFirstItem
        />
        <div role="dialog" aria-modal="true" data-testid="fake-modal" />
      </FocusProvider>
    );

    expect(screen.getByTestId('probe-focus').textContent).toBe('grid-movies-1');

    act(() => {
      fireEvent.keyDown(window, { key: 'ChannelDown', keyCode: TVKeys.CH_DOWN });
    });

    // Focus must NOT jump while modal dialog is present
    expect(screen.getByTestId('probe-focus').textContent).toBe('grid-movies-1');
  });

  it('ignores CH_DOWN / CH_UP when activeTrap is active or focus is outside the grid', () => {
    function ExternalSidebarButton() {
      const { ref } = useFocusable<HTMLButtonElement>({
        id: 'nav-screen-movies',
        groupId: 'sidebar',
        autoFocus: true,
      });
      return (
        <button ref={ref} id="nav-screen-movies" type="button">
          Movies
        </button>
      );
    }

    function TrapTrigger({ active }: { active: boolean }) {
      const { pushTrap, popTrap } = useFocusContext();
      useEffect(() => {
        if (active) {
          pushTrap('item-detail-modal');
          return () => popTrap('item-detail-modal');
        }
      }, [active, pushTrap, popTrap]);
      return null;
    }

    const widget = makeGridWidget(180);
    const { rerender } = render(
      <FocusProvider>
        <FocusProbe />
        <ExternalSidebarButton />
        <CatalogGridWidget
          widget={widget}
          serverUrl="http://localhost:8492"
          onSelectItem={vi.fn()}
          autoFocusFirstItem={false}
        />
      </FocusProvider>
    );

    expect(screen.getByTestId('probe-focus').textContent).toBe('nav-screen-movies');
    act(() => {
      fireEvent.keyDown(window, { key: 'ChannelDown', keyCode: TVKeys.CH_DOWN });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('nav-screen-movies');

    rerender(
      <FocusProvider>
        <FocusProbe />
        <TrapTrigger active />
        <CatalogGridWidget
          widget={widget}
          serverUrl="http://localhost:8492"
          onSelectItem={vi.fn()}
          autoFocusFirstItem
        />
      </FocusProvider>
    );

    act(() => {
      fireEvent.keyDown(window, { key: 'ChannelDown', keyCode: TVKeys.CH_DOWN });
    });
    expect(screen.getByTestId('probe-focus').textContent).not.toBe('grid-movies-31');
  });

  it('tracks <main> scrollTop subtracting wrapper offsetTop when focus is not inside the grid', async () => {
    const widget = makeGridWidget(180);
    const { container } = render(
      <FocusProvider>
        <main data-testid="browse-main" style={{ height: '760px', overflowY: 'auto' }}>
          <CatalogGridWidget
            widget={widget}
            serverUrl="http://localhost:8492"
            onSelectItem={vi.fn()}
          />
        </main>
      </FocusProvider>
    );

    const mainEl = screen.getByTestId('browse-main') as HTMLElement;
    const wrapperEl = mainEl.firstElementChild as HTMLElement;
    Object.defineProperty(mainEl, 'clientHeight', { value: 760, configurable: true });
    Object.defineProperty(wrapperEl, 'offsetTop', { value: 200, configurable: true });

    expect(document.getElementById('grid-movies-1')).not.toBeNull();
    expect(document.getElementById('grid-movies-91')).toBeNull();

    // Scroll to row 15 (200 offsetTop + 15 * 408 = 6320)
    act(() => {
      mainEl.scrollTop = 200 + 15 * 408;
      fireEvent.scroll(mainEl);
    });

    await waitFor(() => {
      expect(document.getElementById('grid-movies-91')).not.toBeNull();
    });
    expect(document.getElementById('grid-movies-1')).toBeNull();
    expect(container.querySelectorAll('[id^="grid-movies-"]').length).toBeLessThan(90);
  });

  it('integrates cleanly with BrowseScreen initialFocusId on deep item #151, ArrowLeft/Right sidebar restoration, and CH_UP', async () => {
    const mockClient = new ApiClient('http://localhost:8492');
    vi.spyOn(screensApi, 'fetchScreens').mockResolvedValue([
      { id: 'home', title: 'Home' },
      { id: 'movies', title: 'Movies' },
    ]);
    vi.spyOn(librariesApi, 'fetchLibraries').mockResolvedValue([]);
    vi.spyOn(screensApi, 'fetchScreenLayout').mockResolvedValue({
      id: 'movies',
      title: 'Movies',
      widgets: [makeGridWidget(180, 'movies', 6)],
    });

    const { container } = render(
      <FocusProvider>
        <FocusProbe />
        <BrowseScreen
          client={mockClient}
          serverUrl="http://localhost:8492"
          initialTab="movies"
          initialFocusId="grid-movies-151"
          onSelectItem={vi.fn()}
          onPlayItem={vi.fn()}
          onSwitchProfile={vi.fn()}
        />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('probe-focus').textContent).toBe('grid-movies-151');
    });
    expect(document.getElementById('grid-movies-151')).not.toBeNull();
    expect(document.getElementById('grid-movies-1')).toBeNull();
    expect(document.activeElement?.id).toBe('grid-movies-151');
    expect(container.querySelectorAll('[id^="grid-movies-"]').length).toBeLessThan(90);

    // ArrowLeft from column 0 transitions to sidebar nav-screen-movies
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowLeft', keyCode: TVKeys.LEFT });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('nav-screen-movies');

    // ArrowRight from sidebar restores grid-movies-151 even when virtualized
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('grid-movies-151');
    expect(document.getElementById('grid-movies-151')).not.toBeNull();

    // CH_UP jumps -5 rows to grid-movies-121
    act(() => {
      fireEvent.keyDown(window, { key: 'ChannelUp', keyCode: TVKeys.CH_UP });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('grid-movies-121');
    expect(document.activeElement?.id).toBe('grid-movies-121');
  });

  it('mounts row 15 (grid-movies-91) when <main> is externally scrolled while grid-movies-1 is auto-focused, and ArrowDown recovers onto the scrolled viewport', async () => {
    const widget = makeGridWidget(180);
    const { container } = render(
      <FocusProvider>
        <FocusProbe />
        <main data-testid="browse-main" style={{ height: '760px', overflowY: 'auto' }}>
          <CatalogGridWidget
            widget={widget}
            serverUrl="http://localhost:8492"
            onSelectItem={vi.fn()}
            autoFocusFirstItem
          />
        </main>
      </FocusProvider>
    );

    const mainEl = screen.getByTestId('browse-main') as HTMLElement;
    Object.defineProperty(mainEl, 'clientHeight', { value: 760, configurable: true });

    expect(screen.getByTestId('probe-focus').textContent).toBe('grid-movies-1');
    expect(document.getElementById('grid-movies-1')).not.toBeNull();
    expect(document.getElementById('grid-movies-91')).toBeNull();

    // External mouse-wheel / pointer scroll to row 15 (15 * 408 = 6120)
    act(() => {
      mainEl.scrollTop = 15 * 408;
      fireEvent.scroll(mainEl);
    });

    await waitFor(() => {
      expect(document.getElementById('grid-movies-91')).not.toBeNull();
    });
    expect(document.getElementById('grid-movies-1')).toBeNull();
    expect(mainEl.scrollTop).toBe(15 * 408);
    expect(container.querySelectorAll('[id^="grid-movies-"]').length).toBeLessThan(90);

    // Subsequent ArrowDown while focusedId === null recovers onto the first visible card in the scrolled viewport
    expect(screen.getByTestId('probe-focus').textContent).toBe('');
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowDown', keyCode: TVKeys.DOWN });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('grid-movies-91');
    expect(document.activeElement?.id).toBe('grid-movies-91');
    expect(document.getElementById('grid-movies-91')).not.toBeNull();
  });

  it('keeps grid-movies-151 mounted when item-detail-modal trap opens, rerenders, or remounts, and popTrap restores focusedId', () => {
    function TrapHarness() {
      const { focusedId, activeTrap, setFocusedId, pushTrap, popTrap } = useFocusContext();
      const [widget, setWidget] = useState(() => makeGridWidget(180));
      const [showGrid, setShowGrid] = useState(true);

      return (
        <div>
          <div data-testid="probe-focus">{focusedId ?? ''}</div>
          <div data-testid="probe-trap">{activeTrap ?? ''}</div>
          <button
            data-testid="open-modal-trap"
            onClick={() => {
              pushTrap('item-detail-modal');
              setFocusedId('detail-play-btn');
            }}
          >
            Open Modal
          </button>
          <button
            data-testid="close-modal-trap"
            onClick={() => {
              popTrap('item-detail-modal');
            }}
          >
            Close Modal
          </button>
          <button
            data-testid="refresh-widget"
            onClick={() => {
              setWidget(makeGridWidget(180));
            }}
          >
            Refresh Widget
          </button>
          <button data-testid="unmount-grid" onClick={() => setShowGrid(false)}>
            Unmount
          </button>
          <button data-testid="remount-grid" onClick={() => setShowGrid(true)}>
            Remount
          </button>
          <main style={{ height: '760px', overflowY: 'auto' }}>
            {showGrid && (
              <CatalogGridWidget
                widget={widget}
                serverUrl="http://localhost:8492"
                onSelectItem={vi.fn()}
                autoFocusFirstItem
              />
            )}
          </main>
        </div>
      );
    }

    render(
      <FocusProvider>
        <FocusSetter targetId="grid-movies-151" />
        <TrapHarness />
      </FocusProvider>
    );

    expect(screen.getByTestId('probe-focus').textContent).toBe('grid-movies-151');
    expect(document.getElementById('grid-movies-151')).not.toBeNull();

    // Open item-detail-modal trap -> focusedId moves to detail-play-btn while scrollTop stays 0 in JSDOM
    act(() => {
      fireEvent.click(screen.getByTestId('open-modal-trap'));
    });
    expect(screen.getByTestId('probe-trap').textContent).toBe('item-detail-modal');
    expect(screen.getByTestId('probe-focus').textContent).toBe('detail-play-btn');
    expect(document.getElementById('grid-movies-151')).not.toBeNull();

    // Rerender with refreshed widget layout while modal trap is open
    act(() => {
      fireEvent.click(screen.getByTestId('refresh-widget'));
    });
    expect(document.getElementById('grid-movies-151')).not.toBeNull();

    // Simulate BrowseScreen loading=true -> loading=false unmount/remount while modal trap is open
    act(() => {
      fireEvent.click(screen.getByTestId('unmount-grid'));
    });
    expect(document.getElementById('grid-movies-151')).toBeNull();
    act(() => {
      fireEvent.click(screen.getByTestId('remount-grid'));
    });
    expect(document.getElementById('grid-movies-151')).not.toBeNull();

    // Close modal trap -> FocusContext.popTrap restores focusedId === 'grid-movies-151'
    act(() => {
      fireEvent.click(screen.getByTestId('close-modal-trap'));
    });
    expect(screen.getByTestId('probe-trap').textContent).toBe('');
    expect(screen.getByTestId('probe-focus').textContent).toBe('grid-movies-151');
    expect(document.activeElement?.id).toBe('grid-movies-151');
  });
});
