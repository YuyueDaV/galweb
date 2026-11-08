import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import sharp from 'sharp'
test('HTTP：来源限制、严格字段、邮件注册、Cookie 登录及 CSRF 退出',{skip:process.env.AUTH_INTEGRATION!=='1'},async()=>{
 assert.match(process.env.DB_NAME||'',/_test$/)
 const origin='http://127.0.0.1:3100',base='http://127.0.0.1:3299'
 const child=spawn(process.execPath,['dist/main.js'],{env:{...process.env,API_PORT:'3299',WEB_ORIGIN:origin,MAIL_TRANSPORT:'capture'},stdio:'ignore'})
 try{
  let ready=false;for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,100))}assert.equal(ready,true,'API starts with migrated MySQL')
  const post=(path:string,body:unknown,extra:Record<string,string>={})=>fetch(base+'/api/auth/'+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,...extra},body:JSON.stringify(body)})
  assert.equal((await post('registration-code',{email:'any@example.com'},{Origin:'https://untrusted.example'})).status,403)
  const probe=(headers:Record<string,string>)=>fetch(base+'/api/auth/registration-code',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:'{}'})
  assert.equal((await probe({Referer:origin+'/'})).status,422,'缺少 Origin、同源 Referer 可进入字段校验')
  assert.equal((await probe({'X-CZX-Client':'web'})).status,422,'来源头均缺失的同源 AJAX 可进入字段校验')
  assert.equal((await probe({'Sec-Fetch-Site':'same-origin'})).status,422)
  const unknown=await probe({});assert.equal(unknown.status,403);assert.equal((await unknown.json() as {code:string}).code,'REQUEST_ORIGIN_REJECTED')
  assert.equal((await probe({Origin:'null',Referer:origin+'/','X-CZX-Client':'web'})).status,403)
  assert.equal((await probe({Referer:'https://untrusted.example/','X-CZX-Client':'web'})).status,403)
  assert.equal((await probe({'Sec-Fetch-Site':'cross-site','X-CZX-Client':'web'})).status,403)
  const contentType=await fetch(base+'/api/auth/registration-code',{method:'POST',headers:{Origin:origin,'Content-Type':'text/plain','X-CZX-Client':'web'},body:'{}'});assert.equal(contentType.status,415);assert.equal((await contentType.json() as {code:string}).code,'REQUEST_CONTENT_TYPE_INVALID')
  const preflight=await fetch(base+'/api/auth/registration-code',{method:'OPTIONS',headers:{Origin:'https://untrusted.example','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'X-CZX-Client,Content-Type'}})
  assert.notEqual(preflight.headers.get('access-control-allow-origin'),'https://untrusted.example');assert.doesNotMatch(preflight.headers.get('access-control-allow-headers')||'',/x-czx-client/i)
  assert.equal((await post('register',{role:'super_admin'})).status,422)
  const email=`http-${randomUUID()}@example.com`,password='a secure test password 123'
  const username='u_'+randomUUID().replace(/-/g,'').slice(0,20);
  const sent=await post('registration-code',{email});assert.equal(sent.status,201);const payload=await sent.json() as {challengeId:string};assert.equal('code' in payload,false)
  const mail=JSON.parse(await readFile(`.data/mail/${payload.challengeId}.json`,'utf8')),code=mail.text.match(/\d{6}/)[0]
  assert.equal((await post('register',{email,password,confirmPassword:password,username,challengeId:payload.challengeId,code,role:'super_admin'})).status,422)
  assert.equal((await post('register',{email,password,confirmPassword:password+'different',username,challengeId:payload.challengeId,code})).status,422)
  assert.equal((await post('register',{email,password,confirmPassword:password,username,challengeId:payload.challengeId,code})).status,201)
  const secondEmail=`duplicate-${randomUUID()}@example.com`,second=await (await post('registration-code',{email:secondEmail})).json() as {challengeId:string};const secondMail=JSON.parse(await readFile(`.data/mail/${second.challengeId}.json`,'utf8'));assert.equal((await post('register',{email:secondEmail,password,confirmPassword:password,username:username.toUpperCase(),challengeId:second.challengeId,code:secondMail.text.match(/\d{6}/)[0]})).status,409)
  assert.equal((await post('login',{email,password})).status,422)
  const login=await post('login',{username,password});assert.equal(login.status,201);const cookie=login.headers.get('set-cookie')!;assert.match(cookie,/HttpOnly/i);assert.match(cookie,/SameSite=Lax/i)
  const identity=await login.json() as {csrfToken:string,user:{id:string,role:string}};assert.equal(identity.user.role,'member');const headers={Cookie:cookie.split(';')[0]!}
  const bootstrap=await fetch(base+'/api/auth/me',{headers});assert.equal(bootstrap.status,200)
  const sessionBootstrapData=await bootstrap.json() as {user:{id:string},csrfToken:string};assert.equal(sessionBootstrapData.user.id,identity.user.id);assert.equal(sessionBootstrapData.csrfToken,identity.csrfToken);assert.equal(bootstrap.headers.get('set-cookie'),null);assert.match(bootstrap.headers.get('cache-control')||'',/no-store/)
  const secureHeaders={...headers,'X-CSRF-Token':identity.csrfToken}
  const profile=await fetch(base+'/api/auth/me',{method:'PATCH',headers:{...secureHeaders,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({nickname:'自行设置的昵称'})});assert.equal(profile.status,200);const profileData=await profile.json() as {user:{username:string,nickname:string}};assert.equal(profileData.user.username,username);assert.equal(profileData.user.nickname,'自行设置的昵称')
  assert.equal((await fetch(base+'/api/auth/me',{method:'PATCH',headers:{...secureHeaders,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({username:'renamed_login'})})).status,422)
  assert.equal((await fetch(base+'/api/admin/posts',{headers})).status,403)
  const postResponse=await post('unused',{})
  assert.equal(postResponse.status,404)
  const create=await fetch(base+'/api/posts',{method:'POST',headers:{...secureHeaders,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({title:'HTTP 完整论坛流程',content:'验证真实请求的发帖、回复、收藏与上传。',category:'作品讨论',spoiler:false})});assert.equal(create.status,201);const postId=(await create.json() as {id:string}).id
  const change=(path:string,body:unknown,method='POST')=>fetch(base+'/api/'+path,{method,headers:{...secureHeaders,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)})
  const view=(agent='forum-test')=>fetch(base+`/api/posts/${postId}/views`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','User-Agent':agent},body:'{}'})
  assert.equal((await (await fetch(base+`/api/posts/${postId}`)).json() as {views:number}).views,0)
  for(let i=0;i<2;i++){const result=await view();assert.equal(result.status,201);assert.equal((await result.json() as {views:number}).views,1)}
  assert.equal((await (await view('another-test-browser')).json() as {views:number}).views,2)
  assert.equal((await (await fetch(base+`/api/posts/${postId}`)).json() as {views:number}).views,2)
  const fullText='中'.repeat(10000)
  const longPost=await change('posts',{title:'一万字中文正文测试',content:fullText,category:'作品讨论',spoiler:false})
  assert.equal(longPost.status,201);const longId=(await longPost.json() as {id:string}).id
  const longDetail=await (await fetch(base+'/api/posts/'+longId)).json() as {content:string[]};assert.equal(longDetail.content.join('\n\n'),fullText)
  const tooLong=await change('posts',{title:'正文超出字数限制',content:fullText+'中',category:'作品讨论',spoiler:false});assert.equal(tooLong.status,422);assert.match((await tooLong.json() as {message:string}).message,/10000/)
  const huge=await change('posts',{title:'请求体过大测试',content:'中'.repeat(50000),category:'作品讨论',spoiler:false});assert.equal(huge.status,413);assert.match((await huge.json() as {message:string}).message,/过大/)
  const malformed=await fetch(base+'/api/posts',{method:'POST',headers:{...secureHeaders,Origin:origin,'Content-Type':'application/json'},body:'{"title":'});assert.equal(malformed.status,400);assert.match((await malformed.json() as {message:string}).message,/格式错误/)
  assert.equal((await fetch(base+'/api/posts?tab=invalid')).status,422)
  assert.equal((await change(`posts/${postId}/replies`,{content:'一条真实接口回复。'})).status,201)
  for(let i=0;i<2;i++)assert.equal((await change(`posts/${postId}/reactions`,{kind:'bookmark',active:true},'PUT')).status,200)
  const mine=await (await fetch(base+'/api/forum/me',{headers})).json() as {bookmarks:string[]};assert.equal(mine.bookmarks.filter(id=>id===postId).length,1)
  const form=new FormData();form.append('file',new Blob([await sharp({create:{width:20,height:30,channels:3,background:'orange'}}).png().toBuffer()]),'test.png')
  const uploaded=await fetch(base+'/api/uploads',{method:'POST',headers:{...secureHeaders,Origin:origin},body:form});assert.equal(uploaded.status,201);const asset=await uploaded.json() as {id:string,url:string};const image=await fetch(base+asset.url);assert.equal(image.status,200);assert.match(image.headers.get('content-type')||'',/image\/webp/)
  const illustratedTitle='自上传图片的帖子 '+username
  const illustrated=await change('posts',{title:illustratedTitle,content:'这篇帖子使用了刚刚上传的图片。',category:'作品讨论',spoiler:false,assetId:asset.id});assert.equal(illustrated.status,201)
  const illustratedId=(await illustrated.json() as {id:string}).id
  const feed=await (await fetch(base+'/api/posts?q='+encodeURIComponent(illustratedTitle)+'&limit=6')).json() as {items:{id:string,uploadedImage:string}[],total:number};assert.equal(feed.total,1);assert.equal(feed.items[0]!.id,illustratedId);assert.equal(feed.items[0]!.uploadedImage,asset.url)
  const patchProfile=(body:unknown,withCsrf=true)=>fetch(base+'/api/auth/me',{method:'PATCH',headers:{...(withCsrf?secureHeaders:headers),Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)})
  assert.equal((await patchProfile({signature:'缺少校验'},false)).status,403)
  assert.equal((await patchProfile({signature:'长'.repeat(121)})).status,422)
  assert.equal((await patchProfile({avatarAssetId:randomUUID()})).status,422)
  assert.equal((await patchProfile({avatarUrl:'https://example.com/avatar.png'})).status,422)
  assert.equal((await patchProfile({role:'super_admin',signature:'越权'})).status,422)
  assert.equal((await patchProfile({signature:'故事之外，也有新的回响。',avatarAssetId:asset.id})).status,200)
  const restored=await (await fetch(base+'/api/auth/me',{headers})).json() as {user:{username:string,signature:string,avatarUrl:string,role:string}}
  assert.equal(restored.user.username,username);assert.equal(restored.user.signature,'故事之外，也有新的回响。');assert.equal(restored.user.avatarUrl,asset.url);assert.equal(restored.user.role,'member')
  const detail=await (await fetch(base+'/api/posts/'+postId)).json() as {avatarUrl:string};assert.equal(detail.avatarUrl,asset.url)
  const replies=await (await fetch(base+`/api/posts/${postId}/replies`)).json() as {avatarUrl:string}[];assert.equal(replies[0]!.avatarUrl,asset.url)
  assert.equal((await post('register',{email:secondEmail,password,confirmPassword:password,username:username+'x',challengeId:second.challengeId,code:secondMail.text.match(/\d{6}/)[0]})).status,201)
  const otherLogin=await post('login',{username:username+'x',password}),otherIdentity=await otherLogin.json() as {csrfToken:string},otherCookie=otherLogin.headers.get('set-cookie')!.split(';')[0]!
  const otherProfile=await fetch(base+'/api/auth/me',{method:'PATCH',headers:{Cookie:otherCookie,'X-CSRF-Token':otherIdentity.csrfToken,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({avatarAssetId:asset.id})});assert.equal(otherProfile.status,422)
  assert.equal((await patchProfile({signature:'',avatarAssetId:null})).status,200)
  const cleared=await (await fetch(base+'/api/auth/me',{headers})).json() as {user:{signature:string,avatarUrl:null}};assert.equal(cleared.user.signature,'');assert.equal(cleared.user.avatarUrl,null)
  const invalid=new FormData();invalid.append('file',new Blob(['<svg onload="alert(1)"></svg>'],{type:'image/png'}),'bad.png');assert.equal((await fetch(base+'/api/uploads',{method:'POST',headers:{...secureHeaders,Origin:origin},body:invalid})).status,422)
  assert.equal((await post('logout',{},headers)).status,403)
  assert.equal((await post('logout',{}, {...headers,'X-CSRF-Token':identity.csrfToken})).status,201)
  assert.equal((await fetch(base+'/api/auth/me',{headers})).status,401)
  const again=await post('login',{username,password}),againData=await again.json() as {csrfToken:string},deleteCookie=again.headers.get('set-cookie')!.split(';')[0]!
  const device=await post('login',{username,password}),deviceCookie=device.headers.get('set-cookie')!.split(';')[0]!
  const remove=(body:unknown,csrf=true)=>fetch(base+'/api/auth/me',{method:'DELETE',headers:{Cookie:deleteCookie,Origin:origin,'Content-Type':'application/json',...(csrf?{'X-CSRF-Token':againData.csrfToken}:{})},body:JSON.stringify(body)})
  assert.equal((await remove({password,confirmation:'注销账号'},false)).status,403)
  assert.equal((await remove({password,confirmation:'不确认'})).status,422)
  assert.equal((await remove({password:'incorrect',confirmation:'注销账号'})).status,422)
  assert.equal((await remove({password,confirmation:'注销账号',userId:randomUUID()})).status,422)
  const removed=await remove({password,confirmation:'注销账号'});assert.equal(removed.status,200);assert.match(removed.headers.get('set-cookie')||'',/1970/)
  assert.equal((await fetch(base+'/api/auth/me',{headers:{Cookie:deleteCookie}})).status,401)
  assert.equal((await fetch(base+'/api/auth/me',{headers:{Cookie:deviceCookie}})).status,401)
  assert.equal((await post('login',{username,password})).status,401)
  assert.equal((await fetch(base+asset.url)).status,404)
  const anonymous=await (await fetch(base+'/api/posts/'+illustratedId)).json() as {author:string,avatarUrl:null,uploadedImage?:string};assert.equal(anonymous.author,'已注销用户');assert.equal(anonymous.avatarUrl,null);assert.equal(anonymous.uploadedImage,undefined)
  // Use another email for the same released login name; the same-email full loop
  // and the retained email cooldown are covered by account-deletion.test.ts.
  const recycledName=await post('register',{email:secondEmail,password,confirmPassword:password,username,challengeId:second.challengeId,code:secondMail.text.match(/\d{6}/)[0]})
  assert.equal(recycledName.status,422,'previously consumed verification code cannot register a new identity')
 }finally{child.kill();await new Promise<void>(resolve=>{if(child.exitCode!==null)resolve();else child.once('exit',()=>resolve())})}
})
