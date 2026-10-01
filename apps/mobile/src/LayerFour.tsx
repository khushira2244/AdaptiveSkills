import { useEffect,useState,type ReactNode } from "react";
import { ActivityIndicator,BackHandler,KeyboardAvoidingView,Modal,Platform,ScrollView,StyleSheet,Text,TextInput,View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api,ApiError } from "./api";
import type { ContinuationState,LabState,LabWorkSummary,LearningDoubt,LearningNote,LearningUnit,MarkedWord,UnitTeaching } from "./types";
import { canOpenUnit,labContinueLabel,labForUnit,shouldGenerateTeaching,unitStatusLabel } from "./learning-navigation";
import { readerBlockChunks,codeBlockSize,canContinueConcept,restoredConceptSections,selectionContext } from "./teaching-reader";
import { Brand,C,Field,Notice,PrimaryButton,Screen,useRevealFocusedInput } from "./ui";
import { Pressable } from "./PointerPressable";

type Page="learn"|"work"|"unit"|"lab"|"notes"|"words"|"doubts";
export function LayerFour({token,onHome,onContinuation,initialPage="learn",initialUnit=null,initialLabId=null}:{token:string;onHome:()=>void;onContinuation:()=>void;initialPage?:"learn"|"work";initialUnit?:LearningUnit|null;initialLabId?:string|null}){
  const[page,setPage]=useState<Page>(initialLabId?"lab":initialUnit?"unit":initialPage),[parentPage,setParentPage]=useState<"learn"|"work">(initialPage),[units,setUnits]=useState<LearningUnit[]>(initialUnit?[initialUnit]:[]),[labs,setLabs]=useState<LabWorkSummary[]>([]),[state,setState]=useState<ContinuationState|null>(null),[unit,setUnit]=useState<LearningUnit|null>(initialUnit),[busy,setBusy]=useState(true),[error,setError]=useState("");
  async function refresh(){setBusy(true);setError("");const results=await Promise.allSettled([api.learningUnits(token),api.continuation(token),api.labHistory(token)]);const unitResult=results[0],stateResult=results[1],labResult=results[2];if(unitResult.status==="fulfilled"){setUnits(unitResult.value);setUnit(current=>current?unitResult.value.find(item=>item.unitId===current.unitId)??current:current);}else setError(message(unitResult.reason));if(stateResult.status==="fulfilled")setState(stateResult.value);else if(unitResult.status==="rejected")setError(message(stateResult.reason));if(labResult.status==="fulfilled")setLabs(labResult.value);setBusy(false);}
  useEffect(()=>{void refresh();},[token]);
  const [activeLabId,setActiveLabId]=useState<string|null>(initialLabId);
  const back=()=>{if(page==="learn"||page==="work")onHome();else {setPage(page==="lab"?parentPage:"learn");void refresh();}};
  useEffect(()=>{const subscription=BackHandler.addEventListener("hardwareBackPress",()=>{back();return true;});return()=>subscription.remove();},[page]);
  if(busy&&!state)return <Shell onBack={onHome}><ActivityIndicator color={C.blue}/></Shell>;
  const openUnit=(unitId:string|null)=>{const target=units.find(x=>x.unitId===unitId);if(target){setUnit(target);setPage("unit");}else setPage("learn");};
  if(page==="notes")return <Notes token={token} onBack={back} onOpen={openUnit}/>;
  if(page==="words")return <Words token={token} onBack={back} onOpen={openUnit}/>;
  if(page==="doubts")return <Doubts token={token} onBack={back} onChanged={async()=>{await refresh();}}/>;
  if(page==="unit"&&unit)return <Unit token={token} unit={unit} savedLab={labForUnit(unit.unitId,labs)} onBack={back} onChanged={async labId=>{setActiveLabId(labId);setPage("lab");}}/>;
  if(page==="lab"&&(activeLabId||state?.nextLabId))return <Lab token={token} labId={(activeLabId||state?.nextLabId)!} onBack={back} onChanged={async action=>{if(action==="REVIEW_NEXT_RUNWAY"||action==="VIEW_NEXT_RUNWAY"){onContinuation();return;}setActiveLabId(null);setPage(action==="DOUBT_CLEARANCE"?"doubts":"learn");await refresh();}}/>;
  if(page==="work")return <Shell onBack={onHome}><Text style={s.h1}>My Work</Text><Text style={s.copy}>Your saved labs, submissions and evidence.</Text>{error?<Notice tone="red">{error}</Notice>:null}{labs.length?labs.map(item=><Pressable key={item.labId} style={s.card} onPress={()=>{setParentPage("work");setActiveLabId(item.labId);setPage("lab");}}><View style={s.unitHeading}><Text style={s.title}>{item.title}</Text><Text style={[s.unitStatus,item.status==="COMPLETE"&&s.unitStatusDone]}>{item.status==="COMPLETE"?"Completed":item.status==="IN_PROGRESS"?"In progress":"Ready"}</Text></View><Text style={s.copy}>{item.unitTitle}</Text><Text style={s.copy}>Hints used: {item.attempt?.hintsUsed??0} · Evidence demonstrated: {item.evidence.demonstrated}</Text><Text style={s.link}>{item.status==="COMPLETE"?"View result":"Open lab"} →</Text></Pressable>):busy?<ActivityIndicator color={C.blue}/>:<Notice>No labs are available yet. Complete your current unit teaching to unlock one.</Notice>}</Shell>;
  return <Shell onBack={onHome}><Text style={s.h1}>Learn</Text><Text style={s.copy}>Your saved units, progress and practical work.</Text>{error?<Notice tone="red">{error}</Notice>:null}{units.map(x=>{const locked=!canOpenUnit(x.status);return <Pressable key={x.unitId} disabled={locked} style={[s.card,locked&&s.lockedCard]} onPress={()=>{setUnit(x);setPage("unit");}}><View style={s.unitHeading}><Text style={s.title}>Unit {x.sequence}: {x.title}</Text><Text style={[s.unitStatus,x.status==="COMPLETE"&&s.unitStatusDone]}>{unitStatusLabel(x.status)}</Text></View><Text style={s.copy}>{x.goal}</Text><Text style={s.link}>{x.status==="COMPLETE"?"Review completed unit →":x.status==="LOCKED"?"Available after the current unit":"Open unit →"}</Text></Pressable>})}{state?.nextLabId&&(state.nextAction==="START_LAB"||state.nextAction==="RESUME_LAB")?<PrimaryButton label={state.nextAction==="RESUME_LAB"?"Resume lab":"Start lab"} onPress={()=>{setActiveLabId(state.nextLabId);setPage("lab");}}/>:null}</Shell>;
}

