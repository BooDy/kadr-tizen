import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseSubtitles,
  findActiveCueText,
  normalizeSubtitleLanguageCode,
  getSubtitleLanguageName,
  formatSubtitleTrackLabel,
} from '../../src/player/subtitles';
import {
  DEFAULT_SUBTITLE_SETTINGS,
  SUBTITLE_STORAGE_KEY,
  loadSubtitleSettings,
  saveSubtitleSettings,
  SUBTITLE_DELAY_STORAGE_KEY,
  clampSubtitleDelay,
  formatSubtitleDelay,
  loadSubtitleDelays,
  saveSubtitleDelays,
  loadSubtitlePreference,
  saveSubtitlePreference,
  pickInitialSubtitleTrack,
} from '../../src/player/subtitleSettings';
import { SubtitleTrack } from '../../src/types/kadr';

describe('parseSubtitles', () => {
  it('parses WebVTT cues with header, ids, tags and entities', () => {
    const vtt = `WEBVTT

NOTE a comment block

1
00:00:01.000 --> 00:00:03.500
<i>Hello</i> &amp; welcome

00:01:02.250 --> 00:01:04.000 align:middle
Line one
Line two
`;
    const cues = parseSubtitles(vtt, 'vtt');
    expect(cues).toEqual([
      { startMs: 1000, endMs: 3500, text: 'Hello & welcome' },
      { startMs: 62250, endMs: 64000, text: 'Line one\nLine two' },
    ]);
  });

  it('parses SRT with comma milliseconds, CRLF line endings, BOM and hours', () => {
    const srt = '\uFEFF1\r\n01:02:03,004 --> 01:02:05,000\r\n{\\an8}Top line\r\n\r\n2\r\n00:00:00,500 --> 00:00:01,000\r\nFirst\r\n';
    const cues = parseSubtitles(srt, 'srt');
    expect(cues).toEqual([
      { startMs: 500, endMs: 1000, text: 'First' },
      { startMs: 3723004, endMs: 3725000, text: 'Top line' },
    ]);
  });

  it('parses ASS dialogue lines honouring commas inside the text', () => {
    const ass = `[Script Info]
Title: test

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:05.00,0:00:07.50,Default,,0,0,0,,{\\i1}Well, hello\\Nthere
`;
    expect(parseSubtitles(ass, 'ass')).toEqual([
      { startMs: 5000, endMs: 7500, text: 'Well, hello\nthere' },
    ]);
  });

  it('returns an empty list for empty / invalid input', () => {
    expect(parseSubtitles('')).toEqual([]);
    expect(parseSubtitles('not a subtitle file')).toEqual([]);
  });
});

describe('findActiveCueText', () => {
  const cues = [
    { startMs: 1000, endMs: 3000, text: 'A' },
    { startMs: 2000, endMs: 4000, text: 'B' },
    { startMs: 10000, endMs: 12000, text: 'C' },
  ];

  it('returns the active cue, joins overlapping cues and is empty between cues', () => {
    expect(findActiveCueText(cues, 500)).toBe('');
    expect(findActiveCueText(cues, 1500)).toBe('A');
    expect(findActiveCueText(cues, 2500)).toBe('A\nB');
    expect(findActiveCueText(cues, 3500)).toBe('B');
    expect(findActiveCueText(cues, 5000)).toBe('');
    expect(findActiveCueText(cues, 11000)).toBe('C');
    expect(findActiveCueText(cues, 12000)).toBe('');
    expect(findActiveCueText([], 1000)).toBe('');
  });
});

describe('subtitle settings persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults when nothing is stored or storage is corrupt', () => {
    expect(loadSubtitleSettings()).toEqual(DEFAULT_SUBTITLE_SETTINGS);
    localStorage.setItem(SUBTITLE_STORAGE_KEY, '{not json');
    expect(loadSubtitleSettings()).toEqual(DEFAULT_SUBTITLE_SETTINGS);
  });

  it('round-trips saved settings and sanitises unknown values', () => {
    saveSubtitleSettings({ fontSize: 'xlarge', color: 'yellow', placement: 'top' });
    expect(loadSubtitleSettings()).toEqual({ fontSize: 'xlarge', color: 'yellow', placement: 'top' });

    localStorage.setItem(
      SUBTITLE_STORAGE_KEY,
      JSON.stringify({ fontSize: 'huge', color: 'pink', placement: 'middle' })
    );
    expect(loadSubtitleSettings()).toEqual(DEFAULT_SUBTITLE_SETTINGS);
  });
});

