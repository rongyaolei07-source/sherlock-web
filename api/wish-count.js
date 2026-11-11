// 公开的愿望总数 — Vercel Node serverless 函数。
//
// GET /api/wish-count  — 只返回 { count }，不返回任何愿望内容。
// 首页的数字条用它显示“已有 N 个愿望被收好”。
// 不需要密码：只是一个总数，不涉及隐私。

import { get } from '@vercel/blob';

const PATHNAME = 'wishes.json';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: '只支持 GET' });
  }
  try {
    const blob = await get(PATHNAME, { access: 'private', useCache: false });
    if (!blob) return res.status(200).json({ ok: true, count: 0 });
    const text = await new Response(blob.stream).text();
    const data = JSON.parse(text);
    const count = Array.isArray(data) ? data.length : 0;
    return res.status(200).json({ ok: true, count });
  } catch {
    return res.status(200).json({ ok: true, count: 0 });
  }
}
