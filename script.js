const W = 400, H = 640, LINE = 130, FLOOR = H - 10, G = 1500;
const OVER_SECONDS = 10; // tempo acima da linha até o fim do jogo

// Cada minério tem o contorno (poly, em pixels da imagem) usado na colisão
const TIERS = [
  { n: 'Carvão', r: 16, img: 'img/carvao.png', c: ['#7a7a85', '#1c1c22'], w: 384, h: 242,
    poly: [[57,53],[166,4],[331,0],[383,70],[339,181],[333,188],[167,241],[56,241],[51,238],[0,122]] },
  { n: 'Cobre', r: 20, img: 'img/cobre.png', c: ['#e08a4a', '#8a3f12'], w: 384, h: 157,
    poly: [[26,75],[93,0],[172,0],[284,7],[343,67],[381,122],[380,126],[261,156],[29,151],[0,150]] },
  { n: 'Ferro', r: 25, img: 'img/ferro.png', c: ['#5b6f8e', '#26334a'], w: 384, h: 348,
    poly: [[0,126],[32,33],[82,4],[92,2],[351,153],[383,208],[383,277],[269,343],[250,340],[0,194]] },
  { n: 'Ouro', r: 31, img: 'img/ouro.png', c: ['#f6b93b', '#c78a00'], w: 185, h: 159,
    poly: [[7,141],[13,123],[54,60],[96,30],[137,30],[174,61],[179,74],[179,89],[140,155],[7,155]] },
  { n: 'Quartzo', r: 39, img: 'img/quartzo.png', c: ['#dfeef0', '#8fa4a8'], w: 256, h: 384,
    poly: [[0,102],[110,8],[132,0],[246,88],[255,102],[255,281],[145,375],[123,383],[9,295],[0,281]] },
  { n: 'Rubi', r: 49, img: 'img/rubi.png', c: ['#ff2a5c', '#8f0a22'], w: 265, h: 384,
    poly: [[0,55],[54,0],[210,0],[264,55],[264,328],[261,335],[210,383],[54,383],[3,335],[0,328]] },
  { n: 'Esmeralda', r: 61, img: 'img/esmeralda.png', c: ['#6bea2c', '#2c8a14'], w: 138, h: 192,
    poly: [[3,27],[30,0],[107,0],[114,6],[134,27],[134,164],[110,189],[107,191],[30,191],[3,164]] },
  { n: 'Safira', r: 76, img: 'img/safira.png', c: ['#4a86ff', '#1a2fa8'], w: 366, h: 366,
    poly: [[0,107],[106,1],[108,0],[257,0],[364,106],[364,259],[257,365],[108,365],[106,364],[0,258]] },
  { n: 'Diamante', r: 96, img: 'img/diamante.png', c: ['#00c2ff', '#0077b6'], w: 192, h: 158,
    poly: [[0,42],[39,3],[152,3],[191,42],[190,44],[115,132],[97,153],[94,153],[76,132],[1,44]] }
];

// prepara tamanho, centro de massa, massa e inércia a partir do contorno de cada imagem
TIERS.forEach(T => {
  T.im = new Image(); T.im.onload = () => { if (typeof drawNext === 'function') drawNext(); }; T.im.src = T.img;
  T.k = 2 * T.r * 1.08 / Math.hypot(T.w, T.h); // escala imagem -> jogo
  const P = T.poly, n = P.length;
  let A = 0, cx = 0, cy = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, cr = P[i][0] * P[j][1] - P[j][0] * P[i][1];
    A += cr; cx += (P[i][0] + P[j][0]) * cr; cy += (P[i][1] + P[j][1]) * cr;
  }
  A /= 2; cx /= 6 * A; cy /= 6 * A;
  T.cx = cx; T.cy = cy;
  let pts = P.map(p => [(p[0] - cx) * T.k, (p[1] - cy) * T.k]);
  if (A < 0) pts.reverse(); // sentido anti-horário => normais para fora
  let area = 0, J = 0, R = 0;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % n], cr = x1 * y2 - x2 * y1;
    area += cr / 2; J += cr * (x1 * x1 + x1 * x2 + x2 * x2 + y1 * y1 + y1 * y2 + y2 * y2) / 12;
    R = Math.max(R, Math.hypot(x1, y1));
  }
  T.pts = pts; T.mass = area; T.I = J; T.R = R;
});