function Unit({token,unit,savedLab,onBack,onChanged}:{token:string;unit:LearningUnit;savedLab:LabWorkSummary|null;onBack:()=>void;onChanged:(labId:string)=>Promise<void>}) {
  const [teaching,setTeaching]=useState<UnitTeaching|null>(null);
  const [lessonIndex,setLessonIndex]=useState(0);
  const [openSectionId,setOpenSectionId]=useState<string|null>(null);
  const [reachedSectionIds,setReachedSectionIds]=useState<Set<string>>(new Set());
  const [selection,setSelection]=useState<ReaderSelection|null>(null);
  const [noteOpen,setNoteOpen]=useState(false);
  const [note,setNote]=useState("");
  const [busy,setBusy]=useState(true);
  const [info,setInfo]=useState("");
  const lesson=teaching?.lessons[lessonIndex]??null;

  useEffect(()=>{
    setBusy(true);
    api.unitTeaching(token,unit.unitId).catch(async e=>{if(e instanceof ApiError&&shouldGenerateTeaching(unit.status,e.status))return api.openUnitTeaching(token,unit.unitId);throw e;}).then(setTeaching).catch(e=>setInfo(message(e))).finally(()=>setBusy(false));
  },[token,unit.unitId]);

  useEffect(()=>{
    if(!lesson)return;
    const sectionIds=[...lesson.blocks.map(block=>block.blockId),`recap:${lesson.lessonId}`];
    const restored=restoredConceptSections(sectionIds,lesson.completed,lesson.lastBlockPosition);
    const restoredCount=restored.length;
    setReachedSectionIds(new Set(restored));
    setOpenSectionId(sectionIds[restoredCount-1]??sectionIds[0]??null);
    setSelection(null);
    setNoteOpen(false);
  },[lesson?.lessonId]);

  useEffect(()=>{
    if(!["Note saved.","Learning signal saved.","Selection added to Marked Words."].includes(info))return;
    const timer=setTimeout(()=>setInfo(""),2500);
    return ()=>clearTimeout(timer);
  },[info]);

  const sectionIds=lesson?[...lesson.blocks.map(block=>block.blockId),`recap:${lesson.lessonId}`]:[];
  const canContinue=Boolean(lesson&&canContinueConcept(lesson.completed,sectionIds,reachedSectionIds));

  function openSection(sectionId:string,index:number){
    if(!lesson)return;
    if(openSectionId===sectionId){setOpenSectionId(null);return;}
    setOpenSectionId(sectionId);
    setSelection(null);
    setReachedSectionIds(current=>new Set([...current,sectionId]));
    if(!lesson.completed)void api.saveLessonProgress(token,lesson.lessonId,index+1,false).catch(e=>setInfo(message(e)));
  }

  async function addMarker(kind:"I_KNOW_THIS"|"DONT_UNDERSTAND"|"GO_DEEPER"){
    if(!lesson||!selection)return;
    setBusy(true);
    try{
      await api.addMarker(token,{
        sourceType:"CONCEPT_SECTION",sourceId:sourceReference(lesson.lessonId,selection.blockId),unitId:unit.unitId,
        conceptId:lesson.conceptId,labId:null,selectedText:selection.selectedText,markerType:kind,
      });
      setSelection(null);
      setInfo(kind==="DONT_UNDERSTAND"?"Saved for doubt clearance after the lab.":"Learning signal saved.");
    }catch(e){setInfo(message(e));}finally{setBusy(false);}
  }

  async function saveNote(){
    if(!note.trim()||!lesson||!selection)return;
    setBusy(true);
    try{
      const sourceId=sourceReference(lesson.lessonId,selection.blockId);
      await api.addNote(token,{
        sourceType:"CONCEPT_SECTION",sourceId,unitId:unit.unitId,conceptId:lesson.conceptId,labId:null,fileId:null,
        selectedText:selection.selectedText,attachmentType:"SELECTED_TEXT",attachmentRef:sourceId,body:note.trim(),
      });
      setNote("");setNoteOpen(false);setSelection(null);setInfo("Note saved.");
    }catch(e){setInfo(message(e));}finally{setBusy(false);}
  }

  async function mark(){
    if(!lesson||!selection)return;
    setBusy(true);
    try{
      await api.addMarkedWord(token,{
        sourceType:"CONCEPT_SECTION",sourceId:sourceReference(lesson.lessonId,selection.blockId),unitId:unit.unitId,
        conceptId:lesson.conceptId,labId:null,selectedText:selection.selectedText,sourceContext:selection.sourceContext,
        learnerStatus:"GO_DEEPER",
      });
      setSelection(null);setInfo("Selection added to Marked Words.");
    }catch(e){setInfo(message(e));}finally{setBusy(false);}
  }

  async function continueLesson(){
    if(!lesson||!teaching||!canContinue)return;
    if(lesson.completed){if(lessonIndex<teaching.lessons.length-1)setLessonIndex(lessonIndex+1);else if(savedLab)await onChanged(savedLab.labId);return;}
    setBusy(true);
    try{
      await api.saveLessonProgress(token,lesson.lessonId,sectionIds.length,true);
      setTeaching({...teaching,lessons:teaching.lessons.map((item,index)=>index===lessonIndex?{...item,completed:true,lastBlockPosition:sectionIds.length}:item)});
      if(lessonIndex<teaching.lessons.length-1)setLessonIndex(lessonIndex+1);
      else if(savedLab)await onChanged(savedLab.labId);
      else{const result=await api.completeLearningUnit(token,unit.unitId);await onChanged(result.labId);}
    }catch(e){setInfo(message(e));}finally{setBusy(false);}
  }

  return <Shell onBack={onBack}>
    {busy&&!teaching?<><Text style={s.h1}>Preparing your lesson</Text><Text style={s.copy}>Generating and saving this unit’s teaching content. It will be reused when you return.</Text><ActivityIndicator color={C.blue}/></>:null}
    {teaching&&lesson?<>
      <View style={s.wrapActions}><Pressable accessibilityRole="button" disabled={busy} onPress={()=>{setInfo("");if(lessonIndex>0)setLessonIndex(lessonIndex-1);else onBack();}}><Text style={s.link}>{lessonIndex>0?"← Previous concept":"← Back to units"}</Text></Pressable><Text style={s.copy}>Concept {lessonIndex+1} of {teaching.lessons.length}</Text></View>
      {lesson.completed?<Text style={s.badge}>✓ Completed</Text>:null}
      <Text style={s.h1}>{lesson.title}</Text>
      <Text style={s.lessonGoal}>{lesson.objective}</Text>
      {lessonIndex===0?<Notice>{teaching.introduction}</Notice>:null}
      <View style={s.accordionList}>
        {lesson.blocks.map((block,index)=><LessonSection
          key={block.blockId} title={block.title} blockId={block.blockId} body={block.body} items={block.items} code={block.code} language={block.language}
          kind={block.type==="CHECKPOINT"?"CHECKPOINT":"CONTENT"} open={openSectionId===block.blockId}
          onToggle={()=>openSection(block.blockId,index)} onSelect={setSelection} selection={selection}
          onAddNote={()=>setNoteOpen(true)} onMark={()=>void mark()} onMarker={kind=>void addMarker(kind)} busy={busy}
        />)}
        <LessonSection
          title="Quick recap" blockId={`recap:${lesson.lessonId}`} body="" items={lesson.recap} kind="RECAP"
          open={openSectionId===`recap:${lesson.lessonId}`} onToggle={()=>openSection(`recap:${lesson.lessonId}`,lesson.blocks.length)}
          onSelect={setSelection} selection={selection} onAddNote={()=>setNoteOpen(true)} onMark={()=>void mark()}
          onMarker={kind=>void addMarker(kind)} busy={busy}
        />
      </View>
      {info?<Notice>{info}</Notice>:null}
      {!canContinue?<Text style={s.continueHelp}>Open each required section to unlock the next step.</Text>:null}
      <PrimaryButton label={lessonIndex<teaching.lessons.length-1?(lesson.completed?"Next concept":"Complete and next concept"):(lesson.completed?"Open saved lab":"Finish teaching and start lab")} onPress={()=>void continueLesson()} busy={busy} disabled={!canContinue}/>
      <NoteEditor visible={noteOpen} selectedText={selection?.selectedText??""} note={note} busy={busy} onChange={setNote} onClose={()=>setNoteOpen(false)} onSave={()=>void saveNote()}/>
    </>:info?<Notice tone="red">{info}</Notice>:null}
  </Shell>;
}

