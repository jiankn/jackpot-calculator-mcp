import test from 'node:test';
import assert from 'node:assert/strict';
import { invokeTool } from '../src/tools.mjs';

test('known $1M federal-only case uses progressive tax and cents, not 24% final tax', () => {
  const out = invokeTool('calculate_lottery_payout', { prize: 1000000, stateCode: 'TX' });
  assert.equal(out.result.taxes.federal, 32000000);
  assert.equal(out.result.net, 68000000);
  assert.equal(out.result.withholding.federal, 24000000);
  assert.equal(out.result.federalDueAtFiling, 8000000);
  assert.equal(out.amountUnit, 'integer cents');
  assert.equal(out.taxYear, 2026);
});
test('locality, state, unsafe money, nonintegral member count and reversed cash option are rejected', () => {
  for (const input of [
    { prize: 1e6, stateCode: 'XX' }, { prize: 1e6, stateCode: 'TX', locality: 'NYC' },
    { prize: Infinity, stateCode: 'TX' }, { prize: -1, stateCode: 'TX' },
    { prize: 1e13, stateCode: 'TX' }, { prize: 1e6, stateCode: 'TX', taxYear: 2025 },
  ]) assert.throws(() => invokeTool('calculate_lottery_payout', input));
  assert.throws(() => invokeTool('calculate_pool_share', { prize: 1e6, members: 2.5, stateCode: 'TX' }));
  assert.throws(() => invokeTool('compare_lump_sum_annuity', { jackpot: 1e6, cashValue: 2e6, stateCode: 'TX' }));
});
test('NYC local tax is added only when specified', () => {
  const base = { prize: 1e6, stateCode: 'NY' };
  const ny = invokeTool('calculate_lottery_payout', base).result;
  const city = invokeTool('calculate_lottery_payout', { ...base, locality: 'NYC' }).result;
  assert.equal(ny.taxes.local, 0);
  assert.ok(city.taxes.local > 0);
  assert.equal(ny.net - city.net, city.taxes.local);
});
test('annuity preserves gross sum, discounts immediate first payment and tax assumptions', () => {
  const out = invokeTool('compare_lump_sum_annuity', { jackpot: 450e6, cashValue: 205.1e6, game: 'powerball', stateCode: 'TX' });
  const a = out.result.annuity;
  assert.equal(a.rows.length, 30);
  assert.equal(a.rows.reduce((sum, r) => sum + r.gross, 0), 450e6 * 100);
  assert.equal(a.presentValue, Math.round(a.rows.reduce((sum, r, k) => sum + r.net / 1.04 ** k, 0)));
  assert.ok(a.presentValue < a.net);
  assert.ok(a.breakEvenRate > 0);
  assert.ok(out.annuityAssumptions.some(s => s.includes('future law')));
});
test('pool withholding uses whole-ticket threshold even when individual share is under $5K', () => {
  const out = invokeTool('calculate_pool_share', { prize: 10000, members: 10, stateCode: 'TX' });
  assert.equal(out.result.perMember.gross, 100000);
  assert.equal(out.result.perMember.withholding.federal, 24000);
  assert.equal(out.result.perMember.taxes.federal, 0);
});
test('distinct ticket coverage is n / combinations; absent cash cannot invent EV', () => {
  const out = invokeTool('calculate_lottery_odds', { game: 'powerball', tickets: 20 });
  assert.equal(out.jackpotProbability, 20 / 292201338);
  assert.equal(out.expectedReturnPerTicket, null);
  assert.equal(out.totalTicketCost, 40);
  const ev = invokeTool('calculate_lottery_odds', { game: 'megaMillions', jackpotCash: 200e6 });
  assert.ok(ev.expectedReturnPerTicket > 0);
  assert.throws(() => invokeTool('calculate_lottery_odds', { game: 'powerball', tickets: 292201339 }));
});
