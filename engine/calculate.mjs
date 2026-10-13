// 计算引擎主入口：纯函数，数据（联邦税档、各州税率、彩票规则）通过参数传入。
// 所有金额输入为美元，内部按“分”计算，输出为“分”。
// 规则依据见 docs/M1-数据核实_2026-10-01.md 与 data/*.json 中的 source 字段。
import { toCents } from './money.mjs';
import { taxFromBrackets, incrementalTax } from './tax.mjs';

export const FILING_STATUSES = ['single', 'joint', 'headOfHousehold'];

// 各州只有单身和合并两套税档；户主暂用单身税档（已在 Methodology 注明）
const stateBracketsFor = (state, status) => (status === 'joint' ? state.brackets.joint : state.brackets.single);

// 税额和预扣一律取整到美元（报税按整美元），页面上“奖金 − 各项税 = 到手”逐项相减才对得上
const wholeDollars = cents => Math.round(cents / 100) * 100;

// 你分到的那部分奖金对应的“奖金减票价”：多人合买一张票时，票价按份额分摊
const proceedsOf = (prizeCents, wagerCents, ticketPrizeCents) => prizeCents - Math.round(wagerCents * prizeCents / ticketPrizeCents);

// 领奖时的联邦预扣：整张票的奖金减去票价后超过 $5,000，按 24% 预扣（IRS W-2G 说明）。
// 多人分一张票时，是否达到门槛看整张票，不能先分给每个人再判断（IRS：Withholding and Forms W-2G for Multiple Winners）
export function federalWithholding(prizeCents, wagerCents, federal, ticketPrizeCents = prizeCents) {
  if (ticketPrizeCents - wagerCents <= federal.withholding.threshold * 100) return 0;
  return wholeDollars(proceedsOf(prizeCents, wagerCents, ticketPrizeCents) * federal.withholding.rate);
}

// 领奖时的州预扣：只用官方核实过的税率；未核实返回 null（页面显示“以州彩票局为准”）。
// 门槛：多数州随联邦（奖金减票价超过 $5,000）；个别州另有门槛（data/states.json 的 threshold，按整张票的奖金判断）
export function stateWithholding(prizeCents, wagerCents, state, ticketPrizeCents = prizeCents) {
  const w = state.withholding;
  if (!w || !w.verified || w.rate === null) return null;
  const base = proceedsOf(prizeCents, wagerCents, ticketPrizeCents);
  if (state.code === 'NJ') {
    // 新泽西：$10,000 以下不预扣；$10,001–$500,000 预扣 5%；超过 $500,000 预扣 8%（按整张票的奖金判断档位）
    if (ticketPrizeCents <= 10000 * 100) return 0;
    return wholeDollars(base * (ticketPrizeCents > 500000 * 100 ? 0.08 : 0.05));
  }
  const due = w.threshold === undefined
    ? ticketPrizeCents - wagerCents > 5000 * 100
    : w.thresholdRule === 'atLeast' ? ticketPrizeCents >= w.threshold * 100 : ticketPrizeCents > w.threshold * 100;
  return due ? wholeDollars(base * w.rate) : 0;
}

// 马里兰县税：24 个县级辖区高收入税率的简单平均（计算器不问县）
export const marylandCountyRate = local => {
  const rates = Object.values(local.MD_COUNTY?.rates || {});
  return rates.length ? rates.reduce((a, r) => a + r, 0) / rates.length : 0;
};

// 某一年收到一笔奖金时，最终大约要交的联邦、州、地方税（增量法）。
// ticketPrizeCents：整张票的奖金，用于按奖金额判断的免税（新泽西 $10,000 以下）；多人分一张票或分期领取时，看的是整个奖
export function finalTaxes({ prizeCents, status, otherIncomeCents = 0, state, locality, federal, local, ticketPrizeCents = prizeCents }) {
  const fed = incrementalTax({
    prizeCents,
    otherIncomeCents,
    brackets: federal.brackets[status],
    deductionCents: federal.standardDeduction[status] * 100,
  });
  let st = 0;
  if (state && state.taxesLottery && !(state.exemptUpTo && ticketPrizeCents <= state.exemptUpTo * 100)) {
    st = incrementalTax({ prizeCents, otherIncomeCents, brackets: stateBracketsFor(state, status) });
  }
  let loc = 0;
  if (locality === 'NYC' && state?.code === 'NY') {
    const b = local.NYC.brackets[status] || local.NYC.brackets.single;
    loc = taxFromBrackets(otherIncomeCents + prizeCents, b) - taxFromBrackets(otherIncomeCents, b);
  } else if (locality === 'YONKERS' && state?.code === 'NY') {
    loc = Math.round(st * local.YONKERS.rateOfStateTax);
  } else if (state?.code === 'MD') {
    loc = Math.round(prizeCents * marylandCountyRate(local));
  }
  const [f, s, l] = [fed, st, loc].map(wholeDollars);
  return { federal: f, state: s, local: l, total: f + s + l };
}

// 年金分期：第 1 笔立即支付，之后每年递增 growth；最后一笔吸收取整误差，保证合计等于年金总额
export function annuitySchedule(totalCents, payments = 30, growth = 0.05) {
  const first = (totalCents * growth) / ((1 + growth) ** payments - 1);
  const list = [];
  let sum = 0;
  for (let k = 0; k < payments; k++) {
    const amount = k === payments - 1 ? totalCents - sum : Math.round(first * (1 + growth) ** k);
    list.push(amount);
    sum += amount;
  }
  return list;
}

