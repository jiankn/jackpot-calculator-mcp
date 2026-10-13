import { z } from 'zod';
import federal from '../data/federal.json' with { type: 'json' };
import statesFile from '../data/states.json' with { type: 'json' };
import games from '../data/games.json' with { type: 'json' };
import { calculate } from '../engine/calculate.mjs';
import { jackpotOdds, chanceWithTickets, expectedValue } from '../engine/odds.mjs';

const data = { federal, states: statesFile.states, local: statesFile.local, games };
const SITE = 'https://jackpotcalculator.com';
export const VERSION = '0.1.0';
const dollars = z.number().finite().min(0).max(1e12).describe('US dollars, not cents. Maximum $1 trillion.');
const game = z.enum(['powerball', 'megaMillions', 'custom']).default('custom');
const location = {
  stateCode: z.enum(data.states.map(s => s.code)).describe('US residence and ticket-purchase state, two-letter code. Cross-state claims are not modeled.'),
  locality: z.enum(['NYC', 'YONKERS']).optional().describe('Only valid with stateCode NY.'),
  status: z.enum(['single', 'joint', 'headOfHousehold']).default('single'),
  otherIncome: dollars.default(0).describe('Other annual income in US dollars before the standard deduction.'),
};
function checkLocality(input, ctx) {
  if (input.locality && input.stateCode !== 'NY') ctx.addIssue({ code: 'custom', path: ['locality'], message: 'NYC and YONKERS require stateCode NY.' });
}
const schemas = {
  calculate_lottery_payout: z.strictObject({ prize: dollars.positive(), game, ...location }).superRefine(checkLocality),
  compare_lump_sum_annuity: z.strictObject({
    jackpot: dollars.positive().describe('Advertised annuity total in US dollars.'),
    cashValue: dollars.positive().describe('Published cash option in US dollars; do not infer it from a fixed ratio.'),
    game, ...location,
    discountRate: z.number().finite().min(0).max(1).default(0.04).describe('Annual discount rate as a fraction, e.g. 0.04 for 4%.'),
    winners: z.number().int().min(1).max(10000).default(1).describe('Number of jackpot-winning tickets sharing the prize.'),
    sharePercent: z.number().finite().gt(0).max(100).default(100).describe('Your percentage of one winning ticket.'),
  }).superRefine((input, ctx) => {
    checkLocality(input, ctx);
    if (input.cashValue > input.jackpot) ctx.addIssue({ code: 'custom', path: ['cashValue'], message: 'Cash option must not exceed the advertised annuity total.' });
  }),
  calculate_pool_share: z.strictObject({
    prize: dollars.positive().describe('Whole ticket cash prize in US dollars.'),
    members: z.number().int().min(2).max(10000).describe('Equal owners of one ticket. Result assumes every member has the specified tax profile.'),
    game, ...location,
  }).superRefine(checkLocality),
  calculate_lottery_odds: z.strictObject({
    game: z.enum(['powerball', 'megaMillions']),
    tickets: z.number().int().min(1).max(302575350).default(1).describe('Different number combinations in the SAME drawing; repeated combinations do not add coverage.'),
    jackpotCash: dollars.positive().optional().describe('Optional jackpot cash option in US dollars, required to compute expected ticket return.'),
  }).superRefine((input, ctx) => {
    if (input.tickets > jackpotOdds(input.game, games[input.game])) ctx.addIssue({ code: 'custom', path: ['tickets'], message: 'Tickets exceed the number of distinct jackpot combinations.' });
  }),
};

