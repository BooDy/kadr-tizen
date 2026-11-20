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

  it('correctly calculates progress bar percentage, renders cinema thumb, and omits top-right buffering text while buffering', () => {
    const { container, queryByText } = render(
      <PlayerOSD
        title="Big Buck Bunny"
        playerState="buffering"
        positionMs={30000}
        durationMs={120000} // 25%
        visible={true}
      />
    );

    expect(queryByText(/^buffering$/i)).not.toBeInTheDocument();

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

    it('renders Subtitles button under progress bar when OSD is visible while playing or paused', () => {
      const { getByTestId, rerender } = render(
        <PlayerOSD
          title="Big Buck Bunny"
          playerState="playing"
          positionMs={0}
          durationMs={100000}
          visible={true}
          subtitles={mockSubtitles}
        />
      );

      expect(getByTestId('subtitles-button')).toBeInTheDocument();

      rerender(
        <PlayerOSD
          title="Big Buck Bunny"
          playerState="paused"
          positionMs={0}
          durationMs={100000}
          visible={true}
          subtitles={mockSubtitles}
        />
      );

      expect(getByTestId('subtitles-button')).toBeInTheDocument();
    });

    it('places control buttons container underneath the progress bar and highlights focused item', () => {
      const { getByTestId, rerender } = render(
        <PlayerOSD
          title="Big Buck Bunny"
          playerState="paused"
          positionMs={30000}
          durationMs={100000}
          visible={true}
          subtitles={mockSubtitles}
          hasPrevious={true}
          hasNext={true}
          onPrevious={vi.fn()}
          onNext={vi.fn()}
          focusedItem="progress"
        />
      );

      const bottomSection = getByTestId('player-osd-bottom');
      const progressBar = getByTestId('player-progress-bar');
      const controlsRow = getByTestId('player-osd-controls');

      expect(bottomSection.className).toContain('flex-col');
      expect(progressBar).toHaveAttribute('data-focused', 'true');
      expect(controlsRow).toBeInTheDocument();
      // Progress bar comes before controls row in DOM order
      expect(
        progressBar.compareDocumentPosition(controlsRow) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();

      rerender(
        <PlayerOSD
          title="Big Buck Bunny"
          playerState="paused"
          positionMs={30000}
          durationMs={100000}
          visible={true}
          subtitles={mockSubtitles}
          hasPrevious={true}
          hasNext={true}
          onPrevious={vi.fn()}
          onNext={vi.fn()}
          focusedItem="next"
        />
      );

      expect(getByTestId('player-progress-bar')).toHaveAttribute('data-focused', 'false');
      expect(getByTestId('player-osd-next-btn').className).toContain('tv-focus-ring');
    });

    it('renders Subtitles button next to seek bar when video is paused', () => {
      const { getByTestId, getByText } = render(
        <PlayerOSD
          title="Big Buck Bunny"
          playerState="paused"
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
          playerState="paused"
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
          playerState="paused"
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
          playerState="paused"
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
          playerState="paused"
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
          playerState="paused"
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
            playerState="paused"
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
          playerState="paused"
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
          playerState="paused"
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
          playerState="paused"
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

    it('renders Embedded and Forced badges for MKV embedded streams in subtitle popup', () => {
      const mkvSubtitles = [
        {
          id: 11,
          media_item_id: 101,
          source: 'embedded',
          language: 'ara',
          title: '',
          format: 'srt',
          is_default: false,
          is_forced: true,
          stream_url: '/api/v1/subtitles/11/stream.vtt',
        },
        {
          id: 12,
          media_item_id: 101,
          source: 'embedded',
          language: 'eng',
          title: 'English',
          format: 'srt',
          is_default: true,
          is_forced: false,
          stream_url: '/api/v1/subtitles/12/stream.vtt',
        },
      ];

      const { container, getByTestId, getByText, getAllByText } = render(
        <PlayerOSD
          title="Big Buck Bunny"
          playerState="paused"
          positionMs={0}
          durationMs={100000}
          visible={true}
          subtitles={mkvSubtitles as any}
          selectedSubtitleId={11}
        />
      );

      fireEvent.click(getByTestId('subtitles-button'));

      expect(getByText('Arabic')).toBeInTheDocument();
      expect(getByText('English')).toBeInTheDocument();
      expect(getByText('Forced')).toBeInTheDocument();
      expect(getByText('Active')).toBeInTheDocument();
      const badges = getAllByText('Embedded');
      expect(badges.length).toBe(2);

      const allElements = container.querySelectorAll('*');
      for (const el of Array.from(allElements)) {
        const cls = el.className;
        if (typeof cls === 'string') {
          expect(cls).not.toMatch(/\bgap-\S+/);
        }
      }
    });
  });

  describe('Playlist Navigation (Previous & Next Buttons)', () => {
    it('renders Previous and Next buttons when onPrevious and onNext are provided', () => {
      const onPrev = vi.fn();
      const onNext = vi.fn();

      const { getByTestId, queryByTestId, rerender } = render(
        <PlayerOSD
          title="Episode 2"
          playerState="playing"
          positionMs={10000}
          durationMs={60000}
          visible={true}
          onPrevious={onPrev}
          onNext={onNext}
        />
      );

      const prevBtn = getByTestId('player-osd-previous-btn');
      const nextBtn = getByTestId('player-osd-next-btn');

      expect(prevBtn).toBeInTheDocument();
      expect(nextBtn).toBeInTheDocument();
      expect(prevBtn).toHaveAttribute('id', 'btn-previous-episode');
      expect(nextBtn).toHaveAttribute('id', 'btn-next-episode');
      expect(prevBtn).toHaveTextContent(/prev/i);
      expect(nextBtn).toHaveTextContent(/next/i);

      // Verify buttons are absent when callbacks are omitted
      rerender(
        <PlayerOSD
          title="Episode 2"
          playerState="playing"
          positionMs={10000}
          durationMs={60000}
          visible={true}
        />
      );

      expect(queryByTestId('player-osd-previous-btn')).not.toBeInTheDocument();
      expect(queryByTestId('player-osd-next-btn')).not.toBeInTheDocument();
    });

    it('Previous button is disabled when hasPrevious === false', () => {
      const onPrev = vi.fn();
      const { getByTestId } = render(
        <PlayerOSD
          title="Episode 1"
          playerState="playing"
          positionMs={0}
          durationMs={60000}
          visible={true}
          onPrevious={onPrev}
          hasPrevious={false}
        />
      );

      const prevBtn = getByTestId('player-osd-previous-btn');
      expect(prevBtn).toBeDisabled();
      expect(prevBtn.className).toMatch(/opacity-40|opacity-50/);
      expect(prevBtn.className).toContain('pointer-events-none');

      fireEvent.click(prevBtn);
      expect(onPrev).not.toHaveBeenCalled();
    });

    it('Next button is disabled when hasNext === false', () => {
      const onNext = vi.fn();
      const { getByTestId } = render(
        <PlayerOSD
          title="Episode Finale"
          playerState="playing"
          positionMs={0}
          durationMs={60000}
          visible={true}
          onNext={onNext}
          hasNext={false}
        />
      );

      const nextBtn = getByTestId('player-osd-next-btn');
      expect(nextBtn).toBeDisabled();
      expect(nextBtn.className).toMatch(/opacity-40|opacity-50/);
      expect(nextBtn.className).toContain('pointer-events-none');

      fireEvent.click(nextBtn);
      expect(onNext).not.toHaveBeenCalled();
    });

    it('clicking or pressing Enter on Next/Previous buttons fires onNext and onPrevious', () => {
      const onPrev = vi.fn();
      const onNext = vi.fn();

      const { getByTestId } = render(
        <PlayerOSD
          title="Episode 2"
          playerState="playing"
          positionMs={10000}
          durationMs={60000}
          visible={true}
          hasPrevious={true}
          hasNext={true}
          onPrevious={onPrev}
          onNext={onNext}
        />
      );

      const prevBtn = getByTestId('player-osd-previous-btn');
      const nextBtn = getByTestId('player-osd-next-btn');

      // Click Previous
      fireEvent.click(prevBtn);
      expect(onPrev).toHaveBeenCalledTimes(1);

      // Click Next
      fireEvent.click(nextBtn);
      expect(onNext).toHaveBeenCalledTimes(1);

      // Keyboard Enter on Previous
      fireEvent.keyDown(prevBtn, { key: 'Enter' });
      expect(onPrev).toHaveBeenCalledTimes(2);

      // Keyboard Enter on Next
      fireEvent.keyDown(nextBtn, { key: 'Enter' });
      expect(onNext).toHaveBeenCalledTimes(2);
    });

    it('integrates with FocusProvider and TV D-Pad activation for Next/Previous buttons', () => {
      const onPrev = vi.fn();
      const onNext = vi.fn();

      const { getByTestId } = render(
        <FocusProvider>
          <PlayerOSD
            title="Episode 2"
            playerState="playing"
            positionMs={10000}
            durationMs={60000}
            visible={true}
            hasPrevious={true}
            hasNext={true}
            onPrevious={onPrev}
            onNext={onNext}
          />
        </FocusProvider>
      );

      const prevBtn = getByTestId('player-osd-previous-btn');
      const nextBtn = getByTestId('player-osd-next-btn');

      expect(prevBtn).toHaveAttribute('id', 'btn-previous-episode');
      expect(nextBtn).toHaveAttribute('id', 'btn-next-episode');

      // TV button click
      fireEvent.click(prevBtn);
      expect(onPrev).toHaveBeenCalledTimes(1);

      fireEvent.click(nextBtn);
      expect(onNext).toHaveBeenCalledTimes(1);

      // Direct Enter key
      fireEvent.keyDown(prevBtn, { key: 'Enter', keyCode: TVKeys.ENTER });
      expect(onPrev).toHaveBeenCalledTimes(2);

      fireEvent.keyDown(nextBtn, { key: 'Enter', keyCode: TVKeys.ENTER });
      expect(onNext).toHaveBeenCalledTimes(2);
    });
  });

  describe('Seek Preview Thumbnails & Live Stream Indicator', () => {
    it('renders floating SeekThumbnailPreview anchored inside #player-progress-bar only while isSeeking is true', () => {
      const { getByTestId, queryByTestId, rerender } = render(
        <PlayerOSD
          title="Dune: Part Two"
          playerState="playing"
          positionMs={60000}
          durationMs={240000}
          visible={true}
          isSeeking={false}
        />
      );

      expect(queryByTestId('seek-thumbnail-preview')).not.toBeInTheDocument();

      rerender(
        <PlayerOSD
          title="Dune: Part Two"
          playerState="playing"
          positionMs={60000}
          durationMs={240000}
          visible={true}
          isSeeking={true}
          spriteCrop={{
            sheetIndex: 0,
            tileIndex: 6,
            localIndex: 6,
            col: 6,
            row: 0,
            x: 1920,
            y: 0,
            width: 320,
            height: 180,
            sheetWidth: 3200,
            sheetHeight: 1800,
            sheetUrl: 'http://127.0.0.1:8492/api/v1/media/42/storyboard/0.jpg?token=t',
          }}
        />
      );

      const progressBar = getByTestId('player-progress-bar');
      const preview = getByTestId('seek-thumbnail-preview');
      expect(progressBar.contains(preview)).toBe(true);
      expect(preview).toHaveStyle({ left: '25%' });
      expect(getByTestId('seek-thumbnail-sprite')).toHaveStyle({
        backgroundPosition: '-1920px -0px',
      });
    });

    it('renders LIVE badge instead of scrub thumb or seek preview when isLive is true or durationMs < 0', () => {
      const { container, getByTestId, queryByTestId, rerender } = render(
        <PlayerOSD
          title="News 24 Live"
          playerState="playing"
          positionMs={15000}
          durationMs={0}
          visible={true}
          isLive={true}
          isSeeking={true}
        />
      );

      expect(getByTestId('player-live-badge')).toHaveTextContent('LIVE');
      expect(queryByTestId('seek-thumbnail-preview')).not.toBeInTheDocument();
      // Scrub thumb (.bg-[#FFB800]) must not be rendered on live stream
      expect(container.querySelector('.bg-\\[\\#FFB800\\]')).not.toBeInTheDocument();

      rerender(
        <PlayerOSD
          title="Plugin Live Stream"
          playerState="playing"
          positionMs={0}
          durationMs={-1}
          visible={true}
        />
      );
      expect(getByTestId('player-live-badge')).toHaveTextContent('LIVE');
    });

    it('uses physical margins instead of flex gap-* classes across PlayerOSD for Chromium 69 compatibility', () => {
      const { container, getByTestId } = render(
        <PlayerOSD
          title="Chromium 69 Check"
          playerState="paused"
          positionMs={30000}
          durationMs={120000}
          visible={true}
          isSeeking={true}
          hasPrevious={true}
          hasNext={true}
          onPrevious={vi.fn()}
          onNext={vi.fn()}
          subtitles={[
            {
              id: 1,
              media_item_id: 1,
              source: 'external',
              language: 'en',
              title: 'English',
              format: 'vtt',
              is_default: true,
              is_forced: false,
              stream_url: '/api/v1/subtitles/1/stream.vtt',
            },
          ]}
        />
      );

      fireEvent.click(getByTestId('subtitles-button'));

      const elements = Array.from(container.querySelectorAll('*'));
      for (const el of elements) {
        if (typeof el.className === 'string') {
          expect(el.className).not.toMatch(/\bgap-/);
        }
      }
    });
  });

  describe('Multi-Audio Track Selector Button', () => {
    const twoAudioTracks = [
      {
        audio_index: 0,
        stream_index: 1,
        codec: 'aac',
        channels: 2,
        language: 'jpn',
        is_default: true,
        is_commentary: false,
      },
      {
        audio_index: 1,
        stream_index: 2,
        codec: 'eac3',
        channels: 6,
        language: 'eng',
        is_default: false,
        is_commentary: false,
      },
    ];

    it('hides audio-button when audioTracks is undefined or has length 1', () => {
      const { queryByTestId, rerender } = render(
        <PlayerOSD
          title="Spirited Away"
          playerState="playing"
          positionMs={10000}
          durationMs={120000}
          visible={true}
          onOpenAudioModal={vi.fn()}
        />
      );

      expect(queryByTestId('audio-button')).not.toBeInTheDocument();

      rerender(
        <PlayerOSD
          title="Spirited Away"
          playerState="playing"
          positionMs={10000}
          durationMs={120000}
          visible={true}
          audioTracks={[twoAudioTracks[0]]}
          selectedAudioTrackIndex={0}
          onOpenAudioModal={vi.fn()}
        />
      );

      expect(queryByTestId('audio-button')).not.toBeInTheDocument();
    });

    it('renders audio-button immediately before subtitles-button with active language tag, focus ring, and zero gap-* classes', () => {
      const onOpenAudioModal = vi.fn();
      const { container, getByTestId } = render(
        <PlayerOSD
          title="Spirited Away"
          playerState="paused"
          positionMs={10000}
          durationMs={120000}
          visible={true}
          audioTracks={twoAudioTracks}
          selectedAudioTrackIndex={0}
          onOpenAudioModal={onOpenAudioModal}
          subtitles={[
            {
              id: 1,
              media_item_id: 1,
              source: 'external',
              language: 'eng',
              title: 'English',
              format: 'vtt',
              is_default: true,
              is_forced: false,
              stream_url: '/api/v1/subtitles/1/stream.vtt',
            },
          ]}
          focusedItem="audio"
        />
      );

      const audioBtn = getByTestId('audio-button');
      const subtitlesBtn = getByTestId('subtitles-button');

      expect(audioBtn).toBeInTheDocument();
      expect(audioBtn).toHaveAttribute('id', 'btn-audio');
      expect(audioBtn).toHaveTextContent('AUDIO');
      expect(audioBtn).toHaveTextContent('Audio');
      expect(audioBtn).toHaveTextContent('JPN');
      expect(audioBtn.className).toContain('tv-focus-ring');
      expect(
        audioBtn.compareDocumentPosition(subtitlesBtn) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();

      fireEvent.click(audioBtn);
      expect(onOpenAudioModal).toHaveBeenCalledTimes(1);

      fireEvent.keyDown(audioBtn, { key: 'Enter', keyCode: TVKeys.ENTER });
      expect(onOpenAudioModal).toHaveBeenCalledTimes(2);

      const elements = Array.from(container.querySelectorAll('*'));
      for (const el of elements) {
        if (typeof el.className === 'string') {
          expect(el.className).not.toMatch(/\bgap-/);
        }
      }
    });
  });
});
