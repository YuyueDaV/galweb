import test from 'node:test'
import assert from 'node:assert/strict'
import { hashPassword,checkPassword,emailKey,mac,equal,token,digest } from '../src/security'
test('密码哈希含独立盐且错误密码不能通过',async()=>{const a=await hashPassword('correct horse battery staple'),b=await hashPassword('correct horse battery staple');assert.notEqual(a,b);assert.equal(await checkPassword('correct horse battery staple',a),true);assert.equal(await checkPassword('wrong',a),false)})
test('验证码摘要绑定挑战与用途；邮箱加号和点保留',()=>{assert.notEqual(mac('secret','challenge:registration:123456'),mac('secret','challenge:reset:123456'));assert.equal(emailKey(' A.B+club@Example.COM '),'a.b+club@example.com');assert.equal(equal('a','longer'),false);assert.notEqual(digest(token()),digest(token()))})
