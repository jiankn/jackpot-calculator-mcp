import { McpServer } from '@modelcontextprotocol/server';
import { toolDefinitions, invokeTool, VERSION } from './tools.mjs';

export function createServer() {
  const server = new McpServer({ name: 'jackpot-calculator-mcp', version: VERSION }, {
    instructions: 'Lottery calculation estimates using a fixed 2026 snapshot. Monetary inputs are dollars. Payout results use integer cents; odds results use dollars. Read assumptions and sources. This server does not look up live jackpots.',
  });
  for (const { name, ...config } of toolDefinitions) {
    server.registerTool(name, {
      ...config,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, input => {
      const output = invokeTool(name, input);
      return { content: [{ type: 'text', text: JSON.stringify(output) }], structuredContent: output };
    });
  }
  return server;
}
