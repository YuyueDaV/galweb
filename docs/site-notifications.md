# 站点通知与活动提醒

管理员和超级管理员可从侧栏「站点通知」进入 `/admin/notifications`，填写标题、正文和可选站内链接，预览后确认群发。正文按纯文本展示，支持换行，不执行 HTML。链接仅接受 `/awards` 等站内路径。

发送对象为发送事务中所有正常账号，包含发送者；已禁用、已注销账号不接收，新注册账号不补发旧消息。每个用户的已读状态独立，消息进入现有通知铃铛、未读计数和 `/notifications` 列表，正文可直接阅读。铃铛在可见页面每分钟刷新，进入消息页也会刷新；本功能不发送邮件或浏览器推送。

管理员将十二橙器推进到「提名阶段」「投票阶段」「结果公布」或「已归档」时，以及开启二次投票、每轮同票加赛时，自动发送活动通知，链接定位到对应届次。通知与阶段变化在同一数据库事务中保存；更新失败会一起回滚。按活动编号、阶段和加赛轮次去重，重复提交不会重复群发；旧届次加赛后重新公布、归档会发送本轮的新通知。日期仅控制参与窗口，自动提醒由管理员推进阶段触发，没有新增定时任务。

手动发送携带请求编号，网络重试复用该编号；已成功请求返回原记录，不重复投递。重试发送时不能篡改正文；已发送内容应通过发送记录中的“编辑通知”修改。后台记录通知内容、发送者、时间、覆盖人数和审计日志。手动发送每账号每小时最多 10 次，接口还校验当前角色、会话、同源请求和 CSRF。

管理员可编辑或删除站点通知和活动自动通知。编辑可修改标题（最多 160 字）、正文和站内链接，所有原收件人读取时获得最新内容，保留发送时间及各自已读状态，不重新群发，也不为后来注册的用户补发。编辑窗口提交失败会保留输入并显示原因。

删除需在弹窗确认，之后从发送列表和所有收件箱移除，不再计入未读数。原记录标记为 `kind='deleted'`，保留事件编号、收件记录及审计；重试原发送请求会被拒绝，避免误复活或重复推送。修改、删除使用基于当前内容计算的 `revision` 校验，其他管理员已修改时返回 409，须刷新后重试。两类操作均在事务中再次检查管理员权限并记审计日志。

## 数据结构

- `notifications`：保留原有回复与提名审核通知。
- `notification_broadcasts`：保存一份群发正文、幂等事件编号和覆盖人数，避免为每个账号复制正文。
- `notification_broadcast_recipients`：保存群发收件人和个人已读时间。账号注销时清除其收件记录，发送历史继续保留。

两类消息在收件接口统一排序、分页及统计未读。单条与全部已读都只修改当前账号的记录。

## 部署

首次安装通知功能需要建立两张通知表；编辑、删除沿用现有表，无需新增迁移。下面迁移命令可重复运行，不会清空消息或补发历史通知。在服务器当前分支为 `codex/edgeone-deployment`、工作区干净时执行：

```bash
cd /www/wwwroot/galweb
pnpm --filter @chengzhixiang/api backup
git pull --ff-only origin codex/edgeone-deployment
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm --filter @chengzhixiang/api build
```

然后在宝塔 Node 项目重启 `galweb-api`，确认 EdgeOne 部署相同版本的前端。无需新环境变量或 SMTP 设置。

## 接口

| 接口 | 用途 |
| --- | --- |
| GET /api/admin/notifications?page=1 | 管理员发送历史及当前正常账号数 |
| POST /api/admin/notifications | 管理员发送；字段 requestId、title、content、link |
| PATCH /api/admin/notifications/:id | 管理员编辑；字段 title、content、link、revision |
| DELETE /api/admin/notifications/:id | 管理员删除；字段 revision |
| GET /api/notifications?page=1 | 本人的全部类型通知及未读数 |
| PUT /api/notifications/:id/read | 本人单条已读 |
| PUT /api/notifications/read | 本人全部已读 |
