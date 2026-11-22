import { useEffect } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { FocusProvider, useFocusContext } from '../../src/navigation/FocusContext';
import { useFocusable } from '../../src/navigation/useFocusable';
import { TVKeys } from '../../src/navigation/keys';
import {
  SearchView,
  isSearchContentNodeId,
  isSearchLeftmostNodeId,
  getFirstSearchFocusableId,
} from '../../src/screens/SearchView';
import { ApiClient } from '../../src/api/client';
import * as searchApi from '../../src/api/search';
import { SearchResponse, SearchResultItem } from '../../src/types/kadr';

function FocusProbe() {
  const { focusedId } = useFocusContext();
  return <div data-testid="probe-focus">{focusedId ?? ''}</div>;
}

function ModalTrapButton({ trapId }: { trapId: string }) {
  const { ref } = useFocusable<HTMLButtonElement>({
    id: `${trapId}-close-btn`,
    groupId: trapId,
    order: 1,
  });
  return (
    <div role="dialog" aria-modal="true" data-testid="mock-modal">
      <button ref={ref} id={`${trapId}-close-btn`} type="button">
        Close
      </button>
    </div>
  );
}

function TrapControl({ trapId }: { trapId: string | null }) {
  const { pushTrap, popTrap } = useFocusContext();
  useEffect(() => {
    if (!trapId) return;
    pushTrap(trapId);
    return () => {
      popTrap(trapId);
    };
  }, [trapId, pushTrap, popTrap]);

  if (!trapId) return null;
  return <ModalTrapButton trapId={trapId} />;
}

function assertNoGapClasses(container: HTMLElement): void {
  expect(container.innerHTML).not.toMatch(/\bgap-/);
  const allElements = container.querySelectorAll('*');
  allElements.forEach((el) => {
    const cls = el.getAttribute('class') ?? '';
    expect(cls).not.toMatch(/(^|\s)gap-/);
  });
}

const sampleResults: SearchResultItem[] = [
  {
    id: 101,
    library_id: 'lib-movies',
    library_name: 'Movies',
    item_type: 'movie',
    title: 'Dune',
    release_year: 2021,
    poster_url: '/api/v1/artwork/101/poster',
    badge: '4K',
    duration_seconds: 9300,
    playback_progress: 0.45,
  },
  {
    id: 102,
    library_id: 'lib-shows',
    library_name: 'TV Shows',
    item_type: 'episode',
    title: 'The Kingsroad',
    series_title: 'Game of Thrones',
    season: 1,
    episode: 2,
    release_year: 2011,
    poster_url: '/api/v1/artwork/102/poster',
    badge: 'RESUME',
    duration_seconds: 3400,
    playback_progress: 0.003,
  },
  {
    id: 103,
    library_id: 'lib-movies',
    library_name: 'Movies',
    item_type: 'movie',
    title: 'Dune: Part Two',
    release_year: 2024,
    poster_url: '/api/v1/artwork/103/poster',
    badge: 'RESUME',
    duration_seconds: 9960,
    playback_progress: 0.95,
  },
  {
    id: 104,
    library_id: 'lib-live',
    library_name: 'Live TV',
    item_type: 'live_channel',
    title: 'Al Jazeera Documentary',
    poster_url: '/api/v1/artwork/104/poster',
    duration_seconds: 0,
    playback_progress: 0.5,
  },
  {
    id: 105,
    library_id: 'lib-books',
    library_name: 'Audiobooks',
    item_type: 'audiobook',
    title: 'Dune Messiah',
    release_year: 1969,
    poster_url: '/api/v1/artwork/105/poster',
    duration_seconds: 28000,
    playback_progress: 0,
  },
  {
    id: 106,
    library_id: 'lib-anime',
    library_name: 'Anime',
    item_type: 'anime',
    title: 'Dune Genesis',
    release_year: 1999,
    poster_url: '/api/v1/artwork/106/poster',
    badge: 'NEW',
    duration_seconds: 1440,
    playback_progress: 0,
  },
];

