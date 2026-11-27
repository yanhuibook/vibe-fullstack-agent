# 初始化模式联调修复 + 云仓项目首次生成 - 归档

**日期**：2026-11-27
**仓库**：https://github.com/yanhuibook/vibe-fullstack-agent
**版本**：v0.8
**关联**：[HINDSIGHT-ARCHIVE-2026-11-26-SYSTEM-SETTINGS.md](HINDSIGHT-ARCHIVE-2026-11-26-SYSTEM-SETTINGS.md)

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

> **状态（2026-11-27 补记）**：下列第 1、2 项已补齐并验证，第 3-5 项仍待处理。

1. ~~**缺根目录 `think` 入口文件**~~ —— **已补**。内容为 ThinkPHP 8 标准控制台入口（`namespace think;` + `require vendor/autoload.php` + `(new App())->console->run()`），`php -l` 校验无语法错误。注意：`vendor/` 由 `composer install` 生成，在此之前 `php think` 仍会因缺少 autoload 而失败，属预期。
2. ~~**缺 `.gitignore`**~~ —— **已补**。覆盖 `/.env`、`/vendor/`、`/node_modules/`、`/public/admin/node_modules/`、`/public/admin/dist/`、`/runtime/`、`*.log` 及编辑器/系统文件。

3. **文档漂移**（无害）：生成项目 README 的目录结构写了 `app/model/`、`app/validate/`、`template/`，实际未生成。

4. **路由待验证**：`route/app.php:11` 的 `Route::get('/admin/<path>')->pattern(['path' => '.*'])` 多段通配在 ThinkPHP 8 上未必生效。表征是后台子页面按 F5 刷新 404。

5. **`/api/public/stats` 未实现**：规格要求的公开统计由 ThinkPHP 模板在渲染时聚合，已满足“实时聚合”要求；但 11-26 归档阶段 1 曾计划独立公开统计接口，本次未生成，需决定是否补。

## 五、下一步：yun_cang 本机落地验收

在 `D:\software\yun_cang` 依次执行（顺序不可颠倒）：

1. 补 `think` 入口与 `.gitignore`
2. `composer install`
3. `cp .env.example .env`，填 `DB_PASSWORD`；`MAIL_*` 可先留占位
4. root 建库 `yun_cang` 与专用账号 `yun_cang_app`，再 `mysql -u yun_cang_app -p yun_cang < database/schema.sql`
5. `php think admin:bootstrap` 创建首个管理员
6. `cd public/admin && npm install && npm run build`
7. `php think run` → 公开页 `http://127.0.0.1:8000/`，后台 `/admin/login`

## 六、安全与凭据

- 生成只写入 `D:\software\yun_cang`，未连接数据库、未安装依赖、未运行任何生成物。
- 数据库凭据与 API Key 均未传给模型；`.env.example` 仅占位。
- 本次生成的模型调用使用 DeepSeek（用量报告显示官方单价），非此前表现较弱的 Qwen3-Coder-30B。
