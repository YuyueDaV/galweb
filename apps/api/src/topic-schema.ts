import { z } from 'zod'
import { MAX_POST_TOPICS, normalizeTopic, uniqueTopics, validTopic } from './post-topics'

export const topicSchema = z
  .string()
  .max(100, '话题最多 24 个字符。')
  .transform(normalizeTopic)
  .refine(validTopic, '话题须为 1–24 个字符，不能包含 #、尖括号或控制字符。')
export const topicsSchema = z
  .array(topicSchema)
  .max(MAX_POST_TOPICS, '每篇帖子最多选择 5 个话题。')
  .transform(uniqueTopics)
