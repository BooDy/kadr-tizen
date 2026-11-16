import { useState, useEffect, useContext, useRef } from 'react';
import type { CSSProperties } from 'react';
import { Check, Download, Globe, ListFilter, X, Search, Loader2, Type, Clock } from 'lucide-react';
import { SubtitleTrack } from '../../types/kadr';
import { ApiClient } from '../../api/client';
import { TVKeys } from '../../navigation/keys';
import { FocusContext } from '../../navigation/FocusContext';
import { isTextInputElement } from '../../navigation/useFocusable';
import { TVButton } from '../tv/TVButton';
import { SubtitleOverlay } from './SubtitleOverlay';
import { formatSubtitleTrackLabel } from '../../player/subtitles';
import {
  COLOR_OPTIONS,
  FONT_SIZE_OPTIONS,
  PLACEMENT_OPTIONS,
  SubtitleSettings,
  clampSubtitleDelay,
  formatSubtitleDelay,
} from '../../player/subtitleSettings';

export interface SubtitleModalProps {
  isOpen: boolean;
  itemId: string | number;
  apiClient: ApiClient;
  subtitles: SubtitleTrack[];
  selectedSubtitleId: number | null;
  onSelectSubtitle: (id: number | null) => void;
  onSubtitleDownloaded?: (track: SubtitleTrack) => void;
  /** Current subtitle appearance. The Appearance tab is only shown when `onChangeSettings` is provided. */
  settings?: SubtitleSettings;
  onChangeSettings?: (settings: SubtitleSettings) => void;
  /** Timing offset of the selected track in ms (positive = subtitles appear later). */
  delayMs?: number;
  /** Enables the Timing tab (only offered while a subtitle track is selected). */
  onChangeDelay?: (delayMs: number) => void;
  /** Live state of the downloaded subtitle file, shown in the Timing tab so the effect is visible. */
  subtitleStatus?: {
    loading: boolean;
    error: string | null;
    cueCount: number;
    /** Line that is shown right now (after applying the delay). */
    currentText: string;
  };
  onClose: () => void;
}

const LANGUAGES = [
  { code: 'eng', name: 'English' },
  { code: 'ara', name: 'Arabic' },
  { code: 'fre', name: 'French' },
  { code: 'spa', name: 'Spanish' },
  { code: 'ger', name: 'German' },
  { code: 'all', name: 'All Languages' },
];

interface SubModalButtonProps {
  id: string;
  order?: number;
  autoFocus?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'nav-active' | 'nav-inactive';
  disabled?: boolean;
  onClick?: (e?: any) => void;
  onEnter?: () => void;
  className?: string;
  children: React.ReactNode;
  'data-testid'?: string;
  'aria-label'?: string;
  style?: CSSProperties;
}

function SubModalButton({
  id,
  order,
  autoFocus,
  variant = 'secondary',
  disabled = false,
  onClick,
  onEnter,
  className = '',
  children,
  'data-testid': testId,
  'aria-label': ariaLabel,
  style,
}: SubModalButtonProps) {
  const focusCtx = useContext(FocusContext);
  if (focusCtx) {
    return (
      <TVButton
        id={id}
        groupId="subtitle-modal"
        order={order}
        autoFocus={autoFocus}
        variant={variant}
        disabled={disabled}
        onClick={onClick}
        onEnter={onEnter || onClick}
        className={className}
        data-testid={testId}
        aria-label={ariaLabel}
        style={style}
      >
        {children}
      </TVButton>
    );
  }

  return (
    <button
      id={id}
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={className}
      data-testid={testId}
      aria-label={ariaLabel}
      style={style}
    >
      {children}
    </button>
  );
}

