const assert = require('assert');
const http = require('http');

async function post(port, contents) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({contents, system_instruction:{parts:[{text:'You are MedisinACSHS.'}]}});
    const req = http.request({hostname:'127.0.0.1', port, path:'/api/chat', method:'POST', headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}}, res => {
      let data=''; res.on('data',d=>data+=d); res.on('end',()=>{ try { resolve({status:res.statusCode, body:JSON.parse(data)}); } catch(e){ reject(e); }});
    });
    req.on('error', reject); req.write(body); req.end();
  });
}

(async()=>{
  const port=3137;
  const {spawn}=require('child_process');
  const child=spawn(process.execPath,['scripts/kiosk-server.cjs'],{env:{...process.env,PORT:String(port),OLLAMA_URL:'http://127.0.0.1:9/api/chat',ADMIN_TOKEN:''},stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{let done=false; const timer=setTimeout(()=>{if(!done){done=true;resolve();}},500); child.stdout.on('data',d=>{if(/running at/.test(d.toString())&&!done){done=true;clearTimeout(timer);resolve();}}); child.on('exit',c=>{if(!done){done=true;reject(new Error('server exited '+c));}})});

  let r=await post(port,[{role:'user',parts:[{text:'I feel dizzy.'}]}]);
  assert.strictEqual(r.status,200); assert.match(r.body.reply,/dizz|safe|sit|lie/i); assert.strictEqual(r.body.assessment.topic,'dizziness');
  r=await post(port,[{role:'user',parts:[{text:'I have heavy bleeding.'}]}]);
  assert.strictEqual(r.status,200); assert.match(r.body.reply,/911/i); assert.match(r.body.reply,/gauze|cloth|pressure/i);
  r=await post(port,[{role:'user',parts:[{text:'hospital near me'}]}]);
  assert.strictEqual(r.status,200); assert.match(r.body.reply,/city or municipality/i); assert.doesNotMatch(r.body.reply,/Antipolo City:/i);
  r=await post(port,[{role:'user',parts:[{text:'hospital near me'}]},{role:'model',parts:[{text:'What city or municipality are you currently in?'}]},{role:'user',parts:[{text:'Antipolo'}]}]);
  assert.strictEqual(r.status,200); assert.match(r.body.reply,/Metro Antipolo Hospital|Antipolo Doctors Hospital|Clinica Antipolo/i);
  r=await post(port,[{role:'user',parts:[{text:"What's in the med kit?"}]}]);
  assert.strictEqual(r.status,200); assert.match(r.body.reply,/Wound Care & Bleeding Control/); assert.match(r.body.reply,/Sterile Gauze Pads/); assert.match(r.body.reply,/PPE & Infection Control/);
  r=await post(port,[{role:'user',parts:[{text:'What medicine should I take?'}]}]);
  assert.strictEqual(r.status,200); assert.match(r.body.reply,/cannot prescribe medication/i);
  child.kill('SIGTERM');
  console.log('api smoke: PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
