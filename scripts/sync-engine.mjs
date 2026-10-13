// Run from the website checkout. Releases contain only this explicit allowlist.
import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const root = new URL('../', import.meta.url);
const website = new URL('../../../', import.meta.url);
const paths = [
  ...['calculate', 'money', 'tax', 'odds'].map(n => [`src/engine/${n}.mjs`, `engine/${n}.mjs`]),
  ...['federal', 'states', 'games'].map(n => [`data/${n}.json`, `data/${n}.json`]),
];
const hashes = [];
for (const [source, dest] of paths) {
  await mkdir(new URL(dest.split('/')[0] + '/', root), { recursive: true });
  await copyFile(new URL(source, website), new URL(dest, root));
  const bytes = await readFile(new URL(dest, root));
  hashes.push(`| ${source} | ${dest} | ${createHash('sha256').update(bytes).digest('hex')} |`);
}
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: website, encoding: 'utf8' }).trim();
await writeFile(new URL('PROVENANCE.md', root), `# Calculation snapshot\n\nThe engine and data were copied from the Jackpot Calculator website source at commit ${commit}. The website source is private; this package publishes only the calculation files listed below. Data verification dates and official source URLs are preserved in the JSON files. No live jackpot values or user records are bundled.\n\n| Website source | Package file | SHA-256 |\n|---|---|---|\n${hashes.join('\n')}\n`);
