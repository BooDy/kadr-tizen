# Kadr Tizen OS Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a high-performance, TV-optimized media server client for Kadr targeting Samsung Tizen OS (1080p canvas, D-pad spatial navigation, LAN auto-discovery, PIN login, Declarative AST layout rendering, dual AVPlay/HTML5 video playback engine with 10s scrobbling, and standalone `.wgt` packaging).

**Architecture:** React 19 + TypeScript + Vite + Tailwind CSS with a deterministic spatial navigation focus engine, modular AST widget renderers, a pluggable `PlayerDriver` interface (`TizenAvplayDriver` for TV hardware, `Html5PlayerDriver` for desktop browser development), and zero-dependency Node.js `.wgt` packaging.

**Tech Stack:** React 19, TypeScript 5.7, Vite 6, Tailwind CSS 4, Vitest, Tizen WebAPI (`webapis.avplay`, `tizen.tvinputdevice`, `tizen.systeminfo`).

## Global Constraints
- Target resolution: 1080p canvas (1920 × 1080) with 10-foot UI scale.
- Tizen compatibility: Chromium 69+ (Tizen 5.5+ / 2020+ TVs).
- Spatial Navigation: All interactions must be navigable using D-pad keys (`Up`, `Down`, `Left`, `Right`), `Enter`, `Back` (`10009` / `Escape`), and numeric keys `0`–`9`. No mouse dependency.
- Video Playback: Must support Kadr HTTP 206 range streaming with auto-resume and 10s interval scrobbling to `POST /api/v1/playback/progress`.
- Zero-Dependency Packaging: Creating `.wgt` package must not require Tizen Studio or external binaries installed on the host machine.

---

### Task 1: Project Scaffolding & Configuration

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `config.xml`
- Create: `src/index.css`
- Create: `src/main.tsx`
- Test: `tests/setup.ts`
- Test: `tests/scaffold.test.ts`

**Interfaces:**
- Produces: Base React 19 application structure runnable with `npm run dev` and testable via `npm run test`.

- [ ] **Step 1: Write test verifying environment and package configuration**

```ts
// tests/scaffold.test.ts
import { describe, it, expect } from 'vitest';
import packageJson from '../package.json';

describe('Project Scaffold', () => {
  it('has correct name and dependencies configured', () => {
    expect(packageJson.name).toBe('kadr-tizenos');
    expect(packageJson.dependencies).toHaveProperty('react');
    expect(packageJson.devDependencies).toHaveProperty('vite');
    expect(packageJson.devDependencies).toHaveProperty('vitest');
  });
});
```

- [ ] **Step 2: Create package.json and tsconfig files**

```json
// package.json
{
  "name": "kadr-tizenos",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "package:wgt": "node scripts/package-wgt.mjs"
  },
  "dependencies": {
    "lucide-react": "^0.475.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.0.6",
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.2.0",
    "@types/node": "^22.13.1",
    "@types/react": "^19.0.8",
    "@types/react-dom": "^19.0.3",
    "@vitejs/plugin-react": "^4.3.4",
    "jsdom": "^26.0.0",
    "tailwindcss": "^4.0.6",
    "typescript": "^5.7.3",
    "vite": "^6.1.0",
    "vitest": "^3.0.5"
  }
}
```

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src", "tests"]
}
```

```json
// tsconfig.node.json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 3: Create vite.config.ts, config.xml, index.html, and CSS**

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './', // Relative base for Tizen WGT widget filesystem
  build: {
    target: 'chrome69', // Tizen 5.5+ embedded Chromium runtime
    outDir: 'dist',
    emptyOutDir: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './tests/setup.ts',
  },
});
```

```xml
<!-- config.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<widget xmlns="http://www.w3.org/ns/widgets" xmlns:tizen="http://tizen.org/ns/widgets" id="http://kadr.tv/kadr-tizenos" version="0.1.0" viewmodes="maximized">
    <tizen:application id="kadr000001.KadrTV" exec="index.html" screen-orientation="landscape" context-menu="enable"/>
    <name>Kadr</name>
    <icon src="icon.png"/>
    <tizen:privilege name="http://tizen.org/privilege/internet"/>
    <tizen:privilege name="http://tizen.org/privilege/tv.inputdevice"/>
    <tizen:feature name="http://tizen.org/feature/screen.size.all"/>
    <tizen:profile name="tv-samsung"/>
    <tizen:setting screen-orientation="landscape"/>
    <access origin="*" subdomains="true"/>
</widget>
```

```html
<!-- index.html -->
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080, initial-scale=1.0, user-scalable=no" />
    <title>Kadr TV</title>
  </head>
  <body class="bg-zinc-950 text-zinc-100 overflow-hidden select-none cursor-none font-sans">
    <div id="root" class="w-[1920px] h-[1080px] overflow-hidden relative"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

```css
/* src/index.css */
@import "tailwindcss";

@layer base {
  body {
    background-color: #09090b;
    color: #f4f4f5;
    font-feature-settings: "cv02", "cv03", "cv04", "cv11";
  }
}

/* Custom 10-foot TV Focus Glows */
.tv-focus-ring {
  outline: none;
  box-shadow: 0 0 0 4px #38bdf8, 0 0 25px rgba(56, 189, 248, 0.45);
  transform: scale(1.06);
  z-index: 30;
  transition: transform 0.15s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.15s ease-out;
}
```

```ts
// tests/setup.ts
import '@testing-library/jest-dom';
```

```tsx
// src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <div className="w-full h-full flex items-center justify-center text-3xl font-bold">
      Kadr TV
    </div>
  </React.StrictMode>
);
```

- [ ] **Step 4: Install dependencies and run tests**

Run: `npm install && npm test`
Expected: PASS

- [ ] **Step 5: Commit scaffolding**

```bash
git add package.json tsconfig*.json vite.config.ts config.xml index.html src/ tests/
git commit -m "chore: scaffold project structure with Vite, React 19, and Tizen manifest"
```

---

### Task 2: Kadr API Client & LAN Subnet Discovery

**Files:**
- Create: `src/types/kadr.ts`
- Create: `src/api/client.ts`
- Create: `src/api/discovery.ts`
- Create: `src/api/auth.ts`
- Test: `tests/api/discovery.test.ts`
- Test: `tests/api/auth.test.ts`

**Interfaces:**
- Produces:
  - `DiscoveryResponse` type (`{ app, server_id, name, version, status, port }`).
  - `discoverLocalServers(): Promise<DiscoveredServer[]>`.
  - `verifyServer(url: string): Promise<DiscoveryResponse | null>`.
  - `listProfiles(serverUrl: string): Promise<ProfileCard[]>`.
  - `authenticatePin(serverUrl: string, userId: string, pin: string): Promise<AuthResult>`.

- [ ] **Step 1: Write test for LAN discovery and server validation**

```ts
// tests/api/discovery.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifyServer, probeSubnet } from '../../src/api/discovery';

describe('Discovery API', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('validates a responsive Kadr server', async () => {
    const mockResponse = {
      app: 'kadr',
      server_id: 'test-uuid',
      name: 'Living Room Server',
      version: '0.1.0',
      status: 'online',
      port: 8492,
      setup_completed: true,
      protocol_version: 1,
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await verifyServer('http://192.168.1.100:8492');
    expect(result).not.toBeNull();
    expect(result?.name).toBe('Living Room Server');
    expect(result?.app).toBe('kadr');
  });

  it('rejects invalid or non-kadr endpoints', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ app: 'unknown-app' }),
    });

    const result = await verifyServer('http://192.168.1.50:8492');
    expect(result).toBeNull();
  });

  it('handles fetch timeout or connection failure', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

    const result = await verifyServer('http://192.168.1.200:8492');
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Write test for Profile listing and PIN authentication**

```ts
// tests/api/auth.test.ts
import { describe, it, expect, vi } from 'vitest';
import { listProfiles, authenticatePin } from '../../src/api/auth';

describe('Auth API', () => {
  it('lists profiles correctly', async () => {
    const mockProfiles = [
      { id: 'u1', username: 'Boody', role: 'admin' },
      { id: 'u2', username: 'Guest', role: 'user' },
    ];
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockProfiles,
    });

    const profiles = await listProfiles('http://localhost:8492');
    expect(profiles).toHaveLength(2);
    expect(profiles[0].username).toBe('Boody');
  });

  it('handles 429 lockout rate limiting during PIN auth', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Headers({ 'Retry-After': '30' }),
      json: async () => ({ error: 'Too many attempts', retry_after_seconds: 30 }),
    });

    const res = await authenticatePin('http://localhost:8492', 'u1', '0000');
    expect(res.success).toBe(false);
    expect(res.lockedOut).toBe(true);
    expect(res.retryAfterSecs).toBe(30);
  });
});
```

- [ ] **Step 3: Implement domain types in `src/types/kadr.ts`**

```ts
// src/types/kadr.ts
export type UserRole = 'admin' | 'user';

export interface ProfileCard {
  id: string;
  username: string;
  role: UserRole;
}

export interface DiscoveryResponse {
  app: string;
  server_id: string;
  name: string;
  version: string;
  protocol_version: number;
  port: number;
  setup_completed: boolean;
  status: string;
}

export interface DiscoveredServer {
  url: string;
  name: string;
  server_id: string;
}

export interface AuthSuccess {
  token: string;
  user_id: string;
  username: string;
  role: UserRole;
}

