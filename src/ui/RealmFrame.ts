import { REALM_FRAME_ATLAS, REALM_FRAME_ATLAS_SIZE, REALM_FRAME_STYLE, realmFrameFor } from '../data/realmFrames';

/** 只在畫面取用透明圖集視窗；不重繪或改動使用者選定的外框圖檔。 */
export function realmFrameHtml(realm: number): string {
  const frame = realmFrameFor(realm);
  const src = `${import.meta.env?.BASE_URL ?? './'}${REALM_FRAME_ATLAS}`;
  const [width, height] = REALM_FRAME_ATLAS_SIZE;
  return `<svg class="realm-frame" data-frame-style="${REALM_FRAME_STYLE}" data-frame-realm="${frame.index}" data-frame-name="${frame.name}" viewBox="${frame.window.join(' ')}" preserveAspectRatio="none" aria-hidden="true" focusable="false"><image href="${src}" width="${width}" height="${height}"></image></svg>`;
}