type ReaderSelection={blockId:string;selectedText:string;sourceContext:string};
type MarkerKind="I_KNOW_THIS"|"DONT_UNDERSTAND"|"GO_DEEPER";

function LessonSection({title,blockId,body,items,code,language,kind,open,onToggle,onSelect,selection,onAddNote,onMark,onMarker,busy}:{
  title:string;blockId:string;body:string;items:string[];code?:string;language?:string;kind:"CONTENT"|"CHECKPOINT"|"RECAP";open:boolean;onToggle:()=>void;
  onSelect:(selection:ReaderSelection)=>void;selection:ReaderSelection|null;onAddNote:()=>void;onMark:()=>void;
  onMarker:(kind:MarkerKind)=>void;busy:boolean;
}){
  const chunks=readerBlockChunks({body,code,language});
  return <View style={[s.accordion,open&&s.accordionOpen]}>
    <Pressable accessibilityRole="button" accessibilityState={{expanded:open}} onPress={onToggle} style={s.accordionHeader}>
      <Text style={s.accordionTitle}>{title}</Text><Text style={s.chevron}>{open?"⌄":"›"}</Text>
    </Pressable>
    {open?<View style={s.accordionBody}>
      {chunks.map((chunk,index)=>chunk.kind==="CODE"?<CodeBlock key={`${blockId}:code:${index}`} code={chunk.text} language={chunk.language} blockId={blockId} onSelect={onSelect}/>:chunk.text?<SelectablePassage key={`${blockId}:text:${index}`} text={chunk.text} blockId={blockId} onSelect={onSelect} checkpoint={kind==="CHECKPOINT"}/>:null)}
      {items.length?<View style={kind==="RECAP"?s.recap:s.bullets}>{items.map((item,index)=><SelectablePassage key={`${blockId}:item:${index}`} text={`• ${item}`} blockId={blockId} onSelect={onSelect}/>)}</View>:null}
      {selection?.blockId===blockId?<SelectionActions busy={busy} onAddNote={onAddNote} onMark={onMark} onMarker={onMarker}/>:null}
    </View>:null}
  </View>;
}

