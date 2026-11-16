import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { FocusProvider, useFocusContext } from '../../src/navigation/FocusContext';
import { FolderBrowserModal } from '../../src/screens/FolderBrowserModal';
import { ApiClient } from '../../src/api/client';
import { TVKeys } from '../../src/navigation/keys';
import * as foldersApi from '../../src/api/folders';
import { LibraryFolderResponse } from '../../src/types/kadr';

vi.mock('../../src/api/folders');

describe('FolderBrowserModal', () => {
  let client: ApiClient;
  const serverUrl = 'http://localhost:8492';
  const libraryId = 'lib-movies-1';

  const mockRootFolderResponse: LibraryFolderResponse = {
    library_id: libraryId,
    library_name: 'Movies Library',
    current_path: '',
    parent_path: undefined,
    breadcrumbs: [{ name: 'Movies Library', path: '' }],
    directories: [
      { name: 'Sci-Fi', path: 'Sci-Fi', item_count: 5 },
      { name: 'Action', path: 'Action', item_count: 3 },
    ],
    items: [
      {
        id: 101,
        title: 'Interstellar',
        subtitle: '2014',
        poster_url: '/posters/interstellar.jpg',
        media_type: 'movie',
        playback_progress: 0.5,
        badge: '4K',
      },
    ],
    images: [],
  };

  const mockNestedFolderResponse: LibraryFolderResponse = {
    library_id: libraryId,
    library_name: 'Movies Library',
    current_path: 'Sci-Fi/Dune',
    parent_path: 'Sci-Fi',
    breadcrumbs: [
      { name: 'Movies Library', path: '' },
      { name: 'Sci-Fi', path: 'Sci-Fi' },
      { name: 'Dune', path: 'Sci-Fi/Dune' },
    ],
    directories: [],
    items: [
      {
        id: 102,
        title: 'Dune: Part One',
        subtitle: '2021',
        poster_url: '/posters/dune.jpg',
        media_type: 'movie',
      },
    ],
    images: [
      {
        name: 'dune_poster.jpg',
        path: 'Sci-Fi/Dune/dune_poster.jpg',
        url: '/images/dune_poster.jpg',
        size_bytes: 2048576, // ~2.0 MB
      },
      {
        name: 'dune_wallpaper.png',
        path: 'Sci-Fi/Dune/dune_wallpaper.png',
        url: '/images/dune_wallpaper.png',
        size_bytes: 512000, // ~500 KB
      },
    ],
  };

  const mockEmptyFolderResponse: LibraryFolderResponse = {
    library_id: libraryId,
    library_name: 'Movies Library',
    current_path: 'Sci-Fi/EmptyDir',
    parent_path: 'Sci-Fi',
    breadcrumbs: [
      { name: 'Movies Library', path: '' },
      { name: 'Sci-Fi', path: 'Sci-Fi' },
      { name: 'EmptyDir', path: 'Sci-Fi/EmptyDir' },
    ],
    directories: [],
    items: [],
    images: [],
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    client = new ApiClient(serverUrl);
  });

  it('renders loading state initially while fetching folder contents', async () => {
    let resolvePromise: (value: LibraryFolderResponse) => void;
    vi.mocked(foldersApi.fetchLibraryFolders).mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve;
      })
    );

    render(
      <FocusProvider>
        <FolderBrowserModal
          client={client}
          serverUrl={serverUrl}
          libraryId={libraryId}
          onClose={vi.fn()}
          onSelectItem={vi.fn()}
          onSelectImage={vi.fn()}
          onStartSlideshow={vi.fn()}
        />
      </FocusProvider>
    );

    expect(screen.getByText(/loading/i)).toBeInTheDocument();

    await act(async () => {
      resolvePromise!(mockRootFolderResponse);
    });

    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Movies Library' })).toBeInTheDocument();
  });

  it('loads and renders breadcrumbs, subdirectories, media cards, and photo tiles', async () => {
    vi.mocked(foldersApi.fetchLibraryFolders).mockResolvedValue(mockNestedFolderResponse);

    render(
      <FocusProvider>
        <FolderBrowserModal
          client={client}
          serverUrl={serverUrl}
          libraryId={libraryId}
          initialPath="Sci-Fi/Dune"
          onClose={vi.fn()}
          onSelectItem={vi.fn()}
          onSelectImage={vi.fn()}
          onStartSlideshow={vi.fn()}
        />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Dune: Part One')).toBeInTheDocument();
    });

    // Breadcrumbs
    expect(screen.getByRole('heading', { name: 'Movies Library' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Movies Library' })).toBeInTheDocument();
    expect(screen.getByText('Sci-Fi')).toBeInTheDocument();
    expect(screen.getByText('Dune')).toBeInTheDocument();

    // Media card
    expect(screen.getByText('Dune: Part One')).toBeInTheDocument();
    expect(screen.getByText('2021')).toBeInTheDocument();

    // Photo items
    expect(screen.getByText('dune_poster.jpg')).toBeInTheDocument();
    expect(screen.getByText('2.0 MB')).toBeInTheDocument();
    expect(screen.getByText('dune_wallpaper.png')).toBeInTheDocument();
    expect(screen.getByText('500.0 KB')).toBeInTheDocument();

    // Slideshow button
    expect(screen.getByRole('button', { name: /start slideshow/i })).toBeInTheDocument();
  });

  it('renders subdirectories with item counts and navigates into directory on click', async () => {
    vi.mocked(foldersApi.fetchLibraryFolders).mockImplementation(async (_client, _libId, path) => {
      if (path === 'Sci-Fi') {
        return {
          ...mockNestedFolderResponse,
          current_path: 'Sci-Fi',
          parent_path: '',
          directories: [{ name: 'Dune', path: 'Sci-Fi/Dune', item_count: 2 }],
        };
      }
      return mockRootFolderResponse;
    });

    render(
      <FocusProvider>
        <FolderBrowserModal
          client={client}
          serverUrl={serverUrl}
          libraryId={libraryId}
          onClose={vi.fn()}
          onSelectItem={vi.fn()}
          onSelectImage={vi.fn()}
          onStartSlideshow={vi.fn()}
        />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Sci-Fi')).toBeInTheDocument();
    });

    expect(screen.getByText('5 items')).toBeInTheDocument();
    expect(screen.getByText('Action')).toBeInTheDocument();
    expect(screen.getByText('3 items')).toBeInTheDocument();

    // Click on Sci-Fi directory
    const sciFiFolder = screen.getByText('Sci-Fi').closest('button') || screen.getByText('Sci-Fi');
    await act(async () => {
      fireEvent.click(sciFiFolder);
    });

    await waitFor(() => {
      expect(foldersApi.fetchLibraryFolders).toHaveBeenCalledWith(client, libraryId, 'Sci-Fi');
    });
  });

  it('navigates to ancestor folder when clicking breadcrumb', async () => {
    vi.mocked(foldersApi.fetchLibraryFolders).mockImplementation(async (_client, _libId, path) => {
      if (path === '') {
        return mockRootFolderResponse;
      }
      return mockNestedFolderResponse;
    });

    render(
      <FocusProvider>
        <FolderBrowserModal
          client={client}
          serverUrl={serverUrl}
          libraryId={libraryId}
          initialPath="Sci-Fi/Dune"
          onClose={vi.fn()}
          onSelectItem={vi.fn()}
          onSelectImage={vi.fn()}
          onStartSlideshow={vi.fn()}
        />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Dune: Part One')).toBeInTheDocument();
    });

    // Click ancestor breadcrumb "Movies Library" (path: '')
    const rootBreadcrumb = screen.getByRole('button', { name: 'Movies Library' });
    await act(async () => {
      fireEvent.click(rootBreadcrumb);
    });

    await waitFor(() => {
      expect(foldersApi.fetchLibraryFolders).toHaveBeenCalledWith(client, libraryId, '');
    });
  });

  it('navigates up on Remote Back / Escape key when in subdirectory, maintains focus trap, and closes modal on root', async () => {
    const onClose = vi.fn();
    vi.mocked(foldersApi.fetchLibraryFolders).mockImplementation(async (_client, _libId, path) => {
      if (path === 'Sci-Fi') {
        return {
          ...mockNestedFolderResponse,
          current_path: 'Sci-Fi',
          parent_path: '',
        };
      }
      if (path === '') {
        return mockRootFolderResponse;
      }
      return mockNestedFolderResponse;
    });

    let currentTrap: string | null = null;
    function TrapObserver() {
      const { activeTrap } = useFocusContext();
      currentTrap = activeTrap;
      return null;
    }

    const { rerender } = render(
      <FocusProvider>
        <TrapObserver />
        <FolderBrowserModal
          isOpen={true}
          client={client}
          serverUrl={serverUrl}
          libraryId={libraryId}
          initialPath="Sci-Fi/Dune"
          onClose={onClose}
          onSelectItem={vi.fn()}
          onSelectImage={vi.fn()}
          onStartSlideshow={vi.fn()}
        />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Dune: Part One')).toBeInTheDocument();
    });

    expect(currentTrap).toBe('folder-browser-modal');

    // Press Escape in Sci-Fi/Dune -> moves to parent 'Sci-Fi'
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: TVKeys.BACK_WEB, key: 'Escape' }));
    });

    await waitFor(() => {
      expect(foldersApi.fetchLibraryFolders).toHaveBeenCalledWith(client, libraryId, 'Sci-Fi');
    });
    expect(onClose).not.toHaveBeenCalled();
    // Focus trap must remain intact while navigating within subdirectories
    expect(currentTrap).toBe('folder-browser-modal');

    // Press Tizen Back (10009) in Sci-Fi -> moves to parent ''
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: TVKeys.BACK_TIZEN }));
    });

    await waitFor(() => {
      expect(foldersApi.fetchLibraryFolders).toHaveBeenCalledWith(client, libraryId, '');
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(currentTrap).toBe('folder-browser-modal');

    // Now at root ('') -> pressing Escape closes modal
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: TVKeys.BACK_WEB, key: 'Escape' }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);

    // Closing / unmounting modal clears the focus trap
    rerender(
      <FocusProvider>
        <TrapObserver />
        <FolderBrowserModal
          isOpen={false}
          client={client}
          serverUrl={serverUrl}
          libraryId={libraryId}
          initialPath="Sci-Fi/Dune"
          onClose={onClose}
          onSelectItem={vi.fn()}
          onSelectImage={vi.fn()}
          onStartSlideshow={vi.fn()}
        />
      </FocusProvider>
    );
    expect(currentTrap).toBeNull();
  });

  it('synchronizes currentPath when initialPath prop changes', async () => {
    vi.mocked(foldersApi.fetchLibraryFolders).mockResolvedValue(mockRootFolderResponse);

    const { rerender } = render(
      <FocusProvider>
        <FolderBrowserModal
          client={client}
          serverUrl={serverUrl}
          libraryId={libraryId}
          initialPath=""
          onClose={vi.fn()}
          onSelectItem={vi.fn()}
          onSelectImage={vi.fn()}
          onStartSlideshow={vi.fn()}
        />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(foldersApi.fetchLibraryFolders).toHaveBeenCalledWith(client, libraryId, '');
    });

    vi.mocked(foldersApi.fetchLibraryFolders).mockResolvedValue(mockNestedFolderResponse);

    rerender(
      <FocusProvider>
        <FolderBrowserModal
          client={client}
          serverUrl={serverUrl}
          libraryId={libraryId}
          initialPath="Sci-Fi/Dune"
          onClose={vi.fn()}
          onSelectItem={vi.fn()}
          onSelectImage={vi.fn()}
          onStartSlideshow={vi.fn()}
        />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(foldersApi.fetchLibraryFolders).toHaveBeenCalledWith(client, libraryId, 'Sci-Fi/Dune');
    });
  });

  it('invokes onSelectItem when media card is selected', async () => {
    const onSelectItem = vi.fn();
    vi.mocked(foldersApi.fetchLibraryFolders).mockResolvedValue(mockRootFolderResponse);

    render(
      <FocusProvider>
        <FolderBrowserModal
          client={client}
          serverUrl={serverUrl}
          libraryId={libraryId}
          onClose={vi.fn()}
          onSelectItem={onSelectItem}
          onSelectImage={vi.fn()}
          onStartSlideshow={vi.fn()}
        />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Interstellar')).toBeInTheDocument();
    });

    const card = screen.getByText('Interstellar').closest('[role="button"]') || screen.getByText('Interstellar');
    await act(async () => {
      fireEvent.click(card);
    });

    expect(onSelectItem).toHaveBeenCalledWith(101);
  });

  it('invokes onSelectImage with correct index when photo is clicked', async () => {
    const onSelectImage = vi.fn();
    vi.mocked(foldersApi.fetchLibraryFolders).mockResolvedValue(mockNestedFolderResponse);

    render(
      <FocusProvider>
        <FolderBrowserModal
          client={client}
          serverUrl={serverUrl}
          libraryId={libraryId}
          initialPath="Sci-Fi/Dune"
          onClose={vi.fn()}
          onSelectItem={vi.fn()}
          onSelectImage={onSelectImage}
          onStartSlideshow={vi.fn()}
        />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('dune_wallpaper.png')).toBeInTheDocument();
    });

    const photoTile = screen.getByText('dune_wallpaper.png').closest('[role="button"]') || screen.getByText('dune_wallpaper.png');
    await act(async () => {
      fireEvent.click(photoTile);
    });

    expect(onSelectImage).toHaveBeenCalledWith(mockNestedFolderResponse.images, 1);
  });

  it('invokes onStartSlideshow when "Start Slideshow" button is clicked', async () => {
    const onStartSlideshow = vi.fn();
    vi.mocked(foldersApi.fetchLibraryFolders).mockResolvedValue(mockNestedFolderResponse);

    render(
      <FocusProvider>
        <FolderBrowserModal
          client={client}
          serverUrl={serverUrl}
          libraryId={libraryId}
          initialPath="Sci-Fi/Dune"
          onClose={vi.fn()}
          onSelectItem={vi.fn()}
          onSelectImage={vi.fn()}
          onStartSlideshow={onStartSlideshow}
        />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /start slideshow/i })).toBeInTheDocument();
    });

    const slideshowBtn = screen.getByRole('button', { name: /start slideshow/i });
    await act(async () => {
      fireEvent.click(slideshowBtn);
    });

    expect(onStartSlideshow).toHaveBeenCalledWith(mockNestedFolderResponse.images);
  });

  it('handles 403 / LIBRARY_LOCKED error, shows locked UI, and invokes onLockedLibrary', async () => {
    const onLockedLibrary = vi.fn();
    const error = new Error('HTTP error 403: LIBRARY_LOCKED');
    (error as any).status = 403;
    vi.mocked(foldersApi.fetchLibraryFolders).mockRejectedValue(error);

    render(
      <FocusProvider>
        <FolderBrowserModal
          client={client}
          serverUrl={serverUrl}
          libraryId={libraryId}
          onClose={vi.fn()}
          onSelectItem={vi.fn()}
          onSelectImage={vi.fn()}
          onStartSlideshow={vi.fn()}
          onLockedLibrary={onLockedLibrary}
        />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/library is locked/i)).toBeInTheDocument();
    });

    expect(onLockedLibrary).toHaveBeenCalledWith(libraryId);

    const unlockBtn = screen.getByRole('button', { name: /unlock library/i });
    expect(unlockBtn).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(unlockBtn);
    });

    expect(onLockedLibrary).toHaveBeenCalledTimes(2);
  });

  it('renders friendly empty message when folder has no dirs, items, or images', async () => {
    vi.mocked(foldersApi.fetchLibraryFolders).mockResolvedValue(mockEmptyFolderResponse);

    render(
      <FocusProvider>
        <FolderBrowserModal
          client={client}
          serverUrl={serverUrl}
          libraryId={libraryId}
          initialPath="Sci-Fi/EmptyDir"
          onClose={vi.fn()}
          onSelectItem={vi.fn()}
          onSelectImage={vi.fn()}
          onStartSlideshow={vi.fn()}
        />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/folder is empty/i)).toBeInTheDocument();
    });
  });

  it('on-screen Back button goes to the previous folder (not the library home) and Close only at the root', async () => {
    const onClose = vi.fn();
    vi.mocked(foldersApi.fetchLibraryFolders).mockImplementation(async (_client, _libId, path) => {
      if (path === 'Sci-Fi/Dune') return mockNestedFolderResponse;
      if (path === 'Sci-Fi') {
        return { ...mockNestedFolderResponse, current_path: 'Sci-Fi', parent_path: '' };
      }
      return mockRootFolderResponse;
    });

    render(
      <FocusProvider>
        <FolderBrowserModal
          client={client}
          serverUrl={serverUrl}
          libraryId={libraryId}
          initialPath="Sci-Fi/Dune"
          onClose={onClose}
          onSelectItem={vi.fn()}
          onSelectImage={vi.fn()}
          onStartSlideshow={vi.fn()}
        />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Dune: Part One')).toBeInTheDocument();
    });

    // In a nested folder the button reads "Back" and steps up one level
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    });
    await waitFor(() => {
      expect(foldersApi.fetchLibraryFolders).toHaveBeenCalledWith(client, libraryId, 'Sci-Fi');
    });
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    });
    await waitFor(() => {
      expect(foldersApi.fetchLibraryFolders).toHaveBeenCalledWith(client, libraryId, '');
    });
    expect(onClose).not.toHaveBeenCalled();

    // At the library root it becomes "Close" and closes the browser
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders header buttons inline with explicit padding and margin spacing for Chromium 69', async () => {
    vi.mocked(foldersApi.fetchLibraryFolders).mockResolvedValue(mockNestedFolderResponse);

    render(
      <FocusProvider>
        <FolderBrowserModal
          client={client}
          serverUrl={serverUrl}
          libraryId={libraryId}
          initialPath="Sci-Fi/Dune"
          onClose={vi.fn()}
          onSelectItem={vi.fn()}
          onSelectImage={vi.fn()}
          onStartSlideshow={vi.fn()}
        />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Dune: Part One')).toBeInTheDocument();
    });

    const row = screen.getByTestId('folder-browser-action-row');
    expect(row.style.display).toBe('flex');
    expect(row.style.flexWrap).toBe('wrap');

    const backBtn = screen.getByRole('button', { name: 'Back' });
    expect(row.contains(backBtn)).toBe(true);
    expect(backBtn.style.padding).toBe('16px 22px');
    expect(backBtn.style.marginRight).toBe('24px');
    expect(backBtn.style.borderRadius).toBe('12px');

    const crumb = screen.getByRole('button', { name: 'Sci-Fi' });
    expect(row.contains(crumb)).toBe(true);
    expect(crumb.style.padding).toBe('10px 18px');
    expect(crumb.style.marginRight).toBe('12px');

    const slideshow = screen.getByRole('button', { name: /start slideshow/i });
    expect(slideshow.style.padding).toBe('16px 24px');
  });

  it('invokes onClose when Close button in header is clicked', async () => {
    const onClose = vi.fn();
    vi.mocked(foldersApi.fetchLibraryFolders).mockResolvedValue(mockRootFolderResponse);

    render(
      <FocusProvider>
        <FolderBrowserModal
          client={client}
          serverUrl={serverUrl}
          libraryId={libraryId}
          onClose={onClose}
          onSelectItem={vi.fn()}
          onSelectImage={vi.fn()}
          onStartSlideshow={vi.fn()}
        />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
    });

    const closeBtn = screen.getByRole('button', { name: /close/i });
    await act(async () => {
      fireEvent.click(closeBtn);
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders image cards with authenticated URLs appending token and unlock tokens', async () => {
    const client = new ApiClient('http://localhost:8492');
    client.setLibraryUnlockToken('lib-photos-1', 'secret-unlock-token');
    const mockFolderWithPhotos = {
      library_name: 'Family Photos',
      parent_path: '',
      breadcrumbs: [{ name: 'Root', path: '' }],
      directories: [],
      items: [],
      images: [
        { name: 'vacation.jpg', path: 'vacation.jpg', url: '/api/v1/libraries/lib-photos-1/image?path=vacation.jpg', size_bytes: 2048576 }
      ],
    };
    vi.spyOn(foldersApi, 'fetchLibraryFolders').mockResolvedValue(mockFolderWithPhotos as any);

    render(
      <FocusProvider>
        <FolderBrowserModal
          client={client}
          serverUrl="http://localhost:8492"
          token="jwt-token-xyz"
          libraryId="lib-photos-1"
          isOpen={true}
          onClose={vi.fn()}
          onSelectItem={vi.fn()}
          onSelectImage={vi.fn()}
          onStartSlideshow={vi.fn()}
        />
      </FocusProvider>
    );

    await waitFor(() => {
      const img = screen.getByAltText('vacation.jpg');
      expect(img).toBeInTheDocument();
      expect(img.getAttribute('src')).toContain('token=jwt-token-xyz');
      expect(img.getAttribute('src')).toContain('unlocked=secret-unlock-token');
    });
  });

  it('renders fallback icon when image thumbnail encounters an error', async () => {
    const client = new ApiClient('http://localhost:8492');
    const mockFolderWithPhotos = {
      library_name: 'Family Photos',
      parent_path: '',
      breadcrumbs: [{ name: 'Root', path: '' }],
      directories: [],
      items: [],
      images: [
        { name: 'broken.jpg', path: 'broken.jpg', url: '/api/v1/libraries/lib-photos-1/image?path=broken.jpg', size_bytes: 1024 }
      ],
    };
    vi.spyOn(foldersApi, 'fetchLibraryFolders').mockResolvedValue(mockFolderWithPhotos as any);

    render(
      <FocusProvider>
        <FolderBrowserModal
          client={client}
          serverUrl="http://localhost:8492"
          libraryId="lib-photos-1"
          isOpen={true}
          onClose={vi.fn()}
          onSelectItem={vi.fn()}
          onSelectImage={vi.fn()}
          onStartSlideshow={vi.fn()}
        />
      </FocusProvider>
    );

    await waitFor(() => {
      const img = screen.getByAltText('broken.jpg');
      fireEvent.error(img);
    });

    expect(screen.getByTestId('image-fallback-icon')).toBeInTheDocument();
  });

  it('resets error state when image URL changes in FolderImageCard', async () => {
    const client = new ApiClient('http://localhost:8492');
    const mockFolderWithPhotos = {
      library_name: 'Family Photos',
      parent_path: '',
      breadcrumbs: [{ name: 'Root', path: '' }],
      directories: [],
      items: [],
      images: [
        { name: 'photo.jpg', path: 'photo.jpg', url: '/api/v1/libraries/lib-photos-1/image?path=photo.jpg', size_bytes: 1024 }
      ],
    };
    vi.spyOn(foldersApi, 'fetchLibraryFolders').mockResolvedValue(mockFolderWithPhotos as any);

    const { rerender } = render(
      <FocusProvider>
        <FolderBrowserModal
          client={client}
          serverUrl="http://localhost:8492"
          libraryId="lib-photos-1"
          token="initial-token"
          isOpen={true}
          onClose={vi.fn()}
          onSelectItem={vi.fn()}
          onSelectImage={vi.fn()}
          onStartSlideshow={vi.fn()}
        />
      </FocusProvider>
    );

    const img = await screen.findByAltText('photo.jpg');
    expect(img).toBeInTheDocument();
    expect(img.getAttribute('src')).toContain('token=initial-token');

    // Trigger image load failure -> renders fallback
    act(() => {
      fireEvent.error(img);
    });
    expect(screen.getByTestId('image-fallback-icon')).toBeInTheDocument();
    expect(screen.queryByAltText('photo.jpg')).not.toBeInTheDocument();

    // Change token -> imageUrl changes -> error resets
    rerender(
      <FocusProvider>
        <FolderBrowserModal
          client={client}
          serverUrl="http://localhost:8492"
          libraryId="lib-photos-1"
          token="updated-token"
          isOpen={true}
          onClose={vi.fn()}
          onSelectItem={vi.fn()}
          onSelectImage={vi.fn()}
          onStartSlideshow={vi.fn()}
        />
      </FocusProvider>
    );

    const recoveredImg = await screen.findByAltText('photo.jpg');
    expect(recoveredImg).toBeInTheDocument();
    expect(recoveredImg.getAttribute('src')).toContain('token=updated-token');
    expect(screen.queryByTestId('image-fallback-icon')).not.toBeInTheDocument();
  });

  it('navigates deterministically on 1920x1080 real geometry across folders, media cards, photos, header actions, subfolders, and stacked AddToPlaylistModal', async () => {
    function makeRect(x: number, y: number, width: number, height: number): DOMRect {
      return {
        x,
        y,
        left: x,
        top: y,
        width,
        height,
        right: x + width,
        bottom: y + height,
        toJSON: () => {},
      };
    }

    const richRootResponse: LibraryFolderResponse = {
      library_id: libraryId,
      library_name: 'Movies Library',
      current_path: '',
      parent_path: undefined,
      breadcrumbs: [{ name: 'Movies Library', path: '' }],
      // 8 directories (row 0 = 6 cols, row 1 = 2 cols partial)
      directories: Array.from({ length: 8 }, (_, idx) => ({
        name: `Folder ${idx}`,
        path: `Folder-${idx}`,
        item_count: idx + 1,
      })),
      // 6 media items below
      items: Array.from({ length: 6 }, (_, idx) => ({
        id: 500 + idx,
        title: `Film ${idx}`,
        subtitle: '2025',
        poster_url: `/posters/film-${idx}.jpg`,
        media_type: 'movie',
      })),
      // 2 photos below
      images: [
        { name: 'still-0.jpg', path: 'still-0.jpg', url: '/img/0.jpg', size_bytes: 102400 },
        { name: 'still-1.jpg', path: 'still-1.jpg', url: '/img/1.jpg', size_bytes: 204800 },
      ],
    };

    const subfolderResponse: LibraryFolderResponse = {
      library_id: libraryId,
      library_name: 'Movies Library',
      current_path: 'Folder-1',
      parent_path: '',
      breadcrumbs: [
        { name: 'Movies Library', path: '' },
        { name: 'Folder 1', path: 'Folder-1' },
      ],
      directories: [],
      items: [
        {
          id: 901,
          title: 'Subfolder Feature',
          subtitle: '2026',
          poster_url: '/posters/sub.jpg',
          media_type: 'movie',
        },
      ],
      images: [],
    };

    vi.spyOn(foldersApi, 'fetchLibraryFolders').mockImplementation(async (_client, _libId, path) => {
      if (path === 'Folder-1') return subfolderResponse;
      return richRootResponse;
    });

    function FocusProbe() {
      const { focusedId, activeTrap } = useFocusContext();
      return (
        <>
          <div data-testid="probe-focus">{focusedId ?? ''}</div>
          <div data-testid="probe-trap">{activeTrap ?? ''}</div>
        </>
      );
    }

    const apply1080pLayout = () => {
      const closeEl = document.getElementById('folder-browser-close-btn');
      if (closeEl) vi.spyOn(closeEl, 'getBoundingClientRect').mockReturnValue(makeRect(56, 60, 140, 56));
      const crumb0 = document.getElementById('folder-breadcrumb-0');
      if (crumb0) vi.spyOn(crumb0, 'getBoundingClientRect').mockReturnValue(makeRect(220, 66, 180, 44));
      const addFolderBtn = document.getElementById('folder-add-to-playlist-btn');
      if (addFolderBtn) {
        vi.spyOn(addFolderBtn, 'getBoundingClientRect').mockReturnValue(makeRect(1560, 60, 300, 56));
      }

      for (let i = 0; i < 8; i++) {
        const el = document.getElementById(`folder-dir-${i}`);
        if (el) {
          const col = i % 6;
          const row = Math.floor(i / 6);
          vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(
            makeRect(56 + col * 304, 220 + row * 136, 280, 112)
          );
        }
      }
      for (let i = 0; i < 6; i++) {
        const el = document.getElementById(`folder-item-${500 + i}`);
        if (el) {
          vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(
            makeRect(56 + i * 304, 540, 224, 384)
          );
        }
      }
      const subItem = document.getElementById('folder-item-901');
      if (subItem) {
        vi.spyOn(subItem, 'getBoundingClientRect').mockReturnValue(makeRect(56, 240, 224, 384));
      }
      const slideshowBtn = document.getElementById('folder-start-slideshow-btn');
      if (slideshowBtn) {
        vi.spyOn(slideshowBtn, 'getBoundingClientRect').mockReturnValue(makeRect(1600, 960, 260, 56));
      }
      for (let i = 0; i < 2; i++) {
        const el = document.getElementById(`folder-image-${i}`);
        if (el) {
          vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(
            makeRect(56 + i * 304, 1040, 280, 220)
          );
        }
      }
    };

    const onSelectItem = vi.fn();

    render(
      <FocusProvider>
        <FocusProbe />
        <FolderBrowserModal
          isOpen={true}
          client={client}
          serverUrl={serverUrl}
          libraryId={libraryId}
          onClose={vi.fn()}
          onSelectItem={onSelectItem}
          onSelectImage={vi.fn()}
          onStartSlideshow={vi.fn()}
        />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Folder 0')).toBeInTheDocument();
    });
    apply1080pLayout();

    // Initial focus after loading MUST land on the first directory (not Close or random header button)
    await waitFor(() => {
      expect(screen.getByTestId('probe-focus').textContent).toBe('folder-dir-0');
    });

    // Navigate right to Folder 1 -> down to Folder 7 (partial row) -> right at partial row end stays on Folder 7
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('folder-dir-1');

    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowDown', keyCode: TVKeys.DOWN });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('folder-dir-7');

    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('folder-dir-7');

    // Navigate down to Film 1 (col 1) -> down to Photo 1 (col 1)
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowDown', keyCode: TVKeys.DOWN });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('folder-item-501');

    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowDown', keyCode: TVKeys.DOWN });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('folder-image-1');

    // Navigate back up to Folder 1 and press Enter to open subfolder
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowUp', keyCode: TVKeys.UP });
      fireEvent.keyDown(window, { key: 'ArrowUp', keyCode: TVKeys.UP });
      fireEvent.keyDown(window, { key: 'ArrowUp', keyCode: TVKeys.UP });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('folder-dir-1');

    await act(async () => {
      fireEvent.keyDown(window, { key: 'Enter', keyCode: TVKeys.ENTER });
    });

    await waitFor(() => {
      expect(screen.getByText('Subfolder Feature')).toBeInTheDocument();
    });
    apply1080pLayout();

    // Entering subfolder focuses its first media item
    await waitFor(() => {
      expect(screen.getByTestId('probe-focus').textContent).toBe('folder-item-901');
    });

    // Pressing Tizen Back (10009) returns to parent directory AND restores focus to folder-dir-1
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: TVKeys.BACK_TIZEN }));
    });

    await waitFor(() => {
      expect(screen.getByText('Folder 1')).toBeInTheDocument();
    });
    apply1080pLayout();

    await waitFor(() => {
      expect(screen.getByTestId('probe-focus').textContent).toBe('folder-dir-1');
    });

    // Open stacked AddToPlaylistModal via header button and verify closing it preserves folder-browser-modal trap
    fireEvent.click(document.getElementById('folder-add-to-playlist-btn')!);
    await waitFor(() => {
      expect(screen.getByTestId('probe-trap').textContent).toBe('add-to-playlist-modal');
    });

    fireEvent.click(document.getElementById('add-playlist-close-btn')!);
    await waitFor(() => {
      expect(screen.getByTestId('probe-trap').textContent).toBe('folder-browser-modal');
    });
  });

  it('preserves exact item selection, visible focus highlight, Enter activation, and self-heals focus after stacked child modal closes', async () => {
    const folderItemsResponse: LibraryFolderResponse = {
      library_id: libraryId,
      library_name: 'Movies Library',
      current_path: 'Action',
      parent_path: '',
      breadcrumbs: [
        { name: 'Movies Library', path: '' },
        { name: 'Action', path: 'Action' },
      ],
      directories: [],
      items: [
        { id: 501, title: 'Mad Max', subtitle: '2015', media_type: 'movie' },
        { id: 502, title: 'John Wick', subtitle: '2014', media_type: 'movie' },
        { id: 503, title: 'Mission Impossible', subtitle: '2018', media_type: 'movie' },
        { id: 504, title: 'Top Gun Maverick', subtitle: '2022', media_type: 'movie' },
      ],
      images: [],
    };

    vi.spyOn(foldersApi, 'fetchLibraryFolders').mockResolvedValue(folderItemsResponse);

    function StackedModalHarness() {
      const { focusedId, activeTrap, setFocusedId, pushTrap, popTrap } = useFocusContext();
      const [detailItemId, setDetailItemId] = useState<number | string | null>(null);
      const [refreshKey, setRefreshKey] = useState(0);

      useEffect(() => {
        if (detailItemId === null) return;
        pushTrap('item-detail-modal');
        setFocusedId('detail-play-btn');
        return () => {
          popTrap('item-detail-modal');
        };
      }, [detailItemId, pushTrap, popTrap, setFocusedId]);

      return (
        <div>
          <div data-testid="probe-focus">{focusedId ?? ''}</div>
          <div data-testid="probe-trap">{activeTrap ?? ''}</div>
          <button
            data-testid="corrupt-focus-outside"
            onClick={() => setFocusedId('card-home-999')}
          >
            Corrupt Focus
          </button>
          <button
            data-testid="trigger-folder-refresh"
            onClick={() => setRefreshKey((k) => k + 1)}
          >
            Refresh Folder
          </button>
          <FolderBrowserModal
            isOpen={true}
            client={client}
            serverUrl={serverUrl}
            libraryId={libraryId}
            initialPath="Action"
            refreshKey={refreshKey}
            onClose={vi.fn()}
            onSelectItem={(id) => {
              onSelectSpy(id);
              setDetailItemId(id);
            }}
            onSelectImage={vi.fn()}
            onStartSlideshow={vi.fn()}
          />
          {detailItemId !== null && (
            <div role="dialog" aria-modal="true" data-testid="mock-item-detail-modal">
              <button id="detail-play-btn">Play {String(detailItemId)}</button>
              <button
                data-testid="close-detail-modal"
                onClick={() => setDetailItemId(null)}
              >
                Back
              </button>
            </div>
          )}
        </div>
      );
    }

    const { useState, useEffect } = await import('react');
    const onSelectSpy = vi.fn();

    render(
      <FocusProvider>
        <StackedModalHarness />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Mission Impossible')).toBeInTheDocument();
    });

    // Click item 503 directly -> opens stacked ItemDetailModal
    const card503 = document.getElementById('folder-item-503')!;
    act(() => {
      fireEvent.click(card503);
    });

    expect(onSelectSpy).toHaveBeenCalledTimes(1);
    expect(onSelectSpy).toHaveBeenLastCalledWith(503);
    await waitFor(() => {
      expect(screen.getByTestId('probe-trap').textContent).toBe('item-detail-modal');
    });

    // Trigger a folder refresh while ItemDetailModal is stacked on top
    await act(async () => {
      fireEvent.click(screen.getByTestId('trigger-folder-refresh'));
    });

    // Close stacked ItemDetailModal -> focus & visible highlight MUST return to folder-item-503
    act(() => {
      fireEvent.click(screen.getByTestId('close-detail-modal'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('probe-trap').textContent).toBe('folder-browser-modal');
      expect(screen.getByTestId('probe-focus').textContent).toBe('folder-item-503');
    });

    const restoredCard = document.getElementById('folder-item-503')!;
    expect(restoredCard.getAttribute('data-focused')).toBe('true');
    expect(restoredCard.className).toContain('tv-focus-ring');
    expect(restoredCard.className).toContain('border-[#FF6B00]');

    // Pressing Enter immediately re-opens that EXACT same item (503)
    act(() => {
      fireEvent.keyDown(window, { key: 'Enter', keyCode: TVKeys.ENTER });
    });
    expect(onSelectSpy).toHaveBeenCalledTimes(2);
    expect(onSelectSpy).toHaveBeenLastCalledWith(503);

    // Close detail modal again and verify self-healing if focus is externally corrupted outside modal
    act(() => {
      fireEvent.click(screen.getByTestId('close-detail-modal'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('probe-focus').textContent).toBe('folder-item-503');
    });

    act(() => {
      fireEvent.click(screen.getByTestId('corrupt-focus-outside'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('probe-focus').textContent).toBe('folder-item-503');
    });
  });

  it('supports fast remote Page-Up / Page-Down (CH_DOWN, PageDown, FAST_FORWARD, CH_UP, PageUp, REWIND) jumping ~5 rows and avoids full-modal re-renders on arrow keys', async () => {
    const largeFolderResponse: LibraryFolderResponse = {
      library_id: libraryId,
      library_name: 'Large Archive',
      current_path: '',
      parent_path: undefined,
      breadcrumbs: [{ name: 'Large Archive', path: '' }],
      directories: [],
      // 42 items = 7 rows of 6 columns (1000..1041)
      items: Array.from({ length: 42 }, (_, idx) => ({
        id: 1000 + idx,
        title: `Archive Video ${idx}`,
        subtitle: '2025',
        media_type: 'movie',
      })),
      images: [],
    };

    vi.spyOn(foldersApi, 'fetchLibraryFolders').mockResolvedValue(largeFolderResponse);
    const unlockTokensSpy = vi.spyOn(client, 'getUnlockTokens');

    function FocusProbe() {
      const { focusedId } = useFocusContext();
      return <div data-testid="probe-focus">{focusedId ?? ''}</div>;
    }

    render(
      <FocusProvider>
        <FocusProbe />
        <FolderBrowserModal
          isOpen={true}
          client={client}
          serverUrl={serverUrl}
          libraryId={libraryId}
          onClose={vi.fn()}
          onSelectItem={vi.fn()}
          onSelectImage={vi.fn()}
          onStartSlideshow={vi.fn()}
        />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('probe-focus').textContent).toBe('folder-item-1000');
    });

    // Clear render spy after initial load; arrow-key navigation must NOT re-render FolderBrowserModal!
    unlockTokensSpy.mockClear();

    // Move right twice to col 2 (folder-item-1002)
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
      fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('folder-item-1002');
    expect(unlockTokensSpy).not.toHaveBeenCalled();

    // CH_DOWN jumps +5 rows in col 2 -> row 5, col 2 = 1000 + 5*6 + 2 = 1032
    act(() => {
      fireEvent.keyDown(window, { key: 'ChannelDown', keyCode: TVKeys.CH_DOWN });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('folder-item-1032');

    // PageDown (34) clamps cleanly to last row (row 6, col 2 = 1038)
    act(() => {
      fireEvent.keyDown(window, { key: 'PageDown', keyCode: 34 });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('folder-item-1038');

    // CH_UP jumps -5 rows in col 2 -> row 1, col 2 = 1008
    act(() => {
      fireEvent.keyDown(window, { key: 'ChannelUp', keyCode: TVKeys.CH_UP });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('folder-item-1008');

    // REWIND jumps -5 rows and clamps to row 0, col 2 = 1002
    act(() => {
      fireEvent.keyDown(window, { key: 'MediaRewind', keyCode: TVKeys.REWIND });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('folder-item-1002');

    // FAST_FORWARD jumps +5 rows again -> 1032
    act(() => {
      fireEvent.keyDown(window, { key: 'MediaFastForward', keyCode: TVKeys.FAST_FORWARD });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('folder-item-1032');

    // Parent modal STILL never re-rendered across all arrow + page jump keys!
    expect(unlockTokensSpy).not.toHaveBeenCalled();
  });

  it('calls onPathChange when navigating to subfolder and climbing back', async () => {
    const mockSciFiFolderResponse: LibraryFolderResponse = {
      library_id: libraryId,
      library_name: 'Movies Library',
      current_path: 'Sci-Fi',
      parent_path: '',
      breadcrumbs: [
        { name: 'Movies Library', path: '' },
        { name: 'Sci-Fi', path: 'Sci-Fi' },
      ],
      directories: [],
      items: [],
      images: [],
    };

    vi.spyOn(foldersApi, 'fetchLibraryFolders').mockImplementation(async (_client, _libId, path) => {
      if (path === 'Sci-Fi') {
        return mockSciFiFolderResponse;
      }
      return mockRootFolderResponse;
    });

    const onPathChangeSpy = vi.fn();
    const onCloseSpy = vi.fn();

    render(
      <FocusProvider>
        <FolderBrowserModal
          client={client}
          serverUrl={serverUrl}
          libraryId={libraryId}
          initialPath=""
          isOpen={true}
          onClose={onCloseSpy}
          onPathChange={onPathChangeSpy}
          onSelectItem={vi.fn()}
          onSelectImage={vi.fn()}
          onStartSlideshow={vi.fn()}
        />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Sci-Fi')).toBeInTheDocument();
    });

    // Click Sci-Fi folder
    fireEvent.click(screen.getByText('Sci-Fi'));

    await waitFor(() => {
      expect(onPathChangeSpy).toHaveBeenCalledWith('Sci-Fi');
    });

    // Press Back button to go up to parent ('')
    const backBtn = screen.getByRole('button', { name: /Back/i });
    fireEvent.click(backBtn);

    await waitFor(() => {
      expect(onPathChangeSpy).toHaveBeenCalledWith('');
    });
  });
});


