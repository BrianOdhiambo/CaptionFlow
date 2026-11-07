import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCaptionFlowDemoServer } from './server.mjs';

const transcript = {videoId:'health-clip',sourceLanguage:'en',segments:[
 {id:'one',start:0.4,end:2.3,text:'The clinic opens Friday at 2:00 PM.',language:'en'},
 {id:'two',start:2.4,end:4.1,text:'Bring your questions.',language:'en'},
]};

test('real Gemini text adapter through HTTP server: translates and summarizes using text-only requests',async()=>{
 let gatewayCalls=0;
 const gateway=createServer(async(req,res)=>{
  gatewayCalls++;
  assert.equal(req.url,'/api/public/gemini/v1beta/models/gemini-3.8-flash:generateContent');
  assert.equal(req.headers['x-goog-api-key'],'dummy-gateway-secret');
  let body='';for await(const chunk of req)body+=chunk;
  const input=JSON.parse(body);
  assert.equal(input.contents[0].parts[0].inlineData,undefined);
  const prompt=input.contents[0].parts[0].text;
  const text=prompt.includes('Translate each caption')
    ? { translations:[{id:'one',text:'Kliniki inafunguliwa Ijumaa saa 2:00 PM.'},{id:'two',text:'Leta maswali yako.'}] }
    : { points:['The clinic opens Friday at 2:00 PM.','Visitors should bring questions.'] };
  res.writeHead(200,{'Content-Type':'application/json'});
  res.end(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(text)}]}}]}));
 });
 const storageDir=await mkdtemp(join(tmpdir(),'captionflow-real-text-server-'));
 let app;
 try {
  gateway.listen(0,'127.0.0.1');await once(gateway,'listening');
  app=await createCaptionFlowDemoServer({storageDir,userId:'test-gemini-text',hostedProtocol:'gemini',
   hostedUrl:`http://127.0.0.1:${gateway.address().port}/api/public/gemini`,
   hostedToken:'dummy-gateway-secret',hostedModel:'gemini-3.8-flash'});
  app.listen(0,'127.0.0.1');await once(app,'listening');
  const base=`http://127.0.0.1:${app.address().port}`;
  const caps=await(await fetch(`${base}/api/providers`)).json();
  assert.equal(caps.textAI,true);
  const translated=await fetch(`${base}/api/translate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({transcript,targetLanguage:'sw',consent:true})});
  const t=await translated.json();assert.equal(translated.status,200,JSON.stringify(t));
  assert.equal(t.captions[0].language,'sw');
  assert.equal(t.captions[0].start,0.4);
  assert.equal(t.captions[0].mode,'translated');
  const summarized=await fetch(`${base}/api/summarize`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({transcript,language:'en',consent:true})});
  const s=await summarized.json();assert.equal(summarized.status,200,JSON.stringify(s));
  assert.equal(s.points.length,2);
  assert.equal(gatewayCalls,2);
 }finally {
  if(app)await new Promise(resolve=>app.close(resolve));
  await new Promise(resolve=>gateway.close(resolve));
  await rm(storageDir,{recursive:true,force:true});
 }
});