import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function loadEnv(filePath = path.join(APP_ROOT, '.env')) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

export function getModelConfig() {
  const baseUrl = process.env.VIBE_BASE_URL?.trim();
  const model = process.env.VIBE_MODEL?.trim();
  const apiKey = process.env.VIBE_API_KEY?.trim();
  const missing = [];
  if (!baseUrl) missing.push('VIBE_BASE_URL');
  if (!model || model.startsWith('replace-with-')) missing.push('VIBE_MODEL');
  if (!apiKey || apiKey.startsWith('replace-with-')) missing.push('VIBE_API_KEY');
  const rawMaxTokens = process.env.VIBE_MAX_OUTPUT_TOKENS?.trim();
  const maxOutputTokens = rawMaxTokens ? Number(rawMaxTokens) : 32000;
  if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 1024 || maxOutputTokens > 65536) {
    throw new Error('VIBE_MAX_OUTPUT_TOKENS 必须是 1024 到 65536 之间的整数。');
  }
  const thinking = process.env.VIBE_THINKING?.trim().toLowerCase();
  if (thinking && !['enabled', 'disabled'].includes(thinking)) {
    throw new Error('VIBE_THINKING 只能是 enabled 或 disabled。');
  }
  return { baseUrl, model, apiKey, missing, maxOutputTokens, thinking };
}
