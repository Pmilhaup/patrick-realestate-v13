/* silk-bg.js — v14 "After Dark" canvas: domain-warped navy silk with thin gold
   filaments. Drop-in for liquid-bg.js: reuses <canvas id="paint">, reads
   body[data-liquid-palette] (0..1 → filament strength), exposes
   window.__paintUniforms = { uScroll:{value}, uPaletteMix:{value} } so the
   chapter orchestrator keeps driving it. Honors prefers-reduced-motion. */
(function () {
  var canvas = document.getElementById('paint');
  if (!canvas) { canvas = document.createElement('canvas'); canvas.id = 'paint';
    canvas.style.cssText = 'position:fixed;inset:0;z-index:0;pointer-events:none;'; document.body.prepend(canvas); }
  canvas.style.width = '100%'; canvas.style.height = '100%';
  var gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
  if (!gl) return;
  var pal = parseFloat(document.body.getAttribute('data-liquid-palette') || '0.38'); if (isNaN(pal)) pal = 0.38;
  var uniforms = { uScroll: { value: 0 }, uPaletteMix: { value: pal } };
  window.__paintUniforms = uniforms;
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var vs = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  var fs = 'precision highp float;uniform vec2 R;uniform float T;uniform vec2 M;uniform float S;uniform float P;' +
    'float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}' +
    'float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}' +
    'float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*n(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}' +
    'void main(){vec2 uv=gl_FragCoord.xy/R;vec2 p=uv*vec2(R.x/R.y,1.)*1.15;float t=T*.016+S*.9;' +
    'vec2 w=vec2(fbm(p+vec2(t,-t*.6)+M*.12),fbm(p+vec2(-t*.7,t*.4)+3.1));float f=fbm(p+2.4*w+vec2(t*.3,0.));' +
    'vec3 c0=vec3(.014,.040,.082);vec3 c1=vec3(.042,.088,.165);vec3 c2=vec3(.026,.058,.112);' +
    'vec3 col=mix(c0,c1,smoothstep(.18,.85,f));col=mix(col,c2,w.x*.55);' +
    'float g=.10+.22*clamp(P,0.,1.);' +
    'float ridge=pow(smoothstep(.475,.505,f)*smoothstep(.535,.505,f),1.6);col+=vec3(.76,.63,.39)*ridge*g;' +
    'col+=vec3(.86,.74,.47)*pow(smoothstep(.498,.505,f)*smoothstep(.512,.505,f),2.)*(g*1.3);' +
    'float lf=smoothstep(.62,.985,fbm(p*.6+w*1.4-vec2(t*.2,0.)));col+=vec3(.20,.24,.33)*lf*.10;' +
    'float vig=smoothstep(1.3,.3,distance(uv,vec2(.42,.45)));col*=mix(.5,1.,vig);gl_FragColor=vec4(col,1.);}';
  function sh(t, s) { var o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); return o; }
  var pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(pr); if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return; gl.useProgram(pr);
  var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  var uR = gl.getUniformLocation(pr, 'R'), uT = gl.getUniformLocation(pr, 'T'), uM = gl.getUniformLocation(pr, 'M'), uS = gl.getUniformLocation(pr, 'S'), uP = gl.getUniformLocation(pr, 'P');
  var mx = 0, my = 0;
  window.addEventListener('pointermove', function (e) { mx = e.clientX / window.innerWidth - .5; my = e.clientY / window.innerHeight - .5; }, { passive: true });
  function size() { var d = Math.min(window.devicePixelRatio || 1, 1.5); canvas.width = Math.floor(window.innerWidth * d); canvas.height = Math.floor(window.innerHeight * d); gl.viewport(0, 0, canvas.width, canvas.height); }
  size(); window.addEventListener('resize', size);
  var t0 = performance.now(), hidden = false;
  document.addEventListener('visibilitychange', function () { hidden = document.hidden; if (!hidden && !reduced) requestAnimationFrame(frame); });
  function frame(now) {
    gl.uniform2f(uR, canvas.width, canvas.height); gl.uniform1f(uT, (now - t0) / 1000);
    gl.uniform2f(uM, mx, my); gl.uniform1f(uS, uniforms.uScroll.value); gl.uniform1f(uP, uniforms.uPaletteMix.value);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!reduced && !hidden) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
