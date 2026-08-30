const crypto = require('crypto');
const axios = require('axios');

const DEFAULT_API_BASE = 'https://lumina.fikradevs.com';

/**
 * Device authentication helper for Electron <-> Laravel.
 * Manages the device_secret + relay_envelope_key bootstrapped at /api/devices/register
 * and signs subsequent requests with HMAC-SHA256.
 *
 * The settings table is the canonical store; values are read/written through
 * caller-supplied getSetting/setSetting functions to avoid coupling to the DB layer.
 */

function getApiBase(cloudUrl) {
  const raw = String(cloudUrl || '').trim().replace(/\/+$/, '');
  if (!raw) return DEFAULT_API_BASE;
  // Accept both bare host and full URL
  if (/^https?:\/\//i.test(raw)) return raw;
  return 'https://' + raw;
}

function hmacHex(key, payload) {
  return crypto.createHmac('sha256', key).update(payload).digest('hex');
}

function sha256Hex(s) {
  return crypto.createHash('sha256').update(s ?? '').digest('hex');
}

function buildSignaturePayload(method, path, ts, nonce, body) {
  const bodyStr = body == null ? '' : (typeof body === 'string' ? body : JSON.stringify(body));
  return [
    String(method).toUpperCase(),
    '/' + String(path || '').replace(/^\/+/, ''),
    String(ts),
    String(nonce),
    sha256Hex(bodyStr),
  ].join('\n');
}

/**
 * @param {object} opts
 * @param {function(string): Promise<string>} opts.getSetting
 * @param {function(string, string): Promise<void>} opts.setSetting
 * @param {function(): Promise<string>} opts.getCloudUrl  resolves base URL (e.g. https://lumina.fikradevs.com)
 * @param {function(): string|Promise<string>} opts.getHwid
 * @param {function(): Promise<string>} opts.getLicenseCode
 */
function createDeviceAuth(opts) {
  const { getSetting, setSetting, getCloudUrl, getHwid, getLicenseCode } = opts;

  async function readSecrets() {
    const [secret, envelopeKey, instanceId] = await Promise.all([
      getSetting('device_secret'),
      getSetting('relay_envelope_key'),
      getSetting('instance_id'),
    ]);
    return {
      secret: String(secret || '').trim(),
      envelopeKey: String(envelopeKey || '').trim(),
      instanceId: String(instanceId || '').trim(),
    };
  }

  async function writeSecrets({ instanceId, secret, envelopeKey, tenantId }) {
    const writes = [];
    if (instanceId) writes.push(setSetting('instance_id', instanceId));
    if (secret) writes.push(setSetting('device_secret', secret));
    if (envelopeKey) writes.push(setSetting('relay_envelope_key', envelopeKey));
    if (tenantId) writes.push(setSetting('tenant_id', tenantId));
    await Promise.all(writes);
  }

  /**
   * Idempotent: registers (or rotates) and stores secrets locally.
   * Returns { instanceId, tenantId, rotated }.
   */
  async function ensureRegistered() {
    const cloud = getApiBase(await getCloudUrl());
    const hwid = await getHwid();
    const licenseCode = (await getLicenseCode()) || '';
    if (!licenseCode) {
      throw new Error('register_skip_no_license');
    }
    const existing = await readSecrets();
    if (existing.secret && existing.envelopeKey && existing.instanceId) {
      return { instanceId: existing.instanceId, alreadyRegistered: true };
    }

    const url = cloud + '/api/devices/register';
    const body = {
      license_code: licenseCode,
      hwid,
      ...(existing.instanceId ? { instance_id_hint: existing.instanceId } : {}),
    };
    const res = await axios.post(url, body, { timeout: 15000 });
    const data = res?.data || {};
    if (!data.instance_id || !data.device_secret || !data.relay_envelope_key) {
      throw new Error('register_invalid_response');
    }
    await writeSecrets({
      instanceId: data.instance_id,
      secret: data.device_secret,
      envelopeKey: data.relay_envelope_key,
      tenantId: data.tenant_id,
    });
    return {
      instanceId: data.instance_id,
      tenantId: data.tenant_id,
      rotated: !!data.rotated,
      alreadyRegistered: false,
    };
  }

  /**
   * HMAC-signed request to Laravel. Returns the parsed response data.
   * Throws on non-2xx with the response status attached.
   */
  async function signedRequest(method, path, body = null, { timeout = 15000 } = {}) {
    const cloud = getApiBase(await getCloudUrl());
    const { secret, instanceId } = await readSecrets();
    if (!secret || !instanceId) {
      throw new Error('not_registered');
    }
    const ts = Date.now().toString();
    const nonce = crypto.randomBytes(16).toString('hex');
    const sig = hmacHex(secret, buildSignaturePayload(method, path, ts, nonce, body));
    const headers = {
      'Content-Type': 'application/json',
      'X-Device-Id': instanceId,
      'X-Device-Timestamp': ts,
      'X-Device-Nonce': nonce,
      'X-Device-Sig': sig,
    };
    const url = cloud + (path.startsWith('/') ? path : '/' + path);
    const res = await axios.request({
      method,
      url,
      data: body ?? undefined,
      headers,
      timeout,
      validateStatus: () => true,
    });
    if (res.status < 200 || res.status >= 300) {
      const err = new Error('signed_request_failed_' + res.status);
      err.status = res.status;
      err.data = res.data;
      throw err;
    }
    return res.data;
  }

  /**
   * Fetches a fresh relay ticket (JWT) for use in the WS hello.
   * Cached briefly to avoid round-tripping on every reconnect.
   */
  let cachedTicket = null;
  async function getRelayTicket() {
    const now = Date.now();
    if (cachedTicket && cachedTicket.expiresAtMs - now > 10_000) {
      return cachedTicket;
    }
    const data = await signedRequest('POST', '/api/devices/relay-ticket', {});
    if (!data || !data.ticket) throw new Error('no_ticket');
    cachedTicket = {
      ticket: data.ticket,
      instanceId: data.instance_id,
      expiresAtMs: (Number(data.expires_at) || 0) * 1000,
    };
    return cachedTicket;
  }

  function invalidateTicket() {
    cachedTicket = null;
  }

  /**
   * Verifies the HMAC signature of an inbound relay envelope using relay_envelope_key.
   * Envelope shape: { iss, tenant, session, exp, sig }
   * We sign over: iss + "\n" + tenant + "\n" + session + "\n" + exp + "\n" + requestId + "\n" + sha256(canonicalRequest)
   */
  async function verifyRelayEnvelope(envelope, requestId, method, path, body) {
    if (!envelope || typeof envelope !== 'object') return { ok: false, reason: 'no_envelope' };
    const { sig, exp } = envelope;
    if (!sig) return { ok: false, reason: 'no_sig' };
    if (exp && Number(exp) * 1000 < Date.now() - 5000) return { ok: false, reason: 'expired' };
    const { envelopeKey } = await readSecrets();
    if (!envelopeKey) return { ok: false, reason: 'no_key' };
    const bodyHash = sha256Hex(body == null ? '' : (typeof body === 'string' ? body : JSON.stringify(body)));
    const payload = [
      String(envelope.iss || ''),
      String(envelope.tenant || ''),
      String(envelope.session || ''),
      String(envelope.exp || ''),
      String(requestId || ''),
      String(method || '').toUpperCase(),
      '/' + String(path || '').replace(/^\/+/, ''),
      bodyHash,
    ].join('\n');
    const expected = hmacHex(envelopeKey, payload);
    const ok = expected.length === String(sig).length
      && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(sig)));
    return { ok, reason: ok ? null : 'bad_sig' };
  }

  async function clearSecrets() {
    await Promise.all([
      setSetting('device_secret', ''),
      setSetting('relay_envelope_key', ''),
      setSetting('tenant_id', ''),
    ]);
    cachedTicket = null;
  }

  return {
    ensureRegistered,
    signedRequest,
    getRelayTicket,
    invalidateTicket,
    verifyRelayEnvelope,
    clearSecrets,
    readSecrets,
  };
}

module.exports = { createDeviceAuth, getApiBase };
