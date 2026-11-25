import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { mountBetDock, mountPortraitTable } from './portrait-table.js';

export function usePortraitTable() {
  const query = '(max-width: 700px) and (orientation: portrait)';
  const [portrait,setPortrait] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  const [panel,setPanel] = useState('');
  const readHud = () => {try {return localStorage.getItem('poker-portrait-hud') !== 'off'} catch {return true}};
  const [hud,updateHud] = useState(readHud);
  const setHud = (value:boolean) => {
    updateHud(value);
    try {localStorage.setItem('poker-portrait-hud',value?'on':'off');window.dispatchEvent(new Event('portrait-hud'))} catch { /* Session preference remains usable. */ }
  };
  useEffect(()=>{
    const sync=()=>updateHud(readHud());
    window.addEventListener('portrait-hud',sync);
    window.addEventListener('storage',sync);
    return ()=>{window.removeEventListener('portrait-hud',sync);window.removeEventListener('storage',sync)};
  },[]);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => {setPortrait(media.matches);setPanel('')};
    media.addEventListener('change',update);
    return () => media.removeEventListener('change',update);
  },[]);
  useLayoutEffect(() => {
    if (!portrait || !panel) return;
    const back = document.querySelector<HTMLButtonElement>('.pt-back');
    back?.focus({preventScroll:true});
    if(panel==='seat') document.querySelector('.session-panel,.aof-stats')?.scrollIntoView({block:'start'});
    if(panel.startsWith('aof-seat-')) document.querySelector(`[data-aof-seat="${Number(panel.slice(9))}"]`)?.scrollIntoView({block:'center'});
    const close = (event:KeyboardEvent) => {if(event.key==='Escape' && !document.querySelector('[aria-modal="true"]')) setPanel('')};
    window.addEventListener('keydown',close);
    return () => window.removeEventListener('keydown',close);
  },[portrait,panel]);
  return {portrait,panel,setPanel,hud,setHud};
}
export function PortraitHeader({ui,title,meta,heroTurn,autoFold,decision}:{autoFold?:{enabled:boolean;configured:boolean;status:string;toggle:()=>void;presets:{size:number;apply:()=>void}[]};decision?:string;heroTurn:boolean;ui:ReturnType<typeof usePortraitTable>,title:string,meta:string}) {
  const settings = useRef<HTMLButtonElement>(null);
  const header=useRef<HTMLElement>(null);
  const [away,setAway]=useState(false);
  const [choosingRange,setChoosingRange]=useState(false);
  function jump(filter:boolean) {
    const shell=header.current?.closest('main');
    const target=shell?.querySelector<HTMLElement>(filter?'.hand-filter-panel':'.hand-filter-panel,.aof-bankroll');
    if(!target)return;
    if(filter && target instanceof HTMLDetailsElement)target.open=true;
    target.scrollIntoView({block:'start'});
    target.querySelector<HTMLElement>('summary')?.focus({preventScroll:true});
  }
  useLayoutEffect(()=>{
    const el=header.current, shell=el?.closest('main');
    if(!el || !shell || ui.panel)return;
    const size=new ResizeObserver(()=>shell.style.setProperty('--header-h',el.offsetHeight+'px'));
    size.observe(el);
    const actions=shell.querySelector('.controls,.aof-actions');
    const observer=new IntersectionObserver(([entry])=>setAway(!entry.isIntersecting && shell.scrollTop>0),{root:shell});
    if(actions)observer.observe(actions);
    return ()=>{size.disconnect();observer.disconnect()};
  },[ui.panel,heroTurn]);
  const hadPanel = useRef(false);
  useLayoutEffect(()=>{
    if(hadPanel.current && !ui.panel) settings.current?.focus({preventScroll:true});
    hadPanel.current=!!ui.panel;
  },[ui.panel]);
  return <header ref={header} className="pt-header"><div><small>POKER CAREER</small><h1>{title}</h1></div>
    {ui.panel ? <button className="pt-back" onClick={()=>ui.setPanel('')}>{heroTurn?'輪到你 · 返回牌桌':'返回牌桌'}</button> : <button ref={settings} onClick={()=>{setChoosingRange(false);jump(false)}}>牌桌資料</button>}
    {!ui.panel && autoFold && <div className="pt-filter-quick">
      <button role="switch" aria-checked={autoFold.enabled} aria-expanded={!autoFold.configured ? choosingRange : undefined} onClick={()=>{
        if(autoFold.configured) autoFold.toggle();
        else setChoosingRange(open=>!open);
      }}>自動棄牌 · {autoFold.status}</button>
      <button onClick={()=>{setChoosingRange(false);jump(true)}}>編輯範圍</button>
      {choosingRange && <section className="pt-filter-presets" aria-label="套用起手牌預設">
        <p>範圍以外嘅牌會自動棄</p>
        <div>{autoFold.presets.map(({size,apply})=><button key={size} onClick={()=>{apply();setChoosingRange(false)}}>套用 {size}%</button>)}</div>
        <button onClick={()=>setChoosingRange(false)}>取消</button>
      </section>}
    </div>}
    {away && heroTurn && !ui.panel && <button className="pt-scroll-return" onClick={()=>{header.current?.closest('main')?.querySelector('.pt-choices,.aof-actions')?.scrollIntoView({block:'end'})}}>輪到你 · {decision || '全押或棄牌'} · 返回牌桌</button>}
    <div className="pt-meta"><span>{meta}</span><button aria-pressed={ui.hud} onClick={()=>ui.setHud(!ui.hud)}>HUD {ui.hud?'ON':'OFF'}</button></div></header>;
}
type SeatView = {sample:number;metrics:string[];bet:string;recent?:string;wagerLabel?:string;slot:number;name:string;position:string;stack:string;action:string;stats:string;cards:string[];folded:boolean;acting:boolean};
type View = {hand:string;pots:string[];pot:string;board:string[];message:string;hint:string;seats:SeatView[]};
export function PortraitFelt({view,onSeat}:{view:View;onSeat:(index:number)=>void}) {
  const root=useRef<HTMLDivElement>(null);
  const render=useRef<ReturnType<typeof mountPortraitTable>|null>(null);
  const select=useRef(onSeat);
  useLayoutEffect(()=>{
    render.current=mountPortraitTable(root.current,(index:number)=>select.current(index));
    return ()=>{render.current?.destroy();render.current=null};
  },[]);
  useLayoutEffect(()=>{render.current?.update(view)},[view]);
  const [index,setIndex] = useState<number|null>(null);
  const closeButton=useRef<HTMLButtonElement>(null);
  const invokingSeat=useRef<HTMLElement|null>(null);
  const previous=useRef({hero:false,hand:view.hand});
  const hero=view.seats[0]?.acting;
  const close=()=>{setIndex(null);invokingSeat.current?.focus({preventScroll:true})};
  useLayoutEffect(()=>{
    select.current=(i:number)=>{
      invokingSeat.current=root.current?.querySelectorAll<HTMLButtonElement>('.pt-seat')[i] ?? null;
      setIndex(i);
    };
    if(previous.current.hand!==view.hand || hero && !previous.current.hero) {
      if(index!==null) close();
    }
    previous.current={hero,hand:view.hand};
  });
  useLayoutEffect(()=>{if(index!==null) closeButton.current?.focus({preventScroll:true})},[index]);
  const seat=index===null ? null : view.seats[index];
  return <div className="pt-native"><div ref={root} className="pt-render" aria-label="牌桌"/>
    {seat && <section className="pt-scout" aria-label={seat.name+" 座位資料"} onKeyDown={e=>{if(e.key==='Escape')close()}}>
      <header><strong>{seat.name} · {seat.position}</strong><button ref={closeButton} onClick={close} aria-label="關閉座位資料">×</button></header>
      <p>{seat.stack} · {seat.action} · {seat.sample ? `樣本 ${seat.sample} 手` : "暫無觀察樣本"}</p>
      <div>{seat.metrics.map(m=><span key={m}>{m}</span>)}</div>
      <button onClick={()=>{setIndex(null);onSeat(index!)}}>完整資料</button>
    </section>}</div>;
}

export type Preset = 'open2'|'open25'|'open3'|'half'|'pot'|'x2'|'x3'|'allin';
type DockView = {
  decision:string;turn:boolean;canFold:boolean;canRaise:boolean;min:number;max:number;value:number;
  prompt:string;range:string;cost:string;foldLabel:string;callLabel:string;raiseLabel:string;hintOpen:boolean;
  presets:{id:Preset;label:string;target:number}[];preset:(id:Preset)=>void;select:(value:number)=>void;
  fold:()=>void;call:()=>void;raise:()=>void;hint:()=>void;
};
export function PortraitDock({view}:{view:DockView}) {
  const root=useRef<HTMLDivElement>(null);
  const dock=useRef<ReturnType<typeof mountBetDock>|null>(null);
  useLayoutEffect(()=>{
    dock.current=mountBetDock(root.current);
    return ()=>{dock.current?.destroy();dock.current=null};
  },[]);
  useLayoutEffect(()=>{dock.current?.update(view)},[view]);
  return <div ref={root} className="pt-betdock"/>;
}
