# 架构治理 S2 后端公共层 - 归档

**日期**：2026-11-27
**上游**：[ARCHITECTURE-PLAN-2026-11-27.md](ARCHITECTURE-PLAN-2026-11-27.md)（S2 章）· [HANDOFF-S2-2026-11-27.md](HANDOFF-S2-2026-11-27.md)（P1–P9 拆解）· [HINDSIGHT-ARCHIVE-2026-11-27-S1-AND-ROUTE.md](HINDSIGHT-ARCHIVE-2026-11-27-S1-AND-ROUTE.md)（S1 执行记录）

## 本轮总览

按交接文档执行 **S2 后端公共层**：P1 异常与错误码 → P2 BaseController → P3 模型层 → P4 校验层 → P5 BaseService → P6 控制器改造（4 个补丁）→ P7 common.php → P8 RBAC 接线 → P9 PHPStan。

| 补丁 | 结果 | 验收证据 |
|---|---|---|
| P1 异常与错误码 | `ApiCode` / `ApiException` / `Handler` 落地；`/api/admin/nope` → JSON 404，异常 → JSON 500 | 5 类异常探针全 PASS；真实 HTTP：`/api/admin/nope`、`/api/nope` 均 `{"code":404,"message":"接口不存在"}` |
| P2 BaseController | `success/fail/paginate/pageNumber/currentAdminId/currentAdminName` | 反射断言 6 方法齐全；`success()`/`fail()` 输出形态与改造前一致（7 个用例） |
| P3 模型层 | `BaseModel` + 6 模型（Admin/Category/Product/StockMovement/Setting/OperationLog） | 软删除三态、`withTrashed()`、`onlyTrashed()`、类型转换、字符串主键设置表全 PASS；事务回滚后数据面一致 |
| P4 校验层 | `BaseValidate` + `ProductValidate` + `SettingsValidate` | 与旧实现逐条对照 **23/23 完全一致**（含 11 个商品边界 + 9 个设置边界 + SKU 唯一性 + 多错拼接） |
| P5 BaseService | 筛选/排序 DSL + 事务模板；`Product::index()` 改用 DSL | 16 个筛选/分页组合输出与改造前**字节级一致**；事务模板 3 项 PASS |
| P6 控制器改造 | Auth / Product / Settings / Category·Dashboard·Warning·Log（4 个补丁，34 处响应） | 每个补丁后：路由回归 25/25 + S1 冒烟 15/15 + 前端构建通过；Product 额外 9 项错误文案对照 |
| P7 common.php | `now()`、`is_blank()` | 无需 `composer dump-autoload`（TP8 的 `App::load()` 直接 include） |
| P8 RBAC 接线 | `RuleNode` / `PermissionService` / `rule:scan` / `rule:grant` / `AdminAuth` 权限校验 / `AdminBootstrap` 绑 super / **补 `yc_role_rule` 表** | 运行时探针 15/15；节点扫描 17 条；超管 200、无角色 403、授权后 200、未授权 403、`@auth false` 豁免 200 |
| P9 PHPStan | ⚠️ **未完成**：本机无外网（packagist 与腾讯云镜像均 TLS 握手失败） | 配置已就绪（`phpstan.neon` level 7 / phpVersion 80100、`composer stan`）；替代检查：51 个文件 `php -l` 0 错、40 个类全部可加载 |

## 一、P1 异常与错误码

### 1.1 新增文件

| 文件 | 职责 |
|---|---|
| `app/support/ApiCode.php` | 错误码分段：0 成功、1xxx 参数、2xxx 认证、3xxx 业务；`message()` / `httpStatus()` / 已知码校验 |
| `app/exception/ApiException.php` | 携带业务码 + HTTP 状态 + 文案；`param/unauthorized/forbidden/notFound/business` 工厂方法 |
| `app/exception/Handler.php` | 继承 `think\exception\Handle`；API 请求一律 JSON（404/500/403/422 归一） |
| `app/provider.php` | 容器绑定 `think\exception\Handle → app\exception\Handler` |

### 1.2 关键发现：TP8 不读 `config/app.php` 的 `exception_handle`

交接文档写的是「注册到 `config/app.php` 的 `exception_handle`」——**这是 TP5 的约定**。TP 8.1.4 全量 grep 无 `exception_handle` 读取点；容器绑定走 `app/provider.php`（`App::__construct` 会 `include $appPath . 'provider.php'`）。

- 首次按 `config/app.php` 注册后实测：`/api/admin/nope` 仍返回 HTML 500（且错误模板自身在 PHP 8.3 下递归渲染成一堆嵌套 HTML）。
- 改为 `app/provider.php` 绑定后立即生效。**`config/app.php` 未留无效键**（避免误导后来人）。

