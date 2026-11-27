# 开发日志

## 日期
2026-11-26

## 版本
v0.8

## 已完成工作

### 第一阶段：基础架构与公开首页
- 创建了以下数据库表：
  - `admins`
  - `categories`
  - `products`
  - `stock_movements`
  - `settings`
  - `operation_logs`
- 创建了 ThinkPHP 公开首页模板，包括 4 张聚合统计卡片、品牌导航和进入后台按钮。
- 创建了 ThinkPHP JSON API，用于公开统计接口 `/api/public/stats`。

### 第二阶段：管理后台框架与商品管理
- 设计并实现了管理后台框架。
- 实现了商品管理功能，包括 CRUD 操作和分类下拉。

### 第三阶段：库存预警、操作日志、系统设置页
- 实现了库存预警列表和阈值配置。
- 实现了操作日志视图，包括只读和分页功能。
- 实现了系统设置页，包括 8 个字段、保存/恢复默认二次确认功能。

### 第四阶段：定时任务与邮件占位
- 实现了定时任务设置和邮件占位功能。

## 测试
- 对所有实现的界面和功能进行了基本的测试，确保系统稳定运行。

---

## 日期
2026-11-27

## 版本
v0.8（初始化模式联调修复）

## 已完成工作

### 第五阶段：`--init` 模式联调与首次生成

- 定位并修复“初始化模式跑不起来”的故障：
  - 用户命令 `npm start -- -- init ../yun_cang` 中的第二个 `--` 被 npm 吞掉，脚本实际收到 `init ../yun_cang`，不含 `--init`。
  - `src/index.js` 原先只识别 `--init` 字面量，于是落到补丁模式，模型返回 `needs_clarification` 后进程直接 `return`，表现为“提示补充信息后就退出、无法继续输入”。
  - 修复：`src/index.js` 增加对位置参数 `init` 的兼容，`--init` 与裸 `init` 等价。
- 修复测试回归：撤销前一日写入的错误正则，改为“规格与提示词对齐”
  - `test/settings.test.js` 两条正则还原为 `/second explicit confirmation/`
  - `profiles/warehouse-mysql84.json` 的 `restore_defaults` 措辞补上 `explicit`
- 成功生成云仓项目：`npm start -- -- init ../yun_cang` → 43 个文件写入 `D:\software\yun_cang`
- 对生成产物做落地前抽查：统计卡片为实时聚合、六表 schema 完整、分类与设置种子齐全、`.env.example` 全占位、后台路由挂鉴权、三个命令已注册

### 第六阶段：yun_cang 运行期联调（2026-11-27 下午）

生成产物落地后，本机运行依次暴露 6 类问题，全部定位并修复，且逐条在生成器侧加了约束。

| # | 故障现象 | 根因 | 修复 |
|---|---|---|---|
| 1 | `php think admin:bootstrap` 抛 `Unable to resolve NULL driver for [think\Cache]` | 生成器只产出 4 个 config 文件，缺 `cache`/`log`/`view`/`route`/`cookie`/`lang`；`think\Manager` 的 `getDefaultDriver()` 取不到 `default` 即抛异常 | 补齐 6 个配置文件 |
| 2 | 公开首页无法渲染模板 | ThinkPHP 8 **不再内置** `think\view\driver\Think`，只带 `Php` 驱动；`topthink/think-template` 只提供引擎类，装了也没用 | 改 `type=php` + `view_path`，模板占位符改 PHP 短标签，`View::fetch` 带 `.html`；移除无用依赖 |
| 3 | `/admin/*` 返回未编译源码，`/admin/src/main.js` 可下载 | SPA 源码放在 Web 根 `public/admin/` 内，静态服务器优先命中源码 `index.html` | 源码迁至 `resources/admin`；`base: /admin/dist/`、`outDir: ../../public/admin/dist` |
| 4 | `php think run` 启动即致命错误 | 缺 `public/router.php`（`RunServer` 用 `-S ... public/router.php`） | 补 `router.php` 与 `public/.htaccess` |
| 5 | `admin:bootstrap` 报 `Call to undefined method ...::ask()` | 模型编造 `$this->ask()`；交互方法在 `Output` 上 | 改用 `$output->ask()/askHidden()` |
| 6 | 登录 `POST /api/admin/login` 返回 500，前端只提示“请求失败” | ①缺 `app/middleware.php` 未注册 `SessionInit` → 会话实例为 null；②路由字符串 `'Api\Auth/login'` 被当字面类名；③`login` 在鉴权组内被自己拦；④`$request->session($k,$v)` 被当 setter（实际只读） | 补 `app/middleware.php`；路由改数组可调用式；login/logout/csrf 移出保护组；会话读写统一 `think\facade\Session` |

