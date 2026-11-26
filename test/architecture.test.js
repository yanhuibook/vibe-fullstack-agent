import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('warehouse profile separates public templates from authenticated Vue admin', async () => {
  const profile = JSON.parse(await fs.readFile(path.join(root, 'profiles/warehouse-mysql84.json'), 'utf8'));
  assert.match(profile.architecture.public_site.renderer, /ThinkPHP server-rendered templates/);
  assert.equal(profile.architecture.public_site.admin_entry.path, '/admin/login');
  assert.equal(profile.architecture.public_site.public_statistics.cards.length, 4);
  assert.match(profile.architecture.admin.renderer, /Vue 3 SPA/);
  assert.equal(profile.architecture.admin.authentication.login, 'required');
  assert.equal(profile.authentication.public_registration, 'disabled');
  assert.deepEqual(profile.modules.products.list_columns.slice(0, 3), ['product name', 'category', 'price']);
  assert.ok(profile.modules.inventory.includes('stock adjustment with reason/history'));
});

test('generation prompt protects public pages and builds inventory modules', async () => {
  const prompt = await fs.readFile(path.join(root, 'init-prompt.md'), 'utf8');
  assert.match(prompt, /statistics must be queried from MySQL on page render/);
  assert.match(prompt, /button linking to `\/admin\/login`/);
  assert.match(prompt, /product CRUD\/search\/filter\/pagination/);
  assert.match(prompt, /Do not create any self-service registration page/);
});
