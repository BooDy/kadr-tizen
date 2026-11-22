import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  memo,
  type JSX,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  Settings,
  SlidersHorizontal,
  Languages,
  ShieldCheck,
  Activity,
  Lock,
  Users,
  Server,
  RefreshCw,
  RotateCcw,
  Check,
  Tv,
  Wifi,
} from 'lucide-react';
import { ApiClient } from '../api/client';
import type { DiscoveryResponse, UserRole } from '../types/kadr';
import { APP_VERSION } from '../version';
import {
  HLS_QUALITY_OPTIONS,
  PLAYER_ENGINE_OPTIONS,
  loadPlaybackSettings,
  savePlaybackSettings,
  resetAllPlaybackPreferences,
  type HlsQualityCap,
  type PreferredPlayerEngine,
  type PlaybackSettings,
} from '../player/playbackSettings';
import {
  AUDIOBOOK_SPEED_OPTIONS,
  loadAudioPreference,
  saveAudioPreference,
  loadAudiobookSpeed,
  saveAudiobookSpeed,
  type AudioPreference,
} from '../player/audioPreferences';
import {
  FONT_SIZE_OPTIONS,
  COLOR_OPTIONS,
  PLACEMENT_OPTIONS,
  FONT_SIZE_PX,
  COLOR_HEX,
  loadSubtitlePreference,
  saveSubtitlePreference,
  loadSubtitleSettings,
  saveSubtitleSettings,
  type SubtitlePreference,
  type SubtitleSettings,
} from '../player/subtitleSettings';
import { normalizeSubtitleLanguageCode } from '../player/subtitles';
import { useFocusContext, useFocusStore } from '../navigation/FocusContext';
import { useFocusable } from '../navigation/useFocusable';
import { TVKeys } from '../navigation/keys';

export interface SettingsViewProps {
  client: ApiClient;
  serverUrl: string;
  username?: string;
  userRole?: UserRole;
  onNavigateToSidebar?: () => void;
  onSwitchProfile?: () => void;
  onSwitchServer?: () => void;
  onUnlockedLibrariesChanged?: () => void;
}

type SettingsCategory = 'playback' | 'languages' | 'account' | 'diagnostics';

interface CategoryDef {
  id: SettingsCategory;
  nodeId: `settings-cat-${SettingsCategory}`;
  label: string;
  subtitle: string;
}

const CATEGORIES: ReadonlyArray<CategoryDef> = [
  {
    id: 'playback',
    nodeId: 'settings-cat-playback',
    label: 'Playback & Quality',
    subtitle: 'HLS cap, engine & speed',
  },
  {
    id: 'languages',
    nodeId: 'settings-cat-languages',
    label: 'Audio & Subtitles',
    subtitle: 'Languages & caption style',
  },
  {
    id: 'account',
    nodeId: 'settings-cat-account',
    label: 'Account & Privacy',
    subtitle: 'Profile, server & PIN locks',
  },
  {
    id: 'diagnostics',
    nodeId: 'settings-cat-diagnostics',
    label: 'TV Diagnostics & About',
    subtitle: 'Hardware, ping & reset',
  },
];

const AUDIO_LANGUAGE_OPTIONS: ReadonlyArray<{ code: string; label: string }> = [
  { code: 'auto', label: 'Auto (Default)' },
  { code: 'ara', label: 'Arabic' },
  { code: 'eng', label: 'English' },
  { code: 'jpn', label: 'Japanese' },
  { code: 'fra', label: 'French' },
  { code: 'spa', label: 'Spanish' },
  { code: 'deu', label: 'German' },
  { code: 'kor', label: 'Korean' },
];

const SUBTITLE_LANGUAGE_OPTIONS: ReadonlyArray<{ code: string; label: string }> = [
  { code: 'auto', label: 'Auto' },
  { code: 'off', label: 'Off' },
  { code: 'ara', label: 'Arabic' },
  { code: 'eng', label: 'English' },
  { code: 'jpn', label: 'Japanese' },
  { code: 'fra', label: 'French' },
  { code: 'spa', label: 'Spanish' },
];

const CATEGORY_NODE_IDS = new Set<string>(CATEGORIES.map((c) => c.nodeId));
const CATEGORY_ID_BY_NODE = new Map<string, SettingsCategory>(
  CATEGORIES.map((c) => [c.nodeId, c.id])
);

const ALL_SETTINGS_NODE_IDS = new Set<string>([
  ...CATEGORIES.map((c) => c.nodeId),
  ...HLS_QUALITY_OPTIONS.map((o) => `settings-hls-height-${o.value}`),
  ...PLAYER_ENGINE_OPTIONS.map((o) => `settings-engine-${o.value}`),
  ...AUDIOBOOK_SPEED_OPTIONS.map((rate) => `settings-audiobook-speed-${rate}`),
  ...AUDIO_LANGUAGE_OPTIONS.map((o) => `settings-audio-lang-${o.code}`),
  ...SUBTITLE_LANGUAGE_OPTIONS.map((o) => `settings-sub-lang-${o.code}`),
  ...FONT_SIZE_OPTIONS.map((o) => `settings-sub-size-${o.value}`),
  ...COLOR_OPTIONS.map((o) => `settings-sub-color-${o.value}`),
  ...PLACEMENT_OPTIONS.map((o) => `settings-sub-pos-${o.value}`),
  'settings-lock-libraries-btn',
  'settings-switch-profile-btn',
  'settings-change-server-btn',
  'settings-ping-server-btn',
  'settings-reset-prefs-btn',
]);

export function isSettingsContentNodeId(id: string | null | undefined): boolean {
  return Boolean(id && ALL_SETTINGS_NODE_IDS.has(id));
}

export function isSettingsLeftmostNodeId(id: string | null | undefined): boolean {
  return Boolean(id && CATEGORY_NODE_IDS.has(id));
}

export function getFirstSettingsFocusableId(): string {
  return 'settings-cat-playback';
}

