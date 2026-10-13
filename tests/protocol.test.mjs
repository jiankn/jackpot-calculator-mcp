import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

test('real stdio process: initialize, discover four tools, call all four and reject bad locality', { timeout: 20000 }, async () => {
  const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('../src/cli.mjs', import.meta.url))], stderr: 'pipe' });
  const client = new Client({ name: 'jackpot-release-test', version: '1.0.0' });
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    assert.equal(listed.tools.length, 4);
    assert.ok(listed.tools.every(t => t.annotations.readOnlyHint));
    for (const [name, args] of [
      ['calculate_lottery_payout', { prize: 1000000, stateCode: 'TX' }],
      ['compare_lump_sum_annuity', { jackpot: 450e6, cashValue: 205.1e6, stateCode: 'NY', locality: 'NYC' }],
      ['calculate_pool_share', { prize: 10000, members: 10, stateCode: 'TX' }],
      ['calculate_lottery_odds', { game: 'megaMillions', tickets: 20, jackpotCash: 200e6 }],
    ]) {
      const response = await client.callTool({ name, arguments: args });
      assert.ok(!response.isError, JSON.stringify(response));
      assert.ok(response.structuredContent.calculatorUrl.startsWith('https://jackpotcalculator.com/'));
      assert.deepEqual(JSON.parse(response.content[0].text), response.structuredContent);
    }
    const bad = await client.callTool({ name: 'calculate_lottery_payout', arguments: { prize: 1e6, stateCode: 'TX', locality: 'NYC' } });
    assert.equal(bad.isError, true);
  } finally {
    await client.close();
  }
});
