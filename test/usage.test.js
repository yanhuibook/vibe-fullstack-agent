import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateCosts, formatUsageReport } from '../src/usage.js';

test('estimates DeepSeek Flash costs using cache hit/miss usage', () => {
  const estimate = estimateCosts({
    prompt_tokens: 1000,
    completion_tokens: 2000,
    total_tokens: 3000,
    prompt_cache_hit_tokens: 100,
    prompt_cache_miss_tokens: 900
  }, 'deepseek-flash');
  assert.equal(estimate.inputTokens, 1000);
  assert.equal(estimate.outputTokens, 2000);
  assert.ok(Math.abs(estimate.offPeakUsd - 0.0013353) < 1e-12);
  assert.ok(Math.abs(estimate.peakUsd - 0.0026706) < 1e-12);
});

test('prints token cap warning when response is truncated', () => {
  const report = formatUsageReport({
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    model: 'deepseek-flash',
    finishReason: 'length',
    maxOutputTokens: 32000
  });
  assert.match(report, /达到 max_tokens 上限 32000/);
});

test('shows usage without inventing pricing for unknown models', () => {
  const report = formatUsageReport({
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    model: 'custom-model'
  });
  assert.match(report, /输入 10/);
  assert.match(report, /暂无内置价格表/);
});
