export const PLAYER_HALF_WIDTH = 0.32;
export const STAND_HEIGHT = 1.8;
export const SLIDE_HEIGHT = 1.0;
export const STAND_EYE_HEIGHT = 1.65;
export const SLIDE_EYE_HEIGHT = 0.8;

const EPSILON = 0.0005;
const MAX_STEP_HEIGHT = 0.6;
const GRAVITY = 26;
const JUMP_SPEED = 9.4;
const WALK_SPEED = 6.5;
const SPRINT_SPEED = 10.5;
const CROUCH_SPEED = 3.2;
const MAX_HORIZONTAL_SPEED = 20;
const WALL_RUN_MIN_SPEED = 5;
const WALL_RUN_MAX_TIME = 2.2;
const CLIMB_MAX_TIME = 0.85;
const MANTLE_REACH = 2.15;
const WALL_PROBE_DISTANCE = 0.16;

export const PlayerState = {
  RUNNING: 0,
  AIRBORNE: 1,
  WALL_RUNNING: 2,
  CLIMBING: 3,
  MANTLING: 4,
  SLIDING: 5,
};

const PROBE_DIRECTIONS = [
  { x: 1, z: 0 },
  { x: -1, z: 0 },
  { x: 0, z: 1 },
  { x: 0, z: -1 },
];
const NO_HITS = [];

export function createPlayer(spawn = { x: 0, y: 0.05, z: 0 }) {
  return {
    position: { x: spawn.x, y: spawn.y, z: spawn.z },
    velocity: { x: 0, y: 0, z: 0 },
    yaw: 0,
    pitch: 0,
    height: STAND_HEIGHT,
    eyeHeight: STAND_EYE_HEIGHT,
    onGround: false,
    canStepUp: false,
    coyoteTime: 0,
    jumpBuffer: 0,
    crouching: false,
    sliding: false,
    slideTime: 0,
    wall: null,
    wallRunTime: 0,
    wallCooldown: 0,
    lastWallKey: '',
    climbing: false,
    climbTime: 0,
    climbNormal: null,
    climbUsed: false,
    mantle: null,
    roll: 0,
    state: PlayerState.AIRBORNE,
    speed: 0,
  };
}

function overlaps(centerX, feetY, centerZ, height, box) {
  return (
    centerX - PLAYER_HALF_WIDTH < box.max.x && centerX + PLAYER_HALF_WIDTH > box.min.x &&
    feetY < box.max.y && feetY + height > box.min.y &&
    centerZ - PLAYER_HALF_WIDTH < box.max.z && centerZ + PLAYER_HALF_WIDTH > box.min.z
  );
}

export function anyOverlap(centerX, feetY, centerZ, height, boxes) {
  return boxes.some((box) => overlaps(centerX, feetY, centerZ, height, box));
}

function probeWalls(player, boxes) {
  const hits = [];
  const { x: playerX, y: feetY, z: playerZ } = player.position;
  for (const direction of PROBE_DIRECTIONS) {
    const extentX = PLAYER_HALF_WIDTH + (direction.x !== 0 ? WALL_PROBE_DISTANCE : 0);
    const extentZ = PLAYER_HALF_WIDTH + (direction.z !== 0 ? WALL_PROBE_DISTANCE : 0);
    let nearestBox = null;
    let nearestDistance = Infinity;
    for (const box of boxes) {
      const touchesHorizontally =
        playerX - extentX < box.max.x && playerX + extentX > box.min.x &&
        playerZ - extentZ < box.max.z && playerZ + extentZ > box.min.z;
      const touchesVertically = feetY + 0.35 < box.max.y && feetY + player.height - 0.2 > box.min.y;
      if (!touchesHorizontally || !touchesVertically) {
        continue;
      }
      let distance;
      if (direction.x > 0) {
        if (box.min.x < playerX) {
          continue;
        }
        distance = box.min.x - playerX;
      } else if (direction.x < 0) {
        if (box.max.x > playerX) {
          continue;
        }
        distance = playerX - box.max.x;
      } else if (direction.z > 0) {
        if (box.min.z < playerZ) {
          continue;
        }
        distance = box.min.z - playerZ;
      } else {
        if (box.max.z > playerZ) {
          continue;
        }
        distance = playerZ - box.max.z;
      }
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestBox = box;
      }
    }
    if (nearestBox) {
      hits.push({
        normalX: -direction.x,
        normalZ: -direction.z,
        box: nearestBox,
        key: `${-direction.x},${-direction.z}`,
      });
    }
  }
  return hits;
}

