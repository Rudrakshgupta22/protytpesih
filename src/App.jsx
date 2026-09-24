import { useEffect, useRef, useState } from 'react';

const COLS = 30;
const ROWS = 20;
const CHARGING_ZONE = { minRow: 1, maxRow: 3, minCol: 26, maxCol: 28 };
const ROBOT_COLORS = ['#55b8ff', '#ffca5c', '#ef7dff', '#72e6a5', '#ff8d70'];
const START_CELLS = [
  { r: 18, c: 2 },
  { r: 18, c: 10 },
  { r: 18, c: 18 },
  { r: 10, c: 1 },
  { r: 1, c: 15 },
];
const TASK_CELLS = [
  { r: 1, c: 3 },
  { r: 6, c: 6 },
  { r: 10, c: 13 },
  { r: 14, c: 22 },
  { r: 18, c: 27 },
  { r: 1, c: 19 },
  { r: 6, c: 24 },
];
const PEER_COORDINATE_TASKS = [
  { r: 18, c: 10 },
  { r: 18, c: 2 },
  { r: 10, c: 1 },
  { r: 18, c: 18 },
  { r: 1, c: 15 },
];

const STATUS_META = {
  Moving: { color: '#55b8ff', label: 'MOVING' },
  Negotiating: { color: '#ffca5c', label: 'NEGOTIATING' },
  Charging: { color: '#72e6a5', label: 'CHARGING' },
  Idle: { color: '#8091a8', label: 'IDLE' },
};

function cellKey(cell) {
  return `${cell.r},${cell.c}`;
}

function isChargingCell(r, c) {
  return r >= CHARGING_ZONE.minRow && r <= CHARGING_ZONE.maxRow && c >= CHARGING_ZONE.minCol && c <= CHARGING_ZONE.maxCol;
}

function isOpenCell(r, c) {
  return r >= 0 && r < ROWS && c >= 0 && c < COLS && !isShelfCell(r, c);
}

function isShelfCell(r, c) {
  if (isChargingCell(r, c)) return false;
  const shelfRow = [4, 5, 8, 9, 12, 13, 16, 17].includes(r);
  return shelfRow && c >= 3 && c <= 26 && ![0, 1, 7].includes(c % 8);
}

function buildGrid() {
  return Array.from({ length: ROWS }, (_, r) => Array.from({ length: COLS }, (_, c) => (isShelfCell(r, c) ? 1 : isChargingCell(r, c) ? 2 : 0)));
}

function findPath(grid, start, target, blockedCells = new Set()) {
  if (!target || !isOpenCell(target.r, target.c)) return [];
  if (start.r === target.r && start.c === target.c) return [];
  const queue = [start];
  const visited = new Set([cellKey(start)]);
  const previous = new Map();
  const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  while (queue.length) {
    const current = queue.shift();
    for (const [dr, dc] of directions) {
      const next = { r: current.r + dr, c: current.c + dc };
      const key = cellKey(next);
      if (!isOpenCell(next.r, next.c) || visited.has(key) || (blockedCells.has(key) && key !== cellKey(target))) continue;
      visited.add(key);
      previous.set(key, current);
      if (next.r === target.r && next.c === target.c) {
        const path = [next];
        let cursor = current;
        while (cursor.r !== start.r || cursor.c !== start.c) {
          path.unshift(cursor);
          cursor = previous.get(cellKey(cursor));
        }
        return path;
      }
      queue.push(next);
    }
  }
  return [];
}

function nearestChargingCell(world, robot) {
  let nearest = { r: 2, c: 27 };
  let bestScore = Number.POSITIVE_INFINITY;
  const occupied = new Set(world.robots.filter((other) => other.id !== robot.id).map((other) => cellKey({ r: other.r, c: other.c })));
  for (let r = CHARGING_ZONE.minRow; r <= CHARGING_ZONE.maxRow; r += 1) {
    for (let c = CHARGING_ZONE.minCol; c <= CHARGING_ZONE.maxCol; c += 1) {
      const nextDistance = Math.abs(robot.r - r) + Math.abs(robot.c - c);
      const occupancyPenalty = occupied.has(`${r},${c}`) ? 50 : 0;
      const score = nextDistance + occupancyPenalty;
      if (score < bestScore) {
        nearest = { r, c };
        bestScore = score;
      }
    }
  }
  return nearest;
}

