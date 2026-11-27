# 初始化模式联调修复 + 云仓项目首次生成 - 归档

**日期**：2026-11-27
**仓库**：https://github.com/yanhuibook/vibe-fullstack-agent
**版本**：v0.8
**关联**：[HINDSIGHT-ARCHIVE-2026-11-26-SYSTEM-SETTINGS.md](HINDSIGHT-ARCHIVE-2026-11-26-SYSTEM-SETTINGS.md) · 后续进展见 [HINDSIGHT-ARCHIVE-2026-11-27-S1-AND-ROUTE.md](HINDSIGHT-ARCHIVE-2026-11-27-S1-AND-ROUTE.md)

## 本日总览

一天内完成「工具修复 → 项目生成 → 本机落地 → 运行期联调」四个阶段，共修复 6 类生成器缺口。

| 阶段 | 结果 |
|---|---|
| 工具侧 | `--init` 参数兼容；测试回归修复；新增生成契约断言 |
| 生成 | 43 个文件写入 `D:\software\yun_cang` |
| 落地 | `composer install`、建库导表（6 张表）、管理员创建、前端构建、`php think run` |
| 联调 | 6 类运行期故障全部修复，鉴权链路 7 项验收通过 |
| 根治（P2） | 14 个骨架文件改为程序注入 + 9 类结构校验，测试 41 条全通过 |

六类缺口速查（详情见第四节）：

| # | 缺口 | 一句话根因 |
|---|---|---|
| 1 | `Unable to resolve NULL driver for [think\Cache]` | 缺 6 个框架配置文件 |
| 2 | 模板渲染失败 | ThinkPHP 8 无内置 Think 视图驱动 |
| 3 | `/admin/*` 返回源码、源码可下载 | SPA 源码放在 Web 根内 |
| 4 | `php think run` 致命报错 | 缺 `public/router.php` |
| 5 | `Call to undefined method ...::ask()` | 模型编造了 Command 上不存在的方法 |
| 6 | 登录 500 | 缺 `SessionInit` 全局中间件 + 路由/会话写法三处错误 |

## 本日目标

让 `--init` 初始化模式真正跑通，并把生成产物（云仓商品库存管理平台）落到 `D:\software\yun_cang`。

## 一、核心故障：`--init` 参数被吞，程序走了错误分支

### 现象

用户执行：

```
npm start -- -- init ../yun_cang
```

程序却进入「修改现有项目」模式，提示“补丁仅在预览后输入 APPLY 才写入”，随后要求输入“要实现的功 Bug”，最后输出“尚未生成可应用改动。请补充信息后重新提交。”后进程直接退出，用户无法继续输入。

### 根因（两个叠加）

1. **命令里多写了一个 `--`**。`npm start --` 已把 `--` 之后的内容转交给脚本。当时观测到 npm 丢弃了第二个 `--`，实际执行的是 `node src/index.js init ../yun_cang`，`process.argv` 为 `["...\\node.exe","init","../yun_cang"]`，**不含 `--init`**。（后续复测发现是否丢弃取决于 npm 版本/终端，见本节“结论”表格，因此修复不依赖该行为。）
2. **`src/index.js` 只认 `--init` 这一个字面量**。`process.argv.indexOf('--init')` 返回 -1，于是跳过初始化分支，落到补丁模式：加载 `system.md` + `profiles/php-fullstack.json`，把工具自身仓库当作待改项目。模型判断信息不足，返回 `needs_clarification`，而该分支 `return` 后没有二次提问循环，所以表现为“跑完就退出，输不进去”。

### 修复

`src/index.js` 增加对位置参数 `init` 的兼容，使 `--init` 与裸 `init` 等价：

```js
const initFlagIndex = process.argv.indexOf('--init');
const positionalInitIndex = process.argv.indexOf('init');
const initIndex = initFlagIndex >= 0
  ? initFlagIndex
  : positionalInitIndex > 1
    ? positionalInitIndex
    : -1;
const initTarget = initIndex >= 0 ? process.argv[initIndex + 1] : undefined;
```

