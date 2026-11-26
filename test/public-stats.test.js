import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('public homepage uses live aggregate stats without exposing records', async () => {
  const profile = JSON.parse(await fs.readFile(path.join(root, 'profiles/warehouse-mysql84.json'), 'utf8'));
  const stats = profile.architecture.public_site.public_statistics;
  assert.match(stats.source, /live aggregate queries/);
  assert.deepEqual(stats.cards.map((card) => card.label), ['商品总数', '商品分类', '在售商品', '库存预警']);
  assert.ok(profile.architecture.public_site.content_rules.some((rule) => /never expose product rows/.test(rule)));
});

test('generation prompt forbids hard-coded demo values and public product records', async () => {
  const prompt = await fs.readFile(path.join(root, 'init-prompt.md'), 'utf8');
  assert.match(prompt, /must not be hard-coded demo values/);
  assert.match(prompt, /Expose aggregate counts only/);
  assert.match(prompt, /exact stock quantities/);
  assert.match(prompt, /low-stock aggregate is intentionally public/);
});
