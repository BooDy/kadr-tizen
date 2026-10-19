import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
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
});