const cv = document.getElementById('game'), ctx = cv.getContext('2d');
const nx = document.getElementById('next'), nctx = nx.getContext('2d');
const dpr = Math.min(window.devicePixelRatio || 1, 2);
const stage = document.getElementById('stage');
let K = 1;
function resize() {
  const aw = stage.clientWidth - 4, ah = stage.clientHeight - 4;
  const sc = Math.max(0.1, Math.min(aw / W, ah / H));
  const cw = Math.floor(W * sc), ch = Math.floor(H * sc);
  cv.style.width = cw + 'px'; cv.style.height = ch + 'px';
  cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
  K = cv.width / W;
  const s = Math.max(10, Math.min(16, 8 + sc * 8));
  document.querySelectorAll('#evo i').forEach((d, i) => { const z = (s + i * 1.4) * (innerWidth > innerHeight ? .9 : 1); d.style.width = d.style.height = Math.min(z, 30) + 'px'; });
}
addEventListener('resize', resize);
if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);

let balls, score, best = +(localStorage.getItem('fm_best') || 0), curTier, nextTier, aimX, canDrop, over, parts, overTime, last;
document.getElementById('best').textContent = best;

// barra de evolução
const evo = document.getElementById('evo');
TIERS.forEach((t, i) => {
  const d = document.createElement('i');
  d.style.color = t.c[0];
  d.style.backgroundImage = `url(${t.img})`;
  evo.appendChild(d);
});
evo.insertAdjacentHTML('beforeend', '<span>➜</span>');

function rndTier() { return [0, 0, 0, 1, 1, 2, 3][Math.floor(Math.random() * 7)]; }

/* ---------- desenho ---------- */
function drawOre(c, x, y, t, sc = 1, ang = 0, glow = false) {
  const T = TIERS[t], im = T.im;
  c.save(); c.translate(x, y); c.rotate(ang); c.scale(sc, sc);
  if (im.complete && im.naturalWidth) {
    if (glow) { c.shadowColor = T.c[0]; c.shadowBlur = 12; }
    c.drawImage(im, -T.cx * T.k, -T.cy * T.k, T.w * T.k, T.h * T.k);
  } else { // enquanto a imagem carrega: desenha o contorno
    c.fillStyle = T.c[0]; c.beginPath();
    T.pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]));
    c.closePath(); c.fill();
  }
  c.restore();
}

/* ---------- física de polígonos (corpos rígidos) ---------- */
const MARGIN = 0.5, SLOP = 0.4, MU = 0.4, REST = 0.12, ITER = 12;
const STATIC = { x: 0, y: 0, vx: 0, vy: 0, w: 0, im: 0, iI: 0 };

