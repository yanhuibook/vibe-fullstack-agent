import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const expected = ['数码配件', '电脑外设', '影音设备', '显示设备', '智能家居', '网络设备'];

test('product category selection is database-backed with the supplied initial options', async () => {
  const profile = JSON.parse(await fs.readFile(path.join(root, 'profiles/warehouse-mysql84.json'), 'utf8'));
  assert.deepEqual(profile.modules.categories.initial_seed_values, expected);
  assert.match(profile.modules.categories.source_of_truth, /MySQL categories table/);
  assert.equal(profile.modules.products.create_form.default_category, 'system setting default_category_id');
  assert.equal(profile.settings.default_category_id.initial_value, '数码配件');
  assert.equal(profile.modules.products.page_size, 10);
});

test('generation prompt prohibits hard-coded category options in UI', async () => {
  const prompt = await fs.readFile(path.join(root, 'init-prompt.md'), 'utf8');
  assert.match(prompt, /category selects and filters must load from the category table/);
  assert.match(prompt, /never hard-code dropdown options in Vue/);
});
