# 十二橙器后端

前后端已接通：Nuxt `/api` 代理 → NestJS → MySQL。运行与部署见 [deployment.md](deployment.md)，数据库实际结构以 `apps/api/src/schema.ts` 为准。

## 届次和规则

- 第一届 `/ranking` 保留原只读书单，不补造选票。
- 第二届起默认筹备中，四个日期为空，前台显示“时间待公布”。3 / 12 / 12 为可编辑初值，管理员在开放前确认。
- 状态顺序 `draft → nomination → voting → results → archived`，由管理员推进；有配置日期时提交还必须处于对应窗口。
- 开放提名后锁定名额，公布后配置只读。配置和阶段推进携带 version，避免旧页面覆盖新设置。
- 提名默认 pending，管理员通过或填写原因退回；成员可撤回本人提名。退回和撤回不占有效名额。同一作品规范化后合并候选，保留各位推荐语。
- 进入投票前必须处理所有待审核提名，且至少一部候选通过。进入投票后不能再修改提名。
- 每人每届一张有效选票，每部最多一票；修改整张替换。服务端事务和唯一约束防止重复计票，version 阻止旧标签页覆盖。
- 撤回选票保留递增的版本记录，空选票不计入投票人数或结果。再次提交仍须携带最新版本，避免撤回、重投后的版本重复问题。
- 投票期间公开接口不返回实时票数、他人的选票、待审核记录或审计日志；成员可查看本人提名、反馈与选票，管理员可查看审核队列和参与总量。
- 公布时事务生成固定结果快照，并锁定写入。按票数降序，同票并列并跳号；仅得票大于零且排名不超入选名额的作品入选，边界同票可能使数量超额。

## 角色

| 能力 | 普通成员 | 管理员 | 超级管理员 |
| --- | --- | --- | --- |
| 提名和投票、撤回本人记录 | ✓ | ✓ | ✓ |
| 配置当届活动、审核、推进到公布 | — | ✓ | ✓ |
| 创建届次、归档、查看及启停账号 | — | ✓ | ✓ |
| 分配角色 | — | — | ✓ |

角色来自数据库和有效登录会话。活动写请求在事务内重新校验账号状态及权限；系统始终保留至少一名有效超级管理员，变更角色会撤销受影响账号的会话。

## 数据表

| 表 | 用途 |
| --- | --- |
| award_campaigns | 届次唯一、活动配置 JSON、version |
| award_candidates | 规范化标题在当届唯一，关联作品资料与封面 |
| award_nominations | 成员、候选、审核状态、推荐语和反馈 |
| award_ballots | (campaign_id, user_id) 唯一；选票 JSON 与递增版本 |
| award_results | 每届唯一的公布结果快照及有效选票数 |
| system_locks | 活动与权限变更的事务串行化入口 |
| audit_logs | 服务端追加的配置、审核、参与和权限操作记录 |

同一活动的提名、审核、选票与推进操作先锁活动行再校验并写入，保证并发配额与关票时的一致性。持久化时间使用 UTC，页面按 UTC+8 展示。

## 实际接口

| 接口 | 用途 |
| --- | --- |
| GET /api/award-campaigns | 届次列表 |
| GET /api/award-campaigns/:id | 根据会话权限返回公开、本人与管理所需数据 |
| POST /api/admin/award-campaigns | 管理员创建草稿 |
| PATCH /api/admin/award-campaigns/:id | 管理员保存配置，携带 version |
| POST /api/admin/award-campaigns/:id/transitions | 推进阶段，携带 phase 与 version |
| POST /api/award-campaigns/:id/nominations | 提名 title / studio / reason |
| PATCH /api/award-campaigns/:id/nominations/:nominationId | status=withdrawn / approved / rejected，退回必须附 note |
| PUT /api/award-campaigns/:id/ballot | candidateIds 与 version；candidateIds=null 撤回 |
| GET /api/admin/users | 管理员查看账号列表（含头像地址） |
| PATCH /api/admin/users/:id | 管理员修改账号状态；角色变更仅限超级管理员 |

写接口要求有效会话、同源请求与 CSRF 校验；提名与投票有独立限流。失败使用 401、403、404、409、422 或 429，客户端必须处理异常后刷新状态。

评选规则在前端 `app/utils/awards.ts` 和类型中维护，通过 `scripts/sync-award-rules.mjs` 同步至 API；构建命令会自动执行同步。服务端规则和数据库事务是最终裁决依据，前端只负责交互提示。
