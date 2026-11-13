export type Category = '作品讨论' | '阅读手记' | '同好闲聊' | '社团活动'
export type IconName = 'home' | 'forum' | 'library' | 'trophy' | 'calendar' | 'users' | 'search' | 'arrowUpRight' | 'arrowRight' | 'plus' | 'chevronDown' | 'chevronRight' | 'sun' | 'moon' | 'menu' | 'close' | 'comment' | 'eye' | 'heart' | 'bookmark' | 'pin' | 'flame' | 'sparkles' | 'filter' | 'clock' | 'hash' | 'check' | 'send' | 'arrowLeft' | 'quote' | 'info' | 'copy' | 'leaf' | 'image' | 'bell' | 'login' | 'pen' | 'external' | 'book' | 'star' | 'more'

export interface ForumPost {
  status?: 'published'|'hidden'|'deleted'
  format?: 'plain'|'markdown'
  body?: string
  assetIds?: string[]
  workId?: number|null
  avatarUrl?: string|null
  userId?: string
  uploadedImage?: string
  id: string
  title: string
  excerpt: string
  content: string[]
  category: Category
  author: string
  avatar: string
  avatarColor: string
  time: string
  createdAt: number
  replies: number
  views: number
  likes: number
  tags: string[]
  image?: number
  pinned?: boolean
  featured?: boolean
  spoiler?: boolean
}

export interface Work {
  submittedForAwards?: boolean
  catalogDeleted?:boolean
  coverUrl?:string
  addedBy?:{id:string|null;name:string}|null
  addedAt?:number
  archiveRank?: number
  awardHonors?: {campaignId:string;edition:number;rank:number}[]
  version?: number
  bangumi?: import('./catalog').BangumiSubject
  rank: number
  title: string
  subtitle: string
  studio: string
  description: string
  nominator: string
  color: string
}

export interface Reply {
  threadId?: string
  parentUnavailable?: boolean
  createdAt?: number
  parentId?: string|null
  parentAuthor?: string|null
  userId?: string
  avatarUrl?: string|null
  id: string
  postId: string
  author: string
  content: string
  time: string
}
