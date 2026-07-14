# Polytrader2 正式版发布流程

本文记录 Polytrader2 Windows 桌面应用的正式版发布流程。当前约定是：普通分支构建只做校验，正式发布只通过 `v*` Git tag 触发 GitHub Actions。

## 环境约定

- 项目目录：`C:\Users\ykzha\Projects\fb-test2`
- 主开发分支：`develop`
- 受保护主分支：`master`
- GitHub 仓库：`wzsg/polytrader2-app`
- 正式发布 tag 格式：`v<major>.<minor>.<patch>`，例如 `v1.2.3`
- Windows 安装包命名格式：`Polytrader2-Setup-<version>.exe`

## 发布原则

- `develop` 分支用于日常开发和 CI 校验。
- `master` 分支只通过 Pull Request 合并，不直接提交。
- 普通 push / PR 不生成正式版本号，也不发布 GitHub Release。
- 正式版本号只来自 Git tag。
- 推送 `v*` tag 后，`.github/workflows/release-windows.yml` 会把 tag 中的版本号写入 `apps/desktop/package.json`，再构建并发布 Windows 安装包。
- GitHub Release 当前由 Electron Builder 创建为 draft release，发布前需要在 GitHub 页面确认内容后手动发布。

## 1. 发布前检查

切到 `develop` 并确认本地代码干净：

```powershell
cd C:\Users\ykzha\Projects\fb-test2
git switch develop
git pull --ff-only
git status --short --branch
```

从 GitHub 查询最新的正式版本，不要根据本文档中的示例版本号判断当前版本：

```powershell
$latestTag = gh release list `
  --exclude-drafts `
  --exclude-pre-releases `
  --limit 1 `
  --json tagName `
  --jq '.[0].tagName'

if (-not $latestTag) {
  throw 'Cannot determine the latest stable release from GitHub.'
}

Write-Output "Latest stable release: $latestTag"
```

根据 `$latestTag` 和语义化版本规则选择下一个版本。修复和小改进通常递增 `PATCH`；向后兼容的新功能递增 `MINOR`；不兼容变更递增 `MAJOR`。再设置本次发布变量，例如：

```powershell
$releaseTag = 'v1.2.4'
$releaseVersion = $releaseTag.TrimStart('v')
Write-Output "Release tag: $releaseTag"
```

发布前还必须确认 `$releaseTag` 尚未存在于远程 tag 或 GitHub Release 中，不能覆盖已经成功发布的正式版本。

运行本地基础校验：

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd run typecheck
pnpm.cmd run lint
pnpm.cmd run build
```

如果要提前验证 Windows 安装包，可以参考：

```text
docs/windows-installer-vm-smoke-test.md
```

## 2. 合并到 master

正式发布前，应先把准备发布的变更通过 Pull Request 合并到 `master`。合并后在本地同步 `master`：

```powershell
git switch master
git pull --ff-only origin master
git status --short --branch
```

确认 `master` 指向要发布的提交：

```powershell
git log -1 --oneline
```

## 3. 创建正式发布 tag

使用发布前检查中设置的 `$releaseTag` 创建对应 tag：

```powershell
git tag $releaseTag
```

确认 tag 指向当前 `master` 的最新提交：

```powershell
git show --stat $releaseTag
```

推送 tag 到远程：

```powershell
git push origin $releaseTag
```

推送后会触发 GitHub Actions 的 `Release Windows` workflow。

## 4. 观察 GitHub Actions

查看最近的发布 workflow：

```powershell
gh run list --workflow "Release Windows" --limit 5
```

查看某次运行详情：

```powershell
gh run view <run-id>
```

如果失败，查看失败日志：

```powershell
gh run view <run-id> --log-failed
```

成功后，Electron Builder 会在 GitHub Releases 中创建 draft release，并上传 Windows 安装包相关产物。

## 5. 发布前确认 draft release

打开 GitHub Releases 页面：

```powershell
gh release view $releaseTag --web
```

发布前重点确认：

- Release tag 与 `$releaseTag` 一致。
- 安装包文件名包含 `$releaseVersion`，例如 `Polytrader2-Setup-$releaseVersion.exe`。
- Release 仍是 draft，确认无误后再手动 publish。
- 如需要发布说明，先补充 changelog、风险提示和升级说明。

## 6. 安装包验证

下载 draft release 中的 Windows 安装包，在虚拟机中验证：

- 安装包可以正常安装。
- 安装后应用可以启动。
- 应用版本号与 tag 一致。
- 静默卸载可以正常完成。

详细步骤参考：

```text
docs/windows-installer-vm-smoke-test.md
```

## 7. 发布完成后同步 develop

如果发布过程中对 `master` 做了补充提交，发布完成后应把 `master` 合回 `develop`：

```powershell
git switch develop
git pull --ff-only origin develop
git merge --ff-only origin/master
git push origin develop
```

如果不能 fast-forward，说明 `develop` 和 `master` 已经分叉，需要先检查差异，再决定是否通过 PR 同步。

## 8. 发布失败处理

如果 tag 已推送但 workflow 失败，并且需要重发同一个版本：

1. 先修复代码或 workflow。
2. 删除远程失败 tag。
3. 删除本地失败 tag。
4. 在修复后的提交上重新创建并推送同名 tag。

命令如下：

```powershell
git push origin ":refs/tags/$releaseTag"
git tag -d $releaseTag
git tag $releaseTag
git push origin $releaseTag
```

如果失败的 draft release 已经创建，需要在 GitHub Releases 页面删除旧 draft 后再重跑，避免产物混淆。

## 9. 版本号规则

推荐使用语义化版本：

- `MAJOR`：不兼容的重大变化。
- `MINOR`：向后兼容的新功能。
- `PATCH`：修复问题、小改进、内部稳定性提升。

当前 release workflow 接受：

```text
v1.2.3
v1.1.0
v2.0.0
v1.2.3-beta.1
```

普通 CI 不再使用 `GITHUB_RUN_NUMBER` 作为正式版本号。`GITHUB_RUN_NUMBER` 只适合作为临时构建编号，不应进入正式用户可见版本。

## 10. 常用命令速查

发布一个正式版本：

```powershell
cd C:\Users\ykzha\Projects\fb-test2
$latestTag = gh release list --exclude-drafts --exclude-pre-releases --limit 1 --json tagName --jq '.[0].tagName'
$releaseTag = 'v1.2.4'
git switch master
git pull --ff-only origin master
git tag $releaseTag
git push origin $releaseTag
gh run list --workflow "Release Windows" --limit 5
```

查看 release：

```powershell
gh release view $releaseTag --web
```

查看 tag 指向：

```powershell
git rev-parse $releaseTag
git log -1 --oneline $releaseTag
```
