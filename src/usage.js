const PRICE_TABLE = {
  'deepseek-flash': {
    offPeak: { cacheHit: 0.003, cacheMiss: 0.15, output: 0.6 },
    peak: { cacheHit: 0.006, cacheMiss: 0.3, output: 1.2 }
  },
  'deepseek-v4-pro': {
    offPeak: { cacheHit: 0.022, cacheMiss: 0.66, output: 1.98 },
    peak: { cacheHit: 0.044, cacheMiss: 1.32, output: 3.96 }
  }
};

function pricingKey(model) {
  const id = String(model ?? '').toLowerCase();
  if (id.includes('deepseek-v4-pro')) return 'deepseek-v4-pro';
  if (id.includes('deepseek-flash') || id.includes('deepseek-v4-flash')) return 'deepseek-flash';
  return null;
}

function safeNum(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

export function estimateCosts(usage, model) {
  if (!usage || typeof usage !== 'object') return null;
  const modelPrice = PRICE_TABLE[pricingKey(model)];
  const inputTokens = safeNum(usage.prompt_tokens ?? usage.input_tokens);
  const outputTokens = safeNum(usage.completion_tokens ?? usage.output_tokens);
  const totalTokens = safeNum(usage.total_tokens) || inputTokens + outputTokens;
  const details = usage.prompt_tokens_details ?? usage.input_tokens_details ?? {};
  const cachedFromDetails = details.cached_tokens;
  const hitTokens = safeNum(usage.prompt_cache_hit_tokens ?? cachedFromDetails);
  const explicitMiss = usage.prompt_cache_miss_tokens;
  const missTokens = explicitMiss === undefined || explicitMiss === null
    ? Math.max(0, inputTokens - hitTokens)
    : safeNum(explicitMiss);

  if (!modelPrice) return { inputTokens, outputTokens, totalTokens, hitTokens, missTokens, model, offPeakUsd: null, peakUsd: null };
  const calculate = (rates) => (
    (hitTokens * rates.cacheHit + missTokens * rates.cacheMiss + outputTokens * rates.output) / 1_000_000
  );
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    hitTokens,
    missTokens,
    model,
    offPeakUsd: calculate(modelPrice.offPeak),
    peakUsd: calculate(modelPrice.peak)
  };
}

function usd(value) {
  if (value === null || value === undefined) return '未知';
  return `$${value.toFixed(6)}`;
}

export function formatUsageReport({ usage, model, finishReason, maxOutputTokens }) {
  const estimate = estimateCosts(usage, model);
  if (!estimate) return '模型未返回 usage 字段，无法显示本次 token 用量。';
  const lines = [
    `模型用量：输入 ${estimate.inputTokens.toLocaleString()}，输出 ${estimate.outputTokens.toLocaleString()}，合计 ${estimate.totalTokens.toLocaleString()} tokens。`
  ];
  if (estimate.hitTokens > 0 || estimate.missTokens > 0) {
    lines.push(`输入缓存：命中 ${estimate.hitTokens.toLocaleString()}，未命中 ${estimate.missTokens.toLocaleString()} tokens。`);
  }
  if (estimate.offPeakUsd === null) {
    lines.push(`模型 ${model} 暂无内置价格表；仅显示 token 用量。`);
  } else {
    lines.push(`估算费用（DeepSeek 官方单价）：非高峰 ${usd(estimate.offPeakUsd)}；高峰 ${usd(estimate.peakUsd)}。实际账单可能因缓存、计费时段及价格调整而不同。`);
  }
  if (finishReason === 'length') {
    lines.push(`提示：模型输出达到 max_tokens 上限 ${maxOutputTokens}，结果可能被截断。`);
  }
  return lines.join('\n');
}