function SelectablePassage({text,blockId,onSelect,checkpoint=false}:{text:string;blockId:string;onSelect:(selection:ReaderSelection)=>void;checkpoint?:boolean}){
  const height=Math.max(28,Math.ceil(text.length/43)*22+8);
  return <TextInput
    value={text} multiline scrollEnabled={false} showSoftInputOnFocus={false} contextMenuHidden={false} onChangeText={()=>{}} style={[s.readerText,{height},checkpoint&&s.checkpointText]}
    onSelectionChange={event=>{const selected=selectionContext(text,event.nativeEvent.selection.start,event.nativeEvent.selection.end);if(selected)onSelect({blockId,...selected});}}
  />;
}

function CodeBlock({code,language,blockId,onSelect}:{code:string;language:string;blockId:string;onSelect:(selection:ReaderSelection)=>void}){
  const {width,height}=codeBlockSize(code);
  return <View style={s.codeBox}>
    <View style={s.codeHeader}><Text style={s.codeLanguage}>{language}</Text></View>
    <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={s.codeScroll}>
      <TextInput value={code} multiline scrollEnabled={false} showSoftInputOnFocus={false} contextMenuHidden={false} onChangeText={()=>{}} style={[s.codeText,{width,height}]}
        onSelectionChange={event=>{const selected=selectionContext(code,event.nativeEvent.selection.start,event.nativeEvent.selection.end);if(selected)onSelect({blockId,...selected});}}/>
    </ScrollView>
  </View>;
}

function SelectionActions({busy,onAddNote,onMark,onMarker}:{busy:boolean;onAddNote:()=>void;onMark:()=>void;onMarker:(kind:MarkerKind)=>void}){
  return <View style={s.selectionMenu}>
    <ActionChip label="Add note" disabled={busy} onPress={onAddNote}/><ActionChip label="Mark" disabled={busy} onPress={onMark}/>
    <ActionChip label="I know this" disabled={busy} onPress={()=>onMarker("I_KNOW_THIS")}/>
    <ActionChip label="I don’t understand" disabled={busy} onPress={()=>onMarker("DONT_UNDERSTAND")}/>
    <ActionChip label="Go deeper" disabled={busy} onPress={()=>onMarker("GO_DEEPER")}/>
  </View>;
}

function ActionChip({label,onPress,disabled}:{label:string;onPress:()=>void;disabled:boolean}){return <Pressable disabled={disabled} onPress={onPress} style={s.actionChip}><Text style={s.actionChipText}>{label}</Text></Pressable>}

function NoteEditor({visible,selectedText,note,busy,onChange,onClose,onSave}:{visible:boolean;selectedText:string;note:string;busy:boolean;onChange:(value:string)=>void;onClose:()=>void;onSave:()=>void}){
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <KeyboardAvoidingView style={s.modalBackdrop} behavior={Platform.OS==="ios"?"padding":"height"}><SafeAreaView edges={["bottom","left","right"]} style={s.noteSheet}>
      <Text style={s.title}>Add note</Text><Text numberOfLines={3} style={s.selectedQuote}>“{selectedText}”</Text>
      <TextInput autoFocus multiline value={note} onChangeText={onChange} placeholder="Write your note" placeholderTextColor={C.muted} style={s.noteInput}/>
      <View style={s.noteActions}><Pressable onPress={onClose}><Text style={s.link}>Cancel</Text></Pressable><Pressable disabled={busy||!note.trim()} onPress={onSave}><Text style={s.link}>Save note</Text></Pressable></View>
    </SafeAreaView></KeyboardAvoidingView>
  </Modal>;
}

