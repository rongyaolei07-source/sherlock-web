// 首页访问计数 — Vercel Node serverless 函数。
//
// GET  /api/visits  — 只读当前累计访问数 { count }
// POST /api/visits  — 累计 +1，返回 { count }
//
// 计数存在私有 Blob 仓库 danzi-wishes-web 里的 visits.json（{"count": N}）。
// 节流：同一 IP 每天最多 +1（防刷）；浏览器端还用 sessionStorage 记一次，
// 同一次打开页面只算 1 次。注意：每次 +1 消耗 1 次 Blob 高级操作（put），
// 和愿望提交共用每月 2000 次的免费额度，别拿这个接口当高频埋点。
// 只接受本站 Origin 的 POST，防别的网站拿接口刷数。

import { put, get } from '@vercel/blob';

const PATHNAME = 'visits.json';

// 同一 IP 每天最多 +1（内存版，实例重启失效）。
const countedTodayByIp = new Set();
function dayKey() { return new Date().toISOString().slice(0, 10); }

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

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

async function loadCount() {
  try {
    const res = await get(PATHNAME, { access: 'private', useCache: false });
    if (!res) return 0;
    const text = await new Response(res.stream).text();
    const data = JSON.parse(text);
    return typeof data.count === 'number' ? data.count : 0;
  } catch {
    return 0; // 文件不存在（第一次访问）或读失败：从 0 开始
  }
}

async function saveCount(count) {
  await put(PATHNAME, JSON.stringify({ count }), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 0,
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ---- 只读：GET ----
  if (req.method === 'GET') {
    const count = await loadCount();
    return res.status(200).json({ ok: true, count });
  }

  // ---- 计数 +1：POST ----
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: '只支持 POST / GET' });
  }
  if (!originAllowed(req)) {
    return res.status(403).json({ ok: false, error: '只接受本站的访问' });
  }
  const ip = clientIp(req);
  const key = ip + ':' + dayKey();
  if (countedTodayByIp.has(key)) {
    // 今天已经算过这个 IP 了：返回当前数，不再 +1
    const count = await loadCount();
    return res.status(200).json({ ok: true, count, counted: false });
  }
  countedTodayByIp.add(key);
  try {
    const count = (await loadCount()) + 1;
    await saveCount(count);
    return res.status(200).json({ ok: true, count, counted: true });
  } catch (err) {
    console.error('保存访问数失败:', err);
    return res.status(500).json({ ok: false, error: '计数失败，请稍后重试' });
  }
}
