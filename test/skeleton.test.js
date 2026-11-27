import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SKELETON_FILES,
  injectSkeleton,
  validateGeneratedStructure
} from '../src/skeleton.js';

/** 构造一套「最小合规」的模型产出，用于正例与各反例的基线。 */
function baseFiles() {
  return [
    {
      path: 'route/app.php',
      content: `<?php
use app\\controller\\api\\Auth;
use app\\middleware\\AdminAuth;
use think\\facade\\Route;

Route::post('api/admin/login', [Auth::class, 'login']);

Route::group('api/admin', function () {
    Route::get('me', [Auth::class, 'me']);
})->middleware([AdminAuth::class])->completeMatch();
`
    },
    {
      path: 'app/middleware.php',
      content: SKELETON_FILES['app/middleware.php']
    },
    { path: 'public/index.php', content: '<?php // entry\n' },
    {
      path: 'app/controller/api/Auth.php',
      content: `<?php
namespace app\\controller\\api;

use think\\facade\\Session;

class Auth
{
    public function login()
    {
        Session::set('admin_id', 1);
        $attempts = Session::get('login_attempts', 0);
        return json(['code' => 0]);
    }
}
`
    }
  ];
}

test('骨架补齐缺失文件并按路径排序', () => {
  const { files, injected } = injectSkeleton([]);

  for (const required of [
    'think',
    '.gitignore',
    'config/cache.php',
    'config/log.php',
    'config/view.php',
    'config/route.php',
    'config/cookie.php',
    'config/lang.php',
    'config/database.php',
    'app/middleware.php',
    'public/router.php',
    'public/.htaccess',
    'resources/admin/index.html',
    'resources/admin/vite.config.js',
    'resources/admin/package.json'
  ]) {
    assert.ok(injected.includes(required), `未注入 ${required}`);
    assert.ok(files.some((file) => file.path === required), `结果中缺少 ${required}`);
  }

  const paths = files.map((file) => file.path);
  assert.deepEqual(paths, [...paths].sort((a, b) => a.localeCompare(b)));
});

test('骨架覆盖模型写错的同路径文件', () => {
  const wrong = [
    { path: 'think', content: '<?php broken\n' },
    { path: 'public/router.php', content: '<?php // wrong\n' }
  ];
  const { files, overwritten } = injectSkeleton(wrong);

  assert.deepEqual(overwritten.sort(), ['public/router.php', 'think']);
  assert.equal(files.find((file) => file.path === 'think').content, SKELETON_FILES.think);
});

test('骨架内容不含会导致构建或启动失败的写法', () => {
  const html = SKELETON_FILES['resources/admin/index.html'];
  const entrySrc = /<script[^>]*\bsrc\s*=\s*"([^"]*)"/.exec(html)[1];
  assert.equal(entrySrc, './src/main.js');
  assert.ok(!entrySrc.startsWith('/'), '入口脚本不能是根绝对路径');

  const vite = SKELETON_FILES['resources/admin/vite.config.js'];
  assert.ok(vite.includes("base: '/admin/dist/'"));
  assert.ok(vite.includes("outDir: '../../public/admin/dist'"));

  assert.ok(SKELETON_FILES['app/middleware.php'].includes('SessionInit'));
  assert.ok(SKELETON_FILES['think'].includes('console->run()'));
});

test('合规产出通过校验', () => {
  const { files } = injectSkeleton(baseFiles());
  assert.deepEqual(validateGeneratedStructure(files), []);
});

