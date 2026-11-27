# 云仓平台架构治理计划（2026-11-27）

> **交接说明**：本文档自包含，供**新会话**直接执行。阅读顺序：第 1 节（执行者须知）→ 第 2 节（当前基线，勿重做）→ 第 3 节（决策）→ 第 7 节（分阶段执行）。
> 执行前请先跑第 1.3 节的「现状自检」，确认基线与本文档一致。

---

## 1. 执行者须知

### 1.1 前提

| 项 | 值 |
|---|---|
| 工具仓库 | `D:\software\vibe-fullstack-agent`（生成器原型 v0.8，Node ESM） |
| 生成项目 | `D:\software\yun_cang`（ThinkPHP 8.1.4 + Vue 3 + Element Plus 2.13.2 + MySQL 8.4.7） |
| 本机环境 | PHP 8.3.28、Composer `D:\composer\composer.bat`、MySQL `D:\wamp64\bin\mysql\mysql8.4.7\bin\mysql.exe`、Node 22 |
| 工作区策略 | 会话工作区为工具仓库；写 `yun_cang` 需 `danger-full-access` 授权 |
| 数据库 | 库名 `yun_cang`，应用账号 `yun_cang_app`，`.env` 已配好，**6 张表已建但无数据** |

### 1.2 禁止事项（本计划最容易被违反的部分）

1. **不要重新生成项目**。`yun_cang` 已经过 8 轮人工修复才可用，重新 `--init` 会丢掉全部修复。
2. **不要改动已修复的 8 处**（见第 2.1 节表格）。它们有测试与校验保护。
3. **不要引入 monorepo / 多 UI 框架适配层**。参考 vben 只抄「依赖方向」，不抄其工程复杂度。
4. **不要引入 ThinkAdmin 插件生态**。只抄其权限模型与目录约定。
5. **不要物理删除表**。改表结构走 migration，保留数据。
6. **不要在没有备份的情况下改表前缀**（第 4.4 节有备份步骤）。
7. **不要在补丁里混做多件事**：一个补丁只做一件事，便于回滚。
8. **不要声称测试通过**：每次改动后必须实际执行第 7 节各阶段的验收命令。

### 1.3 现状自检（执行前必跑）

```powershell
cd D:\software\vibe-fullstack-agent
node scripts/validate-project.js ..\yun_cang      # 期望：✅ 结构校验通过
Get-ChildItem test -Filter *.test.js | ForEach-Object { node $_.FullName 2>&1 | Select-String '^# (tests|pass|fail)' }
# 期望：12 个文件、45 条测试、44 通过 1 跳过（末条为 git 集成，沙箱内跳过）
cd D:\software\yun_cang; php think version         # 期望：v8.1.4
php -r 'require "vendor/autoload.php"; $app=new think\App(); $app->initialize(); echo count(think\facade\Db::query("SHOW TABLES")), "\n";'   # 期望：6
```

任一项与预期不符 → 先停下来核对，不要继续。

---

## 2. 当前基线（已完成，勿重做）

### 2.1 已修复的 8 类问题

| # | 问题 | 修复位置 | 防线 |
|---|---|---|---|
| 1 | 缺 6 个框架配置文件 → `Unable to resolve NULL driver` | `config/{cache,log,view,route,cookie,lang}.php` | 骨架注入 + 校验 |
| 2 | ThinkPHP 8 无内置 Think 视图驱动 | `config/view.php` 用 php 驱动；模板改 PHP 短标签 | 骨架 |
| 3 | SPA 源码在 Web 根内 → 源码可下载 | 源码移至 `resources/admin` | 骨架 + 校验 |
| 4 | 缺 `public/router.php` → `php think run` 致命 | `public/router.php`、`public/.htaccess` | 骨架 |
| 5 | `$this->ask()` 不存在 | 改用 `$output->ask()/askHidden()` | 校验 |
| 6 | 会话空指针 + 路由字符串 + login 在鉴权组 | `app/middleware.php`、`route/app.php`、Session 门面 | 骨架 + 校验 |
| 7 | 补丁 hunk 行数错 → `corrupt patch` | `src/patch.js` `repairDiffHunkHeaders()` | 自动纠正 |
| 8 | UI 低级错误（el-select 宽度塌陷） | **未根治**，仅手工改 `Products.vue` | ❌ 本计划要解决 |