### 1.3 第二处踩坑：`json()` 第 4 个参数类型

`Helper.php` 的 `json($data, $code, $header, $options)` 里 `$options` 是**数组**（`Json` 响应默认已是 `JSON_UNESCAPED_UNICODE`），不是 encode flags。传 `JSON_UNESCAPED_UNICODE` 触发 `TypeError: Response::options(): Argument #1 must be of type array, int given`，表现为空的 500 HTML。去掉第 4 参即修复。

### 1.4 Handler 行为

| 场景 | 输出 |
|---|---|
| `ApiException` | `{code, message}`，HTTP 取异常携带的状态 |
| `ValidateException` | HTTP 422，`code` 422，`message` 取第一条错误（沿用历史约定） |
| `HttpException` | HTTP 取状态码，文案按标准码映射（不把 `controller not exists:...` 透给前端） |
| 「类/方法不存在」 | HTTP 404，`{"code":404,"message":"接口不存在"}` |
| 其它异常 | HTTP 500，`{"code":500,"message":"服务器内部错误"}`（debug 模式回显真实异常） |
| 非 API 请求（站点页） | 交父类渲染 HTML，行为不变 |

## 二、P2 BaseController

`app/BaseController.php`（abstract）：`success($data, $msg)`、`fail($code, $msg, $httpStatus)`、`paginate($query, $pageSize, $request)`、`pageNumber()`、`currentAdminId()`、`currentAdminName()`。

设计要点：**为保住前端契约，`fail()` 的 code 沿用历史用法（401/404/419/422 即 HTTP 状态码）**，同时 1xxx/2xxx/3xxx 新码可按 `ApiCode::httpStatus()` 推导状态码。`success()` 省略 `message`/`data` 空字段，与改造前的 `{'code':0,'data':...}` / `{'code':0,'message':...}` 两种形态一一对应。

> 交接文档写「可 new 后反射断言」；`BaseController` 是抽象类，验收用匿名子类实例化（不依赖框架上下文）。

## 三、P3 模型层

| 模型 | 表 | 说明 |
|---|---|---|
| `BaseModel` | — | `autoWriteTimestamp` + `createTime/updateTime = created_at/updated_at`、`SoftDelete`（`deleted_at`）、`scopeActive()` |
| `Admin` | `admins` | `findByUsername()`（自动排除软删除——**修掉「注销账号仍可登录」的风险**）；`password_hash` 进 `$hidden` |
| `Category` | `categories` | — |
| `Product` | `products` | 状态常量 + `isValidStatus()` + `isLowStock()` |
| `StockMovement` | `stock_movements` | 审计表：不写 `updated_at` |
| `Setting` | `settings` | 主键 `setting_key`（非自增）、`value()`/`map()` |
| `OperationLog` | `operation_logs` | 审计表：不写 `updated_at` |

**有意不做的一件事**：`Product::$type` **没有**把 `price` 转 float。DECIMAL 经 PDO 返回字符串 `"11.50"`，转 float 会变成 `11.5`，前端 `el-table-column prop="price"` 直接显示该值——属于可见的契约变化。整数列本就返回 int，转换不改变输出。

**软删除现状（务必知悉）**：

- 模型查询自动带 `deleted_at IS NULL`；`Db::name()` 查询**不感知**软删除（已知风险，P3 交接文档也提示过）。
- 商品删除**仍保持物理删除**：`uk_products_sku` 是普通唯一索引，改软删除会让被删商品长期占住 SKU，删掉后无法用同一 SKU 重建。要做软删除必须先改唯一索引策略（例如把 `deleted_at` 纳入唯一键或加 `sku_seq`），属独立补丁，本轮不混做。
- 因此实际生效的软删除点：管理员登录查询、分类/商品/流水的读路径（模型）。

## 四、P4 校验层

`SettingsService::validate()` 的逻辑**先迁移**到 `SettingsValidate::errors()/validateOrFail()`，P6c 才删掉旧副本——迁移与删除分两个补丁，避免行为漂移无法对照。

对照结果（`旧实现 vs 新校验器`，逐字比对）：商品 11 个边界 + SKU 唯一性 2 项 + 设置 9 个边界 + 多错拼接 1 项 = **23/23 一致**，包括错误文案、错误顺序、多条用「；」拼接的形态。

## 五、P5 BaseService

声明式筛选 DSL（`like` / `eq-int` / `eq` / `enum`）+ 排序规则 + 分页 + 事务模板。`ProductService` 只声明规则：

