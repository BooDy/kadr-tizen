import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { FocusProvider, useFocusContext } from '../../src/navigation/FocusContext';
import { FolderBrowserModal } from '../../src/screens/FolderBrowserModal';
import { ApiClient } from '../../src/api/client';
import { TVKeys } from '../../src/navigation/keys';
import * as foldersApi from '../../src/api/folders';
import { LibraryFolderResponse } from '../../src/types/kadr';

vi.mock('../../src/api/folders');

function FocusProbe() {
  const { focusedId, activeTrap } = useFocusContext();
  return (
    <>
      <div data-testid="probe-focus">{focusedId ?? ''}</div>
      <div data-testid="probe-trap">{activeTrap ?? ''}</div>
    </>
  );
}

function makeLargeItemsResponse(count: number, libraryId = 'lib-movies-1'): LibraryFolderResponse {
  return {
    library_id: libraryId,
    library_name: 'Large Archive',
    current_path: '',
    parent_path: undefined,
    breadcrumbs: [{ name: 'Large Archive', path: '' }],
    directories: [],
    items: Array.from({ length: count }, (_, idx) => ({
      id: idx + 1,
      title: `Archive Video ${idx + 1}`,
      subtitle: '2025',
      poster_url: `/posters/video-${idx + 1}.jpg`,
      media_type: 'movie',
    })),
    images: [],
  };
}

function makeLargeImagesResponse(count: number, libraryId = 'lib-photos-1'): LibraryFolderResponse {
  return {
    library_id: libraryId,
    library_name: 'Photo Archive',
    current_path: '',
    parent_path: undefined,
    breadcrumbs: [{ name: 'Photo Archive', path: '' }],
    directories: [],
    items: [],
    images: Array.from({ length: count }, (_, idx) => ({
      name: `photo-${idx}.jpg`,
      path: `photos/photo-${idx}.jpg`,
      url: `/images/photo-${idx}.jpg`,
      size_bytes: 102400 + idx,
    })),
  };
}

