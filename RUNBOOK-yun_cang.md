# 云仓项目落地手册（Runbook）

**适用对象**：`D:\software\yun_cang`（由 `vibe-fullstack-agent` 的 `--init` 模式生成）
**最后更新**：2026-11-27
**配套文档**：[project_steps.md](project_steps.md)（进度勾选）、[HINDSIGHT-ARCHIVE-2026-11-27-INIT-MODE-FIX.md](HINDSIGHT-ARCHIVE-2026-11-27-INIT-MODE-FIX.md)（生成过程与缺口）

> 本手册记录“生成之后怎么跑起来”的每一步、预期输出与常见报错。生成器只写文件，**不装依赖、不建库、不执行任何命令**，以下全部手动完成。

---

## 1. 本机环境基线（2026-11-27 实测）

| 组件 | 实测路径 / 版本 | 要求 |
|---|---|---|
| PHP | `D:\wamp64\bin\php\php8.3.28\php.exe`，8.3.28 (ZTS) | 8.0+，需 `pdo_mysql`、`mbstring`、`openssl` |
| Composer | `D:\composer\composer.bat` | 任意近版本 |
| MySQL | `D:\wamp64\bin\mysql\mysql8.4.7\bin\mysql.exe`，8.4.7 | 规格要求 8.4 |
| Node.js / npm | `C:\Program Files\nodejs\node.exe`，v22 | 18+ |
| Git | `C:\Program Files\Git\cmd\git.exe` | 用于 diff 检查 |

一键自查：

```powershell
php -v; composer -V; mysql --version; node -v; npm -v
```

> WAMP 的 MySQL 服务需处于运行状态。root 密码是你安装 WAMP 时设定的，本手册不记录任何密码。

---

## 2. 一次性初始化（严格按顺序）

### 步骤 1：安装 PHP 依赖

```powershell
cd D:\software\yun_cang
composer install
```

预期：生成 `vendor\` 目录和 `vendor\autoload.php`；输出 `Generating autoload files`。

> `vendor\` 不存在时，`php think` 会直接报 `Failed opening required 'vendor/autoload.php'` —— 这是“还没跑 composer install”，不是代码错。

### 步骤 2：生成本地 `.env`

```powershell
Copy-Item .env.example .env
```

然后编辑 `.env`，**只改这一行**（其余可先留占位）：

```dotenv
DB_PASSWORD=你为 yun_cang_app 设的强密码
```

要点：
- `.env` 已被 `.gitignore` 忽略，不要提交。
- `config/database.php` 通过 `env('DB_*')` 读取，键名不要改（`DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASSWORD`/`DB_CHARSET`）。
- `MAIL_*` 全部留占位即可，邮件任务会在缺少密码时记警告并跳过，不会崩。

### 步骤 3：建库与专用账号（用 root 执行一次）

```powershell
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS yun_cang CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; CREATE USER IF NOT EXISTS 'yun_cang_app'@'127.0.0.1' IDENTIFIED BY '你的强密码'; GRANT ALL PRIVILEGES ON yun_cang.* TO 'yun_cang_app'@'127.0.0.1'; FLUSH PRIVILEGES;"
```

提示输入 root 密码。应用连接用 `yun_cang_app`，**不要用 root 跑应用**。

### 步骤 4：导入表结构与种子数据

PowerShell 的 `<` 重定向会报错，用管道或 cmd：

```powershell
# 方式一（推荐）
Get-Content database\schema.sql -Raw | mysql -u yun_cang_app -p yun_cang

