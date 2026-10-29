import {defineConfig} from 'vite';
import {generateAssetCatalog} from './scripts/asset-catalog.mjs';
import {resolve,sep} from 'node:path';
export default defineConfig({plugins:[{
 name:'studio-asset-catalog',
 async buildStart(){await generateAssetCatalog()},
 configureServer(server){let timer;const roots=['character','props','audio','background'].map(folder=>resolve('public',folder)+sep);const refresh=file=>{if(!roots.some(root=>file.startsWith(root)))return;clearTimeout(timer);timer=setTimeout(async()=>{try{await generateAssetCatalog();server.ws.send({type:'full-reload'})}catch(error){server.config.logger.error(error.message)}},150)};server.watcher.on('add',refresh).on('unlink',refresh).on('change',refresh);server.httpServer?.once('close',()=>{clearTimeout(timer);server.watcher.off('add',refresh).off('unlink',refresh).off('change',refresh)})}
}]});
