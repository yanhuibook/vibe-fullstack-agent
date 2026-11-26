import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { isSensitiveOrGenerated } from './workspace.js';

function parsePatchPaths(patch) {
  if (!patch.trim()) throw new Error('没有可应用的补丁。');
  if (patch.includes('GIT binary patch') || patch.includes('Binary files ')) throw new Error('原型只接受文本补丁，不接受二进制补丁。');
  const paths = [];
  for (const line of patch.split(/\r?\n/)) {
    if (!line.startsWith('diff --git ')) continue;
    const match = line.match(/^diff --git a\/(.+) b\/(.+)$/);
    if (!match) throw new Error('补丁路径格式不受支持；请检查是否包含空格或重命名。');
    const [, oldPath, newPath] = match;
    if (oldPath !== newPath) throw new Error('原型不支持重命名文件。');
    paths.push(newPath);
  }
  if (paths.length === 0) throw new Error('补丁缺少标准的 diff --git 文件头。');
  if (/^deleted file mode /m.test(patch)) throw new Error('原型不允许删除文件。');
  if (/^(rename from|rename to) /m.test(patch)) throw new Error('原型不允许重命名文件。');
  if (/^new file mode 120000/m.test(patch)) throw new Error('原型不允许创建符号链接。');
  return [...new Set(paths)];
}

export function validatePatch(root, patch) {
  const paths = parsePatchPaths(patch);
  for (const rel of paths) {
    if (path.isAbsolute(rel) || rel.split('/').includes('..')) throw new Error(`补丁路径越界：${rel}`);
    if (isSensitiveOrGenerated(rel)) throw new Error(`补丁目标属于敏感或排除范围：${rel}`);
    const resolved = path.resolve(root, rel);
    const relative = path.relative(root, resolved);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error(`补丁目标超出项目目录：${rel}`);
    }
  }
  return paths;
}

export function applyPatch(root, patch) {
  validatePatch(root, patch);
  const check = spawnSync('git', ['apply', '--check', '--whitespace=nowarn', '-'], {
    cwd: root, input: patch, encoding: 'utf8', timeout: 15_000
  });
  if (check.error) throw new Error(`无法运行 git apply：${check.error.message}`);
  if (check.status !== 0) throw new Error(`补丁检查失败：${(check.stderr || check.stdout || 'Git 未接受该补丁。').trim()}`);

  const applied = spawnSync('git', ['apply', '--whitespace=nowarn', '-'], {
    cwd: root, input: patch, encoding: 'utf8', timeout: 15_000
  });
  if (applied.error) throw new Error(`应用补丁失败：${applied.error.message}`);
  if (applied.status !== 0) throw new Error(`应用补丁失败：${(applied.stderr || applied.stdout || 'Git 未接受该补丁。').trim()}`);
  return pathsSummary(patch);
}

function pathsSummary(patch) {
  return parsePatchPaths(patch);
}

export function parseModelJson(raw) {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('模型没有返回可解析的 JSON。');
  const parsed = JSON.parse(trimmed.slice(start, end + 1));
  if (typeof parsed !== 'object' || parsed === null) throw new Error('模型 JSON 格式错误。');
  return {
    understanding: String(parsed.understanding ?? ''),
    needs_clarification: String(parsed.needs_clarification ?? ''),
    plan: Array.isArray(parsed.plan) ? parsed.plan.map(String) : [],
    validation: Array.isArray(parsed.validation) ? parsed.validation.map(String) : [],
    risks: Array.isArray(parsed.risks) ? parsed.risks.map(String) : [],
    patch: String(parsed.patch ?? '')
  };
}
