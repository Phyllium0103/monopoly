import {assetUrl} from './assetUrl';
export const MAP_RUNTIME_MODELS={
  "forge": [
    "art/map-runtime/forge-lod0-539ac5041bdd.glb",
    "art/map-runtime/forge-lod1-1735521ee72b.glb",
    "art/map-runtime/forge-lod2-e81bdcfec834.glb"
  ],
  "herb": [
    "art/map-runtime/herb-lod0-06b4884a1939.glb",
    "art/map-runtime/herb-lod1-f5bebe913d06.glb",
    "art/map-runtime/herb-lod2-54d9bc5fdd20.glb"
  ],
  "treasure": [
    "art/map-runtime/treasure-lod0-a91381cc7a7f.glb",
    "art/map-runtime/treasure-lod1-6e383590d2b8.glb",
    "art/map-runtime/treasure-lod2-bdf2f7e13479.glb"
  ],
  "library": [
    "art/map-runtime/library-lod0-dccf10f52a76.glb",
    "art/map-runtime/library-lod1-9fe698dc5bd5.glb",
    "art/map-runtime/library-lod2-2e0d911067cd.glb"
  ],
  "beast": [
    "art/map-runtime/beast-lod0-d5f9b5381a1f.glb",
    "art/map-runtime/beast-lod1-6748ac096386.glb",
    "art/map-runtime/beast-lod2-0a0a7afd479a.glb"
  ],
  "tavern": [
    "art/map-runtime/tavern-lod0-76b92ade914b.glb",
    "art/map-runtime/tavern-lod1-f7ec1d8ef926.glb",
    "art/map-runtime/tavern-lod2-0a67592d9ba0.glb"
  ],
  "casino": [
    "art/map-runtime/casino-lod0-633b916e3e61.glb",
    "art/map-runtime/casino-lod1-9a6844e18239.glb",
    "art/map-runtime/casino-lod2-f94bcfb65788.glb"
  ],
  "city-1": [
    "art/map-runtime/city-1-lod0-cae94c6fa5f8.glb",
    "art/map-runtime/city-1-lod1-dfe6d79f80b1.glb",
    "art/map-runtime/city-1-lod2-d54721216af7.glb"
  ],
  "city-2": [
    "art/map-runtime/city-2-lod0-af21565548e4.glb",
    "art/map-runtime/city-2-lod1-fde47378166c.glb",
    "art/map-runtime/city-2-lod2-3b11f41e0cbc.glb"
  ],
  "city-3": [
    "art/map-runtime/city-3-lod0-c72f7b04a55e.glb",
    "art/map-runtime/city-3-lod1-ad2d7104b5be.glb",
    "art/map-runtime/city-3-lod2-844e6585e2bf.glb"
  ],
  "city-4": [
    "art/map-runtime/city-4-lod0-1402e98bf38b.glb",
    "art/map-runtime/city-4-lod1-ac9aa3760c98.glb",
    "art/map-runtime/city-4-lod2-f756b889e8b4.glb"
  ],
  "city-5": [
    "art/map-runtime/city-5-lod0-9807de102ece.glb",
    "art/map-runtime/city-5-lod1-2187036d1221.glb",
    "art/map-runtime/city-5-lod2-a1c2bc901410.glb"
  ],
  "city-6": [
    "art/map-runtime/city-6-lod0-e28fa2d94aa7.glb",
    "art/map-runtime/city-6-lod1-6e775ed95030.glb",
    "art/map-runtime/city-6-lod2-929a5c7592b8.glb"
  ],
  "relic": [
    "art/map-runtime/relic-lod0-8f4afb6c1209.glb",
    "art/map-runtime/relic-lod1-e5ec306d9976.glb",
    "art/map-runtime/relic-lod2-638f878391b0.glb"
  ],
  "vein": [
    "art/map-runtime/vein-lod0-e2ed4d91af44.glb",
    "art/map-runtime/vein-lod1-508898f9a113.glb",
    "art/map-runtime/vein-lod2-937e88cdd9a1.glb"
  ],
  "secret": [
    "art/map-runtime/secret-lod0-eb56b1ee5b4c.glb",
    "art/map-runtime/secret-lod1-adb4192e0fda.glb",
    "art/map-runtime/secret-lod2-44c38e5ca1bf.glb"
  ],
  "martial": [
    "art/map-runtime/martial-lod0-a469fd8102fb.glb",
    "art/map-runtime/martial-lod1-955e3ff35b67.glb",
    "art/map-runtime/martial-lod2-bcf5d50755c1.glb"
  ],
  "arts": [
    "art/map-runtime/arts-lod0-67c7fbc322b8.glb",
    "art/map-runtime/arts-lod1-4711026abbba.glb",
    "art/map-runtime/arts-lod2-f72fd92178b3.glb"
  ],
  "appraisal": [
    "art/map-runtime/appraisal-lod0-371764de41f5.glb",
    "art/map-runtime/appraisal-lod1-1ee1de8334c6.glb",
    "art/map-runtime/appraisal-lod2-e2ad549a6f64.glb"
  ],
  "ghost": [
    "art/map-runtime/ghost-lod0-422f6179dac8.glb",
    "art/map-runtime/ghost-lod1-f119943c37d9.glb",
    "art/map-runtime/ghost-lod2-d3cba477b18a.glb"
  ]
} as const;
export const runtimeModelUrl=(key:keyof typeof MAP_RUNTIME_MODELS,lod:number)=>assetUrl(MAP_RUNTIME_MODELS[key][lod]);