验证方式（不消耗 token）：`node src/index.js init ../__probe_no_parent__/x` 应打印初始化模式的安全说明（“输入 CREATE 才写入”），并在父目录检查处报“目标目录的父目录必须已存在”，证明已进入 init 分支。

### 结论

正确命令（三种写法的实测结果，2026-11-27）：

| 命令 | 实际 argv | 结果 |
|---|---|---|
| `npm start -- --init ../yun_cang` | `--init ../yun_cang` | ✅ 正常 |
| `npm start -- -- init ../yun_cang` | `-- init ../yun_cang`（本次实测 `--` 被保留） | ✅ 正常，由兼容分支处理 |
| `npm start --init ../yun_cang` | 未能传给脚本 | ❌ `EUNKNOWNCONFIG: Unknown cli flag: --init` |

要点：分隔符 `--` 必须存在；`--init` 与裸 `init` 两种写法都可用。不同 npm 版本/终端对多余 `--` 是保留还是丢弃并不一致（会话早期日志中它被丢弃，后期实测中被保留），因此兼容分支同时覆盖 `--init` 与裸 `init` 两种 argv 形态，不依赖具体丢弃行为。

上述代码改动已随提交 `82c6aeb` 进入仓库。

## 二、测试回归修复

前一日为排查 `npm test` 失败，测试断言里被写成了一条不可能匹配的正则 `second explicit confirmation; requires a second confirmation`，导致 2 条测试必挂。本次按“规格 / 提示词 / 测试三者对齐”修正：

| 文件 | 改动 |
|---|---|
| `test/settings.test.js:44` | 正则还原为 `/second explicit confirmation/` |
| `test/settings.test.js:76` | 正则还原为 `/second explicit confirmation/` |
| `profiles/warehouse-mysql84.json:277` | 措辞 `requires a second confirmation` → `requires a second explicit confirmation` |

现状：`node test/settings.test.js` 5/5 通过；`node --check src/index.js` 语法正常。

> 沙箱内 `npm test` 全量会报 `spawn EPERM`（Node 测试运行器 fork 子进程被拦），与本项目代码无关，需在本机终端确认 25/25。

## 三、生成结果

```
npm start -- -- init ../yun_cang
→ 已创建 43 个文件：D:\software\yun_cang
```

生成产物抽查结论：**结构与规格一致**。

| 检查项 | 结论 |
|---|---|
| 公开首页 4 张统计卡片为实时聚合 | `app/controller/Index.php` 四个 `Db::name()->count()`，预警为 `whereRaw('stock_quantity <= warning_threshold')`，无硬编码 |
| 六张表 + 外键 + 索引 | `database/schema.sql` 完整（admins、categories、products、stock_movements、settings、operation_logs） |
| 六个分类种子 + 8 项设置默认值 | 齐全；`default_category_id` 用子查询指向「数码配件」 |
| 凭据不落库 | `.env.example` 全为占位值 |
| 后台路由与鉴权 | `route/app.php` 的 `api/admin` 组挂 `AdminAuth` 中间件，`settings/restore-defaults` 就位 |
| 定时任务注册 | `config/console.php` 注册 `admin:bootstrap`、`low-stock:email`、`operation-log:cleanup` |
| 邮件占位 | `app/service/MailService.php` 未内置第三方邮件库，README 已声明需自行接入 |

## 四、生成产物的已知缺口

> **状态（2026-11-27 补记）**：骨架缺失（`think`、`.gitignore`）已补齐；运行期又暴露两组框架配置问题，均已修复，见 4.1、4.2。仍待处理项见 4.3。

### 4.0 生成器漏生成的骨架文件（已补）

