# 🚀 Aptos Mock Creator

A tool to easily create mock Aptos packages!  
一个轻松创建 Aptos 模拟包的工具！

---

## 📦 Installation 安装

```bash
# Using pnpm
pnpm add -g aptos-mock-creator

# Using npm
npm install -g aptos-mock-creator

# Using yarn
yarn global add aptos-mock-creator
```

---

## 🛠️ Usage 使用方法

```bash
aptos-mock-creator create <account> <package> [directory] [options]
```

- `<account>`: Aptos account address (Aptos 账户地址)
- `<package>`: Package name (包名)
- `[directory]`: (Optional) Output directory, default is `./` (可选，输出目录，默认为当前目录)

### 🌟 Example 示例

```bash
aptos-mock-creator create 0x1 AptosStdlib ./output
```

你也可以添加 Bearer Token（如有 API 权限需求）：

```bash
aptos-mock-creator create 0x1 AptosStdlib --token YOUR_TOKEN
```

---

## ⚙️ Options 参数

| Option / 选项      | Description (EN)                        | 说明 (中文)           |
|--------------------|-----------------------------------------|-----------------------|
| `--rpc, -r`        | RPC URL (default: Aptos mainnet)        | RPC 地址（默认为主网）|
| `--token, -t`      | Bearer token for API authentication     | API 认证 Bearer Token |

---

## 💡 Tips 小贴士

- Make sure you have Node.js installed.  
  请确保已安装 Node.js。
- You can check all options with:  
  你可以通过以下命令查看所有参数：
  ```bash
  aptos-mock-creator --help
  ```

---

## 📁 Output Structure 输出结构

生成的目录结构如下：

```
your_target_directory/
  └── <package>/
      ├── Move.toml
      ├── sources/
      │   └── *.move
      └── deps/
          └── <dependency_package>/
              ├── Move.toml
              └── sources/
```

---

## 🙌 Enjoy! 尽情享用！

欢迎提出建议和反馈！  
Feel free to open issues or pull requests!

---
