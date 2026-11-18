# Boot-Scoped Error Trap & TV ErrorBoundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the undismissible `#kadr-startup-error` red overlay during active video playback and app navigation by disarming the pre-boot trap as soon as React mounts, making any pre-boot error dismissible via TV Back/OK, and adding a TV-navigable `<AppErrorBoundary>` for true fatal React render crashes.

**Architecture:** Extract the inline HTML boot-trap generator into `src/utils/bootTrapScript.ts` (pure string builder safe for `tsconfig.node.json` and `vite.config.ts`) paired with `disarmBootErrorTrap()` in `src/utils/bootTrap.ts` invoked on mount in `src/App.tsx`. Wrap `<App />` in `src/main.tsx` with `<AppErrorBoundary>` (`src/components/tv/AppErrorBoundary.tsx`), rendering zero extra wrapper nodes during normal playback and a D-pad/Back-recoverable Kadr dialog if React ever crashes during render.

**Tech Stack:** React 19, TypeScript 5.7 (`tsconfig.json` + `tsconfig.node.json`), Vite 6 (`chrome69` legacy bundle), Tailwind CSS 4, Vitest 3 + React Testing Library.

## Global Constraints

- Target platform: Samsung Tizen 5.5 (`UA55TU7000UXEG`, Chromium 69 WebView) and Web Dev Harness.
- **Zero flex `gap-*` classes** in any new or modified JSX/CSS (use explicit margins such as `mr-4`, `mb-4`, `mb-6`).
- Inline boot script in `src/utils/bootTrapScript.ts` must use strictly ES5 syntax (`var`, `function`) so it executes safely on Chromium 69 even if bundle parsing fails, and must have zero DOM type references so `tsconfig.node.json` (`tsc -b`) compiles cleanly.
- `<AppErrorBoundary>` must render `children` directly with **zero extra wrapper `<div>` elements** when `error === null` so `AVPlay`'s transparent hardware video plane remains unobstructed.

---

### Task 1: Boot-Scoped Error Trap with Remote Dismiss & Post-Mount Disarm

**Files:**
- Create: `src/utils/bootTrapScript.ts`
- Create: `src/utils/bootTrap.ts`
- Modify: `tsconfig.node.json:1-14`
- Modify: `vite.config.ts:1-8,146-171`
- Modify: `src/App.tsx:1-38,100-125`
- Create: `tests/utils/bootTrap.test.ts`
- Modify: `tests/App.test.tsx`

**Interfaces:**
- Produces:
  - `src/utils/bootTrapScript.ts`:
    - `export const BOOT_ERROR_ELEMENT_ID = 'kadr-startup-error';`
    - `export function buildBootErrorTrapInlineJs(): string`
    - `export function buildBootErrorTrapScriptTag(): string`
  - `src/utils/bootTrap.ts`:
    - Re-exports `BOOT_ERROR_ELEMENT_ID`, `buildBootErrorTrapInlineJs`, `buildBootErrorTrapScriptTag`
    - `export function disarmBootErrorTrap(): () => void` (calls `window.__kadrDisarmBootTrap?.()`, removes any `#kadr-startup-error` DOM element, and attaches a console-only `unhandledrejection` logger in non-test environments, returning a cleanup function)

- [ ] **Step 1: Write failing unit & integration tests in `tests/utils/bootTrap.test.ts` and `tests/App.test.tsx`**

