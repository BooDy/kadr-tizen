# Picture Viewer, Directory Thumbnails & Filmstrip Slideshow Carousel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow viewing pictures in Kadr Tizen OS, render authenticated thumbnails with fallback icons in the folder browser listing, and provide an interactive full-screen picture player equipped with a TV remote-navigable filmstrip thumbnail carousel and automatic slideshow playback.

**Architecture:** A centralized authenticated URL helper (`getAuthenticatedImageUrl`) attaches session JWT and unlocked library tokens to image GET requests. `FolderBrowserModal` uses this utility to render a 6-column photo thumbnail grid with broken image fallback and a "Start Slideshow" button. `ImageViewerModal` expands into a full-featured photo player featuring a cross-fading viewport, top HUD metadata, auto-hiding controls, and a bottom scrollable filmstrip carousel that highlights the active image, responds to D-Pad navigation (`Left`/`Right`/`Down`/`Up`), and supports 4-second auto-advance.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide React, Vitest, Testing Library.

## Global Constraints

- **Platform Target:** Samsung Tizen OS TV (Chromium 69 compatible CSS/JS, no unsupported CSS layers).
- **Navigation:** TV D-Pad remote control interaction (FocusContext, TVKeys, focus trapping).
- **Security:** Private library images must attach unlock tokens from `client.getUnlockTokens()`.
- **TDD:** Write failing tests first before modifying implementation.

---

### Task 1: Authenticated Image URL Utility

**Files:**
- Create: `src/utils/imageUrl.ts`
- Test: `tests/utils/imageUrl.test.ts`

**Interfaces:**
- Produces: `getAuthenticatedImageUrl(serverUrl: string, imagePath?: string, token?: string, unlockTokens?: string[]): string | undefined`

- [ ] **Step 1: Write failing unit tests for `getAuthenticatedImageUrl`**

Create `tests/utils/imageUrl.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { getAuthenticatedImageUrl } from '../../src/utils/imageUrl';

describe('getAuthenticatedImageUrl', () => {
  it('returns undefined if imagePath is undefined or empty', () => {
    expect(getAuthenticatedImageUrl('http://192.168.1.100:8492', undefined)).toBeUndefined();
    expect(getAuthenticatedImageUrl('http://192.168.1.100:8492', '')).toBeUndefined();
  });

  it('prepends clean serverUrl to relative image paths', () => {
    const url = getAuthenticatedImageUrl('http://192.168.1.100:8492/', 'api/v1/libraries/lib-1/image?path=pic.jpg');
    expect(url).toContain('http://192.168.1.100:8492/api/v1/libraries/lib-1/image?path=pic.jpg');
  });

  it('appends token query param when token is provided', () => {
    const url = getAuthenticatedImageUrl(
      'http://192.168.1.100:8492',
      '/api/v1/libraries/lib-1/image?path=pic.jpg',
      'jwt-token-123'
    );
    expect(url).toBe('http://192.168.1.100:8492/api/v1/libraries/lib-1/image?path=pic.jpg&token=jwt-token-123');
  });

  it('appends unlocked tokens when unlockTokens array has items', () => {
    const url = getAuthenticatedImageUrl(
      'http://192.168.1.100:8492',
      '/api/v1/libraries/lib-1/image?path=pic.jpg',
      'jwt-token-123',
      ['unlock-a', 'unlock-b']
    );
    expect(url).toBe(
      'http://192.168.1.100:8492/api/v1/libraries/lib-1/image?path=pic.jpg&token=jwt-token-123&unlocked=unlock-a%2Cunlock-b'
    );
  });

  it('handles absolute http/https paths correctly while appending authentication params', () => {
    const url = getAuthenticatedImageUrl(
      'http://192.168.1.100:8492',
      'http://192.168.1.100:8492/api/v1/libraries/lib-1/image?path=photo.png',
      'token-abc'
    );
    expect(url).toBe('http://192.168.1.100:8492/api/v1/libraries/lib-1/image?path=photo.png&token=token-abc');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/utils/imageUrl.test.ts`
Expected: FAIL with "Cannot find module '../../src/utils/imageUrl'".

- [ ] **Step 3: Implement `getAuthenticatedImageUrl`**

Create `src/utils/imageUrl.ts`:
```typescript
/**
 * Constructs a fully qualified and authenticated image URL for TV image elements.
 * Appends token and private library unlock tokens as query parameters so that
 * standard <img> GET requests succeed on authenticated endpoints.
 */
export function getAuthenticatedImageUrl(
  serverUrl: string,
  imagePath?: string,
  token?: string,
  unlockTokens?: string[]
): string | undefined {
  if (!imagePath || !imagePath.trim()) return undefined;

  const cleanServer = serverUrl.replace(/\/+$/, '');
  let fullUrlString = imagePath.startsWith('http://') || imagePath.startsWith('https://')
    ? imagePath
    : `${cleanServer}${imagePath.startsWith('/') ? '' : '/'}${imagePath}`;

  try {
    const url = new URL(fullUrlString);
    if (token && !url.searchParams.has('token')) {
      url.searchParams.set('token', token);
    }
    if (unlockTokens && unlockTokens.length > 0 && !url.searchParams.has('unlocked')) {
      url.searchParams.set('unlocked', unlockTokens.join(','));
    }
    return url.toString();
  } catch {
    // If URL parsing fails, manual fallback query concatenation
    const sep = fullUrlString.includes('?') ? '&' : '?';
    const params: string[] = [];
    if (token) params.push(`token=${encodeURIComponent(token)}`);
    if (unlockTokens && unlockTokens.length > 0) {
      params.push(`unlocked=${encodeURIComponent(unlockTokens.join(','))}`);
    }
    return params.length > 0 ? `${fullUrlString}${sep}${params.join('&')}` : fullUrlString;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/utils/imageUrl.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/imageUrl.ts tests/utils/imageUrl.test.ts
git commit -m "feat: add getAuthenticatedImageUrl utility for authenticated image streaming"
```

