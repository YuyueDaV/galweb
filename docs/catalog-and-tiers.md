# 作品书库、Bangumi 与 Tier 榜单

书架 `/works` 从本机或服务器 MySQL 中读取作品，同时为所有访客提供 Bangumi 游戏条目搜索。访客可查看封面、发售日期、外部评分和原站链接；管理员可将结果收录为新作品，或关联到已有作品。搜索不会自动写入书库。

## 管理入口

- `/admin/works`：搜索 Bangumi、收录作品、关联已有作品、编辑社团文案和更新外部资料。
- `/admin/tiers`：新建榜单，编辑标题、说明、分层名称及颜色，拖动或使用按钮、选择框安排作品，保存草稿、发布或下架。
- `/tiers`：所有访客可浏览已发布的榜单。

书库编号是稳定的作品 ID。原十二部作品保留编号和历史排名，新增作品不会被当作十二橙器第十三名。关联原作品时保留原有书单、讨论及社团推荐语；外部原文名、简介、评分、标签、封面和资料更新时间单独保存在作品的 `bangumi` 字段中。

导入同一个 Bangumi 条目时复用已有记录。管理员明确选择已有作品后才能关联；系统不会通过相似标题自动合并不同版本。更新外部资料也不会覆盖管理员编辑的作品文案。

## 草稿与发布

保存草稿后，访客继续看到上次发布的版本；只有“发布当前版本”会更新公开内容。“下架公开榜单”隐藏公开版本并保留草稿。不同管理员同时编辑时使用版本校验，发生冲突需刷新后重新编辑。

分层颜色只接受六位十六进制颜色，最多 20 层、200 部作品，同一作品不能跨层重复出现。每部作品必须已经存在于本站书库。管理操作校验管理员权限、登录会话和 CSRF，并写入审计日志。普通用户不能导入或修改作品及榜单。

## 本地启动与上线更新

本次新增 `tier_lists` 表，原有 `works` 表继续保存作品 JSON，迁移不会删除已有数据。Windows 本地执行：

```powershell
pnpm.cmd db:migrate
pnpm.cmd dev:api
# 另一个终端
pnpm.cmd dev
```

宝塔部署时先备份数据库，更新当前代码并执行：

```bash
cd /www/wwwroot/galweb
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm --filter @chengzhixiang/api build
```

然后在宝塔重启 API 项目，再部署相同版本的 EdgeOne 前端。本地开发分支为 `codex/local-development`，上线分支需要在审核后再合并。

## 外部接口与故障

后端仅请求固定的 `https://api.bgm.tv/v0`，不接收用户输入的上游地址。使用官方建议的可识别 User-Agent，游戏类型筛选为 `4`，单次请求超时 8 秒，相同查询缓存 5 分钟，并限制每个访问 IP 每分钟最多 30 次搜索。封面接受 `lain.bgm.tv` 的 HTTPS 封面及其 `/r/` 缩略图路径，加载失败时显示占位提示。

目前接入的是公开搜索和条目资料，不包含 Bangumi OAuth、用户收藏同步，也没有配置访问令牌。部分条目受 Bangumi 的公开可见范围限制。服务器需要能访问 `api.bgm.tv:443`；上游超时、限流或不可用会显示错误，已导入作品仍可浏览。封面继续使用 Bangumi 图片链接，外部评分不是本站投票结果。

此功能参考了 [VNFest 项目](https://github.com/kokubunshu/china-visualnovelcircle-maps) 的作品检索与榜单管理思路，在现有 Nuxt / NestJS 代码中独立实现。接口依据 [Bangumi 官方 v0 规范](https://github.com/bangumi/api/blob/master/open-api/v0.yaml) 和 [User-Agent 说明](https://github.com/bangumi/api/blob/master/docs-raw/user%20agent.md)。
