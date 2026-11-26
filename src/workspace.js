import fs from 'node:fs/promises';
import path from 'node:path';

const SKIP_DIRS = new Set(['.git', 'vendor', 'node_modules', 'dist', 'build', 'coverage', '.next', '.nuxt', 'storage']);
const TEXT_EXTS = new Set(['.php', '.vue', '.js', '.jsx', '.ts', '.tsx', '.css', '.scss', '.json', '.md', '.yml', '.yaml', '.xml', '.html']);
const ROOT_CONTEXT_FILES = ['README.md', 'AGENTS.md', 'CONTRIBUTING.md', 'composer.json', 'package.json', 'vite.config.js', 'vite.config.ts'];
const MAX_FILE_CHARS = 9000;
const MAX_CONTEXT_CHARS = 26000;

function isInside(root, candidate) {
  const rel = path.relative(root, candidate);
  return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel));
}

export function isSensitiveOrGenerated(relPath) {
  const normalized = relPath.replaceAll('\\', '/');
  const parts = normalized.split('/');
  if (parts.some((part) => SKIP_DIRS.has(part))) return true;
  if (parts.some((part) => part === '.git')) return true;
  const base = parts.at(-1) ?? '';
  if (base === '.env' || base.startsWith('.env.')) return true;
  if (/\.(pem|key|p12|pfx|crt)$/i.test(base)) return true;
  if (base.endsWith('.lock')) return true;
  return false;
}

export async function resolveProjectRoot(inputPath = process.cwd()) {
  const root = await fs.realpath(path.resolve(inputPath));
  const stat = await fs.stat(root);
  if (!stat.isDirectory()) throw new Error('项目路径不是目录。');
  return root;
}

async function safeRead(root, relPath) {
  const normalized = relPath.replaceAll('\\', '/').replace(/^\.\//, '');
  if (!normalized || path.isAbsolute(normalized) || isSensitiveOrGenerated(normalized)) return null;
  const full = path.resolve(root, normalized);
  if (!isInside(root, full)) return null;
  try {
    const real = await fs.realpath(full);
    if (!isInside(root, real)) return null;
    const stat = await fs.stat(real);
    if (!stat.isFile() || stat.size > 200_000) return null;
    const content = await fs.readFile(real, 'utf8');
    if (content.includes('\u0000')) return null;
    return content.slice(0, MAX_FILE_CHARS);
  } catch {
    return null;
  }
}

async function listFiles(root, limit = 180) {
  const found = [];
  const walk = async (dir, depth) => {
    if (depth > 5 || found.length >= limit) return;
    let entries;
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (found.length >= limit) break;
      if (entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full).replaceAll(path.sep, '/');
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) await walk(full, depth + 1);
      } else if (entry.isFile() && TEXT_EXTS.has(path.extname(entry.name).toLowerCase()) && !isSensitiveOrGenerated(rel)) {
        found.push(rel);
      }
    }
  };
  await walk(root, 0);
  return found;
}

export async function buildProjectContext(root, profile, selectedPaths = []) {
  const files = await listFiles(root);
  const sections = [];
  let used = 0;
  const add = (title, content) => {
    if (!content || used >= MAX_CONTEXT_CHARS) return;
    const clipped = content.slice(0, Math.min(MAX_FILE_CHARS, MAX_CONTEXT_CHARS - used));
    sections.push(`### ${title}\n\n${clipped}`);
    used += clipped.length;
  };

  add('技术栈配置', JSON.stringify(profile, null, 2));
  add('项目文件清单（截取）', files.slice(0, 180).join('\n'));
  for (const rel of ROOT_CONTEXT_FILES) {
    const content = await safeRead(root, rel);
    if (content) add(`项目文件：${rel}`, content);
  }
  for (const rel of selectedPaths) {
    const content = await safeRead(root, rel);
    if (content) add(`用户指定文件：${rel}`, content);
    else add(`无法读取：${rel}`, '路径不存在、不是安全文本文件，或位于排除范围。');
  }

  return { files, text: sections.join('\n\n---\n\n') };
}

export function validateRelativeFilePath(root, relPath) {
  const normalized = relPath.trim().replaceAll('\\', '/').replace(/^\.\//, '');
  if (!normalized || path.isAbsolute(normalized) || normalized.split('/').includes('..')) {
    throw new Error(`不安全的相对路径：${relPath}`);
  }
  if (isSensitiveOrGenerated(normalized)) throw new Error(`该路径属于敏感或排除范围：${relPath}`);
  const resolved = path.resolve(root, normalized);
  if (!isInside(root, resolved)) throw new Error(`路径超出项目根目录：${relPath}`);
  return normalized;
}
