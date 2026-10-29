import { LordActorHud } from '../ui/LordActorHud';
import { DiceRoller } from '../ui/DiceRoller';
import { createGameState } from '../game/GameState';
const root=document.querySelector<HTMLElement>('#demo')!,button=document.querySelector<HTMLButtonElement>('#roll')!,status=document.querySelector('#status')!;
const actor=new LordActorHud(root,()=>1,()=>{}),dice=new DiceRoller(root,{centerFinal:true,gentle:true});
const state=createGameState('liu');actor.show(true);actor.update(state,'liu');button.disabled=true;
const ready=setInterval(()=>{if(root.querySelector('.lord-actor[data-lord="liu"]')?.getAttribute('data-pose')==='ready'){button.disabled=false;status.textContent='已準備；點擊預覽。';clearInterval(ready);}},100);
button.onclick=async()=>{button.disabled=true;status.textContent='骰子離手，立即接中央上方落骰';try{await actor.playRoll('liu',origin=>dice.roll([4],0,1,1,false,origin));status.textContent='骰子已消失；示意移動中……';await new Promise(r=>setTimeout(r,1500));await actor.movementDone('liu');status.textContent='示意移動完成，回到打坐。';actor.focus('liu');}finally{button.disabled=false;}};
