/** Server-side loader for a video link. Only public http(s) addresses are allowed, and every
 * redirect hop is checked again. The response must be a supported video type and fit the size
 * limit. Node-only: used by captionflow/demo/server.mjs; never served to the browser.
 */
import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export const SUPPORTED_VIDEO_TYPES = Object.freeze(['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-m4v']);
const MAX_REDIRECTS = 3;
const GENERIC_TYPES = Object.freeze(['application/octet-stream', 'binary/octet-stream', 'application/download', 'application/x-download', '']);
const EXTENSION_TYPES = Object.freeze({ mp4: 'video/mp4', m4v: 'video/x-m4v', webm: 'video/webm', ogv: 'video/ogg', ogg: 'video/ogg', mov: 'video/quicktime' });
const NOT_A_VIDEO = 'The link opens a web page, not a video file. Open the video itself and copy the address of the video file (it usually ends in .mp4 or .webm).';

function videoTypeFromPath(url) {
  const extension = url.pathname.split('.').pop()?.toLowerCase();
  return EXTENSION_TYPES[extension] ?? null;
}

function megabytes(bytes) {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

export class LinkError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function ipv4IsPrivate(address) {
  const [a, b] = address.split('.').map(Number);
  return a === 0 || a === 10 || a === 127
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127)
    || a >= 224;
}

export function isPrivateAddress(address) {
  const kind = isIP(address);
  if (kind === 4) return ipv4IsPrivate(address);
  if (kind !== 6) return true;
  const lower = address.toLowerCase();
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return ipv4IsPrivate(mapped[1]);
  return lower === '::' || lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe8')
    || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb') || lower.startsWith('ff');
}

/** Returns the parsed URL if it is an http(s) address whose host resolves only to public addresses. */
export async function validatePublicUrl(input, { lookup = dnsLookup } = {}) {
  let parsed;
  try { parsed = new URL(String(input ?? '').trim()); }
  catch { throw new LinkError(400, 'Enter a full link that starts with https://'); }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new LinkError(400, 'Only http and https links are supported');
  if (parsed.username || parsed.password) throw new LinkError(400, 'Links with a username or password are not supported');
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost')) throw new LinkError(400, 'That address is not allowed');
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addresses.length) throw new LinkError(400, 'That address could not be found');
  if (addresses.some(entry => isPrivateAddress(entry.address))) throw new LinkError(400, 'That address is not allowed');
  return parsed;
}

async function readLimited(response, maxBytes) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new LinkError(413, `The video is larger than the ${megabytes(maxBytes)} limit`);
  const chunks = [];
  let total = 0;
  for await (const chunk of response.body) {
    total += chunk.length;
    if (total > maxBytes) throw new LinkError(413, `The video is larger than the ${megabytes(maxBytes)} limit`);
    chunks.push(chunk);
  }
  if (!total) throw new LinkError(400, 'The link did not return any video');
  return Buffer.concat(chunks);
}

/** Fetches the video behind a link. Returns { bytes, contentType }. */
export async function fetchVideoLink(input, { maxBytes, fetchImpl = fetch, lookup, timeoutMs = 60_000 } = {}) {
  let current = await validatePublicUrl(input, { lookup });
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let response;
    try {
      response = await fetchImpl(current, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
      throw new LinkError(502, timedOut ? 'The link took too long to download' : 'The link could not be downloaded. Check that it is public and try again');
    }
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      current = await validatePublicUrl(new URL(response.headers.get('location'), current).href, { lookup });
      continue;
    }
    if (!response.ok) throw new LinkError(502, `The link returned an error (status ${response.status}). Check the address and that the video is public`);
    const declaredType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const pathType = videoTypeFromPath(current);
    const contentType = SUPPORTED_VIDEO_TYPES.includes(declaredType) ? declaredType
      : (GENERIC_TYPES.includes(declaredType) && pathType) ? pathType : null;
    if (!contentType) {
      throw new LinkError(415, declaredType.startsWith('text/') || declaredType === 'application/json' || !declaredType ? NOT_A_VIDEO : `This link gives a ${declaredType} file, not a video. Use MP4, WebM, Ogg or QuickTime.`);
    }
    return { bytes: await readLimited(response, maxBytes), contentType };
  }
  throw new LinkError(400, 'The link redirects too many times');
}
