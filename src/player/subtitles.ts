import type { SubtitleTrack } from '../types/kadr';

export interface SubtitleCue {
  startMs: number;
  endMs: number;
  text: string;
}

const TIME_RE = /(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/;

function parseTimestamp(raw: string): number | null {
  const m = TIME_RE.exec(raw.trim());
  if (!m) return null;
  const hours = m[1] ? parseInt(m[1], 10) : 0;
  const minutes = parseInt(m[2], 10);
  const seconds = parseInt(m[3], 10);
  const millis = parseInt(m[4].padEnd(3, '0'), 10);
  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + millis;
}

function cleanText(text: string): string {
  return text
    .replace(/\{\\p[1-9]\d*\}[\s\S]*?(?:\{\\p0\}|$)/gi, '') // Strip ASS vector drawing polygons
    .replace(/\{[^}]*\}/g, '') // ASS-style override tags such as {\an8}
    .replace(/\\h/g, ' ') // ASS hard space
    .replace(/<[^>]+>/g, '') // <i>, <b>, <font ...>, WebVTT voice/cue tags
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join('\n');
}

/** ASS/SSA "H:MM:SS.cc" -> ms */
function parseAssTime(raw: string): number | null {
  const m = /^(\d+):(\d{2}):(\d{2})[.](\d{1,3})$/.exec(raw.trim());
  if (!m) return null;
  const frac = m[4].length === 3 ? parseInt(m[4], 10) : parseInt(m[4], 10) * (m[4].length === 2 ? 10 : 100);
  return ((parseInt(m[1], 10) * 60 + parseInt(m[2], 10)) * 60 + parseInt(m[3], 10)) * 1000 + frac;
}

function parseAss(raw: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  let startIdx = 1;
  let endIdx = 2;
  let textIdx = 9;
  let fieldCount = 10;
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (/^Format:/i.test(trimmed) && /Start/i.test(trimmed) && /Text/i.test(trimmed)) {
      const fields = trimmed
        .slice(trimmed.indexOf(':') + 1)
        .split(',')
        .map((f) => f.trim().toLowerCase());
      startIdx = fields.indexOf('start');
      endIdx = fields.indexOf('end');
      textIdx = fields.indexOf('text');
      fieldCount = fields.length;
      continue;
    }
    if (!/^Dialogue:/i.test(trimmed)) continue;
    const parts = trimmed.slice(trimmed.indexOf(':') + 1).split(',');
    if (parts.length < fieldCount) continue;
    const start = parseAssTime(parts[startIdx]);
    const end = parseAssTime(parts[endIdx]);
    if (start === null || end === null) continue;
    const text = cleanText(parts.slice(textIdx).join(',').replace(/\\N/gi, '\n'));
    if (text) cues.push({ startMs: start, endMs: end, text });
  }
  return cues;
}

/** Parse SRT, WebVTT or ASS/SSA subtitle text into time-sorted cues. */
export function parseSubtitles(input: string, format?: string): SubtitleCue[] {
  if (!input) return [];
  const raw = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const fmt = (format || '').toLowerCase();

  let cues: SubtitleCue[];
  if (fmt === 'ass' || fmt === 'ssa' || /^\[Script Info\]/im.test(raw) || /^Dialogue:/m.test(raw)) {
    cues = parseAss(raw);
  } else {
    cues = [];
    for (const block of raw.split(/\n{2,}/)) {
      const lines = block.split('\n');
      const timeLineIdx = lines.findIndex((l) => l.includes('-->'));
      if (timeLineIdx === -1) continue;
      const [startRaw, endRaw] = lines[timeLineIdx].split('-->');
      const start = parseTimestamp(startRaw);
      const end = parseTimestamp(endRaw || '');
      if (start === null || end === null) continue;
      const text = cleanText(lines.slice(timeLineIdx + 1).join('\n'));
      if (text) cues.push({ startMs: start, endMs: end, text });
    }
  }

  return cues.sort((a, b) => a.startMs - b.startMs);
}

/** Text of every cue active at `posMs` (overlapping cues are joined by newline). */
export function findActiveCueText(cues: SubtitleCue[], posMs: number): string {
  if (cues.length === 0) return '';
  // Binary search for the last cue starting at or before posMs
  let lo = 0;
  let hi = cues.length - 1;
  let idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].startMs <= posMs) {
      idx = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (idx === -1) return '';
  const active: string[] = [];
  for (let i = idx; i >= 0 && i > idx - 8; i--) {
    if (cues[i].endMs > posMs) active.unshift(cues[i].text);
  }
  return active.join('\n');
}

/* ------------------------------------------------------------------ */
/* ISO-639 language code normalization and track label formatting      */
/* ------------------------------------------------------------------ */

