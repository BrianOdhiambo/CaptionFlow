import test from 'node:test';
import assert from 'node:assert/strict';
import { viewCaptionsForMode } from '../src/caption-view.mjs';
const segment={id:'a',start:1,end:3,text:'Welcome to the clinic.',language:'en'};
const base={transcript:{videoId:'v1',sourceLanguage:'en',segments:[segment]}};
const translated={id:'a',start:1,end:3,originalText:segment.text,displayText:'Karibu kliniki.',language:'sw',mode:'translated',status:'needs-review'};
test('English source can display saved Swahili translation without changing original timestamps',()=>{
 const data={...base,captionVariants:{translations:{sw:[translated]}}};
 const output=viewCaptionsForMode(data,{language:'sw',mode:'original'});
 assert.equal(output[0].displayText,'Karibu kliniki.');
 assert.equal(output[0].originalText,segment.text);
 assert.deepEqual([output[0].start,output[0].end],[1,3]);
 assert.equal(viewCaptionsForMode(data,{language:'en',mode:'original'})[0].displayText,segment.text);
});
test('Missing or mismatched translations correctly fall back to the source language',()=>{
 assert.equal(viewCaptionsForMode(base,{language:'sw',mode:'plain'})[0].language,'en');
 const bad={...base,captionVariants:{translations:{sw:[{...translated,start:999}]}}};
 assert.equal(viewCaptionsForMode(bad,{language:'sw',mode:'original'})[0].status,'fallback');
});