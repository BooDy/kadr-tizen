<div align="center">

  <img src="public/kadr-logo.png" alt="Kadr Logo" width="140" />

  # Kadr for Samsung Tizen TV (`kadr-tizenos`)

  **Native 10-foot Smart TV client for the [Kadr (كادر)](https://github.com/BooDy/kadr) self-hosted media server**

  ![Version](https://img.shields.io/badge/version-v1.0.0-blue.svg)
  ![Platform](https://img.shields.io/badge/Platform-Samsung%20Tizen%20TV%205.0%2B-1428A0.svg)
  ![Engine](https://img.shields.io/badge/Target-Chromium%2069%2B%20%7C%20AVPlay-emerald.svg)
  ![React](https://img.shields.io/badge/React-19-61DAFB.svg?logo=react)
  ![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6.svg?logo=typescript)

</div>

---

**`kadr-tizenos`** is the official Samsung Tizen OS Smart TV client for **[Kadr](https://github.com/BooDy/kadr)**. Purpose-built for Samsung's 10-foot D-pad remote experience and older Smart TV browser engines (Tizen 5.0 / 5.5+ running Chromium 69+), it pairs Samsung's hardware-accelerated **`webapis.avplay`** media pipeline with an HTML5 + `hls.js` fallback engine, deterministic spatial D-pad navigation, virtualized large-library rendering, and full multi-room sync over Server-Sent Events (SSE).

---

## Table of Contents

1. [Key Features](#key-features)
2. [Supported Samsung TVs](#supported-samsung-tvs)
3. [How Installing Apps on Samsung TVs Works](#how-installing-apps-on-samsung-tvs-works)
4. [Installation Guide (Sideloading to Your TV)](#installation-guide-sideloading-to-your-tv)
   - [Step 1: Enable Developer Mode on Your Samsung TV](#step-1-enable-developer-mode-on-your-samsung-tv)
   - [Step 2: Install Tizen Studio CLI & Certificate Tools](#step-2-install-tizen-studio-cli--certificate-tools)
   - [Step 3: Connect via `sdb` & Create a Samsung Certificate](#step-3-connect-via-sdb--create-a-samsung-certificate)
   - [Step 4A: Build & Sideload Directly from Source (1 Command)](#step-4a-build--sideload-directly-from-source-1-command)
   - [Step 4B: Re-Sign & Install a Prebuilt `kadr.wgt` Release](#step-4b-re-sign--install-a-prebuilt-kadrwgt-release)
5. [Publishing to the Samsung TV App Gallery (Seller Office Guide)](#publishing-to-the-samsung-tv-app-gallery-seller-office-guide)
6. [TV Remote Controls & Shortcuts](#tv-remote-controls--shortcuts)
7. [Architecture & Tizen Engineering Notes](#architecture--tizen-engineering-notes)
8. [Development, Testing & CI/CD](#development-testing--cicd)

---

## Key Features

- **Hybrid Hardware `AVPlay` + HTML5/`hls.js` Playback Engine**:
  - Uses Samsung's native `webapis.avplay` hardware decoder on real TVs for Direct Play (`HTTP 206` byte-range) and automatic server-side HLS transcoding fallback (`MKV`, `MP4`, `HEVC`, `DTS`/`TrueHD` $\to$ `AAC`, or capped `1080p`/`720p`/`480p` bitrates).
  - Transparently switches to `Html5PlayerDriver` + `hls.js` on desktop browsers and for pitch-preserved audiobook/music playback (`0.75x–2.0x`).
- **Cinema Video OSD, Trickplay & Up-Next Queue**:
  - Storyboard sprite-sheet seek previews, chapter/scrubber D-pad seeking, auto-resume & 10-second scrobble heartbeats, and configurable Up-Next episode auto-advance.
- **Multi-Audio Track & Subtitle Engine**:
  - Live switching across multiple embedded audio streams (`GET /api/v1/items/{id}/audio-tracks`) in both Direct Play (`AVPlay.setSelectTrack`) and seamless HLS transcode sessions, with persistent language preferences.
  - Custom TV-safe WebVTT cue renderer supporting embedded MKV/MP4 subtitles, `.srt`/`.vtt` sidecars, live OpenSubtitles search & download, sync offset adjustment, and customizable font size/background opacity.
- **Dedicated Music & Audiobook Stage**:
  - Split cover-art stage + live Up-Next queue column, `Play All` album folder queueing, `Repeat Off / All / One`, pitch-preserved `0.75x–2.0x` audiobook speed memory, and a **60-second Ambient Auto-Dim** mode (`~25%` stage brightness over `#080202`) for OLED/LED panel protection while keeping audio alive.
- **Global Search, Declarative Layouts & Private Libraries**:
  - Split TV Search screen combining a `6×6` D-pad alphanumeric grid with Samsung's native Tizen IME `<input>` bar and media-type filters (`All`, `Movies`, `Series`, `Episodes`, `Music`).
  - Renders Kadr's Declarative Widget AST (`HeroSpotlight`, `CardCarousel`, `CatalogGrid`), ordered `Playlists`, hierarchical `Folder Browser`, photo slideshows, and 4-digit PIN-locked private libraries.
- **Virtualized 60fps Navigation for Huge Libraries**:
  - Windowed horizontal episode strips (`1–50`, `51–100` range pills + `FF`/`REW` `±10` episode skip) and row-virtualized 6-column catalog/folder grids (`CH UP` / `CH DOWN` page jumps) keep DOM node counts bounded even on `1,000+` item folders and anime seasons.
- **Samsung QA-Grade Hardware Lifecycle & Settings**:
  - Automatic `webapis.appcommon` screensaver lock during active media/slideshows, Smart Hub `visibilitychange` suspend/restore (`AVPlay.suspend()` / `restore()`), root `Back` `<ExitConfirmModal>`, centralized `401` session-expired recovery, and a dedicated **Settings & TV Diagnostics** tab.

---

## Supported Samsung TVs

| Model Year | Tizen OS Version | Web Engine | Status |
| :--- | :--- | :--- | :--- |
| **2019** (RU / Q-series) | Tizen 5.0 | Chromium 63 | Supported (`required_version="5.0"`) |
| **2020** (TU / Q-series, e.g. `UA55TU7000UXEG`) | Tizen 5.5 | Chromium 69 | **Primary hardware target** |
| **2021** (AU / QN-series) | Tizen 6.0 | Chromium 76 | Supported |
| **2022** (BU / QN-series) | Tizen 6.5 | Chromium 85 | Supported |
| **2023–2026+** (CU / DU / Neo QLED / OLED) | Tizen 7.0 – 9.0 | Chromium 94+ | Supported |

---

## How Installing Apps on Samsung TVs Works

Unlike Android TV / Google TV (where you can copy an `.apk` onto a USB stick and install it), **consumer Samsung Tizen TVs enforce two platform rules** you should know upfront:

1. **Why copying `kadr.wgt` to a USB stick (`userwidget/`) does not work on retail TVs:**
   On Tizen 5.0+ consumer TVs, Samsung disabled raw `.wgt` USB installation. USB installation only accepts encrypted `.tmg` + `.license` bundles generated by an approved Samsung Partner account.
2. **Why every sideloaded `.wgt` must be signed for your specific TV:**
   Samsung TVs verify cryptographic signatures (`author-signature.xml` and `signature1.xml`) inside every `.wgt` package. For sideloading, the **Distributor Certificate** inside the `.wgt` must contain your specific TV's **DUID (Device Unique Identifier)**—otherwise the TV rejects installation with error `118` / `118019`.

Because of this, there are **two ways** to get Kadr onto a Samsung TV:
- **For personal / home use (Free, ~10 minutes setup):** Enable **Developer Mode** on your TV and push `kadr.wgt` over your local Wi-Fi/LAN using `sdb` + Tizen Studio CLI ([Installation Guide below](#installation-guide-sideloading-to-your-tv)). Once installed, **Kadr stays on your TV's Home bar permanently** just like Netflix or YouTube.
- **For the public Samsung "Apps" Gallery on the TV:** Submit the `.wgt` through the **Samsung Apps TV Seller Office** ([Seller Office Guide below](#publishing-to-the-samsung-tv-app-gallery-seller-office-guide)).

---

## Installation Guide (Sideloading to Your TV)

Your computer (Linux, macOS, or Windows) and your Samsung TV must be on the **same local network (Wi-Fi or Ethernet)**.

### Step 1: Enable Developer Mode on Your Samsung TV

1. Turn on your Samsung TV, press the **Home** button on your remote, and open the **Apps** gallery.
2. While inside the **Apps** screen (do not select any specific app), press **`1` `2` `3` `4` `5`** using your remote:
   - *If you have a compact Samsung "One Remote" without number buttons:* press the **`123`** (number pad) button on the remote, enter `12345` on the on-screen keypad, and press **Done**.
3. A **Developer mode** dialog will pop up:
   - Switch **Developer Mode** to **On**.
   - Enter the **local LAN IP address of your computer** (e.g. `192.168.1.50` — find it with `ip a` on Linux, `ipconfig getifaddr en0` on macOS, or `ipconfig` on Windows).
   - Select **OK**.
4. **Hard-reboot the TV**: hold down the **Power** button on the TV remote for ~5 seconds until the TV turns off and reboots with the Samsung Tizen logo (or unplug it for 10 seconds).
5. Find your TV's own LAN IP address in **Settings → General → Network → Network Status → IP Settings**.

---

### Step 2: Install Tizen Studio CLI & Certificate Tools

1. Download and install **[Tizen Studio](https://developer.tizen.org/development/tizen-studio/download)** (either the IDE installer or CLI installer; default path on Linux/macOS is `~/tizen-studio`).
2. Open **Tizen Package Manager** (`~/tizen-studio/package-manager/package-manager.bin`) and install:
   - Under **Main SDK**: `Tizen SDK tools` (includes `sdb` and `tizen` CLI).
   - Under **Extension SDK**: **`TV Extensions`** and **`Samsung Certificate Extension`** *(required — generic Tizen certificates are rejected by retail Samsung TVs; you need the Samsung extension)*.
3. Add `sdb` and `tizen` to your shell `PATH`:
   ```bash
   export PATH="$HOME/tizen-studio/tools:$HOME/tizen-studio/tools/ide/bin:$PATH"
   ```

---

### Step 3: Connect via `sdb` & Create a Samsung Certificate

1. Connect to your TV over LAN and verify it appears:
   ```bash
   sdb connect <TV_LAN_IP>
   sdb devices
   # Expected output:
   # 192.168.1.85:26101    device    UA55TU7000UXEG
   ```
2. Retrieve your TV's **DUID** (starts with `2.0/...` on Tizen 5.0+):
   - Either open **Tizen Device Manager** (`~/tizen-studio/tools/device-manager/bin/device-manager`), right-click your connected TV, and inspect **DUID** (and click **Permit to install applications** if prompted),
   - Or check on the TV under **Settings → Support → About This TV**.
3. Open **Tizen Certificate Manager** (`~/tizen-studio/tools/certificate-manager/certificate-manager`):
   1. Click **`+`** to create a new certificate profile and select **Samsung** (not *Tizen*).
   2. Choose **TV**, name the profile **`kadr`**, and sign in with your free Samsung Account when prompted.
   3. Create a new **Author Certificate** (save your password).
   4. Create a new **Distributor Certificate** (`Public` privilege level) — your connected TV's **DUID** will auto-populate in the DUID list (or paste it into the first DUID slot).
   5. Finish the wizard so `kadr` is set as the active certificate profile.

---

### Step 4A: Build & Sideload Directly from Source (1 Command)

Building from source requires **Node.js 20+** and `npm`. Clone the repository, install dependencies, and deploy straight to your TV:

```bash
git clone https://github.com/BooDy/kadr-tizenos.git
cd kadr-tizenos
npm ci

# Builds the Chrome 69 bundle, signs kadr.wgt with profile 'kadr', installs, and launches on TV:
npm run deploy:tv -- <TV_LAN_IP>
```

> **Tip:** If you use a different Tizen certificate profile name than `kadr`, pass `TIZEN_SECURITY_PROFILE=<your-profile> npm run package:wgt` before running `npm run deploy:tv -- <TV_LAN_IP> --no-build`.

Once launched, open **Apps** on your TV, highlight **Kadr**, press **Down**, and choose **Add to Home** so it stays pinned on your main Smart Hub launcher bar.

---

### Step 4B: Re-Sign & Install a Prebuilt `kadr.wgt` Release

If you downloaded `kadr.wgt` from [GitHub Releases](https://github.com/BooDy/kadr-tizenos/releases) instead of building from source with Node.js, verify its checksum, re-sign it with your TV's certificate profile, and install it:

```bash
# 1. Verify download integrity
sha256sum -c kadr.wgt.sha256

# 2. Extract into a clean temp folder and re-sign with your Samsung TV profile ('kadr')
mkdir -p /tmp/kadr-unpack && unzip -q kadr.wgt -d /tmp/kadr-unpack
rm -f /tmp/kadr-unpack/author-signature.xml /tmp/kadr-unpack/signature*.xml
tizen package -t wgt -s kadr -o /tmp -- /tmp/kadr-unpack

# 3. Connect to your TV and install + launch
sdb connect <TV_LAN_IP>
TARGET_NAME=$(sdb devices | awk '/device/{print $3; exit}')
tizen install -n /tmp/Kadr.wgt -t "$TARGET_NAME"
tizen run -p kadr000001.KadrTV -t "$TARGET_NAME"
```

---

## Publishing to the Samsung TV App Gallery (Seller Office Guide)

The **"Apps"** store you see on your Samsung TV is operated through the **[Samsung Apps TV Seller Office](https://seller.samsungapps.com/tv)**. There is no separate open "Tizen Store" for TVs—every app in the TV's App Gallery goes through Samsung Seller Office certification.

Here is an honest breakdown of how Seller Office works and what it takes to publish `kadr-tizenos` there:

### 1. Private / Beta Distribution (Free — Family & Friends Without Sideloading)
Seller Office includes a **Beta Test / Closed User Group** feature:
- Register a free account at **[seller.samsungapps.com/tv](https://seller.samsungapps.com/tv)** using your Samsung Account.
- Create an application entry, upload your signed `kadr.wgt`, and add the **Samsung Account email addresses** of your TV / family members' TVs to the **Beta Test** group.
- Invited TVs signed into those Samsung Accounts can install the test build without enabling Developer Mode or using `sdb`, and **without completing full public QA store review**.

### 2. Full Public App Gallery Release (How Plex / Jellyfin / Emby Publish)
If you want **Kadr** searchable by everyone in the public Samsung TV App Gallery, keep these four requirements in mind:

| Requirement | Details & Current `kadr-tizenos` Readiness |
| :--- | :--- |
| **1. Account Tier & Geography Catch** | A free **Public (Individual) Seller** account can publish publicly **only in the United States**. To distribute in **all countries worldwide** (Europe, MENA/Egypt, Asia, etc.), you must apply for **Partner Seller** membership inside Seller Office (`Membership → Partner Request`), which is reviewed by a regional Samsung Content Manager and generally expects an organization/company profile or established open-source project presence. |
| **2. Tizen API Privilege Pre-Test** | **Ready out-of-the-box.** Public Sellers are restricted to `Public`-level Tizen APIs. Every privilege declared in [`config.xml`](config.xml) (`internet`, `tv.inputdevice`, `avplay`, `appcommon`, `application.launch`) is **Public-level**—no restricted Partner/Platform APIs are used. |
| **3. Samsung QA Lifecycle Rules** | **Ready out-of-the-box.** Samsung QA tests four strict hardware behaviors that cause most rejections, all implemented in `kadr-tizenos`:<br>• Pressing `Back` at the root screen must show an exit confirmation dialog (`<ExitConfirmModal>`).<br>• Pressing `EXIT` / `Home` (Smart Hub) during video playback must suspend `AVPlay` cleanly and restore on resume (`visibilitychange`).<br>• Screensaver must be prevented during video/slideshow playback and re-enabled when paused or browsing (`webapis.appcommon`).<br>• App title in Seller Office must match `<name>Kadr</name>` in `config.xml` exactly. |
| **4. Live Demo Server for Samsung QA** | **Action required at submission time.** Because Kadr is a self-hosted media client with no bundled content, Samsung's QA testers will reject the submission if they are greeted only by an unusable "Enter Server URL" screen. When submitting for review, stand up a temporary public HTTPS `kadr` instance populated with **royalty-free / Creative Commons media** (e.g. Blender Open Movies such as *Sintel*, *Tears of Steel*, *Big Buck Bunny*, plus CC0 music tracks) and provide the demo **Server URL + Profile PIN** inside Seller Office's **Test Information** field + Samsung's UI Description `.pptx` template. |

#### Store Graphic Assets Required by Seller Office
When preparing your Seller Office submission, prepare:
- **App Foreground Logo:** `1920 × 1080` PNG (transparent or solid, $\le 300\text{ KB}$)
- **App Background Image:** `512 × 423` PNG/JPG ($\le 300\text{ KB}$)
- **4× App Screenshots:** `1920 × 1080` JPG ($\le 500\text{ KB}$ each — Home, Item Details, Video Player OSD, Music/Settings)
- **UI Description Document:** Samsung's official `.pptx` template showing remote navigation flows and your test server login steps.

---

## TV Remote Controls & Shortcuts

`kadr-tizenos` supports standard Samsung IR remotes, Bluetooth "One Remotes", and desktop keyboard equivalents for browser development:

| Action | Samsung TV Remote | Desktop Keyboard (Dev) | Behavior |
| :--- | :--- | :--- | :--- |
| **Navigate** | D-Pad `Up` / `Down` / `Left` / `Right` | Arrow Keys | Spatial & rail-aware focus movement |
| **Select / Confirm** | `OK` / `Enter` | `Enter` | Activate card, button, or toggle |
| **Back / Return** | `Return` (`10009`) | `Escape` / `Backspace` | Layered modal/OSD dismissal; opens Exit dialog at root |
| **Play / Pause** | `Play/Pause` (`10252`) / `Play` (`415`) / `Pause` (`19`) | `Space` / `P` | Instant-play focused Search card, or toggle active playback |
| **Fast Forward / Rewind** | `FF` (`417`) / `REW` (`412`) | `.` / `,` (or Scrubber `Left`/`Right`) | Seek media playback; skip `±10` episodes on long Season strips |
| **Page Jump (Large Grids)** | `CH UP` (`427`) / `CH DOWN` (`428`) | `PageUp` / `PageDown` | Jump 3 rows (`18` items) at a time in Folders & Catalog Grids |
| **Stop Playback** | `Stop` (`413`) | `S` | Save progress and exit player back to previous view |
| **Exit App** | `EXIT` (`10182`) | — | Terminates Tizen application cleanly |

---

## Architecture & Tizen Engineering Notes

```text
src/
├── api/            # Kadr REST, SSE (/api/v1/events), Search, Watch-State & Discovery clients
├── components/
│   ├── osd/        # Cinema Video OSD, Storyboard scrubber, SubtitleModal & AudioTrackModal
│   ├── pin/        # 4-digit TV PIN pad for user profiles & private library unlock tokens
│   ├── player/     # Dedicated Music & Audiobook Split Stage + Ambient Auto-Dim overlay
│   ├── playlists/  # AddToPlaylistModal & playlist management dialogs
│   ├── tv/         # Error boundaries, ExitConfirmModal & TV UI primitives
│   └── widgets/    # Declarative AST widgets (HeroSpotlight, CardCarousel, virtualized CatalogGrid)
├── navigation/     # Spatial D-pad FocusContext, focus traps, group restoration & TV keymap
├── player/         # PlayerDriver interface, AvPlayDriver, Html5PlayerDriver, compatibility & preferences
├── screens/        # ServerConnect, ProfileSelect, Browse, Search, Playlists, FolderBrowser,
│                   # ItemDetail, ImageViewer, PlayerScreen & SettingsView
└── utils/          # Tizen lifecycle adapter, row/strip virtualization math & formatters
```

### Critical Tizen 5.0 / Chromium 69 Constraints Enforced in CI
1. **Zero CSS Flex `gap-*` Classes (`(! grep -rn "gap-" src/)`):**
   Chromium 69 supports `gap` on CSS Grid (`gridGap`), **not** on CSS Flexbox (added in Chromium 84). Every flex layout in `src/` uses explicit margins or spacing helpers, enforced automatically in Vitest and GitHub Actions CI.
2. **PostCSS `@layer` Unwrapping & Legacy Bundle Target:**
   [`vite.config.ts`](vite.config.ts) compiles with `@vitejs/plugin-legacy` targeting `chrome69` and includes a custom PostCSS pass that unwraps Tailwind CSS v4 `@layer` blocks and normalizes modern color functions so styles render identically on 2019/2020 Samsung TVs.
3. **Unobstructed Hardware Video Plane:**
   Samsung `AVPlay` renders decoded video on a hardware plane *underneath* the transparent WebView (`document.body`). Whenever `PlayerScreen` mounts in video mode, `BrowseScreen` and all browse modals are completely unmounted so opaque backdrops never occlude hardware video.

---

## Development, Testing & CI/CD

### Local Commands

```bash
# Install dependencies
npm ci

# Start local Vite dev server (opens in desktop browser using Html5PlayerDriver + hls.js)
npm run dev

# Run the full Vitest unit & integration suite (68 test files / 740+ tests)
npm test

# Type-check both app & Node/Vite configs and build the production Chrome 69 bundle
npm run build

# Package dist/ + config.xml into kadr.wgt and generate kadr.wgt.sha256
npm run package:wgt

# Build, sign, push over sdb, and launch on a Samsung TV
npm run deploy:tv -- <TV_LAN_IP>
```

### Automated GitHub Releases & Optional CI Signing

Pushing any `v*` tag (e.g. `git tag -a v1.0.0 -m "v1.0.0" && git push origin --follow-tags`) triggers [`.github/workflows/ci-and-release.yml`](.github/workflows/ci-and-release.yml):
1. Runs the zero-`gap-*` check, dual `tsconfig` check, full Vitest suite, and `chrome69` production build.
2. Packages `kadr.wgt` + `kadr.wgt.sha256` (signed automatically if optional repository secrets `TIZEN_AUTHOR_CERT_BASE64`, `TIZEN_AUTHOR_PASSWORD`, `TIZEN_DISTRIBUTOR_CERT_BASE64`, and `TIZEN_DISTRIBUTOR_PASSWORD` are configured; otherwise builds a clean unsigned `.wgt` archive ready for per-TV DUID re-signing).
3. Verifies `sha256sum -c kadr.wgt.sha256` in an isolated release job and publishes a GitHub Release with `kadr.wgt` and `kadr.wgt.sha256` attached.
