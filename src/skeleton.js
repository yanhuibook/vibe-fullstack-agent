/**
 * 固定骨架注入 + 生成产物静态校验。
 *
 * 背景：把 --init 生成的云仓项目落地时，运行期暴露了 6 类「模型该产出却没产出 / 产出错」的
 * 骨架文件问题（缺 think、缺 config 六件套、缺 SessionInit 全局中间件、缺 router.php、
 * 视图驱动不匹配、后台构建路径错位）。这些文件的内容是确定的，不该交给模型自由发挥，
 * 因此在这里以常量的形式固化，写入前无条件覆盖，并在写入前做结构校验。
 */

/** 由程序直接写入的骨架文件：内容确定，不依赖模型输出。 */
export const SKELETON_FILES = {
  think: `#!/usr/bin/env php
<?php
namespace think;

// ThinkPHP 8 控制台入口。vendor/ 由 composer install 生成。
require __DIR__ . '/vendor/autoload.php';

(new App())->console->run();
`,

  '.gitignore': `# 依赖与构建产物
/vendor/
/node_modules/
/public/admin/dist/
/resources/admin/node_modules/

# 运行时与日志
/runtime/
*.log

# 本地环境变量（只提交 .env.example）
/.env
.env.local

# 编辑器与系统
.DS_Store
Thumbs.db
.idea/
.vscode/
`,

  'config/cache.php': `<?php
// 缓存配置。缺失时 think\\Cache 抛 "Unable to resolve NULL driver"。
// File 驱动 path 留空时默认写入 runtime/cache。
return [
    'default' => 'file',
    'stores'  => [
        'file' => [
            'type'   => 'File',
            'prefix' => '',
            'expire' => 0,
        ],
    ],
];
`,

  'config/log.php': `<?php
// 日志配置。缺失时 think\\Log 抛 "Channel [file] not found"。
// File 驱动 path 留空时默认写入 runtime/log。
return [
    'default'  => 'file',
    'channels' => [
        'file' => [
            'type'  => 'File',
            'path'  => '',
            'level' => [],
        ],
    ],
];
`,

  'config/view.php': `<?php
// 视图配置。ThinkPHP 8 只内置 Php 驱动，模板请使用 PHP 原生语法。
return [
    'type'          => 'php',
    'view_dir_name' => 'view',
    'view_path'     => app()->getRootPath() . 'view' . DIRECTORY_SEPARATOR,
    'view_suffix'   => 'html',
    'view_depr'     => DIRECTORY_SEPARATOR,
];
`,

  'config/route.php': `<?php
// 路由配置。必须返回数组：think\\Route 构造时对它做 array_merge，收到 null 会抛 TypeError。
// 其余默认值来自 think\\Route 的内部默认配置。
return [
    'url_html_suffix'  => 'html',
    'url_common_param' => true,
    'url_lazy_route'   => false,
    'url_route_must'   => false,
];
`,

  'config/cookie.php': `<?php
// Cookie 配置。缺失时 Cookie::__make 收到 null 触发 TypeError。
return [
    'expire'   => 0,
    'path'     => '/',
    'domain'   => '',
    'secure'   => false,
    'httponly' => true,
    'samesite' => 'lax',
];
`,

  'config/lang.php': `<?php
// 多语言配置。缺失时 Lang 构造函数收到 null 触发 TypeError。
return [
    'default_lang' => 'zh-cn',
    'allow_group'  => false,
];
`,

  'app/middleware.php': `<?php
// 全局中间件。think\\Http 从本文件加载全局中间件；
// 缺少 SessionInit 时请求上没有会话实例，$request->session() 会抛
// "Call to a member function get() on null"。
return [
    \\think\\middleware\\SessionInit::class,
];
`,

  'public/router.php': `<?php
// PHP 内置服务器（php think run）路由脚本：
// 已存在的静态文件直接返回，其余请求交给 ThinkPHP 入口 index.php。
if (is_file($_SERVER['DOCUMENT_ROOT'] . $_SERVER['SCRIPT_NAME'])) {
    return false;
}

require __DIR__ . '/index.php';
`,

  'public/.htaccess': `<IfModule mod_rewrite.c>
  Options +FollowSymlinks -Multiviews
  RewriteEngine On

  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteRule ^(.*)$ index.php [L,E=PATH_INFO:$1]
</IfModule>
`,

  'resources/admin/index.html': `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>管理后台</title>
</head>
<body>
  <div id="app"></div>
  <!-- 入口必须是相对路径；写成以 / 开头的绝对路径会让 vite build 解析失败 -->
  <script type="module" src="./src/main.js"></script>
</body>
</html>
`,

  'resources/admin/vite.config.js': `import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// 源码在 resources/admin（Web 根之外），产物输出到 public/admin/dist，
// 由 ThinkPHP 的 /admin/* 路由返回该 dist 的 index.html。
// base 必须指向产物实际 URL，否则静态资源 404 或被入口控制器当 HTML 返回。
export default defineConfig({
  plugins: [vue()],
  base: '/admin/dist/',
  build: {
    outDir: '../../public/admin/dist',
    emptyOutDir: true
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8000'
    }
  }
});
`,

  'resources/admin/package.json': `{
  "name": "yun-cang-admin",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": {
    "element-plus": "2.13.2",
    "vue": "^3.4.0",
    "vue-router": "^4.3.0"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.0.0",
    "vite": "^5.0.0"
  }
}
`
};

