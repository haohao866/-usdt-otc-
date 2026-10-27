import { ApiError } from './errors.js';

const MAX_BODY_BYTES = 16 * 1024;

export function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(payload));
}

export function readJson(req) {
  const type = req.headers['content-type']?.split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') {
    req.resume();
    return Promise.reject(new ApiError(415, 'CONTENT_TYPE', '请使用 application/json'));
  }
  return new Promise((resolve, reject) => {
    let size = 0;
    let tooLarge = false;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (tooLarge) return;
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        chunks.length = 0;
        reject(new ApiError(413, 'BODY_TOO_LARGE', '请求体最多 16 KiB'));
        return;
      }
      chunks.push(chunk);
    });
    req.once('end', () => {
      if (tooLarge) return;
      try {
        const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!data || Array.isArray(data) || typeof data !== 'object') throw new Error();
        resolve(data);
      } catch {
        reject(new ApiError(400, 'INVALID_JSON', '请求体必须为有效的 JSON 对象'));
      }
    });
    req.once('error', reject);
    req.once('aborted', () => reject(new ApiError(400, 'ABORTED', '请求已中止')));
  });
}
