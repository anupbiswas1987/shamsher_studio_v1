import catalog from './generated/asset-catalog.js';
export const CHARACTERS=catalog.characters;
export const CHARACTER_ASSETS=CHARACTERS.flatMap(c=>c.assets);
export const PROP_ASSETS=catalog.props;
export const AUDIO_ASSETS=catalog.audio;
export const BACKGROUND_ASSETS=catalog.backgrounds;
export function resolveCharacterAsset(id){return CHARACTER_ASSETS.find(a=>a.id===id)||CHARACTER_ASSETS.find(a=>a.id===`shomshar/${id}`)||CHARACTER_ASSETS.find(a=>a.id.startsWith(`${id}/`))||CHARACTER_ASSETS.find(a=>a.id==='shomshar/explaining')||CHARACTER_ASSETS[0]||null}
export function characterFolder(id){const asset=resolveCharacterAsset(id);return CHARACTERS.find(c=>c.id===asset?.characterId)||null}
export function frameAt(asset,t,{fps=asset?.fps||.5,loop=true,start=0}={}){if(!asset)return null;const frames=asset.frames?.length?asset.frames:[asset.src];const index=Math.max(0,Math.floor((Math.max(0,t-start)+1e-9)*Math.max(1/30,fps)));return frames[loop?index%frames.length:Math.min(index,frames.length-1)]}

export function canonicalCharacterId(id){return CHARACTER_ASSETS.find(a=>a.id===id)?.id||CHARACTER_ASSETS.find(a=>a.id===`shomshar/${id}`)?.id||id}