/** 必须存在的文件（骨架已覆盖一部分，其余由模型产出）。 */
const REQUIRED_FILES = [
  'think',
  'public/index.php',
  'route/app.php',
  'app/middleware.php',
  'resources/admin/index.html',
  'resources/admin/vite.config.js',
  'resources/admin/package.json'
];

/** public/ 下允许出现的路径（其余视为源码误入 Web 根）。 */
const PUBLIC_ALLOWED = [
  'public/index.php',
  'public/router.php',
  'public/.htaccess',
  'public/robots.txt',
  'public/favicon.ico'
];

/**
 * 把骨架文件合并进模型产出的文件列表。同路径以骨架为准（覆盖），缺失则补齐。
 * @param {Array<{path: string, content: string}>} files
 * @returns {{files: Array<{path: string, content: string}>, injected: string[], overwritten: string[]}}
 */
export function injectSkeleton(files) {
  const map = new Map(files.map((file) => [file.path, file]));
  const injected = [];
  const overwritten = [];

  for (const [filePath, content] of Object.entries(SKELETON_FILES)) {
    const existing = map.get(filePath);
    if (!existing) {
      injected.push(filePath);
    } else if (existing.content !== content) {
      overwritten.push(filePath);
    }
    map.set(filePath, { path: filePath, content });
  }

  const merged = [...map.values()].sort((a, b) => a.path.localeCompare(b.path));
  return { files: merged, injected, overwritten };
}

function isUnderPublicAllowed(filePath) {
  if (PUBLIC_ALLOWED.includes(filePath)) return true;
  if (filePath === 'public/admin/dist') return true;
  return filePath.startsWith('public/admin/dist/');
}

/**
 * 静态校验生成产物。返回问题列表，空数组表示通过。
 * @param {Array<{path: string, content: string}>} files
 * @returns {string[]}
 */
export function validateGeneratedStructure(files) {
  const problems = [];
  const byPath = new Map(files.map((file) => [file.path, file.content]));

  for (const required of REQUIRED_FILES) {
    if (!byPath.has(required)) {
      problems.push(`缺少必需文件：${required}`);
    }
  }

  // 后台源码不得出现在 Web 根内
  for (const file of files) {
    if (file.path.startsWith('public/') && !isUnderPublicAllowed(file.path)) {
      problems.push(`后台源码不应放在 public/ 内：${file.path}（应放到 resources/admin）`);
    }
  }

  // 路由：数组可调用式 + 登录路由在鉴权组之外
  const routeText = byPath.get('route/app.php');
  if (routeText) {
    const stringRule = routeText.match(
      /Route::\w+\(\s*'[^']*'\s*,\s*'[A-Za-z_\\][^']*\/[^']*'\s*[,)]/
    );
    if (stringRule) {
      problems.push(
        `route/app.php 使用了字符串控制器路由（${stringRule[0].trim()}），会被解析为字面类名；改用 [Controller::class, 'method']`
      );
    }

    const loginIndex = routeText.indexOf('api/admin/login');
    const groupIndex = routeText.indexOf("Route::group('api/admin'");
    if (loginIndex < 0) {
      problems.push('route/app.php 未注册 api/admin/login 路由');
    } else if (groupIndex >= 0 && loginIndex > groupIndex) {
      problems.push('登录路由出现在 api/admin 鉴权组之后，登录请求会被鉴权中间件拦截');
    }
    if (groupIndex >= 0 && !/->middleware\(/.test(routeText)) {
      problems.push('api/admin 分组缺少鉴权中间件');
    }
  }

  // 会话中间件
  const middlewareText = byPath.get('app/middleware.php');
  if (middlewareText && !middlewareText.includes('SessionInit')) {
    problems.push('app/middleware.php 未注册 SessionInit，请求上将没有会话实例');
  }

  // 后台入口与构建配置
  const adminHtml = byPath.get('resources/admin/index.html');
  if (adminHtml) {
    const entry = [...adminHtml.matchAll(/<script[^>]*\bsrc\s*=\s*"([^"]*)"/g)]
      .map((match) => match[1])
      .find((src) => src.includes('main.js'));
    if (!entry) {
      problems.push('resources/admin/index.html 缺少入口脚本 src');
    } else if (!entry.startsWith('.')) {
      problems.push(`resources/admin/index.html 的入口脚本必须是相对路径（当前为 ${entry}）`);
    }
  }

  const viteConfig = byPath.get('resources/admin/vite.config.js');
  if (viteConfig) {
    if (!viteConfig.includes('/admin/dist/')) {
      problems.push("resources/admin/vite.config.js 的 base 必须是 '/admin/dist/'");
    }
    if (!viteConfig.includes('public/admin/dist')) {
      problems.push('resources/admin/vite.config.js 的 build.outDir 必须指向 public/admin/dist');
    }
  }

  // 会话写入误用：$request->session(...) 是只读读取，作为独立语句时是无效写入
  for (const file of files) {
    if (!/^app\//.test(file.path)) continue;
    if (/^\s*\$request->session\([^;]*\);\s*$/m.test(file.content)) {
      problems.push(`${file.path} 把 $request->session() 当写入使用；应改用 think\\facade\\Session::set()`);
    }
  }

  // 命令类不得调用 Command 上不存在的 ask()
  for (const file of files) {
    if (!/^app\/command\//.test(file.path)) continue;
    if (/\$this->ask\(/.test(file.content)) {
      problems.push(`${file.path} 调用了 \$this->ask()，该方法在 think\\console\\Command 上不存在`);
    }
  }

  return problems;
}
