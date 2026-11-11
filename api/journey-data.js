// 旅途记录数据 — Vercel Node serverless 函数。全部接口都要先登录。
//
// GET  /api/journey-data?type=counts          — 每个城市多少人点亮 + 总数
// GET  /api/journey-data?type=mine            — 我点亮的城市（带游玩日期 {c, d}）
// GET  /api/journey-data?type=city&city=丹寨  — 一个城市的详情：人数、照片、留言、我的游玩日期
// POST /api/journey-data  { action: 'toggle', city, date? }       — 点亮 / 取消（date 为游玩日期 YYYY-MM-DD，默认今天）
// POST /api/journey-data  { action: 'date', city, date }          — 改我去这个城市的游玩日期
// POST /api/journey-data  { action: 'message', city, text }       — 留言（≤200 字）
// POST /api/journey-data  { action: 'photo', city, name, data }   — 传照片（base64）
//
// 存储：同一个私有 Blob 仓库里的 journey-visits.json、journey-photos.json、
// journey-messages.json；照片文件本身存在 Blob（公开链接）。

import { put } from '@vercel/blob';
import {
  verifySession, loadJson, saveJson, cityExists, clientIp, rateLimited,
  randomHex, json,
} from './journey-lib.js';

const VISITS_PATH = 'journey-visits.json';
const PHOTOS_PATH = 'journey-photos.json';
const MESSAGES_PATH = 'journey-messages.json';
const USERS_PATH = 'journey-users.json';

function dayKey() {
  return new Date().toISOString().slice(0, 10);
}

// 游玩日期：YYYY-MM-DD，必须是真实日期且不能是未来。返回规范化后的日期或 null。
function validDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s + 'T00:00:00Z');
  if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return null;
  if (s > dayKey()) return null;
  return s;
}

