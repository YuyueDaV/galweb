import type { ForumPost, Work, Category, IconName } from '~/types/forum'

export const categories: { name: Category; icon: IconName; description: string; color: string }[] = [
  { name: '作品讨论', icon: 'book', description: '聊聊故事里的那些事', color: 'orange' },
  { name: '阅读手记', icon: 'pen', description: '把通关后的余韵留下', color: 'green' },
  { name: '同好闲聊', icon: 'comment', description: '故事之外，也想认识你', color: 'blue' },
  { name: '社团活动', icon: 'calendar', description: '下一次相遇，一起赴约', color: 'purple' },
]

export const works: Work[] = [
  { rank: 1, title: '命运石之门', subtitle: 'STEINS;GATE', studio: 'MAGES. / Nitroplus', description: '世界线交错之间，那份跨越无数次重来的约定，终于抵达。', nominator: '雾之瞳、Z-two', color: '#d6a44d' },
  { rank: 2, title: '装甲恶鬼村正', subtitle: 'FULL METAL DAEMON MURAMASA', studio: 'Nitroplus', description: '这不是英雄的故事。关于善恶、选择与代价的一次漫长叩问。', nominator: '西行寺幽幽子FUMO', color: '#7d6a93' },
  { rank: 3, title: '魔法使之夜', subtitle: 'WITCH ON THE HOLY NIGHT', studio: 'TYPE-MOON', description: '在那个尚且相信魔法的夜晚，三个人的生活悄然交汇。', nominator: 'hh第一次cos、热水不赖', color: '#74899b' },
  { rank: 4, title: '近月少女的礼仪', subtitle: 'TSUKI NI YORISOU OTOME NO SAHOU', studio: 'Navel', description: '从服装、梦想与相遇开始，寻找属于自己的舞台。', nominator: '雾之瞳', color: '#91a893' },
  { rank: 5, title: '白色相簿2', subtitle: 'WHITE ALBUM 2', studio: 'AQUAPLUS', description: '又到了白色相簿的季节。歌声停下之后，故事仍在继续。', nominator: 'Z-two', color: '#9babbc' },
  { rank: 6, title: '素晴日', subtitle: 'SUBARASHIKI HIBI', studio: '枕', description: '抬头看看天空吧，在那些不连续的日子里，寻找生活的答案。', nominator: '水上由岐、热水不赖', color: '#90b7b5' },
  { rank: 7, title: '9-nine- 系列', subtitle: '9-NINE-', studio: 'PALETTE', description: '九条街道，四季故事，与你共同作出的选择。', nominator: 'hh', color: '#b397bd' },
  { rank: 8, title: 'Fate/stay night', subtitle: 'FATE/STAY NIGHT', studio: 'TYPE-MOON', description: '愿你的理想，在命运的长夜中找到自己的答案。', nominator: 'JINBO、羽月', color: '#a78489' },
  { rank: 9, title: '樱之诗', subtitle: 'SAKURA NO UTA', studio: '枕', description: '关于美、关于艺术，也关于平凡日常里那些值得珍惜的瞬间。', nominator: '羽月', color: '#b9a3b0' },
  { rank: 10, title: 'CLANNAD', subtitle: 'CLANNAD', studio: 'Key', description: '小小的手心，连接起小镇与家人的故事。', nominator: '羽月', color: '#80a5b0' },
  { rank: 11, title: '秽翼的尤斯蒂娅', subtitle: 'EUSTIA OF THE TARNISHED WINGS', studio: 'AUGUST', description: '在摇摇欲坠的天空之城，思考生存与选择的重量。', nominator: '凯伊姆', color: '#aa9883' },
  { rank: 12, title: '甜蜜女友2', subtitle: 'AMAKANO 2', studio: 'あざらしそふと', description: '那些温柔而细碎的日常，正是想要珍藏的回忆。', nominator: '和泉智宏', color: '#cca0a8' },
]

export const coverUrl = (rank: number) => `/images/works/${rank}.${rank === 12 ? 'webp' : 'jpg'}`

