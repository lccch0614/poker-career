// This renderer receives presentation data only. It never reads game state or storage.
function element(tag, className, parent) {
  const node = document.createElement(tag);
  node.className = className;
  parent.append(node);
  return node;
}
function write(node, value) {
  if (node.textContent !== value) node.textContent = value;
}
function cardGroup(parent, count) {
  return Array.from({length: count}, () => {
    const node = element('span', 'pt-card', parent);
    const corner = element('b', '', node);
    const suit = element('i', '', node);
    const foot = element('small', '', node);
    return (card = '') => {
      if (node.dataset.card === card) return;
      node.dataset.card = card;
      const rank = card.slice(0,-1), symbol = card.slice(-1);
      node.classList.toggle('red', symbol === '♥' || symbol === '♦');
      write(corner, rank); write(suit, symbol); write(foot, rank);
      node.setAttribute('aria-label', card || '未發牌');
    };
  });
}
function createSeat(parent,onSelect,index) {
  const seat = element('button','pt-seat',parent);
  seat.type = 'button';
  seat.onclick = () => onSelect(index);
  const portrait = element('span','pt-avatar',seat);
  const badge = element('span','pt-position',seat);
  const name = element('strong','pt-name',seat);
  const stack = element('b','pt-stack',seat);
  const wager = element('span','pt-wager',seat);
  const action = element('small','pt-action',seat);
  const hud = element('small','pt-stats',seat);
  const pocket = element('span','pt-pocket',seat);
  const cards = cardGroup(pocket,2);
  return data => {
    seat.dataset.slot = data.slot;
    seat.classList.toggle('folded',data.folded);
    seat.classList.toggle('acting',data.acting);
    seat.classList.toggle('has-cards',data.cards.length > 0);
    write(portrait,data.initial);write(badge,data.position);write(name,data.name);
    write(wager,data.bet);write(stack,data.stack);write(action,data.action);write(hud,data.stats);
    seat.title = [data.name,data.position,data.stack,data.action,data.stats].filter(Boolean).join(' · ');
    cards.forEach((update,i)=>update(data.cards[i]));
  };
}
export function mountPortraitTable(root,onSelect) {
  const surface = element('div','pt-surface',root);
  const centre = element('div','pt-centre',surface);
  const pot = element('div','pt-pot',centre);
  element('i','pt-chips',pot).setAttribute('aria-hidden','true');
  write(element('small','',pot),'底池');
  const amount = element('strong','',pot);
  const details = element('details','pt-pots',centre);
  write(element('summary','',details),'底池明細');
  const lines = element('div','',details);
  const board = cardGroup(element('div','pt-board',centre),5);
  const message = element('div','pt-message',centre);
  const hint = element('div','pt-strength',surface);
  const seats = [];
  return {
    update(view) {
      details.hidden = view.pots.length<2;
      if(details.hidden) details.open=false;
      write(lines,view.pots.join('\n'));
      write(amount,view.pot);write(message,view.message);write(hint,view.hint);
      board.forEach((update,i)=>update(view.board[i]));
      if(seats.length!==view.seats.length){
        surface.querySelectorAll('.pt-seat').forEach(node=>node.remove());
        seats.length=0;
        view.seats.forEach((_,i)=>seats.push(createSeat(surface,onSelect,i)));
      }
      view.seats.forEach((data,i)=>seats[i](data));
    },
    destroy(){surface.remove()}
  };
}

// Input nodes stay mounted across AI ticks so a drag or typed amount keeps focus.
export function mountBetDock(root) {
  root.innerHTML = `<div class="raise-presets" aria-label="快捷下注尺度"></div>
    <div class="raise-input-row"><button type="button" aria-label="減少注碼">−</button>
    <input aria-label="加注額滑桿" type="range" step="0.5">
    <button type="button" aria-label="增加注碼">＋</button>
    <label>至 <input type="number" aria-label="輸入下注總額" inputmode="decimal" step="0.5"></label></div>
    <small class="raise-cost"></small>
    <div class="pt-choices"><button class="action secondary danger"></button><button class="action secondary call-action"></button><button class="action primary"></button></div>
    <button class="action hint-action">✦ AI 提示</button>`;
  const presets = root.querySelector('.raise-presets');
  const slider = root.querySelector('input[type=range]');
  const amount = root.querySelector('input[type=number]');
  const [minus,plus] = root.querySelectorAll('.raise-input-row button');
  const [fold,call,raise,hint] = root.querySelectorAll('.action');
  let view;
  slider.oninput = () => view.select(Number(slider.value));
  amount.onblur = () => {
    if(amount.value.trim() && Number.isFinite(amount.valueAsNumber)) view.select(amount.valueAsNumber);
    amount.value = String(view.value);
  };
  amount.onkeydown = e => {if(e.key==='Enter') amount.blur()};
  minus.onclick = () => view.select(view.value-.5);
  plus.onclick = () => view.select(view.value+.5);
  let submitted = '';
  function submit(action) {
    const decision = view.decision;
    if (submitted === decision) return;
    if (action() !== false) submitted = decision;
  }
  fold.onclick = () => submit(view.fold);
  call.onclick = () => submit(view.call);
  raise.onclick = () => submit(view.raise);
  hint.onclick = () => view.hint();
  return {
    update(next) {
      view=next;
      const key=next.presets.map(item=>item.id).join('/');
      if(presets.dataset.key!==key){
        presets.dataset.key=key;
        presets.replaceChildren();
        for(const item of next.presets){
          const button=element('button',item.id==='allin'?'preset-allin':'',presets);
          write(button,item.label);
          button.onclick=()=>view.preset(item.id);
        }
      }
      for(const button of presets.children) button.disabled=!next.canRaise;
      for(const input of [slider,amount]){
        input.min=String(next.min);input.max=String(next.max);input.disabled=!next.canRaise;
        if(input!==amount || document.activeElement!==amount) input.value=String(next.value);
      }
      minus.disabled=!next.canRaise || next.value<=next.min;
      plus.disabled=!next.canRaise || next.value>=next.max;
      fold.disabled=!next.canFold;call.disabled=hint.disabled=!next.turn;raise.disabled=!next.canRaise;
      write(fold,next.foldLabel);write(call,next.callLabel);write(raise,next.raiseLabel);
      write(root.querySelector('.raise-cost'),next.cost);
      hint.setAttribute('aria-pressed',String(next.hintOpen));
    },
    destroy(){root.replaceChildren()}
  };
}
