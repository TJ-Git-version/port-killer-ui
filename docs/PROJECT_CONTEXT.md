# 端口占用关闭工具（Port Killer）· 项目上下文交接文档

> **文件位置**：`docs/PROJECT_CONTEXT.md`
> **用途**：供下一个 Codex 窗口（新会话）快速阅读，恢复上下文、做出正确决策。
> 最后更新：2026-08-21 · v1.1.0 已发布

---

## 1. 项目一句话概述

**端口占用关闭工具**：输入端口号 → 查询占用该端口的进程 → 一键强制关闭。
包含两个独立版本，均已提交并推送 GitHub：

| 版本 | 位置 | 状态 |
| --- | --- | --- |
| tkinter 版（旧） | `D:\myCode\port\port_killer.py` | 可用，保留不动 |
| Electron 版（主推，v1.1.0） | `D:\myCode\port\port-killer-ui\` | 已发布 Release v1.1.0 |

## 2. 当前状态（速览）

- ✅ **v1.0.0 已正式发布**：[GitHub Release](https://github.com/TJ-Git-version/port-killer-ui/releases/tag/v1.0.0)
  - 三平台安装包：Windows（Setup+Portable）、macOS（x64+arm64 的 dmg/zip）、Linux（AppImage+deb）
  - 源码包：`port-killer-ui-v1.0.0-src.zip` + GitHub 自动附带的源码 zip/tar.gz
  - 发布说明：自动读取 `CHANGELOG.md` 最新条目（含功能 + 修复）
- ✅ **v1.1.0 已发布**（[GitHub Release](https://github.com/TJ-Git-version/port-killer-ui/releases/tag/v1.1.0)）：
  - 端口范围查询（8080-8090，单次最多 1000 个端口，表格新增「端口」列）
  - 浅色 / 深色主题切换（默认跟随系统外观，localStorage 记住选择）
  - 接入 electron-updater 应用内自动更新（NSIS 安装版支持，便携版 / Linux deb 不支持）
- ✅ 代码已推送，**工作区 git 干净**
- ✅ CI/CD 正常：`build.yml`（master 推送构建）+ `release.yml`（`v*` 标签自动发布）
- ℹ️ 本地 `dist\` 已含 1.1.0 构建产物（Setup/Portable/blockmap/latest.yml，gitignored，仍残留旧 2.0.0 文件未删），**正式产物以 GitHub Release 为准**

## 3. 目录结构

```
D:\myCode\port\
├── port_killer.py                # v1 tkinter 版主程序（单文件）
├── test_port_killer.py           # v1 单元测试（19 个）
├── 启动端口工具.bat               # v1 启动脚本（pythonw 无黑窗口）
├── 启动端口工具(新版).bat         # v2 启动脚本（直接调 electron.exe）
├── 使用说明.md                    # 根目录总说明（两个版本）
├── README.md                     # 根 README（用户经 GitHub web 创建的提交）
├── .gitignore                    # 忽略 node_modules/dist/shots/.idea/.vscode 等
├── .github\workflows\
│   ├── build.yml                 # master 推送 → 三平台构建（不发布）
│   └── release.yml               # v* 标签 → 三平台构建 + 发布 Release
└── port-killer-ui\                # v2 Electron 应用
    ├── package.json              # 版本 1.0.0，含 build 配置（win/mac/linux/publish）
    ├── package-lock.json
    ├── main.js                   # 主进程：netstat/tasklist/taskkill、提权、IPC
    ├── preload.js                # contextBridge 安全桥接
    ├── CHANGELOG.md              # 变更日志（发布说明数据源）
    ├── RELEASING.md              # 版本发布规范文档
    ├── README.md
    ├── build\icon.png / icon.ico # 应用图标（PIL 生成）
    ├── src\
    │   ├── core.js               # 核心纯函数（解析 netstat/tasklist、校验、构造命令）
    │   ├── index.html            # 界面结构（暗色主题）
    │   ├── style.css             # 样式与动画
    │   └── renderer.js           # 交互逻辑
    ├── test\core.test.js         # 核心逻辑单元测试（12 个，node:test）
    ├── scripts\
    │   ├── verify.js             # DOM 级界面验证（16 项）
    │   ├── screenshot.js         # 界面截图（输出 shots\）
    │   └── verify-packaged.js    # 打包版应用验证
    ├── shots\                    # 截图（gitignored）
    └── dist\                     # 构建产物（gitignored，已含 1.1.0，残留旧 2.0.0 未删）
