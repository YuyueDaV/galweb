import { z } from 'zod'
import { digest } from './security'
import type { AwardNomination } from './award-types'

export const qqNominationSchema = z
  .object({
    nominatorName: z
      .string()
      .trim()
      .min(1, '请填写QQ群提名人。')
      .max(64)
      .refine(
        (value) =>
          [...value].every((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127),
        '提名人不能包含换行或控制字符。',
      ),
    nominatedAt: z
      .string()
      .datetime({ offset: true })
      .refine((value) => Date.parse(value) <= Date.now(), '提名时间不能晚于当前时间。'),
    revision: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()

export function qqNominationRevision(nomination: AwardNomination) {
  return digest(
    JSON.stringify([
      nomination.id,
      nomination.status,
      nomination.accountId,
      nomination.accountName,
      nomination.createdAt,
      nomination.qqSync || null,
    ]),
  )
}
