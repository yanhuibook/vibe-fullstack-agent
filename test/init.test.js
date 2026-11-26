import test from 'node:test';
import assert from 'node:assert/strict';
import { validateGeneratedFiles } from '../src/init.js';

const base = [
  { path: 'README.md', content: '# Demo' },
  { path: '.env.example', content: 'DB_PASSWORD=change-me' },
  { path: 'composer.json', content: '{}' }
];

test('accepts a small safe scaffold', () => {
  assert.equal(validateGeneratedFiles(base).length, 3);
});

test('rejects traversal and absolute paths', () => {
  for (const bad of ['../outside.php', '/tmp/outside.php', 'C:\\temp\\x.php']) {
    assert.throws(() => validateGeneratedFiles([...base, { path: bad, content: 'x' }]));
  }
});

test('rejects real env and lock files', () => {
  for (const bad of ['.env', '.env.local', 'composer.lock', 'src/.env.example']) {
    assert.throws(() => validateGeneratedFiles([...base, { path: bad, content: 'secret' }]));
  }
});

test('rejects duplicate paths and missing env example', () => {
  assert.throws(() => validateGeneratedFiles([...base, { path: 'README.md', content: 'duplicate' }]));
  assert.throws(() => validateGeneratedFiles([{ path: 'README.md', content: 'x' }, { path: 'composer.json', content: '{}' }]));
});
