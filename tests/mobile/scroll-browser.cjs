const {spawn}=require('node:child_process'),fs=require('node:fs'),assert=require('node:assert/strict');
// From the repo root after npm run build: node tests/mobile/scroll-browser.cjs
const fixture=require('node:child_process').fork(require.resolve('./scroll-fixture.cjs'));
const port=new Promise(resolve=>fixture.once('message',resolve));
const proc=spawn(process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless','--no-first-run','--no-default-browser-check','--remote-debugging-pipe','--disable-gpu','--user-data-dir='+fs.mkdtempSync('/private/tmp/decision-chrome-')],{stdio:['ignore','ignore','ignore','pipe','pipe']});
const requests=new Map();let buffer='',id=0,sessionId;
proc.stdio[4].on('data',data=>{buffer+=data;let pos;while((pos=buffer.indexOf('\0'))>=0){let obj=JSON.parse(buffer.slice(0,pos));buffer=buffer.slice(pos+1);requests.get(obj.id)?.(obj);requests.delete(obj.id)}});
function call(method,params={},session=sessionId){return new Promise((ok,no)=>{const n=++id;requests.set(n,r=>r.error?no(Error(JSON.stringify(r.error))):ok(r.result));proc.stdio[3].write(JSON.stringify({method,params,id:n,sessionId:session})+'\0')})}
async function js(expression){const r=await call('Runtime.evaluate',{expression,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||'JS');return r.result.value}
const pause=t=>new Promise(r=>setTimeout(r,t));
async function wait(exp){for(let i=0;i<100;i++){if(await js(exp))return;await pause(70)}throw Error(exp+' '+await js('document.body.innerText.slice(0,800)'))}
async function go(mode,selector){await call('Page.navigate',{url:'http://127.0.0.1:'+await port+'/'+(mode?'?mode='+mode:'')});await wait('document.querySelector('+JSON.stringify(selector)+')!==null')}
const timer=setTimeout(()=>{proc.kill();process.exit(2)},100000);
(async()=>{const t=await call('Target.createTarget',{url:'about:blank'});sessionId=(await call('Target.attachToTarget',{targetId:t.targetId,flatten:true})).sessionId;

await call('Page.enable');await call('Emulation.setTouchEmulationEnabled',{enabled:true});
for(const mode of ['cash','tournament','aof']){
const width=430,height=932;await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});await go(mode,mode==='aof'?'.aof-actions':'.pt-choices');await pause(240);
await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:180,y:480}]});
for(let y=450;y>120;y-=30){await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:180,y}]});await pause(18)}
await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await pause(350);
assert(await js('('+require(process.cwd()+'/scripts/check-portrait-scroll.cjs').toString()+')()'));
await js("document.querySelector('main').scrollTop=document.querySelector('main').scrollHeight");await wait("!!document.querySelector('.pt-scroll-return')");await js("document.querySelector('.pt-scroll-return').click()");if(mode!=='aof'){
  const toggle="document.querySelector('.pt-filter-quick [role=switch]')";
  const edit="document.querySelector('.pt-filter-quick button:last-child')";
  const top=await js("document.querySelector('main').scrollTop");
  await js(toggle+".click()");
  await wait("!!document.querySelector('.pt-filter-presets')");
  assert.equal(await js(toggle+".getAttribute('aria-checked')"),'false');
  await js("document.querySelector('.pt-filter-presets div button').click()");
  assert.equal(await js("document.querySelector('main').scrollTop"),top);
  await wait("JSON.parse(localStorage.getItem('poker-career-save:/'))?.state?.handFilter?.enabled===true");
  await go('','.pt-choices');
  assert.equal(await js(toggle+".getAttribute('aria-checked')"),'true');
  await js(toggle+".click()");
  await wait(toggle+".getAttribute('aria-checked')==='false'");
  await js(edit+".click()");
  await wait("document.querySelector('.hand-filter-panel').open");
}
console.log(mode,'PASS')}
for(const [mode,callLabel,preview] of [
  ['cash','跟注 29.5 BB','加注再投入 59 BB · 餘下 12 BB'],
  ['blind','跟注 28.5 BB','加注再投入 58 BB · 餘下 12 BB'],
  ['check','過牌','下注再投入'],
  ['short','跟注 7 BB',''],
]){
  await go(mode,'.pt-choices');
  await js("document.querySelector('main').scrollTop=0");
  await pause(180);
  await wait(`document.querySelector('.pt-choices .call-action')?.textContent===${JSON.stringify(callLabel)}`);
  assert((await js("document.querySelector('.raise-cost').textContent")).includes(preview));
  if(mode==='cash'){
    assert.equal(await js("document.querySelector('.recent-action .pt-wager').textContent"),'下注 29.5 BB');
    assert.equal(await js("document.querySelector('.pt-seat.acting .pt-action').textContent"),'輪到你');
    if(process.env.POKER_EVIDENCE_DIR){
      const {data}=await call('Page.captureScreenshot');
      fs.writeFileSync(process.env.POKER_EVIDENCE_DIR+'/turn-after.png',Buffer.from(data,'base64'));
    }
  }
}
for(const [width,height] of [[390,844],[393,852],[440,956],[390,660]]){
  await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});
  await go('cash','.pt-choices');
  await js("document.querySelector('main').scrollTop=0");
  await pause(200);
  assert(await js("document.querySelectorAll('.pt-seat').length===8 && document.querySelector('main').scrollWidth<=document.querySelector('main').clientWidth"));
  if(height>=844)assert(await js("document.querySelector('.pt-choices').getBoundingClientRect().bottom<=innerHeight+1"));
}
await call('Emulation.setDeviceMetricsOverride',{width:430,height:932,deviceScaleFactor:1,mobile:true});
await go('split','.pt-result-summary');
await wait("document.querySelector('.pt-result-summary').innerText.includes('你同 2 位對手平分主池，分得 13.33 BB')");
if(process.env.POKER_EVIDENCE_DIR){
  const {data}=await call('Page.captureScreenshot');
  fs.writeFileSync(process.env.POKER_EVIDENCE_DIR+'/player-split.png',Buffer.from(data,'base64'));
}
console.log('Decision labels and split-pot summary PASS');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{fixture.kill();proc.kill();clearTimeout(timer)});
