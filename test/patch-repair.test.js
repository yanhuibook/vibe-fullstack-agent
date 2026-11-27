import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { repairDiffHunkHeaders } from '../src/patch.js';

/** 真实失败的补丁：hunk 头声明 13 行，正文实际只有 11 行。 */
const BROKEN = `diff --git a/demo.vue b/demo.vue
--- a/demo.vue
+++ b/demo.vue
@@ -5,13 +5,13 @@
       <el-form-item><el-input v-model="filters.keyword" /></el-form-item>
       <el-form-item>
-        <el-select v-model="filters.category_id" clearable>
+        <el-select v-model="filters.category_id" clearable style="width: 150px">
           <el-option v-for="c in categories" :key="c.id" />
         </el-select>
       </el-form-item>
       <el-form-item>
-        <el-select v-model="filters.status" clearable>
+        <el-select v-model="filters.status" clearable style="width: 150px">
           <el-option label="draft" value="draft" />
           <el-option label="on_sale" value="on_sale" />
           <el-option label="off_sale" value="off_sale" />
`;

test('行数正确的补丁不被改动', () => {
  const good = `diff --git a/a.txt b/a.txt
--- a/a.txt
+++ b/a.txt
@@ -1,2 +1,2 @@
 keep
-old
+new
`;
  const { patch, repaired } = repairDiffHunkHeaders(good);
  assert.equal(repaired, 0);
  assert.equal(patch, good);
});

test('按正文重算错误的 hunk 头行数', () => {
  const { patch, repaired } = repairDiffHunkHeaders(BROKEN);
  assert.equal(repaired, 1);
  assert.match(patch, /^@@ -5,11 \+5,11 @@$/m);
  // 内容行一字不改
  assert.ok(patch.includes('-        <el-select v-model="filters.status" clearable>'));
  assert.ok(patch.includes('+        <el-select v-model="filters.status" clearable style="width: 150px">'));
});

const gitProbe = spawnSync('git', ['--version'], { encoding: 'utf8' });

test('修复后的补丁能被 git apply --check 接受', (t) => {
  if (gitProbe.error || gitProbe.status !== 0) {
    t.skip(`当前环境无法 spawn git（${gitProbe.error?.code ?? gitProbe.status}），跳过集成校验`);
    return;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'patch-repair-'));
  try {
    const file = path.join(dir, 'demo.vue');
    // 与补丁的旧文件内容保持一致（从 @@ -5 开始的那一段）
    fs.writeFileSync(
      file,
      [
        '<template>',
        '  <div>',
        '    <h2>商品管理</h2>',
        '    <el-form inline>',
        '      <el-form-item><el-input v-model="filters.keyword" /></el-form-item>',
        '      <el-form-item>',
        '        <el-select v-model="filters.category_id" clearable>',
        '          <el-option v-for="c in categories" :key="c.id" />',
        '        </el-select>',
        '      </el-form-item>',
        '      <el-form-item>',
        '        <el-select v-model="filters.status" clearable>',
        '          <el-option label="draft" value="draft" />',
        '          <el-option label="on_sale" value="on_sale" />',
        '          <el-option label="off_sale" value="off_sale" />',
        '        </el-select>',
        '      </el-form-item>',
        '    </el-form>',
        '  </div>',
        '</template>',
        ''
      ].join('\n'),
      'utf8'
    );

    spawnSync('git', ['init', '-q'], { cwd: dir });
    spawnSync('git', ['add', '-A'], { cwd: dir });

    const broken = spawnSync('git', ['apply', '--check', '-'], { cwd: dir, input: BROKEN, encoding: 'utf8' });
    assert.notEqual(broken.status, 0, '原始损坏补丁本应被 git 拒绝');

    const { patch } = repairDiffHunkHeaders(BROKEN);
    const fixed = spawnSync('git', ['apply', '--check', '-'], { cwd: dir, input: patch, encoding: 'utf8' });
    assert.equal(fixed.status, 0, `修复后仍失败：${fixed.stderr || fixed.stdout}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('给缺失前导空格的上下文行补上空格', () => {
  const patch = `diff --git a/a.txt b/a.txt
--- a/a.txt
+++ b/a.txt
@@ -1,3 +1,3 @@
 first

-old
+new
`;
  const { patch: repaired, repaired: count } = repairDiffHunkHeaders(patch);
  assert.equal(count, 1);
  assert.match(repaired, /^@@ -1,3 \+1,3 @@$/m);
  assert.ok(repaired.includes('\n \n'), '空上下文行应变成带空格的空行');
});