# 方式二
cmd /c "mysql -u yun_cang_app -p yun_cang < database\schema.sql"
```

预期：无输出即成功。核对（S1 之后表名一律带 `yc_` 前缀）：

```powershell
mysql -u yun_cang_app -p yun_cang -e "SHOW TABLES; SELECT name FROM yc_categories; SELECT setting_key, setting_value FROM yc_settings;"
```

应看到 9 张表（6 张业务表 + `yc_role`/`yc_rule`/`yc_admin_role`）、6 个分类（数码配件…网络设备）、8 条设置。

> 已有库不要重复导入（`schema.sql` 是新建库用的最终结构）。结构升级走 `php think migrate`，见 6.8。

### 步骤 5：创建首个管理员

```powershell
php think admin:bootstrap
```

预期：提示输入用户名与密码，**密码不回显**，写入 `admins` 表的只有 `password_hash`。仅当 `admins` 为空时允许执行。

> 若终端不支持隐藏输入，改用手动方式：本地执行 `php -r "echo password_hash('你的强密码', PASSWORD_DEFAULT);"`，把输出哈希通过 SQL 写入 `admins.password_hash`，明文不要落到任何文件或日志。

### 步骤 6：构建管理后台

```powershell
cd D:\software\yun_cang\resources\admin
npm install
npm run build
cd D:\software\yun_cang
```

预期：生成 `public\admin\dist\`（含 `index.html` 与 `assets\`），且 `public/admin` 下**只有 `dist`**。

要点：
- SPA 源码在 `resources/admin`，**不在** Web 根内；`public/` 只放构建产物。把源码放进 `public/` 会导致后台任意 `/admin/*` URL 返回源码里的 `index.html`（渲染出未编译页面），同时源码和 `node_modules` 变成可下载。
- `vite.config.js`：`base: '/admin/dist/'`、`build.outDir: '../../public/admin/dist'`（相对 `resources/admin`）。
- 入口 `index.html` 必须写相对路径 `./src/main.js`，写成 `/admin/src/main.js` 会让 `vite build` 解析失败。

> 已验证 `element-plus@2.13.2` 存在于 npm registry（peer 要求 `vue ^3.3.0`，项目用 `^3.4.0`，兼容）。

### 步骤 7：启动

```powershell
php think run
```

- 公开站：<http://127.0.0.1:8000/>
- 管理后台：<http://127.0.0.1:8000/admin/login>
- 端口占用时：`php think run --port 8080`

---

## 3. 报错对照表

| 现象 | 原因 | 处理 |
|---|---|---|
| `Could not open input file: think` | 不在项目根目录执行 | `cd D:\software\yun_cang` 后重试 |
| `Failed opening required '.../vendor/autoload.php'` | 未装依赖 | 执行步骤 1 `composer install` |
| `SQLSTATE[HY000] [1045] Access denied for user` | `.env` 的 `DB_USER`/`DB_PASSWORD` 不对，或账号不存在 | 回到步骤 3 建账号并核对 `.env` |
| `SQLSTATE[HY000] [1049] Unknown database 'yun_cang'` | 库未创建 | 回到步骤 3 |
| `[1044] Access denied for user ... to database` | 授权没给到该库 | 重跑 `GRANT ALL PRIVILEGES ON yun_cang.*` |
| `npm run build` 报 `Failed to resolve /admin/src/main.js from index.html` | 入口脚本写成了根绝对路径 | 改成 `./src/main.js`（见 6.3） |
| 打包成功但后台白屏，控制台报 `Expected a JavaScript module but got text/html` | `base` 与服务位置不符，资源请求被入口控制器当 HTML 返回 | `base` 设 `/admin/dist/`（见 6.3） |
| 后台任意 URL 都显示未编译的页面（源码里 `./src/main.js`） | SPA 源码被放在 `public/` 内 | 源码移到 `resources/admin`（见 6.3） |
| `错误：补丁检查失败：error: corrupt patch at line N` | 模型给的 hunk 行数与正文不符，或空上下文行丢前导空格 | 工具已自动纠正（见 6.6）；若仍失败说明内容行不匹配，重新生成补丁 |
| `Call to a member function get() on null`（`Request.php` 内，由 `$request->session()` 触发） | 没有注册 `SessionInit` 全局中间件，请求上没有会话实例 | 补 `app/middleware.php`（见 6.5） |
| 登录接口 500，日志显示 `class not exists:Api\Auth` | 路由写成字符串 `'Api\Auth/login'`，被当作字面类名 | 改数组可调用式 `[Auth::class, 'login']`（见 6.5） |
| 登录 401，密码明明正确 | `login` 路由被放在鉴权中间件组内，请求先被拦 | 把 login/logout/csrf 移出保护组（见 6.5） |
| 登录成功但刷新后又要求登录 | 用 `$request->session($k, $v)` 写会话，该方法只读，写入被静默丢弃 | 改用 `think\facade\Session::set()`（见 6.5） |
| `Call to undefined method app\command\AdminBootstrap::ask()` | 模型编造了 `$this->ask()`；交互输入方法在 `Output` 上 | 用 `$output->ask($input, '...')` / `$output->askHidden($input, '...')`（见 6.4） |
| `php think run` 启动即 `Failed opening required .../public/router.php` | 缺内置服务器路由脚本 | 补 `public/router.php` |
| `Unable to resolve NULL driver for [think\Cache]`（或 `[think\Log]`、`[think\View]`） | `config/cache.php` / `log.php` / `view.php` 缺失，Manager 拿不到默认驱动 | 见 6.1 |
| `Driver [Think] not supported` | ThinkPHP 8 已不内置 Think 视图驱动 | 见 6.2 |
| 首页能打开但只显示 `{$platformName}` 这类原始占位符 | 用了 php 驱动但模板仍写 Think 语法 | 见 6.2 |
| 后台访问返回 **503** 页面，文案“管理后台尚未构建” | 没构建前端，或缺 `public/admin/dist` | 执行步骤 6 |
| 后台菜单可点，但子页面 **F5 刷新 404** | `route/app.php` 的 `/admin/<path>` 多段通配未生效 | 见第 6 节“待验证项” |
| `php think` 报 `Class "app\command\..." not found` | `composer install` 未生成 autoload，或命令名拼错 | 重跑 composer install；命令见 `config/console.php` |
| `php think low-stock:email` 输出警告后跳过 | `MAIL_PASSWORD` 为空/未设置 | 预期行为；要真发信需配 SMTP 并实现发送逻辑 |
| PowerShell 报 `The '<' operator is reserved for future use` | PowerShell 不支持 `<` 重定向 | 用步骤 4 的方式一 |
| `spawn EPERM`（仅工具仓库侧跑测试时） | 沙箱禁止 fork 子进程 | 与本项目无关，在本机终端跑即可 |
| Xdebug 提示 `xdebug.log could not be opened` | WAMP 的 Xdebug 日志目录不可写 | 无害，可忽略或改 `php.ini` 日志路径 |

---

## 4. 验收要点

按顺序验证，全部通过再进入下一阶段：

1. 公开首页 4 张卡片数值与数据库一致（改一条商品库存后刷新应变化，证明不是硬编码）
2. `/admin/login` 登录成功；Cookie 带 `HttpOnly` 与 `SameSite`
3. 写操作请求头带 `X-CSRF-Token`（缺失或错误应被拒）
4. 新增商品时分类下拉来自 `categories` 表，默认选中「数码配件」（来自 `default_category_id`）
5. 库存调减到负数应被拒绝，成功调整后 `stock_movements` 多一行
6. 系统设置保存生效；「恢复默认」需二次确认，且不删除分类/商品/库存/管理员
7. 操作日志分页可读，`detail` 为 JSON 摘要、不含密码
8. `php think low-stock:email` 在无收件人时跳过并记录日志

---

## 5. 定时任务（不自动创建）

两个任务，用「任务计划程序」的图形界面创建，或用管理员 PowerShell 的 `schtasks`。

| 任务 | 时间 | 程序 | 参数 | 起始于 |
|---|---|---|---|---|
| 低库存邮件 | 每天 09:00 | `D:\wamp64\bin\php\php8.3.28\php.exe` | `think low-stock:email` | `D:\software\yun_cang` |
| 日志清理 | 每天 03:00 | `D:\wamp64\bin\php\php8.3.28\php.exe` | `think operation-log:cleanup` | `D:\software\yun_cang` |

`schtasks` 示例（管理员执行）：

```powershell
schtasks /Create /TN "yun_cang 低库存邮件" /SC DAILY /ST 09:00 /TR "\"D:\wamp64\bin\php\php8.3.28\php.exe\" think low-stock:email" /SD 2026-11-27
```

> 「起始于」必须指向项目根，否则 php 找不到 `think` 脚本。Linux 对应 crontab 示例见生成项目的 `README.md`。

---

## 6. 已知问题与待决策

### 6.1 已修复：框架配置文件缺失（2026-11-27）

`php think admin:bootstrap` 曾直接抛 `Unable to resolve NULL driver for [think\Cache]`。原因是生成器只产出 `app.php`、`console.php`、`database.php`、`session.php`，缺了框架必需的配置。已补齐 6 个：

| 文件 | 作用 | 关键值 |
|---|---|---|
| `config/cache.php` | 缓存驱动 | `default => file`，路径默认 `runtime/cache` |
| `config/log.php` | 日志渠道 | `default => file`，路径默认 `runtime/log` |
| `config/view.php` | 视图驱动 | `type => php`，`view_path` 指向根 `view/` |
| `config/route.php` | 路由 | 必须返回数组（`Route` 构造里 `array_merge` 收到 `null` 会抛 TypeError） |
| `config/cookie.php` | Cookie | `Cookie::__make` 会收到 `null` → TypeError |
| `config/lang.php` | 多语言 | `Lang` 构造收到 `null` → TypeError |

判断某个配置文件是否必需的方法：

```powershell
# 找出所有 Manager 子类（Cache/View/Log/Session）
Select-String -Path vendor\topthink\framework\src\think\*.php -Pattern 'class \w+ extends Manager'
# 找出把配置直接塞进 array_merge 的键（缺文件即 TypeError）
Select-String -Path vendor\topthink\framework\src\think\*.php -Pattern "array_merge\([^)]*config->get\('([a-z_]+)'\)"
```

### 6.2 已修复：模板引擎用 php 驱动（2026-11-27）

ThinkPHP 8 **不再内置** `think\view\driver\Think`，框架只带 `Php` 驱动；`topthink/think-template` 只提供引擎类 `think\Template`，不提供 view 驱动，装了也白装（已移除）。当前方案：

- `config/view.php`：`type => 'php'`、`view_suffix => 'html'`、`view_path => app()->getRootPath() . 'view' . DIRECTORY_SEPARATOR`
- `view/index.html`：占位符改为 PHP 短标签 `<?= htmlspecialchars(...) ?>`、`<?= (int) ... ?>`
- `app/controller/Index.php`：`View::fetch('index.html')` —— **必须带扩展名**，否则 php 驱动会按控制器名拼成 `view/index/index.html`

渲染自测（不连库、不开服务）：

```powershell
php -r 'require "vendor/autoload.php"; $app = new think\App(); $app->initialize();
$v = $app->make(think\View::class);
$out = $v->fetch("index.html", ["platformName" => "云仓", "stats" => ["total_products" => 7, "category_count" => 6, "on_sale_products" => 5, "low_stock_count" => 2]]);
preg_match_all("/<div class=\"num\">([^<]*)<\/div>/", $out, $m);
echo "卡片: " . implode(",", $m[1]);'
```

预期输出 `卡片: 7,6,5,2`。

### 6.3 已修复：后台源码移出 Web 根（2026-11-27）

**现象**：`/admin/login` 返回的不是构建产物，而是源码 `index.html`（里面还是 `./src/main.js`）；同时 `/admin/src/main.js`、`node_modules` 都能直接下载。

**根因**：生成器把 SPA 源码放在了 `public/admin/`，而 `public/` 是 Web 根。静态服务器优先命中这个真实文件，`AdminEntry` 根本没机会返回 `dist/index.html`。

**判定实验**（可复用）：把 `public/admin/index.html` 临时改名后再请求 `/admin/xyz`——若返回内容从“源码 285 字节”变成“产物 391 字节且含 `/admin/dist/assets`”，即证明是该文件在挡路。

**修复后的布局**：

```
resources/admin/           SPA 源码（Web 根之外）
  index.html               <script type="module" src="./src/main.js">
  src/
  package.json
  vite.config.js           base: '/admin/dist/', outDir: '../../public/admin/dist'
public/admin/dist/         唯一的对外产物
```

**验证**：构建后 `public/admin` 下只有 `dist`；`/admin/login` 返回含 `/admin/dist/assets` 的 HTML；`/admin/src/main.js` 不再是可下载源码。

### 6.4 已修复：管理命令调用了不存在的方法（2026-11-27）

**现象**：`php think admin:bootstrap` 报 `Call to undefined method app\command\AdminBootstrap::ask()`。

**根因**：交互输入方法在 **Output** 上，不在 Command 上。`think\console\Output` 提供：

```php
$output->ask($input, '问题');          // 普通输入
$output->askHidden($input, '密码');    // 隐藏输入（内部 Ask 驱动已处理 stty/powershell）
$output->confirm($input, '确认？');
$output->choice($input, '选择', [...]);
```

**修复**：`app/command/AdminBootstrap.php` 改用 `$output->ask($input, ...)` 与 `$output->askHidden($input, ...)`，并给数据库读写加了 try/catch。验证方式（不产生数据）：

```powershell
'' | php think admin:bootstrap
```

预期输出 `用户名无效（1-64 字符）。`，且 `admins` 表仍为 0 行。

**生成器侧根治**：`init-prompt.md` 增加「Console command API」要求（禁止 `$this->ask()`、禁止引用未安装的 Symfony console 类），由 `test/admin-build.test.js` 断言锁定。

### 6.5 已修复：会话与路由接线（2026-11-27）

**现象**：`POST /api/admin/login` 返回 500，前端只提示“请求失败”。

**真正的错误链**（框架把原始异常掩盖了两次，必须逐层剥）：

1. 表层：`think_exception.tpl:346` 里 `htmlentities(null)` 在 PHP 8.3 触发弃用告警，异常页面自己崩了 → 只看到一张没有信息的 500 页。
2. 中层：`Request.php:1046` → `Call to a member function get() on null`，即请求上没有会话实例。
3. 根因：生成器没有产出 `app/middleware.php`，而框架正是在 `Http.php:216` 从这里加载全局中间件；缺 `SessionInit` 则 `$request->session` 与 `think\Session` 都拿不到 Store。

**同时暴露的三个附带缺陷**：

| 缺陷 | 后果 | 修复 |
|---|---|---|
| 路由写成 `'Api\Auth/login'` 字符串 | 解析成字面类名 → `class not exists:Api\Auth` | 改用数组可调用式 `[Auth::class, 'login']` |
| `login` 在 `AdminAuth` 保护组内 | 登录请求先被 401 拦掉 | login/logout/csrf 移到保护组之外 |
| `$request->session('k', $v)` 当写用 | 该方法只读，写入静默丢失 | 改用 `think\facade\Session::set()` |

**最终接线**：

```
app/middleware.php         return [think\middleware\SessionInit::class];
route/app.php              Route::post('api/admin/login', [Auth::class, 'login']);  // 保护组之外
                           Route::group('api/admin', function () { ... })->middleware([AdminAuth::class]);
app/controller/api/Auth.php、app/middleware/AdminAuth.php、app/service/OperationLogger.php
                           全部改用 think\facade\Session 读写
```

**验收结果**（临时账号验证后已删除，数据库仅保留你自己的管理员）：

| 场景 | 期望 | 实测 |
|---|---|---|
| 未登录访问受保护 API | 401 | 401 `未登录或会话已过期` |
| 正确密码登录 | 200 + csrf_token | 200，含 csrf_token |
| 带会话访问 `/api/admin/me` | 200 | 200，返回管理员信息 |
| 带会话访问 `/api/admin/dashboard` | 200 | 200，`0,6,0,0` 真实聚合 |
| 无 `X-CSRF-Token` 的写操作 | 419 | 419 |
| 公开首页 | 200 | 200 |

**排错方法论**：这个 500 三次被框架异常页掩盖。定位手法是把 `think\exception\Handle` 通过 `$app->bind()` 换成一个 `report()` 里打印 `get_class`/`getMessage`/`getFile:getLine` 的匿名类，然后 `$app->http->run($request)` 在 CLI 里派发请求——避免反复猜。

### 6.6 已修复：补丁 hunk 行数错误（2026-11-27）

**现象**：工具生成补丁后输入 `APPLY`，报 `补丁检查失败：error: corrupt patch at line 18`。

**根因**：模型把 hunk 头写成 `@@ -5,13 +5,13 @@`，而该 hunk 正文只有 11 行；git 在下一段 `@@` 处判定补丁损坏。变体是空上下文行丢了前导空格。

**修复**：工具在预览前用 `repairDiffHunkHeaders()` 按正文重算行数（`' '`/`'-'` 计旧文件，`' '`/`'+'` 计新文件）、补齐空上下文行的前导空格，内容行不改。预览时提示「已修正 N 处 hunk 行数/上下文格式」。

**如果你看到这条错误**：说明工具已尝试修正但仍失败，通常是补丁内容行本身与文件不匹配（模型看的是旧上下文）。处理方式：重新提交需求，让模型基于最新文件内容重新生成补丁。

### 6.7 仍待验证 / 待决定

1. **`/admin/<path>` 通配**：`route/app.php` 的 `pattern(['path' => '.*'])` 兜底 SPA 路由。已实测 `GET /admin/dashboard` 返回 200（通配生效），建议再在浏览器里对后台嵌套路由按一次 F5 确认。
2. **生成项目 README 与目录实际不符**：README 写了 `app/model/`、`app/validate/`、`template/`，实际未生成（控制器直接用 `Db` 门面 + `view/` 模板）。功能不受影响。
3. **`MailService` 未实现发送**：生成时未内置第三方 SMTP 库，需选定（如 PHPMailer）后在 `app/service/MailService.php` 补发送逻辑，仍从 `env` 读凭据。
4. **未单独提供 `GET /api/public/stats`**：公开统计由 `app/controller/Index.php` 在模板渲染时实时聚合，已满足“不硬编码”要求；如需独立 JSON 接口需另加。
5. **未匹配的 API 路径返回 500 而非 404**：路由没命中时会落到默认控制器解析，抛 `Class not found`，最终渲染成 HTML 500（如 `GET /api/admin/products/1/extra`、`GET /api/admin/nope`）。属全局异常处理范畴，留到 S2 的 `exception/Handler` 统一成 JSON 404/500。

### 6.8 已实施：S1 数据库治理（2026-11-27）

按架构治理计划 S1 完成，`yun_cang` 库已从「6 张裸名表 + ENUM 状态 + INT 主键」升级为：

| 项 | 迁移前 | 迁移后 |
|---|---|---|
| 表前缀 | 无 | `yc_`（`config/database.php` 的 `prefix` 同步） |
| 表数量 | 6 | 9（新增 RBAC：`yc_role`、`yc_rule`、`yc_admin_role`） |
| 主键 | `INT UNSIGNED` | `BIGINT UNSIGNED`，外键列类型同步 |
| 软删除 | 无 | 各表补 `deleted_at DATETIME NULL` |
| 状态字段 | `ENUM` | `VARCHAR(20)`（`draft/on_sale/off_sale` 取值保留，改值不再需要改表） |
| 建表方式 | 手写 `schema.sql` | `database/migrations/*.sql` + `php think migrate`（已应用记录在 `database/migrations/applied.log`） |

**关键点**：

1. 查询代码**不用改**：`Db::name('products')`、`leftJoin('categories c')` 由 ThinkPHP 自动补前缀（`JoinAndViewQuery.php` 的 `getJoinTable()` 带别名时同样补）。已用登录后的 8 个接口实测。
2. 用 `mysql` 命令行直接查表时**必须手写前缀**（`SELECT * FROM yc_products`），前缀只在应用层自动加。
3. 迁移不可回滚（DDL 无事务）：执行前必须备份；失败时先还原再重跑，见迁移文件头部说明。
4. `schema.sql` 已同步为最终结构（9 张表、`yc_` 前缀、BIGINT、`deleted_at`、VARCHAR 状态），只用于**新建库**。
5. 从 `mysqldump` 还原的库再跑迁移，可能残留一个冗余索引 `fk_movements_admin`（实测：直接升级的库上隐式索引会随外键消失，还原库上会保留）；确认后可手工 `ALTER TABLE yc_stock_movements DROP INDEX fk_movements_admin`。

### 6.9 已修复：路由前缀匹配吞掉子路径 + 库存调整类名解析（2026-11-27）

**现象**（S1 冒烟时实测）

- `POST /api/admin/products/1/stock` 返回 422「商品名称必填」→ 后台「库存调整」完全不可用
- `GET /api/admin/products/1` 返回列表而不是单条；`GET /api/admin/products/1/movements`、`POST /api/admin/settings/restore-defaults` 同样被打到父规则

**根因**（两处缺陷叠在一起，第二处被第一处遮住）

1. `route/app.php` 把 `products`、`settings` 规则注册在子路径规则之前，而 ThinkPHP 的 `route_complete_match` 默认 false（`Route.php:64`），规则按**前缀**匹配 → `products/1/stock` 命中了 `products`。
2. 路由修好后 `Product::adjustStock()` 原本会 500：第 130 行写的是 `think\facade\Session::get()`，而文件在 `namespace app\controller\api` 且没有 `use think\facade\Session;`，被解析成 `app\controller\api\think\facade\Session` → `Class not found`。该分支此前根本走不到，所以一直没暴露。

**修法**

1. `route/app.php`：分组加 `->completeMatch()`，api/admin 下每条规则都要求路径完全匹配（`RuleGroup.php:335` 会把分组选项下发给子规则）。这比改全局 `route_complete_match` 影响面小。
2. `Product.php`：补 `use think\facade\Session;`，第 130 行改用 `Session::get(...)`。
3. 生成器侧加两条校验（S5 一并模板化）：api/admin 分组必须带 `->completeMatch()`；`app/` 下出现漏前导反斜杠的 `think\...::` 引用即拒绝写入。

**验证**

- 路由回归脚本 25 项全 PASS：公开页（`/`、`/help`、`/contact`）、SPA 通配、列表与详情区分、库存 +1/-1 与流水、创建/修改/删除/删除后 404、恢复默认设置、6 个只读接口、多余路径段不再命中业务规则
- S1 冒烟 15 项全 PASS
- 数据面还原：库存 5/20、流水 0、操作日志 22、设置表指纹（含 `updated_at`）运行前后一致

> 完整复盘（现象、根因推导、诊断踩坑、教训与 S2 交接）见 [HINDSIGHT-ARCHIVE-2026-11-27-S1-AND-ROUTE.md](HINDSIGHT-ARCHIVE-2026-11-27-S1-AND-ROUTE.md)。


---

## 7. 日常维护

| 操作 | 命令 |
|---|---|
| 项目结构体检 | `node scripts/validate-project.js D:\software\yun_cang`（在工具仓库根目录运行） |
| 换端口启动 | `php think run --port 8080` |
| 前端改动后重建 | `cd public\admin; npm run build; cd D:\software\yun_cang` |
| 前端热更新开发 | `cd public\admin; npm run dev`（`vite` 已配 `/api` 代理到 `127.0.0.1:8000`） |
| 清运行时缓存 | 删除 `runtime\` 目录下对应子目录 |
| 查看表结构 | `mysql -u yun_cang_app -p yun_cang -e "SHOW TABLES;"`；看单表定义用 `-e "SHOW CREATE TABLE yc_settings;"`（表名带 `yc_` 前缀） |
| 执行结构迁移 | `php think migrate`（应用 `database/migrations/*.sql`，已应用记录见 `database/migrations/applied.log`） |
| 手工跑邮件/清理 | `php think low-stock:email` / `php think operation-log:cleanup` |
