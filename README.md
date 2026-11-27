# Vibe 全栈开发助手原型 0.8

一个本地 CLI 原型，包含已有项目补丁模式和新项目初始化模式：前者需输入 `APPLY` 才应用补丁，后者需输入 `CREATE` 才写入新目录。它调用 OpenAI-compatible Chat Completions 接口生成内容，不会自动运行测试、数据库操作或 shell 命令。

## 环境

- Node.js 20 或更高版本
- Git（应用补丁时使用）
- VS Code（编辑本项目和查看终端输出）
- 一个兼容 Chat Completions 的模型服务及其 API 凭据

## 在 VS Code 中启动

1. 解压项目并在 VS Code 选择 **File → Open Folder** 打开 `vibe-fullstack-agent`。
2. 在 VS Code 终端运行：

   ```bash
   npm test
   ```

3. 复制 `.env.example` 为 `.env`，填写模型服务地址、模型名和 API Key。不要把 `.env` 提交到 Git。
4. 先用演示模式检查启动：

   ```bash
   npm start -- --project /绝对路径/到/你的项目 --demo
   ```

5. 生成真实计划和补丁：

   ```bash
   npm start -- --project /绝对路径/到/你的项目
   ```

   Windows PowerShell 示例：

   ```powershell
   npm start -- --project "C:\\path\\to\\your\\project" --demo
   ```

   移除 `--demo` 即使用模型。首次建议指向一个可丢弃的 Git 测试项目。

## 原型边界

- 默认加载 `profiles/php-fullstack.json`；Python 配置尚未添加。
- 只把项目清单、少量根目录说明/依赖文件和用户指定的文件内容交给模型。
- 排除 `.env`、密钥文件、依赖目录、生成目录和 lock 文件。
- 补丁只能新增或修改项目内的文本文件；不支持删除、重命名、二进制补丁或依赖变更。
- 用户必须审阅计划和 diff，并输入大写 `APPLY` 才会修改文件。
- 测试、构建、安装依赖和部署均由用户在 VS Code 终端手动执行。
- 提示词不是安全边界；不要在没有文件系统隔离的环境中运行不可信代码。此原型不执行模型生成的 shell 命令。

## 管理员账号与注册策略

- 管理后台需要登录；公开网站页面不要求登录。
- 不生成自助注册页面、路由或 API；管理员账号通过一次性本地初始化流程创建。
- 不生成默认管理员账号或密码。管理员密码应只在本地输入，并使用 PHP `password_hash` 存储哈希。
- 管理后台使用服务端会话；商品与库存 API 需要登录，并保护修改操作。
- 生成器不会执行初始化命令；请先审阅项目内 README，再在本机操作。

## 配置

`.env` 示例：

```dotenv
VIBE_BASE_URL=https://api.deepseek.com
VIBE_MODEL=deepseek-flash
VIBE_API_KEY=你的DeepSeek_API密钥
VIBE_MAX_OUTPUT_TOKENS=32000
VIBE_THINKING=disabled
```

如使用其他供应商，应填写其 OpenAI-compatible API 根地址，并确认是否支持 `max_tokens` 和 `thinking` 字段；不支持 `thinking` 时删除 `VIBE_THINKING`。`VIBE_MAX_OUTPUT_TOKENS` 限制单次响应输出 token，默认 32000，可设置为 1024–65536；达到上限时 JSON 可能截断。每次模型调用结束后，CLI 会显示输入/输出 token 和 DeepSeek Flash/V4 Pro 的高峰、非高峰费用估算。费用估算基于程序内置价格表，不是美元消费硬上限，价格变化后需更新程序。

## 新建云仓商品库存管理项目（原型 0.8）

配置好 `.env` 后，在 VS Code 终端运行：

```bash
npm start -- --init ../yun-cang
```

该模式使用 `profiles/warehouse-mysql84.json` 作为固定需求，生成 ThinkPHP 模板公开站 + ThinkPHP JSON API + Vue 3/Vite 5/Element Plus 2.13.2 管理后台 + MySQL 8.4 的商品库存管理项目文件。它只接受新目录或空目录，预览文件列表后必须输入 `CREATE` 才写入。

