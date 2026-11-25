const fs=require('fs'),path=require('path'),root=process.cwd(),ts=require(root+'/node_modules/typescript');
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>{
 let src=fs.readFileSync(f,'utf8');if(f.endsWith('/app/page.tsx'))src+='\nexport {newHand,newAof,showdown,act,madeHandText,handNet,hudRate};';
 m._compile(ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,f)
};
const {newHand,newAof,showdown,act,madeHandText,handNet,hudRate}=require(root+'/app/page.tsx'),{newCareerWallet}=require(root+'/app/career-bankroll.ts'),{emptySessionStats}=require(root+'/app/session-stats.ts'),assert=require('node:assert/strict');
const c=(rank,suit)=>({rank,suit});
const holes=[c(13,'h'),c(10,'h')],board=[c(14,'d'),c(11,'d'),c(6,'d'),c(11,'h')];
assert.equal(madeHandText(holes,board),'一對 J · 公共牌成對');assert.equal(madeHandText([c(11,'s'),c(2,'s')],board.slice(0,3)),'一對 J · 底牌參與成對');
assert.equal(hudRate(0,0),'—');assert.equal(hudRate(0,10),'0%');
function fixture(mode){
 let game=newHand(Array(8).fill(100),5,2,()=>.32,undefined,'decision-test');
 game.turn=2;game.street='turn';game.board=board;game.players[0].hole=holes;
 game.players[0].stack=71;game.players[0].totalBet=0;
 game.players.forEach(player=>{player.streetBet=0});
 game.currentBet=0;game.minRaise=1;game.pending=game.players.map(()=>true);
 game=act(game,2,'raise',29.5);game.turn=0;
 if(mode==='check'){game.currentBet=0;game.timeline=[];}
 if(mode==='blind'){game.players[0].streetBet=1;game.players[0].stack=70;}
 if(mode==='short'){game.players[0].stack=7;game.players[0].totalBet=93;}
 if(mode==='watch'){game.turn=7;game.players.forEach((p,i)=>p.folded=i!==0&&i!==7);game.currentBet=0;}
 if(mode==='split'){
   game=newHand([10,20,30,30],1,2,()=>.42);
   game.board=[10,11,12,13,14].map(rank=>c(rank,'h'));
   game.players.forEach((p,i)=>{p.hole=[c(i+2,'c'),c(i+6,'s')];p.stack=0;p.allIn=i!==3;p.folded=i===3;p.totalBet=game.startingStacks[i]});
   game=showdown(game);
 }
 let aof;if(mode==='aof'){aof=newAof();aof.game.turn=0;}
 return {version:2,career:newCareerWallet(),savedAt:Date.now(),started:true,hasActiveTable:true,handFilter:{enabled:false,scope:'global',hands:[],positionHands:{}},game,gameMode:['watch','tournament'].includes(mode)?'tournament':'cash',lobbySize:game.players.length,difficulty:'casual',sessions:game.players.map(()=>emptySessionStats()),handHistory:[],coachReviews:[],profitHistory:[],aof,aofOpen:!!aof};
}
const server=require('http').createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost');let f=path.join(root,'dist',u.pathname==='/'?'index.html':u.pathname);
 if(!f.startsWith(path.join(root,'dist')+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()) {res.writeHead(404);return res.end()}
 let data=fs.readFileSync(f);if(u.pathname==='/'&&u.searchParams.has('mode')){let save=fixture(u.searchParams.get('mode'));data=data.toString().replace('<head>','<head><script>localStorage.clear();localStorage.setItem("poker-auto-resume","yes");localStorage.setItem("poker-river-squeeze","yes");localStorage.setItem("poker-career-save:/",'+JSON.stringify(JSON.stringify({updatedAt:Date.now(),state:save}))+')</script>')}
 res.setHeader('Content-Type',f.endsWith('js')?'text/javascript':f.endsWith('css')?'text/css':'text/html');res.end(data);
});
server.listen(0,'127.0.0.1',()=>process.send(server.address().port));
