# 云仓项目落地验收清单

**最后更新**：2026-11-27
**对应归档**：[HINDSIGHT-ARCHIVE-2026-11-27-INIT-MODE-FIX.md](HINDSIGHT-ARCHIVE-2026-11-27-INIT-MODE-FIX.md)（首次生成与 8 类故障）· [HINDSIGHT-ARCHIVE-2026-11-27-S1-AND-ROUTE.md](HINDSIGHT-ARCHIVE-2026-11-27-S1-AND-ROUTE.md)（S1 数据库治理 + 路由修复）
**配套手册**：[RUNBOOK-yun_cang.md](RUNBOOK-yun_cang.md)（逐步命令、预期输出、报错对照表）
**架构治理计划**：[ARCHITECTURE-PLAN-2026-11-27.md](ARCHITECTURE-PLAN-2026-11-27.md)（S1–S5 分阶段执行，**新会话从这里开始**）

> ⚠️ 本文件只记录已完成事项与简单验收项。**架构级改造（表前缀、基类体系、前端公共层、闸门、骨架化）按架构治理计划 S1–S5 执行，进度勾选见文末「阶段 H」**，不在 A–G 阶段重复记录。

本文件只跟踪进度勾选；具体怎么执行请看手册，遇到报错先查手册第 3 节。

本文件记录从「工具侧修复」到「yun_cang 本机验收」的实际状态。勾选状态以当前仓库与 `D:\software\yun_cang` 的真实情况为准。

---

## 阶段 A：工具侧（vibe-fullstack-agent）

- [x] 修复 `--init` 参数被吞导致误入补丁模式的问题（`src/index.js` 兼容裸 `init`）
- [x] 修复测试回归，使规格 / 提示词 / 测试三者对齐（`test/settings.test.js`、`profiles/warehouse-mysql84.json`）
- [x] `node --check src/index.js` 语法校验通过
- [x] `node test/settings.test.js` 5/5 通过
- [ ] 本机终端确认全量 `npm test` 为 25/25（沙箱内因 `spawn EPERM` 无法验证）

## 阶段 B：项目生成

- [x] 使用 DeepSeek 调用生成云仓项目
- [x] 43 个文件写入 `D:\software\yun_cang`
- [x] 抽查统计卡片为实时聚合、schema 六表完整、种子数据齐全、`.env.example` 全占位

## 阶段 C：yun_cang 补齐

- [x] 补根目录 `think` 入口文件（`php -l` 校验通过）
- [x] 补 `.gitignore`（覆盖 `/.env`、`/vendor/`、`/runtime/`、`/public/admin/node_modules/`、`/public/admin/dist/`）
- [x] 补 6 个缺失的框架配置：`cache.php`、`log.php`、`view.php`、`route.php`、`cookie.php`、`lang.php`
- [x] 视图改用 php 驱动：`config/view.php` 设 `type=php` + `view_path`；`view/index.html` 占位符改 PHP 短标签；`Index.php` 的 `fetch` 带 `.html`
- [ ] 修正生成项目 README 的目录结构描述（`app/model/`、`app/validate/`、`template/` 未生成）

## 阶段 D：本机安装与建库

- [x] `composer install`（框架 v8.1.4）
- [x] 复制 `.env.example` 为 `.env`，填写 `DB_PASSWORD`
- [x] 创建数据库 `yun_cang` 与专用账号 `yun_cang_app`
- [x] 导入 `database/schema.sql`（`SHOW TABLES` 返回 6 张表）
- [x] `php think admin:bootstrap` 已修复（原调用未定义的 `$this->ask()`，改用 `$output->ask()/askHidden()`）；非交互自测通过
- [x] 交互式执行 `php think admin:bootstrap` 创建首个管理员（用户已完成，账号 songxian）
- [x] 补 `app/middleware.php` 注册 `SessionInit`，修掉 `$request->session()` 空指针
- [x] 登录/登出/csrf 路由移出鉴权组；路由改为 `[Class::class, 'method']` 数组形式
- [x] 会话读写统一改用 `think\facade\Session`（`Request::session()` 只读）
- [x] 鉴权链路验收：未登录 401、登录 200+csrf、`/me` 200、`/dashboard` 200、无 CSRF 写操作 419

