import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchVideoLink, isPrivateAddress, LinkError, validatePublicUrl } from '../src/link-fetch.mjs';

const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];
const privateLookup = async () => [{ address: '10.0.0.5', family: 4 }];

function response({ status = 200, type = 'video/mp4', body = Buffer.from('video-bytes'), headers = {} } = {}) {
  const all = { 'content-type': type, 'content-length': String(body.length), ...headers };
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: name => all[name.toLowerCase()] ?? null },
    body: (async function* () { yield body; })(),
  };
}

test('private, loopback and link-local addresses are refused', () => {
  for (const address of ['127.0.0.1', '10.1.2.3', '192.168.1.1', '172.16.0.1', '169.254.169.254', '100.64.0.1', '::1', 'fc00::1', 'fe80::1', '::ffff:10.0.0.1']) {
    assert.equal(isPrivateAddress(address), true, address);
  }
  assert.equal(isPrivateAddress('93.184.216.34'), false);
  assert.equal(isPrivateAddress('2606:2800:220:1::1'), false);
});

test('only http and https links are accepted', async () => {
  await assert.rejects(validatePublicUrl('ftp://example.com/a.mp4', { lookup: publicLookup }), LinkError);
  await assert.rejects(validatePublicUrl('file:///etc/passwd', { lookup: publicLookup }), LinkError);
  await assert.rejects(validatePublicUrl('not a link', { lookup: publicLookup }), LinkError);
  await assert.rejects(validatePublicUrl('https://user:pw@example.com/a.mp4', { lookup: publicLookup }), LinkError);
});

test('a host that resolves to a private address is refused', async () => {
  await assert.rejects(validatePublicUrl('https://internal.example/a.mp4', { lookup: privateLookup }), LinkError);
  await assert.rejects(validatePublicUrl('http://localhost:8080/a.mp4', { lookup: publicLookup }), LinkError);
  await assert.rejects(validatePublicUrl('http://127.0.0.1/a.mp4', { lookup: publicLookup }), LinkError);
});

test('a direct video link is downloaded', async () => {
  const result = await fetchVideoLink('https://example.com/clip.mp4', {
    maxBytes: 1024, lookup: publicLookup, fetchImpl: async () => response(),
  });
  assert.equal(result.contentType, 'video/mp4');
  assert.equal(result.bytes.toString(), 'video-bytes');
});

test('a redirect to a private address is refused', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return response({ status: 302, type: 'text/html', headers: { location: 'http://10.0.0.9/secret.mp4' } });
  };
  await assert.rejects(
    fetchVideoLink('https://example.com/clip.mp4', { maxBytes: 1024, lookup: publicLookup, fetchImpl }),
    LinkError,
  );
  assert.equal(calls, 1);
});

test('a non-video response is refused', async () => {
  await assert.rejects(
    fetchVideoLink('https://example.com/page', { maxBytes: 1024, lookup: publicLookup, fetchImpl: async () => response({ type: 'text/html' }) }),
    error => error instanceof LinkError && error.status === 415,
  );
});

test('a video over the size limit is refused', async () => {
  await assert.rejects(
    fetchVideoLink('https://example.com/big.mp4', { maxBytes: 4, lookup: publicLookup, fetchImpl: async () => response({ body: Buffer.from('too-large') }) }),
    error => error instanceof LinkError && error.status === 413,
  );
});

test('too many redirects are refused', async () => {
  const fetchImpl = async () => response({ status: 301, type: 'text/html', headers: { location: 'https://example.com/again' } });
  await assert.rejects(
    fetchVideoLink('https://example.com/start', { maxBytes: 1024, lookup: publicLookup, fetchImpl }),
    /redirects too many times/,
  );
});