function makeRobot(id, start, color) {
  return {
    id,
    r: start.r,
    c: start.c,
    x: start.c,
    y: start.r,
    battery: 74 + id * 4,
    status: 'Idle',
    color,
    path: [],
    targetCell: null,
    destination: null,
    savedDestination: null,
    charging: false,
    reserved: false,
    blocked: false,
    waitTicks: 0,
    lastBlockLog: 0,
    lastReplan: 0,
    reroutes: 0,
    peerTarget: null,
  };
}

function createWorld() {
  const grid = buildGrid();
  return {
    grid,
    robots: START_CELLS.map((cell, index) => makeRobot(index + 1, cell, ROBOT_COLORS[index])),
    networkActive: true,
    tasksCompleted: 142,
    deadlocksAvoided: 0,
    totalWaitTicks: 0,
    waitSamples: 0,
    logSequence: 4,
    taskCursor: 0,
    logs: [
      { id: 1, type: 'info', time: '08:42:11.2', message: 'Orchestrator initialized. Loading warehouse map.' },
      { id: 2, type: 'info', time: '08:42:11.3', message: 'Five edge nodes connected to the local mesh.' },
      { id: 3, type: 'success', time: '08:42:11.7', message: 'Reservation table online. Lookahead horizon: 1 tick.' },
    ],
  };
}

