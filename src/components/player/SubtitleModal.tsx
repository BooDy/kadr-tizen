import React, { useState, useEffect } from 'react';
import { Check, Download, Globe, ListFilter, X, Search, Loader2 } from 'lucide-react';
import { SubtitleTrack } from '../../types/kadr';
import { ApiClient } from '../../api/client';
import { TVKeys } from '../../navigation/keys';
import { FocusContext } from '../../navigation/FocusContext';

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
  const focusCtx = React.useContext(FocusContext);

  useEffect(() => {
    if (isOpen && focusCtx) {
      focusCtx.pushTrap('subtitle-modal');
      return () => {
        focusCtx.popTrap();
      };
    }
  }, [isOpen, focusCtx]);

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
              <button
                type="button"
                onClick={() => setActiveTab('tracks')}
                className={`px-5 py-2 rounded-lg font-bold text-sm transition-all cursor-pointer ${
                  activeTab === 'tracks'
                    ? 'bg-[#FF6B00] text-white shadow-lg'
                    : 'text-[#F5E5E5]/70 hover:text-white'
                }`}
              >
                <ListFilter className="w-4 h-4 inline mr-2" /> Current Tracks ({subtitles.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('search');
                  if (searchResults.length === 0 && !isSearching) {
                    handleSearch(selectedLang);
                  }
                }}
                className={`px-5 py-2 rounded-lg font-bold text-sm transition-all cursor-pointer ${
                  activeTab === 'search'
                    ? 'bg-[#FF6B00] text-white shadow-lg'
                    : 'text-[#F5E5E5]/70 hover:text-white'
                }`}
              >
                <Search className="w-4 h-4 inline mr-2" /> Search Online
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2.5 rounded-full hover:bg-white/10 text-[#F5E5E5]/70 hover:text-white transition cursor-pointer"
            aria-label="Close"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-8 scrollbar-none">
          {activeTab === 'tracks' ? (
            <div className="space-y-3">
              {/* Off Track */}
              <button
                type="button"
                data-testid="subtitle-option-off"
                onClick={() => {
                  onSelectSubtitle(null);
                  onClose();
                }}
                className={`w-full flex items-center justify-between px-6 py-4 rounded-2xl font-bold text-lg border transition cursor-pointer ${
                  selectedSubtitleId === null
                    ? 'bg-[#FF6B00]/20 border-[#FF6B00] text-[#FF6B00]'
                    : 'bg-[#3B1111]/60 border-[rgba(245,229,229,0.08)] text-[#F5E5E5] hover:bg-[#3B1111]'
                }`}
              >
                <span>Off</span>
                {selectedSubtitleId === null && <Check className="w-6 h-6" />}
              </button>

              {subtitles.map((track) => {
                const isSelected = selectedSubtitleId === track.id;
                const trackLabel = `${track.title || `Track ${track.id}`} (${track.language})`;
                return (
                  <button
                    key={track.id}
                    type="button"
                    data-testid={`subtitle-option-${track.id}`}
                    onClick={() => {
                      onSelectSubtitle(track.id);
                      onClose();
                    }}
                    className={`w-full flex items-center justify-between px-6 py-4 rounded-2xl font-bold text-lg border transition cursor-pointer ${
                      isSelected
                        ? 'bg-[#FF6B00]/20 border-[#FF6B00] text-[#FF6B00]'
                        : 'bg-[#3B1111]/60 border-[rgba(245,229,229,0.08)] text-[#F5E5E5] hover:bg-[#3B1111]'
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
                  </button>
                );
              })}
            </div>
          ) : (
            <div>
              {/* Language Picker */}
              <div className="flex items-center gap-3 overflow-x-auto pb-4 mb-6 border-b border-[rgba(245,229,229,0.08)]">
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    type="button"
                    data-testid={`lang-btn-${lang.code}`}
                    onClick={() => handleSearch(lang.code)}
                    className={`px-5 py-2.5 rounded-full font-bold text-sm shrink-0 transition cursor-pointer ${
                      selectedLang === lang.code
                        ? 'bg-[#FF6B00] text-white shadow'
                        : 'bg-[#3B1111] text-[#F5E5E5]/70 hover:text-white border border-[rgba(245,229,229,0.08)]'
                    }`}
                  >
                    {lang.name}
                  </button>
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
                {searchResults.map((match) => (
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
                    <button
                      type="button"
                      disabled={downloadingId === match.file_id}
                      onClick={() => handleDownload(match)}
                      className="px-5 py-2.5 rounded-xl font-bold bg-[#FF6B00] text-white flex items-center gap-2 hover:bg-[#FF8533] disabled:opacity-50 transition cursor-pointer"
                    >
                      {downloadingId === match.file_id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                      <span>Download & Activate</span>
                    </button>
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
