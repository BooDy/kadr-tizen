import { useEffect, useState, useRef } from 'react';
import { ApiClient } from '../api/client';
import { fetchLibraryFolders } from '../api/folders';
import { FolderImage, LibraryFolderResponse } from '../types/kadr';
import { useFocusContext } from '../navigation/FocusContext';
import { useFocusable } from '../navigation/useFocusable';
import { TVButton } from '../components/tv/TVButton';
import { TVCard } from '../components/tv/TVCard';
import { TVKeys } from '../navigation/keys';
import { Folder, Play, Loader2, Lock, ImageIcon, ArrowLeft } from 'lucide-react';
import { getAuthenticatedImageUrl } from '../utils/imageUrl';

export interface FolderBrowserModalProps {
  client: ApiClient;
  serverUrl: string;
  token?: string;
  libraryId: string;
  initialPath?: string;
  onClose: () => void;
  onSelectItem: (itemId: number | string) => void;
  onSelectImage: (images: FolderImage[], initialIndex: number) => void;
  onStartSlideshow: (images: FolderImage[]) => void;
  onLockedLibrary?: (libraryId: string) => void;
  isOpen?: boolean;
  refreshKey?: number;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  if (i === 0) return `${bytes} B`;
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatImageUrl(serverUrl: string, path?: string): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const cleanServer = serverUrl.replace(/\/+$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${cleanServer}${cleanPath}`;
}

interface FolderImageCardProps {
  id: string;
  image: FolderImage;
  index: number;
  serverUrl: string;
  token?: string;
  client?: ApiClient;
  onSelect: (index: number) => void;
}

function FolderImageCard({
  id,
  image,
  index,
  serverUrl,
  token,
  client,
  onSelect,
}: FolderImageCardProps) {
  const [hasError, setHasError] = useState(false);
  const unlockTokens = client?.getUnlockTokens ? client.getUnlockTokens() : [];
  const imageUrl = getAuthenticatedImageUrl(serverUrl, image.url || image.path, token, unlockTokens);

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setHasError(false);
  }, [imageUrl]);

  const { ref, isFocused } = useFocusable<HTMLDivElement>({
    id,
    groupId: 'folder-browser-modal',
    onEnter: () => onSelect(index),
  });

  return (
    <div
      ref={ref}
      id={id}
      tabIndex={-1}
      role="button"
      onClick={() => onSelect(index)}
      className={`relative flex flex-col rounded-xl overflow-hidden bg-[#3B1111] border border-[rgba(245,229,229,0.08)] cursor-pointer transition-all duration-200 ${
        isFocused ? 'tv-focus-ring scale-105 z-10' : 'scale-100 opacity-90'
      }`}
    >
      <div className="w-full h-36 bg-[#2A0A0A] relative overflow-hidden flex items-center justify-center">
        {hasError || !imageUrl ? (
          <ImageIcon className="w-10 h-10 text-[#5C3C3C]" data-testid="image-fallback-icon" />
        ) : (
          <img
            src={imageUrl}
            alt={image.name}
            onError={() => setHasError(true)}
            className="w-full h-full object-cover"
          />
        )}
      </div>
      <div className="p-3">
        <div className="text-sm font-semibold text-[#F5E5E5] truncate" title={image.name}>
          {image.name}
        </div>
        <div className="text-xs text-[#5C3C3C] mt-1">{formatBytes(image.size_bytes)}</div>
      </div>
    </div>
  );
}

export function FolderBrowserModal({
  client,
  serverUrl,
  token,
  libraryId,
  initialPath = '',
  onClose,
  onSelectItem,
  onSelectImage,
  onStartSlideshow,
  onLockedLibrary,
  isOpen = true,
  refreshKey,
}: FolderBrowserModalProps) {
  const [currentPath, setCurrentPath] = useState<string>(initialPath);
  const [folderData, setFolderData] = useState<LibraryFolderResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState<boolean>(false);

  const { pushTrap, popTrap, activeTrap } = useFocusContext();

  useEffect(() => {
    if (!isOpen) return;
    pushTrap('folder-browser-modal');
    return () => {
      popTrap();
    };
  }, [isOpen, pushTrap, popTrap]);

  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    setLoading(true);
    setError(null);

    fetchLibraryFolders(client, libraryId, currentPath)
      .then((data) => {
        if (isMounted) {
          setFolderData(data);
          setLoading(false);
          setIsLocked(false);
        }
      })
      .catch((err: any) => {
        if (isMounted) {
          const errMsg = err?.message || String(err);
          const status = err?.status;
          const locked =
            status === 403 || errMsg.includes('403') || errMsg.includes('LIBRARY_LOCKED');
          setError(errMsg);
          setLoading(false);
          if (locked) {
            setIsLocked(true);
            onLockedLibrary?.(libraryId);
          }
        }
      });

    return () => {
      isMounted = false;
    };
  }, [client, libraryId, currentPath, isOpen, onLockedLibrary, refreshKey]);

  useEffect(() => {
    setCurrentPath(initialPath || '');
  }, [libraryId, initialPath]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // If another modal or focus trap is active above this modal, do not intercept keys
      if (activeTrap && activeTrap !== 'folder-browser-modal') {
        return;
      }

      const code = e.keyCode || e.which;
      if (
        code === TVKeys.BACK_TIZEN ||
        code === TVKeys.BACK_WEB ||
        code === TVKeys.BACKSPACE ||
        e.key === 'Escape'
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (currentPath !== '') {
          const parent =
            folderData?.parent_path !== undefined
              ? folderData.parent_path
              : currentPath.includes('/')
              ? currentPath.substring(0, currentPath.lastIndexOf('/'))
              : '';
          setCurrentPath(parent);
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, currentPath, folderData?.parent_path, onClose, activeTrap]);

  if (!isOpen) return null;

  const title = folderData?.library_name || libraryId;
  const isEmpty =
    !loading &&
    !isLocked &&
    (!folderData?.directories || folderData.directories.length === 0) &&
    (!folderData?.items || folderData.items.length === 0) &&
    (!folderData?.images || folderData.images.length === 0);

  return (
    <div className="fixed inset-0 z-50 bg-[#120404] text-[#F5E5E5] flex flex-col p-12 overflow-hidden select-none">
      {/* Header */}
      <div className="flex flex-col gap-5 border-b border-[rgba(245,229,229,0.08)] pb-6 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <TVButton
              id="folder-browser-close-btn"
              groupId="folder-browser-modal"
              variant="secondary"
              aria-label="Close"
              className="px-6 py-3 text-lg font-bold flex items-center gap-2 rounded-xl"
              onClick={onClose}
              onEnter={onClose}
            >
              <ArrowLeft className="w-6 h-6 mr-1" />
              <span>Back</span>
            </TVButton>
            <h2 className="text-4xl font-black tracking-tight text-[#F5E5E5]">{title}</h2>
          </div>
        </div>

        {/* Breadcrumbs Bar */}
        <div className="flex items-center flex-wrap gap-3 text-xl">
          {folderData?.breadcrumbs && folderData.breadcrumbs.length > 0 ? (
            folderData.breadcrumbs.map((crumb, idx) => {
              const isLast = idx === folderData.breadcrumbs.length - 1;
              return (
                <div key={crumb.path || `root-${idx}`} className="flex items-center gap-3">
                  {idx > 0 && <span className="text-[#5C3C3C] font-bold text-2xl">&gt;</span>}
                  <TVButton
                    id={`folder-breadcrumb-${idx}`}
                    groupId="folder-browser-modal"
                    variant={isLast ? 'primary' : 'secondary'}
                    className="px-4 py-2 text-base font-semibold rounded-lg"
                    onClick={() => setCurrentPath(crumb.path)}
                    onEnter={() => setCurrentPath(crumb.path)}
                  >
                    {crumb.name}
                  </TVButton>
                </div>
              );
            })
          ) : (
            <span className="text-[#5C3C3C] font-medium">{title}</span>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto mt-6 pr-4 space-y-8 scrollbar-thin">
        {loading && (
          <div className="flex flex-col items-center justify-center h-64 text-[#5C3C3C] gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-[#FF6B00]" />
            <span className="text-lg">Loading folder contents...</span>
          </div>
        )}

        {!loading && isLocked && (
          <div className="flex flex-col items-center justify-center h-64 text-center gap-4">
            <div className="w-16 h-16 rounded-full bg-[#D43F15]/10 flex items-center justify-center text-[#D43F15] mb-2">
              <Lock className="w-8 h-8" />
            </div>
            <div className="text-2xl font-bold text-[#F5E5E5]">This library is locked</div>
            <p className="text-[#5C3C3C] max-w-md">
              A PIN or unlock token is required to browse contents of this library.
            </p>
            <TVButton
              id="unlock-library-btn"
              groupId="folder-browser-modal"
              variant="primary"
              className="mt-2 px-8 py-3 text-lg font-semibold"
              onClick={() => onLockedLibrary?.(libraryId)}
              onEnter={() => onLockedLibrary?.(libraryId)}
            >
              Unlock Library
            </TVButton>
          </div>
        )}

        {!loading && !isLocked && error && (
          <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
            <div className="text-xl font-bold text-[#D43F15]">Failed to load folder</div>
            <p className="text-[#5C3C3C]">{error}</p>
          </div>
        )}

        {!loading && !isLocked && isEmpty && (
          <div className="flex flex-col items-center justify-center h-64 text-[#5C3C3C] text-xl font-medium">
            This folder is empty
          </div>
        )}

        {!loading && !isLocked && folderData && (
          <>
            {/* Subdirectories Section */}
            {folderData.directories && folderData.directories.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-2xl font-bold text-[#F5E5E5]">Folders</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
                  {folderData.directories.map((dir, idx) => (
                    <TVButton
                      key={dir.path || idx}
                      id={`folder-dir-${idx}`}
                      groupId="folder-browser-modal"
                      variant="secondary"
                      className="flex items-center gap-4 p-5 rounded-2xl text-left"
                      onClick={() => setCurrentPath(dir.path)}
                      onEnter={() => setCurrentPath(dir.path)}
                    >
                      <Folder className="w-10 h-10 text-[#FF6B00] shrink-0" />
                      <div className="flex flex-col truncate">
                        <span className="font-bold text-xl text-[#F5E5E5] truncate">
                          {dir.name}
                        </span>
                        <span className="text-base text-[#5C3C3C]">{dir.item_count} items</span>
                      </div>
                    </TVButton>
                  ))}
                </div>
              </div>
            )}

            {/* Media Items Section */}
            {folderData.items && folderData.items.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-2xl font-bold text-[#F5E5E5]">Media Items</h3>
                <div className="grid grid-cols-6 gap-6">
                  {folderData.items.map((item) => (
                    <TVCard
                      key={item.id}
                      id={`folder-item-${item.id}`}
                      groupId="folder-browser-modal"
                      title={item.title}
                      subtitle={
                        item.subtitle ||
                        (item.release_year ? String(item.release_year) : undefined)
                      }
                      imageUrl={formatImageUrl(serverUrl, item.poster_url)}
                      badge={item.badge}
                      progressPercent={
                        item.playback_progress !== undefined
                          ? Math.round(item.playback_progress * 100)
                          : undefined
                      }
                      onSelect={() => onSelectItem(item.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Photos & Images Section */}
            {folderData.images && folderData.images.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-2xl font-bold text-[#F5E5E5]">
                    Photos ({folderData.images.length})
                  </h3>
                  <TVButton
                    id="start-slideshow-btn"
                    groupId="folder-browser-modal"
                    variant="primary"
                    className="px-6 py-2.5 text-base flex items-center gap-2"
                    onClick={() => onStartSlideshow(folderData.images)}
                    onEnter={() => onStartSlideshow(folderData.images)}
                  >
                    <Play className="w-5 h-5 fill-current" />
                    <span>Start Slideshow</span>
                  </TVButton>
                </div>
                <div className="grid grid-cols-6 gap-6">
                  {folderData.images.map((img, idx) => (
                    <FolderImageCard
                      key={img.path || idx}
                      id={`folder-image-${idx}`}
                      image={img}
                      index={idx}
                      serverUrl={serverUrl}
                      token={token}
                      client={client}
                      onSelect={() => onSelectImage(folderData.images, idx)}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
