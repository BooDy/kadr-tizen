import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { PlayerOSD } from '../../src/components/osd/PlayerOSD';
import { FocusProvider } from '../../src/navigation/FocusContext';
import { TVKeys } from '../../src/navigation/keys';

describe('PlayerOSD', () => {
  it('renders title, player state, and formatted timecodes when visible', () => {
    const { getByText } = render(
      <PlayerOSD
        title="Big Buck Bunny"
        playerState="playing"
        positionMs={65000} // 1:05
        durationMs={600000} // 10:00
        visible={true}
      />
    );

    expect(getByText('Big Buck Bunny')).toBeInTheDocument();
    expect(getByText('playing')).toBeInTheDocument();
    expect(getByText('1:05')).toBeInTheDocument();
    expect(getByText('10:00')).toBeInTheDocument();
  });

  it('renders nothing or hides when visible is false', () => {
    const { queryByText } = render(
      <PlayerOSD
        title="Big Buck Bunny"
        playerState="playing"
        positionMs={65000}
        durationMs={600000}
        visible={false}
      />
    );

    expect(queryByText('Big Buck Bunny')).not.toBeInTheDocument();
  });

  it('correctly calculates progress bar percentage and renders cinema thumb', () => {
    const { container } = render(
      <PlayerOSD
        title="Big Buck Bunny"
        playerState="buffering"
        positionMs={30000}
        durationMs={120000} // 25%
        visible={true}
      />
    );

    const progressBar = container.querySelector('.bg-\\[\\#FF6B00\\]');
    expect(progressBar).toBeInTheDocument();
    expect(progressBar).toHaveStyle({ width: '25%' });

    const thumb = container.querySelector('.bg-\\[\\#FFB800\\]');
    expect(thumb).toBeInTheDocument();
  });

  it('handles 0 duration gracefully without division by zero NaN', () => {
    const { container, getAllByText } = render(
      <PlayerOSD
        title="Big Buck Bunny"
        playerState="idle"
        positionMs={0}
        durationMs={0}
        visible={true}
      />
    );

    const progressBar = container.querySelector('.bg-\\[\\#FF6B00\\]');
    expect(progressBar).toHaveStyle({ width: '0%' });
    expect(getAllByText('0:00')).toHaveLength(2);
  });

  describe('Subtitles Menu & OSD Track Selection', () => {
    const mockSubtitles = [
      {
        id: 1,
        media_item_id: 101,
        source: 'sidecar',
        language: 'en',
        title: 'English (Full)',
        format: 'vtt',
        is_default: true,
        is_forced: false,
        stream_url: '/api/v1/subtitles/1/stream.vtt',
      },
      {
        id: 2,
        media_item_id: 101,
        source: 'sidecar',
        language: 'es',
        title: 'Spanish',
        format: 'vtt',
        is_default: false,
        is_forced: false,
        stream_url: '/api/v1/subtitles/2/stream.vtt',
      },
    ];

    it('does not render Subtitles button when subtitles prop is undefined or empty', () => {
      const { queryByTestId, rerender } = render(
        <PlayerOSD
          title="Big Buck Bunny"
          playerState="playing"
          positionMs={0}
          durationMs={100000}
          visible={true}
        />
      );

      expect(queryByTestId('subtitles-button')).not.toBeInTheDocument();

      rerender(
        <PlayerOSD
          title="Big Buck Bunny"
          playerState="playing"
          positionMs={0}
          durationMs={100000}
          visible={true}
          subtitles={[]}
        />
      );

      expect(queryByTestId('subtitles-button')).not.toBeInTheDocument();
    });

    it('renders Subtitles button when subtitles are provided', () => {
      const { getByTestId, getByText } = render(
        <PlayerOSD
          title="Big Buck Bunny"
          playerState="playing"
          positionMs={0}
          durationMs={100000}
          visible={true}
          subtitles={mockSubtitles}
        />
      );

      const btn = getByTestId('subtitles-button');
      expect(btn).toBeInTheDocument();
      expect(getByText('Subtitles')).toBeInTheDocument();
      expect(getByText('CC')).toBeInTheDocument();
    });

    it('opens popup menu when clicking Subtitles button and lists Off and tracks', () => {
      const { getByTestId, queryByTestId, getByText } = render(
        <PlayerOSD
          title="Big Buck Bunny"
          playerState="playing"
          positionMs={0}
          durationMs={100000}
          visible={true}
          subtitles={mockSubtitles}
          selectedSubtitleId={1}
        />
      );

      expect(queryByTestId('subtitles-popup')).not.toBeInTheDocument();

      fireEvent.click(getByTestId('subtitles-button'));

      const popup = getByTestId('subtitles-popup');
      expect(popup).toBeInTheDocument();
      const panel = popup.querySelector('.bg-\\[\\#3B1111\\]');
      expect(panel).toBeInTheDocument();
      expect(panel?.className).toContain('border-[rgba(245,229,229,0.08)]');

      expect(getByText('Off')).toBeInTheDocument();
      expect(getByText('English (Full)')).toBeInTheDocument();
      expect(getByText('Spanish')).toBeInTheDocument();
    });

    it('calls onSelectSubtitle with track id and closes popup when track is clicked', () => {
      const onSelect = vi.fn();
      const { getByTestId, queryByTestId } = render(
        <PlayerOSD
          title="Big Buck Bunny"
          playerState="playing"
          positionMs={0}
          durationMs={100000}
          visible={true}
          subtitles={mockSubtitles}
          selectedSubtitleId={1}
          onSelectSubtitle={onSelect}
        />
      );

      fireEvent.click(getByTestId('subtitles-button'));
      fireEvent.click(getByTestId('subtitle-option-2'));

      expect(onSelect).toHaveBeenCalledWith(2);
      expect(queryByTestId('subtitles-popup')).not.toBeInTheDocument();
    });

    it('calls onSelectSubtitle with null and closes popup when Off is clicked', () => {
      const onSelect = vi.fn();
      const { getByTestId, queryByTestId } = render(
        <PlayerOSD
          title="Big Buck Bunny"
          playerState="playing"
          positionMs={0}
          durationMs={100000}
          visible={true}
          subtitles={mockSubtitles}
          selectedSubtitleId={1}
          onSelectSubtitle={onSelect}
        />
      );

      fireEvent.click(getByTestId('subtitles-button'));
      fireEvent.click(getByTestId('subtitle-option-off'));

      expect(onSelect).toHaveBeenCalledWith(null);
      expect(queryByTestId('subtitles-popup')).not.toBeInTheDocument();
    });

    it('navigates with ArrowUp / ArrowDown and selects track on Enter', () => {
      const onSelect = vi.fn();
      const { getByTestId, queryByTestId } = render(
        <PlayerOSD
          title="Big Buck Bunny"
          playerState="playing"
          positionMs={0}
          durationMs={100000}
          visible={true}
          subtitles={mockSubtitles}
          selectedSubtitleId={null} // Initial selection is Off (index 0)
          onSelectSubtitle={onSelect}
        />
      );

      fireEvent.click(getByTestId('subtitles-button'));
      expect(getByTestId('subtitles-popup')).toBeInTheDocument();

      // Navigate down to English (Full) (index 1)
      fireEvent.keyDown(window, { key: 'ArrowDown' });
      // Navigate down to Spanish (index 2)
      fireEvent.keyDown(window, { key: 'ArrowDown' });
      // Press Enter
      fireEvent.keyDown(window, { key: 'Enter' });

      expect(onSelect).toHaveBeenCalledWith(2);
      expect(queryByTestId('subtitles-popup')).not.toBeInTheDocument();
    });

    it('closes popup on Escape / Back key without calling onSelectSubtitle', () => {
      const onSelect = vi.fn();
      const { getByTestId, queryByTestId } = render(
        <PlayerOSD
          title="Big Buck Bunny"
          playerState="playing"
          positionMs={0}
          durationMs={100000}
          visible={true}
          subtitles={mockSubtitles}
          selectedSubtitleId={1}
          onSelectSubtitle={onSelect}
        />
      );

      fireEvent.click(getByTestId('subtitles-button'));
      expect(getByTestId('subtitles-popup')).toBeInTheDocument();

      fireEvent.keyDown(window, { key: 'Escape' });

      expect(queryByTestId('subtitles-popup')).not.toBeInTheDocument();
      expect(onSelect).not.toHaveBeenCalled();
    });

    it('integrates with FocusProvider and TVKeys keyCode values', () => {
      const onSelect = vi.fn();
      const { getByTestId, queryByTestId } = render(
        <FocusProvider>
          <PlayerOSD
            title="Big Buck Bunny"
            playerState="playing"
            positionMs={0}
            durationMs={100000}
            visible={true}
            subtitles={mockSubtitles}
            selectedSubtitleId={1}
            onSelectSubtitle={onSelect}
          />
        </FocusProvider>
      );

      fireEvent.click(getByTestId('subtitles-button'));
      expect(getByTestId('subtitles-popup')).toBeInTheDocument();

      fireEvent.keyDown(window, { keyCode: TVKeys.DOWN });
      fireEvent.keyDown(window, { keyCode: TVKeys.ENTER });

      expect(onSelect).toHaveBeenCalledWith(2);
      expect(queryByTestId('subtitles-popup')).not.toBeInTheDocument();
    });

    it('notifies onPopupOpenChange when popup opens and closes', () => {
      const onPopupOpenChange = vi.fn();
      const { getByTestId } = render(
        <PlayerOSD
          title="Big Buck Bunny"
          playerState="playing"
          positionMs={0}
          durationMs={100000}
          visible={true}
          subtitles={mockSubtitles}
          selectedSubtitleId={1}
          onPopupOpenChange={onPopupOpenChange}
        />
      );

      expect(onPopupOpenChange).toHaveBeenCalledWith(false);

      fireEvent.click(getByTestId('subtitles-button'));
      expect(onPopupOpenChange).toHaveBeenCalledWith(true);

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(onPopupOpenChange).toHaveBeenLastCalledWith(false);
    });

    it('keeps popup mounted even if visible prop becomes false while open', () => {
      const { getByTestId, queryByTestId, rerender } = render(
        <PlayerOSD
          title="Big Buck Bunny"
          playerState="playing"
          positionMs={0}
          durationMs={100000}
          visible={true}
          subtitles={mockSubtitles}
          selectedSubtitleId={1}
        />
      );

      fireEvent.click(getByTestId('subtitles-button'));
      expect(getByTestId('subtitles-popup')).toBeInTheDocument();

      // visible becomes false (e.g. OSD timer fires)
      rerender(
        <PlayerOSD
          title="Big Buck Bunny"
          playerState="playing"
          positionMs={0}
          durationMs={100000}
          visible={false}
          subtitles={mockSubtitles}
          selectedSubtitleId={1}
        />
      );

      // Popup must remain mounted!
      expect(getByTestId('subtitles-popup')).toBeInTheDocument();

      // Close popup
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(queryByTestId('subtitles-popup')).not.toBeInTheDocument();
    });
  });
});
