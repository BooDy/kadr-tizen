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
});
