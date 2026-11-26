# Vibe 全栈开发助手原型 0.1

一个本地 CLI 原型：读取有限的项目上下文，调用 OpenAI-compatible Chat Completions 接口生成计划和统一 diff；只有用户输入 `APPLY` 才尝试应用补丁。它不会自动运行测试或 shell 命令。

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

## 配置

`.env` 示例：

```dotenv
VIBE_BASE_URL=https://api.openai.com/v1
VIBE_MODEL=你的模型名
VIBE_API_KEY=你的密钥
```

如使用其他供应商，应填写其 OpenAI-compatible API 根地址。不同供应商的兼容性可能不同；模型调用失败时先核对供应商文档中的 API 地址和模型 ID。
