import assert from "node:assert/strict";
import test from "node:test";
import { canContinueConcept,restoredConceptSections,parseReaderChunks,readerBlockChunks,codeBlockSize,requiredSectionsReached,selectionContext } from "../src/teaching-reader.ts";

test("fenced code becomes a typed code chunk without visible fences",()=>{
  const chunks=parseReaderChunks("Use this helper:\n\n```ts\nconst value = 1;\n  return value;\n```\nDone.");
  assert.deepEqual(chunks,[
    {kind:"TEXT",text:"Use this helper:"},
    {kind:"CODE",language:"TypeScript",text:"const value = 1;\n  return value;"},
    {kind:"TEXT",text:"Done."},
  ]);
});

test("selection stores the exact span and nearby source context",()=>{
  const text="Caching reduces database reads and distributed locks protect critical sections.";
  const start=text.indexOf("distributed locks");
  const selected=selectionContext(text,start,start+"distributed locks".length,20);
  assert.equal(selected?.selectedText,"distributed locks");
  assert.match(selected?.sourceContext??"",/protect critical/);
});

test("continue remains gated until every required section was reached",()=>{
  const required=["plain","why","code","recap"];
  assert.equal(requiredSectionsReached(required,["plain","why","code"]),false);
  assert.equal(requiredSectionsReached(required,["plain","why","code","recap"]),true);
});

test("structured code preserves indentation and renders caption separately without fences",()=>{
  const code="// Keep writes together.\nawait transaction(async tx => {\n  await tx.save(value);\n});";
  assert.deepEqual(readerBlockChunks({body:"One atomic update",code,language:"ts"}),[
    {kind:"TEXT",text:"One atomic update"},{kind:"CODE",text:code,language:"TypeScript"}
  ]);
  assert.deepEqual(readerBlockChunks({body:"```js\ncall();\n```"}),[{kind:"CODE",text:"call();",language:"JavaScript"}]);
});

test("code dimensions fit short examples and expand horizontally for long lines",()=>{
  assert.deepEqual(codeBlockSize("call();"),{width:180,height:27});
  assert.equal(codeBlockSize("one();\ntwo();").height,46);
  assert.ok(codeBlockSize("x".repeat(120)).width>800);
});

test("completed concepts restore all sections and allow Next even with an older saved position",()=>{
  const sections=["plain","why","code","recap"];
  assert.deepEqual(restoredConceptSections(sections,true,1),sections);
  assert.equal(canContinueConcept(true,sections,[]),true);
  assert.equal(canContinueConcept(false,sections,["plain"]),false);
  assert.equal(canContinueConcept(false,sections,sections),true);
});