const KNOWN_LANGUAGE_MAP: Record<string, string> = {
  en: 'eng',
  eng: 'eng',
  english: 'eng',
  ar: 'ara',
  ara: 'ara',
  arabic: 'ara',
  fr: 'fre',
  fre: 'fre',
  fra: 'fre',
  french: 'fre',
  es: 'spa',
  spa: 'spa',
  spanish: 'spa',
  de: 'ger',
  ger: 'ger',
  deu: 'ger',
  german: 'ger',
  it: 'ita',
  ita: 'ita',
  italian: 'ita',
  ja: 'jpn',
  jpn: 'jpn',
  japanese: 'jpn',
  ko: 'kor',
  kor: 'kor',
  korean: 'kor',
  zh: 'chi',
  chi: 'chi',
  zho: 'chi',
  chinese: 'chi',
  ru: 'rus',
  rus: 'rus',
  russian: 'rus',
  tr: 'tur',
  tur: 'tur',
  turkish: 'tur',
  pt: 'por',
  por: 'por',
  portuguese: 'por',
  hi: 'hin',
  hin: 'hin',
  hindi: 'hin',
  nl: 'dut',
  dut: 'dut',
  nld: 'dut',
  dutch: 'dut',
  sv: 'swe',
  swe: 'swe',
  swedish: 'swe',
  no: 'nor',
  nor: 'nor',
  norwegian: 'nor',
  da: 'dan',
  dan: 'dan',
  danish: 'dan',
  fi: 'fin',
  fin: 'fin',
  finnish: 'fin',
  pl: 'pol',
  pol: 'pol',
  polish: 'pol',
  el: 'gre',
  gre: 'gre',
  ell: 'gre',
  greek: 'gre',
  he: 'heb',
  heb: 'heb',
  iw: 'heb',
  hebrew: 'heb',
  id: 'ind',
  ind: 'ind',
  indonesian: 'ind',
  th: 'tha',
  tha: 'tha',
  thai: 'tha',
  vi: 'vie',
  vie: 'vie',
  vietnamese: 'vie',
  uk: 'ukr',
  ukr: 'ukr',
  ukrainian: 'ukr',
  cs: 'ces',
  ces: 'ces',
  cze: 'ces',
  czech: 'ces',
  hu: 'hun',
  hun: 'hun',
  hungarian: 'hun',
  ro: 'ron',
  ron: 'ron',
  rum: 'ron',
  romanian: 'ron',
  fa: 'fas',
  fas: 'fas',
  per: 'fas',
  persian: 'fas',
};

const LANGUAGE_NAMES: Record<string, string> = {
  eng: 'English',
  ara: 'Arabic',
  fre: 'French',
  fra: 'French',
  spa: 'Spanish',
  ger: 'German',
  deu: 'German',
  ita: 'Italian',
  jpn: 'Japanese',
  kor: 'Korean',
  chi: 'Chinese',
  zho: 'Chinese',
  rus: 'Russian',
  tur: 'Turkish',
  por: 'Portuguese',
  hin: 'Hindi',
  dut: 'Dutch',
  swe: 'Swedish',
  nor: 'Norwegian',
  dan: 'Danish',
  fin: 'Finnish',
  pol: 'Polish',
  gre: 'Greek',
  heb: 'Hebrew',
  ind: 'Indonesian',
  tha: 'Thai',
  vie: 'Vietnamese',
  ukr: 'Ukrainian',
  ces: 'Czech',
  hun: 'Hungarian',
  ron: 'Romanian',
  fas: 'Persian',
};

export function normalizeSubtitleLanguageCode(code?: string | null): string {
  if (!code) return 'und';
  const trimmed = code.trim().toLowerCase();
  if (!trimmed) return 'und';
  const primary = trimmed.split(/[-_]/)[0];
  if (KNOWN_LANGUAGE_MAP[primary]) {
    return KNOWN_LANGUAGE_MAP[primary];
  }
  if ((primary.length === 2 || primary.length === 3) && /^[a-z]+$/.test(primary)) {
    return primary;
  }
  return 'und';
}

export function getSubtitleLanguageName(code?: string | null): string {
  if (!code) return '';
  const normalized = normalizeSubtitleLanguageCode(code);
  if (normalized === 'und') return '';
  return LANGUAGE_NAMES[normalized] || '';
}

export function formatSubtitleTrackLabel(
  track: Pick<SubtitleTrack, 'id' | 'language' | 'title'>,
  includeLanguageCode = true
): string {
  const normLang = normalizeSubtitleLanguageCode(track.language);
  const langName = getSubtitleLanguageName(normLang);
  const base = track.title?.trim() || langName || `Track ${track.id}`;
  if (!includeLanguageCode) {
    return base;
  }
  const displayLang = (track.language || normLang).trim();
  if (displayLang && displayLang.toLowerCase() !== 'und') {
    const suffix = `(${displayLang.toLowerCase()})`;
    if (!base.toLowerCase().endsWith(suffix)) {
      return `${base} (${displayLang})`;
    }
  }
  return base;
}
