import http from 'node:http';

const ORIGIN = 'https://lexora-english-dictionary.workspace-609631.chatgpt.site';
const PORT = Number(process.env.PORT || 3000);

const hopByHop = new Set([
  'connection','keep-alive','proxy-authenticate','proxy-authorization',
  'te','trailer','transfer-encoding','upgrade','content-length'
]);

const server = http.createServer(async (req, res) => {
  try {
    const target = new URL(req.url || '/', ORIGIN);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v == null || hopByHop.has(k.toLowerCase()) || k.toLowerCase() === 'host') continue;
      headers.set(k, Array.isArray(v) ? v.join(', ') : v);
    }
    headers.set('host', new URL(ORIGIN).host);
    headers.set('x-forwarded-host', req.headers.host || '');
    headers.set('x-forwarded-proto', 'https');

    const method = req.method || 'GET';
    let body;
    if (!['GET', 'HEAD'].includes(method)) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      body = Buffer.concat(chunks);
    }

    const upstream = await fetch(target, {
      method,
      headers,
      body,
      redirect: 'manual'
    });

    const outHeaders = {};
    upstream.headers.forEach((value, key) => {
      if (!hopByHop.has(key.toLowerCase())) outHeaders[key] = value;
    });

    if (outHeaders.location) {
      try {
        const loc = new URL(outHeaders.location, ORIGIN);
        if (loc.origin === new URL(ORIGIN).origin) {
          outHeaders.location = loc.pathname + loc.search + loc.hash;
        }
      } catch {}
    }

    outHeaders['cache-control'] = outHeaders['cache-control'] || 'no-cache';
    res.writeHead(upstream.status, outHeaders);
    if (method === 'HEAD' || !upstream.body) return res.end();
    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (error) {
    res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(`Lexora proxy error: ${error instanceof Error ? error.message : String(error)}`);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Lexora proxy listening on ${PORT}`);
});