// 盈亏平衡收益率：税后年金按这个年利率折现，正好等于一次性领取的税后金额。
// 比较现值的数学阈值，不模拟投资回报税或未来税率变动。
// 现值随利率单调递减，用二分法求解；年金总额不超过现金时没有正的平衡点，返回 null
export function breakEvenRate(payments, lumpNet) {
  const pv = r => payments.reduce((a, p, k) => a + p / (1 + r) ** k, 0);
  // 第 1 笔立即支付，现值的下界就是它；现金小于等于它时不存在有限的平衡利率。
  if (!(lumpNet > payments[0]) || pv(0) <= lumpNet) return null;
  let lo = 0, hi = 1;
  while (pv(hi) > lumpNet) hi *= 2;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (pv(mid) > lumpNet) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * 主计算。
 * input: {
 *   game: 'powerball' | 'megaMillions' | 'custom',
 *   jackpot: 广告头奖（年金总额，美元）, cashValue: 现金价值（美元）,
 *   stateCode, locality: 'NYC' | 'YONKERS' | undefined, status,
 *   winners: 平分头奖的中奖票数（默认 1）, sharePercent: 合买时你的份额（默认 100）,
 *   otherIncome: 当年其他应税收入（美元，默认 0）, discountRate: 年金折现率（默认 0.04）
 * }
 * data: { federal, states, local, games }
 */
export function calculate(input, data) {
  const { federal, states, local, games } = data;
  const status = FILING_STATUSES.includes(input.status) ? input.status : 'single';
  const state = states.find(s => s.code === input.stateCode) || null;
  const winners = Math.max(1, Math.floor(input.winners || 1));
  const share = Math.min(100, Math.max(0, input.sharePercent ?? 100)) / 100 / winners;
  const game = games[input.game];
  const wagerCents = toCents(game ? game.ticketPrice : 0);
  const otherIncomeCents = toCents(input.otherIncome || 0);
  const growth = game ? game.annuity.growth : 0.05;
  const payments = game ? game.annuity.payments : 30;
  const discountRate = input.discountRate ?? 0.04;

  // 一次性领取。ticketCash：你这张票的奖金（头奖由几张票平分后）；cash：其中你的份额
  const ticketCash = Math.round(toCents(input.cashValue) / winners);
  const cash = Math.round(toCents(input.cashValue) * share);
  const fedWithheld = federalWithholding(cash, wagerCents, federal, ticketCash);
  const stWithheld = state ? stateWithholding(cash, wagerCents, state, ticketCash) : 0;
  const lumpTaxes = finalTaxes({ prizeCents: cash, status, otherIncomeCents, state, locality: input.locality, federal, local, ticketPrizeCents: ticketCash });
  // 纽约市、扬克斯居民领奖时还会按城市最高税率预扣（纽约州 Publication 140-W）
  const locRate = input.locality && state?.code === 'NY' ? local[input.locality]?.withholdingRate : null;
  const locWithheld = locRate && ticketCash - wagerCents > 5000 * 100 ? wholeDollars(proceedsOf(cash, wagerCents, ticketCash) * locRate) : 0;
  const lumpSum = {
    gross: cash,
    withholding: { federal: fedWithheld, state: stWithheld, local: locWithheld, atClaim: cash - fedWithheld - (stWithheld ?? 0) - locWithheld },
    taxes: lumpTaxes,
    federalDueAtFiling: lumpTaxes.federal - fedWithheld,
    net: cash - lumpTaxes.total,
  };

  // 年金：每年的税按当年收到的金额单独计算（假设税档不变，已在 Methodology 注明）
  const schedule = annuitySchedule(Math.round(toCents(input.jackpot) * share), payments, growth);
  const ticketJackpot = Math.round(toCents(input.jackpot) / winners);
  const rows = schedule.map((gross, year) => {
    const t = finalTaxes({ prizeCents: gross, status, otherIncomeCents, state, locality: input.locality, federal, local, ticketPrizeCents: ticketJackpot });
    return { year: year + 1, gross, taxes: t, net: gross - t.total };
  });
  const sum = key => rows.reduce((a, r) => a + key(r), 0);
  const netTotal = sum(r => r.net);
  const presentValue = Math.round(rows.reduce((a, r, k) => a + r.net / (1 + discountRate) ** k, 0));
  const annuity = {
    gross: sum(r => r.gross),
    taxes: { federal: sum(r => r.taxes.federal), state: sum(r => r.taxes.state), local: sum(r => r.taxes.local), total: sum(r => r.taxes.total) },
    net: netTotal,
    presentValue,
    discountRate,
    breakEvenRate: breakEvenRate(rows.map(r => r.net), lumpSum.net),
    rows,
  };

  return {
    input: { ...input, status, winners, share },
    state: state ? { code: state.code, name: state.name, sellsGame: game ? state[input.game === 'megaMillions' ? 'sellsMegaMillions' : 'sellsPowerball'] : true, note: state.note || null } : null,
    lumpSum,
    annuity,
  };
}

// 按官方新闻稿口径计算“领奖时到手”（只扣预扣），用于和官方公布的案例对账
export function netAfterWithholding({ prize, wager = 0, federalRate, stateRate }) {
  const base = toCents(prize) - toCents(wager);
  return toCents(prize) - Math.round(base * federalRate) - Math.round(base * stateRate);
}
