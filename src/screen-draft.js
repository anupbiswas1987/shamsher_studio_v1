const DATABASE = "shomshar-screen-drafts";
function open() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function transaction(mode, action) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("drafts", mode);
      const request = action(tx.objectStore("drafts"));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || Error("Draft transaction aborted"));
    });
  } finally {
    db.close();
  }
}
export async function loadScreenDraft(){
 const draft=await transaction("readonly",store=>store.get("current"));
 if(!draft||!(draft.version>=3))return draft;
 // Preserve the complete newer draft before the restored editor saves v2.
 await transaction("readwrite",store=>store.put(draft,"multitrack-backup"));
 const legacyStyle=style=>({Cut:"None",Crossfade:"Fade","Fade to black":"Fade","Zoom in":"Zoom","Zoom out":"Zoom"}[style]||style);
 const audio=draft.audio||draft.audioClips?.[0]||null;
 return {...draft,version:2,screens:draft.screens.map((clip,index)=>({...clip,id:index+1,entry:legacyStyle(clip.entry),exit:legacyStyle(clip.exit)})),audio,audioStart:draft.audioStart??audio?.start??0,volume:audio?.muted?0:Math.max(0,Math.min(1,draft.volume??audio?.volume??1))};
}
export const saveScreenDraft = (draft) =>
  transaction("readwrite", (store) =>
    store.put({ ...draft, savedAt: Date.now() }, "current"),
  );
export const clearScreenDraft = () =>
  transaction("readwrite", (store) => store.delete("current"));
export function draftSnapshot({
  screens,
  audio,
  audioStart,
  volume,
  format,
  reducedMotion,
}) {
  return {
    version: 2,
    screens: screens.map(({ src, ...screen }) => screen),
    audio: audio ? (({ src, ...clip }) => clip)(audio) : null,
    audioStart,
    volume,
    format,
    reducedMotion,
  };
}
