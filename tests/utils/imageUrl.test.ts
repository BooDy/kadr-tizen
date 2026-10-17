import { describe, it, expect } from 'vitest';
import { getAuthenticatedImageUrl } from '../../src/utils/imageUrl';

describe('getAuthenticatedImageUrl', () => {
  it('returns undefined if imagePath is undefined or empty', () => {
    expect(getAuthenticatedImageUrl('http://192.168.1.100:8492', undefined)).toBeUndefined();
    expect(getAuthenticatedImageUrl('http://192.168.1.100:8492', '')).toBeUndefined();
  });

  it('prepends clean serverUrl to relative image paths', () => {
    const url = getAuthenticatedImageUrl('http://192.168.1.100:8492/', 'api/v1/libraries/lib-1/image?path=pic.jpg');
    expect(url).toContain('http://192.168.1.100:8492/api/v1/libraries/lib-1/image?path=pic.jpg');
  });

  it('appends token query param when token is provided', () => {
    const url = getAuthenticatedImageUrl(
      'http://192.168.1.100:8492',
      '/api/v1/libraries/lib-1/image?path=pic.jpg',
      'jwt-token-123'
    );
    expect(url).toBe('http://192.168.1.100:8492/api/v1/libraries/lib-1/image?path=pic.jpg&token=jwt-token-123');
  });

  it('appends unlocked tokens when unlockTokens array has items', () => {
    const url = getAuthenticatedImageUrl(
      'http://192.168.1.100:8492',
      '/api/v1/libraries/lib-1/image?path=pic.jpg',
      'jwt-token-123',
      ['unlock-a', 'unlock-b']
    );
    expect(url).toBe(
      'http://192.168.1.100:8492/api/v1/libraries/lib-1/image?path=pic.jpg&token=jwt-token-123&unlocked=unlock-a%2Cunlock-b'
    );
  });

  it('handles absolute http/https paths correctly while appending authentication params', () => {
    const url = getAuthenticatedImageUrl(
      'http://192.168.1.100:8492',
      'http://192.168.1.100:8492/api/v1/libraries/lib-1/image?path=photo.png',
      'token-abc'
    );
    expect(url).toBe('http://192.168.1.100:8492/api/v1/libraries/lib-1/image?path=photo.png&token=token-abc');
  });
});
