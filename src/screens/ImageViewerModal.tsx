import { useEffect, useState, useRef, useCallback, memo } from 'react';
import { FolderImage } from '../types/kadr';
import { useFocusContext } from '../navigation/FocusContext';
import { TVKeys } from '../navigation/keys';
import { Play, Pause, X, ImageIcon } from 'lucide-react';
import { getAuthenticatedImageUrl } from '../utils/imageUrl';
import { ApiClient } from '../api/client';

export interface ImageViewerModalProps {
  images: FolderImage[];
  initialIndex?: number;
  autoPlay?: boolean;
  serverUrl: string;
  onClose: () => void;
  token?: string;
  client?: ApiClient;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  if (i === 0) return `${bytes} B`;
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

interface FilmstripThumbnailProps {
  image: FolderImage;
  index: number;
  isLast: boolean;
  serverUrl: string;
  token?: string;
  unlockTokens: string[];
  isActive: boolean;
  isFilmstripFocused: boolean;
  onSelect: (index: number) => void;
  refCallback: (el: HTMLButtonElement | null) => void;
}

const FilmstripThumbnail = memo(function FilmstripThumbnail({
  image,
  index,
  isLast,
  serverUrl,
  token,
  unlockTokens,
  isActive,
  isFilmstripFocused,
  onSelect,
  refCallback,
}: FilmstripThumbnailProps) {
  const [hasError, setHasError] = useState(false);
  const thumbUrl = getAuthenticatedImageUrl(
    serverUrl,
    image.url || image.path,
    token,
    unlockTokens
  );

  useEffect(() => {
    setHasError(false);
  }, [thumbUrl]);

  return (
    <button
      ref={refCallback}
      data-testid={`filmstrip-thumb-${index}`}
      tabIndex={isFilmstripFocused && isActive ? 0 : -1}
      onClick={() => onSelect(index)}
      style={{ marginRight: isLast ? '0px' : '12px' }}
      className={`w-24 h-16 rounded-lg overflow-hidden border-2 flex-shrink-0 flex items-center justify-center bg-[#2A0A0A] transition-transform duration-75 cursor-pointer ${
        isActive ? 'border-[#FF6B00] scale-105' : 'border-transparent opacity-70'
      }`}
    >
      {hasError || !thumbUrl ? (
        <ImageIcon className="w-6 h-6 text-[#5C3C3C]" data-testid="filmstrip-fallback-icon" />
      ) : (
        <img
          src={thumbUrl}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          onError={() => setHasError(true)}
          className="w-full h-full object-cover"
        />
      )}
    </button>
  );
});

export function ImageViewerModal({
  images,
  initialIndex = 0,
  autoPlay = false,
  serverUrl,
  onClose,
  token,
  client,
}: ImageViewerModalProps) {
  const [currentIndex, setCurrentIndex] = useState<number>(() => {
    if (!images || images.length === 0) return 0;
    return Math.max(0, Math.min(initialIndex, images.length - 1));
  });
  const [isPlaying, setIsPlaying] = useState<boolean>(autoPlay);
  const [showControls, setShowControls] = useState<boolean>(true);
  const [isFilmstripFocused, setIsFilmstripFocused] = useState<boolean>(false);
  const [hasMainError, setHasMainError] = useState<boolean>(false);

  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filmstripRef = useRef<HTMLDivElement>(null);
  const thumbnailRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const isFilmstripFocusedRef = useRef(isFilmstripFocused);
  isFilmstripFocusedRef.current = isFilmstripFocused;

  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;

  const imagesRef = useRef(images);
  imagesRef.current = images;

  const { pushTrap, popTrap } = useFocusContext();

  const unlockTokens = client?.getUnlockTokens ? client.getUnlockTokens() : [];

  const currentImage = images && images.length > 0 ? images[currentIndex] : undefined;
  const imageUrl = currentImage
    ? getAuthenticatedImageUrl(
        serverUrl,
        currentImage.url || currentImage.path,
        token,
        unlockTokens
      )
    : undefined;

  useEffect(() => {
    setHasMainError(false);
  }, [currentIndex, imageUrl]);

  // Focus trap lifecycle
  useEffect(() => {
    pushTrap('image-viewer-modal');
    return () => {
      popTrap('image-viewer-modal');
    };
  }, [pushTrap, popTrap]);

  // Controls auto-hide timer (3 seconds)
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = null;
    }
    if (isFilmstripFocusedRef.current) {
      return;
    }
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);
  }, []);

  // Ensure controls remain visible while filmstrip is focused
  useEffect(() => {
    if (isFilmstripFocused) {
      setShowControls(true);
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
        controlsTimeoutRef.current = null;
      }
    }
  }, [isFilmstripFocused]);

  useEffect(() => {
    resetControlsTimer();
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [resetControlsTimer]);

  // Slideshow auto-advance timer (4 seconds)
  useEffect(() => {
    if (!isPlaying || isFilmstripFocused || !images || images.length <= 1) return;

    const timer = setInterval(() => {
      setCurrentIndex((prev) => {
        const next = (prev + 1) % images.length;
        currentIndexRef.current = next;
        return next;
      });
    }, 4000);

    return () => {
      clearInterval(timer);
    };
  }, [isPlaying, isFilmstripFocused, currentIndex, images]);

  // Auto-scroll active thumbnail into view only when clipped (instant, never smooth)
  useEffect(() => {
    const activeThumb = thumbnailRefs.current[currentIndex];
    if (!activeThumb || typeof activeThumb.scrollIntoView !== 'function') return;
    const rect = activeThumb.getBoundingClientRect();
    const strip = filmstripRef.current;
    if ((rect.width > 0 || rect.height > 0) && strip) {
      const stripRect = strip.getBoundingClientRect();
      if (
        stripRect.width > 0 &&
        rect.left >= stripRect.left &&
        rect.right <= stripRect.right
      ) {
        return;
      }
    }
    activeThumb.scrollIntoView({
      inline: 'center',
      block: 'nearest',
    });
  }, [currentIndex]);

  const handleSelectThumbnail = useCallback(
    (selectedIdx: number) => {
      setCurrentIndex(selectedIdx);
      currentIndexRef.current = selectedIdx;
      setIsPlaying(false);
      resetControlsTimer();
    },
    [resetControlsTimer]
  );

  // Remote keydown capture listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const code = e.keyCode || e.which;
      const curImages = imagesRef.current;
      const count = curImages ? curImages.length : 0;

      // Any key activity resets auto-hide timer and displays controls
      resetControlsTimer();

      if (code === TVKeys.LEFT || e.key === 'ArrowLeft') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (count > 0) {
          const nextIndex = (currentIndexRef.current - 1 + count) % count;
          currentIndexRef.current = nextIndex;
          setCurrentIndex(nextIndex);
          if (isFilmstripFocusedRef.current) {
            thumbnailRefs.current[nextIndex]?.focus();
          }
        }
      } else if (code === TVKeys.RIGHT || e.key === 'ArrowRight') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (count > 0) {
          const nextIndex = (currentIndexRef.current + 1) % count;
          currentIndexRef.current = nextIndex;
          setCurrentIndex(nextIndex);
          if (isFilmstripFocusedRef.current) {
            thumbnailRefs.current[nextIndex]?.focus();
          }
        }
      } else if (code === TVKeys.DOWN || e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!isFilmstripFocusedRef.current && count > 1) {
          isFilmstripFocusedRef.current = true;
          setIsFilmstripFocused(true);
          resetControlsTimer();
          thumbnailRefs.current[currentIndexRef.current]?.focus();
        }
      } else if (code === TVKeys.UP || e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (isFilmstripFocusedRef.current) {
          isFilmstripFocusedRef.current = false;
          setIsFilmstripFocused(false);
          (document.activeElement as HTMLElement)?.blur();
          resetControlsTimer();
        }
      } else if (
        code === TVKeys.ENTER ||
        e.key === 'Enter' ||
        code === 32 ||
        e.key === ' ' ||
        e.key === 'Spacebar'
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (isFilmstripFocusedRef.current) {
          isFilmstripFocusedRef.current = false;
          setIsFilmstripFocused(false);
          (document.activeElement as HTMLElement)?.blur();
          resetControlsTimer();
        } else {
          setIsPlaying((prev) => !prev);
        }
      } else if (
        code === TVKeys.PLAY_PAUSE ||
        code === TVKeys.PLAY ||
        code === TVKeys.PAUSE ||
        e.key === 'MediaPlayPause' ||
        e.key === 'MediaPlay' ||
        e.key === 'MediaPause'
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setIsPlaying((prev) => !prev);
      } else if (
        code === TVKeys.BACK_TIZEN ||
        code === TVKeys.BACK_WEB ||
        code === TVKeys.BACKSPACE ||
        e.key === 'Escape' ||
        e.key === 'Backspace'
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (isFilmstripFocusedRef.current) {
          isFilmstripFocusedRef.current = false;
          setIsFilmstripFocused(false);
          (document.activeElement as HTMLElement)?.blur();
          resetControlsTimer();
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [onClose, resetControlsTimer]);

  if (!images || images.length === 0) {
    return null;
  }

  return (
    <div
      data-modal-overlay="true"
      aria-modal="true"
      className="fixed inset-0 z-[70] bg-black flex items-center justify-center select-none overflow-hidden"
    >
      {/* Centered Image / Error Fallback */}
      {hasMainError || !imageUrl ? (
        <div
          data-testid="viewer-image-fallback"
          className="flex flex-col items-center justify-center text-[#5C3C3C]"
        >
          <ImageIcon
            className="w-24 h-24 stroke-1 text-[#5C3C3C]"
            style={{ marginBottom: '16px' }}
          />
          <span className="text-lg font-medium text-[#5C3C3C]">Unable to load image</span>
        </div>
      ) : (
        <img
          key={currentImage?.path || currentIndex}
          src={imageUrl}
          alt={currentImage?.name || `Image ${currentIndex + 1}`}
          decoding="async"
          onError={() => setHasMainError(true)}
          className="max-w-full max-h-full object-contain"
        />
      )}

      {/* Top HUD Bar */}
      <div
        data-testid="hud-header"
        className={`absolute top-0 left-0 right-0 p-8 bg-gradient-to-b from-[#120404]/95 via-[#120404]/60 to-transparent flex items-center justify-between z-10 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex flex-col max-w-2xl">
          <h2
            className="text-2xl font-bold text-[#F5E5E5] tracking-tight truncate"
            style={{ marginBottom: '4px' }}
          >
            {currentImage?.name}
          </h2>
          <div className="text-sm font-medium text-[#F5E5E5]/80 flex items-center">
            <span>
              {currentIndex + 1} / {images.length}
            </span>
            {currentImage?.size_bytes ? (
              <>
                <span className="text-[#5C3C3C]" style={{ margin: '0 12px' }}>
                  •
                </span>
                <span>{formatBytes(currentImage.size_bytes)}</span>
              </>
            ) : null}
          </div>
        </div>

        <button
          onClick={onClose}
          tabIndex={-1}
          aria-label="Close"
          className="p-3 rounded-full bg-[#3B1111] hover:bg-[#4A1616] text-[#F5E5E5] border border-[rgba(245,229,229,0.08)] cursor-pointer"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Filmstrip Carousel */}
      <div
        ref={filmstripRef}
        data-testid="filmstrip-carousel"
        className={`absolute bottom-24 left-0 right-0 px-8 flex items-center overflow-x-auto scrollbar-none z-20 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {images.map((img, idx) => (
          <FilmstripThumbnail
            key={img.path || idx}
            image={img}
            index={idx}
            isLast={idx === images.length - 1}
            serverUrl={serverUrl}
            token={token}
            unlockTokens={unlockTokens}
            isActive={idx === currentIndex}
            isFilmstripFocused={isFilmstripFocused}
            onSelect={handleSelectThumbnail}
            refCallback={(el) => {
              thumbnailRefs.current[idx] = el;
            }}
          />
        ))}
      </div>

      {/* Bottom HUD Bar */}
      <div
        data-testid="hud-footer"
        className={`absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-[#120404]/95 via-[#120404]/60 to-transparent flex items-center justify-between z-10 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Status Indicator */}
        <div className="flex items-center bg-[#1e0a0a]/95 px-4 py-2 rounded-full border border-[rgba(245,229,229,0.12)]">
          {isPlaying ? (
            <>
              <span
                className="w-2.5 h-2.5 rounded-full bg-[#FF6B00]"
                style={{ marginRight: '10px' }}
              />
              <Play
                className="w-4 h-4 fill-[#FF6B00] text-[#FF6B00]"
                style={{ marginRight: '10px' }}
              />
              <span className="text-sm font-semibold text-[#FFB800]">Playing Slideshow (4s)</span>
            </>
          ) : (
            <>
              <span
                className="w-2.5 h-2.5 rounded-full bg-[#5C3C3C]"
                style={{ marginRight: '10px' }}
              />
              <Pause
                className="w-4 h-4 fill-[#5C3C3C] text-[#5C3C3C]"
                style={{ marginRight: '10px' }}
              />
              <span className="text-sm font-medium text-[#F5E5E5]/70">Paused</span>
            </>
          )}
        </div>

        {/* Remote Control Hints */}
        <div className="text-sm font-medium text-[#F5E5E5]/80 bg-[#1e0a0a]/95 px-5 py-2 rounded-full border border-[rgba(245,229,229,0.12)]">
          {isFilmstripFocused
            ? '◄ / ► Scrub • ▲ / Enter Select • Back Exit Filmstrip'
            : '◄ / ► Navigate • ▼ Filmstrip • Enter / ⏯ Play/Pause • Back Exit'}
        </div>
      </div>
    </div>
  );
}