function sourceReference(lessonId:string,blockId:string){return `${lessonId}:${blockId}`;}
function Lab({token,labId,onBack,onChanged}:{token:string;labId:string;onBack:()=>void;onChanged:(action:ContinuationState["nextAction"])=>Promise<void>}){
  const[lab,setLab]=useState<LabState|null>(null),[attempt,setAttempt]=useState<string|null>(null);
  const[drafts,setDrafts]=useState<Record<string,string>>({}),[versions,setVersions]=useState<Record<string,number>>({});
  const[info,setInfo]=useState(""),[busy,setBusy]=useState(true),[workspace,setWorkspace]=useState(false),[details,setDetails]=useState(false);
  async function load(){
    const value=await api.lab(token,labId);setLab(value);setAttempt(value.attemptId);
    setDrafts(Object.fromEntries(value.files.map(f=>[f.fileId,f.draft??f.content??""])));
    setVersions(Object.fromEntries(value.files.map(f=>[f.fileId,f.version??0])));
    if(value.status==="COMPLETE")setWorkspace(true);
  }
  useEffect(()=>{setBusy(true);void load().catch(e=>setInfo(message(e))).finally(()=>setBusy(false));},[labId]);
  useEffect(()=>{
    if(info!=="Draft saved.")return;
    const timer=setTimeout(()=>setInfo(""),2500);
    return ()=>clearTimeout(timer);
  },[info]);
  async function act(action:()=>Promise<void>){if(busy)return;setBusy(true);setInfo("");try{await action();}catch(e){setInfo(message(e));}finally{setBusy(false);}}
  async function save(fileId:string){
    if(!attempt)return;
    const saved=await api.saveLabDraft(token,{attemptId:attempt,fileId,content:drafts[fileId]??"",version:(versions[fileId]??0)+1});
    setVersions(v=>({...v,[fileId]:saved.version}));
  }
  async function saveAll(){if(lab?.status==="COMPLETE")return;for(const file of lab?.files??[])if(file.role==="YOU_BUILD")await save(file.fileId);}
  async function begin(){
    if(lab?.status==="COMPLETE"){setWorkspace(true);return;}
    if(!attempt)await api.startLab(token,labId);
    await load();setWorkspace(true);
  }
  const exit=()=>{void act(async()=>{if(workspace&&lab?.status!=="COMPLETE"){await saveAll();setWorkspace(false);await load();}else onBack();});};
  const overview=String(lab?.context.overview??lab?.context.requiredPracticeOutcome??"");
  const criteria=Array.isArray(lab?.context.evaluationCriteria)?lab.context.evaluationCriteria.filter((x):x is string=>typeof x==="string"):[];
  const completed=lab?.status==="COMPLETE";
  const usedHints=lab?.completion?.hintsUsed??lab?.hintsUsed??0;
  return <Shell onBack={exit}>
    {!lab&&busy?<ActivityIndicator color={C.blue}/>:null}
    {lab?<>
      <Text style={s.badge}>⚗  Practical lab</Text>
      <Text style={s.h1}>{workspace?"Lab workspace":"Your unit lab"}</Text>
      <Text style={s.title} numberOfLines={2}>{String(lab.context.unitTitle??"Hands-on practice")}</Text>
      {!workspace?<>
        <View style={s.card}>
          <Text style={s.title}>What you’ll build</Text>
          <Text style={s.copy} numberOfLines={details?undefined:3}>{overview}</Text>
          <Pressable onPress={()=>setDetails(!details)}><Text style={s.link}>{details?"Show less":"Read full description"}</Text></Pressable>
        </View>
        <PrimaryButton label={completed?"View completed work":attempt?"Resume lab":"Start lab"} busy={busy} onPress={()=>void act(begin)}/>
        <Text style={s.disabled}>This lab is saved with your unit. Resume your saved files and progress anytime.</Text>
        <View style={s.card}><Text style={s.title}>Project files</Text>{lab.files.map(f=><Text key={f.fileId} style={s.copy}>{f.path} · {f.role==="YOU_BUILD"?"You build":"Provided"}</Text>)}</View>
        {criteria.length?<View style={s.card}><Text style={s.title}>Objectives</Text>{criteria.map((item,i)=><Text key={i} style={s.copy}>• {item}</Text>)}</View>:null}
      </>:<>
        {lab.files.map(f=><View key={f.fileId} style={[s.card,f.role==="YOU_BUILD"&&s.youBuildCard]}>
          <Text style={s.title}>{f.path} · {f.role==="YOU_BUILD"?(completed?"YOUR SAVED FILE":"EDITABLE — YOU BUILD"):f.role.replaceAll("_"," ")}</Text>
          {f.humanMeaning?<Text style={s.copy}>{f.humanMeaning}</Text>:null}
          {f.role==="YOU_BUILD"?<>
            <Text style={s.editableLabel}>{completed?"Saved learner submission":"Tap to edit · long press for Copy, Cut, Paste or Select all"}</Text>
            {completed?<Text style={s.code}>{drafts[f.fileId]??""}</Text>:<><LabCodeEditor
              value={drafts[f.fileId]??""}
              disabled={busy}
              onChange={text=>setDrafts(current=>({...current,[f.fileId]:text}))}
            /><Secondary label="Save draft" onPress={()=>void act(async()=>{await save(f.fileId);setInfo("Draft saved.");})}/></>}
            {(lab.hints??[]).filter(hint=>hint.fileId===f.fileId).map(hint=><View key={hint.hintNumber} style={s.fileHint}>
              <Text style={s.fileHintTitle}>💡 Hint {hint.hintNumber}</Text>
              <Text style={s.copy}>{hint.hint}</Text>
            </View>)}
            {!completed&&usedHints<2?<Pressable accessibilityRole="button" disabled={busy} style={{minHeight:48,borderWidth:1,borderColor:"#E3B341",backgroundColor:"#FFF4CC",borderRadius:11,alignItems:"center",justifyContent:"center",marginTop:12,paddingHorizontal:12}} onPress={()=>void act(async()=>{
              if(!attempt)return;
              await save(f.fileId);
              await api.labHint(token,attempt,f.fileId);
              await load();
            })}><Text style={{color:"#754C00",fontWeight:"900"}}>💡 Use Hint {usedHints+1} for this file</Text></Pressable>:null}
          </>:<Text style={s.code}>{f.content}</Text>}
        </View>)}
        <Text style={s.copy}>Hints used: {usedHints} of 2</Text>
        {!completed&&usedHints<2?<Notice>Hints are inside each blue EDITABLE — YOU BUILD file. Use the hint for the file you are working on.</Notice>:null}
        {completed&&lab.completion?<View style={s.resultCard}><Text style={s.resultTitle}>✓ Lab completed</Text><Text style={s.copy}>Result: {lab.completion.run?.status??(lab.completion.submission?.completed?"PASSED":"SUBMITTED")}</Text><Text style={s.copy}>Assistance: {lab.completion.highestAssistanceLevel.replaceAll("_"," ")}</Text><Text style={s.copy}>Evidence: {lab.completion.evidence.filter(item=>item.outcome==="DEMONSTRATED").length} demonstrated · {lab.completion.evidence.filter(item=>item.outcome==="PARTIAL").length} partial · {lab.completion.evidence.filter(item=>item.outcome==="NOT_DEMONSTRATED").length} not demonstrated</Text>{lab.completion.evidence.map(item=><Text key={item.evidenceId} style={s.copy}>• {item.conceptName??"Learning evidence"}: {item.outcome.replaceAll("_"," ").toLowerCase()}</Text>)}</View>:null}
        <View style={{gap:12,marginTop:8}}>
          {completed?<PrimaryButton label={labContinueLabel(lab.nextAction)} busy={busy} onPress={()=>void act(()=>onChanged(lab.nextAction))}/>:null}
          {!completed&&usedHints>=2?<Secondary label="Request System Assistance" onPress={()=>void act(async()=>{if(!attempt)return;await saveAll();const a=await api.systemAssistance(token,attempt);await load();setInfo(a.content);})}/>:null}
          {!completed?<Secondary label="Run checks" onPress={()=>void act(async()=>{if(!attempt)return;await saveAll();const result=await api.runLab(token,attempt);setInfo(`Run result: ${result.status}`);})}/>:null}
          {!completed?<PrimaryButton label="Submit Lab" busy={busy} onPress={()=>void act(async()=>{if(!attempt)return;await saveAll();const result=await api.submitLab(token,attempt);if(result.passed){await load();setInfo("Lab passed. Review your saved result and evidence, then continue.");}else setInfo("The submission needs more work. Your draft is saved.");})}/>:null}
        </View>
      </>}
    </>:null}
    {info?<Notice>{info}</Notice>:null}
    {!lab&&!busy?<Secondary label="Retry loading lab" onPress={()=>void act(load)}/>:null}
  </Shell>;
}