describe('subtitle delay helpers', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('formats delays with an explicit sign', () => {
    expect(formatSubtitleDelay(0)).toBe('0.0s');
    expect(formatSubtitleDelay(1500)).toBe('+1.5s');
    expect(formatSubtitleDelay(-200)).toBe('-0.2s');
    expect(formatSubtitleDelay(-5000)).toBe('-5.0s');
  });

  it('rounds to 100ms steps and clamps to +/-5 minutes', () => {
    expect(clampSubtitleDelay(149)).toBe(100);
    expect(clampSubtitleDelay(151)).toBe(200);
    expect(clampSubtitleDelay(10_000_000)).toBe(300000);
    expect(clampSubtitleDelay(-10_000_000)).toBe(-300000);
    expect(clampSubtitleDelay(NaN)).toBe(0);
  });

  it('persists per-track delays and ignores corrupt or zero entries', () => {
    saveSubtitleDelays({ '7': 1500, '9': -2000 });
    expect(loadSubtitleDelays()).toEqual({ '7': 1500, '9': -2000 });

    localStorage.setItem(SUBTITLE_DELAY_STORAGE_KEY, JSON.stringify({ '1': 0, '2': 'x', '3': 400 }));
    expect(loadSubtitleDelays()).toEqual({ '3': 400 });

    localStorage.setItem(SUBTITLE_DELAY_STORAGE_KEY, '{oops');
    expect(loadSubtitleDelays()).toEqual({});
  });
});

describe('MKV embedded subtitle helpers & preference selection', () => {
  it('strips ASS vector drawing blocks and unescapes hard spaces without dropping dialogue', () => {
    const ass = `[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.00,Signs,,0,0,0,,{\\p1}m 0 0 l 100 0 100 100 0 100{\\p0}
Dialogue: 0,0:00:01.50,0:00:03.50,Default,,0,0,0,,{\\an8}مرحبا\\hبالعالم!`;

    const cues = parseSubtitles(ass, 'ass');
    expect(cues).toEqual([
      { startMs: 1500, endMs: 3500, text: 'مرحبا بالعالم!' },
    ]);
  });

  it('normalizes ISO language codes and formats untitled vs titled MKV tracks cleanly', () => {
    expect(normalizeSubtitleLanguageCode('ar')).toBe('ara');
    expect(normalizeSubtitleLanguageCode('en-US')).toBe('eng');
    expect(getSubtitleLanguageName('ara')).toBe('Arabic');

    expect(
      formatSubtitleTrackLabel({ id: 4, language: 'ara', title: '' })
    ).toBe('Arabic (ara)');
    expect(
      formatSubtitleTrackLabel({ id: 1, language: 'eng', title: 'English [Original]' })
    ).toBe('English [Original] (eng)');
    expect(
      formatSubtitleTrackLabel({ id: 7, language: 'und', title: '' })
    ).toBe('Track 7');
  });

  it('persists SubtitlePreference and picks matching language, Off, or fallback default track', () => {
    localStorage.clear();
    expect(loadSubtitlePreference()).toEqual({ mode: 'auto' });

    const tracks: SubtitleTrack[] = [
      {
        id: 11,
        media_item_id: 1,
        source: 'embedded',
        language: 'eng',
        title: 'English [Signs & Songs]',
        format: 'ass',
        is_default: true,
        is_forced: true,
        stream_url: '/api/v1/subtitles/11/stream.vtt',
      },
      {
        id: 12,
        media_item_id: 1,
        source: 'embedded',
        language: 'ara',
        title: 'Arabic',
        format: 'srt',
        is_default: false,
        is_forced: false,
        stream_url: '/api/v1/subtitles/12/stream.vtt',
      },
      {
        id: 13,
        media_item_id: 1,
        source: 'embedded',
        language: 'eng',
        title: 'English',
        format: 'srt',
        is_default: false,
        is_forced: false,
        stream_url: '/api/v1/subtitles/13/stream.vtt',
      },
    ];

    // Auto mode selects container default
    expect(pickInitialSubtitleTrack(tracks, { mode: 'auto' })).toBe(11);

    // Off mode keeps subtitles off
    saveSubtitlePreference({ mode: 'off' });
    expect(pickInitialSubtitleTrack(tracks, loadSubtitlePreference())).toBeNull();

    // Language mode matches 'ar' <-> 'ara'
    saveSubtitlePreference({ mode: 'language', language: 'ar', preferForced: false });
    expect(pickInitialSubtitleTrack(tracks, loadSubtitlePreference())).toBe(12);

    // Non-forced English preference prefers full dialogue (13) over forced Signs & Songs (11)
    expect(
      pickInitialSubtitleTrack(tracks, { mode: 'language', language: 'eng', preferForced: false })
    ).toBe(13);

    // Missing language preference falls back cleanly to container default track (11)
    expect(
      pickInitialSubtitleTrack(tracks, { mode: 'language', language: 'jpn', preferForced: false })
    ).toBe(11);

    // Missing language preference with no default track returns null
    const noDefaultTracks = tracks.map((t) => ({ ...t, is_default: false }));
    expect(
      pickInitialSubtitleTrack(noDefaultTracks, { mode: 'language', language: 'jpn', preferForced: false })
    ).toBeNull();
  });
});
