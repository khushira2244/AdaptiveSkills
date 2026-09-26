import type { LessonContentBlock } from "./types";

export type ReaderChunk =
  | { kind: "TEXT"; text: string }
  | { kind: "CODE"; text: string; language: string };

const FENCE = /```([\w.+#-]*)\s*\r?\n([\s\S]*?)```/g;

export function parseReaderChunks(body: string): ReaderChunk[] {
  const chunks: ReaderChunk[] = [];
  let cursor = 0;
  for (const match of body.matchAll(FENCE)) {
    const index = match.index ?? 0;
    const prose = body.slice(cursor, index).trim();
    if (prose) chunks.push({ kind: "TEXT", text: prose });
    chunks.push({
      kind: "CODE",
      language: normalizeLanguage(match[1] ?? ""),
      text: (match[2] ?? "").replace(/^\r?\n/, "").replace(/\r?\n$/, ""),
    });
    cursor = index + match[0].length;
  }
  const remainder = body.slice(cursor).trim();
  if (remainder) chunks.push({ kind: "TEXT", text: remainder });
  return chunks.length ? chunks : [{ kind: "TEXT", text: body.trim() }];
}

// Prefer structured code; fenced parsing remains for saved lessons generated earlier.
export function readerBlockChunks(block:{body:string;code?:string;language?:string}):ReaderChunk[]{
  if(block.code?.trim())return [
    ...(block.body.trim()?[{kind:"TEXT" as const,text:block.body.trim()}]:[]),
    {kind:"CODE",text:block.code,language:normalizeLanguage(block.language??"")},
  ];
  return parseReaderChunks(block.body);
}

export function codeBlockSize(code:string){
  const lines=code.split(/\r?\n/);
  return {width:Math.max(180,...lines.map(line=>line.replace(/\t/g,"    ").length*7.5+8)),height:Math.max(27,lines.length*19+8)};
}

export function readerSectionType(block: LessonContentBlock): "TEXT" | "BULLETS" | "CODE" | "CHECKPOINT" {
  if (block.type === "CHECKPOINT") return "CHECKPOINT";
  if (readerBlockChunks(block).some((chunk) => chunk.kind === "CODE")) return "CODE";
  if (block.items.length && !block.body.trim()) return "BULLETS";
  return "TEXT";
}

export function requiredSectionsReached(requiredIds: string[], reachedIds: Iterable<string>): boolean {
  const reached = new Set(reachedIds);
  return requiredIds.every((id) => reached.has(id));
}

export function selectionContext(text: string, start: number, end: number, radius = 120): { selectedText: string; sourceContext: string } | null {
  if (start === end) return null;
  const low = Math.max(0, Math.min(start, end));
  const high = Math.min(text.length, Math.max(start, end));
  const selectedText = text.slice(low, high).trim();
  if (!selectedText) return null;
  return {
    selectedText: selectedText.slice(0, 500),
    sourceContext: text.slice(Math.max(0, low - radius), Math.min(text.length, high + radius)).trim(),
  };
}

function normalizeLanguage(value: string): string {
  const language = value.trim().toLowerCase();
  if (language === "ts" || language === "tsx") return "TypeScript";
  if (language === "js" || language === "jsx") return "JavaScript";
  return language ? (language[0] ?? "").toUpperCase() + language.slice(1) : "Code";
}

export function canContinueConcept(completed:boolean,requiredIds:string[],reachedIds:Iterable<string>):boolean {
  return completed || requiredSectionsReached(requiredIds,reachedIds);
}

export function restoredConceptSections(sectionIds:string[],completed:boolean,lastBlockPosition:number):string[] {
  return sectionIds.slice(0,completed?sectionIds.length:Math.max(1,Math.min(sectionIds.length,lastBlockPosition||1)));
}