### 关键排错方法（已沉淀进手册）

第 6 项被框架异常页掩盖两层：`think_exception.tpl:346` 的 `htmlentities(null)` 在 PHP 8.3 触发告警，异常页自身崩溃，500 页面不含任何信息。定位手法：

```php
$app->bind(think\exception\Handle::class, fn () => new class($app) extends think\exception\Handle {
    public function report(\Throwable $e): void {
        fwrite(STDERR, get_class($e) . ': ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    }
});
$app->initialize();
$app->http->run($request);   // 在 CLI 派发请求
```

### 验收结果

| 场景 | 结果 |
|---|---|
| 未登录访问受保护 API | 401 |
| 正确密码登录 | 200 + csrf_token |
| 带会话 `/api/admin/me`、`/dashboard` | 200，聚合值 `0,6,0,0` |
| 无 `X-CSRF-Token` 写操作 | 419 |
| 公开首页 / 帮助页 | 200 |
| 后台入口 | 200，JS 以 `application/javascript` 返回 |
| `/admin/src/main.js` | 不可下载（源码已移出 web 根） |

临时测试账号 `probe_tmp` 与诊断脚本 `_probe_login.php` 均已在验证后清理，数据库仅保留用户自己的管理员 `songxian`。

## 生成器侧加固

### 第七阶段：固定骨架注入与结构校验（P2）

把人工补齐的 6 类缺口改为程序确定性产出，避免下一个项目重演。

- 新增 `src/skeleton.js`
  - `SKELETON_FILES`：14 个固定文件（`think`、`.gitignore`、`config/` 六件套、`app/middleware.php`、`public/router.php`、`public/.htaccess`、`resources/admin/{index.html,vite.config.js,package.json}`）
  - `injectSkeleton()`：同路径以骨架为准覆盖，缺失则补齐，返回「补齐 / 覆盖」两份清单
  - `validateGeneratedStructure()`：9 类静态校验（必需文件、字符串路由、登录路由位置、鉴权中间件、SessionInit、源码误入 public、入口相对路径、vite base/outDir、`$request->session()` 误用、`$this->ask()`）
- `src/init.js` 接入：模型产出 → `injectSkeleton` → `validateGeneratedStructure` → 有问题即中止（目标目录零写入）→ 打印骨架注入清单 → `CREATE` 后写入
- 新增 `scripts/validate-project.js`：对已生成项目做事后体检（不修改文件），并报告「忽略注释后仍与骨架不同」的文件
- 新增 `test/skeleton.test.js`：11 条用例，覆盖注入、覆盖、正例与 9 类反例
- 修正 `yun_cang/.gitignore`：补上 `/resources/admin/node_modules/`（源码迁移后漏了这条）

## 已知遗留

- `route/app.php` 的 `/admin/<path>` 多段通配对 SPA 子路由刷新的支持仍需前端实测（登录后 F5 验证）
- 公开统计接口 `/api/public/stats` 未单独实现（模板渲染时聚合已满足“不硬编码”要求）
- 生成项目 README 的目录结构与实际不符（`app/model/`、`app/validate/`、`template/` 未生成）
- `MailService` 仅占位，未接入第三方 SMTP 库
- 骨架与校验覆盖的是「已知」缺口；模型在业务代码层面的新错误仍需人工验收兜底

## 文档

- 新增 `HINDSIGHT-ARCHIVE-2026-11-27-INIT-MODE-FIX.md`（含 4.0–4.7 修复记录）
- 新增 `RUNBOOK-yun_cang.md`（环境基线、七步初始化、报错对照表、6.1–6.5 修复详情、定时任务、维护命令）
- 更新 `README.md`（命令行实测表、骨架保证章节、手册链接）
- 更新 `project_steps.md`（七阶段带状态清单 + P0–P3 计划）
- `project_log.md` 已并入本日志，保留指针

## 测试

- 全量逐文件运行：**41 条测试全部通过**（10 个测试文件）
  - `skeleton.test.js` 11、`admin-build.test.js` 5、`settings.test.js` 5、`patch.test.js` 5、`init.test.js` 4、`architecture/auth-architecture/category-options/public-stats` 各 2、`usage.test.js` 3
- `node scripts/validate-project.js ../yun_cang`：结构校验通过，仅 `resources/admin/index.html` 标题与骨架不同（预期）
- `node --check`：`src/index.js`、`src/init.js`、`src/skeleton.js`、`scripts/validate-project.js` 全部通过
- 沙箱内 `npm test` 全量仍报 `spawn EPERM`（测试运行器 fork 受限），需在本机终端确认