```

## 4. 环境与工具

| 项 | 值 |
| --- | --- |
| 操作系统 | Windows（PowerShell，cwd `D:\myCode\port`） |
| Python | 3.12.3（`D:\software\python\Python312`），tkinter 8.6 可用 |
| Node.js | v22.14.0（`D:\software\nodejs`），npm 11.12.0 |
| Electron | 43.4.1（devDependency） |
| electron-builder | 26.15.3 |
| playwright-core | 最新（仅测试用，devDependency） |
| gh CLI | 2.92.0，**已登录 GitHub 账号 TJ-Git-version**（repo 权限，SSH 协议） |
| git | 用户 jiangjunfeng / jiangjunfeng@qq.com，SSH 到 GitHub 已配置 |
| 国内网络 | GitHub 直连慢，用 npmmirror 镜像加速（见 §9） |

## 5. 运行方式

```powershell
# v1 tkinter
python port_killer.py                      # 或双击 启动端口工具.bat

# v2 Electron
cd D:\myCode\port\port-killer-ui
npm start                                  # 或双击 ..\启动端口工具(新版).bat
```

首次安装依赖（国内网络）：
```powershell
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR = "https://npmmirror.com/mirrors/electron-builder-binaries/"
npm install
```

## 6. 测试与验证命令

```powershell
cd D:\myCode\port\port-killer-ui
npm test                        # 核心逻辑 12/12 通过（node --test）
node scripts\verify.js          # 界面 DOM 16/16 通过（Playwright 驱动 Electron）
node scripts\screenshot.js      # 生成界面截图到 shots\
node scripts\verify-packaged.js # 验证打包版 exe（dist\win-unpacked\PortKiller.exe）

