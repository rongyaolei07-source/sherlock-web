// 旅途记录照片代理 — Vercel Node serverless 函数。
//
// GET /api/journey-photo?id=<photoId> — 把私有 Blob 仓库里的照片流出来。
// 照片存在私有仓库，不能直接公开链接，所以用这个接口代理；只给登录的人看。
// 前端 <img> 的 src 就是这个地址（同源，CSP 允许）。
// 注意：Blob 写入后读取可能有不到一秒的延迟，找不到时重试几次再放弃。

import { get } from '@vercel/blob';
import { verifySession, loadJson, json } from './journey-lib.js';

const PHOTOS_PATH = 'journey-photos.json';

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: '只支持 GET' });
  const username = verifySession(req);
  if (!username) return json(res, 401, { ok: false, error: '请先登录' });
  const id = String(req.query.id || '');
  if (!id) return json(res, 400, { ok: false, error: '没有照片编号' });

  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const photos = await loadJson(PHOTOS_PATH, []);
      const photo = photos.find((p) => p.id === id);
      if (!photo || !photo.path) {
        lastError = new Error('photo not in index');
      } else {
        const blob = await get(photo.path, { access: 'private', useCache: false });
        if (!blob) {
          lastError = new Error('blob missing');
        } else {
          // 注意：@vercel/blob 的 get 返回的对象只有 .stream，没有 .arrayBuffer()。
          const buf = Buffer.from(await new Response(blob.stream).arrayBuffer());
          res.setHeader('Content-Type', photo.ct || 'image/jpeg');
          res.setHeader('Cache-Control', 'public, max-age=86400');
          return res.status(200).send(buf);
        }
      }
    } catch (err) {
      lastError = err;
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 800));
  }
  console.error('journey-photo failed for', id, lastError && lastError.message);
  return json(res, 404, { ok: false, error: '找不到这张照片' });
}
