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
