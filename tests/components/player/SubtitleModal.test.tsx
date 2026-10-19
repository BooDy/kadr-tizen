import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { SubtitleModal } from '../../../src/components/player/SubtitleModal';
import { ApiClient } from '../../../src/api/client';
import { TVKeys } from '../../../src/navigation/keys';

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

    vi.spyOn(apiClient, 'fetch').mockImplementation(async (path: string, options?: any) => {
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
});