function makeBody(t, x, y, vx = 0, vy = 0, a = 0, w = 0) {
  const T = TIERS[t], n = T.pts.length;
  return { t, x, y, vx, vy, a, w, pts: T.pts, n, R: T.R, im: 1 / T.mass, iI: 1 / T.I,
    age: 0, sc: 1, dead: false, minY: y,
    wx: new Float64Array(n), wy: new Float64Array(n), nx: new Float64Array(n), ny: new Float64Array(n) };
}
function updateGeom(b) {
  const c = Math.cos(b.a), s = Math.sin(b.a), P = b.pts, n = b.n;
  let minY = 1e9;
  for (let i = 0; i < n; i++) {
    b.wx[i] = b.x + P[i][0] * c - P[i][1] * s;
    b.wy[i] = b.y + P[i][0] * s + P[i][1] * c;
    if (b.wy[i] < minY) minY = b.wy[i];
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, dx = b.wx[j] - b.wx[i], dy = b.wy[j] - b.wy[i], l = Math.hypot(dx, dy) || 1;
    b.nx[i] = dy / l; b.ny[i] = -dx / l;
  }
  b.minY = minY;
}
let SEPI = 0;
function maxSep(A, B) { // maior separação de A contra B (eixos das arestas de A)
  let best = -1e9;
  for (let i = 0; i < A.n; i++) {
    const nx = A.nx[i], ny = A.ny[i], vx = A.wx[i], vy = A.wy[i];
    let s = 1e9;
    for (let j = 0; j < B.n; j++) { const d = (B.wx[j] - vx) * nx + (B.wy[j] - vy) * ny; if (d < s) s = d; }
    if (s > best) { best = s; SEPI = i; }
  }
  return best;
}
function clipSeg(x1, y1, x2, y2, nx, ny, off) { // mantém a parte com dot(p,n)-off >= 0
  const d1 = x1 * nx + y1 * ny - off, d2 = x2 * nx + y2 * ny - off;
  if (d1 < 0 && d2 < 0) return null;
  if (d1 >= 0 && d2 >= 0) return [x1, y1, x2, y2];
  const t = d1 / (d1 - d2), ix = x1 + t * (x2 - x1), iy = y1 + t * (y2 - y1);
  return d1 < 0 ? [ix, iy, x2, y2] : [x1, y1, ix, iy];
}
function collide(A, B) { // SAT + recorte de arestas -> normal (de A para B) e pontos de contato
  const dx = B.x - A.x, dy = B.y - A.y, rr = A.R + B.R + 1;
  if (dx * dx + dy * dy > rr * rr) return null;
  const sa = maxSep(A, B), ia = SEPI; if (sa > MARGIN) return null;
  const sb = maxSep(B, A), ib = SEPI; if (sb > MARGIN) return null;
  let ref, inc, ri, flip;
  if (sb > sa + 0.05) { ref = B; inc = A; ri = ib; flip = true; } else { ref = A; inc = B; ri = ia; flip = false; }
  const rnx = ref.nx[ri], rny = ref.ny[ri];
  let ii = 0, md = 1e9;
  for (let i = 0; i < inc.n; i++) { const d = inc.nx[i] * rnx + inc.ny[i] * rny; if (d < md) { md = d; ii = i; } }
  const jj = (ii + 1) % inc.n, rj = (ri + 1) % ref.n;
  const r1x = ref.wx[ri], r1y = ref.wy[ri], r2x = ref.wx[rj], r2y = ref.wy[rj];
  let tx = r2x - r1x, ty = r2y - r1y; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
  let q = clipSeg(inc.wx[ii], inc.wy[ii], inc.wx[jj], inc.wy[jj], tx, ty, tx * r1x + ty * r1y);
  if (!q) return null;
  q = clipSeg(q[0], q[1], q[2], q[3], -tx, -ty, -(tx * r2x + ty * r2y));
  if (!q) return null;
  const pts = [];
  for (let k = 0; k < 2; k++) {
    const px = q[k * 2], py = q[k * 2 + 1], sep = (px - r1x) * rnx + (py - r1y) * rny;
    if (sep <= MARGIN) pts.push({ x: px, y: py, d: -sep });
  }
  if (!pts.length) return null;
  return { nx: flip ? -rnx : rnx, ny: flip ? -rny : rny, pts };
}
function mkContact(a, b, nx, ny, px, py, d, h) {
  const c = { a, b, nx, ny, d, rax: px - a.x, ray: py - a.y, rbx: px - b.x, rby: py - b.y, jn: 0, jt: 0 };
  const tx = -ny, ty = nx;
  const rnA = c.rax * ny - c.ray * nx, rnB = c.rbx * ny - c.rby * nx;
  const rtA = c.rax * ty - c.ray * tx, rtB = c.rbx * ty - c.rby * tx;
  c.mn = 1 / (a.im + b.im + rnA * rnA * a.iI + rnB * rnB * b.iI);
  c.mt = 1 / (a.im + b.im + rtA * rtA * a.iI + rtB * rtB * b.iI);
  const vn0 = ((b.vx - b.w * c.rby) - (a.vx - a.w * c.ray)) * nx + ((b.vy + b.w * c.rbx) - (a.vy + a.w * c.rax)) * ny;
  c.target = d < 0 ? d / h : (vn0 < -80 ? -REST * vn0 : 0); // contato "antecipado" quando ainda há folga
  return c;
}
function wallContacts(b, cs, h) {
  for (let i = 0; i < b.n; i++) {
    const x = b.wx[i], y = b.wy[i];
    if (y > FLOOR - MARGIN) cs.push(mkContact(b, STATIC, 0, 1, x, y, y - FLOOR, h));
    if (x < MARGIN) cs.push(mkContact(b, STATIC, -1, 0, x, y, -x, h));
    if (x > W - MARGIN) cs.push(mkContact(b, STATIC, 1, 0, x, y, x - W, h));
  }
}
function impulse(c, px, py) {
  const a = c.a, b = c.b;
  a.vx -= px * a.im; a.vy -= py * a.im; a.w -= (c.rax * py - c.ray * px) * a.iI;
  b.vx += px * b.im; b.vy += py * b.im; b.w += (c.rbx * py - c.rby * px) * b.iI;
}
function solveContact(c) {
  const a = c.a, b = c.b;
  let rvx = (b.vx - b.w * c.rby) - (a.vx - a.w * c.ray), rvy = (b.vy + b.w * c.rbx) - (a.vy + a.w * c.rax);
  let dj = (c.target - (rvx * c.nx + rvy * c.ny)) * c.mn;
  const nj = Math.max(c.jn + dj, 0); dj = nj - c.jn; c.jn = nj;
  impulse(c, dj * c.nx, dj * c.ny);
  rvx = (b.vx - b.w * c.rby) - (a.vx - a.w * c.ray); rvy = (b.vy + b.w * c.rbx) - (a.vy + a.w * c.rax);
  const tx = -c.ny, ty = c.nx;
  let djt = -(rvx * tx + rvy * ty) * c.mt;
  const mx = MU * c.jn, nt = Math.max(-mx, Math.min(mx, c.jt + djt)); djt = nt - c.jt; c.jt = nt;
  impulse(c, djt * tx, djt * ty);
}

