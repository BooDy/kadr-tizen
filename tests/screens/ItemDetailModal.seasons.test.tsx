import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ItemDetailModal } from '../../src/screens/ItemDetailModal';
import { FocusProvider } from '../../src/navigation/FocusContext';
import { TVKeys } from '../../src/navigation/keys';

const mockSeriesItem = {
  id: 10,
  title: 'Breaking Bad',
  type: 'series' as const,
  seasons: [1, 2, 3],
  episodes: [
    { id: 101, title: 'Pilot', season: 1, episode: 1, type: 'video' as const },
    { id: 102, title: 'Cat in the Bag', season: 1, episode: 2, type: 'video' as const },
    { id: 201, title: 'Seven Thirty-Seven', season: 2, episode: 1, type: 'video' as const },
  ],
};

describe('ItemDetailModal Season Navigation', () => {
  it('navigates strictly horizontally between season tabs with Left and Right', async () => {
    render(
      <FocusProvider>
        <ItemDetailModal
          item={mockSeriesItem}
          isOpen={true}
          onClose={vi.fn()}
          onPlay={vi.fn()}
          serverUrl="http://127.0.0.1:8492"
        />
      </FocusProvider>
    );

    // Initial season is 1
    const season1Tab = screen.getByRole('button', { name: /Season 1/i });
    const season2Tab = screen.getByRole('button', { name: /Season 2/i });

    // Focus Season 1
    act(() => {
      season1Tab.focus();
    });

    // Press Right
    await act(async () => {
      fireEvent.keyDown(window, { keyCode: TVKeys.RIGHT });
    });

    // Focus should move to Season 2 tab, NOT episode card
    expect(document.activeElement).toBe(season2Tab);

    // Before Enter is pressed, Season 1 episodes remain active
    expect(screen.getByText('Pilot')).toBeInTheDocument();
    expect(screen.queryByText('Seven Thirty-Seven')).not.toBeInTheDocument();

    // Press Enter to select Season 2
    await act(async () => {
      fireEvent.keyDown(window, { keyCode: TVKeys.ENTER });
    });

    // Now Season 2 episodes should be rendered
    expect(screen.getByText('Seven Thirty-Seven')).toBeInTheDocument();
    expect(screen.queryByText('Pilot')).not.toBeInTheDocument();

    // Press Left to navigate back to Season 1 tab
    await act(async () => {
      fireEvent.keyDown(window, { keyCode: TVKeys.LEFT });
    });
    expect(document.activeElement).toBe(season1Tab);
  });

  it('navigates Down from active season tab to first episode card, and Up back to season tab', async () => {
    render(
      <FocusProvider>
        <ItemDetailModal
          item={mockSeriesItem}
          isOpen={true}
          onClose={vi.fn()}
          onPlay={vi.fn()}
          serverUrl="http://127.0.0.1:8492"
        />
      </FocusProvider>
    );

    const season1Tab = screen.getByRole('button', { name: /Season 1/i });
    act(() => {
      season1Tab.focus();
    });

    // Press Down from season tab
    await act(async () => {
      fireEvent.keyDown(window, { keyCode: TVKeys.DOWN });
    });

    // Should focus episode card for Pilot (id 101)
    const episodeCard101 = screen.getByTestId('card-episode-card-101');
    expect(document.activeElement).toBe(episodeCard101);

    // Press Up from episode card
    await act(async () => {
      fireEvent.keyDown(window, { keyCode: TVKeys.UP });
    });

    expect(document.activeElement).toBe(season1Tab);
  });

  it('navigates Down from action buttons directly to active season tab and Up from season tab back to action button', async () => {
    render(
      <FocusProvider>
        <ItemDetailModal
          item={mockSeriesItem}
          isOpen={true}
          onClose={vi.fn()}
          onPlay={vi.fn()}
          serverUrl="http://127.0.0.1:8492"
        />
      </FocusProvider>
    );

    const playBtn = screen.getByRole('button', { name: /^Play$/i });
    const season1Tab = screen.getByRole('button', { name: /Season 1/i });

    act(() => {
      playBtn.focus();
    });
    expect(document.activeElement).toBe(playBtn);

    // Press Down from Play button
    await act(async () => {
      fireEvent.keyDown(window, { keyCode: TVKeys.DOWN });
    });

    // Should focus Season 1 tab
    expect(document.activeElement).toBe(season1Tab);

    // Press Up from Season 1 tab
    await act(async () => {
      fireEvent.keyDown(window, { keyCode: TVKeys.UP });
    });

    // Should return focus to Play button
    expect(document.activeElement).toBe(playBtn);
  });

  it('navigates Right from last Season tab to season-watch-toggle-btn, Left back, and toggles Season watch state', async () => {
    const onWatchStateChange = vi.fn().mockResolvedValue(undefined);
    const threeSeasonItem = {
      ...mockSeriesItem,
      episodes: [
        ...mockSeriesItem.episodes,
        { id: 301, title: 'No Mas', season: 3, episode: 1, type: 'video' as const },
      ],
    };

    render(
      <FocusProvider>
        <ItemDetailModal
          item={threeSeasonItem}
          isOpen={true}
          onClose={vi.fn()}
          onPlay={vi.fn()}
          onWatchStateChange={onWatchStateChange}
          serverUrl="http://127.0.0.1:8492"
        />
      </FocusProvider>
    );

    const season3Tab = screen.getByRole('button', { name: /Season 3/i });
    const seasonWatchBtn = document.getElementById('season-watch-toggle-btn')!;
    expect(seasonWatchBtn).toBeInTheDocument();
    expect(seasonWatchBtn).toHaveTextContent('Mark Season 1 Watched');

    // Focus last season tab (Season 3)
    act(() => {
      season3Tab.focus();
    });
    expect(document.activeElement).toBe(season3Tab);

    // ArrowRight from last season tab focuses season-watch-toggle-btn
    await act(async () => {
      fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
    });
    expect(document.activeElement).toBe(seasonWatchBtn);

    // ArrowLeft from season-watch-toggle-btn returns to season-tab-3
    await act(async () => {
      fireEvent.keyDown(window, { key: 'ArrowLeft', keyCode: TVKeys.LEFT });
    });
    expect(document.activeElement).toBe(season3Tab);

    // ArrowRight back to season-watch-toggle-btn and Enter to mark Season 1 watched
    await act(async () => {
      fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
    });
    expect(document.activeElement).toBe(seasonWatchBtn);

    await act(async () => {
      fireEvent.keyDown(window, { key: 'Enter', keyCode: TVKeys.ENTER });
    });

    expect(onWatchStateChange).toHaveBeenCalledWith([101, 102], true);
    expect(seasonWatchBtn).toHaveTextContent('Mark Season 1 Unwatched');
    expect(screen.getAllByText('WATCHED')).toHaveLength(2);
    expect(document.activeElement).toBe(seasonWatchBtn);

    // Pressing Enter again marks Season 1 unwatched
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Enter', keyCode: TVKeys.ENTER });
    });
    expect(onWatchStateChange).toHaveBeenLastCalledWith([101, 102], false);
    expect(seasonWatchBtn).toHaveTextContent('Mark Season 1 Watched');
    expect(screen.queryByText('WATCHED')).not.toBeInTheDocument();
  });
});

