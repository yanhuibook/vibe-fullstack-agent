# 架构治理 S1 数据库治理 + 路由缺陷修复 - 归档

**日期**：2026-11-27
**仓库**：https://github.com/yanhuibook/vibe-fullstack-agent
**版本**：v0.8
**关联**：[ARCHITECTURE-PLAN-2026-11-27.md](ARCHITECTURE-PLAN-2026-11-27.md)（S1–S5 计划）· [HINDSIGHT-ARCHIVE-2026-11-27-INIT-MODE-FIX.md](HINDSIGHT-ARCHIVE-2026-11-27-INIT-MODE-FIX.md)（首次生成与 8 类故障）

## 本轮总览

按架构治理计划执行 **S1（数据库治理）**，并在验收冒烟中暴露并修掉一个**路由优先级缺陷**（连带一个被它遮住的类名解析缺陷）。成果同步回生成器骨架与校验。

| 阶段 | 结果 |
|---|---|
| S1 数据库治理 | 6 表加 `yc_` 前缀、主键升 `BIGINT UNSIGNED`、补 `deleted_at`、`products.status` 由 ENUM 改 `VARCHAR(20)`、新增 RBAC 三表（共 9 表）、引入 `database/migrations` + `php think migrate` |
| 数据安全 | 迁移前备份；先在临时库 `yun_cang_s1_rehearsal` 预演；真库首次执行失败后从备份还原重跑，**数据零丢失** |
| 路由缺陷修复 | `api/admin` 分组加 `->completeMatch()`；`Product::adjustStock()` 修掉漏前导反斜杠的 `think\facade\Session` |
| 生成器加固 | 骨架补 `config/database.php`（prefix `yc_`，14 → 15 个骨架文件）；新增 3 条校验规则；测试 45 → 50 条 |
| 验收 | S1 冒烟 15/15；路由回归 25/25；结构校验通过；数据面与设置表指纹已还原 |

数据面终态：`admins 1、categories 6、products 2（库存 5/20）、settings 8、operation_logs 22、stock_movements 0、yc_role 1、yc_rule 0、yc_admin_role 1`。

## 一、S1 数据库治理

### 1.1 决策

三项决策用户未另行指示，按计划默认值执行，并在日志中注明：

| # | 决策 | 采用值 |
|---|---|---|
| D1 | 表前缀 | `yc_` |
| D2 | 架构形态 | 单应用分层（S2 落地） |
| D3 | 权限模型 | 现在就建 RBAC 三表；权限校验与节点扫描后置到 S2 |

### 1.2 动作

| 文件 | 改动 |
|---|---|
| `yun_cang/database/migrations/001_prefix_and_schema_upgrade.sql` | `RENAME TABLE` 6 表加前缀；主键与外键列统一 `BIGINT UNSIGNED`；各表补 `deleted_at`（另补 `settings.created_at`、`stock_movements`/`operation_logs.updated_at`）；`products.status` ENUM→`VARCHAR(20)`（保留原值）；新增 `yc_role`/`yc_rule`/`yc_admin_role`；重建 6 个外键；种子「超级管理员」角色并绑定升级前已有管理员 |
| `yun_cang/app/command/Migrate.php` | `php think migrate`：按文件名顺序执行 `database/migrations/*.sql`，已应用记录追加到 `applied.log`（文件名 + sha1 + 时间） |
| `yun_cang/config/console.php` | 注册 `migrate` 命令 |
| `yun_cang/config/database.php` | `'prefix' => 'yc_'` |
| `yun_cang/database/schema.sql` | 重写为最终结构（9 表、前缀、BIGINT、`deleted_at`、VARCHAR 状态、RBAC），仅用于**新建库** |
| `src/skeleton.js` | 新增 `config/database.php` 骨架（`prefix` 写死 `yc_`）+ 校验「缺失或 prefix 不是 `yc_` 即拒绝」 |

### 1.3 关键判断

1. **先预演再动真库**：用 `mysqldump` 还原到临时库跑完整迁移，确认 DDL、数据、中文均正常后才对 `yun_cang` 执行。
2. **查询代码零改动**：`JoinAndViewQuery.php:127` 的 `getJoinTable()` 在带别名（`'categories c'`）时同样拼 prefix，所以 `Db::name()`、`leftJoin()` 都不用改。已用登录后的 8 个接口实测确认。
3. **命令行查表必须手写前缀**：`mysql -e "SELECT * FROM yc_products"`；前缀只在应用层自动加。

### 1.4 真库首次执行失败与恢复