function step(h) {
  for (const b of balls) {
    b.vy += G * h;
    const dm = 1 - .05 * h; b.vx *= dm; b.vy *= dm; b.w *= 1 - 1.5 * h;
    const sp = Math.hypot(b.vx, b.vy); if (sp > 1400) { b.vx *= 1400 / sp; b.vy *= 1400 / sp; }
    if (b.w > 12) b.w = 12; else if (b.w < -12) b.w = -12;
    if (sp < 15 && Math.abs(b.w) < .5) { b.vx *= .9; b.vy *= .97; b.w *= .9; } // peça quase parada assenta de vez
    b.age += h; if (b.sc < 1) b.sc = Math.min(1, b.sc + h * 5);
    updateGeom(b);
  }
  const cs = [], merges = [];
  for (let i = 0; i < balls.length; i++) {
    const a = balls[i];
    wallContacts(a, cs, h);
    for (let j = i + 1; j < balls.length; j++) {
      const b = balls[j], m = collide(a, b);
      if (!m) continue;
      let maxD = -1e9;
      for (const p of m.pts) { cs.push(mkContact(a, b, m.nx, m.ny, p.x, p.y, p.d, h)); if (p.d > maxD) maxD = p.d; }
      if (a.t === b.t && maxD >= 0) merges.push([a, b]);
    }
  }
  for (let it = 0; it < ITER; it++) for (const c of cs) solveContact(c);
  for (const b of balls) { b.x += b.vx * h; b.y += b.vy * h; b.a += b.w * h; }
  for (const c of cs) { // separa o que ainda está sobreposto
    if (c.d <= SLOP) continue;
    const tot = c.a.im + c.b.im; if (!tot) continue;
    const corr = Math.min((c.d - SLOP) * .4, 4);
    c.a.x -= c.nx * corr * c.a.im / tot; c.a.y -= c.ny * corr * c.a.im / tot;
    c.b.x += c.nx * corr * c.b.im / tot; c.b.y += c.ny * corr * c.b.im / tot;
  }
  for (const [a, b] of merges) {
    if (a.dead || b.dead) continue;
    a.dead = b.dead = true;
    const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2, t = a.t + 1;
    burst(x, y, a.t);
    if (t >= TIERS.length) { addScore(500); continue; }
    addScore((t + 1) * 10);
    const nb = makeBody(t, x, y, (a.vx + b.vx) / 2, (a.vy + b.vy) / 2, a.a, (a.w + b.w) / 2);
    nb.age = 1; nb.sc = .6; updateGeom(nb);
    balls.push(nb);
  }
  balls = balls.filter(b => !b.dead);
}

