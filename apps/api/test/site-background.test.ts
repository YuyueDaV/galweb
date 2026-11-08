import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readConfig } from '../src/config'
import { Database } from '../src/database'
import { Platform, type Actor } from '../src/platform'
import { Community, backgroundSchema, defaultSettings } from '../src/community'
import { DEFAULT_SITE_BACKGROUND, normalizeSiteBackground } from '../src/site-background'

test('背景配置只接收上传图片 ID 和六位颜色，旧配置使用默认背景', () => {
  assert.deepEqual(normalizeSiteBackground(undefined), DEFAULT_SITE_BACKGROUND)
  assert.deepEqual(
    normalizeSiteBackground({
      mode: 'solid',
      color: '#AABBCC',
      darkColor: 'url(javascript:alert(1))',
      assetId: 'https://example.com/x',
    }),
    { ...DEFAULT_SITE_BACKGROUND, mode: 'solid', color: '#aabbcc' },
  )
  for (const input of [
    { ...DEFAULT_SITE_BACKGROUND, color: 'red;}' },
    { ...DEFAULT_SITE_BACKGROUND, assetId: '../../.env' },
    { ...DEFAULT_SITE_BACKGROUND, url: 'https://example.com/x' },
    { ...DEFAULT_SITE_BACKGROUND, mode: 'video' },
  ])
    assert.equal(backgroundSchema.safeParse(input).success, false)
})

test(
  '站点背景：管理员权限、图片归属、共享维护、版本冲突、隐藏删除回退与旧客户端兼容',
  { skip: process.env.AUTH_INTEGRATION !== '1' },
  async () => {
    const config = readConfig()
    assert.match(config.DB_NAME, /_test$/)
    const db = new Database(config),
      community = new Community(db, new Platform(db)),
      actors: Actor[] = [],
      assetIds: string[] = []
    const previous = (
      await db.rows<{ data: string; version: number }>('SELECT data,version FROM site_settings WHERE id=1')
    )[0]
    try {
      for (const role of ['admin', 'super_admin', 'member']) {
        const id = randomUUID(),
          email = id + '@example.com'
        await db.execute(
          'INSERT INTO users(id,email,email_key,nickname,password_hash,role,email_verified_at,created_at) VALUES (?,?,?,?,?,?,?,?)',
          [id, email, email, role, 'unused-fixture', role, Date.now(), Date.now()],
        )
        actors.push({ id, nickname: role, role, status: 'active' })
      }
      const [admin, owner, member] = actors as [Actor, Actor, Actor]
      for (const actor of [admin, member]) {
        const id = randomUUID()
        assetIds.push(id)
        await db.execute(
          'INSERT INTO assets(id,user_id,width,height,bytes,created_at) VALUES (?,?,?,?,?,?)',
          [id, actor.id, 1600, 900, 10, Date.now()],
        )
      }
      let current = await community.settings()
      const custom = { ...DEFAULT_SITE_BACKGROUND, assetId: assetIds[0]! }
      await assert.rejects(
        () =>
          community.saveSettings(member, {
            ...defaultSettings,
            version: current.version,
            background: custom,
          }),
        /管理员/,
      )
      await assert.rejects(
        () =>
          community.saveSettings(admin, {
            ...defaultSettings,
            version: current.version,
            background: { ...custom, assetId: assetIds[1]! },
          }),
        /不属于/,
      )
      current = await community.saveSettings(admin, {
        ...defaultSettings,
        version: current.version,
        background: custom,
      })
      assert.equal((await community.settings()).background.assetId, assetIds[0])
      await assert.rejects(
        () => community.saveSettings(admin, { ...current, version: current.version - 1 }),
        /刷新/,
      )
      current = await community.saveSettings(owner, {
        ...current,
        description: '另一位管理员也能维护当前背景。',
      })
      const { background: _background, ...legacy } = current
      current = await community.saveSettings(admin, { ...legacy, title: '旧客户端只修改文案' })
      assert.deepEqual(current.background, custom, '旧客户端未提交背景时不得重置已有配置')
      await db.execute("UPDATE assets SET status='hidden' WHERE id=?", [assetIds[0]!])
      assert.equal((await community.settings()).background.assetId, null)
      await assert.rejects(() => community.saveSettings(admin, { ...current, background: custom }), /不可用/)
      await db.execute("UPDATE assets SET status='active' WHERE id=?", [assetIds[0]!])
      assert.equal((await community.settings()).background.assetId, assetIds[0])
      await db.execute('DELETE FROM assets WHERE id=?', [assetIds[0]!])
      assert.equal((await community.settings()).background.assetId, null)
      current = await community.saveSettings(owner, {
        ...current,
        background: { ...DEFAULT_SITE_BACKGROUND, mode: 'solid', color: '#e8eef5', darkColor: '#1b2532' },
      })
      assert.equal((await community.settings()).background.mode, 'solid')
      await db.execute("UPDATE users SET role='member' WHERE id=?", [admin.id])
      await assert.rejects(() => community.saveSettings(admin, current), /管理员/)
      await db.execute("UPDATE site_settings SET data=JSON_REMOVE(data,'$.background') WHERE id=1")
      assert.deepEqual((await community.settings()).background, DEFAULT_SITE_BACKGROUND)
    } finally {
      if (previous)
        await db.execute('UPDATE site_settings SET data=?,version=? WHERE id=1', [
          typeof previous.data === 'string' ? previous.data : JSON.stringify(previous.data),
          previous.version,
        ])
      else await db.execute('DELETE FROM site_settings WHERE id=1')
      await db.pool.end()
    }
  },
)
