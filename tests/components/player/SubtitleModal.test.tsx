import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { SubtitleModal } from '../../../src/components/player/SubtitleModal';
import { ApiClient } from '../../../src/api/client';
import { TVKeys } from '../../../src/navigation/keys';
import { FocusProvider, useFocusContext } from '../../../src/navigation/FocusContext';

function DebugFocus() {
  const { focusedId } = useFocusContext();
  return <div data-testid="debug-focused-id">{focusedId}</div>;
}

const mockTracks = [
  { id: 1, media_item_id: 10, source: 'embedded' as any, language: 'eng', title: 'English [Original]', format: 'srt' as any, is_default: true, is_forced: false, stream_url: '/api/v1/subtitles/1/stream.vtt' },
  { id: 2, media_item_id: 10, source: 'external' as any, language: 'ara', title: 'Arabic', format: 'vtt' as any, is_default: false, is_forced: false, stream_url: '/api/v1/subtitles/2/stream.vtt' },
];

describe('SubtitleModal', () => {
  it('renders track list and allows selecting a subtitle track or Off', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const apiClient = new ApiClient('http://127.0.0.1:8492');

    render(
      <SubtitleModal
        isOpen={true}
        itemId={10}
        apiClient={apiClient}
        subtitles={mockTracks}
        selectedSubtitleId={1}
        onSelectSubtitle={onSelect}
        onClose={onClose}
      />
    );

    expect(screen.getByText('Subtitles')).toBeInTheDocument();
    expect(screen.getByText('Off')).toBeInTheDocument();
    expect(screen.getByText('English [Original] (eng)')).toBeInTheDocument();
    expect(screen.getByText('Arabic (ara)')).toBeInTheDocument();

    // Select Arabic
    fireEvent.click(screen.getByText('Arabic (ara)'));
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it('searches OpenSubtitles by language and downloads chosen subtitle', async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const onSubtitleDownloaded = vi.fn();
    const apiClient = new ApiClient('http://127.0.0.1:8492');

    vi.spyOn(apiClient, 'fetch').mockImplementation(async (path: string, _options?: any) => {
      if (path.includes('/search')) {
        return {
          configured: true,
          matches: [
            {
              file_id: 'os-999',
              language: 'ara',
              format: 'srt',
              title: 'Breaking.Bad.S01E01.Arabic.srt',
              download_count: 1420,
              hearing_impaired: false,
            },
          ],
        } as any;
      }
      if (path.includes('/download')) {
        return {
          id: 3,
          media_item_id: 10,
          source: 'online',
          language: 'ara',
          title: 'Breaking.Bad.S01E01.Arabic.srt',
          format: 'srt',
          is_default: false,
          is_forced: false,
          stream_url: '/api/v1/subtitles/3/stream.vtt',
        } as any;
      }
      return {} as any;
    });

    render(
      <SubtitleModal
        isOpen={true}
        itemId={10}
        apiClient={apiClient}
        subtitles={mockTracks}
        selectedSubtitleId={1}
        onSelectSubtitle={onSelect}
        onSubtitleDownloaded={onSubtitleDownloaded}
        onClose={onClose}
      />
    );

    // Switch to "Search Online" tab
    fireEvent.click(screen.getByText('Search Online'));

    // Pick Arabic language button
    fireEvent.click(screen.getByTestId('lang-btn-ara'));

    await waitFor(() => {
      expect(screen.getByText('Breaking.Bad.S01E01.Arabic.srt')).toBeInTheDocument();
    });

    // Click Download button
    fireEvent.click(screen.getByText('Download & Activate'));

    await waitFor(() => {
      expect(onSubtitleDownloaded).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }));
      expect(onSelect).toHaveBeenCalledWith(3);
    });
  });

  it('closes on Escape or TV Remote Back key', () => {
    const onClose = vi.fn();
    const apiClient = new ApiClient('http://127.0.0.1:8492');

    render(
      <SubtitleModal
        isOpen={true}
        itemId={10}
        apiClient={apiClient}
        subtitles={mockTracks}
        selectedSubtitleId={1}
        onSelectSubtitle={vi.fn()}
        onClose={onClose}
      />
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { keyCode: TVKeys.BACK_TIZEN });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('displays error if OpenSubtitles is not configured', async () => {
    const apiClient = new ApiClient('http://127.0.0.1:8492');
    vi.spyOn(apiClient, 'fetch').mockImplementation(async (path: string) => {
      if (path.includes('/search')) {
        return {
          configured: false,
          matches: [],
        } as any;
      }
      return {} as any;
    });

    render(
      <SubtitleModal
        isOpen={true}
        itemId={10}
        apiClient={apiClient}
        subtitles={mockTracks}
        selectedSubtitleId={1}
        onSelectSubtitle={vi.fn()}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('Search Online'));

    await waitFor(() => {
      expect(screen.getByText('OpenSubtitles is not configured on the server.')).toBeInTheDocument();
    });
  });

  it('supports TV remote D-Pad navigation (ArrowUp/ArrowDown) and Enter key selection with FocusProvider', async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const apiClient = new ApiClient('http://127.0.0.1:8492');

    render(
      <FocusProvider>
        <SubtitleModal
          isOpen={true}
          itemId={10}
          apiClient={apiClient}
          subtitles={mockTracks}
          selectedSubtitleId={null} // Off is initial selection
          onSelectSubtitle={onSelect}
          onClose={onClose}
        />
        <DebugFocus />
      </FocusProvider>
    );

    // Initial focus is on Off track (order 10)
    await waitFor(() => {
      expect(screen.getByTestId('debug-focused-id').textContent).toBe('sub-track-off');
      const offBtn = screen.getByTestId('subtitle-option-off');
      expect(offBtn.className).toContain('tv-focus-ring');
    });

    // Press ArrowDown to navigate to English track (order 11)
    act(() => {
      fireEvent.keyDown(window, { keyCode: TVKeys.DOWN, key: 'ArrowDown' });
    });
    await waitFor(() => {
      expect(screen.getByTestId('debug-focused-id').textContent).toBe('sub-track-1');
      const engBtn = screen.getByTestId('subtitle-option-1');
      expect(engBtn.className).toContain('tv-focus-ring');
    });

    // Press ArrowDown to navigate to Arabic track (order 12)
    act(() => {
      fireEvent.keyDown(window, { keyCode: TVKeys.DOWN, key: 'ArrowDown' });
    });
    await waitFor(() => {
      const araBtn = screen.getByTestId('subtitle-option-2');
      expect(araBtn.className).toContain('tv-focus-ring');
    });

    // Press Enter to select Arabic track
    act(() => {
      fireEvent.keyDown(window, { keyCode: TVKeys.ENTER, key: 'Enter' });
    });
    expect(onSelect).toHaveBeenCalledWith(2);
    expect(onClose).toHaveBeenCalled();
  });

  it('supports TV remote D-Pad navigation across tabs and language buttons', async () => {
    const apiClient = new ApiClient('http://127.0.0.1:8492');
    vi.spyOn(apiClient, 'fetch').mockImplementation(async (path: string) => {
      if (path.includes('/search')) {
        return {
          configured: true,
          matches: [
            {
              file_id: 'os-123',
              language: 'eng',
              format: 'srt',
              title: 'Sample.English.srt',
              download_count: 42,
              hearing_impaired: false,
            },
          ],
        } as any;
      }
      return {} as any;
    });

    render(
      <FocusProvider>
        <SubtitleModal
          isOpen={true}
          itemId={10}
          apiClient={apiClient}
          subtitles={mockTracks}
          selectedSubtitleId={1}
          onSelectSubtitle={vi.fn()}
          onClose={vi.fn()}
        />
      </FocusProvider>
    );

    // Switch to search tab by clicking Search Online
    act(() => {
      fireEvent.click(screen.getByText('Search Online'));
    });

    // Focus automatically shifts to the first language button: eng
    await waitFor(() => {
      const engLangBtn = screen.getByTestId('lang-btn-eng');
      expect(engLangBtn.className).toContain('tv-focus-ring');
    });

    // Press ArrowRight to navigate to Arabic language button
    act(() => {
      fireEvent.keyDown(window, { keyCode: TVKeys.RIGHT, key: 'ArrowRight' });
    });
    await waitFor(() => {
      const araLangBtn = screen.getByTestId('lang-btn-ara');
      expect(araLangBtn.className).toContain('tv-focus-ring');
    });
  });

  it('falls back to file_name or Subtitle {file_id} when match title is missing during download', async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const apiClient = new ApiClient('http://127.0.0.1:8492');
    let capturedBody: any = null;

    vi.spyOn(apiClient, 'fetch').mockImplementation(async (path: string, options?: any) => {
      if (path.includes('/search')) {
        return {
          configured: true,
          matches: [
            {
              file_id: 'os-fallback-1',
              language: 'eng',
              format: 'srt',
              file_name: 'Fallback.FileName.srt',
              download_count: 50,
              hearing_impaired: false,
            },
          ],
        } as any;
      }
      if (path.includes('/download')) {
        capturedBody = JSON.parse(options.body);
        return {
          id: 4,
          media_item_id: 10,
          source: 'online',
          language: capturedBody.language,
          title: capturedBody.title,
          format: 'srt',
          is_default: false,
          is_forced: false,
          stream_url: '/api/v1/subtitles/4/stream.vtt',
        } as any;
      }
      return {} as any;
    });

    render(
      <SubtitleModal
        isOpen={true}
        itemId={10}
        apiClient={apiClient}
        subtitles={mockTracks}
        selectedSubtitleId={1}
        onSelectSubtitle={onSelect}
        onClose={onClose}
      />
    );

    // Switch to "Search Online" tab
    fireEvent.click(screen.getByText('Search Online'));

    // Search English
    fireEvent.click(screen.getByTestId('lang-btn-eng'));

    await waitFor(() => {
      expect(screen.getByText('Fallback.FileName.srt')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Download & Activate'));

    await waitFor(() => {
      expect(capturedBody).toEqual({
        file_id: 'os-fallback-1',
        language: 'eng',
        title: 'Fallback.FileName.srt',
        is_forced: false,
      });
    });
  });
});


describe('SubtitleModal appearance settings', () => {
  const baseSettings = { fontSize: 'medium', color: 'white', placement: 'bottom' } as const;

  it('hides the Appearance tab when no settings handler is provided', () => {
    render(
      <SubtitleModal
        isOpen={true}
        itemId={10}
        apiClient={new ApiClient('http://127.0.0.1:8492')}
        subtitles={mockTracks}
        selectedSubtitleId={1}
        onSelectSubtitle={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByText('Appearance')).not.toBeInTheDocument();
  });

  it('lets the user change font size, color and placement with a live preview', () => {
    const onChangeSettings = vi.fn();
    const { rerender } = render(
      <SubtitleModal
        isOpen={true}
        itemId={10}
        apiClient={new ApiClient('http://127.0.0.1:8492')}
        subtitles={mockTracks}
        selectedSubtitleId={1}
        onSelectSubtitle={vi.fn()}
        settings={{ ...baseSettings }}
        onChangeSettings={onChangeSettings}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('Appearance'));
    expect(screen.getByTestId('subtitle-appearance-panel')).toBeInTheDocument();

    // Preview reflects the current settings (42px * 0.25 scale)
    expect(screen.getByTestId('subtitle-overlay-text').style.fontSize).toBe('10.5px');

    fireEvent.click(screen.getByTestId('sub-set-size-xlarge'));
    expect(onChangeSettings).toHaveBeenLastCalledWith({ ...baseSettings, fontSize: 'xlarge' });

    fireEvent.click(screen.getByTestId('sub-set-color-yellow'));
    expect(onChangeSettings).toHaveBeenLastCalledWith({ ...baseSettings, color: 'yellow' });

    fireEvent.click(screen.getByTestId('sub-set-place-top'));
    expect(onChangeSettings).toHaveBeenLastCalledWith({ ...baseSettings, placement: 'top' });

    // Preview updates when the parent applies new settings
    rerender(
      <SubtitleModal
        isOpen={true}
        itemId={10}
        apiClient={new ApiClient('http://127.0.0.1:8492')}
        subtitles={mockTracks}
        selectedSubtitleId={1}
        onSelectSubtitle={vi.fn()}
        settings={{ fontSize: 'xlarge', color: 'yellow', placement: 'top' }}
        onChangeSettings={onChangeSettings}
        onClose={vi.fn()}
      />
    );
    const previewText = screen.getByTestId('subtitle-overlay-text');
    expect(previewText.style.fontSize).toBe('16px');
    expect(screen.getByTestId('subtitle-overlay').style.top).toBe('16px');
  });
});

describe('SubtitleModal timing adjustment', () => {
  const renderModal = (props: Partial<React.ComponentProps<typeof SubtitleModal>> = {}) =>
    render(
      <SubtitleModal
        isOpen={true}
        itemId={10}
        apiClient={new ApiClient('http://127.0.0.1:8492')}
        subtitles={mockTracks}
        selectedSubtitleId={1}
        onSelectSubtitle={vi.fn()}
        onClose={vi.fn()}
        {...props}
      />
    );

  it('hides the Timing tab without a handler or when no track is selected', () => {
    const { unmount } = renderModal();
    expect(screen.queryByText('Timing')).not.toBeInTheDocument();
    unmount();

    renderModal({ onChangeDelay: vi.fn(), selectedSubtitleId: null });
    expect(screen.queryByText('Timing')).not.toBeInTheDocument();
  });

  it('adjusts the delay in 0.1s / 1s / 5s steps in both directions and can reset it', () => {
    const onChangeDelay = vi.fn();
    renderModal({ onChangeDelay, delayMs: 1500 });

    fireEvent.click(screen.getByText('Timing'));
    expect(screen.getByTestId('subtitle-timing-panel')).toBeInTheDocument();
    expect(screen.getByTestId('subtitle-delay-value').textContent).toBe('+1.5s');

    fireEvent.click(screen.getByTestId('sub-delay-plus-100'));
    expect(onChangeDelay).toHaveBeenLastCalledWith(1600);
    fireEvent.click(screen.getByTestId('sub-delay-minus-100'));
    expect(onChangeDelay).toHaveBeenLastCalledWith(1400);
    fireEvent.click(screen.getByTestId('sub-delay-plus-1000'));
    expect(onChangeDelay).toHaveBeenLastCalledWith(2500);
    fireEvent.click(screen.getByTestId('sub-delay-minus-1000'));
    expect(onChangeDelay).toHaveBeenLastCalledWith(500);
    fireEvent.click(screen.getByTestId('sub-delay-plus-5000'));
    expect(onChangeDelay).toHaveBeenLastCalledWith(6500);
    fireEvent.click(screen.getByTestId('sub-delay-minus-5000'));
    expect(onChangeDelay).toHaveBeenLastCalledWith(-3500);

    fireEvent.click(screen.getByTestId('sub-delay-reset'));
    expect(onChangeDelay).toHaveBeenLastCalledWith(0);
  });

  it('shows a negative delay and disables reset when already at 0', () => {
    const { unmount } = renderModal({ onChangeDelay: vi.fn(), delayMs: -2300 });
    fireEvent.click(screen.getByText('Timing'));
    expect(screen.getByTestId('subtitle-delay-value').textContent).toBe('-2.3s');
    expect(screen.getByText(/appear earlier/i)).toBeInTheDocument();
    unmount();

    renderModal({ onChangeDelay: vi.fn(), delayMs: 0 });
    fireEvent.click(screen.getByText('Timing'));
    expect(screen.getByTestId('sub-delay-reset')).toBeDisabled();
  });
});

describe('SubtitleModal keyboard Back navigation', () => {
  it('allows Backspace to edit text input without closing modal', () => {
    const onClose = vi.fn();
    render(
      <FocusProvider>
        <SubtitleModal
          isOpen={true}
          itemId={10}
          apiClient={new ApiClient('http://127.0.0.1:8492')}
          subtitles={mockTracks}
          selectedSubtitleId={1}
          onSelectSubtitle={vi.fn()}
          onClose={onClose}
        />
        <input data-testid="temp-input" defaultValue="search" />
      </FocusProvider>
    );

    const input = screen.getByTestId('temp-input') as HTMLInputElement;
    input.focus();
    expect(document.activeElement).toBe(input);

    fireEvent.keyDown(input, { key: 'Backspace', keyCode: TVKeys.BACKSPACE });
    expect(onClose).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(input);
  });

  it('blurs active text input on BACK_TIZEN / Escape without closing modal, and closes on second Back', () => {
    const onClose = vi.fn();
    render(
      <FocusProvider>
        <SubtitleModal
          isOpen={true}
          itemId={10}
          apiClient={new ApiClient('http://127.0.0.1:8492')}
          subtitles={mockTracks}
          selectedSubtitleId={1}
          onSelectSubtitle={vi.fn()}
          onClose={onClose}
        />
        <input data-testid="temp-input" defaultValue="search" />
      </FocusProvider>
    );

    const input = screen.getByTestId('temp-input') as HTMLInputElement;
    input.focus();
    expect(document.activeElement).toBe(input);

    // First Back blurs input without calling onClose
    fireEvent.keyDown(window, { keyCode: TVKeys.BACK_TIZEN, key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(input);

    // Second Back closes modal
    fireEvent.keyDown(window, { keyCode: TVKeys.BACK_TIZEN, key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores Back key when activeTrap does not match subtitle-modal', () => {
    const onClose = vi.fn();
    function TrapTest() {
      const { pushTrap } = useFocusContext();
      return (
        <div>
          <button onClick={() => pushTrap('foreign-trap')} data-testid="push-foreign">Push</button>
          <SubtitleModal
            isOpen={true}
            itemId={10}
            apiClient={new ApiClient('http://127.0.0.1:8492')}
            subtitles={mockTracks}
            selectedSubtitleId={1}
            onSelectSubtitle={vi.fn()}
            onClose={onClose}
          />
        </div>
      );
    }
    render(
      <FocusProvider>
        <TrapTest />
      </FocusProvider>
    );

    fireEvent.click(screen.getByTestId('push-foreign'));
    fireEvent.keyDown(window, { keyCode: TVKeys.BACK_TIZEN, key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('stops immediate propagation on Back in capture phase to prevent bubbling window listeners from firing', () => {
    const onClose = vi.fn();
    const bubbleListener = vi.fn();
    window.addEventListener('keydown', bubbleListener, false);

    render(
      <FocusProvider>
        <SubtitleModal
          isOpen={true}
          itemId={10}
          apiClient={new ApiClient('http://127.0.0.1:8492')}
          subtitles={mockTracks}
          selectedSubtitleId={1}
          onSelectSubtitle={vi.fn()}
          onClose={onClose}
        />
      </FocusProvider>
    );

    fireEvent.keyDown(window, { keyCode: TVKeys.BACK_TIZEN, key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(bubbleListener).not.toHaveBeenCalled();

    window.removeEventListener('keydown', bubbleListener, false);
  });

  it('renders Embedded, Forced, and Default badges and human-readable fallback titles for untitled MKV streams', () => {
    const tracks = [
      {
        id: 101,
        media_item_id: 10,
        source: 'embedded' as const,
        language: 'ara',
        title: '',
        format: 'srt' as const,
        is_default: false,
        is_forced: true,
        stream_url: '/api/v1/subtitles/101/stream.vtt',
      },
      {
        id: 102,
        media_item_id: 10,
        source: 'embedded' as const,
        language: 'eng',
        title: 'English SDH',
        format: 'srt' as const,
        is_default: true,
        is_forced: false,
        stream_url: '/api/v1/subtitles/102/stream.vtt',
      },
    ];

    const { container } = render(
      <SubtitleModal
        isOpen={true}
        itemId={10}
        apiClient={new ApiClient('http://127.0.0.1:8492')}
        subtitles={tracks as any}
        selectedSubtitleId={101}
        onSelectSubtitle={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('Arabic (ara)')).toBeInTheDocument();
    expect(screen.getAllByText('Embedded').length).toBe(2);
    expect(screen.getByText('Forced')).toBeInTheDocument();
    expect(screen.getByText('Default')).toBeInTheDocument();

    const trackRow = screen.getByTestId('subtitle-option-101');
    expect(trackRow).toHaveTextContent('Arabic (ara)');
    expect(trackRow).toHaveTextContent('Embedded');
    expect(trackRow).toHaveTextContent('Forced');

    const allElements = container.querySelectorAll('*');
    for (const el of Array.from(allElements)) {
      const cls = el.className;
      if (typeof cls === 'string') {
        expect(cls).not.toMatch(/\bgap-\S+/);
      }
    }
  });
});