## 阶段 E：前端构建与启动

- [x] 补 `public/router.php` 与 `public/.htaccess`（`php think run` 依赖前者）
- [x] SPA 源码移至 `resources/admin`，`public/` 只留 `dist`
- [x] `vite.config.js`：`base: '/admin/dist/'`、`outDir: '../../public/admin/dist'`、入口 `./src/main.js`
- [x] `cd resources/admin && npm install && npm run build`（构建通过，产物落在 `public/admin/dist`）
- [x] `php think run` 启动，首页 HTTP 200、统计卡片来自 MySQL（当前 `0,6,0,0`）
- [x] `/admin/login` 返回构建产物，JS 以 `application/javascript` 返回
- [x] `/admin/src/main.js` 不再可下载（源码已移出 web 根）
- [ ] 后台子页面按 F5 刷新是否 404（若 404，检查 `route/app.php` 的 `/admin/<path>` 通配）

## 阶段 F：功能验收

- [ ] 商品 CRUD：创建时分类下拉从 MySQL 加载、默认分类来自系统设置
- [ ] 库存调整生成 `stock_movements` 记录，库存不允许为负
- [ ] 库存预警列表与阈值配置正常
- [ ] 操作日志只读视图分页正常
- [ ] 系统设置页保存生效；恢复默认需二次确认，且不删除分类/商品/库存/管理员

## 阶段 G：定时任务与邮件占位

- [ ] 手动执行 `php think low-stock:email`，`MAIL_PASSWORD` 为空时记录警告并跳过
- [ ] 手动执行 `php think operation-log:cleanup`，按 `operation_log_retention_days` 清理
- [ ] 按生成项目 README 配置 Windows 计划任务（09:00 与 03:00）
- [ ] 决定是否补 `GET /api/public/stats`（当前由模板渲染时聚合，未单独提供接口）

## 阶段 H：架构治理（ARCHITECTURE-PLAN S1–S5）

- [x] **S1 数据库治理**：表前缀 `yc_`、主键升 BIGINT、补 `deleted_at`、`products.status` 改 VARCHAR(20)、RBAC 三表、`php think migrate` 迁移机制；9 张表 + 15 项接口冒烟全通过（2026-11-27）
- [x] **S2 后端公共层**：`ApiCode`/`ApiException`/`Handler`（JSON 404/500）、`BaseController`、`BaseModel` + 6 模型、`BaseValidate` + 2 校验器、`BaseService`（DSL+事务）、控制器 34 处响应收敛、`common.php`、RBAC 接线（`rule:scan`/`rule:grant` + `yc_role_rule` + `AdminBootstrap` 绑 super）；路由 25/25 + S1 冒烟 15/15 + 构建通过（2026-11-27）。**P9 PHPStan 因本机无外网未执行**，配置已就绪，详见 [HINDSIGHT-ARCHIVE-2026-11-27-S2.md](HINDSIGHT-ARCHIVE-2026-11-27-S2.md)
- [ ] S3 前端公共层（request 抽取、api 按域拆分、枚举/组件/composable、页面内聚）
- [ ] S4 闸门（ESLint 边界规则、stylelint、verify.ps1）
- [ ] S5 骨架化（把 S1–S4 成果写进 `src/skeleton.js`）

---

## 下一步计划（按优先级）

> 版本：2026-11-27 深夜（S2 完成后重排）。上一轮排期里的「P3 待决策」保持不变，新增 P4/P5。

### P0 功能验收（浏览器里点，需登录后操作）

1. 后台子页面按 F5 是否 404 → 验证 `route/app.php` 的 `/admin/<path>` 通配；失败则改 `Route::get('/admin/<path?>')` 或改用 `miss` 路由
2. 商品 CRUD：新增时分类下拉来自 `categories` 表、默认选中「数码配件」
3. 库存调整：负数应被拒；成功后 `stock_movements` 增行
4. 系统设置：保存生效；恢复默认需二次确认，且不删除分类/商品/库存/管理员
5. 操作日志：分页可读，`detail` 为 JSON 摘要且不含密码
6. ~~路由优先级缺陷（S1 新发现）~~ ✅ 已修（2026-11-27）：`api/admin` 分组加 `->completeMatch()`，并把被遮住的 `Product::adjustStock()` 类名解析缺陷（`think\facade\Session` 缺前导反斜杠）一并修掉；路由回归 25 项、S1 冒烟 15 项全通过。详见手册 6.9
7. **（S2 新增）RBAC 权限链在浏览器里点一遍**：用非超管账号登录，确认左侧菜单可用项与 `rule:grant` 授权一致；`/api/admin/me` 不被拦