function moveHorizontally(player, axis, delta, boxes) {
  if (delta === 0) {
    return;
  }
  const position = player.position;
  position[axis] += delta;
  let collided = false;
  for (const box of boxes) {
    if (!overlaps(position.x, position.y, position.z, player.height, box)) {
      continue;
    }
    if (player.canStepUp) {
      const rise = box.max.y - position.y;
      if (rise > 0 && rise <= MAX_STEP_HEIGHT) {
        const originalY = position.y;
        position.y = box.max.y + EPSILON;
        if (!anyOverlap(position.x, position.y, position.z, player.height, boxes)) {
          continue;
        }
        position.y = originalY;
      }
    }
    position[axis] = delta > 0 ? box.min[axis] - PLAYER_HALF_WIDTH - EPSILON : box.max[axis] + PLAYER_HALF_WIDTH + EPSILON;
    collided = true;
  }
  if (collided) {
    player.velocity[axis] = 0;
  }
}

function moveVertically(player, deltaTime, boxes) {
  const position = player.position;
  position.y += player.velocity.y * deltaTime;
  player.onGround = false;
  for (const box of boxes) {
    if (!overlaps(position.x, position.y, position.z, player.height, box)) {
      continue;
    }
    if (player.velocity.y <= 0) {
      position.y = box.max.y + EPSILON;
      player.onGround = true;
    } else {
      position.y = box.min.y - player.height - EPSILON;
    }
    player.velocity.y = 0;
  }
  const restingOnSurface =
    !player.onGround && player.velocity.y <= 0.01 && anyOverlap(position.x, position.y - 0.02, position.z, player.height, boxes);
  if (restingOnSurface) {
    player.onGround = true;
  }
}

function accelerate(velocity, wishX, wishZ, targetSpeed, acceleration, deltaTime) {
  if (wishX === 0 && wishZ === 0) {
    return;
  }
  const currentSpeed = velocity.x * wishX + velocity.z * wishZ;
  const missingSpeed = targetSpeed - currentSpeed;
  if (missingSpeed <= 0) {
    return;
  }
  const boost = Math.min(acceleration * targetSpeed * deltaTime, missingSpeed);
  velocity.x += wishX * boost;
  velocity.z += wishZ * boost;
}

function wallTangent(player, wall, forwardX, forwardZ) {
  const { x: velocityX, z: velocityZ } = player.velocity;
  const intoWall = velocityX * wall.normalX + velocityZ * wall.normalZ;
  const alongX = velocityX - wall.normalX * intoWall;
  const alongZ = velocityZ - wall.normalZ * intoWall;
  const speed = Math.hypot(alongX, alongZ);
  if (speed < 0.5) {
    const forwardIntoWall = forwardX * wall.normalX + forwardZ * wall.normalZ;
    const forwardAlongX = forwardX - wall.normalX * forwardIntoWall;
    const forwardAlongZ = forwardZ - wall.normalZ * forwardIntoWall;
    const forwardLength = Math.hypot(forwardAlongX, forwardAlongZ) || 1;
    return { x: forwardAlongX / forwardLength, z: forwardAlongZ / forwardLength, speed };
  }
  return { x: alongX / speed, z: alongZ / speed, speed };
}

function endWallRun(player) {
  if (player.wall) {
    player.lastWallKey = player.wall.key;
    player.wallCooldown = 0.3;
    player.wall = null;
  }
}