function addLog(world, message, type = 'info') {
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}.${Math.floor(now.getMilliseconds() / 100)}`;
  world.logSequence += 1;
  world.logs.push({ id: world.logSequence, type, time, message });
  if (world.logs.length > 45) world.logs.shift();
}

function assignTask(world, robot) {
  const destination = world.taskCursor < PEER_COORDINATE_TASKS.length
    ? PEER_COORDINATE_TASKS[world.taskCursor]
    : TASK_CELLS[(world.taskCursor - PEER_COORDINATE_TASKS.length) % TASK_CELLS.length];
  world.taskCursor += 1;
  const path = findPath(world.grid, { r: robot.r, c: robot.c }, destination);
  if (!path.length) {
    robot.status = 'Idle';
    robot.destination = null;
    robot.targetCell = null;
    robot.path = [];
    return;
  }
  robot.destination = destination;
  robot.path = path;
  robot.targetCell = robot.path.shift();
  robot.status = 'Moving';
  addLog(world, `R${robot.id} accepted local task at [${destination.r}, ${destination.c}].`, 'info');
}

function sendToCharging(world, robot) {
  robot.savedDestination = robot.destination;
  robot.destination = nearestChargingCell(world, robot);
  robot.path = findPath(world.grid, { r: robot.r, c: robot.c }, robot.destination);
  robot.targetCell = robot.path.shift() || null;
  robot.charging = true;
  robot.status = robot.targetCell ? 'Moving' : 'Charging';
  addLog(world, `R${robot.id} battery threshold reached. Reserving route to charging zone.`, 'warning');
}

function finishCell(world, robot) {
  robot.r = robot.targetCell.r;
  robot.c = robot.targetCell.c;
  robot.x = robot.c;
  robot.y = robot.r;
  robot.targetCell = robot.path.shift() || null;

  if (robot.charging && isChargingCell(robot.r, robot.c) && !robot.targetCell) {
    robot.status = 'Charging';
    robot.destination = null;
    addLog(world, `R${robot.id} docked in the 3x3 charging zone.`, 'success');
  } else if (!robot.charging && !robot.targetCell) {
    world.tasksCompleted += 1;
    robot.status = 'Idle';
    robot.destination = null;
    addLog(world, `R${robot.id} completed its pick route. Task committed to ledger.`, 'success');
  }
}

function replanAroundPeer(world, robot, peer, now, reservations) {
  if (!robot.destination || now - robot.lastReplan < 900) return false;
  const blockedCells = new Set([
    ...world.robots.map((other) => cellKey({ r: other.r, c: other.c })),
    ...reservations.keys(),
  ]);
  blockedCells.delete(cellKey({ r: robot.r, c: robot.c }));
  const alternatePath = findPath(world.grid, { r: robot.r, c: robot.c }, robot.destination, blockedCells);
  if (!alternatePath.length) return false;
  robot.path = alternatePath;
  robot.targetCell = robot.path.shift();
  robot.status = 'Moving';
  robot.lastReplan = now;
  robot.reroutes += 1;
  robot.peerTarget = peer ? { r: peer.r, c: peer.c } : null;
  addLog(world, `R${robot.id} remapped around R${peer?.id ?? 'peer'} to preserve a zero-collision route.`, 'success');
  return true;
}

function prepareIntent(world, robot, now) {
  robot.reserved = false;
  robot.blocked = false;
  if (robot.charging && robot.status === 'Charging') {
    robot.battery = Math.min(100, robot.battery + 1.9);
    if (robot.battery >= 100) {
      robot.charging = false;
      robot.battery = 100;
      robot.status = 'Idle';
      robot.destination = robot.savedDestination;
      robot.savedDestination = null;
      addLog(world, `R${robot.id} fully charged. Returning to local task queue.`, 'success');
    }
    return null;
  }
  if (!robot.targetCell) {
    if (robot.battery <= 20 && !robot.charging) sendToCharging(world, robot);
    if (!robot.targetCell && !robot.charging) assignTask(world, robot);
  }
  if (!robot.targetCell) return null;
  return { robot, cell: robot.targetCell, key: cellKey(robot.targetCell), priority: robot.battery <= 20 ? 0 : robot.id };
}

function advanceSimulation(world, dt, now) {
  const intents = world.robots.map((robot) => prepareIntent(world, robot, now)).filter(Boolean);
  const occupied = new Set(world.robots.map((robot) => `${robot.r},${robot.c}`));
  const occupiedBy = new Map(world.robots.map((robot) => [`${robot.r},${robot.c}`, robot]));
  const reservations = new Map();
  const byPriority = intents.sort((a, b) => a.priority - b.priority);

  for (const intent of byPriority) {
    const currentKey = `${intent.robot.r},${intent.robot.c}`;
    const otherOccupiesTarget = occupied.has(intent.key) && intent.key !== currentKey;
    const alreadyReserved = reservations.has(intent.key);
    const isSwap = world.robots.some((other) => other.id !== intent.robot.id && `${other.r},${other.c}` === intent.key && other.targetCell && cellKey(other.targetCell) === currentKey);
    if (otherOccupiesTarget || alreadyReserved || isSwap) {
      intent.robot.blocked = true;
      intent.robot.status = 'Negotiating';
      intent.robot.waitTicks += 1;
      world.totalWaitTicks += 1;
      world.waitSamples += 1;
      if (now - intent.robot.lastBlockLog > 1600) {
        intent.robot.lastBlockLog = now;
        world.deadlocksAvoided += 1;
        const peer = occupiedBy.get(intent.key);
        const peerLabel = peer ? `R${peer.id}` : alreadyReserved ? `R${reservations.get(intent.key)}` : 'a peer';
        addLog(world, `R${intent.robot.id} negotiating with ${peerLabel} for coordinate [${intent.cell.r}, ${intent.cell.c}].`, 'conflict');
      }
      const peer = occupiedBy.get(intent.key);
      const losingSwap = isSwap && peer && intent.robot.id > peer.id;
      const losingReservation = alreadyReserved && reservations.get(intent.key) !== intent.robot.id;
      if (losingSwap || losingReservation) replanAroundPeer(world, intent.robot, peer, now, reservations);
      continue;
    }
    reservations.set(intent.key, intent.robot.id);
    intent.robot.reserved = true;
    intent.robot.status = 'Moving';
  }

  for (const robot of world.robots) {
    if (robot.status === 'Charging') continue;
    if (!robot.targetCell || !robot.reserved) continue;
    const speed = world.networkActive ? 2.7 : 1.15;
    const distance = Math.hypot(robot.targetCell.c - robot.x, robot.targetCell.r - robot.y);
    const movement = speed * dt;
    if (distance <= movement) {
      finishCell(world, robot);
      robot.battery = Math.max(0, robot.battery - 0.35);
      if (robot.battery <= 20 && !robot.charging) sendToCharging(world, robot);
    } else {
      robot.x += ((robot.targetCell.c - robot.x) / distance) * movement;
      robot.y += ((robot.targetCell.r - robot.y) / distance) * movement;
      robot.battery = Math.max(0, robot.battery - dt * 0.85);
    }
  }
}

function snapshotWorld(world) {
  return {
    networkActive: world.networkActive,
    tasksCompleted: world.tasksCompleted,
    deadlocksAvoided: world.deadlocksAvoided,
    avgWait: world.waitSamples ? Math.max(0.3, world.totalWaitTicks / world.waitSamples / 10) : 0.8,
    robots: world.robots.map((robot) => ({
      id: robot.id,
      r: robot.r,
      c: robot.c,
      x: robot.x,
      y: robot.y,
      battery: robot.battery,
      status: robot.status,
      color: robot.color,
      target: robot.destination,
      reroutes: robot.reroutes,
    })),
    logs: world.logs.slice(),
  };
}

function Header({ view, onNetworkToggle }) {
  return (
    <header className="flex min-h-[76px] shrink-0 items-center justify-between gap-4 border-b border-white/10 bg-[#0b1728]/90 px-5 py-3 backdrop-blur-xl lg:px-7">
      <div className="flex items-center gap-3">
        <div className="relative flex h-10 w-10 items-center justify-center border border-cyan-300/50 bg-cyan-300/10 text-sm font-bold text-cyan-200 shadow-[0_0_24px_rgba(85,184,255,0.18)]">ZF</div>
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold tracking-[0.18em] text-slate-100 uppercase">
            AMR Fleet <span className="text-cyan-300">Orchestrator</span>
          </div>
          <div className="mono mt-1 text-[9px] tracking-[0.22em] text-slate-500 uppercase">Edge coordination / live digital twin</div>
        </div>
      </div>
      <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] font-semibold tracking-[0.14em] text-slate-400 uppercase md:flex">
        <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_10px_#72e6a5]" />
        {view.robots.filter((robot) => robot.status !== 'Idle').length} active agents
      </div>
      <button
        type="button"
        onClick={onNetworkToggle}
        className={`network-pulse flex items-center gap-2 border px-3 py-2 text-[10px] font-bold tracking-[0.14em] uppercase transition ${view.networkActive ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-200' : 'border-red-300/50 bg-red-400/10 text-red-200'}`}
      >
        <span className={`h-2 w-2 rounded-full ${view.networkActive ? 'bg-emerald-300 shadow-[0_0_10px_#72e6a5]' : 'bg-red-400 shadow-[0_0_10px_#f87171]'}`} />
        {view.networkActive ? 'Broker live' : 'Kill network'}
      </button>
    </header>
  );
}

