# Kadr Theme & Brand Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overhaul the visual identity and theme of the Kadr Tizen client to exactly mirror the official Kadr server theme (`theme.md`), including official logo assets, a 512×512 Samsung TV launcher icon, warm cinema color palette (`#2A0A0A`, `#3B1111`, `#FF6B00`, `#FFB800`, `#D43F15`), and high-contrast 10-foot remote focus rings.

**Architecture:** Configure Tailwind design tokens and CSS properties to adhere to Kadr's cinema dark theme. Replace generic icons in headers and sidebars with the official Kadr brand logo. Update core TV primitives (`TVButton`, `TVCard`, focus rings) and application screens (`BrowseScreen`, `ServerConnectScreen`, modals, and `PlayerOSD`). Generate a bespoke 512×512 launcher icon for Samsung Tizen's Smart Hub.

**Tech Stack:** React 19, Tailwind CSS v4, Lucide Icons, Tizen Web SDK CLI, Node.js / Canvas generation script, Vitest, React Testing Library.

## Global Constraints

- Primary Background: `#2A0A0A`
- Secondary Background / Panels: `#3B1111`
- Radiant Accent: `#FF6B00`
- Golden Highlight (Focus Ring): `#FFB800` (high contrast 3px solid border + golden glow)
- Accent Red (Primary CTA): `#D43F15`
- Text Primary: `#F5E5E5`
- Muted Elements: `#5C3C3C`
- Subtle Inner Borders: `rgba(245, 229, 229, 0.08)`
- TV Canvas: Fixed 1920 × 1080 resolution
- App ID: `kadr000001.KadrTV`
- All 246 existing tests must remain passing or be updated for new theme classes.

---

### Task 1: Brand Assets & Samsung Smart TV Launcher Icon

**Files:**
- Create: `public/kadr-logo.png`
- Create: `src/assets/kadr-logo.png`
- Modify: `public/icon.png`
- Create: `scripts/generate-icon.py` (or Node script)
- Test: `tests/brand/assets.test.ts`