- ~~**缺根目录 `think` 入口文件**~~ —— **已补**。ThinkPHP 8 标准控制台入口（`namespace think;` + `require vendor/autoload.php` + `(new App())->console->run()`），`php -l` 通过。
- ~~**缺 `.gitignore`**~~ —— **已补**。覆盖 `/.env`、`/vendor/`、`/node_modules/`、`/public/admin/node_modules/`、`/public/admin/dist/`、`/runtime/`、`*.log` 及编辑器/系统文件。

### 4.1 运行期故障：`Unable to resolve NULL driver for [think\Cache]`（已修复）

**现象**：`php think admin:bootstrap` 直接抛 `[InvalidArgumentException] Unable to resolve NULL driver for [think\Cache]`。

**根因**：生成器只生成了 `config/` 下的 `app.php`、`console.php`、`database.php`、`session.php`，缺了框架必需的配置文件。ThinkPHP 8 的 `Cache`、`Log`、`View`、`Session` 都继承自 `think\Manager`，`driver()` 在 `getDefaultDriver()` 返回 `null` 时抛该异常；而 `getDefaultDriver()` 读的就是对应配置文件的 `default` / `type` 键。

**排查方式**（可复用）：

```powershell
# 1) 找出所有 Manager 子类
Select-String -Path vendor\topthink\framework\src\think\*.php -Pattern 'class \w+ extends Manager'
# 2) 找出必须返回数组、否则 array_merge 收 null 抛 TypeError 的配置键
Select-String -Path vendor\topthink\framework\src\think\*.php -Pattern "array_merge\([^)]*config->get\('([a-z_]+)'\)"
```

结论：`Cache`/`View`/`Log`/`Session` 四个 Manager，其中 `Session` 已有配置；另外 `Route`、`Cookie`、`Lang` 虽非 Manager，但构造时会把配置传给 `array_merge` 或 `array` 类型参数，缺文件同样崩。

**修复**：补齐 6 个配置文件——`cache.php`（file 驱动）、`log.php`（file 渠道）、`view.php`、`route.php`、`cookie.php`、`lang.php`。空路径的驱动会默认落到 `runtime/cache` 与 `runtime/log`。

### 4.2 视图引擎：ThinkPHP 8 不再内置 `Think` 模板驱动（已修复）

