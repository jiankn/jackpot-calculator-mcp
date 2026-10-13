// 中奖概率与期望值：只做数学，奖级与概率见 data/games.json（官方奖金表）。
// 期望值 = Σ 各奖级奖金 ÷ 概率分母；头奖按一次性现金计（中奖者实际能拿的钱），不考虑多人平分。

// Mega Millions 每注随机倍数：官方给的是“1 in x”，换成概率后归一化（官方数字取整，合计略大于 1）
export function multiplierWeights(multiplierOdds) {
  const raw = Object.entries(multiplierOdds).map(([m, x]) => [Number(m), 1 / x]);
  const sum = raw.reduce((a, [, p]) => a + p, 0);
  return raw.map(([m, p]) => [m, p / sum]);
}

// 每个奖级（不含头奖）的平均奖金（美元，税前）
export function tierPrizes(gameKey, game) {
  if (gameKey === 'megaMillions') {
    const weights = multiplierWeights(game.prizeChart.multiplierOdds);
    return game.prizeChart.tiers.slice(1).map(t => ({ match: t.match, odds: t.odds, prize: weights.reduce((a, [m, p]) => a + t.prizes[m] * p, 0) }));
  }
  if (gameKey === 'millionaireForLife') {
    // 前两档是终身年金，按一次性现金计
    return game.tiers.map((t, i) => ({ match: t.match, odds: t.odds, prize: i === 0 ? game.prizes.top.cash : i === 1 ? game.prizes.second.cash : t.prize })).slice(1);
  }
  return game.prizeChart.tiers.slice(1).map(t => ({ match: t.match, odds: t.odds, prize: t.prize }));
}

export const jackpotOdds = (gameKey, game) => (gameKey === 'millionaireForLife' ? game.tiers[0].odds : game.prizeChart.tiers[0].odds);

/**
 * 每张票的期望回报（美元）。jackpotCash：头奖一次性现金（Millionaire for Life 固定为 $18M 现金）。
 * jackpotNet：可选，头奖税后金额，用于“税后期望值”。
 */
export function expectedValue(gameKey, game, { jackpotCash, jackpotNet } = {}) {
  const price = game.ticketPrice;
  const cash = gameKey === 'millionaireForLife' ? game.prizes.top.cash : jackpotCash;
  const odds = jackpotOdds(gameKey, game);
  const smaller = tierPrizes(gameKey, game).reduce((a, t) => a + t.prize / t.odds, 0);
  const jackpot = cash / odds;
  const total = smaller + jackpot;
  return {
    price, smaller, jackpot, total,
    afterTaxJackpot: jackpotNet === undefined ? null : jackpotNet / odds,
    perDollar: total / price,
    // 税前期望值等于票价时的头奖现金
    breakEvenCash: Math.max(0, (price - smaller) * odds),
  };
}

// 同一次开奖的 n 个不同组合覆盖 n 个互斥的头奖结果，概率恰为 n ÷ 组合数。
export const chanceWithTickets = (odds, n) => Math.min(1, n / odds);
