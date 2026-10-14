import { createPlayer, stepPlayer, anyOverlap, STAND_HEIGHT, PlayerState } from '../src/game/physics.js';
import { SOLIDS, SPAWNS } from '../src/game/map.js';

let failures = 0;

function check(condition, description) {
  console.log(`${condition ? 'PASS' : 'FAIL'} ${description}`);
  if (!condition) {
    failures++;
  }
}

function simulate(player, seconds, inputAt, deltaTime = 1 / 120) {
  const statesSeen = new Set();
  let elapsed = 0;
  let highestY = player.position.y;
  while (elapsed < seconds) {
    const input = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      jumpHeld: false,
      jumpPressed: false,
      sprint: false,
      slideHeld: false,
      ...inputAt(elapsed, player),
    };
    stepPlayer(player, input, deltaTime, SOLIDS);
    statesSeen.add(player.state);
    highestY = Math.max(highestY, player.position.y);
    elapsed += deltaTime;
  }
  return { statesSeen, highestY };
}

function settle(player) {
  simulate(player, 0.5, () => ({}));
}

SPAWNS.forEach((spawn, index) => {
  check(!anyOverlap(spawn.x, spawn.y, spawn.z, STAND_HEIGHT, SOLIDS), `spawn ${index} is free`);
});

{
  const player = createPlayer({ x: 0, y: 3, z: 40 });
  settle(player);
  check(player.onGround && Math.abs(player.position.y) < 0.01, `lands on the floor y=${player.position.y.toFixed(3)}`);
}

{
  const player = createPlayer({ x: -27, y: 0.05, z: 4 });
  settle(player);
  player.yaw = 0.3;
  const { statesSeen } = simulate(player, 2.0, (elapsed) => ({
    forward: true,
    sprint: true,
    jumpPressed: elapsed > 0.6 && elapsed < 0.62,
  }));
  check(statesSeen.has(PlayerState.WALL_RUNNING), `wall run starts (states: ${[...statesSeen]})`);
}

{
  const player = createPlayer({ x: -12, y: 0.05, z: 0 });
  settle(player);
  player.yaw = -Math.PI / 2;
  const { statesSeen } = simulate(player, 2.5, (elapsed) => ({
    forward: true,
    sprint: true,
    jumpPressed: elapsed > 0.55 && elapsed < 0.57,
    jumpHeld: elapsed > 0.55,
  }));
  check(statesSeen.has(PlayerState.CLIMBING) || statesSeen.has(PlayerState.MANTLING), `climbs or mantles (states: ${[...statesSeen]})`);
  check(player.position.y > 5.9, `reaches the tower top y=${player.position.y.toFixed(2)}`);
}

{
  const player = createPlayer({ x: 0, y: 0.05, z: 24 });
  settle(player);
  player.yaw = 0;
  simulate(player, 4, () => ({ forward: true }));
  check(player.position.y > 5.4, `climbs the stairs y=${player.position.y.toFixed(2)}`);
}

{
  const player = createPlayer({ x: 30, y: 0.05, z: 20 });
  settle(player);
  player.yaw = Math.PI / 2;
  const { statesSeen } = simulate(player, 1.2, (elapsed) => ({ forward: true, sprint: true, slideHeld: elapsed > 0.8 }));
  check(statesSeen.has(PlayerState.SLIDING), `slides (states: ${[...statesSeen]})`);
}

{
  const player = createPlayer({ x: -14, y: 0.05, z: 0 });
  settle(player);
  player.yaw = 0;
  player.position.z = 6;
  const { statesSeen, highestY } = simulate(player, 2.5, (elapsed) => ({
    forward: true,
    sprint: true,
    jumpPressed: elapsed > 0.4 && elapsed < 0.42,
    jumpHeld: elapsed > 0.4 && elapsed < 0.9,
  }));
  check(highestY > 2.1, `mantles onto the crate highestY=${highestY.toFixed(2)} (${[...statesSeen]})`);
}

{
  const player = createPlayer({ x: 0, y: 0.05, z: 40 });
  settle(player);
  let escaped = false;
  const directionCount = 40;
  for (let directionIndex = 0; directionIndex < directionCount; directionIndex++) {
    player.yaw = (directionIndex / directionCount) * Math.PI * 2;
    simulate(player, 1.5, (elapsed) => ({
      forward: true,
      sprint: true,
      jumpPressed: Math.floor(elapsed * 2) % 2 === 0 && (elapsed * 2) % 1 < 0.02,
      jumpHeld: true,
    }));
    const { x, y, z } = player.position;
    if (Math.abs(x) > 46 || Math.abs(z) > 46 || y < -2) {
      escaped = true;
    }
  }
  check(!escaped, 'never escapes the map');
}

console.log(failures ? `\n${failures} failure(s)` : '\nall passed');
process.exit(failures ? 1 : 0);
