// 金额工具：引擎内部一律用“分”（整数）计算，避免浮点误差

export const toCents = dollars => Math.round(Number(dollars) * 100);

// 解析用户输入的金额：支持 409M、1.2B、$205,100,000、450k
export function parseAmount(text) {
  const m = String(text).trim().replace(/[$,\s]/g, '').match(/^(\d+(?:\.\d+)?)([kmb]?)$/i);
  if (!m) throw new Error(`Cannot read amount: ${text}`);
  const unit = { '': 1, k: 1e3, m: 1e6, b: 1e9 }[m[2].toLowerCase()];
  return Math.round(Number(m[1]) * unit);
}

// 显示金额（输入为分）：整美元显示，不带小数
export const formatUSD = cents => '$' + Math.round(cents / 100).toLocaleString('en-US');

// 简写：$409 Million / $1.2 Billion（输入为美元）
export const formatShort = dollars => (dollars >= 1e9 ? `$${+(dollars / 1e9).toFixed(2)} Billion` : `$${+(dollars / 1e6).toFixed(1)} Million`);
