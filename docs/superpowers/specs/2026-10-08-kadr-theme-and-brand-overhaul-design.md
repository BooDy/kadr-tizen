# Kadr Theme & Brand Overhaul Design Document

## 1. Overview & Context

This design document establishes the comprehensive visual and brand alignment between the **Kadr Tizen OS Client** and the official **Kadr Server** specification ([`theme.md`](file:///home/boody/work/personal/kadr/theme.md)).

Prior to this work, the Tizen client relied on a generic dark zinc (`#09090b`) and sky-blue (`#38bdf8`) palette with a placeholder app icon. This overhaul replaces that aesthetic with Kadr's warm cinema palette (deep burgundy canvas `#2A0A0A`, panel surfaces `#3B1111`, radiant orange `#FF6B00`, high-contrast golden focus rings `#FFB800`, and action red CTAs `#D43F15`), official brand assets, and a bespoke Samsung Smart TV launcher icon.

---

## 2. Brand Assets & Iconography

### 2.1 Official Logo Assets
* **Source**: `/home/boody/work/personal/kadr/assets/kadr-logo.png`
* **Destination**:
  * `public/kadr-logo.png` (for HTML entry and static links)
  * `src/assets/kadr-logo.png` (for bundled React components)
* **Application**:
  * Rendered as the top-level brand mark in `BrowseScreen` sidebar.
  * Rendered prominently on `ServerConnectScreen` above connection prompts.
  * Used as watermark/badge in modal dialogs where appropriate.

### 2.2 Samsung Smart TV Launcher Icon
* **File**: `public/icon.png` (referenced by `config.xml` `<icon src="icon.png"/>`)
* **Format**: 512 × 512 PNG, 32-bit RGBA.
* **Layout**:
  * Solid background: `#2A0A0A` (matches TV theme canvas).
  * Central emblem: High-resolution official Kadr logo scaled with ~15% safe-zone margin (approx 384 × 384 centered) to conform to Samsung Smart Hub tile guidelines.

---

## 3. Design Tokens & Color Palette

The Tailwind theme and CSS custom properties in `src/index.css` are configured as follows:

| Token Name | Value | Purpose & Usage in 10-Foot UI |
|---|---|---|
| `--color-canvas` | `#2A0A0A` | Primary application canvas, media grids, video player background |
| `--color-panel` | `#3B1111` | Navigation sidebars, modal surfaces, media cards, PIN pad buttons |
| `--color-panel-hover` | `#4A1616` | Lifted state for cards, lists, and secondary elements |
| `--color-accent` | `#FF6B00` | Radiant Orange: Active navigation pills, playback progress bar fills, selected tabs |
| `--color-highlight` | `#FFB800` | Golden Highlight: 10-foot TV Remote focus ring (`3px solid #FFB800` + glow), rating stars, critical badges |
| `--color-cta` | `#D43F15` | Action Red: Primary action buttons ("Play", "Resume", "Unlock", "Connect") |
| `--color-cta-hover` | `#B83410` | Active/pressed state of primary buttons |
| `--color-text-main` | `#F5E5E5` | High-contrast warm off-white for titles, body copy, active labels |
| `--color-muted` | `#5C3C3C` | Inactive icons, secondary metadata (release year, season tags, durations), disabled items |
| `--color-border-subtle` | `rgba(245, 229, 229, 0.08)` | 1px inner borders for modals, cards, and dividers (avoids mud in dark mode) |

### 3.1 Typography
* **Primary Interface Font**: Inter, ui-sans-serif, system-ui fallback stack.
* **Data / Technical Readouts**: JetBrains Mono, monospace fallback stack.

---

## 4. Component Visual Alignments

### 4.1 Focus Ring & Spatial Navigation (`.tv-focus-ring`)
* In 10-foot television environments, remote focus must be unmistakable from 10+ feet away.
* New CSS class definition:
  ```css
  .tv-focus-ring {
    outline: none;
    border-color: #FFB800 !important;
    box-shadow: 0 0 0 3px #FFB800, 0 0 28px rgba(255, 184, 0, 0.55);
    transform: scale(1.05);
    z-index: 30;
    transition: transform 0.15s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.15s ease-out;
  }
  ```

### 4.2 `TVButton`
* **Primary (`variant="primary"`)**:
  * Unfocused: Background `#D43F15` (Action Red), text `#F5E5E5`.
  * Focused: Background `#FF6B00` (Radiant Orange), text `#FFFFFF`, `.tv-focus-ring`.
* **Secondary (`variant="secondary"`)**:
  * Unfocused: Background `#3B1111`, border `1px solid rgba(245, 229, 229, 0.08)`, text `#F5E5E5`.
  * Focused: Background `#4A1616`, text `#FFFFFF`, `.tv-focus-ring`.
* **Danger (`variant="danger"`)**:
  * Unfocused: Background `#3B1111`, border `1px solid rgba(212, 63, 21, 0.4)`, text `#D43F15`.
  * Focused: Background `#D43F15`, text `#FFFFFF`, `.tv-focus-ring`.

### 4.3 `TVCard`
* Surface: Background `#3B1111`, border `1px solid rgba(245, 229, 229, 0.08)`.
* Poster container: Background `#2A0A0A`.
* Progress bar:
  * Track background: `rgba(0, 0, 0, 0.6)`.
  * Fill: `#FF6B00` (Radiant Orange).
* Badge: Background `#FF6B00` with white text.

### 4.4 `BrowseScreen` Sidebar & Dynamic Content
* Sidebar container: Background `#3B1111` with right border `rgba(245, 229, 229, 0.08)`.
* Brand Header: Displays `kadr-logo.png` (height 48px) with "Kadr" wordmark in `#F5E5E5`.
* Dynamic screen items (`nav-screen-${id}`):
  * Unfocused / Inactive: Text `#5C3C3C`, icon `#5C3C3C`.
  * Active / Selected: Text `#F5E5E5`, icon `#FF6B00`, background `rgba(255, 107, 0, 0.12)`.
  * Focused: `.tv-focus-ring`, background `#FF6B00`, text `#FFFFFF`.

### 4.5 Modals & Overlays
* **`ItemDetailModal`**:
  * Backdrop: `rgba(42, 10, 10, 0.85)`.
  * Content panel: Background `#3B1111`, subtle border `rgba(245, 229, 229, 0.08)`, rounded 16px.
  * Season tabs & episode cards use `#3B1111` surfaces and `#FFB800` focus glow.
* **`FolderBrowserModal`**:
  * Surface `#3B1111`, directory items `#2A0A0A` inner surface, breadcrumbs text `#F5E5E5` and `#FF6B00`.
* **`PinPadModal`**:
  * Keypad buttons: `#3B1111` surface, PIN dots: `#FF6B00`, error text: `#D43F15`.
* **`ImageViewerModal`**:
  * HUD backdrop: `rgba(42, 10, 10, 0.9)`.
  * Slideshow progress bar: `#FF6B00`.

### 4.6 `ServerConnectScreen` & `ProfileSelectScreen`
* Background canvas: `#2A0A0A`.
* Server connection header: Official Kadr logo image and title.
* Wi-Fi pulse animation: `#FF6B00` (Radiant Orange).
* Profile cards: `#3B1111` surface, golden `#FFB800` focus ring.

### 4.7 `PlayerScreen` & `PlayerOSD`
* Video container background: `#000000` / `#2A0A0A`.
* Scrubber track: Progress bar filled in `#FF6B00`, thumb in `#FFB800`.
* Subtitle menu popup: `#3B1111` background, `rgba(245, 229, 229, 0.08)` border, selected track in `#FF6B00`.

---

## 5. Verification & Testing Criteria

1. **Brand Assets Verification**:
   - `public/icon.png` is a 512×512 PNG with the official Kadr logo against `#2A0A0A`.
   - `public/kadr-logo.png` exists and renders cleanly without distortion.
2. **Automated Unit & Integration Tests**:
   - Run `npm test` to verify all 22 test suites (246 tests) pass with 0 regressions.
3. **Build & Package Integrity**:
   - `npm run build` generates the classic IIFE bundle (`dist/assets/app.js`) without errors.
   - `kadr.wgt` packages and installs onto the Samsung Smart TV (`UA55TU7000UXEG`).
4. **On-Device Visual Inspection**:
   - The launcher icon on Samsung Smart Hub displays the official Kadr logo.
   - The UI displays deep burgundy background, golden remote focus rings, radiant orange highlights, and action red buttons.
