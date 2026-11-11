// 向蛋仔许愿 — Vercel Node serverless 函数。
//
// POST /api/wish  { text }          — 提交一条愿望（≤120 字），存入 Vercel Blob
// GET  /api/wish?password=...      — 管理员查看全部愿望（最新在前）
//   密码：环境变量 WISHES_ADMIN_PASSWORD；未设置时默认 "danzi"（请在部署后改掉）。
//
// 存储：私有 Blob 仓库 danzi-wishes（store_iiBJ37AUaSDv4FUD）里的 wishes.json，
// 一个 JSON 数组，最多保留 500 条（超了删最旧的）。
// 认证：仓库以 OIDC 方式连到项目，@vercel/blob SDK 在 Vercel 上自动用
// BLOB_STORE_ID + VERCEL_OIDC_TOKEN 鉴权，无需静态密钥。

import { put, get } from '@vercel/blob';

const MAX_LEN = 120;
const MAX_WISHES = 500;
const PATHNAME = 'wishes.json';

// 简单的内存节流：同一 IP 30 秒内只能提交 1 条，每天最多 10 条。
// serverless 实例重启后失效，只是防随手连点和简单刷屏，不做严格限流。
const lastPostByIp = new Map();
const postsTodayByIp = new Map();
function dayKey() { return new Date().toISOString().slice(0, 10); }

// 只接受从本站发来的提交：浏览器提交一定带 Origin；
// Origin 存在但不是本站域名的一律拒绝（防别的网站拿你的接口刷愿望）。
const ALLOWED_ORIGINS = new Set([
  'https://xn--6mqt94apwn8fxeq1a.top', // 游龙蛋仔岛.top 的 punycode 形式（浏览器实际发送的）
  'https://游龙蛋仔岛.top',
  'https://sherlock-web-iota.vercel.app',
  'http://localhost:3000',
]);
function originAllowed(req) {
  const origin = req.headers.origin || req.headers.referer || '';
  if (!origin) return true;
  try {
    const host = new URL(origin).origin;
    return ALLOWED_ORIGINS.has(host);
  } catch { return false; }
}

function adminPassword() {
  return process.env.WISHES_ADMIN_PASSWORD || 'danzi';
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

async function loadWishes() {
  try {
    const res = await get(PATHNAME, { access: 'private', useCache: false });
    if (!res) return [];
    const text = await new Response(res.stream).text();
    const data = JSON.parse(text);
    return Array.isArray(data) ? data : [];
  } catch {
    // 文件不存在或读失败：当作空列表（第一次提交时会创建）
    return [];
  }
}

async function saveWishes(wishes) {
  await put(PATHNAME, JSON.stringify(wishes), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true, // 必须加：否则第一条愿望建好 wishes.json 后，后面每条都会报 "blob already exists" 存不进去
    cacheControlMaxAge: 0,
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Password');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ---- 管理员查看：GET ----
  // 密码只走 X-Admin-Password 请求头，不走网址参数，
  // 避免密码留在浏览器历史、日志和分享链接里。
  if (req.method === 'GET') {
    const password = req.headers['x-admin-password'] || '';
    if (password !== adminPassword()) {
      return res.status(401).json({ ok: false, error: '密码不对' });
    }
    const wishes = await loadWishes();
    // 最新在前
    return res.status(200).json({
      ok: true,
      count: wishes.length,
      wishes: [...wishes].reverse(),
    });
  }

  // ---- 提交愿望：POST ----
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: '只支持 POST / GET' });
  }

  const body = req.body || {};
  const text = typeof body.text === 'string' ? body.text.trim() : '';

  if (!text) return res.status(400).json({ ok: false, error: '愿望不能为空' });
  if (text.length > MAX_LEN) {
    return res.status(400).json({ ok: false, error: `愿望最多 ${MAX_LEN} 字` });
  }

  const ip = clientIp(req);
  const now = Date.now();
  if (!originAllowed(req)) {
    return res.status(403).json({ ok: false, error: '只接受本站的提交' });
  }
  const last = lastPostByIp.get(ip) || 0;
  if (now - last < 30_000) {
    return res.status(429).json({ ok: false, error: '你许得太快啦，30 秒后再试' });
  }
  const today = dayKey();
  const dayCount = postsTodayByIp.get(ip + ':' + today) || 0;
  if (dayCount >= 10) {
    return res.status(429).json({ ok: false, error: '今天许得够多了，明天再来' });
  }
  lastPostByIp.set(ip, now);
  postsTodayByIp.set(ip + ':' + today, dayCount + 1);

  const wish = {
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    text,
    createdAt: new Date(now).toISOString(),
  };

  try {
    const wishes = await loadWishes();
    wishes.push(wish);
    // 只留最新 500 条
    const trimmed = wishes.slice(-MAX_WISHES);
    await saveWishes(trimmed);
  } catch (err) {
    console.error('保存愿望失败:', err);
    return res.status(500).json({ ok: false, error: '保存失败，请稍后重试' });
  }

  return res.status(200).json({ ok: true, id: wish.id });
}
