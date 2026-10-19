import { useMemo } from 'react';
import QRCode from 'qrcode';

export interface DiagnosticPayload {
  app: string;
  item_id: string | number;
  title?: string;
  video_codec?: string;
  audio_codec?: string;
  stream_url: string;
  driver: string;
  error: string;
  tv_model?: string;
  tizen_version?: string;
  timestamp: string;
}

export function ErrorQRCode({ payload }: { payload: DiagnosticPayload }) {
  const qrSvg = useMemo(() => {
    try {
      const text = JSON.stringify(payload);
      let svg = '';
      QRCode.toString(text, { type: 'svg', margin: 1, width: 200, color: { dark: '#000000', light: '#FFFFFF' } }, (err, string) => {
        if (!err && string) {
          svg = string;
        }
      });
      return svg;
    } catch {
      return '';
    }
  }, [payload]);

  return (
    <div
      data-testid="error-qr-code"
      className="bg-white p-3 rounded-2xl shadow-xl flex flex-col items-center justify-center shrink-0"
    >
      {qrSvg ? (
        <div
          dangerouslySetInnerHTML={{ __html: qrSvg }}
          className="w-[200px] h-[200px] flex items-center justify-center [&>svg]:w-full [&>svg]:h-full"
        />
      ) : (
        <div className="w-[200px] h-[200px] flex items-center justify-center text-black font-bold">
          QR Code Unavailable
        </div>
      )}
      <span className="text-black text-xs font-bold mt-1 text-center">
        Scan with Phone Camera to Copy
      </span>
    </div>
  );
}