### 2.2 现有代码结构

**后端 `D:\software\yun_cang\app\`（17 个 PHP 文件）**

```
controller/Index.php, AdminEntry.php
controller/api/{Auth,Dashboard,Product,Category,Warning,Settings,Log}.php
service/{SettingsService,MailService,OperationLogger}.php
command/{AdminBootstrap,LowStockEmail,OperationLogCleanup}.php
middleware/AdminAuth.php
middleware.php                      ← 注册 SessionInit
```

**前端 `resources/admin/src/`**

```
main.js, App.vue, router.js
api.js          ← 49 行塞了 18 个接口（待拆）
views/{Login,Layout,Dashboard,Products,Warnings,Settings,Logs}.vue
```

**数据库 6 张表（无前缀，无软删除，status 为 ENUM）**

`admins`、`categories`、`products`、`stock_movements`、`settings`、`operation_logs`

### 2.3 现有质量设施

| 设施 | 位置 | 状态 |
|---|---|---|
| 骨架注入 | `src/skeleton.js`（14 个文件） | ✅ |
| 生成结构校验 | `validateGeneratedStructure()` 9 类规则 | ✅ |
| 项目体检脚本 | `scripts/validate-project.js` | ✅ |
| 补丁 hunk 修复 | `src/patch.js` | ✅ |
| 测试 | `test/*.test.js` 12 个文件 45 条 | ✅ |

---

## 3. 三项待拍板决策

> **若用户未明确指示，按「默认」列执行**，并在实施记录中注明采用了默认值。

| # | 决策 | 默认建议 | 影响面 |
|---|---|---|---|
| D1 | 表前缀 | **`yc_`** | 全部 6 张表 + `config/database.php`；查询代码不用改（TP 自动加前缀） |
| D2 | 架构形态 | **单应用分层**（`app/controller`、`app/service`、`app/model`） | 不用 ThinkAdmin 式多应用物理隔离，降低初期成本；模块化靠目录约定实现 |
| D3 | 权限模型 | **现在就建 RBAC 三表**：`yc_role`、`yc_rule`、`yc_admin_role` | 进表结构，越晚改代价越大；先建表与节点扫描，权限校验可后置 |

---

## 4. 目标架构

### 4.1 分层与依赖方向（可继承性的核心）

```
第一层 views/            只写模板与交互，禁止直接 fetch
        ↓ 只许向下
第二层 api/ hooks/       业务编排，按领域拆文件
        ↓
第三层 utils/ constants/ styles/   内核层：request、tokens、枚举。零业务、零组件
```

**规则**：依赖只能向下，反向 import 由 ESLint `import/no-restricted-paths` 强制（第 S4 阶段）。

后端：

```
Controller ──▶ Service ──▶ Model ──▶ Db
      ↘ Validate
```

### 4.2 后端目录与基类

```
app/
├── BaseController.php          success()/fail()/paginate()，统一响应与异常
├── common.php                  全局辅助函数（minimal，只放真正通用的）
├── exception/
│   ├── ApiException.php        业务异常，携带 code + httpStatus
│   └── Handler.php             全局异常 → 标准 JSON
├── support/
│   └── ApiCode.php             错误码枚举（0=成功，1xxx 参数，2xxx 认证，3xxx 业务）
├── model/
│   ├── BaseModel.php           审计字段自动填充、软删除、类型转换
│   ├── Admin.php, Category.php, Product.php, StockMovement.php, Setting.php, OperationLog.php
├── validate/
│   ├── BaseValidate.php
│   └── ProductValidate.php, SettingsValidate.php
├── service/
│   ├── BaseService.php         分页/排序/筛选 DSL、事务模板
│   ├── SettingsService.php（已有）, MailService.php（已有）, OperationLogger.php（已有）
├── controller/（已有，改造为继承 BaseController）
├── middleware/（已有）
└── command/（已有）
```

### 4.3 前端目录与公共层

```
resources/admin/src/
├── utils/request.js            fetch 封装 + CSRF + 错误归一（从 api.js 抽出）
├── api/
│   ├── auth.api.js, product.api.js, category.api.js
│   ├── settings.api.js, log.api.js, dashboard.api.js
├── constants/enums.js          状态枚举 + 标签（消除 statusLabel 重复）
├── styles/tokens.css           尺寸/间距/颜色变量（--ctrl-width 等）
├── components/
│   ├── PageHeader.vue, DataTable.vue, PaginationBar.vue, StatusTag.vue
├── composables/
│   ├── useTable.js             列表：loading/list/total/page/load/reset
│   ├── useForm.js              表单：visible/form/editing/submit
│   └── useDialog.js            弹窗开关与二次确认
├── layouts/AdminLayout.vue     （现 views/Layout.vue 迁移）
└── views/<模块>/               页面内聚
    ├── product/index.vue       纯模板
    └── product/utils/{hook.js,rule.js}
```

### 4.4 表设计规约

| 规约 | 现状 | 目标 |
|---|---|---|
| 表前缀 | 无 | `yc_` |
| 主键 | `INT UNSIGNED` | `BIGINT UNSIGNED AUTO_INCREMENT` |
| 必备字段 | `created_at`、`updated_at` | 补 `deleted_at DATETIME NULL`（软删除） |
| 状态字段 | `ENUM(...)` | `VARCHAR(20)` + 应用层校验（**ENUM 加值要改表，不可扩展**） |
| 索引命名 | `uk_/idx_/fk_` 部分规范 | 统一 `uk_表_字段`、`idx_表_字段`、`fk_表_引用表` |
| 建表方式 | 手写 `schema.sql` | 引入 migration（`phinx` 或自建 `database/migrations/` + CLI），结构变更有记录 |

**改前缀的安全步骤**（必须先备份）：

```powershell
cd D:\software\yun_cang
mysqldump -u yun_cang_app -p yun_cang > backup_before_prefix.sql
# 再执行改名，见 S1 阶段动作
```

---

## 5. 公共资产清单

### 5.1 后端

| 路径 | 职责 | 现状 |
|---|---|---|
| `app/BaseController.php` | 统一响应/异常/分页 | ❌ 待建 |
| `app/model/BaseModel.php` | 审计、软删、类型转换 | ❌ 待建 |
| `app/service/BaseService.php` | 分页筛选模板 | ❌ 待建 |
| `app/validate/BaseValidate.php` | 规则复用 | ❌ 待建 |
| `app/common.php` | 全局辅助 | ❌ 待建 |
| `app/exception/` + `support/ApiCode.php` | 异常与错误码 | ❌ 待建 |
| `app/middleware/AdminAuth.php` | 鉴权 + CSRF | ✅ 已有 |
| `app/service/{Settings,Mail,OperationLogger}` | 业务服务 | ✅ 已有 |

### 5.2 前端

| 路径 | 职责 | 现状 |
|---|---|---|
| `utils/request.js` | fetch + CSRF + 错误归一 | ❌ 在 api.js 内 |
| `api/*.api.js` | 按域拆接口 | ❌ 单文件 18 个 |
| `constants/enums.js` | 状态枚举与标签 | ❌ 散落 3 处 |
| `styles/tokens.css` | 尺寸/间距变量 | ❌ 无 |
| `components/` | 表格/分页/状态标签/页头 | ❌ 无 |
| `composables/` | useTable/useForm/useDialog | ❌ 无 |
| `layouts/` | 布局骨架 | ❌ 在 views 内 |
| `views/<模块>/` | 页面内聚 | ❌ 全平铺 |

---

## 6. 借鉴来源（抄什么 / 不抄什么）

| 参考 | 抄 | 不抄 |
|---|---|---|
| vue-vben-admin（[依赖方向文档](https://deepwiki.com/vbenjs/vue-vben-admin/2.1-package-organization-and-dependencies)） | 三层依赖、边界由 lint 强制 | monorepo、多 UI 适配层 |
| vue-pure-admin（[目录精髓](https://gitee.com/attacker/developer-guide/blob/8eb2f8a4d5739d050005595063675318beca4d87/WEB-UI-Development-Guide/02-%E9%A1%B9%E7%9B%AE%E6%9E%B6%E6%9E%84%E4%B8%8E%E7%9B%AE%E5%BD%95%E7%BB%93%E6%9E%84.md)） | 页面内聚五件套（index.vue + form/ + utils/{hook,rule,types}） | 其配置化引擎 |
| ThinkAdmin（[权限模型](https://thinkadmin.top/system/core-permissions.html)、[目录](https://thinkadmin.top/guide/structure.html)） | 权限节点扫描 + `@auth/@login/@menu` 注解、表前缀、`system_` 式系统表 | 插件生态、Composer 分发 |
| PHPStan + thinkphp 扩展（[配置说明](https://www.php.cn/faq/2787320.html)） | 静态分析闸门（`level: 7`、`phpVersion: 80100`） | — |
| 通用表设计规约 | 必备字段、索引命名、BIGINT 主键 | — |

---

## 7. 分阶段执行计划

> 阶段依赖：S1 → S2 → S3 → S4 → S5，**必须按顺序**。每阶段结束跑验收，不通过不进下一阶段。

### S1 数据库治理 ✅ 已完成（2026-11-27）

> 执行记录见 [HINDSIGHT-ARCHIVE-2026-11-27-S1-AND-ROUTE.md](HINDSIGHT-ARCHIVE-2026-11-27-S1-AND-ROUTE.md)：9 张表全部 `yc_` 前缀、迁移机制 `php think migrate` 已落地；同日在验收中修掉了路由前缀匹配缺陷（`api/admin` 分组 `->completeMatch()`）。

**目标**：加前缀、补软删除、主键升级、ENUM 改 VARCHAR、引入 migration；同时在表结构层面预留 RBAC 三表（D3）。

**动作**

1. 备份：`mysqldump -u yun_cang_app -p yun_cang > backup_before_prefix.sql`
2. 建 migration 目录 `database/migrations/`，写 `001_prefix_and_schema_upgrade.sql`：
   - `RENAME TABLE`：6 张表加 `yc_` 前缀
   - `ALTER TABLE yc_products MODIFY id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT`
   - 所有表补 `deleted_at DATETIME NULL DEFAULT NULL`
   - `yc_products.status`：`ENUM` → `VARCHAR(20)`（保留原值 `draft/on_sale/off_sale`）
   - 新增 RBAC 三表：`yc_role`、`yc_rule`、`yc_admin_role`
3. `config/database.php`：`'prefix' => 'yc_'`
4. 检查所有 `Db::name()` 调用不受影响（TP 自动加前缀）；**`leftJoin('categories c')` 需确认补前缀行为**
5. 更新 `database/schema.sql` 为最终结构（新项目生成用）
6. 同步 `src/skeleton.js`：数据库 config 与前缀约定

**验收**

```powershell
php -r '...SHOW TABLES...'          # 期望 9 张表，全部 yc_ 前缀
cd D:\software\yun_cang; php think run    # 首页 200、/admin/login 200
# 用临时账号验证登录 200 + /api/admin/products 200
```

**完成标志**：9 张表全部 `yc_` 前缀；软删除字段存在；首页与后台接口正常。

---

### S2 后端公共层

**目标**：建基类体系，把 36 处裸 `json([...])` 收敛掉。

**动作**

1. `app/support/ApiCode.php`：错误码常量
2. `app/exception/ApiException.php` + `app/exception/Handler.php`：业务异常 → 标准响应（注册到 `config/app.php` 的 `exception_handle`）
3. `app/BaseController.php`：`success($data)`、`fail($code, $msg, $httpStatus)`、`paginate($query)`
4. `app/model/BaseModel.php` + 6 个模型：审计字段、软删除、类型转换
5. `app/validate/BaseValidate.php` + `ProductValidate`、`SettingsValidate`
6. `app/service/BaseService.php`：分页/筛选/排序模板
7. 改造 7 个 API 控制器：继承 `BaseController`，改用 `success()/fail()`；`Db::name()` 逐步换成语义更清晰的 Model
8. `app/common.php` 仅放真正通用函数（如 `now()`）

**验收**

```powershell
composer require --dev phpstan/phpstan phpstan/extension-installer thinkphp/phpstan-thinkphp
# 建 phpstan.neon：level 7、phpVersion 80100、paths app/config/route
vendor\bin\phpstan analyse
# 期望：0 errors
Select-String -Path app\**\*.php -Pattern "return json\(\[" | Measure-Object   # 期望：0
```

**完成标志**：PHPStan level 7 通过；控制器无裸 `json([...])`；原有 45 条测试仍通过。

---

### S3 前端公共层

**目标**：拆 api、收口枚举、抽 request、建 tokens 与组件/composable、页面内聚改造、修掉 UI 类第 8 个问题的根。

**动作**

1. `utils/request.js`：从 `api.js` 抽出 fetch 封装（CSRF、`code!==0` 抛错、401 跳登录）
2. `api/*.api.js`：6 个领域文件；删除原 `api.js`
3. `constants/enums.js`：`PRODUCT_STATUS`（value/label/type 三件套），替换 `Products.vue` 3 处字面量与 `statusLabel()`
4. `styles/tokens.css`：`--ctrl-width: 150px` 等；`main.js` 引入
5. `components/`：`PageHeader.vue`、`DataTable.vue`、`PaginationBar.vue`、`StatusTag.vue`
6. `composables/`：`useTable.js`、`useForm.js`、`useDialog.js`
7. `layouts/AdminLayout.vue`：`views/Layout.vue` 迁移
8. `views/` 内聚改造：`products/` → `index.vue`(纯模板) + `form/index.vue` + `utils/{hook,rule}.js`；其余页面同理
9. **UI 规约落地**：所有表单控件用 `class="ctrl"`（受 tokens 控制），删除散落 inline `style`

**验收**

```powershell
cd D:\software\yun_cang\resources\admin
npm run build          # 必须通过
npx eslint src         # 0 error
node ..\..\..\vibe-fullstack-agent\scripts\validate-project.js D:\software\yun_cang
# 结构校验通过
```

**完成标志**：`api.js` 消失且无引用；`statusLabel` 重复消失；构建通过；后台页面视觉与改造前一致（4 个下拉宽度不塌陷）。

---

### S4 闸门

**目标**：把规则变成机器可拦的检查，一条命令做总闸。

**动作**

1. 前端 ESLint 配置：`eslint-plugin-vue` + `import/no-restricted-paths`（views 不得直接 import `utils/request`，必须经 api）+ 自定义规则（`el-select` 必须带 class 或 width）
2. `stylelint`：禁止 `style="width:"` 散落写法
3. 后端 PHPStan（S2 已装），加 `php-cs-fixer`（PSR-12）
4. `package.json` 加脚本：
   ```json
   "lint": "eslint src && stylelint \"src/**/*.{vue,css}\"",
   "verify": "npm run lint && npm run build"
   ```
5. 项目根加 `verify.ps1`：串起 `php -l`、PHPStan、前端 `npm run verify`、`validate-project.js`、冒烟测 API
6. 生成器侧：把新增校验并入 `validateGeneratedStructure()`（UI 规约 + import 边界）

**验收**

```powershell
cd D:\software\yun_cang; .\verify.ps1     # 一条命令全绿
# 故意在某个 .vue 加 style="width:150px"，verify 必须报错
# 故意在 views 里 import request，eslint 必须报错
```

**完成标志**：两条「故意违规」都被拦下；`verify.ps1` 全绿。

---

### S5 骨架化（本计划的真正目的）

**目标**：把 S1–S4 的成果写进生成器骨架，让**下一个项目天生具备**，而不是每个项目重来一遍。

**动作**

1. `src/skeleton.js` 扩充：基类、异常、错误码、models、validates、request.js、api 目录、enums、tokens.css、components、composables、layouts、eslint/stylelint 配置、`verify.ps1`
2. **目录模板化**：骨架支持「目录结构 + 多文件」，不再只注入单文件
3. `validateGeneratedStructure()` 扩展：
   - 必须存在基类与公共层文件
   - `views/` 不得直接 import `utils/request`
   - 表单控件必须带 `class` 而非 inline `style`
   - 表前缀配置必须为 `yc_`
4. `init-prompt.md` 同步：告诉模型「公共层已由骨架提供，不要重复生成」
5. `profiles/warehouse-mysql84.json` 补 `architecture.layers`、`database.prefix`、`ui.tokens`
6. 测试：为每个新校验补反例用例

**验收**

```powershell
cd D:\software\vibe-fullstack-agent
node test/skeleton.test.js              # 全部通过
# 在一个新空目录重跑一次生成，产物应自带全部公共层
node scripts/validate-project.js <新生成的目录>   # 通过
```

**完成标志**：新生成项目自带基类与公共层，无需任何人工补齐；测试全绿。

---

## 8. 执行顺序与依赖

```
S1 数据库治理 ──▶ S2 后端公共层 ──▶ S4 闸门（后端部分）
                        │
                        └──▶ S3 前端公共层 ──▶ S4 闸门（前端部分）──▶ S5 骨架化
