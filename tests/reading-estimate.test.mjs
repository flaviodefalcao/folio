import test from 'node:test';
import assert from 'node:assert/strict';
import {readingEstimate} from '../src/reading-profile.ts';
const book={id:'b',progress:.5,readingBaseline:{at:100,progress:.25},chapters:[{text:Array(1000).fill('palavra').join(' ')}]};
const span={bookId:'b',mode:'read',start:200,durationMs:600000,day:'2026-10-12'};
test('Forecast uses only reading after the progress baseline and excludes audio',()=>{const result=readingEstimate(book,{spans:[span,{...span,mode:'listen',durationMs:900000},{...span,start:50,durationMs:900000}]});assert.equal(result.wordsPerMinute,25);assert.equal(result.remainingMs,1200000);});
test('Forecast is unavailable for legacy progress or insufficient new reading',()=>{assert.equal(readingEstimate({...book,readingBaseline:undefined},{spans:[span]}),null);assert.equal(readingEstimate({...book,progress:.25},{spans:[span]}),null);assert.equal(readingEstimate(book,{spans:[{...span,durationMs:30000}]}),null);});
