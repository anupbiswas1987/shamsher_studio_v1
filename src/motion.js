import {characterFolder,resolveCharacterAsset} from './assets.js';
export const MOVEMENTS=[{id:'none',name:'Still',description:'Keep the original pose still.'},{id:'idle',name:'Breathe & sway',description:'A slow breath and gentle whole-body sway.'},{id:'talking',name:'Speaking emphasis',description:'Small body beats during dialogue clips; no facial animation.'},{id:'cheerful',name:'Happy bounce',description:'A light bounce and playful tilt.'},{id:'walking',name:'Walking bounce',description:'A walking-style body bounce; legs remain part of the image.'}];
export const defaultMotion=()=>({preset:'none',speed:1,amount:1});
export function motionAt(scene,t){const m={...defaultMotion(),...scene.motion},q=Math.max(0,t)*m.speed,a=m.amount;let x=0,y=0,r=0,sx=1,sy=1;
 switch(m.preset){
 case 'idle':x=Math.sin(q*1.4)*1.7*a;r=Math.sin(q*1.4)*.6*a;sy=1+Math.sin(q*2)*.006*a;break;
 case 'talking':{const active=(scene.audio||[]).some(c=>!c.muted&&(c.volume??1)>0&&t>=c.start&&t<c.start+c.duration-(c.trim||0));const strength=active?1:.18;x=Math.sin(q*2.1)*2*a*strength;y=-(Math.sin(q*5)**2)*3*a*strength;r=Math.sin(q*3.1)*1.3*a*strength;sy=1+Math.sin(q*3)*.004*a;break;}
 case 'cheerful':y=-(Math.sin(q*3.5)**2)*8*a;r=Math.sin(q*3.5)*1.5*a;sx=1+Math.sin(q*7)*.006*a;sy=1-Math.sin(q*7)*.008*a;break;
 case 'walking':x=Math.sin(q*5)*3*a;y=-(Math.sin(q*5)**2)*5*a;r=Math.sin(q*5)*1.5*a;break;
 }return {x,y,r,sx,sy};
}
export function sequenceAt(scene,t){const valid=(scene.poseSequence||[]).filter(k=>Number.isFinite(k.t)&&k.t>=0&&k.t<scene.duration&&typeof k.character==='string').sort((a,b)=>a.t-b.t);let current=scene.character||'explaining',previous=current,at=-Infinity;for(const k of valid){if(k.t>t)break;previous=current;current=k.character;at=k.t}const fade=Math.max(0,Math.min(.5,scene.poseTransition??.18));return {current,previous,blend:previous===current||at===0||fade===0?1:Math.min(1,Math.max(0,(t-at)/fade))}}
export function generateSequence(scene){const selected=resolveCharacterAsset(scene.character),folder=characterFolder(scene.character);if(!selected)return [];if(selected.frames.length>1)return [{t:0,character:selected.id}];const assets=folder?.assets||[selected],start=Math.max(0,assets.findIndex(a=>a.id===selected.id));return Array.from({length:Math.min(4,assets.length)},(_,i)=>({t:Math.round(scene.duration*i/Math.min(4,assets.length)*100)/100,character:assets[(start+i)%assets.length].id}))}