describe('SearchView', () => {
  let client: ApiClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    searchApi.resetSavedSearchState();
    client = new ApiClient('http://localhost:8492');
    client.setToken('jwt-test');
    client.setLibraryUnlockToken('lib-private', 'unlock-xyz');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('exports deterministic node classification helpers', () => {
    expect(isSearchContentNodeId('search-query-input')).toBe(true);
    expect(isSearchContentNodeId('search-action-space')).toBe(true);
    expect(isSearchContentNodeId('search-action-backspace')).toBe(true);
    expect(isSearchContentNodeId('search-action-clear')).toBe(true);
    expect(isSearchContentNodeId('search-key-a')).toBe(true);
    expect(isSearchContentNodeId('search-key-9')).toBe(true);
    expect(isSearchContentNodeId('search-filter-all')).toBe(true);
    expect(isSearchContentNodeId('search-filter-live_channel')).toBe(true);
    expect(isSearchContentNodeId('search-card-101')).toBe(true);
    expect(isSearchContentNodeId('search-reset-filter-btn')).toBe(true);
    expect(isSearchContentNodeId('search-retry-btn')).toBe(true);
    expect(isSearchContentNodeId('nav-screen-search')).toBe(false);
    expect(isSearchContentNodeId(null)).toBe(false);

    const expectedLeftmost = [
      'search-query-input',
      'search-action-space',
      'search-key-a',
      'search-key-g',
      'search-key-m',
      'search-key-s',
      'search-key-y',
      'search-key-4',
    ];
    for (const id of expectedLeftmost) {
      expect(isSearchLeftmostNodeId(id)).toBe(true);
    }
    expect(isSearchLeftmostNodeId('search-key-b')).toBe(false);
    expect(isSearchLeftmostNodeId('search-key-f')).toBe(false);
    expect(isSearchLeftmostNodeId('search-action-backspace')).toBe(false);
    expect(isSearchLeftmostNodeId('search-action-clear')).toBe(false);
    expect(isSearchLeftmostNodeId('search-filter-all')).toBe(false);
    expect(isSearchLeftmostNodeId('search-card-101')).toBe(false);
    expect(isSearchLeftmostNodeId(null)).toBe(false);

    expect(getFirstSearchFocusableId()).toBe('search-query-input');
  });

  it('renders idle discovery state with zero gap-* classes across idle, loading, results, empty, and error states', async () => {
    let resolveSearch!: (val: SearchResponse) => void;
    const fetchSpy = vi.spyOn(searchApi, 'fetchSearchResults').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSearch = resolve;
        })
    );

    const { container } = render(
      <FocusProvider>
        <FocusProbe />
        <SearchView
          client={client}
          serverUrl="http://localhost:8492"
          token="jwt-test"
          onSelectItem={vi.fn()}
          onPlayItem={vi.fn()}
        />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('probe-focus').textContent).toBe('search-key-a');
    });
    expect(getFirstSearchFocusableId()).toBe('search-key-a');
    expect(screen.getByTestId('search-idle-state')).toBeInTheDocument();
    expect(screen.getByText(/Titles, TV Episodes, Directors & Genres/i)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    assertNoGapClasses(container);

    // Trigger search -> loading state
    vi.useFakeTimers();
    fireEvent.click(document.getElementById('search-key-d')!);
    await act(async () => {
      vi.advanceTimersByTime(220);
    });
    vi.useRealTimers();

    expect(screen.getByTestId('search-loading')).toBeInTheDocument();
    assertNoGapClasses(container);

    // Resolve with results -> results grid state
    await act(async () => {
      resolveSearch({ query: 'd', total: sampleResults.length, items: sampleResults });
    });
    expect(screen.getByTestId('search-results-grid')).toBeInTheDocument();
    assertNoGapClasses(container);

    // Empty state with non-'all' filter
    fetchSpy.mockResolvedValueOnce({ query: 'd', total: 0, items: [] });
    await act(async () => {
      fireEvent.click(document.getElementById('search-filter-show')!);
    });
    await waitFor(() => {
      expect(screen.getByTestId('search-reset-filter-btn')).toBeInTheDocument();
    });
    assertNoGapClasses(container);

    // Error state
    fetchSpy.mockRejectedValueOnce(new Error('Network down'));
    await act(async () => {
      fireEvent.click(document.getElementById('search-filter-movie')!);
    });
    await waitFor(() => {
      expect(screen.getByTestId('search-retry-btn')).toBeInTheDocument();
    });
    assertNoGapClasses(container);
  });

  it('types via 6x6 keys, space, surrogate-safe backspace, clear, debounces 220ms, and aborts superseded requests', async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    const resolvers: Array<(value: SearchResponse) => void> = [];
    const rejectors: Array<(reason?: unknown) => void> = [];

    const fetchSpy = vi.spyOn(searchApi, 'fetchSearchResults').mockImplementation(
      (_client, opts) => {
        if (opts.signal) signals.push(opts.signal);
        return new Promise((resolve, reject) => {
          resolvers.push(resolve);
          rejectors.push(reject);
        });
      }
    );

    render(
      <FocusProvider>
        <SearchView
          client={client}
          serverUrl="http://localhost:8492"
          token="jwt-test"
          onSelectItem={vi.fn()}
          onPlayItem={vi.fn()}
        />
      </FocusProvider>
    );

    const input = screen.getByTestId('search-native-input') as HTMLInputElement;

    // Space on empty query is a no-op
    fireEvent.click(document.getElementById('search-action-space')!);
    expect(input.value).toBe('');

    // Type d-u-n rapidly -> debounced
    fireEvent.click(document.getElementById('search-key-d')!);
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    fireEvent.click(document.getElementById('search-key-u')!);
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    fireEvent.click(document.getElementById('search-key-n')!);

    expect(input.value).toBe('dun');
    expect(fetchSpy).not.toHaveBeenCalled();

    // At 219ms still not called; at 220ms called with 'dun'
    await act(async () => {
      vi.advanceTimersByTime(219);
    });
    expect(fetchSpy).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenLastCalledWith(
      client,
      expect.objectContaining({ q: 'dun', itemType: 'all' })
    );
    expect(signals[0].aborted).toBe(false);

    // Type 'e' while request 0 is still in flight -> aborts request 0 and fires request 1 after 220ms
    fireEvent.click(document.getElementById('search-key-e')!);
    expect(input.value).toBe('dune');
    expect(signals[0].aborted).toBe(true);

    // Reject aborted request silently (AbortError must not render error banner)
    const abortErr = new Error('Aborted');
    abortErr.name = 'AbortError';
    await act(async () => {
      rejectors[0](abortErr);
    });
    expect(screen.queryByTestId('search-retry-btn')).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(220);
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy).toHaveBeenLastCalledWith(
      client,
      expect.objectContaining({ q: 'dune', itemType: 'all' })
    );

    await act(async () => {
      resolvers[1]({ query: 'dune', total: 1, items: [sampleResults[0]] });
    });
    expect(screen.getByTestId('search-card-101')).toBeInTheDocument();

    // Space appends single trailing space, duplicate space ignored
    fireEvent.click(document.getElementById('search-action-space')!);
    expect(input.value).toBe('dune ');
    fireEvent.click(document.getElementById('search-action-space')!);
    expect(input.value).toBe('dune ');

    // Surrogate-pair emoji backspace safety
    fireEvent.change(input, { target: { value: 'dune 🚀' } });
    fireEvent.click(document.getElementById('search-action-backspace')!);
    expect(input.value).toBe('dune ');
    fireEvent.click(document.getElementById('search-action-backspace')!);
    expect(input.value).toBe('dune');

    // Clear resets query and clears results without network request
    const callsBeforeClear = fetchSpy.mock.calls.length;
    fireEvent.click(document.getElementById('search-action-clear')!);
    expect(input.value).toBe('');
    expect(screen.getByTestId('search-idle-state')).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(fetchSpy).toHaveBeenCalledTimes(callsBeforeClear);
  });

  it('supports native <input> IME editing flow without premature popup or sidebar jump', async () => {
    vi.spyOn(searchApi, 'fetchSearchResults').mockResolvedValue({
      query: 'الصحراء',
      total: 0,
      items: [],
    });
    const onNavigateToSidebar = vi.fn();

    render(
      <FocusProvider>
        <FocusProbe />
        <SearchView
          client={client}
          serverUrl="http://localhost:8492"
          onSelectItem={vi.fn()}
          onPlayItem={vi.fn()}
          onNavigateToSidebar={onNavigateToSidebar}
        />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('probe-focus').textContent).toBe('search-key-a');
    });

    // Navigate Up from search-key-a -> search-action-space -> search-query-input
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowUp', keyCode: TVKeys.UP });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('search-action-space');

    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowUp', keyCode: TVKeys.UP });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('search-query-input');

    const queryWrapper = document.getElementById('search-query-input')!;
    const input = screen.getByTestId('search-native-input') as HTMLInputElement;

    // D-pad focus onto wrapper must NOT involuntarily focus native <input>
    expect(document.activeElement).toBe(queryWrapper);
    expect(document.activeElement).not.toBe(input);

    // Pressing Enter focuses native <input> to summon Tizen IME
    act(() => {
      fireEvent.keyDown(window, { key: 'Enter', keyCode: TVKeys.ENTER });
    });
    expect(document.activeElement).toBe(input);

    // Backspace & text change while editing keep focus in input and never navigate to sidebar
    fireEvent.change(input, { target: { value: 'الصحراء' } });
    act(() => {
      fireEvent.keyDown(input, { key: 'Backspace', keyCode: TVKeys.BACKSPACE });
    });
    expect(document.activeElement).toBe(input);
    expect(onNavigateToSidebar).not.toHaveBeenCalled();

    // While editing, ArrowLeft/ArrowRight do not exit input or jump to sidebar
    const arrowLeftInInput = new KeyboardEvent('keydown', {
      key: 'ArrowLeft',
      keyCode: TVKeys.LEFT,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      input.dispatchEvent(arrowLeftInInput);
    });
    expect(arrowLeftInInput.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(input);
    expect(onNavigateToSidebar).not.toHaveBeenCalled();

    // IME composition Enter does not blur input
    act(() => {
      fireEvent.keyDown(input, {
        key: 'Enter',
        keyCode: TVKeys.ENTER,
        isComposing: true,
      });
    });
    expect(document.activeElement).toBe(input);

    // IME_DONE blurs input and keeps TV focus on search-query-input without sidebar call
    act(() => {
      fireEvent.keyDown(input, { keyCode: TVKeys.IME_DONE });
    });
    expect(document.activeElement).toBe(queryWrapper);
    expect(screen.getByTestId('probe-focus').textContent).toBe('search-query-input');
    expect(onNavigateToSidebar).not.toHaveBeenCalled();

    // Re-enter IME via mouse click from another focused node -> keeps input focused, IME_CANCEL exits cleanly
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowDown', keyCode: TVKeys.DOWN });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('search-action-space');
    act(() => {
      fireEvent.click(queryWrapper);
    });
    expect(document.activeElement).toBe(input);
    expect(screen.getByTestId('probe-focus').textContent).toBe('search-query-input');
    act(() => {
      fireEvent.keyDown(input, { keyCode: TVKeys.IME_CANCEL });
    });
    expect(document.activeElement).toBe(queryWrapper);
    expect(screen.getByTestId('probe-focus').textContent).toBe('search-query-input');
    expect(onNavigateToSidebar).not.toHaveBeenCalled();

    // Re-enter IME -> BACK_TIZEN blurs without calling onNavigateToSidebar
    act(() => {
      fireEvent.keyDown(window, { key: 'Enter', keyCode: TVKeys.ENTER });
    });
    expect(document.activeElement).toBe(input);
    act(() => {
      fireEvent.keyDown(input, { keyCode: TVKeys.BACK_TIZEN });
    });
    expect(document.activeElement).toBe(queryWrapper);
    expect(screen.getByTestId('probe-focus').textContent).toBe('search-query-input');
    expect(onNavigateToSidebar).not.toHaveBeenCalled();

    // Re-enter IME -> Escape blurs without calling onNavigateToSidebar
    act(() => {
      fireEvent.keyDown(window, { key: 'Enter', keyCode: TVKeys.ENTER });
    });
    expect(document.activeElement).toBe(input);
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape', keyCode: TVKeys.BACK_WEB });
    });
    expect(document.activeElement).toBe(queryWrapper);
    expect(onNavigateToSidebar).not.toHaveBeenCalled();

    // Re-enter IME -> ArrowDown blurs input and steps to search-action-space
    act(() => {
      fireEvent.keyDown(window, { key: 'Enter', keyCode: TVKeys.ENTER });
    });
    expect(document.activeElement).toBe(input);
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowDown', keyCode: TVKeys.DOWN });
    });
    expect(document.activeElement).toBe(document.getElementById('search-action-space'));
    expect(screen.getByTestId('probe-focus').textContent).toBe('search-action-space');
  });

  it('routes deterministic cross-zone and intra-zone D-pad navigation, filter switching, and reset-filter button', async () => {
    const fetchSpy = vi.spyOn(searchApi, 'fetchSearchResults').mockImplementation(
      async (_client, opts) => {
        if (opts.itemType === 'show') {
          return { query: opts.q, total: 0, items: [] };
        }
        return { query: opts.q, total: sampleResults.length, items: sampleResults };
      }
    );
    const onNavigateToSidebar = vi.fn();

    render(
      <FocusProvider>
        <FocusProbe />
        <SearchView
          client={client}
          serverUrl="http://localhost:8492"
          token="jwt-test"
          onSelectItem={vi.fn()}
          onPlayItem={vi.fn()}
          onNavigateToSidebar={onNavigateToSidebar}
        />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('probe-focus').textContent).toBe('search-key-a');
    });

    // Empty state: col 5 (search-key-f) + ArrowRight -> search-filter-all
    for (let i = 0; i < 5; i++) {
      act(() => {
        fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
      });
    }
    expect(screen.getByTestId('probe-focus').textContent).toBe('search-key-f');

    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('search-filter-all');

    // ArrowLeft from search-filter-all returns to lastKeyboardFocusId (search-key-f)
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowLeft', keyCode: TVKeys.LEFT });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('search-key-f');

    // Move back to search-key-a (col 0) and press ArrowLeft -> calls onNavigateToSidebar
    for (let i = 0; i < 5; i++) {
      act(() => {
        fireEvent.keyDown(window, { key: 'ArrowLeft', keyCode: TVKeys.LEFT });
      });
    }
    expect(screen.getByTestId('probe-focus').textContent).toBe('search-key-a');
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowLeft', keyCode: TVKeys.LEFT });
    });
    expect(onNavigateToSidebar).toHaveBeenCalledTimes(1);

    // ArrowUp to search-action-space -> ArrowLeft calls onNavigateToSidebar
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowUp', keyCode: TVKeys.UP });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('search-action-space');
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowLeft', keyCode: TVKeys.LEFT });
    });
    expect(onNavigateToSidebar).toHaveBeenCalledTimes(2);

    // ArrowUp to search-query-input -> ArrowLeft calls onNavigateToSidebar
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowUp', keyCode: TVKeys.UP });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('search-query-input');
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowLeft', keyCode: TVKeys.LEFT });
    });
    expect(onNavigateToSidebar).toHaveBeenCalledTimes(3);

    // Type 'dune' via native input & wait for results
    fireEvent.change(screen.getByTestId('search-native-input'), {
      target: { value: 'dune' },
    });
    await waitFor(() => {
      expect(screen.getByTestId('search-card-101')).toBeInTheDocument();
    });

    // Navigate back down to keyboard col 5 (search-key-f) and jump Right to search-card-101
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowDown', keyCode: TVKeys.DOWN }); // search-action-space
      fireEvent.keyDown(window, { key: 'ArrowDown', keyCode: TVKeys.DOWN }); // search-key-a
    });
    for (let i = 0; i < 5; i++) {
      act(() => {
        fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
      });
    }
    expect(screen.getByTestId('probe-focus').textContent).toBe('search-key-f');

    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('search-card-101');
    expect(document.activeElement).toBe(document.getElementById('search-card-101'));

    // Results col 0 + ArrowLeft -> returns to search-key-f (NOT sidebar!)
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowLeft', keyCode: TVKeys.LEFT });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('search-key-f');
    expect(onNavigateToSidebar).toHaveBeenCalledTimes(3);

    // Jump Right back to search-card-101, then move Right to col 2 (103) and Down into partial row (106)
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT }); // 101
      fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT }); // 102
      fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT }); // 103
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('search-card-103');

    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowDown', keyCode: TVKeys.DOWN }); // clamps to last card 106 in partial final row
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('search-card-106');

    // ArrowUp from 106 (idx 5) -> 102 (idx 1), then ArrowUp from row 0 -> search-filter-all
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowUp', keyCode: TVKeys.UP });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('search-card-102');

    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowUp', keyCode: TVKeys.UP });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('search-filter-all');

    // Step Right twice to search-filter-show and activate with Enter -> immediate re-query
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT }); // movie
      fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT }); // show
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('search-filter-show');

    const callsBeforeFilter = fetchSpy.mock.calls.length;
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Enter', keyCode: TVKeys.ENTER });
    });

    expect(fetchSpy).toHaveBeenCalledTimes(callsBeforeFilter + 1);
    expect(fetchSpy).toHaveBeenLastCalledWith(
      client,
      expect.objectContaining({ q: 'dune', itemType: 'show' })
    );

    await waitFor(() => {
      expect(screen.getByTestId('search-reset-filter-btn')).toBeInTheDocument();
    });

    // ArrowDown from filter moves to search-reset-filter-btn; Enter resets filter back to 'all'
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowDown', keyCode: TVKeys.DOWN });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('search-reset-filter-btn');

    await act(async () => {
      fireEvent.keyDown(window, { key: 'Enter', keyCode: TVKeys.ENTER });
    });

    expect(fetchSpy).toHaveBeenLastCalledWith(
      client,
      expect.objectContaining({ q: 'dune', itemType: 'all' })
    );
    await waitFor(() => {
      expect(screen.getByTestId('search-card-101')).toBeInTheDocument();
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('search-card-101');
  });

  it('renders authenticated posters, fallback tile, badges, progress track, and fires onSelectItem / onPlayItem', async () => {
    vi.spyOn(searchApi, 'fetchSearchResults').mockResolvedValue({
      query: 'dune',
      total: sampleResults.length,
      items: sampleResults,
    });
    const onSelectItem = vi.fn();
    const onPlayItem = vi.fn();

    render(
      <FocusProvider>
        <FocusProbe />
        <SearchView
          client={client}
          serverUrl="http://localhost:8492"
          token="jwt-test"
          onSelectItem={onSelectItem}
          onPlayItem={onPlayItem}
        />
      </FocusProvider>
    );

    fireEvent.change(screen.getByTestId('search-native-input'), {
      target: { value: 'dune' },
    });

    await waitFor(() => {
      expect(screen.getByTestId('search-card-101')).toBeInTheDocument();
    });

    // Card 101: Movie with authenticated poster URL, MOVIE badge, 4K status badge, 45% progress
    const card101 = screen.getByTestId('search-card-101');
    const img101 = within(card101).getByRole('img', { name: 'Dune' });
    expect(img101.getAttribute('src')).toBe(
      'http://localhost:8492/api/v1/artwork/101/poster?token=jwt-test&unlocked=unlock-xyz'
    );
    expect(within(card101).getByText('MOVIE')).toBeInTheDocument();
    expect(within(card101).getByText('4K')).toBeInTheDocument();
    expect(within(card101).getByText('2021 • Movies')).toBeInTheDocument();

    // Image error falls back to initial tile
    fireEvent.error(img101);
    expect(within(card101).queryByRole('img')).not.toBeInTheDocument();
    expect(within(card101).getByText('D')).toBeInTheDocument();

    // Card 102: Episode S01E02 + series_title + playback_progress=0.003 -> resume sentinel 1
    const card102 = screen.getByTestId('search-card-102');
    expect(within(card102).getByText('S01E02')).toBeInTheDocument();
    expect(within(card102).getByText('Game of Thrones')).toBeInTheDocument();
    expect(within(card102).getByText('RESUME')).toBeInTheDocument();

    // Card 103: playback_progress >= 0.9 -> WATCHED overrides badge
    const card103 = screen.getByTestId('search-card-103');
    expect(within(card103).getByText('WATCHED')).toBeInTheDocument();
    expect(within(card103).queryByText('RESUME')).not.toBeInTheDocument();

    // Card 104: live_channel -> LIVE badge, Play sentinel 0
    const card104 = screen.getByTestId('search-card-104');
    expect(within(card104).getByText('LIVE')).toBeInTheDocument();

    // Card 105: audiobook -> BOOK badge
    const card105 = screen.getByTestId('search-card-105');
    expect(within(card105).getByText('BOOK')).toBeInTheDocument();

    // Jump to card 101 -> Enter calls onSelectItem(101), TVKeys.PLAY calls onPlayItem(101, 45, 'Dune')
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowUp', keyCode: TVKeys.UP }); // space
      fireEvent.keyDown(window, { key: 'ArrowUp', keyCode: TVKeys.UP }); // query-input
      fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT }); // card 101
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('search-card-101');

    act(() => {
      fireEvent.keyDown(window, { key: 'Enter', keyCode: TVKeys.ENTER });
    });
    expect(onSelectItem).toHaveBeenCalledWith(101);

    act(() => {
      fireEvent.keyDown(window, { key: 'MediaPlay', keyCode: TVKeys.PLAY });
    });
    expect(onPlayItem).toHaveBeenCalledWith(101, 45, 'Dune');

    // Move to card 102 -> PLAY uses sentinel 1 for 0.003 progress
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('search-card-102');
    act(() => {
      fireEvent.keyDown(window, { keyCode: TVKeys.PLAY });
    });
    expect(onPlayItem).toHaveBeenLastCalledWith(102, 1, 'The Kingsroad');

    // Move to card 104 (live_channel) -> PLAY uses 0
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT }); // 103
      fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT }); // 104
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('search-card-104');
    act(() => {
      fireEvent.keyDown(window, { key: 'MediaPlay', keyCode: TVKeys.PLAY });
    });
    expect(onPlayItem).toHaveBeenLastCalledWith(104, 0, 'Al Jazeera Documentary');
  });

  it('re-anchors focus safely when focused card disappears on refresh, handles modal trap guard, and restores saved search state', async () => {
    const fetchSpy = vi
      .spyOn(searchApi, 'fetchSearchResults')
      .mockResolvedValueOnce({
        query: 'dune',
        total: 2,
        items: [sampleResults[0], sampleResults[1]],
      })
      .mockResolvedValueOnce({
        query: 'dune',
        total: 1,
        items: [sampleResults[0]],
      })
      .mockResolvedValueOnce({
        query: 'dune',
        total: 0,
        items: [],
      })
      .mockRejectedValueOnce(new Error('Timeout'))
      .mockResolvedValueOnce({
        query: 'dune',
        total: 1,
        items: [sampleResults[0]],
      })
      .mockResolvedValueOnce({
        query: 'dune',
        total: 1,
        items: [sampleResults[0]],
      });

    const onSelectItem = vi.fn();
    const { rerender, unmount } = render(
      <FocusProvider>
        <FocusProbe />
        <TrapControl trapId={null} />
        <SearchView
          client={client}
          serverUrl="http://localhost:8492"
          refreshKey={0}
          onSelectItem={onSelectItem}
          onPlayItem={vi.fn()}
        />
      </FocusProvider>
    );

    fireEvent.change(screen.getByTestId('search-native-input'), {
      target: { value: 'dune' },
    });
    await waitFor(() => {
      expect(screen.getByTestId('search-card-102')).toBeInTheDocument();
    });

    // Focus search-card-102
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowUp', keyCode: TVKeys.UP }); // space
      fireEvent.keyDown(window, { key: 'ArrowUp', keyCode: TVKeys.UP }); // query-input
      fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT }); // card-101
      fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT }); // card-102
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('search-card-102');

    // While a modal trap is open, focus stays inside modal and SearchView does not intercept arrows
    rerender(
      <FocusProvider>
        <FocusProbe />
        <TrapControl trapId="item-detail-modal" />
        <SearchView
          client={client}
          serverUrl="http://localhost:8492"
          refreshKey={0}
          onSelectItem={onSelectItem}
          onPlayItem={vi.fn()}
        />
      </FocusProvider>
    );
    expect(screen.getByTestId('probe-focus').textContent).toBe('item-detail-modal-close-btn');
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowLeft', keyCode: TVKeys.LEFT });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('item-detail-modal-close-btn');

    // Closing modal restores search-card-102, then refreshKey=1 removes card-102 -> anchors to card-101
    rerender(
      <FocusProvider>
        <FocusProbe />
        <TrapControl trapId={null} />
        <SearchView
          client={client}
          serverUrl="http://localhost:8492"
          refreshKey={0}
          onSelectItem={onSelectItem}
          onPlayItem={vi.fn()}
        />
      </FocusProvider>
    );
    expect(screen.getByTestId('probe-focus').textContent).toBe('search-card-102');

    rerender(
      <FocusProvider>
        <FocusProbe />
        <TrapControl trapId={null} />
        <SearchView
          client={client}
          serverUrl="http://localhost:8492"
          refreshKey={1}
          onSelectItem={onSelectItem}
          onPlayItem={vi.fn()}
        />
      </FocusProvider>
    );
    await waitFor(() => {
      expect(screen.queryByTestId('search-card-102')).not.toBeInTheDocument();
      expect(screen.getByTestId('probe-focus').textContent).toBe('search-card-101');
    });

    // When results shrink to empty while card-101 is focused, focus anchors safely on search-filter-all
    rerender(
      <FocusProvider>
        <FocusProbe />
        <TrapControl trapId={null} />
        <SearchView
          client={client}
          serverUrl="http://localhost:8492"
          refreshKey={2}
          onSelectItem={onSelectItem}
          onPlayItem={vi.fn()}
        />
      </FocusProvider>
    );
    await waitFor(() => {
      expect(screen.getByTestId('search-empty-state')).toBeInTheDocument();
      expect(screen.getByTestId('probe-focus').textContent).toBe('search-filter-all');
    });

    // When search errors, Retry Search button recovers cleanly and anchors on card-101
    rerender(
      <FocusProvider>
        <FocusProbe />
        <TrapControl trapId={null} />
        <SearchView
          client={client}
          serverUrl="http://localhost:8492"
          refreshKey={3}
          onSelectItem={onSelectItem}
          onPlayItem={vi.fn()}
        />
      </FocusProvider>
    );
    await waitFor(() => {
      expect(screen.getByTestId('search-retry-btn')).toBeInTheDocument();
    });
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowDown', keyCode: TVKeys.DOWN });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('search-retry-btn');
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Enter', keyCode: TVKeys.ENTER });
    });
    await waitFor(() => {
      expect(screen.getByTestId('search-card-101')).toBeInTheDocument();
      expect(screen.getByTestId('probe-focus').textContent).toBe('search-card-101');
    });

    // Verify saved state persists across unmount/remount and fetches immediately
    expect(searchApi.getSavedSearchState()).toEqual({ query: 'dune', filter: 'all' });
    unmount();

    const callsBeforeRemount = fetchSpy.mock.calls.length;
    render(
      <FocusProvider>
        <FocusProbe />
        <SearchView
          client={client}
          serverUrl="http://localhost:8492"
          onSelectItem={onSelectItem}
          onPlayItem={vi.fn()}
        />
      </FocusProvider>
    );

    expect((screen.getByTestId('search-native-input') as HTMLInputElement).value).toBe('dune');
    expect(fetchSpy).toHaveBeenCalledTimes(callsBeforeRemount + 1);
    await waitFor(() => {
      expect(screen.getByTestId('search-card-101')).toBeInTheDocument();
    });
  });
});
