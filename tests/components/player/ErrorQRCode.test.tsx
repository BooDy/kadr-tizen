import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import QRCode from 'qrcode';
import {
  ErrorQRCode,
  formatCompactDiagnosticText,
  DiagnosticPayload,
} from '../../../src/components/player/ErrorQRCode';

describe('formatCompactDiagnosticText', () => {
  it('formats concise diagnostic text under 80 characters in expected format', () => {
    const payload: DiagnosticPayload = {
      app: 'kadr-tizen',
      item_id: 1234,
      title: 'Breaking Bad S01E01',
      stream_url: 'http://192.168.1.109:8492/api/v1/stream/1234',
      driver: 'Tizen AVPlay',
      error: 'Buffering timeout after 10s (Likely unsupported codec: dts)',
      timestamp: '2026-10-19T22:50:00Z',
    };

    const text = formatCompactDiagnosticText(payload);
    expect(text).toBe(
      'KADR ERR | #1234 | Tizen AVPlay | Buffering timeout after 10s (Likely unsu'
    );
    expect(text.length).toBeLessThan(80);
  });

  it('replaces newlines with spaces and truncates error to 40 characters', () => {
    const payload: DiagnosticPayload = {
      app: 'kadr-tizen',
      item_id: 'abc-99',
      stream_url: 'http://localhost/stream',
      driver: 'HTML5 Video',
      error: 'First line of error\nSecond line of error that is very very long indeed\r\nThird line',
      timestamp: '2026-10-19T22:50:00Z',
    };

    const text = formatCompactDiagnosticText(payload);
    expect(text).not.toContain('\n');
    expect(text).not.toContain('\r');
    expect(text).toBe(
      'KADR ERR | #abc-99 | HTML5 Video | First line of error Second line of error'
    );
    expect(text.length).toBeLessThan(80);
  });

  it('handles short errors without padding or unnecessary truncation', () => {
    const payload: DiagnosticPayload = {
      app: 'kadr-tizen',
      item_id: 42,
      stream_url: 'http://localhost/stream',
      driver: 'AVPlay',
      error: 'HTTP 404',
      timestamp: '2026-10-19T22:50:00Z',
    };

    const text = formatCompactDiagnosticText(payload);
    expect(text).toBe('KADR ERR | #42 | AVPlay | HTTP 404');
    expect(text.length).toBeLessThan(80);
  });
});

describe('ErrorQRCode', () => {
  it('renders an SVG QR code configured with low-density Level L, width 220, and compact payload', () => {
    const qrcodeSpy = vi.spyOn(QRCode, 'toString');

    const errorPayload: DiagnosticPayload = {
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
    const svg = screen.getByTestId('error-qr-code').querySelector('svg');
    expect(svg).toBeInTheDocument();

    expect(qrcodeSpy).toHaveBeenCalledWith(
      'KADR ERR | #1234 | Tizen AVPlay | Buffering timeout after 10s (Likely unsu',
      expect.objectContaining({
        type: 'svg',
        errorCorrectionLevel: 'L',
        margin: 1,
        width: 220,
        color: { dark: '#000000', light: '#FFFFFF' },
      }),
      expect.any(Function)
    );

    qrcodeSpy.mockRestore();
  });
});