cd D:\myCode\port
python -m unittest test_port_killer -v   # tkinter 版 19/19 通过
```

## 7. 打包与发布流程

```powershell
cd D:\myCode\port\port-killer-ui
npm run build:win      # Windows：NSIS Setup + Portable（本机已验证）
npm run build:mac      # macOS：dmg + zip（x64 + arm64，需在 macOS 上执行）
npm run build:linux    # Linux：AppImage + deb（需在 Linux 上执行）
```

**发布新版（标准三步）**：
```powershell
# 1) 改 port-killer-ui\package.json 的 version（SemVer，如 1.0.1）
# 2) 提交推送
git add -A; git commit -m "chore: release v1.0.1"; git push origin master
# 3) 打标签触发 CI 自动发布
git tag v1.0.1; git push origin v1.0.1
```

CI 自动完成：三平台构建 → 上传产物 → `git archive` 打包源码 → 读取 `CHANGELOG.md` 最新条目作为发布说明 → 创建 GitHub Release。

## 8. Git 与远程状态

- 远程：`origin = git@github.com:TJ-Git-version/port-killer-ui.git`（SSH）
- 分支：`master`（跟踪 origin/master）
- 标签：`v1.0.0` → 提交 `40394be`；`v1.1.0` → 提交 `4b9f3cf`（端口范围查询 + 浅色/深色主题 + 应用内自动更新）
- 提交历史（新→旧）：
  - `40394be` fix: 发布流程只上传安装包产物（排除解包目录），macOS 增加 x64 架构
  - `e541114` release: v1.0.0 首个正式版（三平台打包 + 变更日志 + 发布说明）
  - `673bd69` feat: 配置 GitHub Release 自动发布
  - `0c789a0` 为端口终止工具初始化 README 文件（用户 GitHub web 创建）
  - `b1b0c53` chore: 忽略 IDE 配置文件
  - `fb2a33a` feat: 端口占用关闭工具（tkinter 版 + Electron 跨平台版）

## 9. 已踩坑记录（重要，避免重犯）

1. **国内网络**：GitHub/Electron 二进制直连极慢甚至停滞。必须用 npmmirror：
   - `ELECTRON_MIRROR`（Electron 二进制）
   - `ELECTRON_BUILDER_BINARIES_MIRROR`（electron-builder 的 nsis/winCodeSign/appimage 等）
   - GitHub Actions runner 上无需镜像（GitHub 网络正常）。
2. **Linux deb 构建要求 `package.json` 声明 `homepage`**，否则报 "Please specify project homepage"（已配置）。
3. **上传路径陷阱**：release 工作流上传必须用精确的文件扩展名 glob（`dist/*.exe/*.dmg/*.zip/*.AppImage/*.deb/*.yml/*.blockmap`），
   不能 `dist/*` —— 否则会把 `win-unpacked\` 里几百个 Electron 运行时文件（.pak/.dll/Electron.Framework）误当 Release 资产上传（已踩过）。
4. **版本号**：首个正式发布应 v1.0.0，曾误设 v2.0.0 后更正并删除旧标签。
5. **未签名**：无代码签名证书，Windows SmartScreen / macOS Gatekeeper 会提示未知发布者，属正常。
6. **Actions 弃用警告**：actions/checkout@v4、setup-node@v4、upload-artifact@v4 基于 Node 20（已被强制跑在 Node 24），
   非阻塞；后续可升级 v5。
7. **macOS 构建必须在 macOS runner**（本机 Windows 无法产 mac 包）；release.yml 已在 macos-latest 上构建 x64+arm64。
8. **AGENTS.md 约束**：禁止批量删除文件（`del /s`、`rd /s`、`Remove-Item -Recurse`、`rm -rf` 均禁用），
   删除只能一次一个明确路径；生成代码默认不 git 提交需人工审核（但用户多次明确要求提交时，以用户最新指示为准）。

9. **electron-updater 注意事项**：
   - `app-update.yml` 只在构建 **NSIS 目标** 时生成（`--dir` / 仅 portable 不会生成），CI 的 `--publish never` 也会生成（electron-builder 自动回退到 repository 的 GitHub 配置）
   - 便携版（portable）无安装器、Linux deb 版不支持自动更新，运行时用 `process.env.PORTABLE_EXECUTABLE_FILE` / `process.env.APPIMAGE` 判断并隐藏更新入口
   - electron-updater 必须放在 `dependencies`（不能放 devDependencies），打包时才会被包含进 asar（已确认 dist/win-unpacked 的 app.asar 内含 electron-updater）
10. **JS 模板字符串转义坑**：用 Node 脚本批量改源码时，若把目标代码放在模板字符串里，`\d` 会被模板字符串求值成 `d`，必须写成 `\\d`；改完后务必 `node --check` + 实跑验证

## 10. 关键设计决策与约定

- **架构安全**：系统命令（netstat/tasklist/taskkill）只在 `main.js` 主进程执行；`preload.js` 用 contextBridge
  只暴露最小 API；渲染进程无 Node 权限；页面 CSP 限制 script-src 'self'。
- **可测试性**：解析/校验/命令构造等纯逻辑放在 `src/core.js`，与 Electron 解耦，便于 node:test 单元测试。
- **命名**：electron-builder `productName` 用 ASCII "PortKiller"（避免中文文件名问题），
  快捷方式名用中文「端口占用关闭工具」；artifactName 按目标分开（`-Setup-` / `-Portable-`），避免同名覆盖。
- **发布规范**：SemVer + `CHANGELOG.md`（Keep a Changelog 风格）+ Git Tag（`vX.Y.Z`）+ GitHub Release + CI 自动发布。
- **版本约定**：`package.json version` 与 tag 保持一致；mac 双架构 x64+arm64。

## 11. 待办 / 下一步建议（候选，未实施）

1. ✅ ~~electron-updater 自动更新~~（v1.1.0 已接入：NSIS 安装版支持应用内更新；便携版 / Linux deb 不支持）
2. **代码签名**：Windows（Azure Trusted Signing / 商业证书）+ Apple Developer 签名，消除安全提示。
3. **升级 Actions 到 v5**（checkout/setup-node/upload-artifact），消除 Node 20 弃用警告。
4. **master → main 改名**（GitHub 默认惯例，可选，需同步 remote 分支）。
5. **草稿发布**：release.yml `draft: true` 可先审后发。
6. **本地 dist 清理**：本地 dist 是旧 2.0.0 产物，可重跑 `npm run build:win` 刷新为 1.0.0（或删除单个旧文件）。

## 12. 常用命令速查

```powershell
# 查看 Release
gh release view v1.0.0 --repo TJ-Git-version/port-killer-ui
gh release list --repo TJ-Git-version/port-killer-ui

# 查看 Actions
gh run list --repo TJ-Git-version/port-killer-ui --limit 5
gh run watch <run-id> --repo TJ-Git-version/port-killer-ui --exit-status

# 手动建 Release（本地有产物时）
gh release create v1.0.1 dist\*.exe --title "v1.0.1" --notes "说明"

# 删除 Release / 标签（谨慎）
gh release delete v1.0.0 --repo TJ-Git-version/port-killer-ui --yes
git push origin :refs/tags/v1.0.0
```