function tryStartMantle(player, hit, boxes) {
  const ledgeTop = hit.box.max.y;
  const rise = ledgeTop - player.position.y;
  if (rise < 0.35 || rise > MANTLE_REACH) {
    return null;
  }
  let targetX = player.position.x;
  let targetZ = player.position.z;
  if (hit.normalX !== 0) {
    targetX = (hit.normalX > 0 ? hit.box.max.x : hit.box.min.x) - hit.normalX * 0.42;
  }
  if (hit.normalZ !== 0) {
    targetZ = (hit.normalZ > 0 ? hit.box.max.z : hit.box.min.z) - hit.normalZ * 0.42;
  }
  const targetY = ledgeTop + 0.002;
  if (anyOverlap(targetX, targetY, targetZ, STAND_HEIGHT, boxes)) {
    return null;
  }
  return {
    from: { ...player.position },
    to: { x: targetX, y: targetY, z: targetZ },
    elapsed: 0,
    duration: 0.5,
    normalX: hit.normalX,
    normalZ: hit.normalZ,
  };
}

const smoothStep = (progress) => progress * progress * (3 - 2 * progress);

function updateMantle(player, deltaTime) {
  const mantle = player.mantle;
  mantle.elapsed += deltaTime;
  const progress = Math.min(1, mantle.elapsed / mantle.duration);
  const verticalProgress = smoothStep(Math.min(1, progress / 0.6));
  const horizontalProgress = smoothStep(Math.max(0, (progress - 0.55) / 0.45));
  player.position.y = mantle.from.y + (mantle.to.y - mantle.from.y) * verticalProgress;
  player.position.x = mantle.from.x + (mantle.to.x - mantle.from.x) * horizontalProgress;
  player.position.z = mantle.from.z + (mantle.to.z - mantle.from.z) * horizontalProgress;
  player.velocity.x = 0;
  player.velocity.y = 0;
  player.velocity.z = 0;
  player.onGround = false;
  player.roll -= player.roll * Math.min(1, 9 * deltaTime);
  player.state = PlayerState.MANTLING;
  if (progress >= 1) {
    player.mantle = null;
    player.velocity.x = -mantle.normalX * 3.5;
    player.velocity.z = -mantle.normalZ * 3.5;
    player.onGround = true;
  }
}

function scaleHorizontalVelocity(velocity, factor) {
  velocity.x *= factor;
  velocity.z *= factor;
}

