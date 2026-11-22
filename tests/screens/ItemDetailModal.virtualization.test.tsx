import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { FocusProvider, useFocusContext } from '../../src/navigation/FocusContext';
import { ItemDetailModal } from '../../src/screens/ItemDetailModal';
import { MediaItemDetail } from '../../src/api/items';
import { TVKeys } from '../../src/navigation/keys';

function FocusProbe() {
  const { focusedId, activeTrap } = useFocusContext();
  return (
    <>
      <div data-testid="probe-focus">{focusedId ?? ''}</div>
      <div data-testid="probe-trap">{activeTrap ?? ''}</div>
    </>
  );
}

function makeShowWithEpisodes(count: number, extraSeason2Count = 0): MediaItemDetail {
  const episodes = Array.from({ length: count }, (_, idx) => ({
    id: idx + 1,
    title: `Episode ${idx + 1}`,
    season: 1,
    episode: idx + 1,
    playback_progress: 0,
  }));

  for (let i = 0; i < extraSeason2Count; i++) {
    episodes.push({
      id: 10000 + i + 1,
      title: `S2 Episode ${i + 1}`,
      season: 2,
      episode: i + 1,
      playback_progress: 0,
    });
  }

  return {
    id: 900,
    title: 'Long Running Anime',
    media_type: 'show',
    episodes,
  };
}

