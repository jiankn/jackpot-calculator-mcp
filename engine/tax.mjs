// 税档计算。brackets 格式：[[起点美元, 税率], ...]，起点递增，第一档起点为 0 或某个金额（之下免税）。
// 所有金额参数和返回值均为“分”。

export function taxFromBrackets(incomeCents, brackets) {
  if (!brackets || !brackets.length || incomeCents <= 0) return 0;
  let tax = 0;
  for (let i = 0; i < brackets.length; i++) {
    const start = brackets[i][0] * 100;
    const end = i + 1 < brackets.length ? brackets[i + 1][0] * 100 : Infinity;
    if (incomeCents <= start) break;
    tax += (Math.min(incomeCents, end) - start) * brackets[i][1];
  }
  return Math.round(tax);
}

// 奖金带来的“增量税”：(其他收入 + 奖金) 的税 − 只有其他收入时的税。deduction 为标准扣除（分）。
export function incrementalTax({ prizeCents, otherIncomeCents = 0, brackets, deductionCents = 0 }) {
  const taxable = income => Math.max(0, income - deductionCents);
  return taxFromBrackets(taxable(otherIncomeCents + prizeCents), brackets) - taxFromBrackets(taxable(otherIncomeCents), brackets);
}
