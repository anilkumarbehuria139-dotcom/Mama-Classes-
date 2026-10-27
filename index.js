import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import {fileURLToPath} from "node:url";
import {validateDraft} from "./quality.js";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const PUBLIC=path.join(ROOT,"public");
const DATA=path.resolve(process.env.DATA_DIR||path.join(ROOT,"data"));
const DB=path.join(DATA,"drafts.json"), AUDIT=path.join(DATA,"audit.log");
const PORT=Number(process.env.PORT||3000);
await fs.mkdir(DATA,{recursive:true});
try{await fs.access(DB)}catch{await fs.writeFile(DB,"[]\\n")}

function send(res,status,data){res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});res.end(JSON.stringify(data))}
function auth(req){const a=Buffer.from(String(req.headers["x-admin-token"]||"")),b=Buffer.from(String(process.env.ADMIN_TOKEN||""));return b.length>=24&&a.length===b.length&&crypto.timingSafeEqual(a,b)}
async function read(){try{return JSON.parse(await fs.readFile(DB,"utf8"))}catch{return []}}
async function save(rows){const tmp=DB+".tmp";await fs.writeFile(tmp,JSON.stringify(rows,null,2)+"\\n");await fs.rename(tmp,DB)}
async function audit(action,id,detail=""){await fs.appendFile(AUDIT,JSON.stringify({at:new Date().toISOString(),action,id,detail})+"\\n")}
async function readBody(req){let s="";for await(const c of req){s+=c;if(s.length>150000)throw Error("Request too large")}return JSON.parse(s||"{}")}
function inputIssues(x){const e=[];if(!Number.isInteger(Number(x.classLevel))||+x.classLevel<6||+x.classLevel>12)e.push("Class must be 6–12.");if(!String(x.subject||"").trim())e.push("Subject is required.");if(!String(x.chapter||"").trim())e.push("Chapter/topic is required.");if(!["English","Hindi","Odia"].includes(x.language))e.push("Choose English, Hindi or Odia.");if(!["notes","mcq_set","short_answers","long_answers","worksheet","revision_test"].includes(x.contentType))e.push("Choose a supported content type.");return e}
function prompt(x){
 const tasks={notes:"Create original student-friendly chapter notes with learning objectives, explanation, worked examples, common mistakes, summary and 5 self-check questions.",mcq_set:"Create 10 original MCQs, four options each, one correct answer and explanation for each.",short_answers:"Create 10 original short-answer questions with model answers and marking points.",long_answers:"Create 5 original long-answer questions with structured model answers and marking guidance.",worksheet:"Create an original mixed-difficulty worksheet with answer key.",revision_test:"Create an original 20-mark revision test with marks and complete answer key."};
 return `Draft original educational material; never reproduce textbook passages or fabricate citations. Return ONLY JSON shaped as {"title":"...","learningObjectives":["..."],"content":"Markdown body","questions":[{"question":"...","options":["A","B","C","D"],"answer":"exact option text","explanation":"..."}],"answerKey":"...","sourceNotes":"assumptions and official URLs to verify; flag uncertainty"}. For non-MCQ content, questions may contain question/answer/explanation. Teacher must review before publication.\\nClass: ${x.classLevel}\\nSubject: ${x.subject}\\nChapter/topic: ${x.chapter}\\nLanguage: ${x.language}\\nContent type: ${x.contentType}\\nDifficulty: ${x.difficulty||"mixed"}\\nTeacher instructions: ${String(x.instructions||"None").slice(0,1500)}\\nTask: ${tasks[x.contentType]}`;
}
async function generate(x){
 if(!process.env.OPENAI_API_KEY)throw Error("OPENAI_API_KEY is not configured on the backend.");
 const r=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{"Authorization":`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({model:process.env.OPENAI_MODEL||"gpt-4.1-mini",temperature:.3,response_format:{type:"json_object"},messages:[{role:"system",content:"Generate original educational draft content. Return valid JSON only."},{role:"user",content:prompt(x)}]}),signal:AbortSignal.timeout(90000)});
 const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error?.message||`AI provider HTTP ${r.status}`);const t=d.choices?.[0]?.message?.content;if(!t)throw Error("Empty AI response");return JSON.parse(t);
}
async function staticFile(res,p){let f=path.resolve(PUBLIC,p==="/"?"index.html":p.slice(1));if(!f.startsWith(PUBLIC+path.sep)&&f!==path.join(PUBLIC,"index.html")){res.writeHead(403);return res.end("Forbidden")}try{const b=await fs.readFile(f),ext=path.extname(f);res.writeHead(200,{"Content-Type":({".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8"})[ext]||"application/octet-stream","X-Content-Type-Options":"nosniff"});res.end(b)}catch{res.writeHead(404);res.end("Not found")}}
http.createServer(async(req,res)=>{try{
 const u=new URL(req.url,`http://${req.headers.host||"localhost"}`);
 if(req.method==="GET"&&u.pathname==="/api/health")return send(res,200,{ok:true,aiConfigured:!!process.env.OPENAI_API_KEY});
 if(u.pathname.startsWith("/api/")){
  if(!auth(req))return send(res,401,{error:"Admin authentication required. Enter backend ADMIN_TOKEN."});
  if(req.method==="GET"&&u.pathname==="/api/drafts")return send(res,200,(await read()).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)));
  if(req.method==="POST"&&u.pathname==="/api/generate"){const x=await readBody(req),issues=inputIssues(x);if(issues.length)return send(res,400,{error:"Correct the form.",issues});let ai;try{ai=await generate(x)}catch(e){return send(res,502,{error:e.message})}
   const d={id:crypto.randomUUID(),title:String(ai.title||`${x.subject}: ${x.chapter}`).slice(0,180),classLevel:+x.classLevel,subject:String(x.subject).slice(0,100),chapter:String(x.chapter).slice(0,180),language:x.language,contentType:x.contentType,difficulty:x.difficulty||"mixed",content:String(ai.content||""),learningObjectives:Array.isArray(ai.learningObjectives)?ai.learningObjectives:[],questions:Array.isArray(ai.questions)?ai.questions:[],answerKey:String(ai.answerKey||""),sourceNotes:String(ai.sourceNotes||""),quality:null,status:"pending_review",createdAt:new Date().toISOString(),reviewedAt:null,reviewerNotes:""};
   d.quality=validateDraft(d);const rows=await read();rows.push(d);await save(rows);await audit("generated",d.id,d.quality.status);return send(res,201,d)}
  const m=u.pathname.match(/^\\/api\\/drafts\\/([a-f0-9-]+)\\/(approve|reject)$/i);
  if(req.method==="POST"&&m){const [,id,action]=m,body=await readBody(req),rows=await read(),d=rows.find(x=>x.id===id);if(!d)return send(res,404,{error:"Draft not found"});if(action==="approve"&&d.quality?.issues?.length)return send(res,409,{error:"Fix quality issues before approval",issues:d.quality.issues});d.status=action==="approve"?"approved":"rejected";d.reviewerNotes=String(body.notes||"").slice(0,2000);d.reviewedAt=new Date().toISOString();await save(rows);await audit(action,id,d.reviewerNotes);return send(res,200,d)}
  if(req.method==="GET"&&u.pathname==="/api/export-approved")return send(res,200,(await read()).filter(d=>d.status==="approved"));
  return send(res,404,{error:"Unknown API endpoint"});
 }
 if(req.method==="GET")return staticFile(res,u.pathname);
 res.writeHead(405);res.end("Method not allowed");
}catch(e){send(res,500,{error:e.message||"Internal server error"})}}).listen(PORT,"0.0.0.0",()=>console.log(`ExamSkeeda AI engine listening on ${PORT}`));
