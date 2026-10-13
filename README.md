# Jackpot Calculator MCP

Four read-only MCP tools for US lottery prize taxes, cash vs annuity comparisons,
equal pool shares and jackpot probabilities. Calculations use a fixed 2026 data
snapshot and the same engine as [Jackpot Calculator](https://jackpotcalculator.com/).

## Connect to the hosted server

Add this Streamable HTTP URL in a client that supports remote MCP servers:

```text
https://jackpot-calculator-mcp.jiankn.workers.dev/mcp
```

No API key is required. The public endpoint allows up to 120 requests per minute
per IP at the Cloudflare edge; rate limiting is approximate, not a global quota.
Connection examples and output units: [Jackpot Calculator MCP setup](https://jackpotcalculator.com/mcp/).

## Tools

| Tool | Required inputs | Output |
|---|---|---|
| `calculate_lottery_payout` | `prize`, `stateCode` | Estimated final tax, withholding and cash take-home |
| `compare_lump_sum_annuity` | `jackpot`, `cashValue`, `stateCode` | Cash and 30-payment annuity, discounted present value and break-even rate |
| `calculate_pool_share` | `prize`, `members`, `stateCode` | One equal owner's share with the whole-ticket withholding threshold |
| `calculate_lottery_odds` | `game` | Distinct-combination jackpot probability; optional expected return with `jackpotCash` |

Money inputs are **US dollars**. Tax/payout results use **integer cents**.
The odds tool reports money in **dollars**. Rates and probabilities are fractions,
so `0.04` is 4%. Each result states its units, assumptions and related calculator.

Example tool call:

```json
{
  "name": "calculate_lottery_payout",
  "arguments": { "prize": 1000000, "stateCode": "TX", "status": "single" }
}
```

The bundled 2026 calculation returns an estimated $320,000 final federal tax and
$680,000 take-home, separately from $240,000 federal withholding. See the
[interactive lottery tax calculator](https://jackpotcalculator.com/) to explore
other states and filing statuses.

For game-specific cash estimates, select `game: "powerball"` or
`game: "megaMillions"`, provide the known cash prize and compare it with the
[Powerball payout calculator](https://jackpotcalculator.com/powerball-calculator/)
or [Mega Millions tax calculator](https://jackpotcalculator.com/mega-millions-calculator/).
For annuities provide both the published cash option and advertised annuity total;
the package never guesses the cash option from a fixed percentage.

## Run locally from the source or release archive

Node.js 22.12 or newer is required.

```sh
git clone https://github.com/jiankn/jackpot-calculator-mcp.git
cd jackpot-calculator-mcp
npm ci
npm test
node src/cli.mjs
```

The last command starts an MCP stdio server and waits for a client; it is not an
interactive CLI prompt. Configure a stdio client with `command: "node"` and
`args: ["/absolute/path/to/jackpot-calculator-mcp/src/cli.mjs"]`.
Only protocol messages go to stdout.

Release archives can also be installed with `npm install ./jackpot-calculator-mcp-0.1.0.tgz`.
An npm registry listing is optional and is not needed for the hosted endpoint.

## Calculation boundaries

- US resident taxpayers, same residence and ticket-purchase state; cross-state
  credits and nonresident alien withholding are not modeled.
- Federal and state tax data is bundled, with original source URLs and dates.
  No live jackpot lookup, automatic tax update, ticket purchase or ticket check.
- Standard deduction and incremental income tax. State head-of-household uses
  single-filer state brackets. California assumes a California Lottery prize.
- NYC and Yonkers need an explicit `locality` with `stateCode: "NY"`. Maryland
  uses an average county rate; other local income taxes are excluded.
- Annuities use 30 payments, first immediately and then annual payments growing
  5%. Tax rules and other income stay constant. Future tax law and investment
  taxes are not modeled. [Annuity methodology and calculator](https://jackpotcalculator.com/lottery-annuity-calculator/).
- Pool outputs assume all members have the same tax profile. Different people
  need separate scenarios. Individually rounded fractional-cent shares can differ
  slightly from the whole prize.
- Odds assume distinct combinations in one drawing. Expected value excludes
  taxes, Power Play, jackpot sharing and California pari-mutuel payout differences.

Estimates only, not tax or financial advice. Independent of Powerball, Mega
Millions, the Multi-State Lottery Association and state lottery operators.
[Sources and methodology](https://jackpotcalculator.com/methodology/).

## Development and releases

`npm test` checks known payouts, validation, pool withholding, annuity totals,
odds and real stdio/HTTP protocol calls. `npm run verify:package` packs the
allowlisted files, installs the archive into a clean directory and invokes the
installed server. CI runs both on Windows and Linux.

`scripts/sync-engine.mjs` is a maintainer-only snapshot step run within the
website checkout, before release. It records source hashes in `PROVENANCE.md`.
Standalone users already have the copied files and do not need to run it.

Code: MIT. Compiled data: CC BY 4.0; see `LICENSE-DATA.md` and the source URLs
inside `data/`. Issues: https://github.com/jiankn/jackpot-calculator-mcp/issues
