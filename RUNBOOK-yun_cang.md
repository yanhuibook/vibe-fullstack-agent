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

预期：无输出即成功。核对：

```powershell
mysql -u yun_cang_app -p yun_cang -e "SHOW TABLES; SELECT name FROM categories; SELECT setting_key, setting_value FROM settings;"
```

应看到 6 张表、6 个分类（数码配件…网络设备）、8 条设置。

### 步骤 5：创建首个管理员

```powershell
php think admin:bootstrap
```

预期：提示输入用户名与密码，**密码不回显**，写入 `admins` 表的只有 `password_hash`。仅当 `admins` 为空时允许执行。

> 若终端不支持隐藏输入，改用手动方式：本地执行 `php -r "echo password_hash('你的强密码', PASSWORD_DEFAULT);"`，把输出哈希通过 SQL 写入 `admins.password_hash`，明文不要落到任何文件或日志。

### 步骤 6：构建管理后台

```powershell
cd public\admin
npm install
npm run build
cd D:\software\yun_cang
```

预期：生成 `public\admin\dist\`（含 `index.html` 与 `assets\`）。
`vite.config.js` 的 `base` 为 `/admin/`，产物必须放在 `public/admin/dist`，否则后台会报 503。

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

1. **`/admin/<path>` 通配未验证**：`route/app.php:11` 用 `pattern(['path' => '.*'])` 兜底 SPA 路由，若 F5 刷新子页面 404，需要改成 ThinkPHP 8 支持的写法（如 `Route::get('/admin/<path?>', ...)` 或改用 `miss` 路由）。属运行后验证项，不是生成阶段的错误。
2. **生成项目 README 与目录实际不符**：README 写了 `app/model/`、`app/validate/`、`template/`，实际未生成（控制器直接用 `Db` 门面 + `view/` 模板）。功能不受影响。
3. **`MailService` 未实现发送**：生成时未内置第三方 SMTP 库，需选定（如 PHPMailer）后在 `app/service/MailService.php` 补发送逻辑，仍从 `env` 读凭据。
4. **未单独提供 `GET /api/public/stats`**：公开统计由 `app/controller/Index.php` 在模板渲染时实时聚合，已满足“不硬编码”要求；如需独立 JSON 接口需另加。

---

## 7. 日常维护

| 操作 | 命令 |
|---|---|
| 换端口启动 | `php think run --port 8080` |
| 前端改动后重建 | `cd public\admin; npm run build; cd D:\software\yun_cang` |
| 前端热更新开发 | `cd public\admin; npm run dev`（`vite` 已配 `/api` 代理到 `127.0.0.1:8000`） |
| 清运行时缓存 | 删除 `runtime\` 目录下对应子目录 |
| 查看表结构 | `mysql -u yun_cang_app -p yun_cang -e "SHOW TABLES;"`；看单表定义用 `-e "SHOW CREATE TABLE settings;"` |
| 手工跑邮件/清理 | `php think low-stock:email` / `php think operation-log:cleanup` |
