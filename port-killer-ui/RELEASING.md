# 版本发布规范（RELEASING）

本仓库使用 **SemVer 语义化版本 + Git Tag + GitHub Release + CI 自动构建** 的标准流程发布。

## 版本号规则（SemVer）

版本号格式：`主版本.次版本.修订号`（`X.Y.Z`）

- **主版本**：不兼容的重大变更（如界面框架重写、命令行为变化）
- **次版本**：向后兼容的新功能
- **修订号**：向后兼容的 bug 修复

示例：`1.0.0` → `1.0.1`（修 bug）→ `1.1.0`（新功能）→ `1.0.0`（重大变更）

## 发布流程（三步）

### 1. 更新版本号

编辑 `port-killer-ui/package.json` 中的 `version` 字段为新版本号（如 `2.0.1`）。

### 2. 提交并推送代码

```powershell
git add -A
git commit -m "chore: release v2.0.1"
git push origin master
```

### 3. 打标签并推送（触发自动发布）

```powershell
git tag v2.0.1
git push origin v2.0.1
```

推送 `v*` 标签后，GitHub Actions（`.github/workflows/release.yml`）会自动：

1. 在 **Windows / macOS / Ubuntu** 三个 runner 上分别构建
2. 产出并汇总所有安装包：
   - Windows：`PortKiller-<ver>-Setup-x64.exe`、`PortKiller-<ver>-Portable-x64.exe`
   - macOS：`PortKiller-<ver>.dmg`、`PortKiller-<ver>-mac.zip`
   - Linux：`PortKiller-<ver>.AppImage`、`PortKiller-<ver>-linux.deb`
3. 自动创建 GitHub Release，上传所有产物，并生成发布说明

GitHub 还会自动为每个 Release 附带**源码包**（Source code zip / tar.gz）。

## 发布产物查看

仓库页面 → **Releases** 标签页，可看到每个版本的：

| 资产 | 用途 |
| --- | --- |
| Setup / Portable .exe | Windows 安装 / 免安装 |
| .dmg / .zip | macOS |
| .AppImage / .deb | Linux |
| Source code (zip/tar.gz) | 源码快照（GitHub 自动附带） |

## 手动发布（可选，不用 CI）

本机已构建出 Windows 包时，可手动上传：

```powershell
# 需要 gh CLI 且已登录（gh auth login）
gh release create v1.0.0 dist\PortKiller-1.0.0-Setup-x64.exe dist\PortKiller-1.0.0-Portable-x64.exe --title "v1.0.0" --notes "发布说明"
```

## 进阶建议

- **自动更新**：✅ 已接入 `electron-updater`（v1.1.0），NSIS 安装版支持应用内检查/下载/重启安装；便携版与 Linux deb 暂不支持
- **代码签名**：正式分发前配置 Windows（Azure Trusted Signing / 商业证书）与 macOS（Apple Developer）签名，消除系统安全提示
- **草稿发布**：将 `release.yml` 中 `draft` 改为 `true`，先审核再手动发布