---

### Task 2: Authenticated Thumbnails & Directory Actions in `FolderBrowserModal`

**Files:**
- Modify: `src/screens/FolderBrowserModal.tsx`
- Test: `tests/screens/FolderBrowserModal.test.tsx`

**Interfaces:**
- Consumes: `getAuthenticatedImageUrl(serverUrl, imagePath, token, unlockTokens)` from Task 1
- Props updated on `FolderBrowserModalProps`: `token?: string`

- [ ] **Step 1: Write failing tests in `tests/screens/FolderBrowserModal.test.tsx`**

Add tests to `tests/screens/FolderBrowserModal.test.tsx`:
```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/screens/FolderBrowserModal.test.tsx`
Expected: FAIL with missing token query param or missing fallback element.

- [ ] **Step 3: Update `FolderBrowserModal.tsx`**

1. Import `getAuthenticatedImageUrl` from `../utils/imageUrl` and `ImageIcon` from `lucide-react`.
2. Add `token?: string` to `FolderBrowserModalProps`.
3. In `FolderImageCard`:
   - Compute `unlockTokens = client?.getUnlockTokens ? client.getUnlockTokens() : []`.
   - Use `getAuthenticatedImageUrl(serverUrl, image.url || image.path, token, unlockTokens)`.
   - Add `const [hasError, setHasError] = useState(false);`.
   - If `hasError || !imageUrl`, render `ImageIcon` with `data-testid="image-fallback-icon"`.
   - If `!hasError && imageUrl`, render `<img onError={() => setHasError(true)} ... />`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/screens/FolderBrowserModal.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/screens/FolderBrowserModal.tsx tests/screens/FolderBrowserModal.test.tsx
git commit -m "feat: add authenticated thumbnails and fallback icon in folder browser"
```

---

### Task 3: Full-Screen Picture Player & Bottom Filmstrip Carousel in `ImageViewerModal`

**Files:**
- Modify: `src/screens/ImageViewerModal.tsx`
- Test: `tests/screens/ImageViewerModal.test.tsx`

**Interfaces:**
- Consumes: `getAuthenticatedImageUrl(serverUrl, imagePath, token, unlockTokens)` from Task 1
- Props on `ImageViewerModalProps`: `token?: string; client?: ApiClient;`

- [ ] **Step 1: Write failing tests in `tests/screens/ImageViewerModal.test.tsx`**

Add tests covering filmstrip carousel and D-Pad navigation:
```typescript
it('renders bottom filmstrip thumbnail carousel displaying neighboring photos', () => {
  const images = [
    { name: 'photo-1.jpg', path: 'photo-1.jpg', url: '/img/1.jpg', size_bytes: 1000 },
    { name: 'photo-2.jpg', path: 'photo-2.jpg', url: '/img/2.jpg', size_bytes: 2000 },
    { name: 'photo-3.jpg', path: 'photo-3.jpg', url: '/img/3.jpg', size_bytes: 3000 },
  ];

  render(
    <FocusProvider>
      <ImageViewerModal
        images={images}
        initialIndex={1}
        serverUrl="http://localhost:8492"
        token="test-jwt"
        onClose={vi.fn()}
      />
    </FocusProvider>
  );

  const carousel = screen.getByTestId('filmstrip-carousel');
  expect(carousel).toBeInTheDocument();
  const thumbnails = screen.getAllByTestId(/^filmstrip-thumb-/);
  expect(thumbnails).toHaveLength(3);
  expect(screen.getByTestId('filmstrip-thumb-1')).toHaveClass('border-[#FF6B00]');
});