- **现象**：第 14 条语句 `ALTER TABLE yc_stock_movements DROP INDEX fk_movements_admin` 报 `1091 Can't DROP 'fk_movements_admin'`。
- **根因**：外键索引来源不同——直接升级的库上 InnoDB 隐式索引会随外键一并消失；而预演库由 `mysqldump` 还原，索引导出成了显式索引才保留。环境差异被预演掩盖。
- **处理**：去掉该语句（只补建规范命名的 `idx_movements_admin`，旧名是否残留不影响正确性），从备份还原后重跑成功；还原库残留的冗余索引手工 `DROP`，最终结构与 `schema.sql` **逐列/逐索引/逐外键比对 0 差异**。
- **结论**：DDL 无事务，失败后「还原 → 修正 → 重跑」是唯一可靠路径，备份是硬前提。

### 1.5 验收

- `php think migrate` 成功，`applied.log` 记录 sha1。
- 9 张表全部 `yc_` 前缀；`information_schema` 核对：主键均 `bigint unsigned`、软删除字段齐全、`status` 为 `varchar(20)`、6 个外键齐全。
- 登录 + 8 个接口 + 首页 + 后台入口共 15 项冒烟全 PASS（含无 CSRF 写 419、带 CSRF 写 200）。

## 二、路由优先级缺陷（S1 验收时暴露）

### 2.1 现象

- `POST /api/admin/products/1/stock` 返回 `422 商品名称必填` → 后台「库存调整」完全不可用。
- `GET /api/admin/products/1` 返回**列表**而不是单条；`GET /api/admin/products/1/movements`、`POST /api/admin/settings/restore-defaults` 同样被父规则截走。
- 页面不报错，只有操作后才失败，属「静默错路由」。

### 2.2 根因（两处叠加，第二处被第一处遮住）

1. `route/app.php` 把 `products`、`settings` 规则注册在子路径规则之前；ThinkPHP `route_complete_match` 默认 `false`（`Route.php:64`），规则按**前缀**匹配 → `products/1/stock` 命中 `products` 进 `Product::store()`。
2. 路由修好后 `Product::adjustStock()` 仍 500：`Product.php:130` 写的是 `think\facade\Session::get()`，文件在 `namespace app\controller\api` 且无 `use think\facade\Session;`，被解析成 `app\controller\api\think\facade\Session` → `Class not found`。该分支此前不可达，故从未暴露。

### 2.3 修复

| 文件 | 改动 |
|---|---|
| `yun_cang/route/app.php` | `api/admin` 分组加 `->completeMatch()`（`RuleGroup.php:335` 会把分组选项下发给子规则），仅约束该组，比改全局 `route_complete_match` 影响面小 |
| `yun_cang/app/controller/api/Product.php` | 补 `use think\facade\Session;`，第 130 行改 `Session::get('admin_id', 0)` |

### 2.4 验证

新增回归脚本（工具仓库 `.backup/route-smoke.ps1`），25 项真实 HTTP 请求全 PASS：

- 公开页 `/`、`/help`、`/contact`；SPA 通配 `/admin/dashboard` 200（通配生效）
- 列表与详情形态区分：`/products` 返回 `data.list`，`/products/1` 返回单条 `sku=00001`
- `/products/999999` → 404；`/products/1/extra` 不再命中业务规则
- 库存 `+1`/`-1` 真实生效且回滚，`movements` 2 条；创建 / 修改 / 删除 / 删除后 404
- `settings/restore-defaults` 真正命中恢复逻辑；6 个只读接口 200

### 2.5 诊断中踩的坑

TP 错误页模板在 PHP 8.3 下对 `null` 调 `htmlentities()` 触发弃用告警，又被自己的异常处理器转成 `ErrorException`，把**原始异常**盖掉（表现为空白 500）。只能临时把 `.env` 的 `APP_DEBUG` 置 true 才拿到真实堆栈；`.env` 已按哈希校验还原。**教训：看到 500 但没有信息时，先怀疑错误渲染链本身。**

## 三、生成器侧加固

避免下一个项目重犯这两类缺陷：

| 校验 | 触发条件 |
|---|---|
| 表前缀 | `config/database.php` 缺失，或 `prefix` 不是 `yc_` |
| 路由完整匹配 | `api/admin` 分组缺 `->completeMatch()`（前缀匹配会吞子路径） |
| 类名解析 | `app/` 下出现漏前导反斜杠的 `think\...::` 引用 |

- `src/skeleton.js`：新增 `config/database.php` 骨架，骨架文件 14 → 15；校验规则 9 → 12 类。
- `test/skeleton.test.js`：13 → 15 条（前缀正反例、`completeMatch` 反例、漏反斜杠反例 + 带反斜杠不误报正例）。
- 全量测试 45 → 50 条（49 通过，1 条 git 集成在沙箱内跳过）。

## 四、过程中发生的数据事故与修复（如实记录）

