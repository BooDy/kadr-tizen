import { useEffect, useState } from 'react';
import { ApiClient } from '../api/client';
import { parseSubtitles, SubtitleCue } from './subtitles';

/**
 * Downloads and parses the selected subtitle track so it can be rendered by our own overlay.
 * (Tizen AVPlay draws video on a native plane, so <track> elements never show there.)
 */
export interface SubtitleCuesState {
  cues: SubtitleCue[];
  loading: boolean;
  /** Human readable reason when the file could not be downloaded or contained no cues. */
  error: string | null;
}

export function useSubtitleCues(
  apiClient: ApiClient,
  url: string | null,
  format?: string
): SubtitleCuesState {
  const [state, setState] = useState<SubtitleCuesState>({ cues: [], loading: false, error: null });

  useEffect(() => {
    if (!url || typeof apiClient.fetchText !== 'function') {
      setState({ cues: [], loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState({ cues: [], loading: true, error: null });
    apiClient
      .fetchText(url)
      .then((text) => {
        if (cancelled) return;
        const cues = parseSubtitles(text, format);
        setState({
          cues,
          loading: false,
          error: cues.length === 0 ? 'The subtitle file contains no readable lines.' : null,
        });
      })
      .catch((err) => {
        console.warn('[Subtitles] Failed to load subtitle track:', err);
        if (!cancelled) {
          setState({
            cues: [],
            loading: false,
            error: err?.message ? String(err.message) : 'Could not download the subtitle file.',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [apiClient, url, format]);

  return state;
}
