import {HttpException} from '@nestjs/common'

export function apiError(error:unknown):{statusCode:number,message:string}{
 const details=error as {type?:string,status?:number}
 if(details?.type==='entity.too.large')return {statusCode:413,message:'提交内容过大，请缩短正文后重试。'}
 if(details?.type==='entity.parse.failed')return {statusCode:400,message:'请求内容格式错误，请刷新页面后重试。'}
 if(error instanceof HttpException){
  const statusCode=error.getStatus()
  if(statusCode===400)return {statusCode,message:'请求内容格式错误，请检查后重试。'}
  if(statusCode===413)return {statusCode,message:'上传文件或提交内容过大，请缩小后重试。'}
  return {statusCode,message:error.message}
 }
 return {statusCode:500,message:'服务暂时不可用，请稍后再试。'}
}