**设置表被写坏**：第一版回归脚本用「命令行读设置 → 拼 SQL 写回」还原数据，中文经 PowerShell 控制台编码往返变成 `???`，`platform_name` 被写成 14 个问号；同时 `restore-defaults` 用例把 `default_category_id/threshold/retention` 改成默认值（2→1、5→10、70→90）。

- **修复**：按迁移前备份原值写 UTF-8 SQL 文件导入还原（`2 / 5 / 70 / 云仓商品库存管理平台`），`updated_at` 一并还原；用 `HEX()` 校验中文为正确 UTF-8（`E4BA91…`）。
- **加固**：脚本改为 `mysqldump --replace` 二进制快照 + 原样 REPLACE 回写，并加「运行前后设置表指纹一致」自检；S1 冒烟的写路径换成库存调整，彻底不碰设置。
- **另**：探针脚本残留 1 个临时账号与 1 次 `+1` 库存，已删除账号并把库存改回 5；S1 脚本的「诊断探针」已移除，清理逻辑改为逐条 try/catch 且自检库存回滚。

## 五、风险与教训

| 风险 | 已落地对策 |
|---|---|
| 改前缀/改表结构不可回滚 | 备份 + 临时库预演 + 失败后「还原→修正→重跑」 |
| 软删除引入后旧查询漏过滤 | 字段已加；`BaseModel` 统一 scope 在 S2 |
| 前缀匹配导致的静默错路由 | 分组 `completeMatch()` + 生成器校验 + 25 项回归脚本 |
| 测试脚本污染业务数据 | 只用 id 水位与临时账号；设置用二进制快照还原；结束自检残留 |
| 用控制台文本搬运数据 | 禁止；中文/特殊字符一律走 UTF-8 SQL 文件或 `mysqldump` |

## 六、下一步（S2 后端公共层）✅ 已于同日执行

> 本节四项已全部落地，执行记录见 [HINDSIGHT-ARCHIVE-2026-11-27-S2.md](HINDSIGHT-ARCHIVE-2026-11-27-S2.md)：
>
> 1. ✅ `support/ApiCode`、`exception/{ApiException,Handler}`、`BaseController`、`BaseModel`、`BaseService`、`validate/` 基类
> 2. ✅ RBAC 节点扫描与鉴权校验（`rule:scan` / `rule:grant` / `AdminAuth` 403），`yc_rule` 已有 17 条节点；**并补上了本节未预见的缺口**：三表缺「角色→节点」关联，用迁移 002 补 `yc_role_rule`
> 3. ✅ 控制器裸 `json([...])` 由 34 处收敛为 0；⚠️ PHPStan level 7 **未跑**（本机无外网），配置已就绪
> 4. ✅ 未匹配 API 路径统一为 JSON 404（`/api/admin/nope` → `{"code":404,"message":"接口不存在"}`）
>
> 原始待办（保留供对照）：
>
> 1. `support/ApiCode`、`exception/{ApiException,Handler}`、`BaseController`、`BaseModel`、`BaseService`、`validate/` 基类。
> 2. RBAC 节点扫描与鉴权校验（承接 D3），`yc_rule` 节点表开始有数据。
> 3. PHPStan level 7 + `phpstan-thinkphp` 闸门；控制器裸 `json([...])` 收敛。
> 4. **未匹配 API 路径统一为 JSON 404**：目前 `/api/admin/nope` 会落到默认控制器解析并抛 `Class not found`，渲染成 HTML 500；由 S2 的 `Handler` 统一。

## 七、安全与凭据

- 未改动 `.env` 中的数据库凭据；诊断期间临时开过 `APP_DEBUG=true`，已按哈希校验还原为 `false`。
- 迁移前备份在工具仓库 `.backup/`（已加入 `.gitignore`），另有一份用户自助备份。
- 临时测试账号（`smoke_s1`、`route_smoke`、`probe_*`）全部清理，当前仅保留 `songxian`。
- 所有写操作均在工作区外项目目录，按会话策略逐次申请了 `danger-full-access` 授权。

## 八、文档

- 新增：本归档。
- 更新：`dev_log.md`（第七、第八阶段）、`project_steps.md`（阶段 H、P0 第 6 项）、`RUNBOOK-yun_cang.md`（6.7、6.8、6.9、步骤 4、日常维护）、`README.md`（骨架表、校验清单、测试数）、`src/skeleton.js`、`test/skeleton.test.js`。
- 关联：`ARCHITECTURE-PLAN-2026-11-27.md`（S1 已执行，S2–S5 待做）；S2 已于同日执行完毕，见 [HINDSIGHT-ARCHIVE-2026-11-27-S2.md](HINDSIGHT-ARCHIVE-2026-11-27-S2.md)。
