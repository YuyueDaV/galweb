import test from 'node:test'
import assert from 'node:assert/strict'
import {startupDiagnostic} from '../src/startup-diagnostic'

test('启动失败区分数据库凭据、权限、缺表和连接问题',()=>{
  for(const [code,message] of [
    ['ER_ACCESS_DENIED_ERROR',/账号或密码/],
    ['ER_DBACCESS_DENIED_ERROR',/数据库授权/],
    ['ER_NO_SUCH_TABLE',/db:migrate/],
    ['ER_BAD_DB_ERROR',/数据库不存在/],
    ['ECONNREFUSED',/MySQL 服务/],
  ] as const){
    const result=startupDiagnostic({code,errno:1045},'database')
    assert.match(result.message,message)
    assert.equal(result.code,code)
    assert.equal(result.stage,'database')
  }
})
test('监听失败提示停止旧 API，不误导用户迁移数据库',()=>{
  const result=startupDiagnostic({code:'EADDRINUSE'},'listen')
  assert.match(result.message,/停止旧 API/)
  assert.doesNotMatch(result.message,/迁移|migrate/)
})
test('启动诊断仅输出阶段和安全错误码，不输出原始凭据或 SQL',()=>{
  const secret='private-test-password'
  for(const error of [null,new Error(secret),{code:secret,message:secret,sql:secret,cause:{password:secret},errno:secret}]){
    const text=JSON.stringify(startupDiagnostic(error,'application'))
    assert.doesNotMatch(text,new RegExp(secret))
    assert.match(text,/application/)
  }
})
