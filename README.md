# 🚀 Aptos Mock Creator

A tool to easily create mock Aptos packages!  
一个轻松创建 Aptos 模拟包的工具！

---

## 📦 Installation / 安装

```bash
# Using pnpm / 使用 pnpm
pnpm add -g aptos-mock-creator

# Using npm / 使用 npm
npm install -g aptos-mock-creator

# Using yarn / 使用 yarn
yarn global add aptos-mock-creator
```

### 🏃‍♂️ Quick Run / 快速运行

You can also run the tool without global installation using `npx` or `pnpx`:  
您也可以使用 `npx` 或 `pnpx` 运行工具，无需全局安装：

```bash
# Using npx / 使用 npx
npx aptos-mock-creator create 0x1 AptosStdlib ./output

# Using pnpx / 使用 pnpx
pnpx aptos-mock-creator create 0x1 AptosStdlib ./output
```

---

## 🛠️ Usage / 使用方法

```bash
aptos-mock-creator create <account> <package> [directory] [options]
```

- `<account>`: Aptos account address / Aptos 账户地址
- `<package>`: Package name / 包名
- `[directory]`: (Optional) Output directory, default is `./` / （可选）输出目录，默认为当前目录

### 🌟 Examples / 示例

```bash
# Create a mock of AptosStdlib / 创建 AptosStdlib 的模拟包
aptos-mock-creator create 0x1 AptosStdlib ./output

# Create with Bearer token / 使用 Bearer Token 创建
aptos-mock-creator create 0x1 AptosStdlib --token YOUR_TOKEN

# Specify RPC URL / 指定 RPC 地址
aptos-mock-creator create 0x1 AptosStdlib ./output --rpc https://fullnode.testnet.aptoslabs.com
```

---

## ⚙️ Options / 参数

| Option / 选项      | Description (EN)                        | 说明 (中文)                          |
|--------------------|-----------------------------------------|--------------------------------------|
| `--rpc, -r`        | RPC URL (default: Aptos mainnet)        | RPC 地址（默认为主网）               |
| `--token, -t`      | Bearer token for API authentication     | API 认证的 Bearer Token              |
| `--help, -h`       | Show help information                   | 显示帮助信息                        |
| `--version, -v`    | Show version number                     | 显示版本号                          |

---

## 💡 Tips / 小贴士

- Make sure you have Node.js installed.  
  请确保已安装 Node.js。
- You can check all options with:  
  你可以通过以下命令查看所有参数：
  ```bash
  aptos-mock-creator --help
  ```
- The tool supports both mainnet and testnet RPC endpoints.  
  该工具支持主网和测试网的 RPC 端点。

---

## 📁 Output Structure / 输出结构

The generated directory structure is as follows:  
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

## 🤝 Contributing / 贡献

Feel free to open issues or pull requests!  
欢迎提出建议和反馈！

---

## 📄 License / 许可证

MIT License  
MIT 许可证

---

## 🙌 Enjoy! / 尽情享用！

Happy coding with Aptos Mock Creator!  
使用 Aptos Mock Creator 愉快编码！