export function SubtitleModal({
  isOpen,
  itemId,
  apiClient,
  subtitles,
  selectedSubtitleId,
  onSelectSubtitle,
  onSubtitleDownloaded,
  settings,
  onChangeSettings,
  delayMs = 0,
  onChangeDelay,
  subtitleStatus,
  onClose,
}: SubtitleModalProps) {
  const [activeTab, setActiveTab] = useState<'tracks' | 'search' | 'appearance' | 'timing'>('tracks');
  const hasAppearance = Boolean(settings && onChangeSettings);
  const hasTiming = Boolean(onChangeDelay) && selectedSubtitleId !== null;
  const [selectedLang, setSelectedLang] = useState<string>('eng');
  const [isSearching, setIsSearching] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const focusCtx = useContext(FocusContext);
  const pushTrap = focusCtx?.pushTrap;
  const popTrap = focusCtx?.popTrap;
  const setFocusedId = focusCtx?.setFocusedId;
  const activeTrap = focusCtx?.activeTrap;
  const activeTrapRef = useRef(activeTrap);
  activeTrapRef.current = activeTrap;

  const subtitlesRef = useRef(subtitles);
  subtitlesRef.current = subtitles;
  const selectedSubtitleIdRef = useRef(selectedSubtitleId);
  selectedSubtitleIdRef.current = selectedSubtitleId;

  // Manage modal focus trap
  useEffect(() => {
    if (isOpen && pushTrap && popTrap) {
      pushTrap('subtitle-modal');
      return () => {
        popTrap('subtitle-modal');
      };
    }
  }, [isOpen, pushTrap, popTrap]);

  // Initial focus on modal open
  const isOpenedRef = useRef(false);
  const prevTabRef = useRef(activeTab);

  useEffect(() => {
    if (!isOpen) {
      isOpenedRef.current = false;
      return;
    }

    if (!isOpenedRef.current && setFocusedId) {
      isOpenedRef.current = true;
      prevTabRef.current = activeTab;
      const initialId =
        activeTab === 'tracks'
          ? selectedSubtitleIdRef.current !== null &&
            subtitlesRef.current.some((t) => t.id === selectedSubtitleIdRef.current)
            ? `sub-track-${selectedSubtitleIdRef.current}`
            : 'sub-track-off'
          : activeTab === 'appearance'
          ? `sub-set-size-${settings?.fontSize ?? 'medium'}`
          : activeTab === 'timing'
          ? 'sub-delay-minus-100'
          : 'sub-tab-search';
      setFocusedId(initialId);
    }
  }, [isOpen, activeTab, setFocusedId]);

  // Shift focus when switching tabs
  useEffect(() => {
    if (!isOpen || !setFocusedId) return;
    if (prevTabRef.current !== activeTab) {
      prevTabRef.current = activeTab;
      if (activeTab === 'search') {
        setFocusedId('sub-lang-eng');
      } else if (activeTab === 'appearance') {
        setFocusedId(`sub-set-size-${settings?.fontSize ?? 'medium'}`);
      } else if (activeTab === 'timing') {
        setFocusedId('sub-delay-minus-100');
      } else {
        const initialId =
          selectedSubtitleIdRef.current !== null &&
          subtitlesRef.current.some((t) => t.id === selectedSubtitleIdRef.current)
            ? `sub-track-${selectedSubtitleIdRef.current}`
            : 'sub-track-off';
        setFocusedId(initialId);
      }
    }
  }, [activeTab, isOpen, setFocusedId]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (activeTrapRef.current && activeTrapRef.current !== 'subtitle-modal') return;
      const activeEl =
        (typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null) ||
        (e.target as HTMLElement | null);
      const isEditing = isTextInputElement(activeEl);
      const code = e.keyCode || e.which;

      if ((code === TVKeys.BACKSPACE || e.key === 'Backspace') && isEditing) {
        return;
      }
      if (
        code === TVKeys.BACK_TIZEN ||
        code === TVKeys.BACK_WEB ||
        code === TVKeys.BACKSPACE ||
        e.key === 'Escape'
      ) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (isEditing && activeEl && typeof activeEl.blur === 'function') {
          activeEl.blur();
          return;
        }
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose]);

  const handleSearch = async (langCode: string) => {
    setSelectedLang(langCode);
    setIsSearching(true);
    setSearchError(null);
    setSearchResults([]);

    try {
      const queryParam = langCode === 'all' ? '' : `?languages=${langCode}`;
      const res = await apiClient.fetch<{ configured: boolean; matches: any[] }>(
        `/api/v1/subtitles/${itemId}/search${queryParam}`
      );
      if (!res || !res.configured) {
        setSearchError('OpenSubtitles is not configured on the server.');
      } else {
        setSearchResults(res.matches || []);
      }
    } catch (err: any) {
      setSearchError(err?.message || 'Failed to search online subtitles.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleDownload = async (match: any) => {
    setDownloadingId(match.file_id);
    try {
      const downloadedTrack = await apiClient.fetch<SubtitleTrack>(
        `/api/v1/subtitles/${itemId}/download`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            file_id: match.file_id,
            language: match.language,
            title: match.title || match.file_name || `Subtitle ${match.file_id}`,
            is_forced: match.hearing_impaired || false,
          }),
        }
      );
      onSubtitleDownloaded?.(downloadedTrack);
      onSelectSubtitle(downloadedTrack.id);
      onClose();
    } catch (err: any) {
      setSearchError(err?.message || 'Failed to download subtitle track.');
    } finally {
      setDownloadingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Subtitles"
      data-testid="subtitles-popup"
      className="fixed inset-0 bg-black/80 backdrop-blur-md z-[70] flex items-center justify-center p-8 select-none pointer-events-auto"
      style={
        activeTab === 'timing' && hasTiming
          ? {
              // Keep the video and its subtitles visible while syncing; dock the panel opposite them
              background: 'rgba(0,0,0,0.12)',
              backdropFilter: 'none',
              WebkitBackdropFilter: 'none',
              alignItems: settings?.placement === 'top' ? 'flex-end' : 'flex-start',
            }
          : undefined
      }
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-[1000px] max-w-[90vw] max-h-[85vh] bg-[#2A0A0A] border border-[rgba(245,229,229,0.15)] rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-[rgba(245,229,229,0.08)] bg-[#3B1111]">
          <div className="flex items-center">
            <h2 className="text-2xl font-black text-[#F5E5E5] flex items-center mr-6">
              <Globe className="w-7 h-7 text-[#FF6B00] mr-3" /> Subtitles
            </h2>
            <div className="flex items-center bg-[#2A0A0A] p-1 rounded-xl border border-[rgba(245,229,229,0.08)]">
              <SubModalButton
                id="sub-tab-tracks"
                order={1}
                variant={activeTab === 'tracks' ? 'primary' : 'secondary'}
                onClick={() => setActiveTab('tracks')}
                className={`!px-5 !py-2 rounded-lg font-bold text-sm transition-all cursor-pointer ${
                  activeTab === 'tracks'
                    ? '!bg-[#FF6B00] !text-white shadow-lg'
                    : '!text-[#F5E5E5]/70 hover:!text-white !bg-[#2A0A0A]'
                }`}
              >
                <ListFilter className="w-4 h-4 inline mr-2" /> Current Tracks ({subtitles.length})
              </SubModalButton>
              <SubModalButton
                id="sub-tab-search"
                order={2}
                variant={activeTab === 'search' ? 'primary' : 'secondary'}
                onClick={() => {
                  setActiveTab('search');
                  focusCtx?.setFocusedId('sub-lang-eng');
                  if (searchResults.length === 0 && !isSearching) {
                    handleSearch(selectedLang);
                  }
                }}
                className={`!px-5 !py-2 !ml-2 rounded-lg font-bold text-sm transition-all cursor-pointer ${
                  activeTab === 'search'
                    ? '!bg-[#FF6B00] !text-white shadow-lg'
                    : '!text-[#F5E5E5]/70 hover:!text-white !bg-[#2A0A0A]'
                }`}
              >
                <Search className="w-4 h-4 inline mr-2" /> Search Online
              </SubModalButton>
              {hasAppearance && (
                <SubModalButton
                  id="sub-tab-appearance"
                  order={3}
                  variant={activeTab === 'appearance' ? 'primary' : 'secondary'}
                  onClick={() => setActiveTab('appearance')}
                  className={`!px-5 !py-2 !ml-2 rounded-lg font-bold text-sm transition-all cursor-pointer ${
                    activeTab === 'appearance'
                      ? '!bg-[#FF6B00] !text-white shadow-lg'
                      : '!text-[#F5E5E5]/70 hover:!text-white !bg-[#2A0A0A]'
                  }`}
                >
                  <Type className="w-4 h-4 inline mr-2" /> Appearance
                </SubModalButton>
              )}
              {hasTiming && (
                <SubModalButton
                  id="sub-tab-timing"
                  order={4}
                  variant={activeTab === 'timing' ? 'primary' : 'secondary'}
                  onClick={() => setActiveTab('timing')}
                  className={`!px-5 !py-2 !ml-2 rounded-lg font-bold text-sm transition-all cursor-pointer ${
                    activeTab === 'timing'
                      ? '!bg-[#FF6B00] !text-white shadow-lg'
                      : '!text-[#F5E5E5]/70 hover:!text-white !bg-[#2A0A0A]'
                  }`}
                >
                  <Clock className="w-4 h-4 inline mr-2" /> Timing
                </SubModalButton>
              )}
            </div>
          </div>
          <SubModalButton
            id="sub-modal-close"
            order={5}
            variant="secondary"
            onClick={onClose}
            className="!p-2.5 !rounded-full hover:!bg-white/10 !text-[#F5E5E5]/70 hover:!text-white transition cursor-pointer"
            aria-label="Close"
          >
            <X className="w-6 h-6" />
          </SubModalButton>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-8 scrollbar-none">
          {activeTab === 'timing' && hasTiming && onChangeDelay ? (
            <div data-testid="subtitle-timing-panel" style={{ textAlign: 'center' }}>
              <div
                className="text-[#F5E5E5]/70"
                style={{ fontSize: '16px', marginBottom: '8px' }}
              >
                Subtitle delay for this track
              </div>
              <div
                data-testid="subtitle-delay-value"
                className="font-black"
                style={{
                  fontSize: '44px',
                  lineHeight: '52px',
                  marginBottom: '6px',
                  color: delayMs === 0 ? '#F5E5E5' : '#FFB871',
                }}
              >
                {formatSubtitleDelay(delayMs)}
              </div>
              <div
                className="text-[#F5E5E5]/60"
                style={{ fontSize: '15px', marginBottom: '22px' }}
              >
                {delayMs === 0
                  ? 'In sync with the file. Use + if the subtitles appear too early, \u2212 if too late.'
                  : delayMs > 0
                  ? 'Subtitles appear later than in the file.'
                  : 'Subtitles appear earlier than in the file.'}
              </div>
              {subtitleStatus && (
                <div
                  data-testid="subtitle-delay-status"
                  style={{
                    margin: '0 auto 20px auto',
                    padding: '10px 16px',
                    maxWidth: '760px',
                    borderRadius: '10px',
                    background: 'rgba(0,0,0,0.35)',
                    border: '1px solid rgba(245,229,229,0.12)',
                    fontSize: '15px',
                    color: subtitleStatus.error ? '#fca5a5' : '#F5E5E5',
                  }}
                >
                  {subtitleStatus.loading ? (
                    <span>Loading subtitle file…</span>
                  ) : subtitleStatus.error ? (
                    <span>Subtitle file problem: {subtitleStatus.error}</span>
                  ) : (
                    <>
                      <span style={{ color: '#a8a29e' }}>
                        {subtitleStatus.cueCount} lines loaded · Showing now:{' '}
                      </span>
                      <span style={{ whiteSpace: 'pre-line', fontWeight: 700, color: '#FFB871' }}>
                        {subtitleStatus.currentText || '(no line at this moment)'}
                      </span>
                    </>
                  )}
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
                {[
                  ['minus-5000', '\u22125s', -5000],
                  ['minus-1000', '\u22121s', -1000],
                  ['minus-100', '\u22120.1s', -100],
                  ['plus-100', '+0.1s', 100],
                  ['plus-1000', '+1s', 1000],
                  ['plus-5000', '+5s', 5000],
                ].map(([key, label, step], idx) => (
                  <SubModalButton
                    key={key as string}
                    id={`sub-delay-${key}`}
                    order={300 + idx}
                    data-testid={`sub-delay-${key}`}
                    aria-label={`Adjust subtitle delay ${label}`}
                    variant="secondary"
                    onClick={() => onChangeDelay(clampSubtitleDelay(delayMs + (step as number)))}
                    className="!rounded-xl font-bold !text-lg border transition cursor-pointer !bg-[#3B1111]/60 !border-[rgba(245,229,229,0.08)] !text-[#F5E5E5] hover:!bg-[#3B1111]"
                    style={{ padding: '14px 22px', margin: '0 6px 12px 6px', minWidth: '104px' }}
                  >
                    <span>{label as string}</span>
                  </SubModalButton>
                ))}
              </div>
              <SubModalButton
                id="sub-delay-reset"
                order={310}
                data-testid="sub-delay-reset"
                aria-label="Reset subtitle delay"
                variant="secondary"
                disabled={delayMs === 0}
                onClick={() => onChangeDelay(0)}
                className="!rounded-xl font-bold !text-base border transition cursor-pointer !bg-[#292a2f] !border-[rgba(255,122,24,0.18)] !text-[#e3e1e9]"
                style={{ padding: '12px 24px', marginTop: '4px' }}
              >
                <span>Reset to 0.0s</span>
              </SubModalButton>
            </div>
          ) : activeTab === 'appearance' && settings && onChangeSettings ? (
            <div data-testid="subtitle-appearance-panel">
              {/* Live preview (miniature 16:9 screen) */}
              <div
                data-testid="subtitle-preview"
                style={{
                  position: 'relative',
                  width: '480px',
                  height: '270px',
                  margin: '0 auto 28px auto',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  border: '1px solid rgba(245,229,229,0.15)',
                  background: 'linear-gradient(135deg, #1b2a3a 0%, #0d1117 55%, #2b1a14 100%)',
                }}
              >
                <SubtitleOverlay
                  text={'The quick brown fox\njumps over the lazy dog'}
                  settings={settings}
                  scale={0.25}
                />
              </div>

              {([
                ['size', 'Font Size', FONT_SIZE_OPTIONS, settings.fontSize, 'fontSize'],
                ['color', 'Color', COLOR_OPTIONS, settings.color, 'color'],
                ['place', 'Placement', PLACEMENT_OPTIONS, settings.placement, 'placement'],
              ] as const).map(([key, label, options, current, field], rowIdx) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', marginBottom: '20px' }}>
                  <div
                    className="text-lg font-bold text-[#F5E5E5]"
                    style={{ width: '170px', flexShrink: 0 }}
                  >
                    {label}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                    {options.map((opt, optIdx) => {
                      const isSelected = current === opt.value;
                      return (
                        <SubModalButton
                          key={opt.value}
                          id={`sub-set-${key}-${opt.value}`}
                          order={200 + rowIdx * 10 + optIdx}
                          data-testid={`sub-set-${key}-${opt.value}`}
                          aria-label={`${label}: ${opt.label}`}
                          variant={isSelected ? 'primary' : 'secondary'}
                          onClick={() =>
                            onChangeSettings({ ...settings, [field]: opt.value } as SubtitleSettings)
                          }
                          className={`!rounded-xl font-bold !text-base border transition cursor-pointer ${
                            isSelected
                              ? '!bg-[#FF6B00]/20 !border-[#FF6B00] !text-[#FF6B00]'
                              : '!bg-[#3B1111]/60 !border-[rgba(245,229,229,0.08)] !text-[#F5E5E5] hover:!bg-[#3B1111]'
                          }`}
                          style={{ padding: '12px 22px', marginRight: '12px' }}
                        >
                          {isSelected && (
                            <Check className="w-5 h-5" style={{ marginRight: '8px' }} />
                          )}
                          <span>{opt.label}</span>
                        </SubModalButton>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : activeTab === 'tracks' ? (
            <div className="space-y-3">
              {/* Off Track */}
              <SubModalButton
                id="sub-track-off"
                order={10}
                data-testid="subtitle-option-off"
                variant={selectedSubtitleId === null ? 'primary' : 'secondary'}
                onClick={() => {
                  onSelectSubtitle(null);
                  onClose();
                }}
                className={`w-full !flex !items-center !justify-between !px-6 !py-4 !rounded-2xl font-bold !text-lg border transition cursor-pointer text-left ${
                  selectedSubtitleId === null
                    ? '!bg-[#FF6B00]/20 !border-[#FF6B00] !text-[#FF6B00]'
                    : '!bg-[#3B1111]/60 !border-[rgba(245,229,229,0.08)] !text-[#F5E5E5] hover:!bg-[#3B1111]'
                }`}
              >
                <span>Off</span>
                {selectedSubtitleId === null && <Check className="w-6 h-6" />}
              </SubModalButton>

              {subtitles.map((track, idx) => {
                const isSelected = selectedSubtitleId === track.id;
                const trackLabel = formatSubtitleTrackLabel(track);
                const isEmbedded = track.source === 'embedded';
                return (
                  <SubModalButton
                    key={track.id}
                    id={`sub-track-${track.id}`}
                    order={11 + idx}
                    data-testid={`subtitle-option-${track.id}`}
                    variant={isSelected ? 'primary' : 'secondary'}
                    onClick={() => {
                      onSelectSubtitle(track.id);
                      onClose();
                    }}
                    className={`w-full !flex !items-center !justify-between !px-6 !py-4 !rounded-2xl font-bold !text-lg border transition cursor-pointer text-left ${
                      isSelected
                        ? '!bg-[#FF6B00]/20 !border-[#FF6B00] !text-[#FF6B00]'
                        : '!bg-[#3B1111]/60 !border-[rgba(245,229,229,0.08)] !text-[#F5E5E5] hover:!bg-[#3B1111]'
                    }`}
                  >
                    <div className="flex items-center">
                      <span>{trackLabel}</span>
                      {isEmbedded && (
                        <span className="ml-2 text-xs px-2 py-0.5 rounded bg-white/10 text-[#F5E5E5]/80">
                          Embedded
                        </span>
                      )}
                      {track.is_forced && (
                        <span className="ml-2 text-xs px-2 py-0.5 rounded bg-[#D43F15]/25 text-[#FF6B00]">
                          Forced
                        </span>
                      )}
                      {track.is_default && (
                        <span className="ml-2 text-xs px-2 py-0.5 rounded bg-[#FFB800]/20 text-[#FFB800]">
                          Default
                        </span>
                      )}
                    </div>
                    {isSelected && <Check className="w-6 h-6" />}
                  </SubModalButton>
                );
              })}
            </div>
          ) : (
            <div>
              {/* Language Picker */}
              <div className="flex items-center overflow-x-auto pb-4 mb-6 border-b border-[rgba(245,229,229,0.08)]">
                {LANGUAGES.map((lang, idx) => (
                  <SubModalButton
                    key={lang.code}
                    id={`sub-lang-${lang.code}`}
                    order={50 + idx}
                    autoFocus={activeTab === 'search' && idx === 0}
                    data-testid={`lang-btn-${lang.code}`}
                    variant={selectedLang === lang.code ? 'primary' : 'secondary'}
                    onClick={() => handleSearch(lang.code)}
                    className={`!px-5 !py-2.5 !rounded-full font-bold !text-sm shrink-0 transition cursor-pointer ${idx > 0 ? '!ml-3' : ''} ${
                      selectedLang === lang.code
                        ? '!bg-[#FF6B00] !text-white shadow'
                        : '!bg-[#3B1111] !text-[#F5E5E5]/70 hover:!text-white border !border-[rgba(245,229,229,0.08)]'
                    }`}
                  >
                    {lang.name}
                  </SubModalButton>
                ))}
              </div>

              {/* Status / Results */}
              {isSearching && (
                <div className="flex flex-col items-center justify-center py-16 text-[#F5E5E5]/70">
                  <Loader2 className="w-10 h-10 animate-spin text-[#FF6B00] mb-4" />
                  <p className="text-lg font-bold">Searching OpenSubtitles...</p>
                </div>
              )}

              {searchError && (
                <div className="p-4 bg-red-900/30 border border-red-500/50 rounded-2xl text-red-200 mb-6">
                  {searchError}
                </div>
              )}

              {!isSearching && searchResults.length === 0 && !searchError && (
                <div className="text-center py-16 text-[#F5E5E5]/60 text-lg">
                  No online subtitles found for this language.
                </div>
              )}

              <div className="space-y-3">
                {searchResults.map((match, idx) => (
                  <div
                    key={match.file_id}
                    className="flex items-center justify-between p-4 bg-[#3B1111]/70 border border-[rgba(245,229,229,0.08)] rounded-2xl"
                  >
                    <div className="flex-1 min-w-0 mr-4">
                      <div className="text-base font-bold text-[#F5E5E5] truncate">
                        {match.title || match.file_name || `Subtitle ${match.file_id}`}
                      </div>
                      <div className="flex items-center text-xs text-[#F5E5E5]/60 mt-1">
                        <span className="uppercase font-bold text-[#FFB800] mr-3">{match.language}</span>
                        <span className={match.download_count !== undefined ? 'mr-3' : ''}>Format: {match.format || 'srt'}</span>
                        {match.download_count !== undefined && (
                          <span>Downloads: {match.download_count}</span>
                        )}
                      </div>
                    </div>
                    <SubModalButton
                      id={`sub-dl-${match.file_id}`}
                      order={100 + idx}
                      disabled={downloadingId === match.file_id}
                      onClick={() => handleDownload(match)}
                      variant="primary"
                      className="!px-5 !py-2.5 !rounded-xl font-bold !bg-[#FF6B00] !text-white !flex items-center hover:!bg-[#FF8533] disabled:opacity-50 transition cursor-pointer !text-sm"
                    >
                      {downloadingId === match.file_id ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <Download className="w-4 h-4 mr-2" />
                      )}
                      <span>Download & Activate</span>
                    </SubModalButton>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
