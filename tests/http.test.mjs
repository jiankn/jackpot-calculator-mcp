import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.mjs';

const endpoint = 'https://jackpot-calculator-mcp.jiankn.workers.dev/mcp';
const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-03-26' };
const rpc = async body => {
  const r = await worker.fetch(new Request(endpoint, { method: 'POST', headers, body: JSON.stringify(body) }), {});
  const text = await r.text();
  const json = text.startsWith('event:') ? JSON.parse(text.split('\n').find(s => s.startsWith('data:')).slice(5)) : JSON.parse(text);
  return { r, json };
};
test('legacy HTTP initialize, tool list and tool call work without sessions', async () => {
  const init = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'legacy-client', version: '1' } } });
  assert.equal(init.r.status, 200);
  assert.equal(init.json.result.serverInfo.version, '0.1.0');
  const listed = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  assert.equal(listed.json.result.tools.length, 4);
  const call = await rpc({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'calculate_lottery_payout', arguments: { prize: 1e6, stateCode: 'TX' } } });
  assert.equal(call.json.result.structuredContent.result.net, 68000000);
  assert.equal(call.r.headers.get('Cache-Control'), 'no-store');
});
test('HTTP request size, Origin, rate limit and route protections', async () => {
  const rejectedOrigin = await worker.fetch(new Request(endpoint, { method: 'POST', headers: { ...headers, Origin: 'https://unrelated.example' }, body: '{}' }), {});
  assert.equal(rejectedOrigin.status, 403);
  const oversized = await worker.fetch(new Request(endpoint, { method: 'POST', headers, body: ' '.repeat(32769) }), {});
  assert.equal(oversized.status, 413);
  const limited = await worker.fetch(new Request(endpoint, { method: 'POST', headers, body: '{}' }), { RATE_LIMITER: { limit: async () => ({ success: false }) } });
  assert.equal(limited.status, 429);
  const missing = await worker.fetch(new Request('https://jackpot-calculator-mcp.jiankn.workers.dev/nope'), {});
  assert.equal(missing.status, 404);
});
