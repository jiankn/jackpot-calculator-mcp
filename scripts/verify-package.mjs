import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
const npmCli = process.env.npm_execpath;
assert.ok(npmCli, 'Run with npm run verify:package');
const npm = args => execFileSync(process.execPath, [npmCli, ...args], { encoding: 'utf8' });
const packed = JSON.parse(npm(['pack', '--json']))[0];
assert.ok(packed.files.every(f => !/node_modules|\.env|workers\/|reports\//.test(f.path)));
const dir = await mkdtemp(join(tmpdir(), 'jackpot-mcp-installed-'));
npm(['install', '--prefix', dir, join(process.cwd(), packed.filename), '--omit=dev', '--ignore-scripts']);
const installed = join(dir, 'node_modules', 'jackpot-calculator-mcp');
const pkg = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8'));
assert.equal(pkg.version, '0.1.0');
const client = new Client({ name: 'installed-release-check', version: '1' });
try {
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [join(installed, 'src', 'cli.mjs')], stderr: 'pipe' }));
  assert.equal((await client.listTools()).tools.length, 4);
  const r = await client.callTool({ name: 'calculate_lottery_payout', arguments: { prize: 1e6, stateCode: 'TX' } });
  assert.equal(r.structuredContent.result.net, 68000000);
} finally {
  await client.close();
}
console.log(JSON.stringify({ archive: packed.filename, installedInvocation: 'passed', tools: 4, version: pkg.version }));
