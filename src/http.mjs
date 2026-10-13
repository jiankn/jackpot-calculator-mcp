import { createMcpHandler } from '@modelcontextprotocol/server';
import { createServer } from './server.mjs';

// Factory creates a fresh calculation server for each request. No user data persists.
export const handler = createMcpHandler(createServer, {
  legacy: 'stateless',
  maxRequestBodySize: 32768,
  maxSubscriptions: 1,
  onerror: error => console.error(JSON.stringify({ event: 'mcp_error', type: error.name })),
});
