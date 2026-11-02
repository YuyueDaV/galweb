import test from 'node:test'
import assert from 'node:assert/strict'
import {HttpException} from '@nestjs/common'
import {apiError} from '../src/http-errors'

test('错误响应：请求体超限、原始与 Nest 包装后的 JSON 错误、业务错误及未知错误',()=>{
 assert.equal(apiError({type:'entity.too.large'}).statusCode,413)
 assert.match(apiError({type:'entity.parse.failed'}).message,/格式错误/)
 assert.match(apiError(new HttpException('Unexpected end of JSON input',400)).message,/格式错误/)
 assert.match(apiError(new HttpException('File too large',413)).message,/过大/)
 assert.deepEqual(apiError(new HttpException('正文最多 10000 个字符。',422)),{statusCode:422,message:'正文最多 10000 个字符。'})
 assert.deepEqual(apiError(new Error('private database diagnostics')),{statusCode:500,message:'服务暂时不可用，请稍后再试。'})
})
