import { fork } from "node:child_process";
import { HttpError } from "../http-error.js";

export const supportedDocumentMimeTypes = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
] as const;

export type SupportedDocumentMimeType = typeof supportedDocumentMimeTypes[number];

export function extractDocumentText(bytes:Buffer,mimeType:SupportedDocumentMimeType,filename:string,purpose:"CV"|"JD"):Promise<string>{
  return new Promise((accept,reject)=>{
    const worker=fork(new URL("../resume/parser-process.js",import.meta.url),[],{
      windowsHide:true,stdio:["ignore","ignore","ignore","ipc"],execArgv:["--max-old-space-size=128"],env:{},
    });
    let settled=false;
    const finish=(error?:Error,text?:string)=>{
      if(settled)return;settled=true;clearTimeout(timer);worker.kill();
      if(error)reject(error);else accept(text!);
    };
    const failure=(reason="Parser failed without details")=>{
      console.error("[document] extraction failed",{purpose,filename,mimeType,byteLength:bytes.length,reason});
      finish(new HttpError(422,`${purpose}_UNREADABLE`,`Could not read this ${purpose === "CV" ? "CV" : "job description"}; upload a text-based PDF, DOCX or UTF-8 TXT`));
    };
    const timer=setTimeout(failure,10_000);
    worker.once("message",(message:{error?:boolean;errorName?:string;errorMessage?:string;text?:string})=>{
      if(message.error||!message.text)return failure([message.errorName,message.errorMessage].filter(Boolean).join(": "));
      console.info("[document] extraction succeeded",{purpose,filename,mimeType,byteLength:bytes.length,textRead:message.text.length>0});
      finish(undefined,message.text);
    });
    worker.once("error",error=>failure(error.message));
    worker.once("exit",code=>{if(!settled)failure(`Parser exited with code ${code??"unknown"}`);});
    worker.send({contentBase64:bytes.toString("base64"),mimeType},error=>{if(error)failure(error.message);});
  });
}