> **命令行注意（三种写法实测）：** 分隔符 `--` 必须写，`--init` 前面的写法则两种都行。
>
> | 命令 | 结果 |
> |---|---|
> | `npm start -- --init ../yun-cang` | ✅ 正常 |
> | `npm start -- -- init ../yun-cang` | ✅ 正常（程序同时识别裸 `init`） |
> | `npm start --init ../yun-cang` | ❌ npm 报 `EUNKNOWNCONFIG: Unknown cli flag: --init` |
>
> 省掉 `--` 分隔符时，`--init` 会被 npm 当作自己的配置项而拒绝。另外不同 npm 版本/终端对多余 `--` 的处理不一致（有时保留在 argv 里、有时被丢弃），程序对两种 argv 形态都做了兼容。

> **生成之后怎么跑起来**：见 [RUNBOOK-yun_cang.md](RUNBOOK-yun_cang.md)。其中记录了本机环境基线（PHP 8.3.28 / Composer / MySQL 8.4.7 / Node 22）、七步初始化命令、常见报错对照表和定时任务配置，避免下次使用时漏步骤。

公开首页由 ThinkPHP 模板渲染，展示平台介绍、核心功能、来自 MySQL 的真实聚合统计卡片和“进入管理后台”按钮（跳转 `/admin/login`）；统计卡片为商品总数、商品分类、在售商品、库存预警，不显示用户姓名、头像、账户信息、SKU 或单个商品库存明细。帮助中心和联系我们也是公开模板页面。管理后台由 Vue SPA 实现，必须登录且不开放自助注册；后台包括仪表盘、商品、库存预警和系统设置。新增商品的分类下拉读取 MySQL 分类表，初始分类为：数码配件、电脑外设、影音设备、显示设备、智能家居、网络设备；默认分类由系统设置决定。数据库名默认 `yun_cang`，连接地址使用本机 `127.0.0.1:3306`。

**凭据安全：** 不要把数据库 root 密码放进提示词、生成文件或版本库。聊天里出现过的数据库密码建议更换；在本地 MySQL 创建仅访问 `yun_cang` 数据库的应用用户，并在生成项目的本机 `.env` 中填写。CLI 根目录的 `.env` 保存模型服务配置；生成项目只提供 `.env.example` 占位文件，不创建真实 `.env`。原型不会连接数据库、执行迁移、安装依赖或运行命令；这些步骤由你审阅 README 后在 VS Code 终端手动完成。数据库用户/密码不会发送给模型。

## 生成产物的骨架保证（P2 已实施）

首次把产物落地到 `D:\software\yun_cang` 时，运行期暴露了 6 类缺口。这些不再是「靠提示词祈祷」：

### 1. 固定骨架注入（`src/skeleton.js`）

以下文件内容完全确定，生成时**无条件覆盖**，模型写不写都不影响结果：

| 文件 | 作用 |
|---|---|
| `think` | 控制台入口，`php think` 系列命令依赖 |
| `.gitignore` | 忽略 `vendor`、`node_modules`、`dist`、`runtime`、`.env` |
| `config/{cache,log,view,route,cookie,lang}.php` | 框架必需配置；缺任一即启动失败 |
| `app/middleware.php` | 注册 `SessionInit`，缺它请求上没有会话实例 |
| `public/router.php`、`public/.htaccess` | `php think run` 路由脚本与 Apache 重写 |
| `resources/admin/{index.html,vite.config.js,package.json}` | 后台源码在 Web 根之外，`base: /admin/dist/`，入口 `./src/main.js` |

### 2. 写入前结构校验（`validateGeneratedStructure`）

命中任一条即**拒绝写入**并列出问题，不会留下半成品目录：

- 必需文件缺失
- 路由用了字符串控制器形式（`'Api\Auth/login'`）
- 登录路由出现在 `api/admin` 鉴权组之后
- 鉴权分组缺 `->middleware(...)`
- `app/middleware.php` 未注册 `SessionInit`
- 后台源码出现在 `public/` 内（只允许 `index.php`、`router.php`、`.htaccess` 与 `admin/dist/**`）
- 后台入口脚本不是相对路径，或 `vite base` / `outDir` 与产物位置不匹配
- 把 `$request->session()` 当写入使用
- 命令类调用 `$this->ask()`

### 3. 事后体检脚本

已生成的项目（含手工改过的）可随时复检：

```bash
node scripts/validate-project.js ../yun_cang
```

输出结构问题清单，并列出「忽略注释后仍与骨架不同」的文件，便于发现被改坏的骨架。

自测：`node test/skeleton.test.js`（11 条），全部测试共 41 条通过。