function LabCodeEditor({value,disabled,onChange}:{value:string;disabled:boolean;onChange:(value:string)=>void}){
  const revealFocusedInput=useRevealFocusedInput();
  return <TextInput
    accessibilityLabel="Editable code"
    value={value}
    onChangeText={onChange}
    editable={!disabled}
    onFocus={revealFocusedInput}
    multiline
    scrollEnabled
    contextMenuHidden={false}
    caretHidden={false}
    selectTextOnFocus={false}
    autoCapitalize="none"
    autoCorrect={false}
    spellCheck={false}
    keyboardAppearance="light"
    selectionColor="#68A1FF"
    cursorColor="#D7E4FF"
    textAlignVertical="top"
    style={s.editor}
  />;
}

function Doubts({token,onBack,onChanged}:{token:string;onBack:()=>void;onChanged:()=>Promise<void>}){const[items,setItems]=useState<LearningDoubt[]>([]),[busy,setBusy]=useState(true),[info,setInfo]=useState("");async function load(){setBusy(true);try{setItems(await api.learningDoubts(token));}catch(e){setInfo(message(e));}finally{setBusy(false);}}useEffect(()=>{void load();},[token]);async function resolve(id:string){setBusy(true);try{await api.resolveDoubt(token,id);await load();await onChanged();}catch(e){setInfo(message(e));}finally{setBusy(false);}}return <Shell onBack={onBack}><Text style={s.h1}>Doubt Clearance</Text><Text style={s.copy}>After your lab, we clarify unresolved theory and preserve deeper topics for future reinforcement.</Text>{busy&&!items.length?<ActivityIndicator color={C.blue}/>:null}{items.map(d=><View key={d.doubtId} style={s.card}><Text style={s.title}>{d.conceptName||d.unitTitle||"Learning doubt"}</Text><Text style={s.copy}>{d.sourceText}</Text>{d.resolutionType==="MERGE_INTO_NEXT_UNIT"?<Notice>This will be reinforced in a future unit or lab.</Notice>:d.context?.explanation?<><Text style={s.copy}>{d.context.explanation}</Text>{d.context.recap?.map((x,i)=><Text key={i} style={s.copy}>• {x}</Text>)}</>:<Notice>Preparing a focused theory clarification.</Notice>}<PrimaryButton label="I understand now" onPress={()=>void resolve(d.doubtId)} busy={busy}/></View>)}{!busy&&!items.length?<Notice>You have no unresolved doubts.</Notice>:null}{info?<Notice tone="red">{info}</Notice>:null}</Shell>}

