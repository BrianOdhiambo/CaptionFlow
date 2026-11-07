import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createCaptionFlowDemoServer } from './server.mjs';

const transcript={videoId:'video-123',sourceLanguage:'en',segments:[
  {id:'a',start:0,end:2,text:'The campaign starts Friday at 2:00 PM.',language:'en'},
  {id:'b',start:2,end:5,text:'Please come to the clinic.',language:'en'},
]};
async function launch(options,fn) {
 const storageDir=await mkdtemp(join(tmpdir(),'captionflow-text-ai-store-'));
 const server=await createCaptionFlowDemoServer({storageDir,userId:'test-text-ai',...options});
 try {
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  await fn(`http://127.0.0.1:${server.address().port}`);
 }finally {await new Promise(r=>server.close(r));await rm(storageDir,{recursive:true,force:true});}
}
const send=(base,path,body,headers={'Content-Type':'application/json'})=>fetch(`${base}${path}`,{method:'POST',headers,body:JSON.stringify(body)});

test('translation and summary routes require consent and never retranscribe or upload media', async()=>{
 let translated=0, summarized=0;
 const textService={
  async translate({transcript:t,targetLanguage}) {
   translated++;assert.equal(t.videoId,'video-123');assert.equal(targetLanguage,'sw');
   return {videoId:t.videoId,targetLanguage,captions:[
    {id:'a',start:0,end:2,originalText:t.segments[0].text,displayText:'Kampeni inaanza Ijumaa saa 2:00 PM.',language:'sw',mode:'translated',status:'needs-review'},
    {id:'b',start:2,end:5,originalText:t.segments[1].text,displayText:'Tafadhali njoo kliniki.',language:'sw',mode:'translated',status:'needs-review'},
   ],warnings:[]};
  },
  async summarize({transcript:t,language}) {
   summarized++; assert.equal(language,'en');
   return {videoId:t.videoId,language,points:['The campaign starts on Friday.','People should go to the clinic.'],status:'needs-review'};
  },
 };
 await launch({textService},async(base)=>{
  const provider=await(await fetch(`${base}/api/providers`)).json();
  assert.equal(provider.textAI,true);
  assert.equal((await send(base,'/api/translate',{transcript,targetLanguage:'sw'})).status,400);
  assert.equal((await send(base,'/api/summarize',{transcript,language:'en'})).status,400);
  assert.equal((await send(base,'/api/translate',{transcript,targetLanguage:'sw',consent:true},{'Content-Type':'text/plain'})).status,415);
  const t=await send(base,'/api/translate',{transcript,targetLanguage:'sw',consent:true});
  assert.equal(t.status,200,(await t.clone().text()));
  assert.equal((await t.json()).captions[0].language,'sw');
  const s=await send(base,'/api/summarize',{transcript,language:'en',consent:true});
  assert.equal(s.status,200);
  assert.equal((await s.json()).points.length,2);
  assert.equal(translated,1);assert.equal(summarized,1);
  assert.equal((await fetch(`${base}/caption-view.mjs`)).status,200);
  const html=await (await fetch(base)).text();
  assert.doesNotMatch(html,/Translate captions with AI/);
 });
});

test('unconfigured text AI reports 503 and hides capability flag',async()=>{
 await launch({},async(base)=>{
  const caps=await(await fetch(`${base}/api/providers`)).json();
  assert.equal(caps.textAI,false);
  const r=await send(base,'/api/translate',{transcript,targetLanguage:'sw',consent:true});
  assert.equal(r.status,503);
 });
});