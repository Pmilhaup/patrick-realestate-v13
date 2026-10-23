/* silk-bg.js — v14 "After Dark" aurora-silk background.
   Replaces liquid-bg.js (three.js) with ~3KB of raw WebGL: domain-warped
   noise in deep navy with thin gold filaments. Mounts on #paint, honors
   prefers-reduced-motion (one static frame), caps DPR at 1.5, and exposes
   window.__paintUniforms with the same shape the chapter orchestrator
   drives: uScroll.value (0–1) and uPaletteMix.value (0–1). */
(function () {
  'use strict';
  var canvas = document.getElementById('paint');
  if (!canvas) return;
  var gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
  if (!gl) return;
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var paletteAttr = parseFloat((document.body && document.body.getAttribute('data-liquid-palette')) || '0.38');
  var U = window.__paintUniforms = {
    uScroll: { value: 0 },
    uPaletteMix: { value: isNaN(paletteAttr) ? 0.38 : paletteAttr },
    uMouse: { value: { x: 0, y: 0 } }
  };

  var vs = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  var fs = 'precision highp float;uniform vec2 R;uniform float T;uniform vec2 M;uniform float S;uniform float P;' +
    'float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}' +
    'float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);' +
    'return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}' +
    'float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*n(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}' +
    'void main(){vec2 uv=gl_FragCoord.xy/R;vec2 p=uv*vec2(R.x/R.y,1.)*1.15+vec2(0.,S*.6);' +
    'float t=T*.016;' +
    'vec2 w=vec2(fbm(p+vec2(t,-t*.6)+M*.12),fbm(p+vec2(-t*.7,t*.4)+3.1));' +
    'float f=fbm(p+2.4*w+vec2(t*.3,0.));' +
    'vec3 c0=vec3(.014,.040,.082);vec3 c1=vec3(.042,.088,.165);vec3 c2=vec3(.026,.058,.112);' +
    'vec3 col=mix(c0,c1,smoothstep(.18,.85,f));col=mix(col,c2,w.x*.55);' +
    'float ridge=pow(smoothstep(.475,.505,f)*smoothstep(.535,.505,f),1.6);' +
    'col+=vec3(.76,.63,.39)*ridge*(.12+.08*P);' +
    'col+=vec3(.86,.74,.47)*pow(smoothstep(.498,.505,f)*smoothstep(.512,.505,f),2.)*0.22;' +
    'float lf=smoothstep(.62,.985,fbm(p*.6+w*1.4-vec2(t*.2,0.)));col+=vec3(.20,.24,.33)*lf*.10;' +
    'float vig=smoothstep(1.3,.3,distance(uv,vec2(.42,.45)));col*=mix(.5,1.,vig);' +
    'gl_FragColor=vec4(col,1.);}';

  function sh(type, src) { var o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o); return o; }
  var pr = gl.createProgram();
  gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(pr); if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return; gl.useProgram(pr);
  var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  var uR = gl.getUniformLocation(pr, 'R'), uT = gl.getUniformLocation(pr, 'T'), uM = gl.getUniformLocation(pr, 'M'),
      uS = gl.getUniformLocation(pr, 'S'), uP = gl.getUniformLocation(pr, 'P');

  window.addEventListener('pointermove', function (e) {
    U.uMouse.value.x = e.clientX / window.innerWidth - 0.5; U.uMouse.value.y = e.clientY / window.innerHeight - 0.5;
  }, { passive: true });
  function size() {
    var d = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.floor(window.innerWidth * d); canvas.height = Math.floor(window.innerHeight * d);
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  size(); window.addEventListener('resize', size);

  var t0 = performance.now(), visible = true;
  document.addEventListener('visibilitychange', function () { visible = !document.hidden; if (visible && !reduced) requestAnimationFrame(frame); });
  function frame(now) {
    gl.uniform2f(uR, canvas.width, canvas.height);
    gl.uniform1f(uT, (now - t0) / 1000);
    gl.uniform2f(uM, U.uMouse.value.x, U.uMouse.value.y);
    gl.uniform1f(uS, U.uScroll.value);
    gl.uniform1f(uP, U.uPaletteMix.value);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!reduced && visible) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* film grain — 140px noise tile, overlay-blended, 5% */
  try {
    var g = document.createElement('canvas'); g.width = 140; g.height = 140;
    var x = g.getContext('2d'), id = x.createImageData(140, 140);
    for (var i = 0; i < id.data.length; i += 4) { var v = (Math.random() * 255) | 0; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
    x.putImageData(id, 0, 0);
    var grain = document.createElement('div');
    grain.setAttribute('aria-hidden', 'true');
    grain.style.cssText = 'position:fixed;inset:0;z-index:1;pointer-events:none;opacity:.05;mix-blend-mode:overlay;background:url(' + g.toDataURL() + ') repeat;';
    canvas.parentNode.insertBefore(grain, canvas.nextSibling);
  } catch (e) {}
})();
