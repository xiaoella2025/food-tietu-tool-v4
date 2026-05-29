// ===== 试用码授权模块 =====
// V1 本地签名校验（无服务器）。密钥内嵌前端，适合助理试用场景。
// 试用码格式：{payload_base64url}.{hmac_sha256前16字节_hex}
// payload = base64url(JSON({n:姓名, e:"YYYY-MM-DD", r:随机串}))

const SECRET = 'FoodTieTu-V1-2026-qX9mL3kN7p-XiaoHong';
const STORAGE_KEY = 'ft_trial_license_v1';

async function _hmac16Hex(payloadB64, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payloadB64));
  return Array.from(new Uint8Array(sig).slice(0, 16))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

function _b64urlEncode(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
function _b64urlDecode(s) {
  return atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(s.length + (4 - s.length % 4) % 4, '='));
}

// 生成试用码（管理员用）
export async function generateLicense(assistantName, expireDateStr) {
  const payload = { n: assistantName, e: expireDateStr, r: Math.random().toString(36).slice(2, 10) };
  const payloadB64 = _b64urlEncode(JSON.stringify(payload));
  const sig = await _hmac16Hex(payloadB64, SECRET);
  return `${payloadB64}.${sig}`;
}

// 校验试用码，返回 {ok, expired, name, expireDate, error}
export async function verifyLicense(code) {
  try {
    const trimmed = (code || '').trim();
    const dot = trimmed.lastIndexOf('.');
    if (dot < 1) return { ok: false, error: 'format' };
    const payloadB64 = trimmed.slice(0, dot);
    const sigHex = trimmed.slice(dot + 1).toLowerCase();
    if (sigHex.length !== 32) return { ok: false, error: 'format' };
    const expected = await _hmac16Hex(payloadB64, SECRET);
    if (expected !== sigHex) return { ok: false, error: 'invalid' };
    const payload = JSON.parse(_b64urlDecode(payloadB64));
    if (!payload.n || !payload.e) return { ok: false, error: 'invalid' };
    const expireDate = new Date(payload.e + 'T23:59:59');
    const expired = Date.now() > expireDate.getTime();
    return { ok: true, expired, name: payload.n, expireDate: payload.e };
  } catch {
    return { ok: false, error: 'invalid' };
  }
}

// 从 localStorage 读取并校验已保存的试用码
export async function checkStoredLicense() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return { ok: false };
  return verifyLicense(stored);
}

// 保存试用码到 localStorage
export function storeLicense(code) {
  localStorage.setItem(STORAGE_KEY, code.trim());
}

// 清除本地授权
export function clearLicense() {
  localStorage.removeItem(STORAGE_KEY);
}