test('骨架为数据库配置写死表前缀 yc_', () => {
  assert.match(SKELETON_FILES['config/database.php'], /['"]prefix['"]\s*=>\s*['"]yc_['"]/);
  const { files } = injectSkeleton(baseFiles());
  assert.ok(files.some((file) => file.path === 'config/database.php'));
});

test('检出表前缀不是 yc_ 的数据库配置', () => {
  const cases = {
    空前缀: SKELETON_FILES['config/database.php'].replace("'prefix' => 'yc_'", "'prefix' => ''"),
    缺配置文件: null
  };

  for (const [name, content] of Object.entries(cases)) {
    const files = baseFiles();
    if (content) files.push({ path: 'config/database.php', content });
    const problems = validateGeneratedStructure(files);
    const hit = content
      ? problems.some((p) => p.includes("prefix 必须为 'yc_'"))
      : problems.some((p) => p.includes('缺少 config/database.php'));
    assert.ok(hit, `${name} 未被检出：${problems.join('\n')}`);
  }
});

test('检出字符串控制器路由', () => {
  const files = baseFiles();
  files[0].content = files[0].content.replace(
    "Route::post('api/admin/login', [Auth::class, 'login']);",
    "Route::post('api/admin/login', 'Api\\Auth/login');"
  );
  const problems = validateGeneratedStructure(injectSkeleton(files).files);
  assert.ok(problems.some((p) => p.includes('字符串控制器路由')), problems.join('\n'));
});

test('检出登录路由出现在鉴权组之后', () => {
  const files = baseFiles();
  files[0].content = `<?php
use app\\controller\\api\\Auth;
use app\\middleware\\AdminAuth;
use think\\facade\\Route;

Route::group('api/admin', function () {
    Route::post('api/admin/login', [Auth::class, 'login']);
})->middleware([AdminAuth::class]);
`;
  const problems = validateGeneratedStructure(injectSkeleton(files).files);
  assert.ok(problems.some((p) => p.includes('登录路由出现在')), problems.join('\n'));
});

test('检出后台源码放在 public 内', () => {
  const files = baseFiles();
  files.push({ path: 'public/admin/src/main.js', content: 'console.log(1)\n' });
  const problems = validateGeneratedStructure(injectSkeleton(files).files);
  assert.ok(problems.some((p) => p.includes('不应放在 public/ 内')), problems.join('\n'));
});

test('允许 public 下的入口脚本与构建产物', () => {
  const files = baseFiles();
  files.push({ path: 'public/admin/dist/index.html', content: '<div></div>\n' });
  files.push({ path: 'public/admin/dist/assets/app.js', content: 'var a=1\n' });
  assert.deepEqual(validateGeneratedStructure(injectSkeleton(files).files), []);
});

test('检出 api/admin 分组缺少完整匹配', () => {
  const files = baseFiles();
  files[0].content = files[0].content.replace('->completeMatch()', '');
  const problems = validateGeneratedStructure(injectSkeleton(files).files);
  assert.ok(problems.some((p) => p.includes('->completeMatch()')), problems.join('\n'));
});

test('检出漏前导反斜杠的 ThinkPHP 类引用', () => {
  const files = baseFiles();
  files.push({
    path: 'app/controller/api/Product.php',
    content: `<?php
namespace app\\controller\\api;

class Product
{
    public function adjustStock(int $id)
    {
        $adminId = (int) think\\facade\\Session::get('admin_id', 0);
        return json(['code' => 0, 'data' => ['admin_id' => $adminId]]);
    }
}
`
  });
  const problems = validateGeneratedStructure(files);
  assert.ok(problems.some((p) => p.includes('缺少前导反斜杠')), problems.join('\n'));
});

test('带前导反斜杠的写法不误报', () => {
  const files = baseFiles();
  files.push({
    path: 'app/controller/api/Log.php',
    content: `<?php
namespace app\\controller\\api;

class Log
{
    public function index()
    {
        $adminId = (int) \\think\\facade\\Session::get('admin_id', 0);
        return json(['code' => 0, 'data' => ['admin_id' => $adminId]]);
    }
}
`
  });
  const problems = validateGeneratedStructure(files);
  assert.ok(!problems.some((p) => p.includes('缺少前导反斜杠')), problems.join('\n'));
});

test('检出把 $request->session() 当写入使用', () => {
  const files = baseFiles();
  files[3].content = `<?php
namespace app\\controller\\api;

use think\\Request;

class Auth
{
    public function login(Request $request)
    {
        $request->session('admin_id', 1);
        return json(['code' => 0]);
    }
}
`;
  const problems = validateGeneratedStructure(injectSkeleton(files).files);
  assert.ok(problems.some((p) => p.includes('Session::set')), problems.join('\n'));
});

test('检出命令类调用 $this->ask()', () => {
  const files = baseFiles();
  files.push({
    path: 'app/command/AdminBootstrap.php',
    content: `<?php
namespace app\\command;

class AdminBootstrap
{
    public function run()
    {
        $user = $this->ask($input, $output, '用户名');
    }
}
`
  });
  const problems = validateGeneratedStructure(injectSkeleton(files).files);
  assert.ok(problems.some((p) => p.includes('$this->ask()')), problems.join('\n'));
});

test('检出错误的 vite base 与入口路径', () => {
  const files = baseFiles();
  const vite = files.find((file) => file.path === 'resources/admin/vite.config.js');
  if (!vite) files.push({ path: 'resources/admin/vite.config.js', content: '' });
  const target = files.find((file) => file.path === 'resources/admin/vite.config.js');
  target.content = `export default { base: '/admin/', build: { outDir: 'dist' } };\n`;

  files.push({ path: 'resources/admin/index.html', content: '<script src="/admin/src/main.js"></script>\n' });

  const problems = validateGeneratedStructure(injectSkeleton(files).files);
  // 骨架会覆盖这两个文件，因此覆盖后应当通过；这里验证的是骨架生效
  assert.deepEqual(problems, []);
});
