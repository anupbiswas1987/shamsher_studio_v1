export function resetScreenTiming(screens){
 if(screens.length*3>30)throw Error('Three seconds per screen exceeds the 30-second reel limit. Use 10 or fewer screens to reset timing.');
 return screens.map((screen,index)=>({...screen,start:index*3,end:(index+1)*3}));
}
