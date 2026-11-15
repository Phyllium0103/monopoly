/** Public assets must respect GitHub Pages /repository/ prefixes. */
export function assetUrl(path:string,base=import.meta.env?.BASE_URL??'./'){
  return `${base.endsWith('/')?base:base+'/'}${path.replace(/^\/+/, '')}`;
}

/** CSS variables are resolved against the stylesheet URL, so use a document-absolute URL. */
export function assetCssUrl(path:string){
  return new URL(assetUrl(path), document.baseURI).href;
}