export const initialPosts: ForumPost[] = [
  { id: 'welcome', title: '欢迎来到澄之响！在故事之外，找到你的同好', excerpt: '初次见面，这里是南京工程学院澄之响视觉小说同好会。先来认识一下彼此，也读一读这份小小的社区指南。', content: ['欢迎来到澄之响，一个属于南京工程学院视觉小说爱好者的小小角落。无论你刚刚读完第一部作品，还是已经走过许多条故事线，这里都为你留了一个位置。', '我们想把这里建成一个可以安心分享的地方：聊喜欢的角色，交换通关后的感想，收藏值得再读一遍的文字，也认识坐在屏幕另一端的同好。', '发帖前，请选择合适的分区。涉及关键剧情时，请开启剧透标记；讨论作品时，也请尊重不同的阅读感受。请勿发布盗版资源、个人隐私或未经允许的转载内容。', '这个页面目前是论坛雏形，展示内容与活动安排为示例。你发布的帖子、回复和收藏会保存在当前浏览器中。很高兴在这里遇见你。'], category: '社团活动', author: '澄之响编辑部', avatar: '澄', avatarColor: 'orange', time: '社区指南', createdAt: 100, replies: 12, views: 628, likes: 42, tags: ['新人必读', '社区指南'], pinned: true },
  { id: 'orange-awards', title: '第一届「十二橙器」结果公布！哪部作品是你心中的那一部？', excerpt: '十二部作品，十二种难以忘记的感动。来自同好会成员的提名与推荐，终于汇成了我们的第一份共同书单。', content: ['从一条提名、一段推荐词，到十二部作品组成的名单，第一届澄之响「十二橙器」记录了同好会成员的阅读记忆。', '命运石之门、装甲恶鬼村正、魔法使之夜……每一个名字背后，都有一个愿意为它认真写下推荐的人。排行榜继承自同好会原有的评选项目，不代表统一的阅读标准。', '你可以在「十二橙器」页面查看完整名单。也欢迎在这里聊聊：哪一部作品陪你走过了一段特别的时光？尽量用不剧透的方式，向还没读过的朋友推荐它吧。'], category: '社团活动', author: '澄之响编辑部', avatar: '澄', avatarColor: 'orange', time: '昨天 20:30', createdAt: 90, replies: 36, views: 412, likes: 28, tags: ['十二橙器', '成员票选'], image: 1, pinned: true, featured: true },
  { id: 'sakura-reading', title: '读完《樱之诗》之后，想再认真地看看这个世界', excerpt: '有些作品的结束，更像是一段生活的开始。关于艺术、日常，以及那些被我们忽略的小小幸福。', content: ['打出最后一个结尾之后，我没有立刻关掉窗口，而是把熟悉的音乐又听了一遍。', '最先留下来的不是某个宏大的问题，而是那些非常普通的生活片段：放学后的光、朋友随口说的一句话、画室里安静的下午。原来故事可以让人重新注意到这些事。', '这篇手记暂时不谈关键剧情，只想把通关时的心情记下来。也想问问大家，有没有哪部作品，让你在读完之后开始用不同的方式看待日常？'], category: '阅读手记', author: '羽月', avatar: '羽', avatarColor: 'pink', time: '28 分钟前', createdAt: 80, replies: 18, views: 236, likes: 31, tags: ['樱之诗', '无剧透'], image: 9, featured: true },
  { id: 'first-visual-novel', title: '你的第一部视觉小说是什么？来交换一下入坑故事吧', excerpt: '可能是一首偶然听到的 OP，也可能是朋友的一句「你一定要试试」。一切都是从哪里开始的呢？', content: ['今天和朋友聊起第一次接触视觉小说，发现每个人的开场都很不一样。有人因为音乐，有人因为动画，也有人只是想找一个可以安静读故事的晚上。', '对我来说，是朋友分享的一首主题曲。那时还不知道它会带来这么长的一段旅程。', '欢迎留下你的第一部作品，以及当时的一点小故事。不必写得很长，一句话也很好。'], category: '同好闲聊', author: '雾之瞳', avatar: '雾', avatarColor: 'blue', time: '1 小时前', createdAt: 70, replies: 27, views: 189, likes: 16, tags: ['入坑故事', '来聊聊'] },
  { id: 'witch-night', title: '《魔法使之夜》的演出，到底为什么让人念念不忘？', excerpt: '从画面切换、配乐到文字节奏，想聊聊那些只有视觉小说才能带来的瞬间。本文不涉及主线结局。', content: ['阅读《魔法使之夜》时，常常会忘记自己面对的其实是文字与静态画面。镜头、声音和段落之间的配合，让阅读有了一种非常特别的节奏。', '我尤其喜欢它处理安静场景的方式：不急着说完，把注意力留给环境和人物之间微妙的距离。', '你最喜欢的视觉小说演出是什么？欢迎分享场景的名字，涉及剧情细节时请在回复中提前提醒。'], category: '作品讨论', author: '热水不赖', avatar: '热', avatarColor: 'green', time: '2 小时前', createdAt: 60, replies: 14, views: 168, likes: 22, tags: ['魔法使之夜', '演出赏析'], image: 3 },
  { id: 'white-album', title: '又到了适合聊《白色相簿2》的季节', excerpt: '音乐响起的时候，很多记忆也一起回来了。关于选择与错过的一点通关随想。', content: ['天气慢慢变凉，歌单里又随机到了熟悉的旋律。于是想起那段读完以后很久都没有消散的心情。', '【剧透讨论区】这篇帖子面向已经通关的读者。选择的重量、人物之间的距离，以及我们如何理解不同结局，都可以在这里慢慢聊。', '请给还未阅读的朋友留一点余地，回复中的关键剧情也记得提前标注。'], category: '作品讨论', author: 'Z-two', avatar: 'Z', avatarColor: 'purple', time: '3 小时前', createdAt: 50, replies: 23, views: 204, likes: 19, tags: ['白色相簿2', '通关感想'], image: 5, spoiler: true },
  { id: 'weekend-music', title: '周末声音小聚：带一首你喜欢的视觉小说配乐', excerpt: '不需要准备长篇分享，带上一首歌和一点点喜欢它的理由，就可以加入。', content: ['想和大家一起办一次轻松的音乐分享。每个人带一首喜欢的视觉小说配乐，再讲讲它为什么留在了你的歌单里。', '活动时间与地点尚未确定，这是一条界面展示用的活动示例。正式安排会在社团活动分区确认后公布。', '也可以先在回复里留下曲名，慢慢攒成一份属于澄之响的共同歌单。'], category: '社团活动', author: '澄之响编辑部', avatar: '澄', avatarColor: 'orange', time: '昨天 18:20', createdAt: 40, replies: 9, views: 126, likes: 12, tags: ['音乐分享', '周末小聚'] },
]