// 老的足迹记录可能没有 d，用点亮那天的日期补上。
function visitDate(v) {
  return v.d || new Date(v.at).toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const username = verifySession(req);
  if (!username) return json(res, 401, { ok: false, error: '请先登录' });

  if (req.method === 'GET') {
    const type = req.query.type;
    if (type === 'counts') {
      const [visits, users, photos, messages] = await Promise.all([
        loadJson(VISITS_PATH, []),
        loadJson(USERS_PATH, []),
        loadJson(PHOTOS_PATH, []),
        loadJson(MESSAGES_PATH, []),
      ]);
      const counts = {};
      for (const v of visits) counts[v.c] = (counts[v.c] || 0) + 1;
      return json(res, 200, {
        ok: true,
        counts,
        totals: { users: users.length, cities: Object.keys(counts).length, photos: photos.length, messages: messages.length },
      });
    }
    if (type === 'mine') {
      const visits = await loadJson(VISITS_PATH, []);
      const mine = visits
        .filter((v) => v.u === username)
        .map((v) => ({ c: v.c, d: visitDate(v) }));
      return json(res, 200, { ok: true, cities: mine });
    }
    if (type === 'city') {
      const city = String(req.query.city || '');
      if (!cityExists(city)) return json(res, 400, { ok: false, error: '没有这个城市' });
      const [visits, photos, messages] = await Promise.all([
        loadJson(VISITS_PATH, []),
        loadJson(PHOTOS_PATH, []),
        loadJson(MESSAGES_PATH, []),
      ]);
      const litUsers = [...new Set(visits.filter((v) => v.c === city).map((v) => v.u))];
      const myVisit = visits.find((v) => v.u === username && v.c === city);
      return json(res, 200, {
        ok: true,
        city,
        count: litUsers.length,
        users: litUsers.slice(0, 50),
        litByMe: litUsers.includes(username),
        myDate: myVisit ? visitDate(myVisit) : null,
        photos: photos
          .filter((p) => p.c === city)
          .slice(-30)
          .reverse()
          .map((p) => ({ id: p.id, u: p.u, c: p.c, url: '/api/journey-photo?id=' + p.id, at: p.at })),
        messages: messages.filter((m) => m.c === city).slice(-50).reverse(),
      });
    }
    return json(res, 400, { ok: false, error: '未知的请求' });
  }

  if (req.method !== 'POST') return json(res, 405, { ok: false, error: '只支持 GET 和 POST' });
  const body = req.body || {};
  const action = body.action;
  const city = String(body.city || '');

  if (action === 'toggle') {
    if (!cityExists(city)) return json(res, 400, { ok: false, error: '没有这个城市' });
    if (rateLimited(`toggle:${username}`, 30, 60_000)) {
      return json(res, 429, { ok: false, error: '点得太快啦，稍等一分钟再试' });
    }
    const date = validDate(body.date) || dayKey();
    const visits = await loadJson(VISITS_PATH, []);
    const idx = visits.findIndex((v) => v.u === username && v.c === city);
    let lit;
    if (idx >= 0) {
      visits.splice(idx, 1);
      lit = false;
    } else {
      visits.push({ u: username, c: city, at: Date.now(), d: date });
      lit = true;
    }
    await saveJson(VISITS_PATH, visits);
    const count = new Set(visits.filter((v) => v.c === city).map((v) => v.u)).size;
    return json(res, 200, { ok: true, lit, count, date: lit ? date : null });
  }

  if (action === 'date') {
    if (!cityExists(city)) return json(res, 400, { ok: false, error: '没有这个城市' });
    const date = validDate(body.date);
    if (!date) return json(res, 400, { ok: false, error: '游玩日期不对，不能是未来的日子' });
    const visits = await loadJson(VISITS_PATH, []);
    const visit = visits.find((v) => v.u === username && v.c === city);
    if (!visit) return json(res, 400, { ok: false, error: '先点亮这个城市再改日期' });
    visit.d = date;
    await saveJson(VISITS_PATH, visits);
    return json(res, 200, { ok: true, date });
  }

  if (action === 'message') {
    if (!cityExists(city)) return json(res, 400, { ok: false, error: '没有这个城市' });
    const text = String(body.text || '').trim();
    if (text.length < 1 || text.length > 200) {
      return json(res, 400, { ok: false, error: '留言要 1–200 个字' });
    }
    const ip = clientIp(req);
    if (rateLimited(`msg:${ip}`, 10, 60_000) || rateLimited(`msgday:${ip}:${dayKey()}`, 20, 86_400_000)) {
      return json(res, 429, { ok: false, error: '留得太快啦，歇一会儿再试' });
    }
    const messages = await loadJson(MESSAGES_PATH, []);
    const msg = { id: randomHex(8), u: username, c: city, t: text, at: Date.now() };
    messages.push(msg);
    if (messages.length > 2000) messages.splice(0, messages.length - 2000);
    await saveJson(MESSAGES_PATH, messages);
    return json(res, 200, { ok: true, message: msg });
  }

  if (action === 'photo') {
    if (!cityExists(city)) return json(res, 400, { ok: false, error: '没有这个城市' });
    if (rateLimited(`photoday:${username}:${dayKey()}`, 5, 86_400_000)) {
      return json(res, 429, { ok: false, error: '今天传得够多了，明天再来' });
    }
    const dataUrl = String(body.data || '');
    const m = dataUrl.match(/^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/);
    if (!m) return json(res, 400, { ok: false, error: '只要 JPG 或 PNG 图片' });
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length === 0 || buf.length > 2 * 1024 * 1024) {
      return json(res, 400, { ok: false, error: '图片太大了，请传 2MB 以内的' });
    }
    const ext = m[1] === 'png' ? 'png' : 'jpg';
    const ct = m[1] === 'png' ? 'image/png' : 'image/jpeg';
    const filename = `journey-photos/${randomHex(16)}.${ext}`;
    // 注意：仓库是私有的，公开 put 会被拒绝，所以照片存私有，
    // 用 /api/journey-photo 代理给登录的人看。
    await put(filename, buf, { access: 'private', contentType: ct, addRandomSuffix: false });
    const photos = await loadJson(PHOTOS_PATH, []);
    const photo = { id: randomHex(8), u: username, c: city, path: filename, ct, at: Date.now() };
    photos.push(photo);
    if (photos.length > 2000) photos.splice(0, photos.length - 2000);
    await saveJson(PHOTOS_PATH, photos);
    return json(res, 200, { ok: true, photo: { ...photo, url: '/api/journey-photo?id=' + photo.id } });
  }

  return json(res, 400, { ok: false, error: '未知的请求' });
}