/* ---------- jogo ---------- */
function reset() {
  balls = []; parts = []; score = 0; over = false; overTime = 0; canDrop = true; aimX = W / 2;
  curTier = rndTier(); nextTier = rndTier(); last = performance.now();
  document.getElementById('score').textContent = 0;
  document.getElementById('over').classList.add('hidden');
  drawNext();
}
function drawNext() {
  nctx.clearRect(0, 0, 60, 60);
  if (nextTier == null) return;
  drawOre(nctx, 30, 30, nextTier, Math.min(1.2, 26 / TIERS[nextTier].R), 0);
}
function addScore(p) {
  score += p; document.getElementById('score').textContent = score;
  if (score > best) { best = score; localStorage.setItem('fm_best', best); document.getElementById('best').textContent = best; }
}
function drop() {
  if (!canDrop || over) return;
  canDrop = false;
  const R = TIERS[curTier].R;
  balls.push(makeBody(curTier, Math.max(R, Math.min(W - R, aimX)), 55));
  curTier = nextTier; nextTier = rndTier(); drawNext();
  setTimeout(() => canDrop = true, 450);
}
function burst(x, y, t) {
  for (let i = 0; i < 12; i++) {
    const a = Math.random() * 7, s = 60 + Math.random() * 160;
    parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: .5, c: TIERS[t].c[0] });
  }
}

function update(dt) {
  if (over) return;
  for (let i = 0; i < 4; i++) step(dt / 4);
  for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 600 * dt; p.life -= dt; }
  parts = parts.filter(p => p.life > 0);
  // se algum minério está tocando/passando da linha, o contador corre; se todos saírem, zera e o jogo continua
  const danger = balls.some(b => b.age > 1.3 && b.minY < LINE);
  overTime = danger ? overTime + dt : 0;
  if (overTime >= OVER_SECONDS) {
    over = true;
    document.getElementById('final').textContent = score;
    document.getElementById('over').classList.remove('hidden');
  }
}

function render() {
  ctx.setTransform(K, 0, 0, K, 0, 0);
  ctx.clearRect(0, 0, W, H);
  // linha limite
  ctx.strokeStyle = overTime > 0 ? '#ff2bd6' : 'rgba(0,229,255,.75)';
  ctx.lineWidth = 3; ctx.setLineDash([16, 12]);
  ctx.beginPath(); ctx.moveTo(0, LINE); ctx.lineTo(W, LINE); ctx.stroke(); ctx.setLineDash([]);
  if (overTime > 0 && !over) { // contagem regressiva
    const left = Math.ceil(OVER_SECONDS - overTime);
    ctx.fillStyle = '#ff2bd6'; ctx.font = 'bold 26px "Consolas","Courier New",monospace';
    ctx.textAlign = 'center'; ctx.shadowColor = '#ff2bd6'; ctx.shadowBlur = 10;
    ctx.fillText(left, W / 2, LINE - 12);
    ctx.shadowBlur = 0; ctx.textAlign = 'start';
  }
  // guia + minério atual
  if (!over) {
    const R = TIERS[curTier].R, x = Math.max(R, Math.min(W - R, aimX));
    ctx.strokeStyle = 'rgba(0,229,255,.22)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, 55); ctx.lineTo(x, FLOOR); ctx.stroke();
    if (canDrop) drawOre(ctx, x, 55, curTier, 1, 0, true);
  }
  for (const b of balls) drawOre(ctx, b.x, b.y, b.t, b.sc, b.a);
  for (const p of parts) { ctx.globalAlpha = p.life * 2; ctx.fillStyle = p.c; ctx.fillRect(p.x, p.y, 4, 4); }
  ctx.globalAlpha = 1;
}

function loop(now) {
  const dt = Math.min(.033, (now - last) / 1000); last = now;
  update(dt); render(); requestAnimationFrame(loop);
}

function setAim(e) {
  const rc = cv.getBoundingClientRect();
  aimX = (e.clientX - rc.left) / rc.width * W;
}
cv.addEventListener('pointerdown', e => { setAim(e); });
cv.addEventListener('pointermove', setAim);
cv.addEventListener('pointerup', e => { setAim(e); drop(); });
document.getElementById('restart').onclick = reset;

reset();
resize();
requestAnimationFrame(loop);
