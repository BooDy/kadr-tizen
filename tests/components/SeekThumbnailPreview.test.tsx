import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  SeekThumbnailPreview,
  TV_OSD_TRACK_WIDTH_PX,
  clampPreviewPercent,
  formatSeekTimestamp,
} from '../../src/components/osd/SeekThumbnailPreview';
import { StoryboardTileCrop } from '../../src/player/storyboard';

const SAMPLE_CROP: StoryboardTileCrop = {
  sheetIndex: 0,
  tileIndex: 14,
  localIndex: 14,
  col: 4,
  row: 1,
  x: 1280,
  y: 180,
  width: 320,
  height: 180,
  sheetWidth: 3200,
  sheetHeight: 1800,
  sheetUrl: 'http://127.0.0.1:8492/api/v1/media/101/storyboard/0.jpg?token=jwt-1',
};

describe('SeekThumbnailPreview', () => {
  it('formats seek timestamps cleanly across MM:SS and H:MM:SS', () => {
    expect(formatSeekTimestamp(0)).toBe('00:00');
    expect(formatSeekTimestamp(-5000)).toBe('00:00');
    expect(formatSeekTimestamp(45000)).toBe('00:45');
    expect(formatSeekTimestamp(650000)).toBe('10:50');
    expect(formatSeekTimestamp(3723000)).toBe('1:02:03');
  });

  it('clamps horizontal percentage inside 1920x1080 track so 0% and 100% never clip', () => {
    const cardWidth = 336; // 320px tile + 16px border/padding
    const leftAtZero = clampPreviewPercent(0, cardWidth, TV_OSD_TRACK_WIDTH_PX);
    const leftAtMid = clampPreviewPercent(50, cardWidth, TV_OSD_TRACK_WIDTH_PX);
    const leftAtEnd = clampPreviewPercent(100, cardWidth, TV_OSD_TRACK_WIDTH_PX);

    // Center X in pixels within the 1824px OSD track (48px..1872px on 1920x1080 screen)
    const zeroCenterPx = (leftAtZero / 100) * TV_OSD_TRACK_WIDTH_PX;
    const endCenterPx = (leftAtEnd / 100) * TV_OSD_TRACK_WIDTH_PX;

    expect(zeroCenterPx - cardWidth / 2).toBeGreaterThanOrEqual(-0.01);
    expect(endCenterPx + cardWidth / 2).toBeLessThanOrEqual(TV_OSD_TRACK_WIDTH_PX + 0.01);
    expect(leftAtMid).toBe(50);

    // Handles out-of-range / NaN inputs safely
    expect(clampPreviewPercent(-25, cardWidth, TV_OSD_TRACK_WIDTH_PX)).toBeCloseTo(leftAtZero, 4);
    expect(clampPreviewPercent(150, cardWidth, TV_OSD_TRACK_WIDTH_PX)).toBeCloseTo(leftAtEnd, 4);
    expect(Number.isFinite(clampPreviewPercent(Number.NaN, cardWidth, TV_OSD_TRACK_WIDTH_PX))).toBe(true);
  });

  it('renders sprite sheet crop with exact background-image, background-position, and background-size', () => {
    const { getByTestId } = render(
      <SeekThumbnailPreview
        positionMs={140000}
        durationMs={600000}
        spriteCrop={SAMPLE_CROP}
      />
    );

    const preview = getByTestId('seek-thumbnail-preview');
    expect(preview).toHaveAttribute('data-mode', 'sprite');

    const sprite = getByTestId('seek-thumbnail-sprite');
    expect(sprite).toHaveStyle({
      width: '320px',
      height: '180px',
      backgroundImage: `url("${SAMPLE_CROP.sheetUrl}")`,
      backgroundPosition: '-1280px -180px',
      backgroundSize: '3200px 1800px',
    });

    expect(getByTestId('seek-thumbnail-timestamp')).toHaveTextContent('02:20');
  });

  it('falls back to timestamp pill if sprite sheet probe image emits an error', () => {
    const { getByTestId, queryByTestId } = render(
      <SeekThumbnailPreview
        positionMs={140000}
        durationMs={600000}
        spriteCrop={SAMPLE_CROP}
      />
    );

    fireEvent.error(getByTestId('seek-thumbnail-sprite-probe'));

    expect(queryByTestId('seek-thumbnail-sprite')).not.toBeInTheDocument();
    expect(getByTestId('seek-thumbnail-pill')).toHaveTextContent('02:20');
  });

  it('renders single-frame fallback image and falls back to timestamp pill on load error', () => {
    const frameUrl = 'http://127.0.0.1:8492/api/v1/media/101/frame?t=40&w=320&token=jwt-1';
    const { getByTestId, queryByTestId } = render(
      <SeekThumbnailPreview
        positionMs={40000}
        durationMs={600000}
        frameUrl={frameUrl}
      />
    );

    const preview = getByTestId('seek-thumbnail-preview');
    expect(preview).toHaveAttribute('data-mode', 'frame');

    const img = getByTestId('seek-thumbnail-frame') as HTMLImageElement;
    expect(img.src).toBe(frameUrl);
    expect(getByTestId('seek-thumbnail-timestamp')).toHaveTextContent('00:40');

    // Simulate 404/503 on /frame
    fireEvent.error(img);
    expect(queryByTestId('seek-thumbnail-frame')).not.toBeInTheDocument();
    expect(getByTestId('seek-thumbnail-pill')).toHaveTextContent('00:40');
  });

  it('renders timestamp pill fallback when neither spriteCrop nor frameUrl is available and uses zero flex gap-* classes', () => {
    const { container, getByTestId } = render(
      <SeekThumbnailPreview
        positionMs={75000}
        durationMs={300000}
      />
    );

    expect(getByTestId('seek-thumbnail-preview')).toHaveAttribute('data-mode', 'pill');
    expect(getByTestId('seek-thumbnail-pill')).toHaveTextContent('01:15');

    // Verify Chromium 69 compliance: no gap-* classes anywhere in component
    const allElements = Array.from(container.querySelectorAll('*'));
    for (const el of allElements) {
      expect(el.className).not.toMatch(/\bgap-/);
    }
  });
});