function Metric({ label, value, accent = 'text-slate-100' }) {
  return (
    <div className="border border-white/10 bg-white/[0.035] px-3 py-3">
      <div className="text-[9px] font-semibold tracking-[0.16em] text-slate-500 uppercase">{label}</div>
      <div className={`mono mt-1 text-xl font-bold ${accent}`}>{value}</div>
    </div>
  );
}

function Legend() {
  return (
    <div className="absolute left-4 top-4 z-10 flex flex-wrap gap-2">
      <div className="border border-white/10 bg-[#0b1728]/85 px-3 py-2 text-[10px] font-semibold tracking-[0.12em] text-slate-300 uppercase backdrop-blur">● Active node</div>
      <div className="border border-white/10 bg-[#0b1728]/85 px-3 py-2 text-[10px] font-semibold tracking-[0.12em] text-amber-200 uppercase backdrop-blur">● Negotiating</div>
      <div className="border border-lime-300/25 bg-lime-300/[0.08] px-3 py-2 text-[10px] font-semibold tracking-[0.12em] text-lime-200 uppercase backdrop-blur">▦ Charging zone</div>
    </div>
  );
}

function SimulationCanvas({ view, canvasRef, containerRef }) {
  return (
    <section ref={containerRef} className="scanlines relative min-h-0 flex-1 overflow-hidden border-r border-white/10 bg-[#081525]">
      <Legend />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-label="Live warehouse simulation" />
      <div className="pointer-events-none absolute bottom-4 left-4 flex items-center gap-3 border border-white/10 bg-[#0b1728]/80 px-3 py-2 backdrop-blur">
        <span className={`h-2 w-2 rounded-full ${view.networkActive ? 'bg-emerald-300' : 'bg-red-400'}`} />
        <span className="mono text-[10px] tracking-[0.12em] text-slate-400 uppercase">{view.networkActive ? 'Global relay available' : 'Local fail-safe rules active'}</span>
      </div>
      {!view.networkActive && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-red-950/10">
          <div className="border border-red-300/40 bg-[#0b1728]/90 px-5 py-4 text-center shadow-2xl backdrop-blur-xl">
            <div className="mono text-xs font-bold tracking-[0.2em] text-red-200 uppercase">Broker offline</div>
            <div className="mt-1 text-xs text-red-100/60">Peer reservations remain enforced locally</div>
          </div>
        </div>
      )}
    </section>
  );
}

