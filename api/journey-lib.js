// 旅途记录共享逻辑：验证码加密、会话签名、Blob 存取、城市白名单、限流。
// 只被 api/journey-*.js 引用，不会作为函数部署。

import crypto from 'node:crypto';
import fs from 'node:fs';
import { get, put } from '@vercel/blob';

const SECRET = process.env.JOURNEY_SECRET || '';
const ENC_KEY = crypto.createHash('sha256').update(SECRET).digest();

// ---------- 验证码（AES-256-GCM，答案不进客户端明文，5 分钟过期） ----------
const CAPTCHA_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function makeCaptchaCode() {
  let code = '';
  for (let i = 0; i < 4; i++) code += CAPTCHA_CHARS[Math.floor(Math.random() * CAPTCHA_CHARS.length)];
  return code;
}
export function sealCaptcha(code) {
  const payload = JSON.stringify({ c: code, e: Date.now() + 300_000 });
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const enc = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64url');
}
export function openCaptcha(token) {
  try {
    const buf = Buffer.from(token, 'base64url');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, iv);
    decipher.setAuthTag(tag);
    const payload = JSON.parse(Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8'));
    if (!payload.c || !payload.e || Date.now() > payload.e) return null;
    return payload.c;
  } catch {
    return null;
  }
}

// ---------- 会话（HMAC 签名，存在 HttpOnly Cookie 里） ----------
// 默认 30 天；勾选“记住登录” 180 天；不勾选 1 天
const COOKIE_NAME = 'journey_session';
export const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
export const REMEMBER_MS = 180 * 24 * 60 * 60 * 1000;
export const SHORT_MS = 24 * 60 * 60 * 1000;
export function signSession(username, ms = SESSION_MS) {
  const exp = Date.now() + ms;
  const sig = crypto.createHmac('sha256', SECRET).update(`${username}.${exp}`).digest('hex');
  return `${Buffer.from(username, 'utf8').toString('base64url')}.${exp}.${sig}`;
}
export function verifySession(req) {
  try {
    const cookie = req.headers.cookie || '';
    const m = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
    if (!m) return null;
    const [b64, exp, sig] = m[1].split('.');
    if (!b64 || !exp || !sig) return null;
    if (Date.now() > Number(exp)) return null;
    const username = Buffer.from(b64, 'base64url').toString('utf8');
    const expect = crypto.createHmac('sha256', SECRET).update(`${username}.${exp}`).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
    return username;
  } catch {
    return null;
  }
}
export function sessionCookie(token, ms = SESSION_MS) {
  return `${COOKIE_NAME}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${ms / 1000}; Secure`;
}
export function clearSessionCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0; Secure`;
}

// ---------- 密码（scrypt + 每人一个盐） ----------
export function hashPassword(password, saltHex) {
  return crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), 64).toString('hex');
}

// ---------- Blob 存取（和愿望同一个私有仓库） ----------
export async function loadJson(pathname, fallback) {
  try {
    const blob = await get(pathname, { access: 'private', useCache: false });
    if (!blob) return fallback;
    const text = await new Response(blob.stream).text();
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}
export async function saveJson(pathname, data) {
  await put(pathname, JSON.stringify(data), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

// ---------- 城市白名单（只允许 data/city-coordinates.json 里的城市） ----------
let CITY_SET = null;
export function cityExists(name) {
  if (!CITY_SET) {
    try {
      const data = JSON.parse(fs.readFileSync(new URL('../data/city-coordinates.json', import.meta.url), 'utf8'));
      CITY_SET = new Set(Object.keys(data));
    } catch {
      CITY_SET = new Set();
    }
  }
  return CITY_SET.has(name);
}

// ---------- 工具 ----------
export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}
const hitsByKey = new Map();
export function rateLimited(key, limit, windowMs) {
  const now = Date.now();
  const hits = (hitsByKey.get(key) || []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) return true;
  hits.push(now);
  hitsByKey.set(key, hits);
  return false;
}
export function randomHex(n) {
  return crypto.randomBytes(n).toString('hex');
}
export function json(res, status, obj) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(obj);
}
