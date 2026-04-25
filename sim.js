const canvas = document.getElementById('sim');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const hintEl = document.getElementById('hint');

const KNOT = 0.514444;
const world = {
  riverWidth: 100,
  mapW: 210,
  mapH: 170,
  topBridgeY: 80,
  lowBridgeY: 136.5, // 56.5 m between bridges => ~110 s at 1 knot
  lowBridgeGap: 13,
  dock: {
    x: 100,
    y: 110,
    w: 100,
    h: 60,
    openingY1: 122,
    openingY2: 144,
  },
};

const pxPerM = canvas.width / world.mapW;
const toPxX = (m) => m * pxPerM;
const toPxY = (m) => canvas.height - m * pxPerM;

const boat = {
  x: 50,
  y: 98,
  heading: Math.PI / 2, // sør
  length: 55,
  beam: 9,
  speed: 0,
  targetSpeed: 0,
};

const input = { w: false, s: false, a: false, d: false };
let lastTime = performance.now();
let simTime = 0;
let bridgeCrossStart = null;
let bridgeCrossTime = null;
let crashed = false;
let win = false;

addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  if (k in input) input[k] = true;
});
addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  if (k in input) input[k] = false;
});

function rectCorners(x, y, heading, l, b) {
  const hl = l / 2;
  const hb = b / 2;
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  const points = [
    { x: hl, y: hb },
    { x: hl, y: -hb },
    { x: -hl, y: -hb },
    { x: -hl, y: hb },
  ];
  return points.map((p) => ({
    x: x + p.x * c - p.y * s,
    y: y + p.x * s + p.y * c,
  }));
}

function outsideWater(px, py) {
  const inRiver = px >= 0 && px <= world.riverWidth;
  const d = world.dock;
  const inDock = px >= d.x && px <= d.x + d.w && py >= d.y && py <= d.y + d.h;

  if (!inRiver && !inDock) return true;

  // solid wall between river and dock, except opening
  const onDivider = px > world.riverWidth && px < d.x;
  if (onDivider) {
    return !(py >= d.openingY1 && py <= d.openingY2);
  }

  // lower bridge with 13m gap in middle
  if (Math.abs(py - world.lowBridgeY) < 1.2) {
    const gapX1 = (world.riverWidth - world.lowBridgeGap) / 2;
    const gapX2 = gapX1 + world.lowBridgeGap;
    if (px < gapX1 || px > gapX2) return true;
  }

  // top bridge fully open (for initial placement visualization only)
  return false;
}

function checkCollision() {
  const corners = rectCorners(boat.x, boat.y, boat.heading, boat.length, boat.beam);
  return corners.some((p) => outsideWater(p.x, p.y));
}

function checkWin() {
  const d = world.dock;
  const inside = boat.x > d.x + 20 && boat.x < d.x + d.w - 10 && boat.y > d.y + 10 && boat.y < d.y + d.h - 10;
  const sternEast = Math.cos(boat.heading) < -0.6; // bow mostly west => stern east
  const movingBack = boat.speed < -0.05;
  return inside && sternEast && movingBack;
}

function update(dt) {
  if (crashed || win) return;
  simTime += dt;

  if (input.w && !input.s) boat.targetSpeed = 1 * KNOT;
  else if (input.s && !input.w) boat.targetSpeed = -0.5 * KNOT;
  else boat.targetSpeed = 0;

  const accel = 0.18;
  boat.speed += Math.max(-accel * dt, Math.min(accel * dt, boat.targetSpeed - boat.speed));

  let turnRate = 0;
  if (input.a) turnRate -= 0.20;
  if (input.d) turnRate += 0.20;
  const effectiveness = 0.35 + Math.min(1, Math.abs(boat.speed) / KNOT) * 0.65;
  boat.heading += turnRate * effectiveness * dt;

  boat.x += Math.cos(boat.heading) * boat.speed * dt;
  boat.y += Math.sin(boat.heading) * boat.speed * dt;

  const bowY = boat.y + Math.sin(boat.heading) * (boat.length / 2);
  if (bridgeCrossStart === null && bowY < world.lowBridgeY - 0.5 && boat.y > world.lowBridgeY - 30) {
    bridgeCrossStart = simTime;
  }
  if (bridgeCrossStart !== null && bridgeCrossTime === null && bowY > world.lowBridgeY + 0.5) {
    bridgeCrossTime = simTime - bridgeCrossStart;
  }

  if (checkCollision()) crashed = true;
  if (checkWin()) win = true;
}