function metadata(input, url) {
  const state = data.states.find(s => s.code === input.stateCode);
  return {
    packageVersion: VERSION,
    taxYear: federal.taxYear,
    currency: 'USD',
    amountUnit: 'integer cents',
    rateUnit: 'fraction',
    dataCheckedOn: { federal: federal.checkedOn, stateWithholding: state?.withholding?.checkedOn ?? null },
    stateTaxRatesAsOf: state?.bracketsAsOf ?? null,
    sources: [...new Set([federal.bracketsSource, federal.standardDeductionSource, federal.withholding.source, state?.bracketsSource, state?.withholding?.source].filter(Boolean))],
    calculatorUrl: url,
    methodologyUrl: `${SITE}/methodology/`,
    assumptions: [
      'US resident taxpayer; residence and ticket-purchase state are the same.',
      'Standard deduction, incremental income tax, and the bundled tax-year snapshot.',
      'Withholding at claim is separate from estimated final income tax. Unknown state withholding is null, not zero.',
      'New York City and Yonkers require explicit locality; Maryland uses an average county rate. Other local taxes are excluded.',
      'State head-of-household calculations use single-filer state brackets.',
      ...(input.game === 'custom' && input.stateCode === 'CA' ? ['California exemption assumes a California Lottery prize.'] : []),
    ],
    disclaimer: 'Estimates only, not tax or financial advice. No ticket purchases, winning-number predictions or live jackpot lookup.',
  };
}
function resultEnvelope(input, path, result, extra = {}) {
  return { ...metadata(input, `${SITE}/${path ? path + '/' : ''}`), inputs: input, ...extra, result };
}
const payoutPath = game => game === 'powerball' ? 'powerball-calculator' : game === 'megaMillions' ? 'mega-millions-calculator' : '';
const handlers = {
  calculate_lottery_payout(input) {
    const r = calculate({ ...input, jackpot: input.prize, cashValue: input.prize }, data);
    return resultEnvelope(input, payoutPath(input.game), { state: r.state, ...r.lumpSum });
  },
  compare_lump_sum_annuity(input) {
    const r = calculate(input, data);
    return resultEnvelope(input, 'lottery-annuity-calculator', { state: r.state, lumpSum: r.lumpSum, annuity: r.annuity }, {
      annuityAssumptions: ['30 payments: first immediately, then 29 annual payments growing 5%.', 'Current tax rules and other income are held constant for every payment; future law changes and investment taxes are not modeled.'],
    });
  },
  calculate_pool_share(input) {
    const r = calculate({ ...input, jackpot: input.prize, cashValue: input.prize, sharePercent: 100 / input.members }, data);
    return resultEnvelope(input, 'lottery-pool', { members: input.members, sharePercent: 100 / input.members, perMember: r.lumpSum, state: r.state }, {
      poolAssumptions: ['The same filing status, income and locality apply to each equal member. Run separate scenarios when profiles differ.', 'Withholding thresholds are assessed on the whole ticket; fractional-cent shares are rounded individually.'],
    });
  },
  calculate_lottery_odds(input) {
    const g = games[input.game];
    const odds = jackpotOdds(input.game, g);
    const ev = input.jackpotCash === undefined ? null : expectedValue(input.game, g, { jackpotCash: input.jackpotCash });
    return {
      packageVersion: VERSION, currency: 'USD', amountUnit: 'dollars', probabilityUnit: 'fraction', inputs: input,
      jackpotOddsOneIn: odds, jackpotProbability: chanceWithTickets(odds, input.tickets),
      ticketPrice: g.ticketPrice, totalTicketCost: g.ticketPrice * input.tickets,
      expectedReturnPerTicket: ev?.total ?? null,
      expectedNetReturnAllTickets: ev ? (ev.total - g.ticketPrice) * input.tickets : null,
      gameSources: g.sources, gameRulesCheckedOn: g.checkedOn, calculatorUrl: `${SITE}/lottery-odds/`, methodologyUrl: `${SITE}/methodology/`,
      assumptions: ['Different combinations in one drawing. Duplicate combinations do not improve jackpot probability.', 'Expected value uses the cash jackpot, assumes a sole jackpot winner and excludes taxes, Power Play and California pari-mutuel differences.'],
      disclaimer: 'A mathematical expectation does not predict winnings or guarantee a profit.',
    };
  },
};
export const toolDefinitions = [
  ['calculate_lottery_payout', 'Lottery cash prize after taxes', 'Estimate taxes and withholding on a known lottery cash prize. Input dollars; result integer cents. Bundled 2026 rules.'],
  ['compare_lump_sum_annuity', 'Compare cash and annuity', 'Compare a published cash option with 30 growing annuity payments after taxes, including present value and break-even rate.'],
  ['calculate_pool_share', 'Equal lottery pool shares', 'Estimate one equal member’s cash prize, taxes and withholding. Each member is assumed to have the specified tax profile.'],
  ['calculate_lottery_odds', 'Jackpot probability and expected return', 'Calculate jackpot coverage for distinct combinations in one drawing and optional before-tax expected ticket return.'],
].map(([name, title, description]) => ({ name, title, description, inputSchema: schemas[name] }));

export function invokeTool(name, input) {
  if (!schemas[name]) throw new Error(`Unknown tool: ${name}`);
  return handlers[name](schemas[name].parse(input));
}