function isAnyModalActive(activeTrap?: string | null): boolean {
  if (activeTrap) return true;
  if (typeof document !== 'undefined') {
    return Boolean(
      document.querySelector(
        '[aria-modal="true"], [role="dialog"], [role="alertdialog"], [data-modal-overlay="true"]'
      )
    );
  }
  return false;
}

function focusDomNode(targetId: string): void {
  if (typeof document === 'undefined') return;
  const el = document.getElementById(targetId);
  if (!el) return;
  try {
    el.focus({ preventScroll: true });
  } catch {
    el.focus();
  }
}

function getTvHardwareModel(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const model = (window as any)?.webapis?.productinfo?.getModel?.();
    if (typeof model === 'string' && model.trim().length > 0) {
      return model.trim();
    }
  } catch {
    // Ignored outside Tizen hardware
  }
  return 'Web Dev Harness';
}

function getTizenPlatformVersion(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const version = (window as any)?.tizen?.systeminfo?.getCapability?.(
      'http://tizen.org/feature/platform.version'
    );
    if (typeof version === 'string' && version.trim().length > 0) {
      return `Tizen ${version.trim()}`;
    }
  } catch {
    // Ignored outside Tizen hardware
  }
  return 'Browser';
}

function getAvplayStatus(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof window !== 'undefined' && (window as any)?.webapis?.avplay) {
      return 'Hardware Ready';
    }
  } catch {
    // Ignored
  }
  return 'HTML5 Fallback';
}

function getViewportLabel(): string {
  if (typeof window === 'undefined') return '1920×1080';
  return `${window.innerWidth}×${window.innerHeight}`;
}

function getSelectedAudioOptionCode(pref: AudioPreference): string {
  if (pref.mode !== 'language') return 'auto';
  const norm = normalizeSubtitleLanguageCode(pref.language);
  const match = AUDIO_LANGUAGE_OPTIONS.find(
    (opt) => opt.code !== 'auto' && normalizeSubtitleLanguageCode(opt.code) === norm
  );
  return match ? match.code : 'auto';
}

function getSelectedSubtitleOptionCode(pref: SubtitlePreference): string {
  if (pref.mode === 'off') return 'off';
  if (pref.mode !== 'language') return 'auto';
  const norm = normalizeSubtitleLanguageCode(pref.language);
  const match = SUBTITLE_LANGUAGE_OPTIONS.find(
    (opt) =>
      opt.code !== 'auto' &&
      opt.code !== 'off' &&
      normalizeSubtitleLanguageCode(opt.code) === norm
  );
  return match ? match.code : 'auto';
}

function getSelectedAudiobookSpeed(rate: number): number {
  const exact = AUDIOBOOK_SPEED_OPTIONS.find((opt) => Math.abs(opt - rate) < 0.001);
  return exact ?? 1;
}

interface ControlRowDescriptor {
  ids: string[];
  activeId: string;
}

type ArrowDirection = 'left' | 'right' | 'up' | 'down';

type RouteOutcome =
  | { type: 'sidebar' }
  | { type: 'category'; category: SettingsCategory; targetId: string }
  | { type: 'focus'; targetId: string }
  | { type: 'clamp' };

function resolveSettingsArrowNavigation(params: {
  currentId: string;
  direction: ArrowDirection;
  activeCategory: SettingsCategory;
  controlRows: ControlRowDescriptor[];
}): RouteOutcome | null {
  const { currentId, direction, activeCategory, controlRows } = params;

  const catIdx = CATEGORIES.findIndex((c) => c.nodeId === currentId);
  if (catIdx !== -1) {
    if (direction === 'left') {
      return { type: 'sidebar' };
    }
    if (direction === 'up') {
      if (catIdx > 0) {
        const prev = CATEGORIES[catIdx - 1];
        return { type: 'category', category: prev.id, targetId: prev.nodeId };
      }
      return { type: 'clamp' };
    }
    if (direction === 'down') {
      if (catIdx < CATEGORIES.length - 1) {
        const next = CATEGORIES[catIdx + 1];
        return { type: 'category', category: next.id, targetId: next.nodeId };
      }
      return { type: 'clamp' };
    }
    if (direction === 'right') {
      const firstId = controlRows[0]?.ids[0];
      return firstId ? { type: 'focus', targetId: firstId } : { type: 'clamp' };
    }
  }

  for (let rowIdx = 0; rowIdx < controlRows.length; rowIdx++) {
    const row = controlRows[rowIdx];
    const colIdx = row.ids.indexOf(currentId);
    if (colIdx === -1) continue;

    if (direction === 'left') {
      if (colIdx > 0) {
        return { type: 'focus', targetId: row.ids[colIdx - 1] };
      }
      return { type: 'focus', targetId: `settings-cat-${activeCategory}` };
    }
    if (direction === 'right') {
      if (colIdx < row.ids.length - 1) {
        return { type: 'focus', targetId: row.ids[colIdx + 1] };
      }
      return { type: 'clamp' };
    }
    if (direction === 'up') {
      if (rowIdx > 0) {
        const targetRow = controlRows[rowIdx - 1];
        const preferred = targetRow.ids.includes(targetRow.activeId)
          ? targetRow.activeId
          : targetRow.ids[0];
        return preferred ? { type: 'focus', targetId: preferred } : { type: 'clamp' };
      }
      return { type: 'clamp' };
    }
    if (direction === 'down') {
      if (rowIdx < controlRows.length - 1) {
        const targetRow = controlRows[rowIdx + 1];
        const preferred = targetRow.ids.includes(targetRow.activeId)
          ? targetRow.activeId
          : targetRow.ids[0];
        return preferred ? { type: 'focus', targetId: preferred } : { type: 'clamp' };
      }
      return { type: 'clamp' };
    }
  }

  return null;
}

interface SettingsFocusBridgeProps {
  activeCategory: SettingsCategory;
  onSyncCategory: (category: SettingsCategory) => void;
}

