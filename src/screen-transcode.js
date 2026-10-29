import {FFmpeg} from '@ffmpeg/ffmpeg';
import coreURL from '@ffmpeg/core?url';
import wasmURL from '@ffmpeg/core/wasm?url';
export async function convertScreenMp4(blob,onProgress=()=>{}){
 const ffmpeg=new FFmpeg();
 try{
  onProgress('Preparing MP4 converter…');
  await ffmpeg.load({coreURL,wasmURL});
  await ffmpeg.writeFile('input',new Uint8Array(await blob.arrayBuffer()));
  ffmpeg.on('progress',({progress})=>onProgress(`Encoding MP4… ${Math.min(99,Math.max(0,Math.round(progress*100)))}%`));
  const code=await ffmpeg.exec(['-i','input','-map','0:v:0','-map','0:a:0','-vf','scale=1080:1920,setsar=1','-r','30','-c:v','libx264','-preset','ultrafast','-crf','20','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-ar','48000','-movflags','+faststart','output.mp4']);
  if(code!==0)throw Error('MP4 conversion failed. Please try exporting again.');
  const data=await ffmpeg.readFile('output.mp4');
  return new Blob([data],{type:'video/mp4'});
 }finally{ffmpeg.terminate()}
}
