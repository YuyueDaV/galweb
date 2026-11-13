import { z } from 'zod'
import { qqNominationSchema, qqNominationRevision } from './qq-nominations'

const details = qqNominationSchema.omit({ revision: true }).extend({
  reason: z.string().trim().max(600, '提名词最多 600 个字符。'),
  source: z
    .string()
    .trim()
    .max(80, '提名来源最多 80 个字符。')
    .refine(
      (value) =>
        [...value].every((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127),
      '提名来源不能包含换行或控制字符。',
    )
    .optional(),
})
const reference = z.object({ id: z.uuid(), revision: qqNominationSchema.shape.revision }).strict()
export const nominationDetailsSchema = z
  .object({
    entries: z.array(details.extend(reference.shape)).max(1000).default([]),
    additions: z.array(details).max(100, '每次最多新增 100 位提名人。').default([]),
    removals: z.array(reference).max(1000).default([]),
    candidateId: z.uuid().optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (!input.entries.length && !input.additions.length && !input.removals.length)
      ctx.addIssue({ code: 'custom', message: '请先增加、删除或修改提名信息。' })
    const ids = [...input.entries, ...input.removals].map((entry) => entry.id)
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: 'custom', message: '同一条记录不能重复修改或同时删除。' })
    if (input.additions.length && !input.candidateId)
      ctx.addIssue({ code: 'custom', message: '新增提名人时请选择候选作品。' })
  })

export const candidateEditSchema = z
  .object({
    workId: z.number({ error: '作品来源信息缺失，请刷新页面后重试。' }).int().positive().max(2147483647),
    title: z.string().trim().min(1, '请填写作品名称。').max(160),
    subtitle: z.string().trim().max(160),
    studio: z.string().trim().max(200),
    description: z.string().trim().max(8000),
    version: z.number().int().min(0),
  })
  .strict()

export const candidateLinkSchema = z
  .object({
    currentWorkId: z.number().int().positive().max(2147483647),
    currentVersion: z.number().int().min(0),
    workId: z.number().int().positive().max(2147483647),
    version: z.number().int().min(0),
  })
  .strict()

export const nominationDetailsRevision = qqNominationRevision
