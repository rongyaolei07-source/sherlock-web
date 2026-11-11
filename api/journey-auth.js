// 旅途记录注册与登录 — Vercel Node serverless 函数。
//
// POST /api/journey-auth  { action: 'register', username, password, captcha, captchaToken }
//   注册：用户名 2–20 字（中文、字母、数字、下划线），密码 6–64 位，图片验证码。
//   密码用 scrypt + 每人一个盐存进 Blob（journey-users.json），从不存明文。
// POST /api/journey-auth  { action: 'login', username, password }
// GET  /api/journey-auth?action=me     — 当前登录状态
// POST /api/journey-auth  { action: 'logout' }
// 登录态：HMAC 签名 token，存在 HttpOnly Cookie（journey_session，30 天）。

import crypto from 'node:crypto';
import {
  openCaptcha, signSession, verifySession, sessionCookie, clearSessionCookie,
  hashPassword, loadJson, saveJson, clientIp, rateLimited, randomHex, json,
  SESSION_MS, REMEMBER_MS, SHORT_MS,
} from './journey-lib.js';

const USERS_PATH = 'journey-users.json';
const USERNAME_RE = /^[\u4e00-\u9fa5A-Za-z0-9_]{2,20}$/;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    if (req.query.action !== 'me') return json(res, 400, { ok: false, error: '未知的请求' });
    const username = verifySession(req);
    if (!username) return json(res, 200, { ok: true, loggedIn: false, username: null });
    // token 本身是无状态签名，账号被删后也还有效；这里再查一次账号是否还存在
    // 注意：journey-users.json 是数组 [{u, s, h, at}]，不是按用户名索引的对象
    const users = await loadJson(USERS_PATH, []);
    const exists = Array.isArray(users)
      ? users.some((u) => u.u === username)
      : !!users[username];
    if (!exists) {
      res.setHeader('Set-Cookie', clearSessionCookie());
      return json(res, 200, { ok: true, loggedIn: false, username: null });
    }
    return json(res, 200, { ok: true, loggedIn: true, username });
  }

  if (req.method !== 'POST') return json(res, 405, { ok: false, error: '只支持 GET 和 POST' });
  const body = req.body || {};
  const action = body.action;

  if (action === 'logout') {
    res.setHeader('Set-Cookie', clearSessionCookie());
    return json(res, 200, { ok: true });
  }

  if (action === 'login') {
    const ip = clientIp(req);
    if (rateLimited(`login:${ip}`, 10, 60_000)) {
      return json(res, 429, { ok: false, error: '试得太快啦，稍等一分钟再试' });
    }
    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    if (!username || !password) return json(res, 400, { ok: false, error: '请输入用户名和密码' });
    const users = await loadJson(USERS_PATH, []);
    const user = users.find((u) => u.u.toLowerCase() === username.toLowerCase());
    if (!user) return json(res, 401, { ok: false, error: '用户名或密码不对' });
    const hash = hashPassword(password, user.s);
    const ok = crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(user.h));
    if (!ok) return json(res, 401, { ok: false, error: '用户名或密码不对' });
    const remember = body.remember === undefined ? true : !!body.remember;
    const ms = remember ? REMEMBER_MS : SHORT_MS;
    res.setHeader('Set-Cookie', sessionCookie(signSession(user.u, ms), ms));
    return json(res, 200, { ok: true, username: user.u });
  }

  if (action === 'register') {
    const ip = clientIp(req);
    if (rateLimited(`register:${ip}`, 5, 60_000)) {
      return json(res, 429, { ok: false, error: '注册得太快啦，稍等一分钟再试' });
    }
    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    const captcha = String(body.captcha || '').trim().toUpperCase();
    const captchaToken = String(body.captchaToken || '');
    if (!USERNAME_RE.test(username)) {
      return json(res, 400, { ok: false, error: '用户名要 2–20 个字，只能用中文、字母、数字和下划线' });
    }
    if (password.length < 6 || password.length > 64) {
      return json(res, 400, { ok: false, error: '密码要 6–64 位' });
    }
    const code = openCaptcha(captchaToken);
    if (!code || code !== captcha) {
      return json(res, 400, { ok: false, error: '图片验证码不对，点图片可以换一张' });
    }
    const users = await loadJson(USERS_PATH, []);
    if (users.some((u) => u.u.toLowerCase() === username.toLowerCase())) {
      return json(res, 400, { ok: false, error: '这个用户名已经被注册了，换一个试试' });
    }
    const salt = randomHex(16);
    users.push({ u: username, s: salt, h: hashPassword(password, salt), at: Date.now() });
    await saveJson(USERS_PATH, users);
    res.setHeader('Set-Cookie', sessionCookie(signSession(username, REMEMBER_MS), REMEMBER_MS));
    return json(res, 200, { ok: true, username });
  }

  return json(res, 400, { ok: false, error: '未知的请求' });
}
