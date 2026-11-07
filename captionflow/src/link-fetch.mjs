/** Server-side loader for a video link. Only public http(s) addresses are allowed, and every
 * redirect hop is checked again. The response must be a supported video type and fit the size
 * limit. Node-only: used by captionflow/demo/server.mjs; never served to the browser.
 */
import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export const SUPPORTED_VIDEO_TYPES = Object.freeze(['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-m4v']);
const MAX_REDIRECTS = 3;

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
  if (Number.isFinite(declared) && declared > maxBytes) throw new LinkError(413, 'Video exceeds the size limit');
  const chunks = [];
  let total = 0;
  for await (const chunk of response.body) {
    total += chunk.length;
    if (total > maxBytes) throw new LinkError(413, 'Video exceeds the size limit');
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
    } catch {
      throw new LinkError(502, 'The link could not be downloaded');
    }
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      current = await validatePublicUrl(new URL(response.headers.get('location'), current).href, { lookup });
      continue;
    }
    if (!response.ok) throw new LinkError(502, `The link returned status ${response.status}`);
    const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!SUPPORTED_VIDEO_TYPES.includes(contentType)) {
      throw new LinkError(415, 'The link is not a direct video file (MP4, WebM, Ogg or QuickTime)');
    }
    return { bytes: await readLimited(response, maxBytes), contentType };
  }
  throw new LinkError(400, 'The link redirects too many times');
}