```

- S1 必须先做：S2 的 BaseModel 依赖软删除字段
- S4 分两次落地，前后端互不阻塞
- S5 必须最后：它要拷贝 S1–S4 的最终形态

## 9. 风险与回滚

| 风险 | 应对 |
|---|---|
| 改前缀导致查询全挂 | 改前 `mysqldump` 备份；改后立即跑首页 + dashboard + 登录三项冒烟 |
| 软删除引入后旧查询漏过滤 | BaseModel 统一 scope；改造后逐接口验证 |
| `leftJoin` 别名补前缀异常 | S1 动作 4 单独验证，必要时改写为 `Db::name('categories')->alias('c')` |
| 页面内聚改造引入回归 | 每改一个页面立即 `npm run build` + 手动点一遍 |
| PHPStan 误报过多 | 已装 `thinkphp/phpstan-thinkphp`；先用 baseline，再逐步清零 |

## 10. 完成后要更新的文档

| 文档 | 更新内容 |
|---|---|
| `dev_log.md` | 每阶段一条：改了什么、怎么验的 |
| `project_steps.md` | 勾选对应阶段 |
| `RUNBOOK-yun_cang.md` | 新增表前缀、软删除、verify 命令 |
| `README.md` | 骨架保证章节补充公共层 |
| `HINDSIGHT-ARCHIVE-2026-11-27-INIT-MODE-FIX.md` | 追加第 8 类（UI）的根治记录 |

## 11. 文档索引

| 文档 | 用途 |
|---|---|
| 本文档 | 架构治理总计划（执行主文档） |
| `RUNBOOK-yun_cang.md` | 落地手册：环境、七步初始化、报错对照表、6.1–6.9 修复详情 |
| `project_steps.md` | 进度勾选清单 |
| `dev_log.md` | 开发日志（含八阶段历史） |
| `HINDSIGHT-ARCHIVE-2026-11-27-INIT-MODE-FIX.md` | 首次生成与 8 类故障的完整复盘 |
| `HINDSIGHT-ARCHIVE-2026-11-27-S1-AND-ROUTE.md` | S1 数据库治理 + 路由缺陷修复的完整复盘（下一步 S2 的交接材料） |
| `README.md` | 工具用法与骨架保证机制 |