```php
protected array $filterRules = [
    'keyword'     => ['field' => 'p.name',        'type' => 'like'],
    'category_id' => ['field' => 'p.category_id', 'type' => 'eq-int', 'min' => 1],
    'status'      => ['field' => 'p.status',      'type' => 'enum', 'values' => Product::STATUSES],
];
protected string $defaultSort = 'p.id desc';
```

改造前后用同一批 16 个请求参数跑 `Product::index()`，把每次响应落盘比对：**字节级完全一致**（含 `rawlen`）。

事务模板：业务异常原样抛出；其它异常先 `Log::error()` 记原始异常，再转 `ApiException(3000, '操作失败，请稍后重试', 500)`，避免 SQL 细节外泄又保留排查线索。

> 列表查询器暂时用 `Db::name` 而非模型：P5 的验收要求「逐字段一致」，模型查询会附带 `deleted_at IS NULL`（更正确但属行为变化），留到 P6 逐接口验证时再动。

## 六、P6 控制器改造（4 个补丁）

| 补丁 | 文件 | 变化 |
|---|---|---|
| P6a | `api/Auth.php` | 8 处 → `success()/fail()`；登录查询改走 `Admin` 模型（软删除过滤）；`me` 加 `@auth false` |
| P6b | `api/Product.php` | 17 处 → `success()/fail()`；列表用 `ProductService`（P5 DSL）；入参校验交 `ProductValidate`；库存调整走事务模板 |
| P6c | `api/Settings.php` | 4 处 → `success()/fail()`；校验交 `SettingsValidate::validateOrFail()`；删除 `SettingsService::validate()` 旧副本 |
| P6d | `api/{Category,Dashboard,Warning,Log}.php` | 4 处 → `success()/fail()`；`Warning`/`Log` 分页改 `BaseController::paginate()`；`Category`/`Dashboard` 走模型 |

**没有改前端契约**：字段名、`code` 取值、HTTP 状态码全部保持。Product 的 9 个错误路径逐条实测：

```
422 商品名称必填 / 422 SKU 已存在 / 422 状态无效 / 404 商品不存在 /
422 调整数量不能为 0 / 422 请填写调整原因 / 422 库存不能为负数 /
404 商品不存在（PUT/DELETE 不存在 id）
```

**AdminEntry 未改**：它是页面入口控制器（返回 HTML / 503），`return json([` 为 0，不属响应收敛范围。交接文档把它列进 P6 顺序，实测无需改动。

**响应收敛统计**：

| 指标 | 基线 | 现在 |
|---|---|---|
| 业务控制器裸 `return json([` | 34 | **0** |
| 中间件/基类/Handler 内的协议响应 | 2 | 2 + 基类 1 + Handler 1（集中出口，属设计意图） |
| `Session::` 调用 | 23 | 22（库存调整改 `currentAdminId()`；Auth 的会话读写是其职责，保留） |
| `Db::name` 调用 | 43 | 46（P8 的权限判定/扫描用 Db，未转模型） |

## 七、P7 common.php

只放 `now()` 与 `is_blank()`。**无需 `composer dump-autoload`**：TP8 的 `App::load()` 会 `include_once appPath . 'common.php'`，交接文档的这条验收前提不成立（实测直接可用）。

## 八、P8 RBAC 接线（本轮最重的补丁）

### 8.1 发现的结构缺口：缺「角色 → 节点」关联表

交接文档要求按 `admin_id → yc_admin_role → yc_role → yc_rule` 判定，但 S1 建的 RBAC 三表**没有 `yc_role` ↔ `yc_rule` 的关联**——这条链在 role→rule 处断掉，非超管角色无处授权（等于只能有超管一个可用账号）。

处理：新增迁移 `database/migrations/002_rbac_role_rule.sql`（纯新增，`CREATE TABLE IF NOT EXISTS`），补 `yc_role_rule(role_id, rule_id)`，双向 `ON DELETE CASCADE`，并同步更新 `database/schema.sql`（新库口径 9 → 10 表）。

- 执行前已备份：`.backup/yun_cang_before_role_rule.sql`（19,232 字节）
- `php think migrate` 成功，`applied.log` 记录 sha1 `aca686c7…`
- 表注释中文经 `HEX()` 校验正确（`E8A792E889B2…`，即「角色-权限节点」）

### 8.2 新增组件

