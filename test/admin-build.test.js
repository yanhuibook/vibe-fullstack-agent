import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const profilePath = path.join(root, 'profiles/warehouse-mysql84.json');
const promptPath = path.join(root, 'init-prompt.md');

test('profile pins the admin SPA build contract', async () => {
  const profile = JSON.parse(await fs.readFile(profilePath, 'utf8'));
  const build = profile.architecture.admin.build;
  assert.ok(build, 'architecture.admin.build missing');

  assert.match(build.source_dir, /resources\/admin/);
  assert.match(build.source_dir, /[Nn]ever place it under public\//);
  assert.match(build.entry_html, /\.\/src\/main\.js/);
  assert.match(build.entry_html, /never \/admin\/src\/main\.js/);
  assert.match(build.vite_base, /\/admin\/dist\//);
  assert.match(build.output_dir, /public\/admin\/dist/);
});

test('generation prompt forbids the absolute admin entry script and wrong vite base', async () => {
  const prompt = await fs.readFile(promptPath, 'utf8');

  // 源码必须在 web 根之外
  assert.match(prompt, /put the SPA source under `resources\/admin`/);
  assert.match(prompt, /never under `public\/`/);
  // 入口脚本必须是相对路径
  assert.match(prompt, /\.\/src\/main\.js/);
  // 必须明确禁止根绝对路径写法
  assert.match(prompt, /never a root-absolute `\/admin\/src\/main\.js`/);
  // vite base 与产物位置一致
  assert.match(prompt, /`base` to `\/admin\/dist\/`/);
  assert.match(prompt, /`\.\.\/\.\.\/public\/admin\/dist`/);
});

test('generation prompt pins the console command API', async () => {
  const prompt = await fs.readFile(promptPath, 'utf8');

  // 交互输入必须走 Output 实例
  assert.match(prompt, /\$output->ask\(\$input, 'question'\)/);
  assert.match(prompt, /\$output->askHidden\(\$input, 'question'\)/);
  // 明确 Command 自身没有 ask()
  assert.match(prompt, /`think\\console\\Command` has no `ask\(\)` method/);
  // 未安装的 symfony 类不得引用
  assert.match(prompt, /do not reference Symfony console classes/);
});

test('profile pins session and route wiring', async () => {
  const profile = JSON.parse(await fs.readFile(profilePath, 'utf8'));
  const auth = profile.architecture.admin.authentication;

  assert.ok(auth.session_wiring, 'authentication.session_wiring missing');
  assert.match(auth.session_wiring.global_middleware, /app\/middleware\.php/);
  assert.match(auth.session_wiring.global_middleware, /SessionInit/);
  assert.match(auth.session_wiring.api, /think\\facade\\Session/);
  assert.match(auth.session_wiring.api, /read-only reader/);
  assert.match(auth.session_wiring.public_routes, /outside the AdminAuth middleware group/);

  assert.ok(auth.route_wiring, 'authentication.route_wiring missing');
  assert.match(auth.route_wiring.form, /array callables/);
  assert.match(auth.route_wiring.form, /class not exists/);
});

test('generation prompt forbids request-session writes and string route rules', async () => {
  const prompt = await fs.readFile(promptPath, 'utf8');

  // 必须注册全局会话中间件
  assert.match(prompt, /think\\middleware\\SessionInit::class` in `app\/middleware\.php`/);
  // Request::session 是只读
  assert.match(prompt, /`Request::session\(\$name, \$default\)` is a read-only reader/);
  // 登录路由必须在鉴权组之外
  assert.match(prompt, /outside the admin auth middleware group/);
  // 路由必须用数组可调用式
  assert.match(prompt, /array callables \(`Route::post\('api\/admin\/login', \[Auth::class, 'login'\]\)`\)/);
  assert.match(prompt, /class not exists:Api\\Auth/);
});
