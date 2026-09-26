import { randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { onboardingRepository } from "@adaptive-labs/db";
import type { OnboardingStateService } from "../onboarding/service.js";
import { HttpError } from "../http-error.js";
import type { Database } from "@adaptive-labs/db";
import type { ResumeSkillExtractor } from "../learning/reasoning.js";
import { extractDocumentText,type SupportedDocumentMimeType } from "../documents/extract-text.js";
export class ResumeIntakeService {
  private root: string;
  constructor(private state: OnboardingStateService,private db:Database,private skillExtractor:ResumeSkillExtractor|null,storageRoot: string) { this.root=resolve(storageRoot); }
  private async remove(key: string) {
    if (!/^[a-f0-9-]{36}$/.test(key)) throw new Error("Invalid storage key");
    await unlink(resolve(this.root,key)).catch(() => undefined);
  }
  async upload(id: string, input: { version: number; filename: string; mimeType: string; contentBase64: string }) {
    const bytes = Buffer.from(input.contentBase64,"base64");
    console.info("[resume] upload received", { filename: input.filename, mimeType: input.mimeType, byteLength: bytes.length, bytesRead: bytes.length > 0 });
    if (bytes.length > 2 * 1024 * 1024) throw new HttpError(413,"CV_TOO_LARGE","CV limit is 2 MiB");
    if(!this.skillExtractor) throw new HttpError(503,"AI_REASONING_NOT_CONFIGURED","CV skill extraction is not configured");
    const text = await extractDocumentText(bytes,input.mimeType as SupportedDocumentMimeType,input.filename,"CV");
    const vocabulary=await this.db.query<{canonicalName:string;aliases:string[]}>(`SELECT s.canonical_name "canonicalName",COALESCE(array_agg(a.normalized_alias) FILTER(WHERE a.normalized_alias IS NOT NULL),'{}') aliases FROM normalized_skills s LEFT JOIN normalized_skill_aliases a USING(canonical_id) GROUP BY s.canonical_id ORDER BY s.canonical_name`);
    let extracted:string[];
    try{extracted=await this.skillExtractor.extractResumeSkills({learnerId:id,text,normalizedSkills:vocabulary.rows});}
    catch{throw new HttpError(503,"CV_SKILL_EXTRACTION_FAILED","Could not extract CV skills right now; retry is safe");}
    const canonical=new Map<string,string>();
    for(const skill of vocabulary.rows){canonical.set(skill.canonicalName.toLowerCase(),skill.canonicalName);for(const alias of skill.aliases) canonical.set(alias.toLowerCase(),skill.canonicalName);}
    const suggestions=[...new Map(extracted.map(name=>{const clean=name.trim();const normalized=canonical.get(clean.toLowerCase())??clean;return [normalized.toLowerCase(),normalized] as const;})).values()].filter(Boolean).slice(0,100);
    console.info("[resume] skill extraction succeeded", { filename:input.filename,mimeType:input.mimeType,byteLength:bytes.length,suggestionCount:suggestions.length });
    const key = randomUUID();
    await mkdir(this.root,{ recursive: true });
    await writeFile(resolve(this.root,key),bytes,{ flag: "wx", mode: 0o600 });
    let oldKey: string | undefined;
    let result;
    try {
      result = await this.state.mutate(id,input.version,async client => {
        oldKey = await onboardingRepository(client).resume(id,{
          resumeId: key, filename: input.filename, mimeType: input.mimeType, storageKey: key, suggestions,
        });
      });
    } catch (error) { await this.remove(key); throw error; }
    if (oldKey) await this.remove(oldKey);
    return result;
  }
  confirm(id: string, version: number, resumeId: string, skillNames: string[]) {
    return this.state.mutate(id,version,async (client,state) => {
      if (!state.resume || state.resume.resumeId !== resumeId) throw new HttpError(404,"NOT_FOUND","CV not found");
      if (skillNames.some(name => !state.resume!.suggestions.includes(name)))
        throw new HttpError(422,"INVALID_SUGGESTION","Only extracted suggestions can be confirmed here; add other skills manually");
      const skills = [...state.skills];
      for (const name of skillNames) if (!skills.some(s => s.name.toLowerCase() === name.toLowerCase()))
        skills.push({ name, source: "CV_CONFIRMED", level: null, subskills: [] });
      if (skills.length > 100) throw new HttpError(422,"TOO_MANY_SKILLS","Skill limit is 100");
      const repo=onboardingRepository(client);
      await repo.skills(id,skills);
      await repo.confirmResume(id,resumeId);
    });
  }
}
