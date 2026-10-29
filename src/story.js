import {makeScene,normalizeScene} from './engine.js';
export const STORY_TITLE='জীবনের সফলতা';
export function createSuccessStory(){
 const beats=[
  ['শুরু','', 'জীবনের সফলতা\nশমশেরের ছোট্ট পরামর্শ',2.5,'books','idle'],
  ['বন্ধুর প্রশ্ন','বন্ধু','শমশের ভাই, জীবনে সফল\nহতে হলে কী করতে হবে?',5.5,'question','idle'],
  ['লক্ষ্য ঠিক করুন','শমশের','প্রথমে একটা লক্ষ্য\nঠিক করবেন!',3.5,'teacher','talking'],
  ['তারপর?','বন্ধু','তারপর?',2,'thinking','idle'],
  ['শমশেরের বুদ্ধি','শমশের','তারপর লক্ষ্যটা এমন\nজায়গায় রাখবেন,',4.5,'explaining','idle'],
  ['ব্যর্থ হলেও…','শমশের','যেন ব্যর্থ হলেও\nবলতে পারেন—',4,'thinking','idle'],
  ['পাঞ্চলাইন','শমশের','লক্ষ্যটা অনেক\nউঁচুতে ছিল!',5,'teacher','cheerful'],
  ['শেষ হাসি','','লক্ষ্য উঁচু হোক,\nহাসিটাও থাকুক!',2.5,'laughing','cheerful'],
 ];
 return {version:2,title:STORY_TITLE,description:'Original Shomshar artwork, Bengali dialogue captions, movement and sound effects. No recorded narration.',scenes:beats.map(([name,speaker,caption,duration,character,preset],i)=>normalizeScene({...makeScene(i+1),name,storyTitle:STORY_TITLE,speaker,caption,duration,captionStart:0,captionEnd:duration,character,bg:i===6?'#f6dfab':'#f3e6cc',motion:{preset,speed:i===6?.65:.8,amount:i===6?.7:.8},background:{src:'',name:'Warm paper',visible:true,fit:'cover',x:0,y:0,scale:1,opacity:1,grid:false},poseSequence:i===6?[{t:0,character:'teacher'},{t:3.5,character:'laughing'}]:[],keys:{Character:[{t:0,x:0,y:3,r:0},{t:Math.min(.6,duration),x:0,y:0,r:0},{t:duration,x:i===6?6:0,y:0,r:i===6?-2:0}]},sfx:i===0?[{id:'intro-chime',name:'Chime',start:.3}]:i===6?[{id:'punchline-pop',name:'Pop',start:.2},{id:'punchline-chime',name:'Chime',start:2}]:[]}))};
}
