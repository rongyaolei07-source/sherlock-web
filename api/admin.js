// 网站后台 — Vercel Node serverless 函数。
//
// GET  /api/admin                 — 全部后台数据（概览 + 愿望 + 旅途用户/足迹/留言/照片）
// GET  /api/admin?photo=<id>      — 流出一张旅途照片（管理员查看用）
// POST /api/admin  { action, ... } — 删除操作
//   deleteWish { id }              — 删一条愿望
//   deleteMessage { id }           — 删一条旅途留言
//   deletePhoto { id }             — 删一张照片（记录 + Blob 文件）
//   deleteUser { username }        — 删一个旅途用户及其全部足迹/留言/照片
//
// 认证：X-Admin-Password 请求头，值 = 环境变量 WISHES_ADMIN_PASSWORD
// （和愿望后台同一个密码，站长已经知道）。密码只走请求头，不走网址。
// 防暴力破解：同一 IP 密码错 5 次后锁定 10 分钟。

import { get, del } from '@vercel/blob';
import { loadJson, saveJson, clientIp, rateLimited, json } from './journey-lib.js';

const VISITS_PATH = 'visits.json';
const WISHES_PATH = 'wishes.json';
const USERS_PATH = 'journey-users.json';
const JVISITS_PATH = 'journey-visits.json';
const MESSAGES_PATH = 'journey-messages.json';
const PHOTOS_PATH = 'journey-photos.json';

function adminPassword() {
  return process.env.WISHES_ADMIN_PASSWORD || 'danzi';
}

// 密码错误计数（内存版，实例重启失效）：{ ip: { count, firstAt } }
const failedByIp = new Map();
function tooManyFailures(ip) {
  const f = failedByIp.get(ip);
  if (!f) return false;
  if (Date.now() - f.firstAt > 10 * 60 * 1000) { failedByIp.delete(ip); return false; }
  return f.count >= 5;
}
function noteFailure(ip) {
  const now = Date.now();
  const f = failedByIp.get(ip);
  if (!f || now - f.firstAt > 10 * 60 * 1000) failedByIp.set(ip, { count: 1, firstAt: now });
  else f.count += 1;
}

function checkPassword(req, res) {
  const ip = clientIp(req);
  if (tooManyFailures(ip)) {
    json(res, 429, { ok: false, error: '密码错太多次了，10 分钟后再试' });
    return false;
  }
  const password = req.headers['x-admin-password'] || '';
  if (password !== adminPassword()) {
    noteFailure(ip);
    json(res, 401, { ok: false, error: '密码不对' });
    return false;
  }
  failedByIp.delete(ip);
  return true;
}

function visitDate(v) {
  return v.d || new Date(v.at).toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Password');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!checkPassword(req, res)) return;
  const ip = clientIp(req);
  if (rateLimited(`admin:${ip}`, 60, 60_000)) {
    return json(res, 429, { ok: false, error: '请求太频繁，稍等一分钟再试' });
  }

  // ---- 管理员看照片：GET ?photo=<id> ----
  if (req.method === 'GET' && req.query.photo) {
    const id = String(req.query.photo);
    const photos = await loadJson(PHOTOS_PATH, []);
    const photo = photos.find((p) => p.id === id);
    if (!photo || !photo.path) return json(res, 404, { ok: false, error: '找不到这张照片' });
    try {
      const blob = await get(photo.path, { access: 'private', useCache: false });
      if (!blob) return json(res, 404, { ok: false, error: '找不到这张照片' });
      const buf = Buffer.from(await new Response(blob.stream).arrayBuffer());
      res.setHeader('Content-Type', photo.ct || 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.status(200).send(buf);
    } catch (err) {
      console.error('admin photo failed:', err);
      return json(res, 500, { ok: false, error: '读照片失败' });
    }
  }

  // ---- 全部后台数据：GET ----
  if (req.method === 'GET') {
    const [visitsData, wishes, users, jvisits, messages, photos] = await Promise.all([
      loadJson(VISITS_PATH, { count: 0 }),
      loadJson(WISHES_PATH, []),
      loadJson(USERS_PATH, []),
      loadJson(JVISITS_PATH, []),
      loadJson(MESSAGES_PATH, []),
      loadJson(PHOTOS_PATH, []),
    ]);
    const litByUser = {};
    for (const v of jvisits) litByUser[v.u] = (litByUser[v.u] || 0) + 1;
    return json(res, 200, {
      ok: true,
      visits: typeof visitsData.count === 'number' ? visitsData.count : 0,
      wishes: [...wishes].reverse(),
      journey: {
        users: users.map((u) => ({ u: u.u, at: u.at, lit: litByUser[u.u] || 0 })),
        visits: [...jvisits].reverse().map((v) => ({ u: v.u, c: v.c, d: visitDate(v), at: v.at })),
        messages: [...messages].reverse(),
        photos: [...photos].reverse().map((p) => ({ id: p.id, u: p.u, c: p.c, at: p.at })),
      },
    });
  }

  if (req.method !== 'POST') return json(res, 405, { ok: false, error: '只支持 GET 和 POST' });
  const body = req.body || {};
  const action = body.action;

  if (action === 'deleteWish') {
    const id = String(body.id || '');
    const wishes = await loadJson(WISHES_PATH, []);
    const next = wishes.filter((w) => w.id !== id);
    if (next.length === wishes.length) return json(res, 404, { ok: false, error: '找不到这条愿望' });
    await saveJson(WISHES_PATH, next);
    return json(res, 200, { ok: true });
  }

  if (action === 'deleteMessage') {
    const id = String(body.id || '');
    const messages = await loadJson(MESSAGES_PATH, []);
    const next = messages.filter((m) => m.id !== id);
    if (next.length === messages.length) return json(res, 404, { ok: false, error: '找不到这条留言' });
    await saveJson(MESSAGES_PATH, next);
    return json(res, 200, { ok: true });
  }

  if (action === 'deletePhoto') {
    const id = String(body.id || '');
    const photos = await loadJson(PHOTOS_PATH, []);
    const photo = photos.find((p) => p.id === id);
    if (!photo) return json(res, 404, { ok: false, error: '找不到这张照片' });
    await saveJson(PHOTOS_PATH, photos.filter((p) => p.id !== id));
    if (photo.path) { try { await del(photo.path); } catch (e) { console.error('admin del blob failed:', e); } }
    return json(res, 200, { ok: true });
  }

  if (action === 'deleteUser') {
    const username = String(body.username || '');
    if (!username) return json(res, 400, { ok: false, error: '没有用户名' });
    const [users, jvisits, messages, photos] = await Promise.all([
      loadJson(USERS_PATH, []),
      loadJson(JVISITS_PATH, []),
      loadJson(MESSAGES_PATH, []),
      loadJson(PHOTOS_PATH, []),
    ]);
    if (!users.some((u) => u.u === username)) return json(res, 404, { ok: false, error: '找不到这个用户' });
    const userPhotos = photos.filter((p) => p.u === username);
    await Promise.all([
      saveJson(USERS_PATH, users.filter((u) => u.u !== username)),
      saveJson(JVISITS_PATH, jvisits.filter((v) => v.u !== username)),
      saveJson(MESSAGES_PATH, messages.filter((m) => m.u !== username)),
      saveJson(PHOTOS_PATH, photos.filter((p) => p.u !== username)),
    ]);
    for (const p of userPhotos) {
      if (p.path) { try { await del(p.path); } catch (e) { console.error('admin del blob failed:', e); } }
    }
    return json(res, 200, { ok: true });
  }

  return json(res, 400, { ok: false, error: '未知的请求' });
}
