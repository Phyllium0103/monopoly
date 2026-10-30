import {assetUrl} from './assetUrl';
export const LORD_HUD_RUNTIME_BASE='art/lord-hud-runtime-cba9c5772eee';
export const LORD_HUD_TEXTURE_WIDTH=768;
export const LORD_HUD_TEXTURE_HEIGHT=384;
export const lordHudAssetUrl=(id:string,file:string)=>assetUrl(`${LORD_HUD_RUNTIME_BASE}/${id}/${file}`);