it('navigates into filmstrip on ArrowDown and scrolls thumbnails with live preview on ArrowRight/ArrowLeft', () => {
  const images = [
    { name: 'photo-1.jpg', path: 'photo-1.jpg', url: '/img/1.jpg', size_bytes: 1000 },
    { name: 'photo-2.jpg', path: 'photo-2.jpg', url: '/img/2.jpg', size_bytes: 2000 },
  ];

  render(
    <FocusProvider>
      <ImageViewerModal
        images={images}
        initialIndex={0}
        serverUrl="http://localhost:8492"
        onClose={vi.fn()}
      />
    </FocusProvider>
  );

  // Press ArrowDown to focus filmstrip
  fireEvent.keyDown(window, { key: 'ArrowDown', keyCode: TVKeys.DOWN });
  expect(screen.getByTestId('filmstrip-thumb-0')).toHaveFocus();

  // Press ArrowRight while in filmstrip to scrub to next photo
  fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: TVKeys.RIGHT });
  expect(screen.getByText('photo-2.jpg')).toBeInTheDocument();
  expect(screen.getByTestId('filmstrip-thumb-1')).toHaveClass('border-[#FF6B00]');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/screens/ImageViewerModal.test.tsx`
Expected: FAIL with missing `filmstrip-carousel` element.

- [ ] **Step 3: Implement Filmstrip Carousel and Key Navigation in `ImageViewerModal.tsx`**

1. Add `token?: string; client?: ApiClient;` to `ImageViewerModalProps`.
2. Compute `unlockTokens = client?.getUnlockTokens ? client.getUnlockTokens() : []`.
3. Use `getAuthenticatedImageUrl(serverUrl, img.url || img.path, token, unlockTokens)` for all images and thumbnails.
4. Add state `isFilmstripFocused: boolean` (default false).
5. Add `filmstripRef = useRef<HTMLDivElement>(null)`.
6. Add auto-scroll effect: whenever `currentIndex` changes, smoothly scroll the active thumbnail element into view inside the filmstrip container.
7. Update remote key handler:
   - When not in filmstrip (`!isFilmstripFocused`):
     - `LEFT`: decrement `currentIndex` (wraps around).
     - `RIGHT`: increment `currentIndex` (wraps around).
     - `DOWN`: if `images.length > 1`, set `isFilmstripFocused(true)` and focus active thumbnail element.
     - `ENTER` / `PLAY_PAUSE`: toggle slideshow playback.
     - `BACK` / `ESCAPE`: call `onClose()`.
   - When in filmstrip (`isFilmstripFocused`):
     - `LEFT`: decrement `currentIndex`, update main image live.
     - `RIGHT`: increment `currentIndex`, update main image live.
     - `UP`: set `isFilmstripFocused(false)`.
     - `ENTER`: set `isFilmstripFocused(false)`.
     - `BACK` / `ESCAPE`: set `isFilmstripFocused(false)`.
8. Render Filmstrip UI above the HUD footer:
   - Outer container with `data-testid="filmstrip-carousel"` and horizontal scroll (`overflow-x-auto scrollbar-none`).
   - For each photo in `images`, render thumbnail button `data-testid={`filmstrip-thumb-${idx}`}` with `w-24 h-16 rounded-lg overflow-hidden border-2` (`border-[#FF6B00]` if active, else `border-transparent opacity-60`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/screens/ImageViewerModal.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/screens/ImageViewerModal.tsx tests/screens/ImageViewerModal.test.tsx
git commit -m "feat: add filmstrip thumbnail carousel and TV remote scrubbing to ImageViewerModal"
```

---

### Task 4: Integration Wiring & Full Test Verification

**Files:**
- Modify: `src/App.tsx`
- Test: `tests/App.test.tsx`

**Interfaces:**
- Consumes: Updated `FolderBrowserModal` and `ImageViewerModal` with `token={token || ''}` and `client={client}`

- [ ] **Step 1: Update `src/App.tsx`**

Pass `token={token || ''}` to `FolderBrowserModal` and pass `token={token || ''}` & `client={client}` to `ImageViewerModal`:
```tsx
            {folderBrowserState && (
              <FolderBrowserModal
                key={`${folderBrowserState.libraryId}-${folderBrowserState.path}`}
                client={client}
                serverUrl={serverUrl || ''}
                token={token || ''}
                libraryId={folderBrowserState.libraryId}
                initialPath={folderBrowserState.path}
                refreshKey={folderRefreshKey}
                onClose={() => setFolderBrowserState(null)}
                onSelectItem={(itemId) => {
                  handleOpenDetail(itemId);
                }}
                onSelectImage={(images, initialIndex) => {
                  setImageViewerState({ images, initialIndex, autoPlay: false });
                }}
                onStartSlideshow={(images) => {
                  setImageViewerState({ images, initialIndex: 0, autoPlay: true });
                }}
                onLockedLibrary={(libraryId) => {
                  setUnlockLibraryId(libraryId);
                }}
              />
            )}
...
            {imageViewerState && (
              <ImageViewerModal
                images={imageViewerState.images}
                initialIndex={imageViewerState.initialIndex}
                autoPlay={imageViewerState.autoPlay}
                serverUrl={serverUrl || ''}
                token={token || ''}
                client={client}
                onClose={() => setImageViewerState(null)}
              />
            )}
```

- [ ] **Step 2: Run all tests in `tests/App.test.tsx`**

Run: `npx vitest run tests/App.test.tsx`
Expected: PASS.

- [ ] **Step 3: Run the full test suite and production build**

Run: `npm test && npm run build`
Expected: All test suites PASS and Vite build completes with 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx tests/App.test.tsx
git commit -m "feat: wire token and client into image viewer and folder browser modals"
```