function Notes({token,onBack,onOpen}:{token:string;onBack:()=>void;onOpen:(id:string|null)=>void}){const[q,setQ]=useState(""),[items,setItems]=useState<LearningNote[]>([]);useEffect(()=>{api.notes(token,q).then(setItems).catch(()=>setItems([]));},[token,q]);return <Shell onBack={onBack}><Text style={s.h1}>Saved Notes</Text><Field label="Search" value={q} onChangeText={setQ} placeholder="Search your notes"/>{items.map(n=><View key={n.noteId} style={s.card}><Text style={s.title}>{n.selectedText||n.sourceType}</Text><Text style={s.copy}>{n.body}</Text><Pressable onPress={()=>onOpen(n.unitId)}><Text style={s.link}>Open original context</Text></Pressable></View>)}</Shell>}
function Words({token,onBack,onOpen}:{token:string;onBack:()=>void;onOpen:(id:string|null)=>void}){const[q,setQ]=useState(""),[items,setItems]=useState<MarkedWord[]>([]);useEffect(()=>{api.markedWords(token,q).then(setItems).catch(()=>setItems([]));},[token,q]);return <Shell onBack={onBack}><Text style={s.h1}>Marked Words</Text><Field label="Search" value={q} onChangeText={setQ} placeholder="Search your marked words"/>{items.map(w=><View key={w.markedWordId} style={s.card}><Text style={s.title}>{w.selectedText}</Text><Text style={s.copy}>Simple: {w.simpleMeaning}</Text><Text style={s.copy}>Technical: {w.technicalMeaning}</Text><Text style={s.badge}>{w.learnerStatus.replaceAll("_"," ")}</Text><Pressable onPress={()=>onOpen(w.unitId)}><Text style={s.link}>Open original context</Text></Pressable></View>)}</Shell>}
function Shell({children,onBack}:{children:ReactNode;onBack:()=>void}){return <Screen><View style={s.header}><Pressable accessibilityLabel="Go back" onPress={onBack} style={s.backButton}><Text style={s.back}>←</Text></Pressable><Brand compact/><View style={{width:44}}/></View>{children}</Screen>}
function Secondary({label,onPress}:{label:string;onPress:()=>void}){return <Pressable onPress={onPress} style={s.secondary}><Text style={s.secondaryText}>{label}</Text></Pressable>}
function label(action?:ContinuationState["nextAction"]){return action==="DOUBT_CLEARANCE"?"Doubt Clearance":action?.replaceAll("_"," ").toLowerCase().replace(/^./,x=>x.toUpperCase())||"Learning path ready"}
function message(e:unknown){return e instanceof Error?e.message:"Something went wrong."}
const s=StyleSheet.create({header:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginBottom:16},backButton:{width:44,height:44,borderRadius:12,alignItems:"center",justifyContent:"center",backgroundColor:"#F3F6FA"},back:{fontSize:24,color:C.ink,fontWeight:"900"},h1:{fontSize:27,lineHeight:32,fontWeight:"900",color:C.ink,marginVertical:8},title:{fontSize:14,fontWeight:"800",color:C.ink},copy:{fontSize:13,lineHeight:19,color:C.muted,marginVertical:5},lessonGoal:{fontSize:15,lineHeight:22,color:C.muted,marginBottom:12},card:{borderWidth:1,borderColor:C.line,borderRadius:14,padding:13,marginVertical:7,backgroundColor:"white"},lockedCard:{backgroundColor:"#F6F8FB",opacity:.65},unitHeading:{flexDirection:"row",alignItems:"flex-start",gap:10},unitStatus:{marginLeft:"auto",color:C.blue,backgroundColor:"#EAF2FF",borderRadius:10,paddingHorizontal:8,paddingVertical:4,fontSize:10,fontWeight:"800"},unitStatusDone:{color:"#168253",backgroundColor:"#E2F8ED"},resultCard:{borderWidth:1,borderColor:"#8BD4B0",backgroundColor:"#F0FBF5",borderRadius:12,padding:13,marginTop:10},resultTitle:{color:"#168253",fontSize:16,fontWeight:"900"},youBuildCard:{borderColor:"#71A9FF",backgroundColor:"#F3F8FF",borderWidth:2},editableLabel:{color:C.blue,fontSize:11,lineHeight:16,fontWeight:"700",marginTop:4},fileHint:{borderWidth:1,borderColor:"#F0C458",backgroundColor:"#FFF9E8",borderRadius:10,padding:11,marginTop:10},fileHintTitle:{color:"#8A5A00",fontSize:12,fontWeight:"900"},choice:{padding:11,borderRadius:10,borderWidth:1,borderColor:C.line,marginTop:7},choiceOn:{borderColor:C.blue,backgroundColor:"#F1F6FF"},secondary:{minHeight:45,borderWidth:1,borderColor:"#A9C9FF",borderRadius:11,alignItems:"center",justifyContent:"center",marginTop:8},secondaryText:{fontWeight:"800",color:C.blue},disabled:{color:C.muted,textAlign:"center",fontSize:12,marginVertical:12},continueHelp:{color:C.muted,textAlign:"center",fontSize:12,marginTop:12,marginBottom:4},editor:{height:260,borderRadius:9,backgroundColor:"#101827",color:"#D7E4FF",fontFamily:Platform.select({ios:"Menlo",default:"monospace"}),fontSize:13,lineHeight:20,padding:12,textAlignVertical:"top",marginTop:10},code:{fontFamily:Platform.select({ios:"Menlo",default:"monospace"}),fontSize:12,color:C.ink,marginTop:8},link:{color:C.blue,fontWeight:"800",marginTop:9},wrapActions:{flexDirection:"row",justifyContent:"space-between",gap:12},badge:{alignSelf:"flex-start",color:C.blue,backgroundColor:"#EAF2FF",padding:5,borderRadius:7,fontSize:10,fontWeight:"800"},accordionList:{gap:8,marginTop:8},accordion:{borderWidth:1,borderColor:C.line,borderRadius:12,backgroundColor:"white",overflow:"hidden"},accordionOpen:{borderColor:"#A9C9FF"},accordionHeader:{minHeight:52,paddingHorizontal:14,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},accordionTitle:{fontSize:15,lineHeight:20,fontWeight:"800",color:C.ink,flex:1,paddingRight:12},chevron:{fontSize:24,color:C.blue,fontWeight:"700"},accordionBody:{borderTopWidth:1,borderTopColor:"#EDF2FA",padding:14},readerText:{padding:0,margin:0,color:C.muted,fontSize:15,lineHeight:22,textAlignVertical:"top",backgroundColor:"transparent"},checkpointText:{color:C.ink,backgroundColor:"#F2F7FF",borderRadius:9,padding:10},bullets:{marginTop:4},recap:{backgroundColor:"#F7FAFF",borderRadius:9,padding:10},codeBox:{backgroundColor:"#101827",borderRadius:11,overflow:"hidden",marginVertical:8},codeHeader:{height:32,justifyContent:"center",paddingHorizontal:12,backgroundColor:"#182235",borderBottomWidth:1,borderBottomColor:"#2C3950"},codeLanguage:{fontSize:11,fontWeight:"800",color:"#9FB3D4"},codeScroll:{padding:12},codeText:{padding:0,color:"#D7E4FF",fontFamily:Platform.select({ios:"Menlo",default:"monospace"}),fontSize:12,lineHeight:19,textAlignVertical:"top",backgroundColor:"transparent"},selectionMenu:{flexDirection:"row",flexWrap:"wrap",gap:7,marginTop:12,paddingTop:10,borderTopWidth:1,borderTopColor:"#E4ECF8"},actionChip:{borderRadius:16,backgroundColor:"#EAF2FF",paddingHorizontal:11,paddingVertical:8},actionChipText:{fontSize:11,fontWeight:"800",color:C.blue},modalBackdrop:{flex:1,justifyContent:"flex-end",backgroundColor:"rgba(6,23,52,0.35)"},noteSheet:{backgroundColor:"white",borderTopLeftRadius:20,borderTopRightRadius:20,padding:20,paddingBottom:20},selectedQuote:{fontSize:13,lineHeight:19,color:C.muted,backgroundColor:"#F5F8FD",padding:10,borderRadius:9,marginTop:8},noteInput:{minHeight:100,borderWidth:1,borderColor:C.line,borderRadius:10,padding:12,textAlignVertical:"top",color:C.ink,marginTop:12},noteActions:{flexDirection:"row",justifyContent:"flex-end",gap:24,marginTop:10}});