| 文件 | 职责 |
|---|---|
| `app/support/RuleNode.php` | 节点命名唯一来源：控制器类+方法 → `product/index`；解析 `@auth false` / `@title` 注解 |
| `app/service/PermissionService.php` | `can()` 判定链、`roleIds()`、`hasSuper()`、`grant()`、`bindRole()`、`roleIdByCode()` |
| `app/command/RuleScan.php` | `php think rule:scan`：反射扫描 `app/controller/api/*.php` 的 public 方法 → 写入/更新 `yc_rule`（index 记 menu，其余 action；`@auth false` 跳过；失效节点只报告不删除） |
| `app/command/RuleGrant.php` | `php think rule:grant <role-code> <node[,node…]\|all>`：给角色授权节点 |
| `app/middleware/AdminAuth.php` | 顺序：未登录 401 → 写操作 CSRF 419 → 权限节点 403 |
| `app/command/AdminBootstrap.php` | 创建管理员后 `bindRole(super)`（补 `schema.sql` 只种角色不绑管理员的缺口） |

### 8.3 扫描结果（实测）

17 条节点（`auth/me` 因 `@auth false` 被跳过，计 1）：

```
auth/login, auth/logout, auth/csrf,
category/index, dashboard/index, log/index,
product/{index, show, store, update, delete, adjust_stock, movements},
settings/{index, save, restore_defaults}, warning/index
```

### 8.4 运行时验收（15/15 PASS）

| 用例 | 期望 | 实测 |
|---|---|---|
| 绑定 super 的账号 GET 四个接口 | 200 | 200 |
| 无角色账号 GET `/api/admin/products` | 403 | 403，`{"code":403,"message":"没有操作权限"}`，`Content-Type: application/json` |
| 无角色账号 GET `/api/admin/me` | 200（`@auth false`） | 200 |
| 无角色账号 GET `/api/admin/csrf` | 200（鉴权组外） | 200 |
| 临时角色仅授权 `product/index,product/show` 后 GET products / products/1 | 200 | 200 |
| 同上 GET categories / settings | 403 | 403 |
| 受限账号 POST 无 CSRF | 419（CSRF 先于 403） | 419 |

`AdminBootstrap` 绑定链路单独验证 8/8：`roleIdByCode('super')=1`、`bindRole` 幂等、绑定前后 `isSuper` 翻转、超管 `can()` 对未登记节点也放行。

### 8.5 冒烟脚本的必要改动

RBAC 上线后，冒烟脚本用 SQL 直接建的临时管理员**没有角色**，会被 403 打死。已给 `.backup/s1-smoke.ps1`、`.backup/route-smoke.ps1` 各加一条 `INSERT IGNORE … yc_admin_role … code='super'`（删账号时 `yc_admin_role` 级联清理）。这是「临时账号在 RBAC 下必须同时建角色绑定」的必然结果，不是放宽断言。

### 8.6 防自锁

- 真实账号 `songxian` 已由迁移 001 绑定 super，本轮未动
- 超管判定只看 `yc_role.code='super'`，**不看 `yc_rule` 是否有节点**，即使节点表为空也不会自锁
- 演示顺序：先 `rule:scan`，再给非超管角色 `rule:grant`

## 九、P9 PHPStan（未完成，环境阻塞）

`composer require --dev phpstan/phpstan phpstan/extension-installer thinkphp/phpstan-thinkphp` 失败：

```
curl error 28 while downloading https://packagist.org/providers/thinkphp/phpstan-thinkphp.json:
Failed to connect to packagist.org port 443 after 10010 ms: Timeout
```

排查结论（本机所有出网路径都断）：

- `packagist.org:443` 连接超时
- 已配置的腾讯云镜像 `mirrors.cloud.tencent.com:443`：TCP 可连（`Test-NetConnection` 为 True）、DNS 正常，但 **TLS 握手失败**（`The SSL connection could not be established`，`-SkipCertificateCheck` 也无效）
- 本机 Composer 缓存只有 22 个历史文件、无 phpstan 包归档；全盘无 `phpstan.phar`

已就绪的部分：`phpstan.neon`（level 7、`phpVersion: 80100`、paths `app/config/route`）、`composer.json` 的 `stan` 脚本。网络恢复后两条命令即可跑：

```powershell
cd D:\software\yun_cang
composer require --dev phpstan/phpstan phpstan/extension-installer thinkphp/phpstan-thinkphp
composer stan
```

替代静态检查（已执行，全部通过）：51 个 PHP 文件 `php -l` 0 错误；40 个 `app/` 下类/接口/特性全部可加载反射（脚本 `.backup/s2-static-gate.php`）。**这不是 level 7 的类型检查，不能替代 P9 结论。**

## 十、验证汇总