function SettingsFocusBridge({
  activeCategory,
  onSyncCategory,
}: SettingsFocusBridgeProps) {
  const { focusedId, setFocusedId, activeTrap } = useFocusContext();
  const focusStore = useFocusStore();

  useEffect(() => {
    const liveTrap = focusStore.getActiveTrap() ?? activeTrap;
    if (isAnyModalActive(liveTrap)) return;

    const liveFocusedId = focusStore.getFocusedId() ?? focusedId;
    if (liveFocusedId && liveFocusedId.startsWith('nav-')) {
      return;
    }

    const catFromFocus = liveFocusedId ? CATEGORY_ID_BY_NODE.get(liveFocusedId) : undefined;
    if (catFromFocus) {
      if (catFromFocus !== activeCategory) {
        onSyncCategory(catFromFocus);
      }
      return;
    }

    if (
      liveFocusedId &&
      isSettingsContentNodeId(liveFocusedId) &&
      typeof document !== 'undefined' &&
      document.getElementById(liveFocusedId)
    ) {
      return;
    }

    const fallbackId = `settings-cat-${activeCategory}`;
    setFocusedId(fallbackId);
    focusDomNode(fallbackId);
  }, [activeCategory, activeTrap, focusStore, focusedId, onSyncCategory, setFocusedId]);

  return null;
}

interface CategoryRailItemProps {
  category: CategoryDef;
  icon: ReactNode;
  order: number;
  isActive: boolean;
  isLast: boolean;
  onSelect: (category: SettingsCategory) => void;
}

const CategoryRailItem = memo(function CategoryRailItem({
  category,
  icon,
  order,
  isActive,
  isLast,
  onSelect,
}: CategoryRailItemProps) {
  const handleSelect = useCallback(() => onSelect(category.id), [onSelect, category.id]);
  const { ref, isFocused } = useFocusable<HTMLButtonElement>({
    id: category.nodeId,
    groupId: 'settings-content',
    order,
    onEnter: handleSelect,
  });

  return (
    <button
      ref={ref}
      id={category.nodeId}
      data-testid={category.nodeId}
      type="button"
      tabIndex={-1}
      aria-current={isActive ? 'page' : undefined}
      onClick={handleSelect}
      className={`w-full text-left rounded-2xl px-5 py-4 flex items-center cursor-pointer outline-none select-none transition-transform duration-75 ${
        isLast ? '' : 'mb-3'
      } ${
        isFocused
          ? 'bg-[#ff7a18] text-white border-2 border-[#FFB800] tv-focus-ring'
          : isActive
          ? 'bg-[#292a2f] text-[#F5E5E5] border border-[#ff7a18]/60'
          : 'bg-[#14151c] text-[#e3e1e9] border border-[rgba(255,255,255,0.08)] hover:bg-[#1c1d26]'
      }`}
    >
      <span
        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mr-4 ${
          isFocused
            ? 'bg-black/20 text-white'
            : isActive
            ? 'bg-[#ff7a18]/20 text-[#ffb871]'
            : 'bg-[#1a1b21] text-[#a8a29e]'
        }`}
        aria-hidden="true"
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-bold truncate">{category.label}</span>
        <span
          className={`block text-xs truncate ${
            isFocused ? 'text-white/90' : 'text-[#a8a29e]'
          }`}
        >
          {category.subtitle}
        </span>
      </span>
    </button>
  );
});

interface SettingPillButtonProps<T extends string | number = string> {
  id: string;
  value: T;
  label: string;
  order: number;
  isSelected: boolean;
  marginClass: string;
  onSelectValue: (value: T) => void;
}

const SettingPillButton = memo(function SettingPillButton<T extends string | number>({
  id,
  value,
  label,
  order,
  isSelected,
  marginClass,
  onSelectValue,
}: SettingPillButtonProps<T>) {
  const handleSelect = useCallback(() => onSelectValue(value), [onSelectValue, value]);
  const { ref, isFocused } = useFocusable<HTMLButtonElement>({
    id,
    groupId: 'settings-content',
    order,
    onEnter: handleSelect,
  });

  return (
    <button
      ref={ref}
      id={id}
      data-testid={id}
      type="button"
      tabIndex={-1}
      aria-pressed={isSelected}
      onClick={handleSelect}
      className={`px-5 py-3 rounded-xl text-base font-bold whitespace-nowrap inline-flex items-center cursor-pointer outline-none select-none transition-transform duration-75 ${marginClass} ${
        isFocused
          ? 'bg-[#ff7a18] text-white border-2 border-[#FFB800] tv-focus-ring'
          : isSelected
          ? 'bg-[#ff7a18]/20 text-[#ffb871] border border-[#ff7a18]/70'
          : 'bg-[#1a1b21] text-[#e3e1e9] border border-[rgba(255,255,255,0.1)] hover:bg-[#292a2f]'
      }`}
    >
      {isSelected && (
        <Check className="w-4 h-4 shrink-0 mr-2" aria-hidden="true" />
      )}
      <span>{label}</span>
    </button>
  );
}) as <T extends string | number>(props: SettingPillButtonProps<T>) => JSX.Element;

interface SettingActionButtonProps {
  id: string;
  label: string;
  order: number;
  icon: ReactNode;
  variant?: 'primary' | 'secondary' | 'danger';
  onSelect: () => void;
}

const SettingActionButton = memo(function SettingActionButton({
  id,
  label,
  order,
  icon,
  variant = 'secondary',
  onSelect,
}: SettingActionButtonProps) {
  const { ref, isFocused } = useFocusable<HTMLButtonElement>({
    id,
    groupId: 'settings-content',
    order,
    onEnter: onSelect,
  });

  const styleClass = isFocused
    ? 'bg-[#ff7a18] text-white border-2 border-[#FFB800] tv-focus-ring'
    : variant === 'danger'
    ? 'bg-[#3B1111] text-[#ffb871] border border-[#D43F15]/60 hover:bg-[#4A1616]'
    : variant === 'primary'
    ? 'bg-[#ff7a18]/20 text-[#ffb871] border border-[#ff7a18]/60 hover:bg-[#ff7a18]/30'
    : 'bg-[#1a1b21] text-[#F5E5E5] border border-[rgba(255,255,255,0.12)] hover:bg-[#292a2f]';

  return (
    <button
      ref={ref}
      id={id}
      data-testid={id}
      type="button"
      tabIndex={-1}
      onClick={onSelect}
      className={`px-6 py-3.5 rounded-xl font-bold text-base inline-flex items-center cursor-pointer outline-none select-none transition-transform duration-75 ${styleClass}`}
    >
      <span className="inline-flex items-center mr-2.5 shrink-0" aria-hidden="true">
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
});

function SettingCard({
  title,
  description,
  isLast = false,
  children,
}: {
  title: string;
  description: string;
  isLast?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl bg-[#14151c] border border-[rgba(255,255,255,0.08)] p-6 ${
        isLast ? '' : 'mb-5'
      }`}
    >
      <h2 className="text-xl font-bold text-[#F5E5E5] mb-1">{title}</h2>
      <p className="text-sm text-[#a8a29e] mb-4">{description}</p>
      {children}
    </div>
  );
}

