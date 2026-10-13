import { handler } from './http.mjs';
import { VERSION } from './tools.mjs';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/') return Response.redirect('https://jackpotcalculator.com/mcp/', 302);
    if (url.pathname === '/health') return Response.json({ status: 'ok', version: VERSION, taxYear: 2026, tools: 4 });
    if (url.pathname !== '/mcp') return new Response('Not found', { status: 404 });
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin && origin !== 'https://jackpotcalculator.com') {
      return new Response('Origin not allowed', { status: 403 });
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: {
        'Access-Control-Allow-Origin': origin || 'https://jackpotcalculator.com',
        'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Accept, MCP-Protocol-Version, MCP-Session-Id',
        'Vary': 'Origin',
      } });
    }
    if (env.RATE_LIMITER) {
      const { success } = await env.RATE_LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') || 'unknown' });
      if (!success) return new Response('Too many requests', { status: 429, headers: { 'Retry-After': '60' } });
    }
    try {
      const response = await handler.fetch(request);
      const headers = new Headers(response.headers);
      headers.set('Cache-Control', 'no-store');
      headers.set('X-Content-Type-Options', 'nosniff');
      if (origin) {
        headers.set('Access-Control-Allow-Origin', origin);
        headers.set('Access-Control-Expose-Headers', 'MCP-Session-Id, MCP-Protocol-Version');
        headers.set('Vary', 'Origin');
      }
      return new Response(response.body, { status: response.status, headers });
    } catch (error) {
      console.error(JSON.stringify({ event: 'mcp_request_failed', type: error.name }));
      return Response.json({ error: 'Calculation service unavailable' }, { status: 500 });
    }
  },
};