### P1 定时任务与邮件占位

6. `php think low-stock:email`：`MAIL_PASSWORD` 为空时记警告并跳过
7. `php think operation-log:cleanup`：按 `operation_log_retention_days` 清理
8. 配置 Windows 计划任务（09:00 与 03:00），见手册第 5 节

### P2 生成器根治（已完成）

9. ~~`src/init.js` 增加固定骨架注入~~ ✅ 新增 `src/skeleton.js`，15 个骨架文件由程序写入（不依赖模型）；S1 追加 `config/database.php`（表前缀 `yc_`）
10. ~~生成结果静态校验并拒绝不合规产物~~ ✅ 12 类校验，命中即中止且零写入
11. ~~骨架清单并入完整性检查~~ ✅ 流程为 `validateGeneratedFiles → injectSkeleton → validateGeneratedStructure → CREATE 后写入`
12. ~~扩充测试~~ ✅ `test/skeleton.test.js` 15 条；全量 50 条（49 通过 1 沙箱跳过）
13. ~~事后体检工具~~ ✅ `scripts/validate-project.js <dir>`，已对 `yun_cang` 跑通并发现 `.gitignore` 缺 `/resources/admin/node_modules/`（已补）

### P3 待决策（沿用）

14. 是否补 `GET /api/public/stats` 独立公开统计接口
15. `MailService` 选型（如 PHPMailer）并实现真实发送
16. ~~修正生成项目 README 的目录结构漂移~~ ✅ 部分自动消解：S2 已真正建出 `app/model/`、`app/validate/`、`app/support/`、`app/exception/`；`template/` 仍未使用，README 描述待 S5 一并校正

### P4 收尾 S2 遗留（无外网也能做）

17. **PHPStan level 7 闸门**（S2/P9 未完成）：需要外网安装 `phpstan/phpstan` + `phpstan/extension-installer` + `thinkphp/phpstan-thinkphp`；配置与 `composer stan` 已就绪，联网后先看是否要出 baseline
18. `Warning` / `Log` 列表改模型查询并验证软删除过滤（当前仍 `Db::name` + 别名，`__TABLE__.deleted_at` 在别名下的行为需实测）
19. `app/controller/Index.php`（公开首页）的 4 处 `Db::name` 收敛到模型，统一软删除口径
20. 商品软删除方案：`uk_products_sku` 与软删除冲突，需定「唯一键含 `deleted_at`」或「删除后 SKU 加后缀」后再开软删除
21. 非 API 路径（如 `/nope-page`）的 404 页：仍是 HTML 500，属页面侧渲染链问题（TP 错误模板在 PHP 8.3 下的 `htmlentities(NULL)` 告警）
22. `.backup/*.ps1` 迁移到 `scripts/` 并改为从 `.env` 读凭据（当前脚本内含本机 root 密码，目录已 gitignore）

### P5 架构治理主线（按计划顺序）

23. **S3 前端公共层**：`utils/request.js`、`api/*.api.js`、`constants/enums.js`、`styles/tokens.css`、`components/`、`composables/`、`layouts/`、`views/<模块>/` 内聚（顺带根治 UI 第 8 类问题）
24. **S4 闸门**：ESLint 边界规则 + stylelint + `php-cs-fixer` + `verify.ps1`（把 php -l / PHPStan / 前端 lint+build / 结构校验 / 冒烟串成一条命令）
25. **S5 骨架化**：把 S1–S4 成果写进 `src/skeleton.js`（S2 新增的 20+ 文件见 [HINDSIGHT-ARCHIVE-2026-11-27-S2.md](HINDSIGHT-ARCHIVE-2026-11-27-S2.md) 第十二节的清单），并扩展 `validateGeneratedStructure()`