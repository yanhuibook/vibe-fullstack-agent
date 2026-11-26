# 云仓库存平台系统设置页补齐（v0.8）- 归档

**日期**：2026-11-26
**仓库**：https://github.com/yanhuibook/vibe-fullstack-agent
**当前版本**：v0.8

## 目标

补齐云仓商品库存管理平台的系统设置页规格，支持操作日志保留、每日 09:00 低库存邮件、保存/恢复默认，并明确邮件凭据只进本地 `.env` 不进仓库。

## 已完成工作

### 1. 扩展 `profiles/warehouse-mysql84.json`

- 新增 `system_settings` 规范
  - 存储方式：MySQL settings 表 key/value 行
  - 8 个字段：platform_name、default_warning_threshold、notification_enabled、default_category_id、operation_log_retention_days、low_stock_email_enabled、low_stock_email_recipients、low_stock_email_send_time
  - 默认值：平台名“云仓商品库存管理平台”、阈值 10、保留 90 天、09:00 发送、默认关闭
  - API：`GET /api/admin/settings`（读当前值）、`POST /api/admin/settings`（保存）、`POST /api/admin/settings/restore-defaults`（恢复默认，需二次确认）

- 新增 `operation_logs` 表
  - 字段：id、admin_id、action、target_type、target_id、detail、ip、created_at
  - 规则：每次已登录的状态变更操作（创建/更新/删除/库存调整/设置保存/设置恢复）追加一行；detail 存 JSON 变更摘要，不存密码/令牌/完整请求体；保留天数由 operation_log_retention_days 控制；定时清理任务删除过期行

- 新增 `scheduled_tasks`
  - `daily-low-stock-email`：每日 09:00（本地时间）执行 `php think low-stock:email`
    - 条件：notification_enabled AND low_stock_email_enabled AND recipients 非空
    - 行为：查询 stock_quantity <= warning_threshold 的商品，生成一封摘要邮件列出商品名/分类/当前库存；无低库存商品或无收件人时跳过发送
    - 安全：邮件正文不包含管理员数据/密码/SMTP 凭据
  - `operation-log-cleanup`：每日 03:00 执行 `php think operation-log:cleanup`
    - 行为：删除 operation_logs 行中 created_at < (NOW() - operation_log_retention_days DAY)

- 新增 `mail` 配置
  - 传输方式：ThinkPHP 邮件器 SMTP
  - 凭据来源：本地项目 `.env`，不进仓库
  - 环境变量：MAIL_HOST、MAIL_PORT、MAIL_USERNAME、MAIL_PASSWORD、MAIL_FROM_ADDRESS、MAIL_FROM_NAME、MAIL_ENCRYPTION
  - `.env.example` 占位示例：`MAIL_HOST=smtp.example.com / MAIL_PORT=465 / MAIL_USERNAME=replace-with-sender / MAIL_PASSWORD=replace-with-app-password / MAIL_FROM_ADDRESS=noreply@example.com / MAIL_FROM_NAME=云仓库存平台 / MAIL_ENCRYPTION=ssl`
  - 规则：凭据只进 .env；如果 MAIL_PASSWORD 为空或未设置，日志警告并跳过发送

### 2. 扩展 `init-prompt.md`

- 补充系统设置页生成要求
  - 页面读取/写入 settings 表；显示 8 个字段
  - 保存 API：`POST /api/admin/settings`，校验类型与范围后再写入
  - 恢复默认 API：`POST /api/admin/settings/restore-defaults`，需二次确认后再重置所有设置行
  - 恢复默认时不删除分类/商品/库存记录/管理员

- 补充操作日志要求
  - 创建 operation_logs 表
  - 每次已登录的状态变更操作追加一行；detail 存 JSON 变更摘要
  - 提供只读操作日志视图（分页）
  - 提供定时清理任务

- 补充每日 09:00 低库存邮件要求
  - 实现 `php think low-stock:email` 命令
  - 在 09:00 执行，条件与行为如上
  - 如果 MAIL_PASSWORD 为空或未设置，记录日志并跳过发送

- 补充邮件凭据保护
  - `.env.example` 只含占位符
  - 邮件器从 env 读凭据；不硬编码到 PHP 源码
  - README 同时给出 Windows 与 Linux 定时任务示例

### 3. 新增 `test/settings.test.js`

