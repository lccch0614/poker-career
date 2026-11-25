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
  const openFilter="[...document.querySelectorAll('.pt-header button')].find(b=>b.textContent.includes('自動棄牌')).click()";
  await js(openFilter);
  await js("document.querySelector('.hand-filter-presets button').click()");
  await js("const box=document.querySelector('.hand-filter-switch input');if(!box.checked)box.click()");
  await wait("JSON.parse(localStorage.getItem('poker-career-save:/'))?.state?.handFilter?.enabled===true");
  await go('','.pt-choices');await js(openFilter);
  assert(await js("document.querySelector('.hand-filter-switch input').checked"));
  await js("document.querySelector('.hand-filter-switch input').click()");
  await wait("!document.querySelector('.hand-filter-switch input').checked");
}
console.log(mode,'PASS')}
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{fixture.kill();proc.kill();clearTimeout(timer)});