| 项 | 结果 |
|---|---|
| 结构校验 `validate-project.js` | ✅ 通过（83 个文本文件，仅 `resources/admin/index.html` 历史差异） |
| 生成器测试 | ✅ 50 条 / 49 通过 / 1 跳过 / 0 失败 |
| 路由回归 `route-smoke.ps1` | ✅ 25/25 |
| S1 冒烟 `s1-smoke.ps1` | ✅ 15/15 |
| 前端构建 `npm run build` | ✅ 通过（31.43s） |
| `php -l` 全量 | ✅ 51 文件 0 错误 |
| 未匹配 API | ✅ `/api/admin/nope`、`/api/nope` → JSON 404 |
| 异常接口 | ✅ → JSON 500（`{"code":500,"message":"服务器内部错误"}`） |
| 业务控制器裸 `json([` | ✅ 0 |
| RBAC 运行时 | ✅ 15/15 |
| PHPStan level 7 | ❌ 环境无外网，未执行 |

**数据面终态**：`admins 1、role 1、admin_role 1、rule 17、role_rule 0、categories 6、products 2、settings 8、logs 22、movements 0`；库存 5/20 未变；`yc_settings` 走 `mysqldump --replace` 快照还原；探针账号/角色全部清理（残留 0）。

> **归档载体说明**：本轮 Hindsight 记忆库两次尝试均不可用——第一次 `Connect Timeout`（`api.hindsight.vectorize.io:443`），第二次 `401 Authentication failed: API key required`（未配置 token）。按交接文档第六节的约定，归档一律写仓库内 markdown（即本文）。待记忆库可用时，可用 `hindsight_ingest_document` 把本文要点补录进去。

## 十一、教训

1. **交接文档也会带错版本约定**：`exception_handle` 是 TP5 的键，照抄会静默失效（表现还是 HTML 500）。遇到「配了但不生效」，先 grep 框架确认这个键真的被读。
2. **TP8 的错误页会掩盖真实异常**：`json()` 传错参数类型时，得到的是空白 500 HTML；靠「引导框架 + 直接调用 Handler」的探针脚本才拿到 `TypeError` 堆栈。凡看到 500 无信息，先怀疑错误渲染链。
3. **迁移与删除要分补丁**：先写新实现、用旧实现做逐条对照（P4 的 23/23），确认一致后再删旧副本（P6c）。一次做完就没法证明行为没变。
4. **抽象类验收**：文档写「可 new」时，先看是不是抽象类；用匿名子类做反射断言即可，不必为此把基类改成可实例化。
5. **RBAC 上线顺序决定会不会自锁**：先绑 super（迁移 001 已做）→ 再开校验 → 最后给非超管授权；冒烟脚本的临时账号必须同时建角色绑定。
6. **软删除不是「加上字段就完事」**：唯一索引（`uk_products_sku`）与软删除天然冲突，需要单独设计；本轮据此保留商品物理删除并写明原因。

## 十二、下一步（S3 前端公共层）

1. 拆 `api.js` → `utils/request.js` + `api/*.api.js`；`code!==0`/401 处理归一到 request
2. `constants/enums.js`：`PRODUCT_STATUS` 三件套，替换 `Products.vue` 里的字面量与 `statusLabel()`
3. `styles/tokens.css` + 表单控件统一 `class="ctrl"`（根治 UI 第 8 类问题）
4. `components/`（PageHeader/DataTable/PaginationBar/StatusTag）、`composables/`（useTable/useForm/useDialog）、`layouts/AdminLayout.vue`
5. `views/<模块>/` 内聚改造

S5 需要并入骨架的 S2 成果（提示）：`app/BaseController.php`、`app/common.php`、`app/provider.php`、`app/exception/{ApiException,Handler}.php`、`app/support/{ApiCode,RuleNode}.php`、`app/model/*`、`app/validate/*`、`app/service/{BaseService,ProductService,PermissionService}.php`、`app/command/{RuleScan,RuleGrant}.php`、`database/migrations/002_rbac_role_rule.sql`、`phpstan.neon`、`composer.json` 的 `stan` 脚本。

## 十三、安全与凭据

- 未改动 `.env`；未开过 `APP_DEBUG`
- 本轮新增备份：`.backup/yun_cang_before_role_rule.sql`（工具仓库，`.backup/` 已 gitignore）
- 探针临时数据全部清理：`rbac_super`/`rbac_norole`/`probe_bootstrap` 账号、`probe_viewer` 角色、`role_rule` 授权行（实测残留 0）
- `.backup/*.ps1` 仍含本机 root 密码（S1 遗留问题），S4 迁到 `scripts/` 时应改为从 `.env` 读凭据