Create `tests/utils/bootTrap.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  BOOT_ERROR_ELEMENT_ID,
  buildBootErrorTrapInlineJs,
  disarmBootErrorTrap,
} from '../../src/utils/bootTrap';
import { TVKeys } from '../../src/navigation/keys';

describe('Boot-scoped error trap & post-mount disarm', () => {
  let cleanupDisarm: (() => void) | null = null;

  beforeEach(() => {
    document.getElementById(BOOT_ERROR_ELEMENT_ID)?.remove();
    delete (window as any).__kadrDisarmBootTrap;
  });

  afterEach(() => {
    cleanupDisarm?.();
    cleanupDisarm = null;
    (window as any).__kadrDisarmBootTrap?.();
    document.getElementById(BOOT_ERROR_ELEMENT_ID)?.remove();
    delete (window as any).__kadrDisarmBootTrap;
  });

  it('shows #kadr-startup-error before boot and dismisses it on Tizen Back (10009) or Enter', () => {
    const install = new Function(buildBootErrorTrapInlineJs());
    install();

    window.dispatchEvent(new ErrorEvent('error', { message: 'Bundle syntax failure' }));
    const banner = document.getElementById(BOOT_ERROR_ELEMENT_ID);
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain('Bundle syntax failure');
    expect(banner?.textContent).toContain('BACK');

    const downstreamSpy = vi.fn();
    window.addEventListener('keydown', downstreamSpy);
    try {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          keyCode: TVKeys.BACK_TIZEN,
          key: 'XF86Back',
          bubbles: true,
          cancelable: true,
        })
      );
      expect(document.getElementById(BOOT_ERROR_ELEMENT_ID)).toBeNull();
      expect(downstreamSpy).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', downstreamSpy);
    }
  });

  it('disarms completely after disarmBootErrorTrap() so runtime errors and unhandled rejections never render #kadr-startup-error', () => {
    const install = new Function(buildBootErrorTrapInlineJs());
    install();

    // Pre-boot transient error appears
    window.dispatchEvent(new ErrorEvent('error', { message: 'Early warning' }));
    expect(document.getElementById(BOOT_ERROR_ELEMENT_ID)).not.toBeNull();

    // App mounts and disarms the boot trap
    cleanupDisarm = disarmBootErrorTrap();
    expect(document.getElementById(BOOT_ERROR_ELEMENT_ID)).toBeNull();

    // Subsequent runtime error & unhandled promise rejection during video playback must NOT create banner
    window.dispatchEvent(new ErrorEvent('error', { message: 'Background runtime error' }));
    const rejectionEvent = new Event('unhandledrejection') as Event & { reason?: unknown };
    rejectionEvent.reason = new Error('Background fetch timeout');
    window.dispatchEvent(rejectionEvent);

    expect(document.getElementById(BOOT_ERROR_ELEMENT_ID)).toBeNull();
  });
});
```

Add to `tests/App.test.tsx`:

```tsx
  it('disarms the pre-boot HTML error trap immediately when App mounts', async () => {
    const disarmSpy = vi.fn();
    (window as any).__kadrDisarmBootTrap = disarmSpy;
    try {
      render(<App />);
      await waitFor(() => {
        expect(disarmSpy).toHaveBeenCalledTimes(1);
      });
    } finally {
      delete (window as any).__kadrDisarmBootTrap;
    }
  });
```

- [ ] **Step 2: Run Vitest to verify failure (RED)**

Run: `npx vitest run tests/utils/bootTrap.test.ts tests/App.test.tsx -t "disarms"`
Expected: FAIL (`Cannot find module '../../src/utils/bootTrap'`).

- [ ] **Step 3: Implement `bootTrapScript.ts`, `bootTrap.ts`, `tsconfig.node.json`, `vite.config.ts`, and `App.tsx`**

1. Create `src/utils/bootTrapScript.ts` (zero DOM types so `tsconfig.node.json` compiles cleanly):
   ```ts
   export const BOOT_ERROR_ELEMENT_ID = 'kadr-startup-error';

   export function buildBootErrorTrapInlineJs(): string {
     return `(function() {
     var disarmed = false;
     var keyListenerBound = false;

     function dismissStartupError() {
       var el = document.getElementById('${BOOT_ERROR_ELEMENT_ID}');
       if (el && el.parentNode) {
         el.parentNode.removeChild(el);
       }
       if (keyListenerBound) {
         keyListenerBound = false;
         window.removeEventListener('keydown', onBootErrorKeyDown, true);
       }
     }

     function onBootErrorKeyDown(e) {
       var el = document.getElementById('${BOOT_ERROR_ELEMENT_ID}');
       if (!el) return;
       var code = e.keyCode || e.which;
       var key = e.key || '';
       if (
         code === 10009 ||
         code === 27 ||
         code === 8 ||
         code === 461 ||
         code === 13 ||
         key === 'Escape' ||
         key === 'Backspace' ||
         key === 'Enter' ||
         key === 'XF86Back'
       ) {
         if (e.preventDefault) e.preventDefault();
         if (e.stopPropagation) e.stopPropagation();
         if (e.stopImmediatePropagation) e.stopImmediatePropagation();
         dismissStartupError();
       }
     }

     function showStartupError(title, err) {
       if (disarmed) return;
       var el = document.getElementById('${BOOT_ERROR_ELEMENT_ID}');
       if (!el) {
         el = document.createElement('div');
         el.id = '${BOOT_ERROR_ELEMENT_ID}';
         el.style.cssText = 'position:fixed;bottom:24px;left:24px;right:24px;max-height:28vh;overflow:hidden;background:#7f1d1d;color:#fee2e2;padding:20px 24px;font-family:monospace;font-size:18px;z-index:999999;border:2px solid #ef4444;border-radius:12px;white-space:pre-wrap;line-height:1.45;box-shadow:0 10px 25px rgba(0,0,0,0.85);cursor:pointer;';
         el.onclick = dismissStartupError;
         (document.body || document.documentElement).appendChild(el);
       }
       var detail = err && err.stack ? err.stack : (err && err.message ? err.message : String(err || 'Unknown startup error'));
       el.textContent = '[Press BACK or OK to dismiss]  ' + title + '\\n' + detail;
       if (!keyListenerBound) {
         keyListenerBound = true;
         window.addEventListener('keydown', onBootErrorKeyDown, true);
       }
     }

     function onWindowError(e) {
       if (disarmed) return;
       showStartupError('Startup Error:', e.error || (e.message + ' at ' + e.filename + ':' + e.lineno + ':' + e.colno));
     }

     function onUnhandledRejection(e) {
       if (disarmed) return;
       showStartupError('Startup Promise Rejection:', e.reason);
     }

     window.addEventListener('error', onWindowError);
     window.addEventListener('unhandledrejection', onUnhandledRejection);

     window.__kadrDisarmBootTrap = function() {
       disarmed = true;
       window.removeEventListener('error', onWindowError);
       window.removeEventListener('unhandledrejection', onUnhandledRejection);
       dismissStartupError();
     };
   })();`;
   }

   export function buildBootErrorTrapScriptTag(): string {
     return `\n    <script>\n${buildBootErrorTrapInlineJs()}\n    </script>`;
   }
   ```