export interface AuthResult {
  success: boolean;
  data?: AuthSuccess;
  error?: string;
  lockedOut?: boolean;
  retryAfterSecs?: number;
}
```

- [ ] **Step 4: Implement `src/api/client.ts`, `src/api/discovery.ts`, and `src/api/auth.ts`**

```ts
// src/api/client.ts
export class ApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  setToken(token: string | null) {
    this.token = token;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  async fetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers = new Headers(options.headers || {});
    if (this.token) {
      headers.set('Authorization', `Bearer ${this.token}`);
    }
    headers.set('Accept', 'application/json');

    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const res = await fetch(url, { ...options, headers });

    if (!res.ok) {
      throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
    }
    return res.json();
  }
}
```

```ts
// src/api/discovery.ts
import { DiscoveryResponse, DiscoveredServer } from '../types/kadr';

export async function verifyServer(url: string, timeoutMs = 1500): Promise<DiscoveryResponse | null> {
  const cleanUrl = url.replace(/\/+$/, '');
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${cleanUrl}/api/v1/discovery`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(id);
    if (!res.ok) return null;
    const data = (await res.json()) as DiscoveryResponse;
    if (data.app === 'kadr' && data.status === 'online') {
      return data;
    }
    return null;
  } catch {
    clearTimeout(id);
    return null;
  }
}

export async function probeSubnet(baseSubnet: string, port = 8492): Promise<DiscoveredServer[]> {
  const discovered: DiscoveredServer[] = [];
  const batchSize = 25;
  const ips = Array.from({ length: 254 }, (_, i) => `${baseSubnet}.${i + 1}`);

  for (let i = 0; i < ips.length; i += batchSize) {
    const chunk = ips.slice(i, i + batchSize);
    const promises = chunk.map(async (ip) => {
      const url = `http://${ip}:${port}`;
      const server = await verifyServer(url, 1200);
      if (server) {
        discovered.push({ url, name: server.name, server_id: server.server_id });
      }
    });
    await Promise.all(promises);
  }

  return discovered;
}

export async function discoverLocalServers(): Promise<DiscoveredServer[]> {
  const discovered: DiscoveredServer[] = [];

  // Check localhost first (common for testing)
  const local = await verifyServer('http://localhost:8492', 500);
  if (local) {
    discovered.push({ url: 'http://localhost:8492', name: local.name, server_id: local.server_id });
  }

  // Tizen Network API to get device IP
  let baseSubnet: string | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tizen = (window as any).tizen;
    if (tizen?.systeminfo) {
      const wifi = await new Promise<any>((resolve) =>
        tizen.systeminfo.getPropertyValue('WIFI_NETWORK', resolve, () => resolve(null))
      );
      const eth = await new Promise<any>((resolve) =>
        tizen.systeminfo.getPropertyValue('ETHERNET_NETWORK', resolve, () => resolve(null))
      );
      const ip = wifi?.ipAddress || eth?.ipAddress;
      if (ip && typeof ip === 'string' && ip.includes('.')) {
        baseSubnet = ip.split('.').slice(0, 3).join('.');
      }
    }
  } catch {
    // Fallback if not on Tizen
  }

  if (baseSubnet) {
    const lanServers = await probeSubnet(baseSubnet);
    for (const s of lanServers) {
      if (!discovered.some((d) => d.server_id === s.server_id)) {
        discovered.push(s);
      }
    }
  }

  return discovered;
}
```

```ts
// src/api/auth.ts
import { ProfileCard, AuthResult } from '../types/kadr';

export async function listProfiles(serverUrl: string): Promise<ProfileCard[]> {
  const cleanUrl = serverUrl.replace(/\/+$/, '');
  const res = await fetch(`${cleanUrl}/api/v1/users/profiles`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Failed to load profiles (${res.status})`);
  }
  return res.json();
}

export async function authenticatePin(serverUrl: string, userId: string, pin: string): Promise<AuthResult> {
  const cleanUrl = serverUrl.replace(/\/+$/, '');
  try {
    const res = await fetch(`${cleanUrl}/api/v1/auth/pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ user_id: userId, pin }),
    });

    if (res.status === 429) {
      const data = await res.json().catch(() => ({}));
      const retryAfter = Number(res.headers.get('Retry-After')) || data.retry_after_seconds || 30;
      return { success: false, lockedOut: true, retryAfterSecs: retryAfter, error: 'Too many attempts. Locked out.' };
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Invalid PIN' }));
      return { success: false, error: data.error || 'Invalid PIN' };
    }

    const data = await res.json();
    return { success: true, data };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Network error';
    return { success: false, error: msg };
  }
}
```

- [ ] **Step 5: Run tests and commit**

Run: `npm test`
Expected: PASS

```bash
git add src/types/ src/api/ tests/api/
git commit -m "feat: implement discovery subnet probe and profile PIN authentication client"
```

---

### Task 3: Spatial Navigation Engine

**Files:**
- Create: `src/types/navigation.ts`
- Create: `src/navigation/keys.ts`
- Create: `src/navigation/FocusContext.tsx`
- Create: `src/navigation/useFocusable.ts`
- Test: `tests/navigation/focus.test.tsx`

**Interfaces:**
- Produces:
  - `FocusProvider` and `useFocusContext()`.
  - `useFocusable({ id, groupId, onEnter, autoFocus })`.
  - Directional routing: `Up`, `Down`, `Left`, `Right`, `Enter`, `Back`.
  - Focus modal stacking (`pushFocusTrap`, `popFocusTrap`).

- [ ] **Step 1: Write test for focus navigation and focus trap stack**

```tsx
// tests/navigation/focus.test.tsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { FocusProvider, useFocusContext } from '../../src/navigation/FocusContext';
import { useFocusable } from '../../src/navigation/useFocusable';

function TestFocusComponent() {
  const { focusedId } = useFocusContext();
  const f1 = useFocusable({ id: 'btn-1', groupId: 'row-1', autoFocus: true });
  const f2 = useFocusable({ id: 'btn-2', groupId: 'row-1' });

  return (
    <div>
      <div data-testid="current-focus">{focusedId}</div>
      <button ref={f1.ref} tabIndex={-1} data-testid="b1">
        B1 {f1.isFocused ? '(focused)' : ''}
      </button>
      <button ref={f2.ref} tabIndex={-1} data-testid="b2">
        B2 {f2.isFocused ? '(focused)' : ''}
      </button>
    </div>
  );
}

describe('Spatial Navigation', () => {
  it('assigns initial autoFocus to first element', () => {
    render(
      <FocusProvider>
        <TestFocusComponent />
      </FocusProvider>
    );
    expect(screen.getByTestId('current-focus').textContent).toBe('btn-1');
  });

  it('moves focus right when ArrowRight is pressed', () => {
    render(
      <FocusProvider>
        <TestFocusComponent />
      </FocusProvider>
    );

    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowRight' });
    });

    expect(screen.getByTestId('current-focus').textContent).toBe('btn-2');
  });
});
```

- [ ] **Step 2: Implement key mappings in `src/navigation/keys.ts`**

```ts
// src/navigation/keys.ts
export const TVKeys = {
  ENTER: 13,
  LEFT: 37,
  UP: 38,
  RIGHT: 39,
  DOWN: 40,
  BACK_TIZEN: 10009,
  BACK_WEB: 27, // Escape
  BACKSPACE: 8,
  PLAY: 415,
  PAUSE: 19,
  PLAY_PAUSE: 10252,
  STOP: 413,
  FAST_FORWARD: 417,
  REWIND: 412,
  NUM_0: 48,
  NUM_9: 57,
};

export function registerTizenKeys(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tizen = (window as any).tizen;
  if (tizen?.tvinputdevice?.registerKey) {
    const keys = [
      'MediaPlay', 'MediaPause', 'MediaPlayPause', 'MediaStop',
      'MediaFastForward', 'MediaRewind',
      '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'
    ];
    for (const key of keys) {
      try {
        tizen.tvinputdevice.registerKey(key);
      } catch {
        // Ignored
      }
    }
  }
}
```

- [ ] **Step 3: Implement `src/types/navigation.ts`, `src/navigation/FocusContext.tsx`, and `src/navigation/useFocusable.ts`**

```ts
// src/types/navigation.ts
export type Direction = 'up' | 'down' | 'left' | 'right';

export interface FocusNode {
  id: string;
  groupId: string;
  element: HTMLElement | null;
  onEnter?: () => void;
  order?: number;
}
```

```tsx
// src/navigation/FocusContext.tsx
import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { FocusNode, Direction } from '../types/navigation';
import { TVKeys, registerTizenKeys } from './keys';

interface FocusContextType {
  focusedId: string | null;
  setFocusedId: (id: string) => void;
  registerNode: (node: FocusNode) => void;
  unregisterNode: (id: string) => void;
  pushTrap: (trapGroupId: string) => void;
  popTrap: () => void;
}

const FocusContext = createContext<FocusContextType | null>(null);

