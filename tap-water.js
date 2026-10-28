(() => {
  const surface = document.getElementById('waterBackground');
  const video = document.getElementById('waterBackgroundVideo');
  const canvas = document.getElementById('tapWaterCanvas');
  if (!surface || !video || !canvas) return;
  const mobile = window.matchMedia('(max-width: 768px)');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const intro = document.getElementById('introScreen');
  const settings = document.getElementById('settingsModal');
  const avatarPreview = document.getElementById('avatarPreviewOverlay');
  const excluded = 'a,button,input,textarea,select,label,[role="button"],.profile-counters,.mini-music-bar,.settings-modal,.game-modal-overlay,.avatar-preview-overlay,.top-controls,#avatarBox,#flyingPetsContainer,.intro-screen';
  const lifetime = 1.8;
  const profileCard = document.getElementById('profileCard');
  let cardDisplacement = null;
  let cardFilterActive = false;
  let previousCardFilter = '';
  function prepareCardRipple() {
    if (!profileCard || cardDisplacement) return;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.position = 'absolute';
    svg.style.pointerEvents = 'none';
    svg.innerHTML = '<defs><filter id="tapWaterCardFilter" x="-8%" y="-8%" width="116%" height="116%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.014 0.028" numOctaves="1" seed="9" result="water"/><feDisplacementMap in="SourceGraphic" in2="water" scale="0" xChannelSelector="R" yChannelSelector="G"/></filter></defs>';
    document.body.appendChild(svg);
    cardDisplacement = svg.querySelector('feDisplacementMap');
  }
  function resetCardRipple() {
    if (!profileCard || !cardFilterActive) return;
    profileCard.style.filter = previousCardFilter;
    cardDisplacement.setAttribute('scale', '0');
    cardFilterActive = false;
  }
  function rippleCard(time) {
    if (!profileCard || !cardDisplacement) return;
    let strength = 0;
    for (const drop of drops) {
      const elapsed = time - drop.time - drop.cardDelay;
      if (elapsed < 0 || elapsed > 0.72) continue;
      strength += Math.sin(elapsed * 23) * Math.sin(Math.min(1, elapsed / 0.08) * Math.PI / 2) * Math.exp(-elapsed * 4.5) * 10;
    }
    if (Math.abs(strength) < 0.06) { resetCardRipple(); return; }
    if (!cardFilterActive) {
      previousCardFilter = profileCard.style.filter;
      profileCard.style.filter = (previousCardFilter ? previousCardFilter + ' ' : '') + 'url("#tapWaterCardFilter")';
      cardFilterActive = true;
    }
    cardDisplacement.setAttribute('scale', Math.max(-9, Math.min(9, strength)).toFixed(2));
  }
  const drops = [];
  let frame = null;
  let lastFrame = -Infinity;
  let activePointer = null;
  let program = null;
  let uniforms = null;
  let texture = null;
  let bounds = null;
  let gl = null;
  let ready = false;
  let unavailable = false;
  let waveEpoch = 0;
  let backgroundVersion = 0;
  let localMediaPromise = null;
  const localURLs = new Map();
  const scriptURL = document.currentScript && document.currentScript.src;
  function localBackground(name) {
    if (!localMediaPromise) {
      localMediaPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = new URL('tap-water-local-media.js', scriptURL || window.location.href).href;
        script.onload = () => window.__tapWaterLocalMedia ? resolve(window.__tapWaterLocalMedia) : reject(new Error('Local water media missing'));
        script.onerror = () => reject(new Error('Local water media could not load'));
        document.head.appendChild(script);
      });
    }
    return localMediaPromise.then(media => {
      if (!localURLs.has(name)) {
        const bytes = Uint8Array.from(atob(media[name]), character => character.charCodeAt(0));
        localURLs.set(name, URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' })));
      }
      return localURLs.get(name);
    });
  }
  const vertexSource = 'attribute vec2 a_position;varying vec2 v_uv;void main(){v_uv=(a_position+1.0)*0.5;gl_Position=vec4(a_position,0.0,1.0);}';
  const fragmentSource = `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
    #else
    precision mediump float;
    #endif
    varying vec2 v_uv;
    uniform sampler2D u_background;
    uniform vec2 u_resolution;
    uniform vec2 u_cover;
    uniform float u_time;
    uniform int u_count;
    uniform vec3 u_drops[6];
    void main(){
      vec2 point=v_uv*u_resolution;
      vec2 distortion=vec2(0.0);
      float light=0.0;
      for(int i=0;i<6;i++){
        if(i>=u_count)break;
        float age=u_time-u_drops[i].z;
        if(age<0.0||age>1.8)continue;
        vec2 delta=point-u_drops[i].xy;
        float distance=max(length(delta),1.0);
        float front=distance-age*190.0;
        float band=front/28.0;
        float envelope=exp(-band*band)*exp(-age*1.7);
        float wave=sin(front*0.20);
        distortion+=(delta/distance)*cos(front*0.20)*envelope*0.008;
        light+=wave*envelope*0.035;
      }
      vec2 uv=(v_uv-0.5)*u_cover+0.5+distortion*u_cover;
      vec3 color=texture2D(u_background,clamp(uv,vec2(0.001),vec2(0.999))).rgb;
      gl_FragColor=vec4(clamp(color+light,0.0,1.0),1.0);
    }
  `;

  function stop() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    drops.length = 0;
    surface.classList.remove('is-rippling');
    resetCardRipple();
  }
  function resize() {
    bounds = surface.getBoundingClientRect();
    const ratio = Math.min(1, 900 / Math.max(bounds.width, bounds.height));
    canvas.width = Math.max(1, Math.round(bounds.width * ratio));
    canvas.height = Math.max(1, Math.round(bounds.height * ratio));
    if (gl) gl.viewport(0, 0, canvas.width, canvas.height);
  }
  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      throw new Error('Water shader unavailable');
    }
    return shader;
  }
  function initialize() {
    if (program) return true;
    if (unavailable) return false;
    try {
      gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' });
      if (!gl) { unavailable = true; return false; }
      const vertex = compile(gl.VERTEX_SHADER, vertexSource);
      const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
      program = gl.createProgram();
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Water program unavailable');
      gl.useProgram(program);
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, 'a_position');
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      texture = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      uniforms = Object.fromEntries(['background','resolution','cover','time','count','drops[0]'].map(name => [name, gl.getUniformLocation(program, 'u_' + name)]));
      gl.uniform1i(uniforms.background, 0);
      resize();
      return true;
    } catch (_) {
      program = null;
      unavailable = true;
      stop();
      return false;
    }
  }
  function render(now) {
    frame = null;
    if (document.hidden || !ready || !program || reduced.matches) { stop(); return; }
    const time = (now - waveEpoch) / 1000;
    while (drops.length && time - drops[0].time > lifetime) drops.shift();
    if (!drops.length) { stop(); return; }
    if (now - lastFrame < 1000 / 30) { frame = requestAnimationFrame(render); return; }
    lastFrame = now;
    try {
      gl.useProgram(program);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
      const packed = new Float32Array(18);
      drops.forEach((drop, index) => packed.set([drop.x, drop.y, drop.time], index * 3));
      const screenAspect = bounds.width / bounds.height;
      const imageAspect = video.videoWidth / video.videoHeight;
      const coverX = imageAspect > screenAspect ? screenAspect / imageAspect : 1;
      const coverY = imageAspect > screenAspect ? 1 : imageAspect / screenAspect;
      gl.uniform2f(uniforms.resolution, bounds.width, bounds.height);
      gl.uniform2f(uniforms.cover, coverX, coverY);
      gl.uniform1f(uniforms.time, time);
      gl.uniform1i(uniforms.count, drops.length);
      gl.uniform3fv(uniforms['drops[0]'], packed);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      surface.classList.add('is-rippling');
      rippleCard(time);
      frame = requestAnimationFrame(render);
    } catch (error) {
      console.warn('Tap water could not render:', error);
      stop();
    }
  }
  function dropAt(x, y) {
    if (!ready || reduced.matches || document.hidden || video.readyState < 2 || !initialize()) return;
    bounds = surface.getBoundingClientRect();
    const now = performance.now();
    if (!drops.length) waveEpoch = now;
    const time = (now - waveEpoch) / 1000;
    while (drops.length && time - drops[0].time > lifetime) drops.shift();
    if (drops.length >= 6) drops.shift();
    prepareCardRipple();
    const cardBounds = profileCard && profileCard.getBoundingClientRect();
    const distanceToCard = cardBounds ? Math.hypot(Math.max(cardBounds.left - x, 0, x - cardBounds.right), Math.max(cardBounds.top - y, 0, y - cardBounds.bottom)) : 0;
    drops.push({ x: x - bounds.left, y: bounds.height - (y - bounds.top), time, cardDelay: distanceToCard / 190 });
    if (frame === null) frame = requestAnimationFrame(render);
  }
  function canTap(target) {
    return (!intro || intro.classList.contains('hide'))
      && (!settings || !settings.classList.contains('active'))
      && (!avatarPreview || !avatarPreview.classList.contains('active'))
      && target && typeof target.closest === 'function' && !target.closest(excluded);
  }
  document.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || !canTap(event.target)) { activePointer = null; return; }
    activePointer = { id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now(), moved: false };
  }, { capture: true, passive: true });
  document.addEventListener('pointermove', event => {
    if (activePointer && event.pointerId === activePointer.id && Math.hypot(event.clientX - activePointer.x, event.clientY - activePointer.y) > 8) activePointer.moved = true;
  }, { capture: true, passive: true });
  document.addEventListener('pointerup', event => {
    const pointer = activePointer;
    activePointer = null;
    if (!pointer || pointer.id !== event.pointerId || pointer.moved || performance.now() - pointer.time > 500 || !canTap(event.target)) return;
    dropAt(event.clientX, event.clientY);
  }, { capture: true, passive: true });
  document.addEventListener('pointercancel', () => { activePointer = null; }, { passive: true });
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); stop(); program = null; unavailable = true; }, false);
  function play() {
    video.muted = true;
    const playing = video.play();
    if (playing && playing.catch) playing.catch(() => {});
  }
  video.addEventListener('playing', () => {
    ready = true;
    document.body.classList.add('water-background-ready');
    resize();
    const prepare = () => { if (!document.hidden && !reduced.matches) initialize(); };
    if (window.requestIdleCallback) window.requestIdleCallback(prepare, { timeout: 1000 });
    else setTimeout(prepare, 200);
  });
  video.addEventListener('error', () => {
    ready = false;
    stop();
    document.body.classList.remove('water-background-ready');
  });
  async function chooseBackground() {
    ready = false;
    stop();
    document.body.classList.remove('water-background-ready');
    const version = ++backgroundVersion;
    const name = mobile.matches ? 'bg_mobile_water.mp4' : 'bg_pc_water.mp4';
    try {
      const source = window.location.protocol === 'file:' ? await localBackground(name) : name;
      if (version !== backgroundVersion) return;
      video.src = source;
      video.load();
      play();
    } catch (error) {
      console.warn('Tap water background could not load:', error);
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stop(); video.pause(); } else play();
  });
  if (intro) intro.addEventListener('click', play, { once: true });
  window.addEventListener('resize', () => { stop(); resize(); }, { passive: true });
  if (mobile.addEventListener) mobile.addEventListener('change', chooseBackground);
  else if (mobile.addListener) mobile.addListener(chooseBackground);
  if (reduced.addEventListener) reduced.addEventListener('change', () => { if (reduced.matches) stop(); });
  chooseBackground();
})();