2. Create `src/utils/bootTrap.ts`:
   ```ts
   import {
     BOOT_ERROR_ELEMENT_ID,
     buildBootErrorTrapInlineJs,
     buildBootErrorTrapScriptTag,
   } from './bootTrapScript';

   export { BOOT_ERROR_ELEMENT_ID, buildBootErrorTrapInlineJs, buildBootErrorTrapScriptTag };

   declare global {
     interface Window {
       __kadrDisarmBootTrap?: () => void;
     }
   }

   export function disarmBootErrorTrap(): () => void {
     if (typeof window === 'undefined') return () => {};

     window.__kadrDisarmBootTrap?.();
     if (typeof document !== 'undefined') {
       document.getElementById(BOOT_ERROR_ELEMENT_ID)?.remove();
     }

     const isTestEnv = typeof process !== 'undefined' && process.env?.NODE_ENV === 'test';
     const onBackgroundRejection = (e: PromiseRejectionEvent) => {
       if (!isTestEnv) {
         console.warn('[Kadr] Unhandled background promise rejection:', e.reason);
       }
     };

     window.addEventListener('unhandledrejection', onBackgroundRejection);
     return () => {
       window.removeEventListener('unhandledrejection', onBackgroundRejection);
     };
   }
   ```

3. Update `tsconfig.node.json` `"include": ["vite.config.ts", "src/utils/bootTrapScript.ts"]`.
4. Update `vite.config.ts` (`transformIndexHtml`) to replace the hardcoded `errorTrapScript` literal with `buildBootErrorTrapScriptTag()`.
5. Update `src/App.tsx` to call `useEffect(() => disarmBootErrorTrap(), []);` on mount.

- [ ] **Step 4: Run Vitest & `tsc -b` to verify GREEN**

Run: `npx vitest run tests/utils/bootTrap.test.ts tests/App.test.tsx && npx tsc -b`
Expected: PASS (all tests green, `tsc -b` exits 0).

- [ ] **Step 5: Commit Task 1**

```bash
git add src/utils/bootTrapScript.ts src/utils/bootTrap.ts tsconfig.node.json vite.config.ts src/App.tsx tests/utils/bootTrap.test.ts tests/App.test.tsx
git commit -m "fix(boot): disarm startup error overlay on mount and allow remote dismiss"
```

---

### Task 2: TV-Navigable `<AppErrorBoundary>` & Root Integration

**Files:**
- Create: `src/components/tv/AppErrorBoundary.tsx`
- Modify: `src/main.tsx:1-14`
- Create: `tests/components/AppErrorBoundary.test.tsx`

**Interfaces:**
- Consumes: `TVKeys` from `src/navigation/keys.ts`
- Produces:
  - `export interface AppErrorBoundaryProps { children: ReactNode; onReload?: () => void; }`
  - `export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState>`

- [ ] **Step 1: Write failing unit tests in `tests/components/AppErrorBoundary.test.tsx`**

