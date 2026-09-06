const assert = require('assert');
const http = require('http');
const { spawn } = require('child_process');

function post(port, contents, session_memory) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ contents, session_memory });
    const req = http.request({ hostname:'127.0.0.1', port, path:'/api/chat', method:'POST', headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)} }, res => {
      let data=''; res.on('data', x=>data+=x); res.on('end',()=>{ try { resolve({status:res.statusCode, body:JSON.parse(data)}); } catch(e){ reject(e); } });
    });
    req.on('error', reject); req.end(body);
  });
}

async function run(turns, port) {
  const child = spawn(process.execPath, ['scripts/kiosk-server.cjs'], { env:{...process.env,PORT:String(port),ADMIN_TOKEN:''}, stdio:['ignore','ignore','ignore'] });
  await new Promise(r=>setTimeout(r,450));
  try {
    let contents=[], memory=null, replies=[];
    for (const text of turns) {
      contents.push({role:'user',parts:[{text}]});
      const r=await post(port,contents,memory); assert.strictEqual(r.status,200);
      replies.push(r.body.reply); memory=r.body.sessionMemory;
      contents.push({role:'model',parts:[{text:r.body.reply}]});
    }
    return {replies,memory};
  } finally { child.kill(); }
}

(async()=>{
  const cut=await run([
    'I cut my finger',
    'no bro',
    "I mean no, it's not bleeding anymore.",
    'So what should I put on it?'
  ],3143);
  assert.strictEqual(cut.memory.conversationSummary.knownFacts.wound_location,'finger');
  assert.strictEqual(cut.memory.conversationSummary.knownFacts.bleeding_status,'not bleeding');
  assert.match(cut.replies[2],/finger/i);
  assert.match(cut.replies[3],/adhesive bandage/i);
  assert.doesNotMatch(cut.replies[3],/Is the wound bleeding|apply steady direct pressure/i);

  const burn=await run([
    'I burned my hand on a hot pan.',
    "It hurts and it's red",
    'btw what can you help me with?',
    'anyway, what should I do for my hand?'
  ],3144);
  assert.doesNotMatch(burn.replies[1],/What would you like help with/i);
  assert.match(burn.replies[1],/burn|cool|running water/i);
  assert.match(burn.replies[3],/running water|non-stick burn dressing/i);

  const bleeding=await run([
    'I have a small cut on my right hand.',
    'yep, just a little',
    'but it hurts',
    'I already said it is bleeding'
  ],3145);
  assert.strictEqual(bleeding.memory.conversationSummary.knownFacts.wound_location,'right hand');
  assert.strictEqual(bleeding.memory.conversationSummary.knownFacts.bleeding_status,'still bleeding');
  assert.doesNotMatch(bleeding.replies[3],/Is the wound bleeding right now/i);
  assert.match(bleeding.replies[3],/pressure|gauze|bleeding/i);


  const palm=await run([
    'I cut my palm while opening a can.',
    'It is bleeding a little, but I can control it.',
    'What in the kit can I use for that?',
    'Okay. How do I use it?',
    'What should I do now?'
  ],3146);
  assert.strictEqual(palm.memory.conversationSummary.knownFacts.wound_location,'palm');
  assert.strictEqual(palm.memory.conversationSummary.knownFacts.bleeding_status,'still bleeding');
  assert.match(palm.replies[2],/Sterile Gauze Pads|Adhesive Bandage/i);
  assert.match(palm.replies[3],/How to use it|Place clean gauze|direct pressure/i);
  assert.match(palm.replies[4],/pressure|gauze|bleeding/i);
  assert.doesNotMatch(palm.replies[4],/Is the wound bleeding right now/i);

  console.log('conversation continuity regressions: PASS');
})().catch(err=>{ console.error(err); process.exitCode=1; });
