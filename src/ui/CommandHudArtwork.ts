import { cleanCommandHudMatte } from './commandHudMatte';
/** One complete bitmap and one draw call; UVs preserve the fixed dice area on resize. */
export class CommandHudArtwork {
  readonly element=document.createElement('canvas');
  private gl:WebGLRenderingContext|null=null;
  private fallback:CanvasRenderingContext2D|null=null;
  private program:WebGLProgram|null=null;
  private buffer:WebGLBuffer|null=null;
  private texture:WebGLTexture|null=null;
  private image:HTMLImageElement|null=null;
  private cleanArt:HTMLCanvasElement|null=null;
  private layout={width:1,height:1,left:1,right:1};
  private key='';
  constructor(parent:HTMLElement){
    this.element.className='command-surface';this.element.setAttribute('aria-hidden','true');parent.append(this.element);
    if(typeof this.element.getContext==='function'){
      try{this.gl=this.element.getContext('webgl',{alpha:true,premultipliedAlpha:false,preserveDrawingBuffer:true,antialias:false,depth:false});}catch{}
      if(this.gl)this.initialize();
      else this.fallback=this.element.getContext('2d');
    }
    this.element.addEventListener('webglcontextlost',event=>event.preventDefault());
    this.element.addEventListener('webglcontextrestored',()=>{this.initialize();this.upload();this.draw();});
    if(typeof Image!=='undefined'){
      this.image=new Image();
      this.image.onload=()=>{
        this.element.dataset.nativeWidth=String(this.image!.naturalWidth);
        this.element.dataset.nativeHeight=String(this.image!.naturalHeight);
        this.cleanArt=document.createElement('canvas');
        this.cleanArt.width=this.image!.naturalWidth;this.cleanArt.height=this.image!.naturalHeight;
        const ctx=this.cleanArt.getContext('2d')!;ctx.drawImage(this.image!,0,0);
        const pixels=ctx.getImageData(0,0,this.cleanArt.width,this.cleanArt.height);
        cleanCommandHudMatte(pixels.data,this.cleanArt.width,this.cleanArt.height);ctx.putImageData(pixels,0,0);
        this.element.dataset.edgeCleanup='contour-matte';
        this.element.dataset.ready='true';this.upload();this.draw();
      };
      this.image.onerror=()=>{this.element.dataset.ready='error';};
      this.image.src=new URL('./command-desk.webp',import.meta.url).href;
    }
  }
  resize(width:number,height:number,left:number,right:number,pixelScale:number){
    const key=[width,height,left,right,pixelScale].join(':');if(key===this.key)return;
    this.key=key;this.layout={width,height,left,right};
    const w=Math.max(1,Math.round(width*pixelScale)),h=Math.max(1,Math.round(height*pixelScale));
    if(this.element.width!==w)this.element.width=w;if(this.element.height!==h)this.element.height=h;
    this.draw();
  }
  private initialize(){
    const gl=this.gl;if(!gl)return;
    const shader=(type:number,source:string)=>{
      const s=gl.createShader(type)!;gl.shaderSource(s,source);gl.compileShader(s);
      if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error('HUD artwork shader failed');
      return s;
    };
    const vs=shader(gl.VERTEX_SHADER,'attribute vec2 p;attribute vec2 uv;varying vec2 v;void main(){v=uv;gl_Position=vec4(p,0.,1.);}');
    const fs=shader(gl.FRAGMENT_SHADER,'precision highp float;varying vec2 v;uniform sampler2D art;void main(){gl_FragColor=texture2D(art,v);}');
    this.program=gl.createProgram()!;gl.attachShader(this.program,vs);gl.attachShader(this.program,fs);gl.linkProgram(this.program);
    gl.deleteShader(vs);gl.deleteShader(fs);
    if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw new Error('HUD artwork program failed');
    this.buffer=gl.createBuffer();this.texture=gl.createTexture();
    this.element.dataset.renderMode='single-texture';
  }
  private upload(){
    const gl=this.gl,image=this.image;if(!gl||!image?.complete||!this.texture)return;
    gl.bindTexture(gl.TEXTURE_2D,this.texture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,this.cleanArt??image);
  }
  private draw(){
    const image=this.image;if(!image?.complete||!image.naturalWidth)return;
    const gl=this.gl,{width,left,right}=this.layout;
    if(gl&&this.program&&this.buffer&&this.texture){
      gl.viewport(0,0,this.element.width,this.element.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
      gl.disable(gl.BLEND);gl.useProgram(this.program);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
      const xs=[0,left,width-right,width],us=[0,829/1915,1684/1915,1],vertices:number[]=[];
      for(let i=0;i<4;i++){const x=xs[i]/width*2-1;vertices.push(x,-1,us[i],1,x,1,us[i],0);}
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.DYNAMIC_DRAW);
      const p=gl.getAttribLocation(this.program,'p'),uv=gl.getAttribLocation(this.program,'uv');
      gl.enableVertexAttribArray(p);gl.vertexAttribPointer(p,2,gl.FLOAT,false,16,0);
      gl.enableVertexAttribArray(uv);gl.vertexAttribPointer(uv,2,gl.FLOAT,false,16,8);
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.uniform1i(gl.getUniformLocation(this.program,'art'),0);
      gl.drawArrays(gl.TRIANGLE_STRIP,0,8);
    }else if(this.fallback){
      this.fallback.clearRect(0,0,this.element.width,this.element.height);
      this.fallback.imageSmoothingEnabled=true;this.fallback.imageSmoothingQuality='high';
      this.fallback.drawImage(this.cleanArt??image,0,0,this.element.width,this.element.height);
    }
  }
}