**Interfaces:**
- Consumes: `/home/boody/work/personal/kadr/assets/kadr-logo.png`
- Produces: `public/icon.png` (512×512 RGBA PNG with `#2A0A0A` background and centered Kadr logo) and `public/kadr-logo.png`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/brand/assets.test.ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Brand Assets & Launcher Icon', () => {
  it('has official kadr-logo.png in public and src/assets', () => {
    const publicLogo = path.resolve('public/kadr-logo.png');
    const srcLogo = path.resolve('src/assets/kadr-logo.png');
    expect(fs.existsSync(publicLogo)).toBe(true);
    expect(fs.existsSync(srcLogo)).toBe(true);
    expect(fs.statSync(publicLogo).size).toBeGreaterThan(10000);
  });

  it('has 512x512 TV launcher icon with kadr branding in public/icon.png', () => {
    const iconPath = path.resolve('public/icon.png');
    expect(fs.existsSync(iconPath)).toBe(true);
    const buf = fs.readFileSync(iconPath);
    // PNG signature check
    expect(buf.slice(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    // IHDR width and height at offset 16 and 20
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    expect(width).toBe(512);
    expect(height).toBe(512);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/brand/assets.test.ts`
Expected: FAIL (missing `public/kadr-logo.png`, `src/assets/kadr-logo.png`, and icon not yet updated)

- [ ] **Step 3: Copy official logo and generate 512x512 launcher icon**

Create `scripts/generate-icon.py` using Python PIL/Pillow or Node script:
Composite `kadr-logo.png` onto a 512×512 background of `#2A0A0A` (RGB: 42, 10, 10) with ~15% safe padding (scaling logo to ~384×384 centered).
Copy `kadr-logo.png` to `public/kadr-logo.png` and `src/assets/kadr-logo.png`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/brand/assets.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/kadr-logo.png src/assets/kadr-logo.png public/icon.png scripts/generate-icon.py tests/brand/assets.test.ts
git commit -m "feat(brand): add official Kadr logo assets and generate 512x512 TV launcher icon"
```

---

### Task 2: Design Tokens, Cinema CSS Palette & 10-Foot Focus Ring

**Files:**
- Modify: `src/index.css`
- Modify: `index.html`
- Modify: `src/components/tv/TVButton.tsx`
- Modify: `src/components/tv/TVCard.tsx`
- Test: `tests/components/TVPrimitives.test.tsx`

**Interfaces:**
- Consumes: Tailwind v4 `@theme` block, `.tv-focus-ring`
- Produces: Warm cinema CSS variables, `#FFB800` 3px focus ring with golden glow, `#D43F15` CTA buttons

- [ ] **Step 1: Write failing tests for theme classes and focus ring**

Update `tests/components/TVPrimitives.test.tsx` to assert:
- `TVButton` primary variant applies `bg-[#D43F15]` / CTA styling and focus ring.
- `TVCard` applies `#3B1111` panel surface and `#FF6B00` progress bar color.
- `.tv-focus-ring` class definition contains `#FFB800` outline/box-shadow.

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run tests/components/TVPrimitives.test.tsx`
Expected: FAIL on old sky-blue / zinc color assertions.

- [ ] **Step 3: Update `src/index.css`, `index.html`, `TVButton.tsx`, and `TVCard.tsx`**

In `src/index.css`:
```css
@import "tailwindcss";

@theme {
  --color-canvas: #2A0A0A;
  --color-panel: #3B1111;
  --color-panel-hover: #4A1616;
  --color-accent: #FF6B00;
  --color-highlight: #FFB800;
  --color-cta: #D43F15;
  --color-cta-hover: #B83410;
  --color-text-main: #F5E5E5;
  --color-muted: #5C3C3C;
  --color-border-subtle: rgba(245, 229, 229, 0.08);

  --font-sans: 'Inter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

@layer base {
  body {
    background-color: #2A0A0A;
    color: #F5E5E5;
    font-family: var(--font-sans);
  }
}

/* 10-foot TV Focus Glow */
.tv-focus-ring {
  outline: none;
  box-shadow: 0 0 0 3px #FFB800, 0 0 28px rgba(255, 184, 0, 0.55);
  transform: scale(1.05);
  z-index: 30;
  transition: transform 0.15s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.15s ease-out;
}
```

In `index.html`:
Update `<body class="bg-[#2A0A0A] text-[#F5E5E5] ...">`.

In `TVButton.tsx`:
- `primary`: Unfocused `bg-[#D43F15] text-[#F5E5E5]`, Focused `bg-[#FF6B00] text-white tv-focus-ring`.
- `secondary`: Unfocused `bg-[#3B1111] text-[#F5E5E5] border border-[rgba(245,229,229,0.08)]`, Focused `bg-[#4A1616] text-white tv-focus-ring`.
- `danger`: Unfocused `bg-[#3B1111] text-[#D43F15] border border-[#D43F15]/30`, Focused `bg-[#D43F15] text-white tv-focus-ring`.

In `TVCard.tsx`:
- Background `bg-[#3B1111] border border-[rgba(245,229,229,0.08)]`.
- Poster container `bg-[#2A0A0A]`.
- Progress bar fill `bg-[#FF6B00]`.
- Focus applies `tv-focus-ring`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/TVPrimitives.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/index.css index.html src/components/tv/TVButton.tsx src/components/tv/TVCard.tsx tests/components/TVPrimitives.test.tsx
git commit -m "feat(theme): configure Kadr cinema color tokens, golden 10-foot focus ring, and update TV primitives"
```

---

### Task 3: Screen & Modal Visual Branding Overhaul

**Files:**
- Modify: `src/screens/BrowseScreen.tsx`
- Modify: `src/screens/ServerConnectScreen.tsx`
- Modify: `src/screens/ProfileSelectScreen.tsx`
- Modify: `src/screens/ItemDetailModal.tsx`
- Modify: `src/screens/FolderBrowserModal.tsx`
- Modify: `src/screens/ImageViewerModal.tsx`
- Modify: `src/components/pin/PinPadModal.tsx`
- Modify: `src/components/osd/PlayerOSD.tsx`
- Modify: `src/components/widgets/HeroSpotlightWidget.tsx`
- Modify: `src/components/widgets/CatalogGridWidget.tsx`
- Test: `tests/screens/BrowseScreen.test.tsx`
- Test: `tests/screens/ServerConnectScreen.test.tsx`
- Test: `tests/components/PlayerOSD.test.tsx`

**Interfaces:**
- Consumes: `kadr-logo.png`, cinema theme tokens
- Produces: Fully styled 10-foot screens with Kadr branding

- [ ] **Step 1: Write failing tests for screen branding**

Update `tests/screens/BrowseScreen.test.tsx` and `tests/screens/ServerConnectScreen.test.tsx`:
- Assert Kadr logo image (`img[src*="kadr-logo.png"]` or `alt="Kadr"`) renders in sidebar and connect screen.
- Assert sidebar and panels use `#3B1111` surface styling and `#FF6B00` active highlights.

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run tests/screens/BrowseScreen.test.tsx tests/screens/ServerConnectScreen.test.tsx`
Expected: FAIL on logo image and theme assertions.

- [ ] **Step 3: Update screens and modals**

1. `src/screens/BrowseScreen.tsx`:
   - Replace generic icon with `<img src="./kadr-logo.png" alt="Kadr" className="h-10 w-auto object-contain" />` at the top of the sidebar.
   - Sidebar background `bg-[#3B1111] border-r border-[rgba(245,229,229,0.08)]`.
   - Inactive tab text/icon `#5C3C3C`, active pill `bg-[#FF6B00]/15 text-[#F5E5E5]`, focused `bg-[#FF6B00] text-white tv-focus-ring`.
2. `src/screens/ServerConnectScreen.tsx`:
   - Background `bg-[#2A0A0A]`.
   - Render Kadr logo `<img src="./kadr-logo.png" alt="Kadr" className="h-20 w-auto mb-4" />`.
   - Wi-Fi searching icon in `text-[#FF6B00]`.
3. `src/screens/ProfileSelectScreen.tsx`:
   - Background `bg-[#2A0A0A]`.
   - Render Kadr logo header and `#3B1111` profile cards.
4. `src/screens/ItemDetailModal.tsx`:
   - Backdrop `bg-[#2A0A0A]/85`.
   - Panel `bg-[#3B1111] border border-[rgba(245,229,229,0.08)]`.
   - Season tabs and episode cards use `#3B1111` and `#FF6B00` progress.
5. `src/screens/FolderBrowserModal.tsx`:
   - Surface `bg-[#3B1111]`, breadcrumbs text `#F5E5E5`, active `#FF6B00`.
6. `src/components/pin/PinPadModal.tsx`:
   - Modal `bg-[#3B1111]`, PIN dots in `#FF6B00`.
7. `src/components/osd/PlayerOSD.tsx`:
   - Progress scrub bar filled in `#FF6B00`, thumb `#FFB800`.
   - Subtitle menu popup in `#3B1111` with `rgba(245, 229, 229, 0.08)` border.
8. `src/components/widgets/HeroSpotlightWidget.tsx` and `CatalogGridWidget.tsx`:
   - Rating badges `#FFB800`, CTAs `#D43F15`.

- [ ] **Step 4: Run all tests to verify everything passes**

Run: `npm test`
Expected: 22 test suites passed, 246+ tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/screens/ src/components/ tests/
git commit -m "feat(ui): apply Kadr cinema branding and logo across all screens, modals, and player OSD"
```

---

### Task 4: Production Build, Package & TV Deployment

**Files:**
- Modify: `scripts/tizen-deploy.sh`
- Verify: `dist/icon.png`, `dist/kadr-logo.png`, `dist/assets/app.js`

**Interfaces:**
- Consumes: Clean git tree, passes `npm test` and `npm run build`
- Produces: Signed `kadr.wgt` deployed to `UA55TU7000UXEG` (`192.168.1.100`)

- [ ] **Step 1: Run production build and verify artifact contents**

Run: `npm run build`
Verify `dist/index.html`, `dist/icon.png`, and `dist/kadr-logo.png` exist in `dist/`.

- [ ] **Step 2: Deploy to TV target**

Run: `./scripts/tizen-deploy.sh 192.168.1.100`
Verify: SDB connects, `tizen package` signs with `kadr` author profile, `tizen install` completes 100%, and `tizen run` launches PID on TV.

- [ ] **Step 3: Verification on TV**

Verify: TV launcher shows official Kadr logo tile; launched app displays deep cinema burgundy background, Kadr logo header, golden remote focus rings, and orange/red buttons.

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "chore(release): package and deploy Kadr v0.1.1 with official theme and launcher icon"
```