describe('FolderBrowserModal virtualization', () => {
  let client: ApiClient;
  const serverUrl = 'http://localhost:8492';
  const libraryId = 'lib-movies-1';

  beforeEach(() => {
    vi.restoreAllMocks();
    client = new ApiClient(serverUrl);
  });

  it('windows a 240-item (40-row) folder with zero gap-* classes, < 90 mounted cards, and positive bottom spacer', async () => {
    vi.mocked(foldersApi.fetchLibraryFolders).mockResolvedValue(makeLargeItemsResponse(240));

    const { container } = render(
      <FocusProvider>
        <FocusProbe />
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
      expect(screen.getByTestId('probe-focus').textContent).toBe('folder-item-1');
    });

    const gapElements = Array.from(container.querySelectorAll('*')).filter((el) =>
      Array.from(el.classList).some((cls) => cls.startsWith('gap-'))
    );
    expect(gapElements).toHaveLength(0);

    const mountedCards = container.querySelectorAll('[id^="folder-item-"]');
    expect(mountedCards.length).toBeGreaterThan(0);
    expect(mountedCards.length).toBeLessThan(90);

    const itemsGrid = mountedCards[0].parentElement as HTMLElement;
    expect(itemsGrid.style.gridGap).toBe('24px');
    expect(parseInt(itemsGrid.style.paddingBottom || '0', 10)).toBeGreaterThan(0);
  });

  it('shifts the virtualized window across repeated CH_DOWN and CH_UP jumps without trap hijacking', async () => {
    vi.mocked(foldersApi.fetchLibraryFolders).mockResolvedValue(makeLargeItemsResponse(240));

    const { container } = render(
      <FocusProvider>
        <FocusProbe />
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
      expect(screen.getByTestId('probe-focus').textContent).toBe('folder-item-1');
    });
    expect(document.getElementById('folder-item-1')?.getAttribute('data-focused')).toBe('true');

    // Row 0 -> Row 5 (folder-item-31) -> Row 10 (folder-item-61) -> Row 15 (folder-item-91) -> Row 20 (folder-item-121)
    for (const expectedId of [
      'folder-item-31',
      'folder-item-61',
      'folder-item-91',
      'folder-item-121',
    ]) {
      act(() => {
        fireEvent.keyDown(window, { key: 'ChannelDown', keyCode: TVKeys.CH_DOWN });
      });

      expect(screen.getByTestId('probe-focus').textContent).toBe(expectedId);
      expect(document.getElementById(expectedId)?.getAttribute('data-focused')).toBe('true');
      expect(container.querySelectorAll('[id^="folder-item-"]').length).toBeLessThan(90);
    }

    const itemsGridAtRow20 = document.getElementById('folder-item-121')?.parentElement as HTMLElement;
    expect(parseInt(itemsGridAtRow20.style.paddingTop || '0', 10)).toBeGreaterThan(0);

    // Step cleanly back up by 5 rows via CH_UP: Row 20 -> Row 15 -> Row 10 -> Row 5 -> Row 0
    for (const expectedId of [
      'folder-item-91',
      'folder-item-61',
      'folder-item-31',
      'folder-item-1',
    ]) {
      act(() => {
        fireEvent.keyDown(window, { key: 'ChannelUp', keyCode: TVKeys.CH_UP });
      });

      expect(screen.getByTestId('probe-focus').textContent).toBe(expectedId);
      expect(document.getElementById(expectedId)?.getAttribute('data-focused')).toBe('true');
      expect(container.querySelectorAll('[id^="folder-item-"]').length).toBeLessThan(90);
    }

    // Column preservation across virtualized jumps: move to col 2 then CH_DOWN
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
      fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('folder-item-3');

    act(() => {
      fireEvent.keyDown(window, { key: 'ChannelDown', keyCode: TVKeys.CH_DOWN });
    });
    expect(screen.getByTestId('probe-focus').textContent).toBe('folder-item-33');
    expect(document.getElementById('folder-item-33')?.getAttribute('data-focused')).toBe('true');
  });

  it('mounts deep window and focuses initialFocusItemId={211} (row 35) immediately on open', async () => {
    vi.mocked(foldersApi.fetchLibraryFolders).mockResolvedValue(makeLargeItemsResponse(240));

    const { container } = render(
      <FocusProvider>
        <FocusProbe />
        <FolderBrowserModal
          client={client}
          serverUrl={serverUrl}
          libraryId={libraryId}
          initialFocusItemId={211}
          onClose={vi.fn()}
          onSelectItem={vi.fn()}
          onSelectImage={vi.fn()}
          onStartSlideshow={vi.fn()}
        />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('probe-focus').textContent).toBe('folder-item-211');
    });

    const deepCard = document.getElementById('folder-item-211');
    expect(deepCard).not.toBeNull();
    expect(deepCard?.getAttribute('data-focused')).toBe('true');
    expect(document.getElementById('folder-item-1')).toBeNull();

    const mountedCards = container.querySelectorAll('[id^="folder-item-"]');
    expect(mountedCards.length).toBeLessThan(90);

    const itemsGrid = deepCard!.parentElement as HTMLElement;
    expect(parseInt(itemsGrid.style.paddingTop || '0', 10)).toBeGreaterThan(0);
  });

  it('virtualizes a 180-photo folder (< 90 mounted nodes) and preserves original photo index across CH_DOWN jumps', async () => {
    const response = makeLargeImagesResponse(180);
    const onSelectImage = vi.fn();
    vi.mocked(foldersApi.fetchLibraryFolders).mockResolvedValue(response);

    const { container } = render(
      <FocusProvider>
        <FocusProbe />
        <FolderBrowserModal
          client={client}
          serverUrl={serverUrl}
          libraryId="lib-photos-1"
          onClose={vi.fn()}
          onSelectItem={vi.fn()}
          onSelectImage={onSelectImage}
          onStartSlideshow={vi.fn()}
        />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('probe-focus').textContent).toBe('folder-image-0');
    });

    const initialPhotos = container.querySelectorAll('[id^="folder-image-"]');
    expect(initialPhotos.length).toBeGreaterThan(0);
    expect(initialPhotos.length).toBeLessThan(90);

    const imagesGrid = initialPhotos[0].parentElement as HTMLElement;
    expect(parseInt(imagesGrid.style.paddingBottom || '0', 10)).toBeGreaterThan(0);

    // Jump across photo rows via CH_DOWN: 0 -> 30 -> 60 -> 90
    for (const expectedId of ['folder-image-30', 'folder-image-60', 'folder-image-90']) {
      act(() => {
        fireEvent.keyDown(window, { key: 'ChannelDown', keyCode: TVKeys.CH_DOWN });
      });

      expect(screen.getByTestId('probe-focus').textContent).toBe(expectedId);
      expect(document.getElementById(expectedId)?.getAttribute('data-focused')).toBe('true');
      expect(container.querySelectorAll('[id^="folder-image-"]').length).toBeLessThan(90);
    }

    // Activate photo #90 and confirm original index 90 (not sliced index) is passed to onSelectImage
    act(() => {
      fireEvent.keyDown(window, { key: 'Enter', keyCode: TVKeys.ENTER });
    });
    expect(onSelectImage).toHaveBeenCalledTimes(1);
    expect(onSelectImage).toHaveBeenCalledWith(response.images, 90);
  });

  it('virtualizes large directory grids and restores focus onto a deep directory after returning from subfolder', async () => {
    const rootWithManyDirs: LibraryFolderResponse = {
      library_id: libraryId,
      library_name: 'Many Directories',
      current_path: '',
      parent_path: undefined,
      breadcrumbs: [{ name: 'Many Directories', path: '' }],
      directories: Array.from({ length: 120 }, (_, idx) => ({
        name: `Dir ${idx}`,
        path: `dir-${idx}`,
        item_count: idx + 1,
      })),
      items: [],
      images: [],
    };
    const childFolder: LibraryFolderResponse = {
      library_id: libraryId,
      library_name: 'Many Directories',
      current_path: 'dir-90',
      parent_path: '',
      breadcrumbs: [
        { name: 'Many Directories', path: '' },
        { name: 'Dir 90', path: 'dir-90' },
      ],
      directories: [],
      items: [
        {
          id: 9001,
          title: 'Nested Episode',
          subtitle: '2026',
          media_type: 'episode',
        },
      ],
      images: [],
    };

    vi.mocked(foldersApi.fetchLibraryFolders).mockImplementation(async (_client, _libId, path) => {
      if (path === 'dir-90') return childFolder;
      return rootWithManyDirs;
    });

    const { container } = render(
      <FocusProvider>
        <FocusProbe />
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
      expect(screen.getByTestId('probe-focus').textContent).toBe('folder-dir-0');
    });
    expect(container.querySelectorAll('[id^="folder-dir-"]').length).toBeLessThan(90);

    for (const expectedId of ['folder-dir-30', 'folder-dir-60', 'folder-dir-90']) {
      act(() => {
        fireEvent.keyDown(window, { key: 'ChannelDown', keyCode: TVKeys.CH_DOWN });
      });
      expect(screen.getByTestId('probe-focus').textContent).toBe(expectedId);
    }

    // Enter subfolder dir-90 -> loads child folder -> press Back -> restores focus onto folder-dir-90
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Enter', keyCode: TVKeys.ENTER });
    });

    await waitFor(() => {
      expect(screen.getByTestId('probe-focus').textContent).toBe('folder-item-9001');
    });

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: TVKeys.BACK_TIZEN }));
    });

    await waitFor(() => {
      expect(screen.getByTestId('probe-focus').textContent).toBe('folder-dir-90');
    });
    expect(document.getElementById('folder-dir-90')?.getAttribute('data-focused')).toBe('true');
    expect(container.querySelectorAll('[id^="folder-dir-"]').length).toBeLessThan(90);
  });

  it('bypasses virtualization and spacers at or below the 48-item threshold', async () => {
    vi.mocked(foldersApi.fetchLibraryFolders).mockResolvedValue(makeLargeItemsResponse(48));

    const { container } = render(
      <FocusProvider>
        <FocusProbe />
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
      expect(screen.getByTestId('probe-focus').textContent).toBe('folder-item-1');
    });

    const mountedCards = container.querySelectorAll('[id^="folder-item-"]');
    expect(mountedCards).toHaveLength(48);

    const itemsGrid = mountedCards[0].parentElement as HTMLElement;
    expect(itemsGrid.style.paddingTop).toBe('');
    expect(itemsGrid.style.paddingBottom).toBe('');
  });
});
