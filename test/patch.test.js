import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { parseModelJson, validatePatch } from '../src/patch.js';

const root = path.resolve('/tmp/demo-project');
const safePatch = `diff --git a/src/Hello.vue b/src/Hello.vue
index 1111111..2222222 100644
--- a/src/Hello.vue
+++ b/src/Hello.vue
@@ -1 +1 @@
-old
+new
`;

test('accepts a scoped text patch', () => {
  assert.deepEqual(validatePatch(root, safePatch), ['src/Hello.vue']);
});

test('rejects path traversal', () => {
  const patch = safePatch.replaceAll('src/Hello.vue', '../outside.txt');
  assert.throws(() => validatePatch(root, patch), /越界|超出/);
});

test('rejects secret and dependency targets', () => {
  for (const name of ['.env', 'config/.env.production', 'vendor/package/file.php', 'composer.lock']) {
    const patch = safePatch.replaceAll('src/Hello.vue', name);
    assert.throws(() => validatePatch(root, patch));
  }
});

test('rejects deletion patches', () => {
  const patch = `${safePatch}\ndeleted file mode 100644\n`;
  assert.throws(() => validatePatch(root, patch), /删除/);
});

test('parses a fenced JSON response', () => {
  const result = parseModelJson('```json\n{"understanding":"ok","plan":["one"],"patch":""}\n```');
  assert.equal(result.understanding, 'ok');
  assert.deepEqual(result.plan, ['one']);
});
