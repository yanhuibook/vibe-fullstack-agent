import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('profile requires admin login and disables public registration', async () => {
  const profile = JSON.parse(await fs.readFile(path.join(root, 'profiles/warehouse-mysql84.json'), 'utf8'));
  assert.equal(profile.authentication.admin_login, 'required');
  assert.equal(profile.authentication.public_registration, 'disabled');
  assert.match(profile.authentication.password_storage, /password_hash/);
  assert.match(profile.architecture.admin.authentication.session, /server-side session/);
});

test('generation prompt requires safe admin auth without default credentials', async () => {
  const prompt = await fs.readFile(path.join(root, 'init-prompt.md'), 'utf8');
  assert.match(prompt, /Do not create any self-service registration page/);
  assert.match(prompt, /password_hash/);
  assert.match(prompt, /without echo/);
  assert.match(prompt, /Never generate default administrator credentials/);
  assert.match(prompt, /protect state-changing authenticated requests against CSRF/);
});
