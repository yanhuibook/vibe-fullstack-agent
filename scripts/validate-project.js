#!/usr/bin/env node
/**
 * 校验一个已生成的云仓项目是否符合骨架契约。
 * 用法：node scripts/validate-project.js <项目目录>
 *
 * 与生成器的差异：生成器对模型产出的内容做 injectSkeleton（补齐/覆盖），
 * 这里只做「事后体检」，不修改任何文件；同时报告骨架文件是否被改动过。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { SKELETON_FILES, validateGeneratedStructure } from '../src/skeleton.js';

const SKIP_DIRS = new Set(['node_modules', 'vendor', 'runtime', '.git', 'dist']);

/** 去掉注释与多余空白，只比较有效内容，避免注释差异造成误报。 */
function normalize(text) {
  return text
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^[ \t]*(?:\/\/|#)[^\n]*$/gm, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function collectFiles(root) {
  const out = [];
  async function walk(dir, prefix) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await walk(path.join(dir, entry.name), rel);
      } else if (entry.isFile()) {
        if (/\.(lock|png|jpe?g|gif|ico|woff2?|ttf)$/i.test(entry.name)) continue;
        if (entry.name === '.env') continue;
        try {
          const content = await fs.readFile(path.join(dir, entry.name), 'utf8');
          out.push({ path: rel, content });
        } catch {
          // 二进制或不可读文件跳过
        }
      }
    }
  }
  await walk(root, '');
  return out;
}

const target = process.argv[2];
if (!target) {
  console.error('用法：node scripts/validate-project.js <项目目录>');
  process.exitCode = 1;
} else {
  const root = path.resolve(target);
  const files = await collectFiles(root);
  console.log(`扫描到 ${files.length} 个文本文件：${root}`);

  const problems = validateGeneratedStructure(files);
  const drift = [];

  for (const [skeletonPath, expected] of Object.entries(SKELETON_FILES)) {
    const actual = files.find((file) => file.path === skeletonPath);
    if (!actual) continue; // 缺失由 validateGeneratedStructure 报告
    if (normalize(actual.content) !== normalize(expected)) drift.push(skeletonPath);
  }

  if (drift.length) {
    console.log('\n骨架文件与标准版本存在内容差异（忽略注释后仍不同，请确认是否预期）：');
    for (const file of drift) console.log(`- ${file}`);
  }

  if (!problems.length) {
    console.log('\n✅ 结构校验通过');
  } else {
    console.log(`\n❌ 发现 ${problems.length} 个问题：`);
    for (const problem of problems) console.log(`- ${problem}`);
    process.exitCode = 1;
  }
}