**根因**：`think\View` 的驱动命名空间是 `\think\view\driver\`，但框架只提供 `Php.php`；`composer require topthink/think-template` 装上的包只提供引擎类 `think\Template`，**不提供** view 驱动。`View::getDefaultDriver()` 的默认值就是 `'php'`，说明官方路线是 PHP 原生模板。

**两个必须配套的点**：

1. `config/view.php` 用 `type => 'php'`，并显式设置 `view_path => app()->getRootPath() . 'view' . DIRECTORY_SEPARATOR`（否则驱动依赖 `$app->http->getName()` 推断目录）；
2. Php 驱动会按「控制器名/模板名」拼路径，`View::fetch('index')` 会去找 `view/index/index.html`。模板是平铺在 `view/` 下的，所以必须写成 `View::fetch('index.html')`。

**同时改造**：`view/index.html` 里的 `{$platformName}`、`{$stats.*}` 改为 `<?= htmlspecialchars(...) ?>` / `<?= (int) ... ?>`。`help.html`、`contact.html` 无占位符，未改动。

**验证**（不连库、不开服务器）：

```powershell
php -r 'require "vendor/autoload.php"; $app = new think\App(); $app->initialize();
$v = $app->make(think\View::class);
$out = $v->fetch("index.html", ["platformName" => "云仓", "stats" => ["total_products" => 7, "category_count" => 6, "on_sale_products" => 5, "low_stock_count" => 2]]);
preg_match_all("/<div class=\"num\">([^<]*)<\/div>/", $out, $m);
echo "卡片: " . implode(",", $m[1]);'
```

实测输出 `卡片: 7,6,5,2`。`think-template` 已 `composer remove`，`composer.json` 恢复为只依赖 `topthink/framework`。

### 4.3 后台 SPA 源码被放在 Web 根内（已修复，架构性）

**现象**：`/admin/login` 返回未编译的源码页面（引用 `./src/main.js`）；`/admin/src/main.js` 与 `node_modules` 可直接访问。

**演化过程**：

1. 用户先发现 `index.html` 写的是 `/admin/src/main.js`，导致 `npm run build` 报 `Failed to resolve /admin/src/main.js`；改为 `./src/main.js` 后构建通过。
2. 但仅改相对路径不够：`vite.config.js` 的 `base: '/admin/'` 与产物位置 `public/admin/dist` 不符，构建后 HTML 引用 `/admin/assets/*`，请求会掉进入口控制器返回 HTML，浏览器报 MIME 错误。
3. 进一步实测发现更根本的问题：**SPA 源码本身在 `public/admin/` 内**。把该目录下的 `index.html` 临时改名后，`/admin/xyz` 才返回真正的构建产物（391 字节，含 `/admin/dist/assets`），恢复后又变回源码（285 字节）。

**修复**：源码整体迁到 `resources/admin/`（Web 根之外），`public/admin/` 只保留 `dist`。`vite.config.js` 改为 `base: '/admin/dist/'`、`outDir: '../../public/admin/dist'`。构建与端到端验证：首页 `200`（卡片来自真实聚合 `0,6,0,0`）、`/admin/login` 返回产物 HTML、JS 以 `application/javascript` 返回、`/admin/src/main.js` 不再可下载。

**生成器侧根治**：该约定写入 `profiles/warehouse-mysql84.json`（`architecture.admin.build`）与 `init-prompt.md`，并由新增的 `test/admin-build.test.js` 断言锁定，防止回退。

### 4.4 `php think run` 缺 `public/router.php`（已修复）

`RunServer` 实际执行 `php -S host:port -t public public/router.php`，而生成器没有产出该文件，启动即 `Failed opening required .../public/router.php`。已补标准路由脚本（静态文件直接返回，其余交给 `index.php`），并顺带补了 WAMP/Apache 用的 `public/.htaccess`。

### 4.5 管理命令调用了不存在的方法（已修复）

**现象**：`php think admin:bootstrap` 报 `Call to undefined method app\command\AdminBootstrap::ask()`。

**根因**：模型编造了 `$this->ask($input, $output, '...')`。ThinkPHP 8 的交互输入方法挂在 **`think\console\Output`** 上：`ask($input, ...)`、`askHidden($input, ...)`、`confirm($input, ...)`、`choice($input, ...)`；`think\console\Command` 自身没有这些方法。另确认本项目 `vendor/` 里没有 `symfony/console`（只有 framework、think-orm 等），所以也不能改用 `SymfonyStyle`。

**修复**：`app/command/AdminBootstrap.php` 改为 `$output->ask($input, ...)` + `$output->askHidden($input, ...)`（隐藏输入由框架的 `Ask` 驱动处理，Windows 走 powershell、Unix 走 stty），并为读取 `admins` 与写入管理员各加了 try/catch 给出可读错误。验证方式：`'' | php think admin:bootstrap` 输出“用户名无效（1-64 字符）。”且 `admins` 仍为 0 行，说明不再撞未定义方法，也不会误写数据。

另外复核了 `LowStockEmail`、`OperationLogCleanup` 两个命令，确认引用的 `SettingsService::get/getInt/getBool` 与 `MailService::send` 都真实存在。

**生成器侧根治**：`init-prompt.md` 新增「Console command API」要求；`test/admin-build.test.js` 增加第 3 条断言锁定。

### 4.6 会话与路由接线缺失（已修复）

**现象**：后台登录提示“请求失败”，`POST /api/admin/login` 返回 500。

**被掩盖了两次的错误链**：

1. `think_exception.tpl:346` 的 `htmlentities(null)` 在 PHP 8.3 触发弃用告警，异常页自身崩溃，500 页面不含任何信息；
2. `Request.php:1046` `Call to a member function get() on null`，请求上没有会话实例；
3. 根因：缺 `app/middleware.php`，而 `Http.php:216` 正是从这里加载全局中间件；没有 `SessionInit` 就没有会话 store。

**三个附带缺陷**：

| 缺陷 | 后果 | 修复 |
|---|---|---|
| 路由写成字符串 `'Api\Auth/login'` | 被解析为字面类名 `class not exists:Api\Auth` | 用数组可调用式 `[Auth::class, 'login']` |
| `login` 注册在 `AdminAuth` 保护组内 | 登录请求被鉴权中间件 401 拦住 | login/logout/csrf 移出保护组 |
| `$request->session('k', $v)` 当 setter | `Request::session()` 只读，写入被静默丢弃 | 改用 `think\facade\Session::set()` |

**验收**（临时账号 `probe_tmp` 测试后已删除，库中仅剩用户自己的管理员）：未登录 401、登录 200 + csrf_token、`/me` 200、`/dashboard` 200（`0,6,0,0`）、无 CSRF 写操作 419、首页 200。

**排错方法论**：`$app->bind(think\exception\Handle::class, ...)` 换成打印 `getMessage()` 与 `getFile:getLine` 的匿名处理器，再用 `$app->http->run($request)` 在 CLI 派发请求，可绕过被掩盖的框架异常页。

**生成器侧根治**：`profiles/warehouse-mysql84.json` 新增 `authentication.session_wiring` 与 `authentication.route_wiring`；`init-prompt.md` 新增两条要求；`test/admin-build.test.js` 增加到 5 条断言。

### 4.7 生成器根治：固定骨架注入 + 结构校验（P2，已完成）

前 6 类缺口的共性是「这些文件内容本来就确定，不该交给模型」。P2 把它们变成程序的确定性产出。

**新增 `src/skeleton.js`**

- `SKELETON_FILES`：14 个固定文件 — `think`、`.gitignore`、`config/{cache,log,view,route,cookie,lang}.php`、`app/middleware.php`、`public/router.php`、`public/.htaccess`、`resources/admin/{index.html,vite.config.js,package.json}`
- `injectSkeleton(files)`：同路径以骨架为准覆盖，缺失则补齐，返回 `injected` / `overwritten` 两份清单
- `validateGeneratedStructure(files)`：9 类静态校验

**`src/init.js` 新流程**

模型产出 → `validateGeneratedFiles`（原有：路径/体积/白名单）→ `injectSkeleton` → `validateGeneratedStructure` → 有问题即中止（目标目录零写入）→ 打印骨架注入清单 → 输入 `CREATE` 后写入。

**校验项**（命中即拒绝写入）

| 校验 | 拦下的实际故障 |
|---|---|
| 必需文件存在 | 缺 `think`、`public/index.php` 等 |
| 路由非字符串控制器形式 | `'Api\Auth/login'` → `class not exists` |
| 登录路由不在鉴权组之后 | 登录被 401 拦截 |
| 鉴权分组含 `->middleware()` | 后台接口裸奔 |
| `app/middleware.php` 含 `SessionInit` | `$request->session()` 空指针 |
| 后台源码不在 `public/` | 源码可下载、`/admin/*` 返回未编译页面 |
| 入口脚本为相对路径 | `npm run build` 解析失败 |
| `vite base`/`outDir` 与产物位置匹配 | 构建后白屏 / MIME 错误 |
| 未把 `$request->session()` 当写入；命令类未调 `$this->ask()` | 登录后掉线、命令崩溃 |

**配套**

- `scripts/validate-project.js <dir>`：对已生成项目做事后体检，不修改文件；忽略注释后仍与骨架不同的文件会单独列出（本次用它发现 `yun_cang/.gitignore` 缺 `/resources/admin/node_modules/`，已补）
- `test/skeleton.test.js`：11 条用例（注入、覆盖、正例、9 类反例）

**回归证据**

```
node scripts/validate-project.js ../yun_cang
扫描到 55 个文本文件
✅ 结构校验通过
（仅 resources/admin/index.html 标题与骨架不同，预期）
```

测试合计 **41 条全部通过**（10 个测试文件）。

### 4.8 补丁 hunk 行数错误导致 `corrupt patch`（已修复）

**现象**：用 `--project ../yun_cang` 修改 `Products.vue` 时，输入 `APPLY` 后报 `错误：补丁检查失败：error: corrupt patch at line 18`。

**根因**：模型给出的 diff 头部是 `@@ -5,13 +5,13 @@`，但该 hunk 正文只有 11 行。git 在读到第 18 行的下一个 `@@` 时发现 hunk 未满足声明行数，判定补丁损坏。附带的常见变体是「空上下文行丢失前导空格」，同样会让 hunk 提前结束。

**修复**：`src/patch.js` 新增 `repairDiffHunkHeaders(patch)`：

- 逐个 hunk 遍历正文，按 `' '`/`'-'` 计入旧文件行数、`' '`/`'+'` 计入新文件行数，重写头部计数（起始行号保留）
- 空行上下文补成单个空格；无前导空格的上下文行补空格
- **内容行不做任何改动**

`src/index.js` 在 `parseModelJson` 之后、预览之前调用，输出「已修正 N 处 hunk 行数/上下文格式」，保证预览与写入的是同一份补丁。

**验证**：

```
原始补丁  → error: corrupt patch at line 18
修复后    → git apply --check 通过（临时 git 仓库实测）
```

**配套**：`system.md` 增加 Diff requirements（上下文行含空行必须有前导空格、不得截断、行数须与正文一致），`test/patch-repair.test.js` 4 条用例。

### 4.9 仍待处理的问题

- **文档漂移**（无害）：生成项目 README 的目录结构写了 `app/model/`、`app/validate/`、`template/`，实际未生成。
- **路由待验证**：`route/app.php:11` 的 `Route::get('/admin/<path>')->pattern(['path' => '.*'])` 多段通配在 ThinkPHP 8 上未必生效。表征是后台子页面按 F5 刷新 404。
- **`/api/public/stats` 未实现**：规格要求的公开统计由 ThinkPHP 模板在渲染时聚合，已满足“实时聚合”要求；但 11-26 归档阶段 1 曾计划独立公开统计接口，本次未生成，需决定是否补。

## 五、落地进度与下一步计划

### 已完成（截至 2026-11-27 15:40）

1. ✅ 补 `think` 入口与 `.gitignore`
2. ✅ `composer install`（框架 v8.1.4、think-orm 等）
3. ✅ `.env` 填 `DB_PASSWORD`
4. ✅ 建库 `yun_cang` 与专用账号，导入 `schema.sql`（6 张表）
5. ✅ `php think admin:bootstrap`（修复 `ask()` 后成功，账号 `songxian`）
6. ✅ 前端构建（源码在 `resources/admin`，产物 `public/admin/dist`）
7. ✅ `php think run`：首页 200、后台入口 200、鉴权链路 7 项验收通过

### 下一步（按优先级）

**P0：功能验收（需要在浏览器里点）**

1. 后台子页面 F5 刷新是否 404 → 验证 `/admin/<path>` 多段通配；若失败改 `Route::get('/admin/<path?>')` 或 `miss` 路由
2. 商品 CRUD：新增时分类下拉来自 `categories` 表、默认选中「数码配件」
3. 库存调整：调成负数应被拒绝；成功后 `stock_movements` 增行
4. 系统设置：保存生效；恢复默认需二次确认，且不删除分类/商品/库存/管理员
5. 操作日志：分页可读，`detail` 为 JSON 摘要且不含密码

**P1：定时任务与邮件占位**

6. 手工执行 `php think low-stock:email`（`MAIL_PASSWORD` 为空时应记警告并跳过）
7. 手工执行 `php think operation-log:cleanup`
8. 按手册第 5 节配置 Windows 计划任务（09:00 / 03:00）

**P2：生成器根治（把人工修补变成自动产出）**

9. 在 `src/init.js` 增加**固定骨架注入**：`think`、`.gitignore`、`config/{cache,log,view,route,cookie,lang}.php`、`app/middleware.php`、`public/router.php`、`public/.htaccess` 由程序直接写入，不再依赖模型
10. 对生成结果做**静态校验**：路由必须为数组形式且 login 不在鉴权组内、SPA 源码不在 `public/`、`vite base` 与产物目录匹配；不合规则拒绝写入并提示
11. 在 `init.js` 的 prompt 之外补充"骨架文件清单"校验，与 `validateGeneratedFiles` 合并为一次完整性检查

**P3：待决策**

12. 是否补 `GET /api/public/stats` 独立公开统计接口
13. `MailService` 选型（如 PHPMailer）并实现真实发送
14. 修正生成项目 README 的目录结构漂移（`app/model/`、`app/validate/`、`template/`）

## 六、安全与凭据

- 生成只写入 `D:\software\yun_cang`，未连接数据库、未安装依赖、未运行任何生成物。
- 数据库凭据与 API Key 均未传给模型；`.env.example` 仅占位。
- 本次生成的模型调用使用 DeepSeek（用量报告显示官方单价），非此前表现较弱的 Qwen3-Coder-30B。
- 排查过程对数据库只有只读查询（`SHOW TABLES`、`SELECT COUNT(*)`）与临时测试账号（`probe_tmp`，已删除）；未打印 `.env` 中的密码值。

## 七、后续进展（2026-11-27 晚）

本文档 4.9 中的两项「仍待处理」已在同日后续工作中推进，细节见 [HINDSIGHT-ARCHIVE-2026-11-27-S1-AND-ROUTE.md](HINDSIGHT-ARCHIVE-2026-11-27-S1-AND-ROUTE.md)：

1. **路由待验证 → 已定位并修复**：`/admin/<path>` 通配实测生效（`GET /admin/dashboard` 200）；同时发现真正的缺陷是 `api/admin` 分组的**前缀匹配**把 `products/<id>/stock` 等子路径吞掉了（库存调整等接口实际不可用），已用分组 `completeMatch()` 修复，并修掉被它遮住的 `Product::adjustStock()` 类名解析缺陷。
2. **表结构 → 已完成治理（S1）**：6 张表加 `yc_` 前缀、主键升 `BIGINT UNSIGNED`、补 `deleted_at`、`products.status` 由 ENUM 改 `VARCHAR(20)`、新增 RBAC 三表（共 9 表），并引入 `database/migrations` + `php think migrate`。
3. 仍待处理：生成项目 README 的目录结构漂移、`/api/public/stats` 独立接口、`MailService` 真实发送——与本文档原结论一致。

### 后续进展（续）：S2 后端公共层

同日继续执行 S2（见 [HINDSIGHT-ARCHIVE-2026-11-27-S2.md](HINDSIGHT-ARCHIVE-2026-11-27-S2.md)），与本文档相关的几点：

1. **生成项目 README 的目录漂移已自动消解一半**：S2 真正建出了 `app/model/`、`app/validate/`、`app/support/`、`app/exception/` 与 `app/BaseController.php`，README 里原本「生成了但没落盘」的目录现在确实存在（`template/` 仍未使用）。
2. **未匹配 API 路径返回 HTML 500 的缺陷已修**：由 `app/exception/Handler.php` 统一成 JSON 404/500。
3. 仍待处理：`/api/public/stats` 独立接口、`MailService` 真实发送、PHPStan level 7（本机无外网，未跑）。

