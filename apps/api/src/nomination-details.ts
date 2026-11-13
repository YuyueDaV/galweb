import { z } from 'zod'
import { qqNominationSchema, qqNominationRevision } from './qq-nominations'

export const nominationDetailsSchema = z
  .object({
    entries: z
      .array(
        qqNominationSchema.extend({
          id: z.uuid(),
          nominatorName: qqNominationSchema.shape.nominatorName.min(1, '请填写提名人。'),
          reason: z.string().trim().max(600, '提名词最多 600 个字符。'),
        }),
      )
      .min(1, '请至少选择一条提名记录。')
      .max(1000)
      .refine(
        (entries) => new Set(entries.map((entry) => entry.id)).size === entries.length,
        '提名记录不能重复。',
      ),
  })
  .strict()

export const nominationDetailsRevision = qqNominationRevision
