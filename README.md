# 端口占用关闭工具

查询并强制关闭占用指定端口的进程的跨平台桌面工具，支持 Windows / macOS / Linux 三平台安装包。

## 版本

| 版本 | 技术栈 | 位置 | 说明 |
| --- | --- | --- | --- |
| Electron 版（推荐） | Electron + 原生 Web | `port-killer-ui/` | 现代暗色界面，当前正式版 v1.0.0 |
| tkinter 版 | Python + tkinter | `port_killer.py` | 轻量单文件，无需安装依赖 |

- 最新发布：[GitHub Release v1.0.0](https://github.com/TJ-Git-version/port-killer-ui/releases/tag/v1.0.0)
- 更新日志：[`port-killer-ui/CHANGELOG.md`](port-killer-ui/CHANGELOG.md)

## 快速开始

Electron 版（推荐）：

```powershell
cd port-killer-ui
npm install
npm start
```

或直接双击 `启动端口工具(新版).bat`。

tkinter 版：

```powershell
python port_killer.py
```

或直接双击 `启动端口工具.bat`。

> 国内网络安装依赖较慢时，可先设置镜像：`$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"`
> 详细说明见 [`port-killer-ui/README.md`](port-killer-ui/README.md)。

## 功能特性

- 输入端口号或点击常用端口快捷按钮，实时查询占用进程（PID、进程名、协议、本地地址、状态）
- 勾选 / 全选 / 一键强制关闭，二次确认弹窗 + Toast 反馈 + 加载动画
- 权限不足时一键「以管理员身份重启」（UAC 提权）
- 自动忽略 PID=0 的残留连接（TIME_WAIT 等）
- 系统命令仅在主进程执行，渲染进程无 Node.js 权限，安全隔离

## 文档索引

| 文档 | 说明 |
| --- | --- |
| [`docs/PROJECT_CONTEXT.md`](docs/PROJECT_CONTEXT.md) | 项目上下文交接文档（环境、当前状态、发布流程、踩坑记录，供新会话快速上手） |
| [`使用说明.md`](使用说明.md) | 两个版本的使用说明 |
| [`port-killer-ui/README.md`](port-killer-ui/README.md) | Electron 版详细文档（运行 / 测试 / 打包） |
| [`port-killer-ui/RELEASING.md`](port-killer-ui/RELEASING.md) | 版本发布规范（SemVer + Tag + GitHub Release） |
| [`port-killer-ui/CHANGELOG.md`](port-killer-ui/CHANGELOG.md) | 更新日志 |

## 发布与构建

```powershell
cd port-killer-ui
npm run build:win      # Windows：NSIS 安装包 + 便携版
npm run build:mac      # macOS：dmg + zip（需 macOS 环境）
npm run build:linux    # Linux：AppImage + deb（需 Linux 环境）
```

推送 `vX.Y.Z` 标签后，GitHub Actions 自动在 Windows / macOS / Ubuntu 三平台构建并发布到
GitHub Release（含源码包与发布说明）。详见 [`port-killer-ui/RELEASING.md`](port-killer-ui/RELEASING.md)。

## 安全说明

- 强制结束进程（/F）不会保存未保存的数据，请谨慎操作
- 系统关键进程（如 PID 4 System）请勿关闭
