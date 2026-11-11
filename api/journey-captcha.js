// 旅途记录图片验证码 — Vercel Node serverless 函数。
//
// GET /api/journey-captcha — 返回 { svg, token }：
//   svg 是 160x60 的图片验证码（4 个字符，每个随机旋转 + 干扰线和噪点）；
//   token 是加密后的答案（AES-256-GCM，5 分钟过期），注册时和用户输入一起
//   交给 /api/journey-auth 校验。答案不以明文出现在客户端。

import { makeCaptchaCode, sealCaptcha, clientIp, rateLimited, json } from './journey-lib.js';

const PALETTE = ['#FFD76A', '#7EF0E0', '#FCA5A5', '#93C5FD', '#C4B5FD', '#F0C44E', '#86EFAC'];

function drawCaptcha(code) {
  let chars = '';
  for (let i = 0; i < code.length; i++) {
    const x = 24 + i * 34;
    const y = 40;
    const rot = (Math.random() * 36 - 18).toFixed(1);
    const color = PALETTE[Math.floor(Math.random() * PALETTE.length)];
    chars += `<text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="34" font-weight="bold" fill="${color}" transform="rotate(${rot} ${x} ${y})">${code[i]}</text>`;
  }
  let lines = '';
  for (let i = 0; i < 3; i++) {
    const y1 = 8 + Math.random() * 44;
    const y2 = 8 + Math.random() * 44;
    const c = PALETTE[Math.floor(Math.random() * PALETTE.length)];
    lines += `<path d="M0 ${y1.toFixed(0)} Q 80 ${(y1 + y2) / 2 - 14} 160 ${y2.toFixed(0)}" stroke="${c}" stroke-width="1.5" fill="none" opacity="0.5"/>`;
  }
  let dots = '';
  for (let i = 0; i < 36; i++) {
    const cx = (Math.random() * 160).toFixed(0);
    const cy = (Math.random() * 60).toFixed(0);
    const c = PALETTE[Math.floor(Math.random() * PALETTE.length)];
    dots += `<circle cx="${cx}" cy="${cy}" r="1.2" fill="${c}" opacity="0.7"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="60" viewBox="0 0 160 60"><rect width="160" height="60" fill="#1F1F1F"/>${lines}${dots}${chars}</svg>`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: '只支持 GET' });
  if (rateLimited(`captcha:${clientIp(req)}`, 20, 60_000)) {
    return json(res, 429, { ok: false, error: '拿得太快啦，稍等一分钟再试' });
  }
  const code = makeCaptchaCode();
  return json(res, 200, { ok: true, svg: drawCaptcha(code), token: sealCaptcha(code) });
}
