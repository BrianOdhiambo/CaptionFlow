import test from 'node:test';
import assert from 'node:assert/strict';
import { createGeminiTextService } from '../src/providers/gemini-text.mjs';

const transcript = {
  videoId: 'video-1', sourceLanguage: 'en', segments: [
    { id: 'a', start: 0.5, end: 3.7, language: 'en', text: 'The campaign starts on Friday at 2:00 PM.' },
    { id: 'b', start: 4.1, end: 6.6, language: 'en', text: 'Please visit the public library.' },
    { id: 'c', start: 7.0, end: 9.4, language: 'en', text: 'The cost is 20 shillings.' },
  ],
};
function geminiReply(value) { return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }] }); }
function service(fetchImpl, extras={}) { return createGeminiTextService({ endpoint:'http://127.0.0.1:9000/gemini', token:'mock-key', fetchImpl, ...extras }); }

test('Gemini translation uses text-only JSON and returns same timings with review flags', async () => {
  const calls=[];
  const x = service(async(url,init)=>{
    calls.push({url:url.href,init});
    return geminiReply({ translations: [
      {id:'a',text:'Kampeni inaanza Ijumaa saa 2:00 PM.'},
      {id:'b',text:'Tafadhali tembelea maktaba ya umma.'},
      {id:'c',text:'Gharama ni shilingi 20.'},
    ]});
  });
  const result=await x.translate({transcript,targetLanguage:'sw'});
  assert.equal(calls.length,1);
  assert.match(calls[0].url,/gemini-3\.8-flash:generateContent$/);
  assert.equal(calls[0].init.headers['x-goog-api-key'],'mock-key');
  const req=JSON.parse(calls[0].init.body);
  assert.equal(req.contents[0].parts.length,1);
  assert.equal(req.contents[0].parts[0].inlineData,undefined);
  assert.match(req.contents[0].parts[0].text,/English/);
  assert.equal(result.captions.length,3);
  assert.deepEqual(result.captions.map(c=>[c.id,c.start,c.end]),[['a',0.5,3.7],['b',4.1,6.6],['c',7,9.4]]);
  assert.equal(result.captions[0].originalText,transcript.segments[0].text);
  assert.equal(result.captions[0].language,'sw');
  assert.equal(result.captions[0].mode,'translated');
  assert.equal(result.captions[0].status,'needs-review');
  assert.equal(result.warnings.length,3);
});

test('Swahili speech translates into English; same language uses original without model call',async()=>{
  const sw={videoId:'sw',sourceLanguage:'sw',segments:[{id:'x',start:0,end:2,text:'Habari zenu.',language:'sw'}]};
  let calls=0;
  const x=service(async()=>{calls++;return geminiReply({translations:[{id:'x',text:'Greetings to you.'}]});});
  const en=await x.translate({transcript:sw,targetLanguage:'en'});
  assert.equal(en.captions[0].displayText,'Greetings to you.');
  assert.equal(en.captions[0].originalText,'Habari zenu.');
  assert.equal(en.captions[0].language,'en');
  const original=await x.translate({transcript:sw,targetLanguage:'sw'});
  assert.equal(original.captions[0].status,'ready');
  assert.equal(original.captions[0].mode,'original');
  assert.equal(calls,1);
});

test('Missing IDs, duplicate IDs and changed numbers fall back per caption without fabricating translation',async()=>{
  const x=service(async()=>geminiReply({translations:[
    {id:'a',text:'Ijumaa saa 5:00 PM.'},
    {id:'b',text:'Maktaba ya umma.'},
    {id:'b',text:'Maktaba.'},
  ]}));
  const result=await x.translate({transcript,targetLanguage:'sw'});
  assert.equal(result.captions[0].status,'fallback');
  assert.equal(result.captions[0].language,'en');
  assert.equal(result.captions[1].status,'fallback');
  assert.equal(result.captions[2].status,'fallback');
  assert.equal(result.captions[0].displayText,transcript.segments[0].text);
});

test('Large transcriptions are translated in batches preserving all IDs', async()=>{
  const longer={videoId:'long',sourceLanguage:'en',segments:Array.from({length:21},(_,i)=>({id:`c${i}`,start:i*2,end:i*2+1.6,text:`Welcome part ${i}.`,language:'en'}))};
  let calls=0;
  const x=service(async(_url, init)=>{
    calls++;
    const text=JSON.parse(init.body).contents[0].parts[0].text;
    const context=JSON.parse(text.split('\n').at(-1));
    return geminiReply({translations:context.cues.map(c=>({id:c.id,text:c.text}))});
  });
  const out=await x.translate({transcript:longer,targetLanguage:'sw'});
  assert.equal(calls,2);
  assert.equal(out.captions.length,21);
  assert.equal(out.captions[20].id,'c20');
});

test('Gemini produces summary in requested language, validates points and blocks invalid output', async()=>{
  let calls=0;
  const x=service(async(_url,init)=>{
    calls++;
    const prompt=JSON.parse(init.body).contents[0].parts[0].text;
    assert.match(prompt,/Kiswahili/);
    assert.match(prompt,/public library/);
    return geminiReply({points:['Kampeni itaanza Ijumaa saa 2:00 PM.','Mkutano uko katika maktaba ya umma.','Gharama ni shilingi 20.']});
  });
  const result=await x.summarize({transcript,language:'sw'});
  assert.equal(result.points.length,3);
  assert.equal(result.language,'sw');
  assert.equal(result.status,'needs-review');
  assert.equal(calls,1);
  const bad=service(async()=>geminiReply({points:[]}));
  await assert.rejects(bad.summarize({transcript,language:'en'}),/invalid key-point summary/);
});

test('Invalid language, unavailable key, HTTP failure and incomplete Gemini response are handled',async()=>{
  assert.throws(()=>service(async()=>{}, {token:''}),/Set CAPTIONFLOW_HOSTED_TOKEN/);
  const failed=service(async()=>Response.json({error:{message:'Too many requests'}},{status:429}));
  await assert.rejects(failed.summarize({transcript,language:'sw'}),/HTTP 429/);
  const incomplete=service(async()=>Response.json({candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:'{}'}]}}]}));
  await assert.rejects(incomplete.translate({transcript,targetLanguage:'sw'}),/incomplete/);
  await assert.rejects(incomplete.translate({transcript,targetLanguage:'fr'}),/must be en or sw/);
});