describe('ItemDetailModal Episode Strip Virtualization', () => {
  it('renders <= 30 episode seasons un-virtualized with no episode-range-pills or FF/REW hint', () => {
    const { container } = render(
      <FocusProvider>
        <FocusProbe />
        <ItemDetailModal
          isOpen={true}
          item={makeShowWithEpisodes(20)}
          serverUrl="http://localhost:8492"
          onPlay={vi.fn()}
          onClose={vi.fn()}
        />
      </FocusProvider>
    );

    expect(screen.queryByTestId('episode-range-pills')).not.toBeInTheDocument();
    const cards = container.querySelectorAll('[id^="episode-card-"]');
    expect(cards).toHaveLength(20);

    const strip = cards[0].parentElement as HTMLElement;
    expect(strip.style.paddingLeft).toBe('');
    expect(strip.style.paddingRight).toBe('');

    expect(screen.getByTestId('detail-remote-footer')).not.toHaveTextContent('±10 Eps');
  });

  it('windows a 180-episode season with zero gap-* classes, range pills, D-pad flow, and FF/REW ±10 skip', () => {
    const onPlay = vi.fn();
    const { container } = render(
      <FocusProvider>
        <FocusProbe />
        <ItemDetailModal
          isOpen={true}
          item={makeShowWithEpisodes(180)}
          serverUrl="http://localhost:8492"
          onPlay={onPlay}
          onClose={vi.fn()}
        />
      </FocusProvider>
    );

    // Zero gap-* classes anywhere in DOM
    const gapElements = Array.from(container.querySelectorAll('*')).filter((el) =>
      Array.from(el.classList).some((cls) => cls.startsWith('gap-'))
    );
    expect(gapElements).toHaveLength(0);

    // Fewer than 30 mounted episode cards instead of 180
    const initialCards = container.querySelectorAll('[id^="episode-card-"]');
    expect(initialCards.length).toBeGreaterThan(0);
    expect(initialCards.length).toBeLessThan(30);

    // Range pills bar with 4 focusable pills
    const pillBar = screen.getByTestId('episode-range-pills');
    expect(pillBar).toBeInTheDocument();
    expect(screen.getByTestId('detail-remote-footer')).toHaveTextContent('±10 Eps');

    const pill0 = document.getElementById('episode-range-pill-0')!;
    const pill50 = document.getElementById('episode-range-pill-50')!;
    const pill100 = document.getElementById('episode-range-pill-100')!;
    const pill150 = document.getElementById('episode-range-pill-150')!;
    expect(pill0).toHaveTextContent('1–50');
    expect(pill50).toHaveTextContent('51–100');
    expect(pill100).toHaveTextContent('101–150');
    expect(pill150).toHaveTextContent('151–180');

    // Focus Season 1 tab, then traverse Down -> pill-0 -> Right -> pill-50 -> Right -> pill-100 -> Enter
    const season1Tab = document.getElementById('season-tab-1')!;
    act(() => {
      season1Tab.focus();
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('season-tab-1');

    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowDown', keyCode: TVKeys.DOWN });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('episode-range-pill-0');
    expect(document.activeElement).toBe(pill0);

    // ArrowLeft clamps at first pill
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowLeft', keyCode: TVKeys.LEFT });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('episode-range-pill-0');

    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('episode-range-pill-50');

    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('episode-range-pill-100');

    // Press OK (Enter) on 101–150 pill -> shifts window and focuses episode-card-101 without trap hijacking
    act(() => {
      fireEvent.keyDown(window, { key: 'Enter', keyCode: TVKeys.ENTER });
    });

    const card101 = document.getElementById('episode-card-101')!;
    expect(card101).not.toBeNull();
    expect(screen.getByTestId('probe-focus').textContent).toBe('episode-card-101');
    expect(document.activeElement).toBe(card101);
    expect(container.querySelectorAll('[id^="episode-card-"]').length).toBeLessThan(30);
    expect(document.getElementById('episode-card-1')).toBeNull();

    // Strip spacers maintain exact horizontal offset
    const strip = card101.parentElement as HTMLElement;
    expect(parseInt(strip.style.paddingLeft || '0', 10)).toBeGreaterThan(0);
    expect(parseInt(strip.style.paddingRight || '0', 10)).toBeGreaterThan(0);

    // Deterministic ArrowRight / ArrowLeft on episode cards & full playlist index preservation
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('episode-card-102');

    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowLeft', keyCode: TVKeys.LEFT });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('episode-card-101');

    // TVKeys.FAST_FORWARD jumps +10 to episode-card-111
    act(() => {
      fireEvent.keyDown(window, { key: 'MediaFastForward', keyCode: TVKeys.FAST_FORWARD });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('episode-card-111');
    expect(document.activeElement).toBe(document.getElementById('episode-card-111'));
    expect(screen.getByTestId('episode-action-strip')).toHaveTextContent('S01E111 • "Episode 111"');

    // TVKeys.REWIND jumps -10 back to episode-card-101
    act(() => {
      fireEvent.keyDown(window, { key: 'MediaRewind', keyCode: TVKeys.REWIND });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('episode-card-101');
    expect(document.activeElement).toBe(document.getElementById('episode-card-101'));

    // Enter on episode-card-101 passes full 180-episode playlist and currentIndex 100
    act(() => {
      fireEvent.keyDown(window, { key: 'Enter', keyCode: TVKeys.ENTER });
    });
    expect(onPlay).toHaveBeenCalledWith(
      101,
      0,
      'Episode 101',
      undefined,
      expect.arrayContaining([{ id: 1, title: 'Episode 1' }, { id: 180, title: 'Episode 180' }]),
      100
    );

    // ArrowDown focuses #episode-action-strip (episode-action-watch-toggle)
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowDown', keyCode: TVKeys.DOWN });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('episode-action-watch-toggle');

    // ArrowUp returns to episode-card-101
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowUp', keyCode: TVKeys.UP });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('episode-card-101');

    // ArrowUp again focuses active episode-range-pill-100
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowUp', keyCode: TVKeys.UP });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('episode-range-pill-100');

    // ArrowUp again focuses season-tab-1
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowUp', keyCode: TVKeys.UP });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('season-tab-1');
  });

  it('mounts window centered on initialFocusedId="episode-card-145" on frame 1 and restores focus directly', () => {
    const { container } = render(
      <FocusProvider>
        <FocusProbe />
        <ItemDetailModal
          isOpen={true}
          item={makeShowWithEpisodes(180)}
          serverUrl="http://localhost:8492"
          initialSelectedSeason={1}
          initialFocusedId="episode-card-145"
          onPlay={vi.fn()}
          onClose={vi.fn()}
        />
      </FocusProvider>
    );

    const card145 = document.getElementById('episode-card-145');
    expect(card145).not.toBeNull();
    expect(screen.getByTestId('probe-focus').textContent).toBe('episode-card-145');
    expect(document.activeElement).toBe(card145);
    expect(document.getElementById('episode-card-1')).toBeNull();

    const mountedCards = container.querySelectorAll('[id^="episode-card-"]');
    expect(mountedCards.length).toBeLessThan(30);

    const strip = card145!.parentElement as HTMLElement;
    expect(parseInt(strip.style.paddingLeft || '0', 10)).toBeGreaterThan(0);
    expect(parseInt(strip.style.paddingRight || '0', 10)).toBeGreaterThan(0);
    expect(document.getElementById('episode-range-pill-100')?.getAttribute('data-active')).toBe(
      'true'
    );
  });

  it('supports FF/REW from range pills, clamps at 0 and max index, and resets range pills on CH_UP to short season', () => {
    const { container } = render(
      <FocusProvider>
        <FocusProbe />
        <ItemDetailModal
          isOpen={true}
          item={makeShowWithEpisodes(180, 5)}
          serverUrl="http://localhost:8492"
          onPlay={vi.fn()}
          onClose={vi.fn()}
        />
      </FocusProvider>
    );

    // Jump to last range pill and activate -> episode 151 (index 150)
    const pill150 = document.getElementById('episode-range-pill-150')!;
    act(() => {
      pill150.focus();
    });
    // FF from range pill jumps +10 from activeEpisodeIndex (0 -> 10 => episode-card-11)
    act(() => {
      fireEvent.keyDown(window, { key: 'MediaFastForward', keyCode: TVKeys.FAST_FORWARD });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('episode-card-11');

    // REW past start clamps at episode-card-1 (10 - 10 = 0, then another REW stays 0)
    act(() => {
      fireEvent.keyDown(window, { key: 'MediaRewind', keyCode: TVKeys.REWIND });
      fireEvent.keyDown(window, { key: 'MediaRewind', keyCode: TVKeys.REWIND });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('episode-card-1');

    // Activate pill-150 then FF 3 times -> clamps cleanly at episode-card-180
    act(() => {
      pill150.focus();
    });
    act(() => {
      fireEvent.keyDown(window, { key: 'Enter', keyCode: TVKeys.ENTER });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('episode-card-151');

    for (let i = 0; i < 4; i++) {
      act(() => {
        fireEvent.keyDown(window, { key: 'MediaFastForward', keyCode: TVKeys.FAST_FORWARD });
      });
    }
    expect(screen.getByTestId('probe-focus').textContent).toBe('episode-card-180');
    expect(document.activeElement).toBe(document.getElementById('episode-card-180'));

    // CH_UP switches to Season 2 (5 episodes <= 30) -> range pills disappear and all 5 cards mount
    act(() => {
      fireEvent.keyDown(window, { key: 'ChannelUp', keyCode: TVKeys.CH_UP });
    });
    expect(screen.queryByTestId('episode-range-pills')).not.toBeInTheDocument();
    expect(container.querySelectorAll('[id^="episode-card-"]')).toHaveLength(5);
  });
});
