import { SELECTED_LAYOUT } from './selectedLayout';
import { gridPosition } from './selectedBoard';

/** 展示用建築：各區各一棟。與遊戲事件格分開，經過或點擊不觸發服務。 */
export const DISPLAY_FACILITIES = [
  {
    "id": "display-appraisal-northwest",
    "type": "appraisal",
    "name": "萬寶鑑定所",
    "at": [
      18,
      13
    ],
    "side": "above",
    "region": "northwest",
    "displayOnly": true
  },
  {
    "id": "display-arts-northwest",
    "type": "arts",
    "name": "四藝道院",
    "at": [
      6,
      13
    ],
    "side": "right",
    "region": "northwest",
    "displayOnly": true
  },
  {
    "id": "display-ghost-northwest",
    "type": "ghost",
    "name": "鬼市",
    "at": [
      11,
      7
    ],
    "side": "above",
    "region": "northwest",
    "displayOnly": true
  },
  {
    "id": "display-martial-northwest",
    "type": "martial",
    "name": "淬體武院",
    "at": [
      21,
      7
    ],
    "side": "above",
    "region": "northwest",
    "displayOnly": true
  },
  {
    "id": "display-appraisal-southwest",
    "type": "appraisal",
    "name": "萬寶鑑定所",
    "at": [
      37,
      40
    ],
    "side": "above",
    "region": "southwest",
    "displayOnly": true
  },
  {
    "id": "display-arts-southwest",
    "type": "arts",
    "name": "四藝道院",
    "at": [
      35,
      30
    ],
    "side": "above",
    "region": "southwest",
    "displayOnly": true
  },
  {
    "id": "display-ghost-southwest",
    "type": "ghost",
    "name": "鬼市",
    "at": [
      40,
      26
    ],
    "side": "above",
    "region": "southwest",
    "displayOnly": true
  },
  {
    "id": "display-martial-southwest",
    "type": "martial",
    "name": "淬體武院",
    "at": [
      28,
      35
    ],
    "side": "above",
    "region": "southwest",
    "displayOnly": true
  },
  {
    "id": "display-appraisal-northeast",
    "type": "appraisal",
    "name": "萬寶鑑定所",
    "at": [
      53,
      7
    ],
    "side": "above",
    "region": "northeast",
    "displayOnly": true
  },
  {
    "id": "display-arts-northeast",
    "type": "arts",
    "name": "四藝道院",
    "at": [
      58,
      15
    ],
    "side": "right",
    "region": "northeast",
    "displayOnly": true
  },
  {
    "id": "display-ghost-northeast",
    "type": "ghost",
    "name": "鬼市",
    "at": [
      48,
      21
    ],
    "side": "right",
    "region": "northeast",
    "displayOnly": true
  },
  {
    "id": "display-martial-northeast",
    "type": "martial",
    "name": "淬體武院",
    "at": [
      45,
      7
    ],
    "side": "above",
    "region": "northeast",
    "displayOnly": true
  },
  {
    "id": "display-appraisal-southeast",
    "type": "appraisal",
    "name": "萬寶鑑定所",
    "at": [
      55,
      28
    ],
    "side": "above",
    "region": "southeast",
    "displayOnly": true
  },
  {
    "id": "display-arts-southeast",
    "type": "arts",
    "name": "四藝道院",
    "at": [
      59,
      23
    ],
    "side": "above",
    "region": "southeast",
    "displayOnly": true
  },
  {
    "id": "display-ghost-southeast",
    "type": "ghost",
    "name": "鬼市",
    "at": [
      48,
      32
    ],
    "side": "right",
    "region": "southeast",
    "displayOnly": true
  },
  {
    "id": "display-martial-southeast",
    "type": "martial",
    "name": "淬體武院",
    "at": [
      51,
      26
    ],
    "side": "right",
    "region": "southeast",
    "displayOnly": true
  }
] as const;

const roadIds = new Map(SELECTED_LAYOUT.roads.map(([x,y],i) => [`${x},${y}`,i]));
export const DISPLAY_FACILITY_LOTS = DISPLAY_FACILITIES.map(o => {
  const [x,y] = o.at;
  const frontage = o.side === 'above' ? [[x,y+2],[x+1,y+2]] : [[x-1,y],[x-1,y+1]];
  const frontageTiles = frontage.map(([a,b]) => {
    const index = roadIds.get(`${a},${b}`);
    if (index === undefined) throw new Error(`展示建築入口缺少道路：${o.name}`);
    return index;
  });
  return {...o, frontageTiles, pos:gridPosition(x+.5,y+.5), rotation:o.side==='above'?0:-Math.PI/2};
});
