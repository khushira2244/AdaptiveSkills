import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createServer } from "node:net";

async function available(port) {
  const server=createServer();
  return new Promise(resolve=>{
    server.once("error",()=>resolve(false));
    server.listen(port,"127.0.0.1",()=>server.close(()=>resolve(true)));
  });
}
const port=await available(5432) ? 5432 : await available(5433) ? 5433 : null;
if (!port) throw new Error("Ports 5432 and 5433 are occupied; configure an unused local port manually");
const password=randomBytes(32).toString("hex");
const secret=randomBytes(32).toString("hex");
try {
  await writeFile(".env",[
    "NODE_ENV=development","HOST=127.0.0.1","PORT=3000","LOG_LEVEL=info",
    "POSTGRES_PORT="+port,"POSTGRES_PASSWORD="+password,
    "DATABASE_URL=postgresql://adaptive_labs:"+password+"@127.0.0.1:"+port+"/adaptive_labs",
    "AUTH_SECRET="+secret,"RESUME_STORAGE_DIR=.data/resumes","",
  ].join("\n"),{ flag:"wx",mode:0o600 });
  console.log("Created local .env using PostgreSQL port "+port+". Secrets were not printed.");
} catch(error) {
  if (error.code==="EEXIST") {
    console.error(".env already exists; preserve it and update manually if needed");
    process.exitCode=1;
  } else throw error;
}
