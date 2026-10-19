import { useState, useEffect, useContext, useRef } from 'react';
import { Check, Download, Globe, ListFilter, X, Search, Loader2 } from 'lucide-react';
import { SubtitleTrack } from '../../types/kadr';
import { ApiClient } from '../../api/client';
import { TVKeys } from '../../navigation/keys';
import { FocusContext } from '../../navigation/FocusContext';
import { TVButton } from '../tv/TVButton';

export interface SubtitleModalProps {
  isOpen: boolean;
  itemId: string | number;
  apiClient: ApiClient;
  subtitles: SubtitleTrack[];
  selectedSubtitleId: number | null;
  onSelectSubtitle: (id: number | null) => void;
  onSubtitleDownloaded?: (track: SubtitleTrack) => void;
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
  onClose,
}: SubtitleModalProps) {
  const [activeTab, setActiveTab] = useState<'tracks' | 'search'>('tracks');
  const [selectedLang, setSelectedLang] = useState<string>('eng');
  const [isSearching, setIsSearching] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const focusCtx = useContext(FocusContext);
  const pushTrap = focusCtx?.pushTrap;
  const popTrap = focusCtx?.popTrap;
  const setFocusedId = focusCtx?.setFocusedId;

  const subtitlesRef = useRef(subtitles);
  subtitlesRef.current = subtitles;
  const selectedSubtitleIdRef = useRef(selectedSubtitleId);
  selectedSubtitleIdRef.current = selectedSubtitleId;

  // Manage modal focus trap
  useEffect(() => {
    if (isOpen && pushTrap && popTrap) {
      pushTrap('subtitle-modal');
      return () => {
        popTrap();
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
      const code = e.keyCode || e.which;
      if (
        code === TVKeys.BACK_TIZEN ||
        code === TVKeys.BACK_WEB ||
        code === TVKeys.BACKSPACE ||
        e.key === 'Escape'
      ) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
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
            title: match.title,
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
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-[1000px] max-w-[90vw] max-h-[85vh] bg-[#2A0A0A] border border-[rgba(245,229,229,0.15)] rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-[rgba(245,229,229,0.08)] bg-[#3B1111]">
          <div className="flex items-center gap-6">
            <h2 className="text-2xl font-black text-[#F5E5E5] flex items-center gap-3">
              <Globe className="w-7 h-7 text-[#FF6B00]" /> Subtitles
            </h2>
            <div className="flex items-center gap-2 bg-[#2A0A0A] p-1 rounded-xl border border-[rgba(245,229,229,0.08)]">
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
                className={`!px-5 !py-2 rounded-lg font-bold text-sm transition-all cursor-pointer ${
                  activeTab === 'search'
                    ? '!bg-[#FF6B00] !text-white shadow-lg'
                    : '!text-[#F5E5E5]/70 hover:!text-white !bg-[#2A0A0A]'
                }`}
              >
                <Search className="w-4 h-4 inline mr-2" /> Search Online
              </SubModalButton>
            </div>
          </div>
          <SubModalButton
            id="sub-modal-close"
            order={3}
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
          {activeTab === 'tracks' ? (
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
                const trackLabel = `${track.title || `Track ${track.id}`} (${track.language})`;
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
                    <div className="flex items-center gap-3">
                      <span>{trackLabel}</span>
                      {track.is_default && (
                        <span className="text-xs px-2 py-0.5 rounded bg-[#FFB800]/20 text-[#FFB800]">
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
              <div className="flex items-center gap-3 overflow-x-auto pb-4 mb-6 border-b border-[rgba(245,229,229,0.08)]">
                {LANGUAGES.map((lang, idx) => (
                  <SubModalButton
                    key={lang.code}
                    id={`sub-lang-${lang.code}`}
                    order={50 + idx}
                    autoFocus={activeTab === 'search' && idx === 0}
                    data-testid={`lang-btn-${lang.code}`}
                    variant={selectedLang === lang.code ? 'primary' : 'secondary'}
                    onClick={() => handleSearch(lang.code)}
                    className={`!px-5 !py-2.5 !rounded-full font-bold !text-sm shrink-0 transition cursor-pointer ${
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
                      <div className="flex items-center gap-3 text-xs text-[#F5E5E5]/60 mt-1">
                        <span className="uppercase font-bold text-[#FFB800]">{match.language}</span>
                        <span>Format: {match.format || 'srt'}</span>
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
                      className="!px-5 !py-2.5 !rounded-xl font-bold !bg-[#FF6B00] !text-white !flex items-center gap-2 hover:!bg-[#FF8533] disabled:opacity-50 transition cursor-pointer !text-sm"
                    >
                      {downloadingId === match.file_id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Download className="w-4 h-4" />
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