export function stepPlayer(player, input, deltaTime, boxes) {
  const sinYaw = Math.sin(player.yaw);
  const cosYaw = Math.cos(player.yaw);
  const forwardX = -sinYaw;
  const forwardZ = -cosYaw;
  const rightX = cosYaw;
  const rightZ = -sinYaw;
  const forwardInput = (input.forward ? 1 : 0) - (input.backward ? 1 : 0);
  const rightInput = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let wishX = forwardX * forwardInput + rightX * rightInput;
  let wishZ = forwardZ * forwardInput + rightZ * rightInput;
  const wishLength = Math.hypot(wishX, wishZ);
  if (wishLength > 0) {
    wishX /= wishLength;
    wishZ /= wishLength;
  }

  player.jumpBuffer = input.jumpPressed ? 0.15 : Math.max(0, player.jumpBuffer - deltaTime);
  player.coyoteTime = player.onGround ? 0.1 : Math.max(0, player.coyoteTime - deltaTime);
  player.wallCooldown = Math.max(0, player.wallCooldown - deltaTime);
  const targetEyeHeight = player.crouching ? SLIDE_EYE_HEIGHT : STAND_EYE_HEIGHT;
  player.eyeHeight += (targetEyeHeight - player.eyeHeight) * Math.min(1, 14 * deltaTime);

  if (player.mantle) {
    updateMantle(player, deltaTime);
    return;
  }

  const velocity = player.velocity;
  let horizontalSpeed = Math.hypot(velocity.x, velocity.z);

  if (input.slideHeld && (player.onGround || player.crouching)) {
    if (!player.crouching) {
      player.crouching = true;
      if (player.onGround && horizontalSpeed > 6.8) {
        player.sliding = true;
        player.slideTime = 0;
        const boostedSpeed = Math.min(horizontalSpeed + 1.5, 12.5);
        scaleHorizontalVelocity(velocity, boostedSpeed / horizontalSpeed);
        horizontalSpeed = boostedSpeed;
      }
    }
  } else if (player.crouching) {
    const { x: playerX, y: feetY, z: playerZ } = player.position;
    if (!anyOverlap(playerX, feetY, playerZ, STAND_HEIGHT, boxes)) {
      player.crouching = false;
      player.sliding = false;
    }
  }
  player.height = player.crouching ? SLIDE_HEIGHT : STAND_HEIGHT;

  const airborne = !player.onGround;
  const hits = airborne ? probeWalls(player, boxes) : NO_HITS;
  let frontHit = null;
  if (forwardInput > 0) {
    frontHit = hits.find((hit) => hit.normalX * forwardX + hit.normalZ * forwardZ < -0.55) ?? null;
  }

  if (airborne && frontHit && !player.wall) {
    const mantle = tryStartMantle(player, frontHit, boxes);
    if (mantle) {
      player.mantle = mantle;
      player.climbing = false;
      player.crouching = false;
      player.sliding = false;
      player.height = STAND_HEIGHT;
      velocity.x = 0;
      velocity.y = 0;
      velocity.z = 0;
      player.state = PlayerState.MANTLING;
      return;
    }
  }

  if (player.wall) {
    const stillTouching = hits.some((hit) => hit.key === player.wall.key);
    const shouldLeaveWall =
      !stillTouching || forwardInput <= 0 || horizontalSpeed < 3.5 || player.wallRunTime > WALL_RUN_MAX_TIME || player.onGround;
    if (shouldLeaveWall) {
      endWallRun(player);
    }
  }

  if (player.wall && player.jumpBuffer > 0) {
    const tangent = wallTangent(player, player.wall, forwardX, forwardZ);
    const launchSpeed = Math.max(horizontalSpeed, 8);
    velocity.x = player.wall.normalX * 6.5 + tangent.x * launchSpeed * 0.9;
    velocity.z = player.wall.normalZ * 6.5 + tangent.z * launchSpeed * 0.9;
    velocity.y = 9.2;
    endWallRun(player);
    player.jumpBuffer = 0;
    player.climbUsed = false;
  }

  const canStartWallRun =
    !player.wall && !player.climbing && airborne && forwardInput > 0 && horizontalSpeed >= WALL_RUN_MIN_SPEED;
  if (canStartWallRun) {
    for (const hit of hits) {
      if (hit.key === player.lastWallKey && player.wallCooldown > 0) {
        continue;
      }
      const approach = (velocity.x * hit.normalX + velocity.z * hit.normalZ) / horizontalSpeed;
      if (Math.abs(approach) > 0.75) {
        continue;
      }
      player.wall = { normalX: hit.normalX, normalZ: hit.normalZ, key: hit.key };
      player.wallRunTime = 0;
      if (velocity.y < 0) {
        velocity.y *= 0.2;
      }
      player.crouching = false;
      player.sliding = false;
      break;
    }
  }

  if (!player.wall) {
    if (!player.climbing && airborne && frontHit && input.jumpHeld && !player.climbUsed) {
      player.climbing = true;
      player.climbTime = 0;
      player.climbNormal = { normalX: frontHit.normalX, normalZ: frontHit.normalZ };
    }
    if (player.climbing) {
      if (!frontHit || !input.jumpHeld || player.climbTime > CLIMB_MAX_TIME || !airborne) {
        player.climbing = false;
        player.climbUsed = true;
      } else {
        const climbSpeed = 5.8 * (1 - 0.55 * (player.climbTime / CLIMB_MAX_TIME));
        velocity.x = -player.climbNormal.normalX;
        velocity.z = -player.climbNormal.normalZ;
        velocity.y = Math.max(velocity.y - 10 * deltaTime, climbSpeed);
        player.climbTime += deltaTime;
      }
    } else if (airborne && player.climbUsed && frontHit && player.jumpBuffer > 0) {
      velocity.x = frontHit.normalX * 6.5;
      velocity.z = frontHit.normalZ * 6.5;
      velocity.y = 8.5;
      player.jumpBuffer = 0;
      player.lastWallKey = frontHit.key;
      player.wallCooldown = 0.3;
    }
  }

  if (player.wall) {
    const wall = player.wall;
    const tangent = wallTangent(player, wall, forwardX, forwardZ);
    const runSpeed = Math.min(Math.max(tangent.speed, 8.5), 12.5);
    velocity.x = tangent.x * runSpeed - wall.normalX * 1.2;
    velocity.z = tangent.z * runSpeed - wall.normalZ * 1.2;
    velocity.y = Math.max(velocity.y - 7 * deltaTime, -2.4);
    player.wallRunTime += deltaTime;
  } else if (!player.climbing) {
    const sprinting = input.sprint && forwardInput > 0 && !player.crouching;
    let groundTargetSpeed = WALK_SPEED;
    if (player.crouching) {
      groundTargetSpeed = CROUCH_SPEED;
    } else if (sprinting) {
      groundTargetSpeed = SPRINT_SPEED;
    }
    if (player.onGround) {
      if (player.sliding) {
        player.slideTime += deltaTime;
        const slowedSpeed = Math.max(0, horizontalSpeed - 5.5 * deltaTime);
        if (horizontalSpeed > 0) {
          scaleHorizontalVelocity(velocity, slowedSpeed / horizontalSpeed);
        }
        if (slowedSpeed < 4 || !input.slideHeld) {
          player.sliding = false;
        }
      } else {
        if (horizontalSpeed > 0) {
          const frictionSpeed = Math.max(0, horizontalSpeed - horizontalSpeed * 9 * deltaTime - 0.05);
          scaleHorizontalVelocity(velocity, frictionSpeed / horizontalSpeed);
        }
        accelerate(velocity, wishX, wishZ, groundTargetSpeed, 10, deltaTime);
      }
    } else {
      accelerate(velocity, wishX, wishZ, sprinting ? SPRINT_SPEED : WALK_SPEED, 2.2, deltaTime);
    }
    velocity.y -= GRAVITY * deltaTime;
    if (player.jumpBuffer > 0 && (player.onGround || player.coyoteTime > 0)) {
      velocity.y = JUMP_SPEED;
      player.onGround = false;
      player.coyoteTime = 0;
      player.jumpBuffer = 0;
      player.sliding = false;
    }
  }

  const speedAfterMovement = Math.hypot(velocity.x, velocity.z);
  if (speedAfterMovement > MAX_HORIZONTAL_SPEED) {
    scaleHorizontalVelocity(velocity, MAX_HORIZONTAL_SPEED / speedAfterMovement);
  }

  player.canStepUp = player.onGround && !player.wall && !player.climbing;
  moveHorizontally(player, 'x', velocity.x * deltaTime, boxes);
  moveHorizontally(player, 'z', velocity.z * deltaTime, boxes);
  moveVertically(player, deltaTime, boxes);

  if (player.onGround) {
    player.climbUsed = false;
    player.lastWallKey = '';
    player.wallRunTime = 0;
    player.wall = null;
    player.climbing = false;
  }

  let targetRoll = 0;
  if (player.wall) {
    const side = rightX * -player.wall.normalX + rightZ * -player.wall.normalZ > 0 ? 1 : -1;
    targetRoll = side * 0.17;
  }
  player.roll += (targetRoll - player.roll) * Math.min(1, 9 * deltaTime);

  player.speed = Math.hypot(velocity.x, velocity.y, velocity.z);
  if (player.wall) {
    player.state = PlayerState.WALL_RUNNING;
  } else if (player.climbing) {
    player.state = PlayerState.CLIMBING;
  } else if (player.sliding) {
    player.state = PlayerState.SLIDING;
  } else {
    player.state = player.onGround ? PlayerState.RUNNING : PlayerState.AIRBORNE;
  }
}