function TelemetryTile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl bg-[#1a1b21] border border-[rgba(255,255,255,0.08)] p-4">
      <div className="text-xs font-mono uppercase text-[#a8a29e] mb-1">{label}</div>
      {children}
    </div>
  );
}

interface ProbeState {
  status: 'idle' | 'probing' | 'online' | 'error';
  serverName?: string;
  serverVersion?: string;
  latencyMs?: number;
  error?: string;
}

const TELEMETRY_GRID_STYLE: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gridGap: '16px',
};

function renderCategoryIcon(category: SettingsCategory): ReactNode {
  switch (category) {
    case 'playback':
      return <SlidersHorizontal className="w-5 h-5" />;
    case 'languages':
      return <Languages className="w-5 h-5" />;
    case 'account':
      return <ShieldCheck className="w-5 h-5" />;
    case 'diagnostics':
      return <Activity className="w-5 h-5" />;
  }
}

function getPreviewAlignmentStyle(placement: SubtitleSettings['placement']): CSSProperties {
  if (placement === 'top') {
    return { justifyContent: 'flex-start', paddingTop: '14px', paddingBottom: '14px' };
  }
  if (placement === 'raised') {
    return { justifyContent: 'center', paddingTop: '14px', paddingBottom: '14px' };
  }
  return { justifyContent: 'flex-end', paddingTop: '14px', paddingBottom: '14px' };
}

