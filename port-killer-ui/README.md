# 端口占用关闭工具 · 桌面版（Electron）

界面好看的现代桌面应用（深色 / 浅色主题可切换）：输入端口号或端口范围，查询并强制关闭占用对应端口的进程。
与 `../port_killer.py`（tkinter 版）相互独立，本目录为 v2.0 新版。

## 运行

### 方式一（推荐）：双击启动脚本
双击 `..\启动端口工具(新版).bat`（直接调用 electron.exe，无控制台窗口）。

### 方式二：命令行
```powershell
cd D:\myCode\port\port-killer-ui
npm start
```

### 首次运行前安装依赖
```powershell
cd D:\myCode\port\port-killer-ui
npm install
```

> 国内网络下载 Electron 二进制较慢时，可先设置镜像再安装：
> ```powershell
> $env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
> npm install
> ```

## 功能

- 输入端口号（1~65535）或范围（如 `8080-8090`，最多 1000 个端口），回车/点击「查询占用」
- 卡片式表格展示占用进程：PID、进程名、协议、本地地址、端口、状态
- 勾选 / 全选 / 点击整行切换，一键「关闭选中进程」（`taskkill /PID /F`）
- 二次确认弹窗 + Toast 结果反馈 + 加载动画
- 权限不足时提示「以管理员身份重启」（UAC 提权）
- 自动忽略 PID=0 的残留连接（TIME_WAIT 等）
- 浅色 / 深色主题一键切换，默认跟随系统外观，选择自动记住
- 应用内自动更新：启动后静默检查 GitHub Release，发现新版本可一键下载并重启安装（NSIS 安装版）

## 项目结构

| 文件 | 说明 |
| --- | --- |
| `main.js` | Electron 主进程：执行 netstat/tasklist/taskkill、权限检测、提权重启 |
| `preload.js` | contextBridge 安全桥接，仅暴露最小 API |
| `src/core.js` | 核心纯函数（解析 netstat/tasklist、端口校验） |
| `src/index.html` | 界面结构 |
| `src/style.css` | 深色 / 浅色双主题样式与动画 |
| `src/renderer.js` | 界面交互逻辑 |
| `test/core.test.js` | 核心逻辑单元测试 |
| `scripts/verify.js` | Playwright 驱动 Electron 的 DOM 级界面验证（22 项检查） |
| `scripts/screenshot.js` | 截图验证脚本（输出到 shots/） |

## 测试

```powershell
npm test                 # 核心逻辑单元测试
node scripts/verify.js   # 界面 DOM 验证（22 项检查）
node scripts/screenshot.js  # 界面截图（shots/ 目录）
```

## 安全说明

- 强制结束进程（/F）不保存未保存的数据，请谨慎操作
- 系统关键进程（如 PID 4 System）请勿关闭
- 架构上渲染进程无 Node 权限，系统命令只在主进程执行

## 自动更新

- 打包版（NSIS 安装版 / macOS zip / Linux AppImage）启动约 6 秒后自动检查 GitHub Release 新版本
- 发现新版本弹窗提示，下载过程显示进度，完成后一键重启安装
- Windows 便携版与 Linux deb 版不支持自动更新（无安装器），界面不显示「检查更新」按钮

## 打包发布（Windows / macOS / Linux）

使用 electron-builder 打包，产物输出到 `dist/` 目录：

```powershell
npm run build:win      # Windows：NSIS 安装包 + 便携版（.exe）
npm run build:mac      # macOS：dmg + zip（需在 macOS 上执行）
npm run build:linux    # Linux：AppImage + deb（需在 Linux 上执行）
```

### 产物说明

| 文件 | 说明 |
| --- | --- |
| `PortKiller-1.0.0-Setup-x64.exe` | Windows 安装程序（NSIS，可自选安装目录） |
| `PortKiller-1.0.0-Portable-x64.exe` | Windows 便携版（免安装，双击即用） |
| `PortKiller-1.0.0.dmg` / `.zip` | macOS 安装镜像 / 压缩包 |
| `PortKiller-1.0.0.AppImage` / `.deb` | Linux 免安装包 / Debian 系安装包 |

### 跨平台说明

- **Windows**：可直接在本机构建（已验证）。
- **macOS / Linux**：electron-builder 需要目标系统构建（或使用 CI）。
  仓库已配置 GitHub Actions（`.github/workflows/build.yml`），推送到 GitHub 后
  会在 windows / macos / ubuntu 三个 runner 上自动构建并上传产物，无需本机。

### 国内网络构建提示

首次构建需下载 Electron 与构建工具，可设置镜像加速：

```powershell
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR = "https://npmmirror.com/mirrors/electron-builder-binaries/"
npm run build:win
```

> 未配置代码签名证书，安装/运行时 Windows SmartScreen / macOS Gatekeeper 可能提示未知发布者，属正常现象。

## 版本发布管理

采用「SemVer 版本号 + Git Tag + GitHub Release + CI 自动构建」规范流程，
详见 [RELEASING.md](RELEASING.md)。推送 `v*` 标签后自动构建 Windows/macOS/Linux
三平台安装包并发布到 GitHub Release（源码包由 GitHub 自动附带）。

## 相关文档

- 项目上下文交接文档：[`docs/PROJECT_CONTEXT.md`](../docs/PROJECT_CONTEXT.md)
- 版本发布规范：[`RELEASING.md`](RELEASING.md)
- 更新日志：[`CHANGELOG.md`](CHANGELOG.md)
- 仓库总览与文档索引：[`README.md`](../README.md)
