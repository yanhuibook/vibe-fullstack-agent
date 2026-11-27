# 云仓项目落地验收清单

**最后更新**：2026-11-27
**对应归档**：[HINDSIGHT-ARCHIVE-2026-11-27-INIT-MODE-FIX.md](HINDSIGHT-ARCHIVE-2026-11-27-INIT-MODE-FIX.md)
**配套手册**：[RUNBOOK-yun_cang.md](RUNBOOK-yun_cang.md)（逐步命令、预期输出、报错对照表）

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
- [ ] 修正生成项目 README 的目录结构描述（`app/model/`、`app/validate/`、`template/` 未生成）

## 阶段 D：本机安装与建库

- [ ] `composer install`
- [ ] 复制 `.env.example` 为 `.env`，填写 `DB_PASSWORD`（`MAIL_*` 可先留占位）
- [ ] root 创建数据库 `yun_cang` 与专用账号 `yun_cang_app`（不使用 root 连接）
- [ ] `mysql -u yun_cang_app -p yun_cang < database/schema.sql`
- [ ] `php think admin:bootstrap` 创建首个管理员（密码不回显、仅存哈希）

## 阶段 E：前端构建与启动

- [ ] `cd public/admin && npm install`
- [ ] `npm run build`（产物到 `public/admin/dist`）
- [ ] `php think run` 启动
- [ ] 访问 `http://127.0.0.1:8000/`，确认 4 张统计卡片来自 MySQL、无硬编码
- [ ] 访问 `/admin/login` 登录成功，确认会话与 `X-CSRF-Token` 生效
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

---

## 待决策事项

1. 是否让工具自动补齐 `think` 与 `.gitignore`（生成器侧可加入固定骨架文件）
2. 是否补 `/api/public/stats` 公开统计接口
3. 生成项目的 `MailService` 需选定 SMTP 库（如 PHPMailer）后自行实现发送逻辑
