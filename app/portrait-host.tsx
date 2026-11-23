import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { mountBetDock, mountPortraitTable } from './portrait-table.js';

export function usePortraitTable() {
  const query = '(max-width: 700px) and (orientation: portrait)';
  const [portrait,setPortrait] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  const [panel,setPanel] = useState('');
  const [hud,setHud] = useState(true);
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
export function PortraitHeader({ui,title,meta}:{ui:ReturnType<typeof usePortraitTable>,title:string,meta:string}) {
  const settings = useRef<HTMLButtonElement>(null);
  const hadPanel = useRef(false);
  useLayoutEffect(()=>{
    if(hadPanel.current && !ui.panel) settings.current?.focus({preventScroll:true});
    hadPanel.current=!!ui.panel;
  },[ui.panel]);
  return <header className="pt-header"><div><small>POKER CAREER</small><h1>{title}</h1></div>
    {ui.panel ? <button className="pt-back" onClick={()=>ui.setPanel('')}>返回牌桌</button> : <button ref={settings} onClick={()=>ui.setPanel('settings')}>牌桌設定</button>}
    <div className="pt-meta"><span>{meta}</span><button aria-pressed={ui.hud} onClick={()=>ui.setHud(!ui.hud)}>HUD {ui.hud?'ON':'OFF'}</button></div></header>;
}
type SeatView = {bet:string;slot:number;name:string;initial:string;position:string;stack:string;action:string;stats:string;cards:string[];folded:boolean;acting:boolean};
type View = {pots:string[];pot:string;board:string[];message:string;hint:string;seats:SeatView[]};
export function PortraitFelt({view,onSeat}:{view:View;onSeat:(index:number)=>void}) {
  const root=useRef<HTMLDivElement>(null);
  const render=useRef<ReturnType<typeof mountPortraitTable>|null>(null);
  const select=useRef(onSeat);
  useLayoutEffect(()=>{select.current=onSeat});
  useLayoutEffect(()=>{
    render.current=mountPortraitTable(root.current,(index:number)=>select.current(index));
    return ()=>{render.current?.destroy();render.current=null};
  },[]);
  useLayoutEffect(()=>{render.current?.update(view)},[view]);
  return <div className="pt-native" ref={root} aria-label="牌桌"/>;
}

export type Preset = 'open2'|'open25'|'open3'|'half'|'pot'|'x2'|'x3'|'allin';
type DockView = {
  decision:string;turn:boolean;canFold:boolean;canRaise:boolean;min:number;max:number;value:number;
  cost:string;foldLabel:string;callLabel:string;raiseLabel:string;hintOpen:boolean;
  presets:{id:Preset;label:string}[];preset:(id:Preset)=>void;select:(value:number)=>void;
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