export function FocusProvider({ children }: { children: React.ReactNode }) {
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const nodesRef = useRef<Map<string, FocusNode>>(new Map());
  const trapStackRef = useRef<string[]>([]);
  const historyStackRef = useRef<string[]>([]);

  useEffect(() => {
    registerTizenKeys();
  }, []);

  const registerNode = useCallback((node: FocusNode) => {
    nodesRef.current.set(node.id, node);
  }, []);

  const unregisterNode = useCallback((id: string) => {
    nodesRef.current.delete(id);
    if (focusedId === id) {
      setFocusedId(null);
    }
  }, [focusedId]);

  const pushTrap = useCallback((trapGroupId: string) => {
    if (focusedId) {
      historyStackRef.current.push(focusedId);
    }
    trapStackRef.current.push(trapGroupId);
    // Focus first node in trap group
    for (const node of nodesRef.current.values()) {
      if (node.groupId === trapGroupId) {
        setFocusedId(node.id);
        break;
      }
    }
  }, [focusedId]);

  const popTrap = useCallback(() => {
    trapStackRef.current.pop();
    const prev = historyStackRef.current.pop();
    if (prev && nodesRef.current.has(prev)) {
      setFocusedId(prev);
    }
  }, []);

  const moveDirection = useCallback((dir: Direction) => {
    const currentId = focusedId;
    if (!currentId) {
      // Pick first registered node
      const first = nodesRef.current.keys().next().value;
      if (first) setFocusedId(first);
      return;
    }

    const currentNode = nodesRef.current.get(currentId);
    if (!currentNode || !currentNode.element) return;

    const currentRect = currentNode.element.getBoundingClientRect();
    const activeTrap = trapStackRef.current[trapStackRef.current.length - 1];

    let candidates = Array.from(nodesRef.current.values()).filter(
      (n) => n.id !== currentId && n.element !== null
    );

    if (activeTrap) {
      candidates = candidates.filter((n) => n.groupId === activeTrap);
    }

    let bestNode: FocusNode | null = null;
    let minDistance = Infinity;

    for (const node of candidates) {
      const rect = node.element!.getBoundingClientRect();
      const dx = rect.left + rect.width / 2 - (currentRect.left + currentRect.width / 2);
      const dy = rect.top + rect.height / 2 - (currentRect.top + currentRect.height / 2);

      let isAligned = false;
      if (dir === 'right' && dx > 15) {
        isAligned = Math.abs(dy) <= currentRect.height * 1.5;
      } else if (dir === 'left' && dx < -15) {
        isAligned = Math.abs(dy) <= currentRect.height * 1.5;
      } else if (dir === 'down' && dy > 15) {
        isAligned = Math.abs(dx) <= currentRect.width * 1.5;
      } else if (dir === 'up' && dy < -15) {
        isAligned = Math.abs(dx) <= currentRect.width * 1.5;
      }

      if (isAligned) {
        const dist = Math.hypot(dx, dy);
        if (dist < minDistance) {
          minDistance = dist;
          bestNode = node;
        }
      }
    }

    if (bestNode) {
      setFocusedId(bestNode.id);
      bestNode.element?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [focusedId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const code = e.keyCode || e.which;

      if (code === TVKeys.LEFT || e.key === 'ArrowLeft') {
        e.preventDefault();
        moveDirection('left');
      } else if (code === TVKeys.RIGHT || e.key === 'ArrowRight') {
        e.preventDefault();
        moveDirection('right');
      } else if (code === TVKeys.UP || e.key === 'ArrowUp') {
        e.preventDefault();
        moveDirection('up');
      } else if (code === TVKeys.DOWN || e.key === 'ArrowDown') {
        e.preventDefault();
        moveDirection('down');
      } else if (code === TVKeys.ENTER || e.key === 'Enter') {
        e.preventDefault();
        if (focusedId) {
          nodesRef.current.get(focusedId)?.onEnter?.();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusedId, moveDirection]);

  return (
    <FocusContext.Provider
      value={{ focusedId, setFocusedId, registerNode, unregisterNode, pushTrap, popTrap }}
    >
      {children}
    </FocusContext.Provider>
  );
}

export function useFocusContext() {
  const ctx = useContext(FocusContext);
  if (!ctx) throw new Error('useFocusContext must be used within a FocusProvider');
  return ctx;
}
```

```tsx
// src/navigation/useFocusable.ts
import { useEffect, useRef } from 'react';
import { useFocusContext } from './FocusContext';

interface UseFocusableOptions {
  id: string;
  groupId: string;
  onEnter?: () => void;
  autoFocus?: boolean;
}

export function useFocusable({ id, groupId, onEnter, autoFocus }: UseFocusableOptions) {
  const { focusedId, setFocusedId, registerNode, unregisterNode } = useFocusContext();
  const ref = useRef<HTMLDivElement | HTMLButtonElement | null>(null);

  useEffect(() => {
    registerNode({ id, groupId, element: ref.current, onEnter });
    if (autoFocus && !focusedId) {
      setFocusedId(id);
    }
    return () => unregisterNode(id);
  }, [id, groupId, onEnter, autoFocus, registerNode, unregisterNode, setFocusedId, focusedId]);

  return {
    ref,
    isFocused: focusedId === id,
  };
}
```

- [ ] **Step 4: Run tests and commit**

Run: `npm test`
Expected: PASS

```bash
git add src/types/navigation.ts src/navigation/ tests/navigation/
git commit -m "feat: implement 10-foot spatial navigation engine with modal focus trap stack"
```

---

### Task 4: TV UI Primitives & Profile Selection + PIN Entry

**Files:**
- Create: `src/components/tv/TVButton.tsx`
- Create: `src/components/tv/TVCard.tsx`
- Create: `src/components/tv/TVModal.tsx`
- Create: `src/components/pin/KeypadGrid.tsx`
- Create: `src/components/pin/PinPadModal.tsx`
- Create: `src/screens/ProfileSelectScreen.tsx`
- Test: `tests/components/PinPadModal.test.tsx`
- Test: `tests/screens/ProfileSelectScreen.test.tsx`

**Interfaces:**
- Produces:
  - `TVButton`: Standard focusable TV button with active glow.
  - `TVCard`: Focusable media/profile card with poster, subtitle, and badges.
  - `PinPadModal`: Numeric PIN entry supporting remote digits and on-screen keypad.
  - `ProfileSelectScreen`: Full-screen profile selector.

- [ ] **Step 1: Write test for PIN Pad input and lockout timer**

```tsx
// tests/components/PinPadModal.test.tsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FocusProvider } from '../../src/navigation/FocusContext';
import { PinPadModal } from '../../src/components/pin/PinPadModal';

describe('PinPadModal', () => {
  it('renders 4 PIN dots and accepts remote numeric input', () => {
    const onSubmit = vi.fn();
    const onClose = vi.fn();

    render(
      <FocusProvider>
        <PinPadModal
          isOpen={true}
          username="Boody"
          onSubmit={onSubmit}
          onClose={onClose}
        />
      </FocusProvider>
    );

    expect(screen.getByText(/Enter PIN for Boody/i)).toBeInTheDocument();

    // Type 4 digits: 1, 2, 3, 4
    fireEvent.keyDown(window, { key: '1', keyCode: 49 });
    fireEvent.keyDown(window, { key: '2', keyCode: 50 });
    fireEvent.keyDown(window, { key: '3', keyCode: 51 });
    fireEvent.keyDown(window, { key: '4', keyCode: 52 });

    expect(onSubmit).toHaveBeenCalledWith('1234');
  });
});
```

- [ ] **Step 2: Implement `src/components/tv/TVButton.tsx` and `TVCard.tsx`**

```tsx
// src/components/tv/TVButton.tsx
import React from 'react';
import { useFocusable } from '../../navigation/useFocusable';

interface TVButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  id: string;
  groupId: string;
  onEnter?: () => void;
  autoFocus?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
}

export function TVButton({
  id,
  groupId,
  onEnter,
  autoFocus,
  variant = 'primary',
  children,
  className = '',
  onClick,
  ...props
}: TVButtonProps) {
  const { ref, isFocused } = useFocusable({
    id,
    groupId,
    onEnter: () => {
      onEnter?.();
      onClick?.({} as any);
    },
    autoFocus,
  });

  const baseStyle =
    'px-8 py-4 rounded-xl font-semibold text-xl tracking-wide transition-all duration-150 outline-none flex items-center justify-center gap-3';
  const variantStyles = {
    primary: isFocused
      ? 'bg-sky-500 text-white tv-focus-ring'
      : 'bg-zinc-800 text-zinc-100 hover:bg-zinc-700',
    secondary: isFocused
      ? 'bg-zinc-700 text-white tv-focus-ring'
      : 'bg-zinc-900 text-zinc-300 border border-zinc-700',
    danger: isFocused
      ? 'bg-rose-600 text-white tv-focus-ring'
      : 'bg-zinc-900 text-rose-400 border border-rose-900/50',
  };

  return (
    <button
      ref={ref as any}
      tabIndex={-1}
      className={`${baseStyle} ${variantStyles[variant]} ${className}`}
      onClick={onClick}
      {...props}
    >
      {children}
    </button>
  );
}
```

```tsx
// src/components/tv/TVCard.tsx
import React from 'react';
import { useFocusable } from '../../navigation/useFocusable';

interface TVCardProps {
  id: string;
  groupId: string;
  title: string;
  subtitle?: string;
  imageUrl?: string;
  badge?: string;
  progressPercent?: number;
  onSelect?: () => void;
  autoFocus?: boolean;
}

export function TVCard({
  id,
  groupId,
  title,
  subtitle,
  imageUrl,
  badge,
  progressPercent,
  onSelect,
  autoFocus,
}: TVCardProps) {
  const { ref, isFocused } = useFocusable({
    id,
    groupId,
    onEnter: onSelect,
    autoFocus,
  });

  return (
    <div
      ref={ref as any}
      onClick={onSelect}
      className={`relative flex flex-col rounded-2xl overflow-hidden bg-zinc-900 cursor-pointer transition-transform duration-200 ${
        isFocused ? 'tv-focus-ring' : 'scale-100 opacity-90'
      }`}
    >
      <div className="w-56 h-80 bg-zinc-800 relative overflow-hidden">
        {imageUrl ? (
          <img src={imageUrl} alt={title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl font-bold text-zinc-600">
            {title.slice(0, 1)}
          </div>
        )}
        {badge && (
          <span className="absolute top-2 right-2 bg-sky-500/90 text-white text-xs font-bold px-2 py-1 rounded">
            {badge}
          </span>
        )}
        {progressPercent !== undefined && progressPercent > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/60">
            <div
              className="h-full bg-sky-400"
              style={{ width: `${Math.min(100, progressPercent)}%` }}
            />
          </div>
        )}
      </div>
      <div className="p-3 w-56">
        <h4 className="text-base font-semibold truncate text-zinc-100">{title}</h4>
        {subtitle && <p className="text-xs text-zinc-400 truncate mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Implement `src/components/pin/PinPadModal.tsx` and `ProfileSelectScreen.tsx`**

```tsx
// src/components/pin/PinPadModal.tsx
import React, { useState, useEffect } from 'react';
import { useFocusContext } from '../../navigation/FocusContext';
import { TVButton } from '../tv/TVButton';
import { TVKeys } from '../../navigation/keys';

interface PinPadModalProps {
  isOpen: boolean;
  username: string;
  onSubmit: (pin: string) => void;
  onClose: () => void;
  lockedOutSecs?: number;
  errorMessage?: string;
}

export function PinPadModal({
  isOpen,
  username,
  onSubmit,
  onClose,
  lockedOutSecs = 0,
  errorMessage,
}: PinPadModalProps) {
  const [pin, setPin] = useState('');
  const { pushTrap, popTrap } = useFocusContext();

  useEffect(() => {
    if (isOpen) {
      pushTrap('pin-pad-modal');
    } else {
      setPin('');
    }
    return () => {
      if (isOpen) popTrap();
    };
  }, [isOpen, pushTrap, popTrap]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const code = e.keyCode || e.which;

      // Handle numbers 0-9
      if (code >= TVKeys.NUM_0 && code <= TVKeys.NUM_9) {
        const digit = String(code - TVKeys.NUM_0);
        setPin((prev) => {
          if (prev.length < 4) {
            const next = prev + digit;
            if (next.length === 4) onSubmit(next);
            return next;
          }
          return prev;
        });
      } else if (code === TVKeys.BACKSPACE) {
        setPin((prev) => prev.slice(0, -1));
      } else if (code === TVKeys.BACK_TIZEN || code === TVKeys.BACK_WEB) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, onSubmit]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-10 flex flex-col items-center w-[540px]">
        <h3 className="text-3xl font-bold text-zinc-100">Enter PIN for {username}</h3>
        <p className="text-zinc-400 mt-2 text-lg">Use your TV remote number buttons</p>

        {lockedOutSecs > 0 ? (
          <div className="mt-8 text-rose-400 font-semibold text-xl">
            Too many attempts. Locked out for {lockedOutSecs}s
          </div>
        ) : (
          <div className="flex gap-4 my-8">
            {[0, 1, 2, 3].map((idx) => (
              <div
                key={idx}
                className={`w-6 h-6 rounded-full border-2 transition-all ${
                  pin.length > idx ? 'bg-sky-400 border-sky-400 scale-125' : 'border-zinc-600'
                }`}
              />
            ))}
          </div>
        )}

        {errorMessage && <p className="text-rose-400 text-sm mb-4">{errorMessage}</p>}

        <TVButton
          id="pin-cancel-btn"
          groupId="pin-pad-modal"
          variant="secondary"
          onEnter={onClose}
          autoFocus
        >
          Cancel (Back)
        </TVButton>
      </div>
    </div>
  );
}
```

```tsx
// src/screens/ProfileSelectScreen.tsx
import React, { useState } from 'react';
import { ProfileCard } from '../types/kadr';
import { TVCard } from '../components/tv/TVCard';
import { PinPadModal } from '../components/pin/PinPadModal';

interface ProfileSelectScreenProps {
  profiles: ProfileCard[];
  serverName: string;
  onLogin: (userId: string, pin: string) => Promise<{ success: boolean; error?: string; lockedOutSecs?: number }>;
  onBackToServerConnect: () => void;
}

export function ProfileSelectScreen({
  profiles,
  serverName,
  onLogin,
  onBackToServerConnect,
}: ProfileSelectScreenProps) {
  const [selectedUser, setSelectedUser] = useState<ProfileCard | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | undefined>();
  const [lockoutSecs, setLockoutSecs] = useState(0);

  const handlePinSubmit = async (pin: string) => {
    if (!selectedUser) return;
    const res = await onLogin(selectedUser.id, pin);
    if (!res.success) {
      setErrorMsg(res.error || 'Invalid PIN');
      if (res.lockedOutSecs) setLockoutSecs(res.lockedOutSecs);
    } else {
      setSelectedUser(null);
    }
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-950 p-16">
      <div className="text-center mb-12">
        <h1 className="text-5xl font-extrabold tracking-tight text-white mb-3">Who's watching?</h1>
        <p className="text-zinc-400 text-xl">{serverName}</p>
      </div>

      <div className="flex gap-8 justify-center items-center">
        {profiles.map((profile, idx) => (
          <TVCard
            key={profile.id}
            id={`profile-${profile.id}`}
            groupId="profiles-row"
            title={profile.username}
            subtitle={profile.role === 'admin' ? 'Administrator' : 'Standard'}
            onSelect={() => {
              setErrorMsg(undefined);
              setSelectedUser(profile);
            }}
            autoFocus={idx === 0}
          />
        ))}
      </div>

      <PinPadModal
        isOpen={Boolean(selectedUser)}
        username={selectedUser?.username || ''}
        onSubmit={handlePinSubmit}
        onClose={() => setSelectedUser(null)}
        errorMessage={errorMsg}
        lockedOutSecs={lockoutSecs}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run tests and commit**

Run: `npm test`
Expected: PASS

```bash
git add src/components/ src/screens/ProfileSelectScreen.tsx tests/
git commit -m "feat: implement TV focusable cards, buttons, PIN modal, and profile selector"
```

---

### Task 5: Declarative AST Screen Renderer & Main Browse View

**Files:**
- Create: `src/types/ast.ts`
- Create: `src/api/screens.ts`
- Create: `src/components/widgets/HeroSpotlightWidget.tsx`
- Create: `src/components/widgets/CardCarouselWidget.tsx`
- Create: `src/components/widgets/CatalogGridWidget.tsx`
- Create: `src/components/widgets/WidgetRenderer.tsx`
- Create: `src/screens/BrowseScreen.tsx`
- Test: `tests/widgets/WidgetRenderer.test.tsx`

**Interfaces:**
- Produces:
  - `fetchScreenLayout(client, screenId: 'home' | 'movies' | 'shows')`.
  - `WidgetRenderer`: Maps AST nodes (`HeroSpotlight`, `HorizontalCardCarousel`, `CatalogGrid`) to components.
  - `BrowseScreen`: Sidebar navigation + AST layout container.

- [ ] **Step 1: Write test for AST Widget hydration**

```tsx
// tests/widgets/WidgetRenderer.test.tsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FocusProvider } from '../../src/navigation/FocusContext';
import { WidgetRenderer } from '../../src/components/widgets/WidgetRenderer';
import { ScreenLayout } from '../../src/types/ast';

describe('WidgetRenderer', () => {
  it('renders HeroSpotlight and CardCarousel widgets from AST layout', () => {
    const mockLayout: ScreenLayout = {
      screen_id: 'home',
      title: 'Home',
      widgets: [
        {
          id: 'hero-1',
          type: 'hero_spotlight',
          title: 'Featured Movie',
          item_id: 'item-100',
          backdrop_url: '/artwork/100/backdrop',
          synopsis: 'An epic adventure awaits.',
          badges: ['4K', 'HDR'],
        },
        {
          id: 'carousel-continue',
          type: 'card_carousel',
          title: 'Continue Watching',
          items: [
            {
              id: 'card-1',
              item_id: 'item-101',
              title: 'Breaking Bad S01E01',
              poster_url: '/artwork/101/poster',
              progress_percent: 45,
              badge: 'RESUME',
            },
          ],
        },
      ],
    };

    render(
      <FocusProvider>
        <WidgetRenderer
          layout={mockLayout}
          serverUrl="http://localhost:8492"
          onSelectItem={vi.fn()}
          onPlayItem={vi.fn()}
        />
      </FocusProvider>
    );

    expect(screen.getByText('Featured Movie')).toBeInTheDocument();
    expect(screen.getByText('Continue Watching')).toBeInTheDocument();
    expect(screen.getByText('Breaking Bad S01E01')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement AST types in `src/types/ast.ts` and fetcher in `src/api/screens.ts`**

```ts
// src/types/ast.ts
export interface ASTBadge {
  text: string;
  variant?: 'primary' | 'accent' | 'muted';
}

export interface ASTHeroWidget {
  id: string;
  type: 'hero_spotlight';
  item_id: string;
  title: string;
  backdrop_url?: string;
  synopsis?: string;
  badges?: string[];
  resume_position_ms?: number;
}

export interface ASTCarouselItem {
  id: string;
  item_id: string;
  title: string;
  subtitle?: string;
  poster_url?: string;
  progress_percent?: number;
  badge?: string;
  resume_position_ms?: number;
}

export interface ASTCarouselWidget {
  id: string;
  type: 'card_carousel';
  title: string;
  items: ASTCarouselItem[];
}

export interface ASTGridWidget {
  id: string;
  type: 'catalog_grid';
  title: string;
  items: ASTCarouselItem[];
}

export type ASTWidget = ASTHeroWidget | ASTCarouselWidget | ASTGridWidget;

export interface ScreenLayout {
  screen_id: string;
  title: string;
  widgets: ASTWidget[];
}
```

```ts
// src/api/screens.ts
import { ApiClient } from './client';
import { ScreenLayout } from '../types/ast';

export async function fetchScreenLayout(client: ApiClient, screenId: string): Promise<ScreenLayout> {
  return client.fetch<ScreenLayout>(`/api/v1/screens/${screenId}`);
}
```

- [ ] **Step 3: Implement Widget components and `WidgetRenderer.tsx`**

```tsx
// src/components/widgets/HeroSpotlightWidget.tsx
import React from 'react';
import { ASTHeroWidget } from '../../types/ast';
import { TVButton } from '../tv/TVButton';
import { Play, Info } from 'lucide-react';

interface HeroSpotlightProps {
  widget: ASTHeroWidget;
  serverUrl: string;
  onPlay: (itemId: string, resumeMs?: number) => void;
  onDetails: (itemId: string) => void;
}

export function HeroSpotlightWidget({ widget, serverUrl, onPlay, onDetails }: HeroSpotlightProps) {
  const backdrop = widget.backdrop_url
    ? `${serverUrl.replace(/\/+$/, '')}${widget.backdrop_url}`
    : undefined;

  return (
    <div className="relative w-full h-[520px] rounded-3xl overflow-hidden mb-10 bg-zinc-900 border border-zinc-800">
      {backdrop && (
        <img
          src={backdrop}
          alt={widget.title}
          className="absolute inset-0 w-full h-full object-cover opacity-40 mask-radial"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/60 to-transparent p-12 flex flex-col justify-end">
        <div className="flex gap-2 mb-3">
          {widget.badges?.map((b) => (
            <span key={b} className="px-2.5 py-1 bg-sky-500/20 text-sky-400 border border-sky-500/30 text-xs font-bold rounded">
              {b}
            </span>
          ))}
        </div>
        <h2 className="text-5xl font-black text-white max-w-3xl mb-4 tracking-tight drop-shadow-md">
          {widget.title}
        </h2>
        {widget.synopsis && (
          <p className="text-zinc-300 text-lg max-w-2xl line-clamp-3 mb-6 leading-relaxed">
            {widget.synopsis}
          </p>
        )}
        <div className="flex gap-4">
          <TVButton
            id={`hero-play-${widget.id}`}
            groupId="hero"
            variant="primary"
            onEnter={() => onPlay(widget.item_id, widget.resume_position_ms)}
            autoFocus
          >
            <Play className="w-6 h-6 fill-current" />
            {widget.resume_position_ms && widget.resume_position_ms > 0 ? 'Resume' : 'Play'}
          </TVButton>
          <TVButton
            id={`hero-details-${widget.id}`}
            groupId="hero"
            variant="secondary"
            onEnter={() => onDetails(widget.item_id)}
          >
            <Info className="w-6 h-6" /> Details
          </TVButton>
        </div>
      </div>
    </div>
  );
}
```

```tsx
// src/components/widgets/CardCarouselWidget.tsx
import React from 'react';
import { ASTCarouselWidget } from '../../types/ast';
import { TVCard } from '../tv/TVCard';

interface CardCarouselProps {
  widget: ASTCarouselWidget;
  serverUrl: string;
  onSelectItem: (itemId: string) => void;
}

export function CardCarouselWidget({ widget, serverUrl, onSelectItem }: CardCarouselProps) {
  const cleanServer = serverUrl.replace(/\/+$/, '');

  return (
    <div className="mb-10">
      <h3 className="text-2xl font-bold text-zinc-100 mb-4 px-2">{widget.title}</h3>
      <div className="flex gap-6 overflow-x-auto scrollbar-none py-2 px-2">
        {widget.items.map((item) => (
          <TVCard
            key={item.id}
            id={`card-${item.id}`}
            groupId={`carousel-${widget.id}`}
            title={item.title}
            subtitle={item.subtitle}
            imageUrl={item.poster_url ? `${cleanServer}${item.poster_url}` : undefined}
            badge={item.badge}
            progressPercent={item.progress_percent}
            onSelect={() => onSelectItem(item.item_id)}
          />
        ))}
      </div>
    </div>
  );
}
```

```tsx
// src/components/widgets/WidgetRenderer.tsx
import React from 'react';
import { ScreenLayout } from '../../types/ast';
import { HeroSpotlightWidget } from './HeroSpotlightWidget';
import { CardCarouselWidget } from './CardCarouselWidget';

interface WidgetRendererProps {
  layout: ScreenLayout;
  serverUrl: string;
  onSelectItem: (itemId: string) => void;
  onPlayItem: (itemId: string, resumeMs?: number) => void;
}

export function WidgetRenderer({ layout, serverUrl, onSelectItem, onPlayItem }: WidgetRendererProps) {
  return (
    <div className="flex flex-col w-full pb-16">
      {layout.widgets.map((widget) => {
        if (widget.type === 'hero_spotlight') {
          return (
            <HeroSpotlightWidget
              key={widget.id}
              widget={widget}
              serverUrl={serverUrl}
              onPlay={onPlayItem}
              onDetails={onSelectItem}
            />
          );
        }
        if (widget.type === 'card_carousel') {
          return (
            <CardCarouselWidget
              key={widget.id}
              widget={widget}
              serverUrl={serverUrl}
              onSelectItem={onSelectItem}
            />
          );
        }
        return null;
      })}
    </div>
  );
}
```

- [ ] **Step 4: Implement `src/screens/BrowseScreen.tsx` with collapsible TV sidebar**

```tsx
// src/screens/BrowseScreen.tsx
import React, { useState, useEffect } from 'react';
import { ScreenLayout } from '../types/ast';
import { ApiClient } from '../api/client';
import { fetchScreenLayout } from '../api/screens';
import { WidgetRenderer } from '../components/widgets/WidgetRenderer';
import { TVButton } from '../components/tv/TVButton';
import { Home, Film, Tv, Users } from 'lucide-react';

interface BrowseScreenProps {
  client: ApiClient;
  serverUrl: string;
  onSelectItem: (itemId: string) => void;
  onPlayItem: (itemId: string, resumeMs?: number) => void;
  onSwitchProfile: () => void;
}

export function BrowseScreen({
  client,
  serverUrl,
  onSelectItem,
  onPlayItem,
  onSwitchProfile,
}: BrowseScreenProps) {
  const [activeTab, setActiveTab] = useState<'home' | 'movies' | 'shows'>('home');
  const [layout, setLayout] = useState<ScreenLayout | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchScreenLayout(client, activeTab)
      .then((data) => {
        if (!cancelled) {
          setLayout(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, activeTab]);

  return (
    <div className="w-full h-full flex bg-zinc-950 overflow-hidden">
      {/* Collapsible Left TV Sidebar */}
      <nav className="w-28 hover:w-64 focus-within:w-64 transition-all duration-200 bg-zinc-900/90 border-r border-zinc-800/80 p-4 flex flex-col justify-between z-40">
        <div className="flex flex-col gap-4">
          <div className="h-16 flex items-center justify-center font-black text-2xl text-sky-400">
            KADR
          </div>
          <TVButton
            id="nav-home"
            groupId="sidebar"
            variant={activeTab === 'home' ? 'primary' : 'secondary'}
            onEnter={() => setActiveTab('home')}
            className="w-full justify-start px-4"
          >
            <Home className="w-6 h-6 shrink-0" />
            <span className="hidden group-hover:inline group-focus-within:inline ml-2 text-lg">Home</span>
          </TVButton>
          <TVButton
            id="nav-movies"
            groupId="sidebar"
            variant={activeTab === 'movies' ? 'primary' : 'secondary'}
            onEnter={() => setActiveTab('movies')}
            className="w-full justify-start px-4"
          >
            <Film className="w-6 h-6 shrink-0" />
            <span className="hidden group-hover:inline group-focus-within:inline ml-2 text-lg">Movies</span>
          </TVButton>
          <TVButton
            id="nav-shows"
            groupId="sidebar"
            variant={activeTab === 'shows' ? 'primary' : 'secondary'}
            onEnter={() => setActiveTab('shows')}
            className="w-full justify-start px-4"
          >
            <Tv className="w-6 h-6 shrink-0" />
            <span className="hidden group-hover:inline group-focus-within:inline ml-2 text-lg">Shows</span>
          </TVButton>
        </div>

        <TVButton
          id="nav-switch-profile"
          groupId="sidebar"
          variant="secondary"
          onEnter={onSwitchProfile}
          className="w-full justify-start px-4"
        >
          <Users className="w-6 h-6 shrink-0" />
          <span className="hidden group-hover:inline group-focus-within:inline ml-2 text-lg">Profiles</span>
        </TVButton>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 h-full overflow-y-auto p-12 scrollbar-none">
        {loading ? (
          <div className="w-full h-full flex items-center justify-center text-zinc-500 text-2xl">
            Loading {activeTab}...
          </div>
        ) : layout ? (
          <WidgetRenderer
            layout={layout}
            serverUrl={serverUrl}
            onSelectItem={onSelectItem}
            onPlayItem={onPlayItem}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-rose-400 text-2xl">
            Failed to load screen layout.
          </div>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 5: Run tests and commit**

Run: `npm test`
Expected: PASS

```bash
git add src/types/ast.ts src/api/screens.ts src/components/widgets/ src/screens/BrowseScreen.tsx tests/
git commit -m "feat: implement declarative AST screen renderer and main browse view with TV sidebar"
```

---

### Task 6: Item Detail Modal

**Files:**
- Create: `src/api/items.ts`
- Create: `src/screens/ItemDetailModal.tsx`
- Test: `tests/screens/ItemDetailModal.test.tsx`

**Interfaces:**
- Produces:
  - `fetchMediaItem(client, itemId: string)`.
  - `ItemDetailModal`: Full-screen/overlay detail view with Play / Resume buttons and focus trapping.

- [ ] **Step 1: Write test for Item Detail view and action buttons**

```tsx
// tests/screens/ItemDetailModal.test.tsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FocusProvider } from '../../src/navigation/FocusContext';
import { ItemDetailModal } from '../../src/screens/ItemDetailModal';

describe('ItemDetailModal', () => {
  it('renders movie details with Resume button when resume_position_ms > 0', () => {
    const mockItem = {
      id: 'movie-1',
      title: 'Interstellar',
      overview: 'A team of explorers travel through a wormhole in space.',
      release_year: 2014,
      duration_ms: 10140000,
      resume_position_ms: 3600000, // 1 hour in
      media_type: 'movie',
      resolution: '4K',
    };

    render(
      <FocusProvider>
        <ItemDetailModal
          isOpen={true}
          item={mockItem as any}
          serverUrl="http://localhost:8492"
          onPlay={vi.fn()}
          onClose={vi.fn()}
        />
      </FocusProvider>
    );

    expect(screen.getByText('Interstellar')).toBeInTheDocument();
    expect(screen.getByText(/Resume/i)).toBeInTheDocument();
    expect(screen.getByText(/Play from Beginning/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement item fetcher in `src/api/items.ts` and `src/screens/ItemDetailModal.tsx`**

```ts
// src/api/items.ts
import { ApiClient } from './client';

export interface MediaItemDetail {
  id: string;
  title: string;
  overview?: string;
  release_year?: number;
  duration_ms?: number;
  resume_position_ms?: number;
  media_type: string;
  resolution?: string;
  poster_url?: string;
  backdrop_url?: string;
}

export async function fetchMediaItem(client: ApiClient, itemId: string): Promise<MediaItemDetail> {
  return client.fetch<MediaItemDetail>(`/api/v1/items/${itemId}`);
}
```

```tsx
// src/screens/ItemDetailModal.tsx
import React, { useEffect } from 'react';
import { MediaItemDetail } from '../api/items';
import { useFocusContext } from '../navigation/FocusContext';
import { TVButton } from '../components/tv/TVButton';
import { TVKeys } from '../navigation/keys';
import { Play, RotateCcw, X } from 'lucide-react';

interface ItemDetailModalProps {
  isOpen: boolean;
  item: MediaItemDetail | null;
  serverUrl: string;
  onPlay: (itemId: string, startMs?: number) => void;
  onClose: () => void;
}

export function ItemDetailModal({
  isOpen,
  item,
  serverUrl,
  onPlay,
  onClose,
}: ItemDetailModalProps) {
  const { pushTrap, popTrap } = useFocusContext();

  useEffect(() => {
    if (isOpen) {
      pushTrap('item-detail-modal');
    }
    return () => {
      if (isOpen) popTrap();
    };
  }, [isOpen, pushTrap, popTrap]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const code = e.keyCode || e.which;
      if (code === TVKeys.BACK_TIZEN || code === TVKeys.BACK_WEB) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !item) return null;

  const backdrop = item.backdrop_url
    ? `${serverUrl.replace(/\/+$/, '')}${item.backdrop_url}`
    : undefined;
  const poster = item.poster_url
    ? `${serverUrl.replace(/\/+$/, '')}${item.poster_url}`
    : undefined;

  const durationMins = item.duration_ms ? Math.round(item.duration_ms / 60000) : null;
  const resumeMins = item.resume_position_ms ? Math.round(item.resume_position_ms / 60000) : null;

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-xl flex items-center justify-center z-50 p-16">
      {backdrop && (
        <img
          src={backdrop}
          alt={item.title}
          className="absolute inset-0 w-full h-full object-cover opacity-25"
        />
      )}
      <div className="relative w-full max-w-6xl flex gap-12 bg-zinc-900/90 border border-zinc-800 rounded-3xl p-12 shadow-2xl">
        {poster && (
          <img
            src={poster}
            alt={item.title}
            className="w-80 h-[480px] object-cover rounded-2xl shadow-xl border border-zinc-700/50 shrink-0"
          />
        )}
        <div className="flex flex-col justify-between flex-1">
          <div>
            <div className="flex items-center gap-3 mb-2 text-zinc-400 font-semibold text-lg">
              {item.release_year && <span>{item.release_year}</span>}
              {durationMins && <span>• {durationMins}m</span>}
              {item.resolution && (
                <span className="px-2 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-sky-400">
                  {item.resolution}
                </span>
              )}
            </div>
            <h2 className="text-5xl font-black text-white mb-6 leading-tight">{item.title}</h2>
            {item.overview && (
              <p className="text-zinc-300 text-xl leading-relaxed max-w-2xl line-clamp-6">
                {item.overview}
              </p>
            )}
          </div>

          <div className="flex gap-4 mt-8">
            {item.resume_position_ms && item.resume_position_ms > 0 ? (
              <>
                <TVButton
                  id="detail-resume-btn"
                  groupId="item-detail-modal"
                  variant="primary"
                  onEnter={() => onPlay(item.id, item.resume_position_ms)}
                  autoFocus
                >
                  <Play className="w-6 h-6 fill-current" />
                  Resume ({resumeMins}m)
                </TVButton>
                <TVButton
                  id="detail-restart-btn"
                  groupId="item-detail-modal"
                  variant="secondary"
                  onEnter={() => onPlay(item.id, 0)}
                >
                  <RotateCcw className="w-6 h-6" /> Play from Beginning
                </TVButton>
              </>
            ) : (
              <TVButton
                id="detail-play-btn"
                groupId="item-detail-modal"
                variant="primary"
                onEnter={() => onPlay(item.id, 0)}
                autoFocus
              >
                <Play className="w-6 h-6 fill-current" /> Play
              </TVButton>
            )}

            <TVButton
              id="detail-close-btn"
              groupId="item-detail-modal"
              variant="secondary"
              onEnter={onClose}
            >
              <X className="w-6 h-6" /> Back
            </TVButton>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run tests and commit**

Run: `npm test`
Expected: PASS

```bash
git add src/api/items.ts src/screens/ItemDetailModal.tsx tests/
git commit -m "feat: implement item detail modal with resume and restart options"
```

---

### Task 7: Dual-Engine Video Player & Scrobbling

**Files:**
- Create: `src/player/driver.ts`
- Create: `src/player/html5-driver.ts`
- Create: `src/player/avplay-driver.ts`
- Create: `src/api/playback.ts`
- Create: `src/components/osd/PlayerOSD.tsx`
- Create: `src/screens/PlayerScreen.tsx`
- Test: `tests/player/driver.test.ts`
- Test: `tests/player/scrobble.test.ts`

**Interfaces:**
- Produces:
  - `PlayerDriver` interface & driver factory.
  - `reportPlaybackProgress(client, itemId, posMs, isPaused)`.
  - `PlayerScreen` with 10s scrobble heartbeat, D-pad OSD transport controls, and exit synchronization.

- [ ] **Step 1: Write test for playback scrobble heartbeat interval**

```ts
// tests/player/scrobble.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { reportPlaybackProgress } from '../../src/api/playback';

describe('Playback Scrobble', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('posts playback progress to Kadr server', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    global.fetch = mockFetch;

    await reportPlaybackProgress('http://localhost:8492', 'token-123', 'item-1', 45000, false);

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8492/api/v1/playback/progress',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ item_id: 'item-1', position_ms: 45000, is_paused: false }),
      })
    );
  });
});
```

- [ ] **Step 2: Implement PlayerDriver interface and drivers**

```ts
// src/player/driver.ts
export type PlayerState = 'idle' | 'buffering' | 'playing' | 'paused' | 'ended' | 'error';

export interface PlayerDriver {
  init(container: HTMLElement, streamUrl: string, startMs: number): Promise<void>;
  play(): void;
  pause(): void;
  seekTo(ms: number): void;
  destroy(): void;
  setSubtitleTrack(trackUrl: string | null): void;
  onTimeUpdate(callback: (posMs: number, durationMs: number) => void): void;
  onStateChange(callback: (state: PlayerState) => void): void;
  onError(callback: (error: string) => void): void;
}
```

```ts
// src/player/html5-driver.ts
import { PlayerDriver, PlayerState } from './driver';

export class Html5PlayerDriver implements PlayerDriver {
  private video: HTMLVideoElement | null = null;
  private timeCallback?: (posMs: number, durationMs: number) => void;
  private stateCallback?: (state: PlayerState) => void;
  private errorCallback?: (error: string) => void;

  async init(container: HTMLElement, streamUrl: string, startMs: number): Promise<void> {
    this.video = document.createElement('video');
    this.video.className = 'w-full h-full object-contain bg-black';
    this.video.src = streamUrl;
    this.video.preload = 'auto';

    this.video.addEventListener('timeupdate', () => {
      if (this.video && this.timeCallback) {
        this.timeCallback(Math.round(this.video.currentTime * 1000), Math.round(this.video.duration * 1000) || 0);
      }
    });

    this.video.addEventListener('playing', () => this.stateCallback?.('playing'));
    this.video.addEventListener('pause', () => this.stateCallback?.('paused'));
    this.video.addEventListener('waiting', () => this.stateCallback?.('buffering'));
    this.video.addEventListener('ended', () => this.stateCallback?.('ended'));
    this.video.addEventListener('error', () => this.errorCallback?.('HTML5 Video Error'));

    container.appendChild(this.video);

    if (startMs > 0) {
      this.video.currentTime = startMs / 1000;
    }

    await this.video.play().catch(() => {});
  }

  play(): void {
    this.video?.play().catch(() => {});
  }

  pause(): void {
    this.video?.pause();
  }

  seekTo(ms: number): void {
    if (this.video) {
      this.video.currentTime = Math.max(0, ms / 1000);
    }
  }

  setSubtitleTrack(trackUrl: string | null): void {
    // Subtitle handling in HTML5
  }

  destroy(): void {
    if (this.video) {
      this.video.pause();
      this.video.src = '';
      this.video.remove();
      this.video = null;
    }
  }

  onTimeUpdate(callback: (posMs: number, durationMs: number) => void): void {
    this.timeCallback = callback;
  }

  onStateChange(callback: (state: PlayerState) => void): void {
    this.stateCallback = callback;
  }

  onError(callback: (error: string) => void): void {
    this.errorCallback = callback;
  }
}
```

```ts
// src/player/avplay-driver.ts
import { PlayerDriver, PlayerState } from './driver';

export class TizenAvplayDriver implements PlayerDriver {
  private timeCallback?: (posMs: number, durationMs: number) => void;
  private stateCallback?: (state: PlayerState) => void;
  private errorCallback?: (error: string) => void;

  async init(_container: HTMLElement, streamUrl: string, startMs: number): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const avplay = (window as any).webapis?.avplay;
    if (!avplay) {
      throw new Error('Tizen AVPlay API not available');
    }

    avplay.open(streamUrl);
    avplay.setDisplayRect(0, 0, 1920, 1080);

    avplay.setListener({
      onbufferingstart: () => this.stateCallback?.('buffering'),
      onbufferingcomplete: () => this.stateCallback?.('playing'),
      oncurrentplaytime: (ms: number) => {
        const duration = avplay.getDuration();
        this.timeCallback?.(ms, duration);
      },
      onerror: () => this.errorCallback?.('AVPlay Hardware Error'),
    });

    avplay.prepareAsync(() => {
      if (startMs > 0) {
        avplay.seekTo(startMs);
      }
      avplay.play();
      this.stateCallback?.('playing');
    });
  }

  play(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).webapis?.avplay?.play();
    this.stateCallback?.('playing');
  }

  pause(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).webapis?.avplay?.pause();
    this.stateCallback?.('paused');
  }

  seekTo(ms: number): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).webapis?.avplay?.seekTo(ms);
  }

  setSubtitleTrack(_trackUrl: string | null): void {
    // Handled via AVPlay or WebVTT overlay
  }

  destroy(): void {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const avplay = (window as any).webapis?.avplay;
      if (avplay) {
        avplay.stop();
        avplay.close();
      }
    } catch {
      // Ignored
    }
  }

  onTimeUpdate(callback: (posMs: number, durationMs: number) => void): void {
    this.timeCallback = callback;
  }

  onStateChange(callback: (state: PlayerState) => void): void {
    this.stateCallback = callback;
  }

  onError(callback: (error: string) => void): void {
    this.errorCallback = callback;
  }
}

export function createPlayerDriver(): PlayerDriver {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof window !== 'undefined' && (window as any).webapis?.avplay) {
    return new TizenAvplayDriver();
  }
  return new Html5PlayerDriver();
}
```

- [ ] **Step 3: Implement `src/api/playback.ts` and `src/screens/PlayerScreen.tsx`**

```ts
// src/api/playback.ts
export async function reportPlaybackProgress(
  serverUrl: string,
  token: string,
  itemId: string,
  positionMs: number,
  isPaused: boolean
): Promise<void> {
  const cleanUrl = serverUrl.replace(/\/+$/, '');
  await fetch(`${cleanUrl}/api/v1/playback/progress`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      item_id: itemId,
      position_ms: positionMs,
      is_paused: isPaused,
    }),
  }).catch(() => {});
}
```

```tsx
// src/screens/PlayerScreen.tsx
import React, { useEffect, useRef, useState } from 'react';
import { createPlayerDriver } from '../player/avplay-driver';
import { PlayerDriver, PlayerState } from '../player/driver';
import { reportPlaybackProgress } from '../api/playback';
import { TVKeys } from '../navigation/keys';

interface PlayerScreenProps {
  itemId: string;
  title: string;
  serverUrl: string;
  token: string;
  initialTimeMs?: number;
  onExit: () => void;
}

export function PlayerScreen({
  itemId,
  title,
  serverUrl,
  token,
  initialTimeMs = 0,
  onExit,
}: PlayerScreenProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const driverRef = useRef<PlayerDriver | null>(null);
  const [playerState, setPlayerState] = useState<PlayerState>('buffering');
  const [positionMs, setPositionMs] = useState(initialTimeMs);
  const [durationMs, setDurationMs] = useState(0);
  const [showOSD, setShowOSD] = useState(true);
  const osdTimerRef = useRef<NodeJS.Timeout | null>(null);

  const resetOsdTimer = () => {
    setShowOSD(true);
    if (osdTimerRef.current) clearTimeout(osdTimerRef.current);
    osdTimerRef.current = setTimeout(() => {
      if (playerState === 'playing') setShowOSD(false);
    }, 4000);
  };

  useEffect(() => {
    if (!containerRef.current) return;

    const streamUrl = `${serverUrl.replace(/\/+$/, '')}/api/v1/streaming/${itemId}`;
    const driver = createPlayerDriver();
    driverRef.current = driver;

    driver.onTimeUpdate((pos, dur) => {
      setPositionMs(pos);
      setDurationMs(dur);
    });
    driver.onStateChange(setPlayerState);

    driver.init(containerRef.current, streamUrl, initialTimeMs);

    // 10s Scrobble interval
    const scrobbleInterval = setInterval(() => {
      reportPlaybackProgress(serverUrl, token, itemId, positionMs, playerState === 'paused');
    }, 10000);

    return () => {
      clearInterval(scrobbleInterval);
      if (osdTimerRef.current) clearTimeout(osdTimerRef.current);
      // Final scrobble sync before teardown
      reportPlaybackProgress(serverUrl, token, itemId, positionMs, true);
      driver.destroy();
    };
  }, [itemId, serverUrl, token]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const code = e.keyCode || e.which;
      resetOsdTimer();

      if (code === TVKeys.ENTER || code === TVKeys.PLAY_PAUSE || code === TVKeys.PLAY || code === TVKeys.PAUSE) {
        if (playerState === 'playing') {
          driverRef.current?.pause();
        } else {
          driverRef.current?.play();
        }
      } else if (code === TVKeys.LEFT) {
        driverRef.current?.seekTo(Math.max(0, positionMs - 10000));
      } else if (code === TVKeys.RIGHT) {
        driverRef.current?.seekTo(positionMs + 10000);
      } else if (code === TVKeys.BACK_TIZEN || code === TVKeys.BACK_WEB) {
        onExit();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [positionMs, playerState, onExit]);

  const progressPercent = durationMs > 0 ? (positionMs / durationMs) * 100 : 0;
  const formatTime = (ms: number) => {
    const totalSecs = Math.floor(ms / 1000);
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="relative w-full h-full bg-black overflow-hidden select-none">
      <div ref={containerRef} className="w-full h-full" />

      {/* OSD Overlay */}
      {showOSD && (
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/60 p-12 flex flex-col justify-between pointer-events-none transition-opacity duration-300">
          <div className="flex justify-between items-center">
            <h2 className="text-3xl font-bold text-white drop-shadow-md">{title}</h2>
            <div className="text-zinc-400 text-lg uppercase tracking-widest">{playerState}</div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="w-full h-3 bg-zinc-700/60 rounded-full overflow-hidden">
              <div className="h-full bg-sky-400 transition-all duration-200" style={{ width: `${progressPercent}%` }} />
            </div>
            <div className="flex justify-between text-zinc-300 font-mono text-lg">
              <span>{formatTime(positionMs)}</span>
              <span>{formatTime(durationMs)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests and commit**

Run: `npm test`
Expected: PASS

```bash
git add src/player/ src/api/playback.ts src/screens/PlayerScreen.tsx tests/
git commit -m "feat: implement dual-engine video player with Tizen AVPlay, HTML5 fallback, and scrobbler"
```

---

### Task 8: App Integration, Server Connect & State Machine

**Files:**
- Create: `src/screens/ServerConnectScreen.tsx`
- Modify: `src/App.tsx`
- Test: `tests/App.test.tsx`

**Interfaces:**
- Produces:
  - Top-level application coordinator managing views: `connect` -> `profiles` -> `browse` -> `player`.
  - Reconnection overlay when network fails.

- [ ] **Step 1: Write test for top-level flow**

```tsx
// tests/App.test.tsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../src/App';

describe('App Router', () => {
  it('renders ServerConnectScreen on first run when no server saved', () => {
    localStorage.clear();
    render(<App />);
    expect(screen.getByText(/Connect to Kadr/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement `src/screens/ServerConnectScreen.tsx`**

```tsx
// src/screens/ServerConnectScreen.tsx
import React, { useState, useEffect } from 'react';
import { discoverLocalServers, verifyServer } from '../api/discovery';
import { DiscoveredServer } from '../types/kadr';
import { TVButton } from '../components/tv/TVButton';
import { TVCard } from '../components/tv/TVCard';
import { Server, Wifi, RefreshCw } from 'lucide-react';

interface ServerConnectScreenProps {
  onServerSelected: (url: string, name: string) => void;
}

export function ServerConnectScreen({ onServerSelected }: ServerConnectScreenProps) {
  const [scanning, setScanning] = useState(true);
  const [servers, setServers] = useState<DiscoveredServer[]>([]);
  const [manualIp, setManualIp] = useState('192.168.1.');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const runDiscovery = async () => {
    setScanning(true);
    setErrorMsg(null);
    const found = await discoverLocalServers();
    setServers(found);
    setScanning(false);
    if (found.length === 1) {
      onServerSelected(found[0].url, found[0].name);
    }
  };

  useEffect(() => {
    runDiscovery();
  }, []);

  const handleManualConnect = async () => {
    setErrorMsg(null);
    const url = manualIp.startsWith('http') ? manualIp : `http://${manualIp}:8492`;
    const verified = await verifyServer(url);
    if (verified) {
      onServerSelected(url, verified.name);
    } else {
      setErrorMsg('Could not reach Kadr server at this IP/port.');
    }
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-950 p-16">
      <div className="flex items-center gap-4 mb-4">
        <Server className="w-12 h-12 text-sky-400" />
        <h1 className="text-5xl font-black text-white">Connect to Kadr</h1>
      </div>

      {scanning ? (
        <div className="flex flex-col items-center gap-4 my-12">
          <Wifi className="w-16 h-16 text-sky-400 animate-pulse" />
          <p className="text-2xl text-zinc-300">Searching your Wi-Fi/LAN for Kadr servers...</p>
        </div>
      ) : servers.length > 0 ? (
        <div className="flex flex-col items-center gap-6 my-8">
          <h2 className="text-2xl text-zinc-300">Select Discovered Server:</h2>
          <div className="flex gap-6">
            {servers.map((s, idx) => (
              <TVCard
                key={s.server_id}
                id={`server-${s.server_id}`}
                groupId="servers"
                title={s.name}
                subtitle={s.url}
                onSelect={() => onServerSelected(s.url, s.name)}
                autoFocus={idx === 0}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 my-8">
          <p className="text-xl text-zinc-400">No servers discovered on the local network.</p>
          <div className="flex items-center gap-4 mt-4">
            <input
              type="text"
              value={manualIp}
              onChange={(e) => setManualIp(e.target.value)}
              placeholder="e.g. 192.168.1.100"
              className="bg-zinc-900 border border-zinc-700 px-6 py-4 rounded-xl text-xl text-white outline-none w-96 text-center"
            />
            <TVButton id="manual-connect-btn" groupId="manual" onEnter={handleManualConnect} autoFocus>
              Connect
            </TVButton>
          </div>
          {errorMsg && <p className="text-rose-400 mt-2 text-lg">{errorMsg}</p>}
        </div>
      )}

      <div className="mt-8">
        <TVButton
          id="retry-discovery-btn"
          groupId="retry"
          variant="secondary"
          onEnter={runDiscovery}
        >
          <RefreshCw className="w-5 h-5" /> Retry Auto-Discovery
        </TVButton>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Implement `src/App.tsx` coordinator**

```tsx
// src/App.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { FocusProvider } from './navigation/FocusContext';
import { ApiClient } from './api/client';
import { listProfiles, authenticatePin } from './api/auth';
import { fetchMediaItem, MediaItemDetail } from './api/items';
import { ProfileCard } from './types/kadr';
import { ServerConnectScreen } from './screens/ServerConnectScreen';
import { ProfileSelectScreen } from './screens/ProfileSelectScreen';
import { BrowseScreen } from './screens/BrowseScreen';
import { ItemDetailModal } from './screens/ItemDetailModal';
import { PlayerScreen } from './screens/PlayerScreen';

type AppView = 'connect' | 'profiles' | 'browse' | 'player';

export default function App() {
  const [view, setView] = useState<AppView>('connect');
  const [serverUrl, setServerUrl] = useState<string | null>(() => localStorage.getItem('kadr_server_url'));
  const [serverName, setServerName] = useState<string>(() => localStorage.getItem('kadr_server_name') || 'Kadr');
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('kadr_token'));
  const [profiles, setProfiles] = useState<ProfileCard[]>([]);
  const [activeItem, setActiveItem] = useState<MediaItemDetail | null>(null);
  const [playerItem, setPlayerItem] = useState<{ id: string; title: string; startMs: number } | null>(null);

  const client = useMemo(() => {
    const c = new ApiClient(serverUrl || 'http://localhost:8492');
    if (token) c.setToken(token);
    return c;
  }, [serverUrl, token]);

  useEffect(() => {
    if (serverUrl && !token) {
      listProfiles(serverUrl)
        .then((p) => {
          setProfiles(p);
          setView('profiles');
        })
        .catch(() => setView('connect'));
    } else if (serverUrl && token) {
      setView('browse');
    }
  }, [serverUrl, token]);

  const handleServerSelected = async (url: string, name: string) => {
    localStorage.setItem('kadr_server_url', url);
    localStorage.setItem('kadr_server_name', name);
    setServerUrl(url);
    setServerName(name);
    try {
      const p = await listProfiles(url);
      setProfiles(p);
      setView('profiles');
    } catch {
      setView('connect');
    }
  };

  const handleLogin = async (userId: string, pin: string) => {
    if (!serverUrl) return { success: false };
    const res = await authenticatePin(serverUrl, userId, pin);
    if (res.success && res.data) {
      localStorage.setItem('kadr_token', res.data.token);
      setToken(res.data.token);
      setView('browse');
      return { success: true };
    }
    return { success: false, error: res.error, lockedOutSecs: res.retryAfterSecs };
  };

  const handleOpenDetail = async (itemId: string) => {
    try {
      const item = await fetchMediaItem(client, itemId);
      setActiveItem(item);
    } catch {
      // Ignored
    }
  };

  const handlePlayItem = (itemId: string, resumeMs = 0) => {
    setActiveItem(null);
    setPlayerItem({ id: itemId, title: activeItem?.title || 'Playing', startMs: resumeMs });
    setView('player');
  };

  return (
    <FocusProvider>
      <div className="w-[1920px] h-[1080px] bg-zinc-950 overflow-hidden relative font-sans text-zinc-100">
        {view === 'connect' && (
          <ServerConnectScreen onServerSelected={handleServerSelected} />
        )}

        {view === 'profiles' && (
          <ProfileSelectScreen
            profiles={profiles}
            serverName={serverName}
            onLogin={handleLogin}
            onBackToServerConnect={() => setView('connect')}
          />
        )}

        {view === 'browse' && (
          <>
            <BrowseScreen
              client={client}
              serverUrl={serverUrl || ''}
              onSelectItem={handleOpenDetail}
              onPlayItem={handlePlayItem}
              onSwitchProfile={() => {
                localStorage.removeItem('kadr_token');
                setToken(null);
                setView('profiles');
              }}
            />
            <ItemDetailModal
              isOpen={Boolean(activeItem)}
              item={activeItem}
              serverUrl={serverUrl || ''}
              onPlay={handlePlayItem}
              onClose={() => setActiveItem(null)}
            />
          </>
        )}

        {view === 'player' && playerItem && (
          <PlayerScreen
            itemId={playerItem.id}
            title={playerItem.title}
            serverUrl={serverUrl || ''}
            token={token || ''}
            initialTimeMs={playerItem.startMs}
            onExit={() => setView('browse')}
          />
        )}
      </div>
    </FocusProvider>
  );
}
```

- [ ] **Step 4: Run tests and commit**

Run: `npm test`
Expected: PASS

```bash
git add src/screens/ServerConnectScreen.tsx src/App.tsx tests/
git commit -m "feat: integrate app state machine with discovery, profiles, browse, and player"
```

---

### Task 9: WGT Packaging Script & Verification

**Files:**
- Create: `scripts/package-wgt.mjs`
- Create: `scripts/tizen-deploy.sh`
- Create: `public/icon.png` (or placeholder icon)
- Test: Full build and packaging command

**Interfaces:**
- Produces:
  - `npm run package:wgt` -> outputs deployable `kadr.wgt` archive directly from Node.js with zero dependencies.
  - End-to-end verification passing `npm run build`, `npm run test`, and `npm run package:wgt`.

- [ ] **Step 1: Implement zero-dependency Node.js `.wgt` packager**

```js
// scripts/package-wgt.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const distDir = path.resolve('dist');
const configXml = path.resolve('config.xml');
const outWgt = path.resolve('kadr.wgt');

if (!fs.existsSync(distDir)) {
  console.log('Building web bundle...');
  execSync('npm run build', { stdio: 'inherit' });
}

// Copy config.xml into dist for packaging
fs.copyFileSync(configXml, path.join(distDir, 'config.xml'));

console.log('Packaging into kadr.wgt...');
// Standard zip packaging
if (fs.existsSync(outWgt)) fs.unlinkSync(outWgt);

try {
  execSync(`cd dist && zip -r ../kadr.wgt .`, { stdio: 'inherit' });
  console.log(`\n Successfully created ${outWgt} (${(fs.statSync(outWgt).size / 1024).toFixed(1)} KB)`);
} catch (err) {
  console.error('Failed to create wgt zip archive:', err.message);
  process.exit(1);
}
```

- [ ] **Step 2: Implement `scripts/tizen-deploy.sh` helper**

```bash
#!/usr/bin/env bash
# scripts/tizen-deploy.sh
set -e

TV_IP=${1:-""}

if [ -z "$TV_IP" ]; then
  echo "Usage: ./scripts/tizen-deploy.sh <TV_IP_OR_TARGET_NAME>"
  exit 1
fi

echo "Deploying kadr.wgt to $TV_IP..."
tizen install -n kadr.wgt -t "$TV_IP"
tizen run -p kadr000001 -t "$TV_IP"
```

- [ ] **Step 3: Run full verification suite**

Run: `npm run build && npm test && npm run package:wgt`
Expected: All tests pass, build succeeds, and `kadr.wgt` is produced.

- [ ] **Step 4: Commit packaging scripts**

```bash
git add scripts/ public/
git commit -m "chore: add standalone WGT packaging script and Tizen deployment helper"
```
