import test from 'node:test'
import assert from 'node:assert/strict'
import { verifiedRequestOrigin } from '../src/request-origin'

test('来源校验：正常 Origin、缺失来源头的同源兼容与外站隔离', () => {
  const allowed = 'https://forum.example.com'
  for (const headers of [
    { origin: allowed },
    { origin: 'https://FORUM.example.com:443' },
    { referer: allowed + '/account?tab=register' },
    { fetchSite: 'same-origin' },
    { client: 'web' },
  ])
    assert.equal(verifiedRequestOrigin(headers, allowed), allowed)
  for (const headers of [
    {},
    { origin: 'null', referer: allowed + '/', client: 'web' },
    { origin: '', referer: allowed + '/' },
    { origin: 'https://evil.example', referer: allowed + '/', client: 'web' },
    { origin: allowed + '/post', client: 'web' },
    { origin: allowed + '?query=1' },
    { origin: 'https://forum.example.com.evil.example' },
    { referer: 'https://evil.example/', client: 'web', fetchSite: 'same-origin' },
    { referer: 'invalid', client: 'web' },
    { client: 'web', fetchSite: 'cross-site' },
    { client: 'web', fetchSite: 'same-site' },
    { origin: allowed, fetchSite: 'cross-site' },
    { origin: 'https://forum.example.com:444' },
    { origin: 'http://forum.example.com' },
    { origin: 'https://attacker@forum.example.com' },
  ])
    assert.equal(verifiedRequestOrigin(headers, allowed), null, JSON.stringify(headers))
})
