import fs from 'node:fs/promises';
import path from 'node:path';
import { requestPlan } from './provider.js';
import { formatUsageReport } from './usage.js';

const MAX_FILES = 40;
const MAX_FILE_BYTES = 80_000;
const MAX_TOTAL_BYTES = 420_000;
const ALLOWED_EXTS = new Set(['.php', '.json', '.js', '.mjs', '.cjs', '.vue', '.css', '.scss', '.html', '.md', '.sql', '.xml', '.yml', '.yaml', '.txt']);
const ALLOWED_DOTFILES = new Set(['.gitignore', '.env.example']);
const BLOCKED_PARTS = new Set(['.git', 'node_modules', 'vendor', 'dist', 'build', 'coverage']);

function parseJson(raw) {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('模型没有返回可解析的 JSON。');
  const value = JSON.parse(text.slice(start, end + 1));
  if (!value || typeof value !== 'object') throw new Error('模型 JSON 格式不正确。');
  return value;
}

export function validateGeneratedFiles(files) {
  if (!Array.isArray(files) || files.length === 0 || files.length > MAX_FILES) {
    throw new Error(`生成文件数量必须在 1 到 ${MAX_FILES} 之间。`);
  }
  const seen = new Set();
  let totalBytes = 0;
  const normalized = files.map((file) => {
    if (!file || typeof file.path !== 'string' || typeof file.content !== 'string') throw new Error('每个文件必须包含 path 和 content 字符串。');
    const rel = file.path.replaceAll('\\', '/').trim();
    if (!rel || rel.startsWith('/') || /^[A-Za-z]:/.test(rel) || rel.split('/').some((part) => !part || part === '.' || part === '..')) {
      throw new Error(`生成文件路径不安全：${file.path}`);
    }
    const parts = rel.split('/');
    if (parts.some((part) => BLOCKED_PARTS.has(part) || part.startsWith('.env') && rel !== '.env.example')) {
      throw new Error(`禁止生成该路径：${rel}`);
    }
    const base = parts.at(-1);
    const ext = path.extname(base).toLowerCase();
    if (!ALLOWED_DOTFILES.has(base) && !ALLOWED_EXTS.has(ext)) throw new Error(`不支持的文件类型：${rel}`);
    if (base.endsWith('.lock') || /(^|\/)\.env($|\.)/.test(rel) && rel !== '.env.example') throw new Error(`禁止生成敏感或锁定文件：${rel}`);
    if (seen.has(rel)) throw new Error(`重复文件路径：${rel}`);
    seen.add(rel);
    const size = Buffer.byteLength(file.content, 'utf8');
    if (size > MAX_FILE_BYTES) throw new Error(`单个文件过大：${rel}`);
    totalBytes += size;
    return { path: rel, content: file.content };
  });
  if (totalBytes > MAX_TOTAL_BYTES) throw new Error('生成内容超过安全大小限制。');
  if (!normalized.some((file) => file.path === 'README.md')) throw new Error('生成结果缺少 README.md。');
  if (!normalized.some((file) => file.path === '.env.example')) throw new Error('生成结果缺少仅含占位符的 .env.example。');
  return normalized;
}

export async function inspectTarget(targetInput) {
  if (!targetInput) throw new Error('请在 --init 后提供新项目目录。');
  const target = path.resolve(targetInput);
  const parent = path.dirname(target);
  const parentReal = await fs.realpath(parent).catch(() => null);
  if (!parentReal) throw new Error('目标目录的父目录必须已存在。');
  let stat;
  try { stat = await fs.lstat(target); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (stat) {
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('目标必须是普通目录，不能是符号链接或文件。');
    const existing = await fs.readdir(target);
    if (existing.length) throw new Error('目标目录非空；为避免覆盖，原型只接受新目录或空目录。');
  }
  return { target, exists: Boolean(stat) };
}

export async function generateProject({ targetInput, profile, modelConfig, rl, appRoot }) {
  const { target, exists } = await inspectTarget(targetInput);
  const [systemPrompt, profileText] = await Promise.all([
    fs.readFile(path.join(appRoot, 'init-prompt.md'), 'utf8'),
    fs.readFile(path.join(appRoot, 'profiles', 'warehouse-mysql84.json'), 'utf8')
  ]);
  const projectName = path.basename(target);
  const userPrompt = `Create a new project named ${projectName}.\n\nConfirmed project specification:\n${profileText}\n\nDo not add credentials from chat. Return JSON only.`;
  console.log(`\n新项目目录：${target}`);
  console.log('生成范围：含真实聚合统计的 ThinkPHP 公开首页 + 带登录的 Vue 管理后台 + 商品分类下拉 + MySQL 8.4 商品库存平台');
  console.log('数据库凭据不会传给模型；不会连接数据库或运行命令。');
  console.log('\n正在生成文件清单和项目文件……');

  const completion = await requestPlan({ ...modelConfig, systemPrompt, userPrompt });
  console.log('\n=== 本次模型用量与费用估算 ===\n' + formatUsageReport({ ...completion, maxOutputTokens: modelConfig.maxOutputTokens }));
  const parsed = parseJson(completion.content);
  const files = validateGeneratedFiles(parsed.files);
  const manualSteps = Array.isArray(parsed.manual_steps) ? parsed.manual_steps.map(String) : [];
  console.log(`\n=== 方案 ===\n${String(parsed.summary ?? '商品与库存管理平台')}`);
  console.log('\n=== 将创建的文件 ===');
  for (const file of files) console.log(`- ${file.path}`);
  if (manualSteps.length) {
    console.log('\n=== 模型建议的后续步骤（不会执行）===');
    for (const step of manualSteps) console.log(`- ${step}`);
  }
  console.log('\n检查文件清单后，输入大写 CREATE 才会在目标目录写入新文件；其他输入均取消。');
  if ((await rl.question('> ')).trim() !== 'CREATE') {
    console.log('已取消；没有写入项目文件。');
    return;
  }

  if (!exists) await fs.mkdir(target, { recursive: false });
  for (const file of files) {
    const fullPath = path.resolve(target, file.path);
    const relative = path.relative(target, fullPath);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error(`写入路径超出项目目录：${file.path}`);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, file.content, { encoding: 'utf8', flag: 'wx' });
  }
  console.log(`\n已创建 ${files.length} 个文件：${target}`);
  console.log('下一步请在 VS Code 检查 README 和 diff；按 README 指引手动安装依赖、设置本地 .env，再连接数据库。');
}