function drawWater() {
  ctx.fillStyle = '#05283b';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // river
  ctx.fillStyle = '#0b5d8c';
  ctx.fillRect(toPxX(0), toPxY(world.mapH), toPxX(world.riverWidth), toPxY(0) - toPxY(world.mapH));

  // dock basin
  const d = world.dock;
  ctx.fillStyle = '#0d4f74';
  ctx.fillRect(toPxX(d.x), toPxY(d.y + d.h), toPxX(d.w), (d.h * pxPerM));

  // shoreline / quay
  ctx.strokeStyle = '#8b949e';
  ctx.lineWidth = 3;
  ctx.strokeRect(toPxX(0), toPxY(world.mapH), toPxX(world.riverWidth), toPxY(0) - toPxY(world.mapH));
  ctx.strokeRect(toPxX(d.x), toPxY(d.y + d.h), toPxX(d.w), d.h * pxPerM);

  // wall between river and dock, leave opening
  ctx.beginPath();
  ctx.moveTo(toPxX(world.riverWidth), toPxY(world.dock.y));
  ctx.lineTo(toPxX(world.riverWidth), toPxY(world.dock.openingY2));
  ctx.moveTo(toPxX(world.riverWidth), toPxY(world.dock.openingY1));
  ctx.lineTo(toPxX(world.riverWidth), toPxY(world.dock.y + world.dock.h));
  ctx.stroke();

  // bridges
  const bridgeThickness = 2.2;
  ctx.fillStyle = '#6b7280';
  ctx.fillRect(toPxX(0), toPxY(world.topBridgeY + bridgeThickness / 2), toPxX(world.riverWidth), bridgeThickness * pxPerM);

  const gapX1 = (world.riverWidth - world.lowBridgeGap) / 2;
  const gapX2 = gapX1 + world.lowBridgeGap;
  ctx.fillRect(toPxX(0), toPxY(world.lowBridgeY + bridgeThickness / 2), toPxX(gapX1), bridgeThickness * pxPerM);
  ctx.fillRect(toPxX(gapX2), toPxY(world.lowBridgeY + bridgeThickness / 2), toPxX(world.riverWidth - gapX2), bridgeThickness * pxPerM);

  // labels
  ctx.fillStyle = '#d1d5db';
  ctx.font = '14px sans-serif';
  ctx.fillText('Nidelva (100 m)', toPxX(4), toPxY(164));
  ctx.fillText('Nedre broåpning 13 m', toPxX(gapX1 - 6), toPxY(world.lowBridgeY + 5));
  ctx.fillText('Dokkbasseng 100 m x 60 m', toPxX(d.x + 5), toPxY(d.y + d.h - 5));
}

function drawBoat() {
  const corners = rectCorners(boat.x, boat.y, boat.heading, boat.length, boat.beam).map((p) => ({
    x: toPxX(p.x),
    y: toPxY(p.y),
  }));

  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].x, corners[i].y);
  ctx.closePath();
  ctx.fillStyle = crashed ? '#ef4444' : '#f8fafc';
  ctx.fill();
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 2;
  ctx.stroke();

  const bowX = toPxX(boat.x + Math.cos(boat.heading) * (boat.length / 2 - 2));
  const bowY = toPxY(boat.y + Math.sin(boat.heading) * (boat.length / 2 - 2));
  ctx.fillStyle = '#0ea5e9';
  ctx.beginPath();
  ctx.arc(bowX, bowY, 5, 0, Math.PI * 2);
  ctx.fill();
}

function render() {
  drawWater();
  drawBoat();

  const knots = boat.speed / KNOT;
  const headingDeg = ((boat.heading * 180 / Math.PI) % 360 + 360) % 360;
  statusEl.innerHTML = `Tid: <b>${simTime.toFixed(1)} s</b><br>
    Fart: <b>${knots.toFixed(2)} knop</b><br>
    Kurs: <b>${headingDeg.toFixed(0)}°</b><br>
    Estimat brokryssing ved 1 knop: <b>ca. 110 s</b>${bridgeCrossTime ? `<br>Din siste brokryssing: <b>${bridgeCrossTime.toFixed(1)} s</b>` : ''}`;

  if (crashed) {
    hintEl.className = 'small';
    hintEl.textContent = 'Kollisjon med kai/bro. Last siden på nytt for nytt forsøk.';
  } else if (win) {
    hintEl.className = 'small ok';
    hintEl.textContent = 'Bra! Du rygget inn mot øst i dokkbassenget.';
  } else {
    hintEl.className = 'small warn';
    hintEl.textContent = 'Tips: gå sørover gjennom 13 m åpningen og bruk deretter akterfart inn i bassenget.';
  }
}

function loop(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  update(dt);
  render();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
