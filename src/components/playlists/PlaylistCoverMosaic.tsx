import { useState, useEffect, memo, type CSSProperties } from 'react';
import { Globe, Lock, ListVideo } from 'lucide-react';
import { getAuthenticatedImageUrl } from '../../utils/imageUrl';

export interface PlaylistCoverMosaicProps {
  coverPosterUrls: string[];
  serverUrl: string;
  token?: string;
  unlockTokens?: string[];
  lockedItemCount?: number;
  isPublic?: boolean;
  showBadges?: boolean;
  title?: string;
  className?: string;
  style?: CSSProperties;
}

export const PlaylistCoverMosaic = memo(function PlaylistCoverMosaic({
  coverPosterUrls,
  serverUrl,
  token,
  unlockTokens,
  lockedItemCount = 0,
  isPublic = false,
  showBadges = true,
  title = 'Playlist cover',
  className = '',
  style,
}: PlaylistCoverMosaicProps) {
  const [failedIndices, setFailedIndices] = useState<Record<number, boolean>>({});

  const urlsKey = `${serverUrl}|${token || ''}|${(unlockTokens || []).join(',')}|${(
    coverPosterUrls || []
  ).join('|')}`;

  useEffect(() => {
    setFailedIndices({});
  }, [urlsKey]);

  const resolvedEntries = (coverPosterUrls || [])
    .slice(0, 4)
    .map((rawUrl, index) => ({
      index,
      authUrl: getAuthenticatedImageUrl(serverUrl, rawUrl, token, unlockTokens),
    }))
    .filter(
      (entry): entry is { index: number; authUrl: string } =>
        Boolean(entry.authUrl) && !failedIndices[entry.index]
    );

  const handleImgError = (originalIndex: number) => {
    setFailedIndices((prev) => ({ ...prev, [originalIndex]: true }));
  };

  return (
    <div
      data-testid="playlist-cover-mosaic"
      className={`relative overflow-hidden bg-[#1a1b21] select-none ${className}`}
      style={style}
    >
      {resolvedEntries.length >= 4 ? (
        <div
          data-testid="playlist-cover-mosaic-grid"
          className="grid grid-cols-2 grid-rows-2 w-full h-full bg-[#0d0e15]"
          style={{ display: 'grid', gridGap: '2px' }}
        >
          {resolvedEntries.slice(0, 4).map((entry, tileIdx) => (
            <div key={`${entry.index}-${tileIdx}`} className="w-full h-full overflow-hidden bg-[#1a1b21]">
              <img
                src={entry.authUrl}
                alt={`${title} tile ${tileIdx + 1}`}
                onError={() => handleImgError(entry.index)}
                className="w-full h-full object-cover"
                loading="lazy"
                decoding="async"
              />
            </div>
          ))}
        </div>
      ) : resolvedEntries.length >= 1 ? (
        <img
          data-testid="playlist-cover-single"
          src={resolvedEntries[0].authUrl}
          alt={title}
          onError={() => handleImgError(resolvedEntries[0].index)}
          className="w-full h-full object-cover"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <div
          data-testid="playlist-cover-placeholder"
          className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#281216] via-[#1a1b21] to-[#0d0e15]"
        >
          <ListVideo className="w-14 h-14 text-[#ff9f2e]/50" />
        </div>
      )}

      {showBadges && (
        <>
          <div
            data-testid="playlist-visibility-badge"
            className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-[#0d0e15]/95 border border-[rgba(255,255,255,0.14)] flex items-center font-mono text-xs font-bold text-[#e3e1e9] z-10"
          >
            {isPublic ? (
              <>
                <Globe
                  className="w-3.5 h-3.5 text-[#10b981] shrink-0"
                  style={{ marginRight: '6px' }}
                />
                <span>Public</span>
              </>
            ) : (
              <>
                <Lock
                  className="w-3.5 h-3.5 text-[#ffb871] shrink-0"
                  style={{ marginRight: '6px' }}
                />
                <span>Private</span>
              </>
            )}
          </div>

          {lockedItemCount > 0 && (
            <div
              data-testid="playlist-locked-badge"
              className="absolute bottom-3 right-3 px-2.5 py-1 rounded-md bg-[#281216]/95 border border-[#ff7a18]/50 flex items-center font-mono text-xs font-bold text-[#ffb871] z-10"
            >
              <Lock
                className="w-3.5 h-3.5 text-[#ff9f2e] shrink-0"
                style={{ marginRight: '6px' }}
              />
              <span>+{lockedItemCount} locked</span>
            </div>
          )}
        </>
      )}
    </div>
  );
});
