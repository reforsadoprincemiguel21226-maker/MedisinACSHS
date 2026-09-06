const assert = require('assert');
const http = require('http');
const { spawn } = require('child_process');

function post(port, text) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ contents: [{ role: 'user', parts: [{ text }] }] });
    const req = http.request({ hostname:'127.0.0.1', port, path:'/api/chat', method:'POST', headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)} }, res => {
      let data=''; res.on('data',x=>data+=x); res.on('end',()=>{ try { resolve(JSON.parse(data)); } catch(e){reject(e);} });
    });
    req.on('error',reject); req.end(body);
  });
}

(async()=>{
  const port=3192;
  const child=spawn(process.execPath,['scripts/kiosk-server.cjs'],{env:{...process.env,PORT:String(port),ADMIN_TOKEN:''},stdio:['ignore','ignore','ignore']});
  await new Promise(r=>setTimeout(r,450));
  try {
    const prompts = [
      ['What is the adhesive bandage for?','Adhesive Bandages'],
      ['What is gauze for?','Sterile Gauze Pads'],
      ['What is medical adhesive tape for?','Medical Adhesive Tape'],
      ['What are cotton swabs for?','Cotton Swabs'],
      ['What is the burn dressing for?','Burn Dressing'],
      ['What is antiseptic for?','Antiseptic Solution'],
      ['What is hand sanitizer for?','Isopropyl Alcohol / Hand Sanitizer'],
      ['What are medical gloves for?','Disposable Medical Gloves'],
      ['What is a face mask for?','Medical Face Masks'],
      ['What is the CPR face shield for?','CPR Face Shield'],
      ['What is the elastic bandage for?','Elastic Bandage'],
      ['What is the triangular bandage for?','Triangular Bandage'],
      ['What is the cold pack for?','Instant Cold Packs'],
      ['What are medical scissors for?','Medical Scissors'],
      ['What are tweezers for?','Fine-Tip Tweezers'],
      ['What is the thermometer for?','Digital Thermometer'],
      ['What is the thermal blanket for?','Emergency Thermal Blanket'],
      ['What is saline for?','Sterile Saline Solution'],
    ];
    for (const [q, expected] of prompts) {
      const r=await post(port,q); assert.strictEqual(r.error,undefined, q); assert.match(r.reply,new RegExp(expected.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&'),'i'),q); assert.match(r.reply,/Purpose:|How to use/i,q);
    }
    console.log('individual kit-item guidance: PASS');
  } finally { child.kill(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
