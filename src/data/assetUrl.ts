/** Public assets must respect GitHub Pages /repository/ prefixes. */
export function assetUrl(path:string,base=import.meta.env?.BASE_URL??'./'){
  return `${base.endsWith('/')?base:base+'/'}${path.replace(/^\/+/, '')}`;
}