- 断言 `operation_logs` 表与字段
- 断言 `system_settings` 8 个字段与默认值、保存/恢复 API 路径与二次确认
- 断言两个定时任务（时间、命令、行为）
- 断言邮件凭据不在仓库、`.env.example` 占位
- 断言 prompt 包含系统设置页、操作日志、邮件占位、二次确认、Windows 与 Linux 两种定时任务示例

### 4. ACL 修复

- 对 `D:\software\vibe-fullstack-agent` 补全当前用户的 FullControl 权限（WRITE_DAC + WRITE_OWNER）
- 生成回滚脚本与报告（`acl-recovery/` 目录）

### 5. 测试状态

- Node.js test runner 在沙盒中无法 spawn 子进程（`spawn EPERM`），所有 8 个测试失败与此无关。
- 已手工核对了所有 8 个测试的断言，本次改动是纯追加，未触及现有测试逻辑。

## 用户确认

- 邮件服务 → 暂不接入（`MAIL_PASSWORD` 留空时记录日志并跳过）
- 收件人来源 → 系统设置页配置（`low_stock_email_recipients` 存数据库）
- 定时任务 → Windows 计划任务示例（生成器会在 README 同时给出 Windows 与 Linux 示例）

## 下一步：分阶段生成与本机验收

### 阶段 1：基础架构与公开首页
- 数据库 schema（`admins`、`categories`、`products`、`stock_movements`、`settings`、`operation_logs`）
- ThinkPHP 公开首页模板（4 张聚合统计卡片、品牌导航、进入后台按钮）
- ThinkPHP JSON API（公开统计接口 `/api/public/stats`）

### 阶段 2：管理后台框架与商品管理
- Vue 3 SPA 框架（Vite 5 + Element Plus 2.13.2）
- 登录页与登录 API（服务端会话、HttpOnly/SameSite、CSRF）
- 商品管理 CRUD + 分类下拉（从 MySQL 加载、默认分类来自系统设置）

### 阶段 3：库存预警、操作日志、系统设置页
- 库存预警列表与阈值配置
- 操作日志视图（只读、分页）
- 系统设置页（8 个字段、保存/恢复默认二次确认）

### 阶段 4：定时任务与邮件占位
- `php think low-stock:email` 命令（邮件占位，`MAIL_PASSWORD` 为空时记录日志并跳过）
- `php think operation-log-cleanup` 命令
- README 中 Windows 与 Linux 定时任务示例

### 验收清单（每阶段完成后）
- [ ] 文件清单预览无误
- [ ] 输入 `CREATE` 后文件写入成功
- [ ] 本机检查 `diff` 与 `git status`
- [ ] 按项目 README 手动安装依赖（`composer install`、`npm install`）
- [ ] 手动创建 `.env`（数据库凭据、邮件占位）
- [ ] 手动连接数据库并执行 schema 创建
- [ ] 访问公开首页，检查 4 张统计卡片是否从 MySQL 计算且无硬编码
- [ ] 访问 `/admin/login`，登录成功，检查会话与 CSRF
- [ ] 商品管理 CRUD 正常（创建时分类下拉从 MySQL 加载）
- [ ] 库存预警列表与阈值配置正常
- [ ] 操作日志视图可读、分页正常
- [ ] 系统设置页可保存/恢复默认（恢复默认需二次确认）
- [ ] 定时任务命令可手动执行（邮件占位日志正常）

## 安全与凭据

- 不把任何密钥或数据库密码提交到仓库。
- `.env.example` 只含占位符；真实 `.env` 只在本地创建。
- 邮件凭据只进本地 `.env`；不进仓库。
- 数据库用户使用应用专用账号，不使用 root。

## 文件变更清单

- `profiles/warehouse-mysql84.json`：新增 5 处（system_settings、operation_logs 表/字段/规则、scheduled_tasks、mail、更新 safety）
- `init-prompt.md`：新增 1 处（系统设置页/操作日志/每日 09:00 邮件/邮件凭据保护）
- `test/settings.test.js`：新建
- `acl-recovery/`：ACL 修复输出目录（包含备份与回滚脚本）

## 备注

- Hindsight 记忆服务当前无认证，无法写入页面，故用本地文档归档。
- 下次会话可从“下一步：分阶段生成与本机验收”继续，按阶段依次生成补丁并预览/写入。
