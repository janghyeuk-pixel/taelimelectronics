// Vercel Serverless Function — Anthropic API 프록시
// 브라우저에서 직접 api.anthropic.com 호출 시 CORS 막힘 → 이 경로로 우회.
// x-api-key는 클라이언트가 보낸 값을 그대로 전달.

export const config = {
  api: {
    bodyParser: { sizeLimit: '10mb' },
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const { path } = req.query;
  const subPath = Array.isArray(path) ? path.join('/') : (path || 'v1/messages');
  const target = `https://api.anthropic.com/${subPath}`;

  const apiKey = req.headers['x-api-key'];
  const version = req.headers['anthropic-version'] || '2023-06-01';
  if (!apiKey) {
    return res.status(400).json({ error: 'x-api-key 헤더가 필요합니다.' });
  }

  try {
    const upstream = await fetch(target, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': version,
      },
      body: JSON.stringify(req.body || {}),
    });
    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('Content-Type') || 'application/json');
    res.send(text);
  } catch (e) {
    res.status(502).json({ error: 'Upstream fetch failed: ' + (e?.message || e) });
  }
}
