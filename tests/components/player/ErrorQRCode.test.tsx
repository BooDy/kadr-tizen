import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorQRCode } from '../../../src/components/player/ErrorQRCode';

describe('ErrorQRCode', () => {
  it('renders an SVG QR code containing the structured diagnostic payload', async () => {
    const errorPayload = {
      app: 'kadr-tizen',
      item_id: 1234,
      title: 'Breaking Bad S01E01',
      video_codec: 'hevc',
      audio_codec: 'dts',
      stream_url: 'http://192.168.1.109:8492/api/v1/stream/1234',
      driver: 'Tizen AVPlay',
      error: 'Buffering timeout after 10s (Likely unsupported codec: dts)',
      tv_model: 'UA55TU7000UXEG',
      tizen_version: '5.5',
      timestamp: '2026-10-19T22:50:00Z',
    };

    render(<ErrorQRCode payload={errorPayload} />);

    expect(screen.getByTestId('error-qr-code')).toBeInTheDocument();
    // SVG element should be rendered
    const svg = screen.getByTestId('error-qr-code').querySelector('svg');
    expect(svg).toBeInTheDocument();
  });
});