Create `tests/components/AppErrorBoundary.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppErrorBoundary } from '../../src/components/tv/AppErrorBoundary';
import { TVKeys } from '../../src/navigation/keys';

describe('AppErrorBoundary', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('renders children directly with zero extra wrapper elements during normal operation', () => {
    const { container } = render(
      <AppErrorBoundary>
        <div data-testid="healthy-child">Video Plane Clear</div>
      </AppErrorBoundary>
    );

    expect(container.firstElementChild).toBe(screen.getByTestId('healthy-child'));
  });

  it('renders a zero-gap TV recovery dialog on fatal React render crash and recovers on TV Back or Try Again', () => {
    let shouldCrash = true;
    function FlakyScreen() {
      if (shouldCrash) {
        throw new Error('Unexpected render crash in widget');
      }
      return <div data-testid="recovered-screen">Browse Screen Active</div>;
    }

    const { container } = render(
      <AppErrorBoundary>
        <FlakyScreen />
      </AppErrorBoundary>
    );

    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText(/Unexpected render crash in widget/i)).toBeInTheDocument();

    // Verify zero CSS flex gap-* classes anywhere in recovery UI
    container.querySelectorAll('*').forEach((el) => {
      const cls = typeof el.className === 'string' ? el.className : '';
      expect(cls).not.toMatch(/\bgap-\S+/);
    });

    // Fix underlying condition and press TV Back (10009) -> boundary resets and mounts FlakyScreen cleanly
    shouldCrash = false;
    fireEvent.keyDown(window, { keyCode: TVKeys.BACK_TIZEN, key: 'Escape' });

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('recovered-screen')).toBeInTheDocument();
  });

  it('navigates between Try Again and Reload App via D-pad Left/Right + Enter', () => {
    const onReload = vi.fn();
    function AlwaysCrash(): never {
      throw new Error('Fatal crash');
    }

    render(
      <AppErrorBoundary onReload={onReload}>
        <AlwaysCrash />
      </AppErrorBoundary>
    );

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    // Move focus right to Reload App and press Enter
    fireEvent.keyDown(window, { keyCode: TVKeys.RIGHT, key: 'ArrowRight' });
    fireEvent.keyDown(window, { keyCode: TVKeys.ENTER, key: 'Enter' });

    expect(onReload).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run Vitest to verify failure (RED)**

Run: `npx vitest run tests/components/AppErrorBoundary.test.tsx`
Expected: FAIL (`Cannot find module '../../src/components/tv/AppErrorBoundary'`).

- [ ] **Step 3: Implement `AppErrorBoundary.tsx` and wrap `<App />` in `src/main.tsx`**

1. Create `src/components/tv/AppErrorBoundary.tsx`:
   - Class component implementing `static getDerivedStateFromError(error: Error)` and `componentDidCatch(error: Error, info: ErrorInfo)`.
   - State: `{ error: Error | null; focusedAction: 'recover' | 'reload'; resetCount: number }`.
   - When `this.state.error === null`: return `<Fragment key={this.state.resetCount}>{this.props.children}</Fragment>` (zero extra DOM wrapper nodes!).
   - Manage capture-phase `window.addEventListener('keydown', this.handleKeyDown, true)` when `this.state.error !== null` (attaching in `componentDidMount` / `componentDidUpdate` when transitioning to `error !== null` and detaching when `error === null` or `componentWillUnmount`):
     - `LEFT` (`37`) -> `setState({ focusedAction: 'recover' })`
     - `RIGHT` (`39`) -> `setState({ focusedAction: 'reload' })`
     - `ENTER` (`13`) -> invokes `handleRecover()` or `handleReload()`
     - `BACK_TIZEN` (`10009`) / `BACK_WEB` (`27`) / `BACKSPACE` (`8`) / `Escape` -> `e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); this.handleRecover();`
   - Render Kadr-styled modal (`bg-[#2A0A0A]/90`, card `bg-[#3B1111]` with `#FF6B00` / `#FFB800` focus ring, explicit `mr-4`, `mb-3`, `mb-6` margins — **zero `gap-*` classes**).
2. Update `src/main.tsx` to wrap `<App />` inside `<AppErrorBoundary>`.

- [ ] **Step 4: Run full test suite, zero-gap check, production build, and WGT packaging**

Run:
1. `(! grep -rn "gap-" src/utils/bootTrapScript.ts src/utils/bootTrap.ts src/components/tv/AppErrorBoundary.tsx src/main.tsx src/App.tsx)`
2. `npm test -- --run`
3. `npm run build && npm run package:wgt -- --no-build`
Expected: 100% test suites passing, zero `gap-*` classes, `dist/index.html` containing `__kadrDisarmBootTrap`, and `kadr.wgt` built cleanly.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/components/tv/AppErrorBoundary.tsx src/main.tsx tests/components/AppErrorBoundary.test.tsx
git commit -m "feat(tv): add D-pad recoverable AppErrorBoundary for fatal render crashes"
```