function BatteryBar({ value }) {
  const color = value <= 20 ? '#fb7185' : value <= 45 ? '#fbbf24' : '#72e6a5';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden bg-white/10"><div className="h-full transition-all duration-500" style={{ width: `${value}%`, backgroundColor: color }} /></div>
      <span className="mono w-10 text-right text-[10px] text-slate-300">{Math.round(value)}%</span>
    </div>
  );
}

function RobotCard({ robot }) {
  const meta = STATUS_META[robot.status];
  const isAlert = robot.status === 'Negotiating' || robot.status === 'Charging';
  return (
    <article className={`border bg-[#0d1b2d]/90 p-3 transition ${isAlert ? 'border-amber-300/30' : 'border-white/10'}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: robot.color, boxShadow: `0 0 12px ${robot.color}` }} />
          <div>
            <div className="mono text-xs font-bold text-slate-100">R{String(robot.id).padStart(2, '0')}</div>
            <div className="text-[9px] tracking-[0.12em] text-slate-500 uppercase">Edge node / local planner</div>
          </div>
        </div>
        <span className="flex items-center gap-1 text-[9px] font-bold tracking-[0.12em] uppercase" style={{ color: meta.color }}>
          {(robot.status === 'Charging' || robot.status === 'Negotiating') && <span className="pulse-ring h-1.5 w-1.5 rounded-full" style={{ backgroundColor: meta.color }} />}
          {meta.label}
        </span>
      </div>
      <div className="mt-3">
        <div className="mb-1 flex justify-between text-[9px] tracking-[0.12em] text-slate-500 uppercase"><span>Battery reserve</span><span className={robot.battery <= 20 ? 'text-rose-300' : 'text-slate-400'}>{robot.battery <= 20 ? 'Recharge required' : 'Nominal'}</span></div>
        <BatteryBar value={robot.battery} />
      </div>
      <div className="mt-3 flex justify-between border-t border-white/5 pt-2 text-[10px]">
        <span className="text-slate-500">Target</span>
        <span className="mono text-slate-300">{robot.target ? `[${robot.target.r}, ${robot.target.c}]` : robot.status === 'Charging' ? 'DOCKED' : 'QUEUE'}</span>
      </div>
      <div className="mt-1 flex justify-between text-[10px]"><span className="text-slate-500">Route plan</span><span className="mono text-cyan-200">{robot.reroutes ? `${robot.reroutes} remap${robot.reroutes === 1 ? '' : 's'}` : 'DIRECT'}</span></div>
    </article>
  );
}

function AdminPanel({ view, onNetworkToggle }) {
  return (
    <aside className="flex h-1/2 min-h-0 w-full shrink-0 flex-col overflow-y-auto bg-[#0a1423] lg:h-full lg:w-[370px]">
      <div className="border-b border-white/10 px-4 py-4">
        <button type="button" onClick={onNetworkToggle} className={`flex w-full items-center justify-between border px-4 py-3 text-left transition ${view.networkActive ? 'border-red-300/30 bg-red-400/[0.07] hover:bg-red-400/[0.12]' : 'network-pulse border-red-300/60 bg-red-400/10'}`}>
          <span><span className="block text-[10px] font-bold tracking-[0.18em] text-red-200 uppercase">Fault injection</span><span className="mt-1 block text-xs text-slate-400">{view.networkActive ? 'Simulate central broker loss' : 'Restore broker relay'}</span></span>
          <span className="mono text-[10px] font-bold tracking-[0.12em] text-red-200 uppercase">{view.networkActive ? 'Kill network' : 'Restore'}</span>
        </button>
      </div>
      <div className="border-b border-white/10 px-4 py-4">
        <div className="flex items-center justify-between"><div className="text-[10px] font-bold tracking-[0.18em] text-slate-300 uppercase">Fleet telemetry</div><div className="mono text-[10px] text-slate-500">05 / 05 online</div></div>
        <div className="mt-3 grid grid-cols-3 gap-2"><Metric label="Tasks done" value={view.tasksCompleted} accent="text-emerald-300" /><Metric label="Avg wait" value={`${view.avgWait.toFixed(1)}s`} accent="text-cyan-300" /><Metric label="Avoided" value={view.deadlocksAvoided} accent="text-amber-200" /></div>
      </div>
      <div className="px-4 py-4">
        <div className="mb-3 flex items-center justify-between"><div className="text-[10px] font-bold tracking-[0.18em] text-slate-300 uppercase">Robot cards</div><div className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_8px_#72e6a5]" /></div>
        <div className="grid gap-2">{view.robots.map((robot) => <RobotCard key={robot.id} robot={robot} />)}</div>
        <div className="mt-5"><div className="mb-2 flex items-center justify-between"><div className="text-[10px] font-bold tracking-[0.18em] text-slate-300 uppercase">Decision feed</div><span className="mono text-[9px] text-slate-600">LIVE / P2P</span></div><div className="max-h-[230px] min-h-[150px] space-y-2 overflow-y-auto border border-white/10 bg-[#07111f] p-3">{view.logs.slice().reverse().map((log) => <div key={log.id} className={`border-l-2 py-1 pl-3 text-[10px] leading-relaxed ${log.type === 'conflict' ? 'border-amber-300/60 text-amber-100' : log.type === 'warning' ? 'border-rose-300/60 text-rose-100' : log.type === 'success' ? 'border-emerald-300/60 text-emerald-100' : 'border-slate-600 text-slate-300'}`}><span className="mono mr-2 text-[9px] text-slate-600">{log.time}</span>{log.message}</div>)}</div></div>
      </div>
    </aside>
  );
}

function drawCanvas(canvas, world) {
  const context = canvas.getContext('2d');
  if (!context) return;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const pixelRatio = window.devicePixelRatio || 1;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);
  const cellW = width / COLS;
  const cellH = height / ROWS;

  const background = context.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, '#091b2b');
  background.addColorStop(1, '#07111f');
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  context.strokeStyle = 'rgba(120, 170, 205, 0.08)';
  context.lineWidth = 1;
  context.beginPath();
  for (let col = 0; col <= COLS; col += 1) { context.moveTo(col * cellW, 0); context.lineTo(col * cellW, height); }
  for (let row = 0; row <= ROWS; row += 1) { context.moveTo(0, row * cellH); context.lineTo(width, row * cellH); }
  context.stroke();

  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const value = world.grid[r][c];
      if (value === 1) {
        context.fillStyle = '#24364a';
        context.fillRect(c * cellW + 2, r * cellH + 2, cellW - 4, cellH - 4);
        context.fillStyle = '#36526a';
        context.fillRect(c * cellW + 2, r * cellH + 2, cellW - 4, Math.max(2, cellH * 0.12));
        context.fillStyle = 'rgba(9, 18, 31, 0.35)';
        context.fillRect(c * cellW + cellW * 0.2, r * cellH + cellH * 0.38, cellW * 0.6, cellH * 0.28);
      } else if (value === 2) {
        context.fillStyle = 'rgba(114, 230, 165, 0.17)';
        context.fillRect(c * cellW + 1, r * cellH + 1, cellW - 2, cellH - 2);
        context.strokeStyle = 'rgba(190, 255, 154, 0.42)';
        context.strokeRect(c * cellW + 1.5, r * cellH + 1.5, cellW - 3, cellH - 3);
      }
    }
  }

  context.fillStyle = 'rgba(85, 184, 255, 0.08)';
  context.fillRect(0, 0, width, cellH * 2);
  context.fillStyle = 'rgba(255, 141, 112, 0.09)';
  context.fillRect(0, height - cellH * 2, width, cellH * 2);
  context.fillStyle = 'rgba(215, 235, 255, 0.65)';
  context.font = `bold ${Math.max(8, Math.min(11, cellW * 0.62))}px Space Mono`;
  context.textAlign = 'left';
  context.fillText('INBOUND / STAGING', cellW, cellH * 1.25);
  context.fillStyle = 'rgba(255, 194, 166, 0.72)';
  context.fillText('OUTBOUND / LOADING', cellW, height - cellH * 0.72);

  context.fillStyle = 'rgba(150, 185, 215, 0.35)';
  context.font = `${Math.max(7, Math.min(9, cellW * 0.52))}px Space Mono`;
  context.textAlign = 'center';
  [5, 13, 21].forEach((col, index) => context.fillText(`AISLE ${index + 1}`, col * cellW, height - cellH * 2.65));

  context.strokeStyle = 'rgba(190, 255, 154, 0.7)';
  context.lineWidth = 1.5;
  context.strokeRect(CHARGING_ZONE.minCol * cellW + 1, CHARGING_ZONE.minRow * cellH + 1, 3 * cellW - 2, 3 * cellH - 2);
  context.fillStyle = 'rgba(205, 255, 176, 0.8)';
  context.font = `bold ${Math.max(8, Math.min(11, cellW * 0.6))}px Space Mono`;
  context.textAlign = 'center';
  context.fillText('CHARGE', (CHARGING_ZONE.minCol + 1.5) * cellW, (CHARGING_ZONE.minRow + 1.7) * cellH);

  for (const robot of world.robots) {
    const x = (robot.x + 0.5) * cellW;
    const y = (robot.y + 0.5) * cellH;
    if (robot.destination && robot.status !== 'Charging') {
      const destinationX = (robot.destination.c + 0.5) * cellW;
      const destinationY = (robot.destination.r + 0.5) * cellH;
      context.save();
      context.translate(destinationX, destinationY);
      context.rotate(Math.PI / 4);
      context.strokeStyle = `${robot.color}a0`;
      context.lineWidth = 1.5;
      context.strokeRect(-cellW * 0.22, -cellH * 0.22, cellW * 0.44, cellH * 0.44);
      context.restore();
    }
    if (robot.targetCell && robot.status !== 'Charging') {
      context.beginPath();
      context.moveTo(x, y);
      const route = [robot.targetCell, ...robot.path];
      route.forEach((cell) => context.lineTo((cell.c + 0.5) * cellW, (cell.r + 0.5) * cellH));
      context.setLineDash([4, 5]);
      context.strokeStyle = `${robot.color}70`;
      context.lineWidth = robot.reroutes > 0 ? 2 : 1.5;
      context.stroke();
      context.setLineDash([]);
    }
  }

  for (const robot of world.robots) {
    const x = (robot.x + 0.5) * cellW;
    const y = (robot.y + 0.5) * cellH;
    const radius = Math.min(cellW, cellH) * 0.29;
    context.save();
    context.shadowBlur = robot.status === 'Negotiating' || robot.status === 'Charging' ? 18 : 10;
    context.shadowColor = robot.color;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fillStyle = robot.color;
    context.fill();
    context.shadowBlur = 0;
    context.beginPath();
    context.arc(x, y, radius * 0.4, 0, Math.PI * 2);
    context.fillStyle = '#07111f';
    context.fill();
    context.fillStyle = '#effaff';
    context.font = `bold ${Math.max(8, Math.min(11, radius * 0.7))}px Space Mono`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(`R${robot.id}`, x, y);
    if (robot.peerTarget && robot.status !== 'Charging') {
      context.fillStyle = '#ffca5c';
      context.font = `bold ${Math.max(7, Math.min(9, radius * 0.58))}px Space Mono`;
      context.fillText('REROUTE', x, y - radius - 8);
    }
    context.restore();
  }
}

export default function App() {
  const worldRef = useRef(createWorld());
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [view, setView] = useState(() => snapshotWorld(worldRef.current));

  useEffect(() => {
    const world = worldRef.current;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    let frameId;
    let lastTime = performance.now();
    let accumulator = 0;
    let lastSnapshot = 0;

    const resizeCanvas = () => {
      if (!canvas || !container) return;
      const rect = container.getBoundingClientRect();
      const pixelRatio = window.devicePixelRatio || 1;
      const nextWidth = Math.max(1, Math.floor(rect.width * pixelRatio));
      const nextHeight = Math.max(1, Math.floor(rect.height * pixelRatio));
      if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
        canvas.width = nextWidth;
        canvas.height = nextHeight;
      }
    };
    const resizeObserver = new ResizeObserver(resizeCanvas);
    if (container) resizeObserver.observe(container);
    resizeCanvas();

    const frame = (time) => {
      const dt = Math.min(0.08, (time - lastTime) / 1000);
      lastTime = time;
      accumulator += dt;
      if (accumulator >= 0.08) {
        advanceSimulation(world, accumulator, time);
        accumulator = 0;
      }
      if (canvas) drawCanvas(canvas, world);
      if (time - lastSnapshot > 180) {
        setView(snapshotWorld(world));
        lastSnapshot = time;
      }
      frameId = requestAnimationFrame(frame);
    };
    frameId = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
    };
  }, []);

  const toggleNetwork = () => {
    const world = worldRef.current;
    world.networkActive = !world.networkActive;
    if (world.networkActive) {
      addLog(world, 'Central broker restored. Global telemetry is available again.', 'success');
    } else {
      addLog(world, 'CRITICAL: Broker offline. All agents switched to local fail-safe mode.', 'warning');
      addLog(world, 'Reservation table retained in memory. Conservative stop-and-wait enforced.', 'conflict');
    }
    setView(snapshotWorld(world));
  };

  return (
    <main className="flex h-screen min-h-0 flex-col overflow-hidden bg-[#07111f] text-slate-200">
      <Header view={view} onNetworkToggle={toggleNetwork} />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        <SimulationCanvas view={view} canvasRef={canvasRef} containerRef={containerRef} />
        <AdminPanel view={view} onNetworkToggle={toggleNetwork} />
      </div>
    </main>
  );
}