export function SettingsView({
  client,
  serverUrl,
  username,
  userRole,
  onNavigateToSidebar,
  onSwitchProfile,
  onSwitchServer,
  onUnlockedLibrariesChanged,
}: SettingsViewProps): JSX.Element {
  const { setFocusedId } = useFocusContext();
  const focusStore = useFocusStore();

  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('playback');
  const [playbackSettings, setPlaybackSettings] = useState<PlaybackSettings>(() =>
    loadPlaybackSettings()
  );
  const [audiobookSpeed, setAudiobookSpeed] = useState<number>(() => loadAudiobookSpeed());
  const [audioPref, setAudioPref] = useState<AudioPreference>(() => loadAudioPreference());
  const [subtitlePref, setSubtitlePref] = useState<SubtitlePreference>(() =>
    loadSubtitlePreference()
  );
  const [subtitleSettings, setSubtitleSettings] = useState<SubtitleSettings>(() =>
    loadSubtitleSettings()
  );
  const [unlockedCount, setUnlockedCount] = useState<number>(() =>
    client?.getUnlockTokens ? client.getUnlockTokens().length : 0
  );
  const [lockNotice, setLockNotice] = useState<string | null>(null);
  const [resetNotice, setResetNotice] = useState<string | null>(null);
  const [probeNonce, setProbeNonce] = useState<number>(0);
  const [probeState, setProbeState] = useState<ProbeState>({ status: 'idle' });

  const cleanServerUrl = useMemo(() => serverUrl.replace(/\/+$/, ''), [serverUrl]);

  useEffect(() => {
    setUnlockedCount(client?.getUnlockTokens ? client.getUnlockTokens().length : 0);
  }, [client, activeCategory]);

  useEffect(() => {
    if (activeCategory !== 'diagnostics') {
      return;
    }

    const controller = new AbortController();
    const startedAt =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    setProbeState({ status: 'probing' });

    fetch(`${cleanServerUrl}/api/v1/discovery`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
      .then(async (res) => {
        if (controller.signal.aborted) return;
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = (await res.json()) as Partial<DiscoveryResponse>;
        if (controller.signal.aborted) return;
        const finishedAt =
          typeof performance !== 'undefined' ? performance.now() : Date.now();
        const latencyMs = Math.max(0, Math.round(finishedAt - startedAt));
        setProbeState({
          status: 'online',
          serverName: data.name || 'Kadr Server',
          serverVersion: data.version || 'unknown',
          latencyMs,
        });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof Error && err.name === 'AbortError') return;
        const message = err instanceof Error ? err.message : 'Connection failed';
        setProbeState({
          status: 'error',
          error: message || 'Connection failed',
        });
      });

    return () => {
      controller.abort();
    };
  }, [activeCategory, cleanServerUrl, probeNonce]);

  const selectedAudioCode = useMemo(
    () => getSelectedAudioOptionCode(audioPref),
    [audioPref]
  );
  const selectedSubtitleCode = useMemo(
    () => getSelectedSubtitleOptionCode(subtitlePref),
    [subtitlePref]
  );
  const selectedAudiobookSpeed = useMemo(
    () => getSelectedAudiobookSpeed(audiobookSpeed),
    [audiobookSpeed]
  );

  const hasSwitchServer = Boolean(onSwitchServer);

  const controlRows = useMemo<ControlRowDescriptor[]>(() => {
    switch (activeCategory) {
      case 'playback':
        return [
          {
            ids: HLS_QUALITY_OPTIONS.map((o) => `settings-hls-height-${o.value}`),
            activeId: `settings-hls-height-${playbackSettings.hlsMaxHeight}`,
          },
          {
            ids: PLAYER_ENGINE_OPTIONS.map((o) => `settings-engine-${o.value}`),
            activeId: `settings-engine-${playbackSettings.preferredPlayerEngine}`,
          },
          {
            ids: AUDIOBOOK_SPEED_OPTIONS.map((rate) => `settings-audiobook-speed-${rate}`),
            activeId: `settings-audiobook-speed-${selectedAudiobookSpeed}`,
          },
        ];
      case 'languages':
        return [
          {
            ids: AUDIO_LANGUAGE_OPTIONS.map((o) => `settings-audio-lang-${o.code}`),
            activeId: `settings-audio-lang-${selectedAudioCode}`,
          },
          {
            ids: SUBTITLE_LANGUAGE_OPTIONS.map((o) => `settings-sub-lang-${o.code}`),
            activeId: `settings-sub-lang-${selectedSubtitleCode}`,
          },
          {
            ids: FONT_SIZE_OPTIONS.map((o) => `settings-sub-size-${o.value}`),
            activeId: `settings-sub-size-${subtitleSettings.fontSize}`,
          },
          {
            ids: COLOR_OPTIONS.map((o) => `settings-sub-color-${o.value}`),
            activeId: `settings-sub-color-${subtitleSettings.color}`,
          },
          {
            ids: PLACEMENT_OPTIONS.map((o) => `settings-sub-pos-${o.value}`),
            activeId: `settings-sub-pos-${subtitleSettings.placement}`,
          },
        ];
      case 'account': {
        const rows: ControlRowDescriptor[] = [
          {
            ids: ['settings-lock-libraries-btn'],
            activeId: 'settings-lock-libraries-btn',
          },
          {
            ids: ['settings-switch-profile-btn'],
            activeId: 'settings-switch-profile-btn',
          },
        ];
        if (hasSwitchServer) {
          rows.push({
            ids: ['settings-change-server-btn'],
            activeId: 'settings-change-server-btn',
          });
        }
        return rows;
      }
      case 'diagnostics':
        return [
          {
            ids: ['settings-ping-server-btn'],
            activeId: 'settings-ping-server-btn',
          },
          {
            ids: ['settings-reset-prefs-btn'],
            activeId: 'settings-reset-prefs-btn',
          },
        ];
    }
  }, [
    activeCategory,
    playbackSettings,
    selectedAudiobookSpeed,
    selectedAudioCode,
    selectedSubtitleCode,
    subtitleSettings,
    hasSwitchServer,
  ]);

  const activeCategoryRef = useRef(activeCategory);
  activeCategoryRef.current = activeCategory;
  const controlRowsRef = useRef(controlRows);
  controlRowsRef.current = controlRows;
  const onNavigateToSidebarRef = useRef(onNavigateToSidebar);
  onNavigateToSidebarRef.current = onNavigateToSidebar;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isAnyModalActive(focusStore.getActiveTrap())) {
        return;
      }

      const currentId = focusStore.getFocusedId();
      if (!currentId || !isSettingsContentNodeId(currentId)) {
        return;
      }

      const code = e.keyCode || e.which;
      let direction: ArrowDirection | null = null;
      if (code === TVKeys.LEFT || e.key === 'ArrowLeft') direction = 'left';
      else if (code === TVKeys.RIGHT || e.key === 'ArrowRight') direction = 'right';
      else if (code === TVKeys.UP || e.key === 'ArrowUp') direction = 'up';
      else if (code === TVKeys.DOWN || e.key === 'ArrowDown') direction = 'down';

      if (!direction) return;

      const outcome = resolveSettingsArrowNavigation({
        currentId,
        direction,
        activeCategory: activeCategoryRef.current,
        controlRows: controlRowsRef.current,
      });

      if (!outcome) return;

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      if (outcome.type === 'sidebar') {
        onNavigateToSidebarRef.current?.();
        return;
      }
      if (outcome.type === 'category') {
        setActiveCategory(outcome.category);
        setFocusedId(outcome.targetId);
        focusDomNode(outcome.targetId);
        return;
      }
      if (outcome.type === 'focus') {
        setFocusedId(outcome.targetId);
        focusDomNode(outcome.targetId);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [focusStore, setFocusedId]);

  const handleSelectCategory = useCallback(
    (category: SettingsCategory) => {
      const nodeId = `settings-cat-${category}`;
      setActiveCategory(category);
      setFocusedId(nodeId);
      focusDomNode(nodeId);
    },
    [setFocusedId]
  );

  const handleSelectHlsHeight = useCallback((hlsMaxHeight: HlsQualityCap) => {
    setPlaybackSettings((prev) => {
      const next: PlaybackSettings = { ...prev, hlsMaxHeight };
      savePlaybackSettings(next);
      return next;
    });
  }, []);

  const handleSelectPlayerEngine = useCallback(
    (preferredPlayerEngine: PreferredPlayerEngine) => {
      setPlaybackSettings((prev) => {
        const next: PlaybackSettings = { ...prev, preferredPlayerEngine };
        savePlaybackSettings(next);
        return next;
      });
    },
    []
  );

  const handleSelectAudiobookSpeed = useCallback((rate: number) => {
    saveAudiobookSpeed(rate);
    setAudiobookSpeed(loadAudiobookSpeed());
  }, []);

  const handleSelectAudioLanguage = useCallback((code: string) => {
    const next: AudioPreference =
      code === 'auto' ? { mode: 'auto' } : { mode: 'language', language: code };
    saveAudioPreference(next);
    setAudioPref(loadAudioPreference());
  }, []);

  const handleSelectSubtitleLanguage = useCallback((code: string) => {
    const next: SubtitlePreference =
      code === 'auto'
        ? { mode: 'auto' }
        : code === 'off'
        ? { mode: 'off' }
        : { mode: 'language', language: code };
    saveSubtitlePreference(next);
    setSubtitlePref(loadSubtitlePreference());
  }, []);

  const handleUpdateSubtitleSetting = useCallback(
    <K extends keyof SubtitleSettings>(key: K, value: SubtitleSettings[K]) => {
      setSubtitleSettings((prev) => {
        const next: SubtitleSettings = { ...prev, [key]: value };
        saveSubtitleSettings(next);
        return next;
      });
    },
    []
  );

  const handleSelectSubtitleSize = useCallback(
    (fontSize: SubtitleSettings['fontSize']) => {
      handleUpdateSubtitleSetting('fontSize', fontSize);
    },
    [handleUpdateSubtitleSetting]
  );

  const handleSelectSubtitleColor = useCallback(
    (color: SubtitleSettings['color']) => {
      handleUpdateSubtitleSetting('color', color);
    },
    [handleUpdateSubtitleSetting]
  );

  const handleSelectSubtitlePlacement = useCallback(
    (placement: SubtitleSettings['placement']) => {
      handleUpdateSubtitleSetting('placement', placement);
    },
    [handleUpdateSubtitleSetting]
  );

  const handleSwitchProfile = useCallback(() => onSwitchProfile?.(), [onSwitchProfile]);
  const handleSwitchServer = useCallback(() => onSwitchServer?.(), [onSwitchServer]);

  const handleLockLibraries = useCallback(() => {
    const hadUnlocked =
      (client?.getUnlockTokens ? client.getUnlockTokens().length : 0) > 0;
    client?.clearLibraryUnlockTokens?.();
    const remaining = client?.getUnlockTokens ? client.getUnlockTokens().length : 0;
    setUnlockedCount(remaining);
    if (hadUnlocked) {
      onUnlockedLibrariesChanged?.();
      setLockNotice('All private libraries have been re-locked.');
    } else {
      setLockNotice('No private libraries are currently unlocked.');
    }
  }, [client, onUnlockedLibrariesChanged]);

  const handlePingServer = useCallback(() => {
    setProbeNonce((n) => n + 1);
  }, []);

  const handleResetAllPreferences = useCallback(() => {
    resetAllPlaybackPreferences();
    setPlaybackSettings(loadPlaybackSettings());
    setAudiobookSpeed(loadAudiobookSpeed());
    setAudioPref(loadAudioPreference());
    setSubtitlePref(loadSubtitlePreference());
    setSubtitleSettings(loadSubtitleSettings());
    setResetNotice('All playback and subtitle preferences have been reset to defaults.');
  }, []);

  const tvModel = useMemo(() => getTvHardwareModel(), []);
  const tizenPlatform = useMemo(() => getTizenPlatformVersion(), []);
  const avplayStatus = useMemo(() => getAvplayStatus(), []);
  const viewportLabel = useMemo(() => getViewportLabel(), []);

  return (
    <div data-testid="settings-view" className="w-full pb-16 flex items-start select-none">
      <SettingsFocusBridge
        activeCategory={activeCategory}
        onSyncCategory={setActiveCategory}
      />

      {/* Left Category Rail */}
      <aside className="w-[380px] shrink-0 mr-10">
        <div className="flex items-center mb-6">
          <div
            className="w-12 h-12 rounded-2xl bg-[#281216] border border-[#ff7a18]/30 flex items-center justify-center shrink-0 mr-4"
            aria-hidden="true"
          >
            <Settings className="w-6 h-6 text-[#ff7a18]" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-[#F5E5E5]">Settings</h1>
            <p className="text-sm text-[#a8a29e]">Quality, languages, privacy &amp; TV info</p>
          </div>
        </div>

        <nav aria-label="Settings categories">
          {CATEGORIES.map((category, idx) => (
            <CategoryRailItem
              key={category.id}
              category={category}
              icon={renderCategoryIcon(category.id)}
              order={idx + 1}
              isActive={activeCategory === category.id}
              isLast={idx === CATEGORIES.length - 1}
              onSelect={handleSelectCategory}
            />
          ))}
        </nav>
      </aside>

      {/* Right Control Panel */}
      <section className="flex-1 min-w-0">
        {activeCategory === 'playback' && (
          <div data-testid="settings-panel-playback">
            <SettingCard
              title="HLS Max Quality"
              description="Maximum video resolution cap when streaming transcoded HLS playback."
            >
              <div className="flex flex-wrap items-center">
                {HLS_QUALITY_OPTIONS.map((opt, idx) => (
                  <SettingPillButton
                    key={opt.value}
                    id={`settings-hls-height-${opt.value}`}
                    value={opt.value}
                    label={opt.label}
                    order={10 + idx}
                    isSelected={playbackSettings.hlsMaxHeight === opt.value}
                    marginClass={
                      idx < HLS_QUALITY_OPTIONS.length - 1 ? 'mr-3 mb-2' : 'mb-2'
                    }
                    onSelectValue={handleSelectHlsHeight}
                  />
                ))}
              </div>
            </SettingCard>

            <SettingCard
              title="Video Player Engine"
              description="Choose between Samsung TV native AVPlay hardware decoding or HTML5 Video."
            >
              <div className="flex flex-wrap items-center">
                {PLAYER_ENGINE_OPTIONS.map((opt, idx) => (
                  <SettingPillButton
                    key={opt.value}
                    id={`settings-engine-${opt.value}`}
                    value={opt.value}
                    label={opt.label}
                    order={30 + idx}
                    isSelected={playbackSettings.preferredPlayerEngine === opt.value}
                    marginClass={
                      idx < PLAYER_ENGINE_OPTIONS.length - 1 ? 'mr-3 mb-2' : 'mb-2'
                    }
                    onSelectValue={handleSelectPlayerEngine}
                  />
                ))}
              </div>
            </SettingCard>

            <SettingCard
              title="Audiobook Default Speed"
              description="Default playback speed applied when opening audiobooks."
              isLast
            >
              <div className="flex flex-wrap items-center">
                {AUDIOBOOK_SPEED_OPTIONS.map((rate, idx) => (
                  <SettingPillButton
                    key={rate}
                    id={`settings-audiobook-speed-${rate}`}
                    value={rate}
                    label={`${rate}x`}
                    order={50 + idx}
                    isSelected={selectedAudiobookSpeed === rate}
                    marginClass={
                      idx < AUDIOBOOK_SPEED_OPTIONS.length - 1 ? 'mr-3 mb-2' : 'mb-2'
                    }
                    onSelectValue={handleSelectAudiobookSpeed}
                  />
                ))}
              </div>
            </SettingCard>
          </div>
        )}

        {activeCategory === 'languages' && (
          <div data-testid="settings-panel-languages">
            <SettingCard
              title="Preferred Audio Language"
              description="Automatically select matching audio tracks when starting playback."
            >
              <div className="flex flex-wrap items-center">
                {AUDIO_LANGUAGE_OPTIONS.map((opt, idx) => (
                  <SettingPillButton
                    key={opt.code}
                    id={`settings-audio-lang-${opt.code}`}
                    value={opt.code}
                    label={opt.label}
                    order={10 + idx}
                    isSelected={selectedAudioCode === opt.code}
                    marginClass={
                      idx < AUDIO_LANGUAGE_OPTIONS.length - 1 ? 'mr-3 mb-2' : 'mb-2'
                    }
                    onSelectValue={handleSelectAudioLanguage}
                  />
                ))}
              </div>
            </SettingCard>

            <SettingCard
              title="Preferred Subtitle Mode / Language"
              description="Default subtitle behavior or language chosen automatically for video playback."
            >
              <div className="flex flex-wrap items-center">
                {SUBTITLE_LANGUAGE_OPTIONS.map((opt, idx) => (
                  <SettingPillButton
                    key={opt.code}
                    id={`settings-sub-lang-${opt.code}`}
                    value={opt.code}
                    label={opt.label}
                    order={30 + idx}
                    isSelected={selectedSubtitleCode === opt.code}
                    marginClass={
                      idx < SUBTITLE_LANGUAGE_OPTIONS.length - 1 ? 'mr-3 mb-2' : 'mb-2'
                    }
                    onSelectValue={handleSelectSubtitleLanguage}
                  />
                ))}
              </div>
            </SettingCard>

            <SettingCard
              title="Subtitle Appearance & Live Preview"
              description="Customize subtitle text size, color, and vertical screen placement."
              isLast
            >
              <div className="mb-4">
                <div className="text-sm font-bold text-[#a8a29e] uppercase tracking-wider mb-2">
                  Subtitle Size
                </div>
                <div className="flex flex-wrap items-center">
                  {FONT_SIZE_OPTIONS.map((opt, idx) => (
                    <SettingPillButton
                      key={opt.value}
                      id={`settings-sub-size-${opt.value}`}
                      value={opt.value}
                      label={opt.label}
                      order={50 + idx}
                      isSelected={subtitleSettings.fontSize === opt.value}
                      marginClass={
                        idx < FONT_SIZE_OPTIONS.length - 1 ? 'mr-3 mb-2' : 'mb-2'
                      }
                      onSelectValue={handleSelectSubtitleSize}
                    />
                  ))}
                </div>
              </div>

              <div className="mb-4">
                <div className="text-sm font-bold text-[#a8a29e] uppercase tracking-wider mb-2">
                  Subtitle Color
                </div>
                <div className="flex flex-wrap items-center">
                  {COLOR_OPTIONS.map((opt, idx) => (
                    <SettingPillButton
                      key={opt.value}
                      id={`settings-sub-color-${opt.value}`}
                      value={opt.value}
                      label={opt.label}
                      order={70 + idx}
                      isSelected={subtitleSettings.color === opt.value}
                      marginClass={
                        idx < COLOR_OPTIONS.length - 1 ? 'mr-3 mb-2' : 'mb-2'
                      }
                      onSelectValue={handleSelectSubtitleColor}
                    />
                  ))}
                </div>
              </div>

              <div className="mb-5">
                <div className="text-sm font-bold text-[#a8a29e] uppercase tracking-wider mb-2">
                  Subtitle Position
                </div>
                <div className="flex flex-wrap items-center">
                  {PLACEMENT_OPTIONS.map((opt, idx) => (
                    <SettingPillButton
                      key={opt.value}
                      id={`settings-sub-pos-${opt.value}`}
                      value={opt.value}
                      label={opt.label}
                      order={90 + idx}
                      isSelected={subtitleSettings.placement === opt.value}
                      marginClass={
                        idx < PLACEMENT_OPTIONS.length - 1 ? 'mr-3 mb-2' : 'mb-2'
                      }
                      onSelectValue={handleSelectSubtitlePlacement}
                    />
                  ))}
                </div>
              </div>

              <div
                data-testid="settings-subtitle-preview"
                className="w-full min-h-[168px] rounded-2xl border border-[rgba(255,255,255,0.12)] px-6 flex flex-col items-center text-center overflow-hidden"
                style={{
                  background:
                    'linear-gradient(135deg, #1b2a3a 0%, #0d1117 55%, #2b1a14 100%)',
                  ...getPreviewAlignmentStyle(subtitleSettings.placement),
                }}
              >
                <span
                  data-testid="settings-subtitle-preview-text"
                  dir="auto"
                  style={{
                    display: 'inline-block',
                    padding: '6px 18px',
                    borderRadius: '8px',
                    background: 'rgba(0, 0, 0, 0.5)',
                    fontSize: `${FONT_SIZE_PX[subtitleSettings.fontSize]}px`,
                    color: COLOR_HEX[subtitleSettings.color],
                    fontWeight: 600,
                    lineHeight: 1.3,
                    textShadow: '0 0 4px #000, 2px 2px 3px #000',
                  }}
                >
                  The quick brown fox jumps over the lazy dog
                </span>
              </div>
            </SettingCard>
          </div>
        )}

        {activeCategory === 'account' && (
          <div data-testid="settings-panel-account">
            <SettingCard
              title="Active Profile & Server"
              description="Signed-in profile identity and current Kadr Media Server address."
            >
              <div style={TELEMETRY_GRID_STYLE}>
                <TelemetryTile label="Profile">
                  <div className="flex items-center flex-wrap">
                    <span className="text-lg font-bold text-[#F5E5E5] mr-3">
                      {username || 'Active Profile'}
                    </span>
                    {userRole && (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold uppercase bg-[#ff7a18]/20 text-[#ffb871] border border-[#ff7a18]/50">
                        {userRole}
                      </span>
                    )}
                  </div>
                </TelemetryTile>

                <TelemetryTile label="Server URL">
                  <div className="text-base font-mono text-[#e3e1e9] break-all">
                    {serverUrl}
                  </div>
                </TelemetryTile>
              </div>
            </SettingCard>

            <SettingCard
              title="Private Libraries & PIN Privacy"
              description="Clear cached PIN unlock tokens so private libraries require PIN verification again."
            >
              <div className="flex items-center justify-between flex-wrap mb-4">
                <div className="text-base text-[#e3e1e9] mr-4">
                  Unlocked private libraries:{' '}
                  <strong
                    data-testid="settings-unlocked-count"
                    className="font-mono text-[#ffb871]"
                  >
                    {unlockedCount}
                  </strong>
                </div>
                {lockNotice && (
                  <span
                    role="status"
                    className="text-sm font-semibold text-[#10b981]"
                  >
                    {lockNotice}
                  </span>
                )}
              </div>
              <SettingActionButton
                id="settings-lock-libraries-btn"
                label="Re-lock Unlocked Private Libraries"
                order={10}
                icon={<Lock className="w-5 h-5" />}
                variant="primary"
                onSelect={handleLockLibraries}
              />
            </SettingCard>

            <SettingCard
              title="Session & Switching"
              description="Switch between local user profiles or connect to a different Kadr server."
              isLast
            >
              <div className="flex flex-col items-start">
                <div className={hasSwitchServer ? 'mb-3' : ''}>
                  <SettingActionButton
                    id="settings-switch-profile-btn"
                    label="Switch Profile"
                    order={20}
                    icon={<Users className="w-5 h-5" />}
                    onSelect={handleSwitchProfile}
                  />
                </div>
                {hasSwitchServer && (
                  <div>
                    <SettingActionButton
                      id="settings-change-server-btn"
                      label="Change Server"
                      order={30}
                      icon={<Server className="w-5 h-5" />}
                      onSelect={handleSwitchServer}
                    />
                  </div>
                )}
              </div>
            </SettingCard>
          </div>
        )}

        {activeCategory === 'diagnostics' && (
          <div data-testid="settings-panel-diagnostics">
            <SettingCard
              title="TV & Application Telemetry"
              description="Runtime version, hardware platform capabilities, and active display canvas."
            >
              <div style={TELEMETRY_GRID_STYLE}>
                <TelemetryTile label="App Version">
                  <div className="text-lg font-mono font-bold text-[#ffb871]">
                    v{APP_VERSION}
                  </div>
                </TelemetryTile>

                <TelemetryTile label="TV Hardware Model">
                  <div className="text-lg font-semibold text-[#F5E5E5] flex items-center">
                    <Tv className="w-4 h-4 text-[#ff9f2e] mr-2 shrink-0" aria-hidden="true" />
                    <span>{tvModel}</span>
                  </div>
                </TelemetryTile>

                <TelemetryTile label="Tizen Platform">
                  <div className="text-lg font-semibold text-[#F5E5E5]">{tizenPlatform}</div>
                </TelemetryTile>

                <TelemetryTile label="AVPlay Engine">
                  <div className="text-lg font-semibold text-[#F5E5E5]">{avplayStatus}</div>
                </TelemetryTile>

                <TelemetryTile label="Viewport">
                  <div className="text-lg font-mono font-semibold text-[#F5E5E5]">
                    {viewportLabel}
                  </div>
                </TelemetryTile>
              </div>
            </SettingCard>

            <SettingCard
              title="Server Connection"
              description="Live discovery probe measuring server identity, version, and round-trip latency."
            >
              <div className="rounded-xl bg-[#1a1b21] border border-[rgba(255,255,255,0.08)] p-4 mb-4">
                <div className="flex items-center justify-between flex-wrap">
                  <div className="flex items-center mr-4">
                    <Wifi className="w-5 h-5 text-[#10b981] mr-2.5 shrink-0" aria-hidden="true" />
                    <div>
                      <div className="text-base font-bold text-[#F5E5E5]">
                        {probeState.status === 'online'
                          ? `${probeState.serverName} (v${probeState.serverVersion})`
                          : probeState.status === 'probing'
                          ? 'Probing server...'
                          : probeState.status === 'error'
                          ? `Server Unreachable (${probeState.error})`
                          : 'Waiting for probe'}
                      </div>
                      <div className="text-xs font-mono text-[#a8a29e]">
                        {cleanServerUrl}/api/v1/discovery
                      </div>
                    </div>
                  </div>
                  {probeState.status === 'online' && probeState.latencyMs !== undefined && (
                    <span className="px-3 py-1 rounded-full text-sm font-mono font-bold bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/40">
                      {probeState.latencyMs} ms
                    </span>
                  )}
                </div>
              </div>

              <SettingActionButton
                id="settings-ping-server-btn"
                label="Refresh Server Diagnostics"
                order={10}
                icon={<RefreshCw className="w-5 h-5" />}
                onSelect={handlePingServer}
              />
            </SettingCard>

            <SettingCard
              title="Reset Preferences"
              description="Restore HLS quality, player engine, audio/subtitle defaults, delays, and audiobook speed."
              isLast
            >
              {resetNotice && (
                <p role="status" className="text-sm font-semibold text-[#10b981] mb-3">
                  {resetNotice}
                </p>
              )}
              <SettingActionButton
                id="settings-reset-prefs-btn"
                label="Reset All Playback & Subtitle Preferences"
                order={20}
                icon={<RotateCcw className="w-5 h-5" />}
                variant="danger"
                onSelect={handleResetAllPreferences}
              />
            </SettingCard>
          </div>
        )}
      </section>
    </div>
  );
}
