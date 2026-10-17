/**
 * Constructs a fully qualified and authenticated image URL for TV image elements.
 * Appends token and private library unlock tokens as query parameters so that
 * standard <img> GET requests succeed on authenticated endpoints.
 */
export function getAuthenticatedImageUrl(
  serverUrl: string,
  imagePath?: string,
  token?: string,
  unlockTokens?: string[]
): string | undefined {
  if (!imagePath || !imagePath.trim()) return undefined;

  const cleanServer = serverUrl.replace(/\/+$/, '');
  let fullUrlString = imagePath.startsWith('http://') || imagePath.startsWith('https://')
    ? imagePath
    : `${cleanServer}${imagePath.startsWith('/') ? '' : '/'}${imagePath}`;

  try {
    const url = new URL(fullUrlString);
    if (token && !url.searchParams.has('token')) {
      url.searchParams.set('token', token);
    }
    if (unlockTokens && unlockTokens.length > 0 && !url.searchParams.has('unlocked')) {
      url.searchParams.set('unlocked', unlockTokens.join(','));
    }
    return url.toString();
  } catch {
    // If URL parsing fails, manual fallback query concatenation
    const sep = fullUrlString.includes('?') ? '&' : '?';
    const params: string[] = [];
    if (token) params.push(`token=${encodeURIComponent(token)}`);
    if (unlockTokens && unlockTokens.length > 0) {
      params.push(`unlocked=${encodeURIComponent(unlockTokens.join(','))}`);
    }
    return params.length > 0 ? `${fullUrlString}${sep}${params.join('&')}` : fullUrlString;
  }
}
