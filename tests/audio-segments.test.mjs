import test from 'node:test';
import assert from 'node:assert/strict';
import {audioSegments} from '../src/audio.ts';
test('Narration keeps headings and paragraphs separated without dropping punctuation, abbreviations or decimals',()=>{const text='Capítulo 1\n\nIntrodução\n\nUm parágrafo com e.g. exemplos e 3.14 números. Outra frase!\n\nÚltimo parágrafo.';const chunks=audioSegments(text);assert.equal(chunks.join(''),text);assert.equal(chunks[0],'Capítulo 1\n\n');assert.equal(chunks[1],'Introdução\n\n');assert.ok(chunks.some(s=>s.endsWith('\n\n')));});
test('Long narration chunks preserve Unicode and stay bounded',()=>{const text='😀'.repeat(2000)+' fim.';const chunks=audioSegments(text);assert.equal(chunks.join(''),text);assert.ok(chunks.every(s=>s.length<=1400));assert.ok(chunks.every(s=>!/[\uD800-\uDBFF]$/.test(s)));});
