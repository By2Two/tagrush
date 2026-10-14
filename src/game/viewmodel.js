import * as THREE from 'three';
import { PlayerState } from './physics.js';

const SKIN_COLOR = 0xe3b08a;
const PANTS_COLOR = 0x1a2030;
const SHOE_COLOR = 0xf2f2f2;
const ACCENT_COLOR = 0xe8402b;

const PUNCH_DURATION = 0.4;
const UPPER_ARM_LENGTH = 0.37;
const FOREARM_LENGTH = 0.37;
const THIGH_LENGTH = 0.47;
const SHIN_LENGTH = 0.47;

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const ORIGIN = new THREE.Vector3();
const FORWARD_AXIS = new THREE.Vector3(0, 0, 1);

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const dampingFactor = (rate, deltaTime) => 1 - Math.exp(-rate * deltaTime);
const lerp = (from, target, progress) => from + (target - from) * progress;
const easeInOut = (progress) => progress * progress * (3 - 2 * progress);
const easeOut = (progress) => 1 - (1 - progress) ** 3;

const scratchDelta = new THREE.Vector3();
const scratchAxis = new THREE.Vector3();
const scratchPole = new THREE.Vector3();
const scratchAnkle = new THREE.Vector3();
const scratchCuffStart = new THREE.Vector3();
const scratchForearm = new THREE.Vector3();
const scratchUpReference = new THREE.Vector3();
const scratchPunchBack = new THREE.Vector3();
const scratchPunchFront = new THREE.Vector3();
const scratchMatrix = new THREE.Matrix4();
const scratchQuaternion = new THREE.Quaternion();

const createMaterial = (color) => new THREE.MeshLambertMaterial({ color });

function createLimb(radius, material) {
  const geometry = new THREE.BoxGeometry(radius * 1.9, 1, radius * 1.9);
  geometry.translate(0, 0.5, 0);
  return new THREE.Mesh(geometry, material);
}

function stretchBetween(mesh, start, end) {
  scratchDelta.subVectors(end, start);
  const length = Math.max(1e-4, scratchDelta.length());
  mesh.position.copy(start);
  mesh.quaternion.setFromUnitVectors(WORLD_UP, scratchDelta.multiplyScalar(1 / length));
  mesh.scale.set(1, length, 1);
}

function solveTwoBoneIk(root, target, upperLength, lowerLength, pole, jointOutput, reachOutput) {
  scratchAxis.subVectors(target, root);
  const distance = clamp(scratchAxis.length(), 0.08, (upperLength + lowerLength) * 0.998);
  scratchAxis.normalize();
  reachOutput.copy(root).addScaledVector(scratchAxis, distance);
  const projectedDistance = (upperLength * upperLength - lowerLength * lowerLength + distance * distance) / (2 * distance);
  const bendHeight = Math.sqrt(Math.max(0, upperLength * upperLength - projectedDistance * projectedDistance));
  scratchPole.copy(pole).addScaledVector(scratchAxis, -pole.dot(scratchAxis));
  if (scratchPole.lengthSq() < 1e-6) {
    scratchPole.set(1, 0, 0).addScaledVector(scratchAxis, -scratchAxis.x);
  }
  scratchPole.normalize();
  jointOutput.copy(root).addScaledVector(scratchAxis, projectedDistance).addScaledVector(scratchPole, bendHeight);
}

export class Hand {
  constructor(side, skin = createMaterial(SKIN_COLOR)) {
    this.group = new THREE.Group();
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.045, 0.09), skin);
    palm.position.z = -0.045;
    const fingers = new THREE.Group();
    fingers.position.set(0, 0.005, -0.09);
    const fingerBlock = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.036, 0.07), skin);
    fingerBlock.position.z = -0.035;
    fingers.add(fingerBlock);
    const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.05), skin);
    thumb.position.set(-side * 0.055, 0, -0.05);
    this.fingers = fingers;
    this.thumb = thumb;
    this.group.add(palm, fingers, thumb);
    this.group.scale.setScalar(1.25);
  }

  setCurl(curl) {
    this.fingers.rotation.x = -curl * 1.45;
    this.thumb.position.z = -0.05 - (1 - curl) * 0.02;
  }
}

class Arm {
  constructor(side, sleeve, accent) {
    this.side = side;
    this.shoulder = new THREE.Vector3(side * 0.27, -0.27, 0.03);
    this.upperArm = createLimb(0.052, sleeve);
    this.forearm = createLimb(0.045, sleeve);
    this.cuff = createLimb(0.039, accent);
    this.elbowJoint = new THREE.Mesh(new THREE.BoxGeometry(0.088, 0.088, 0.088), sleeve);
    this.shoulderJoint = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), sleeve);
    this.hand = new Hand(side);
    this.pole = new THREE.Vector3(side * 0.6, -1, 0.3);
    this.targetPosition = new THREE.Vector3(side * 0.2, -0.27, -0.42);
    this.currentPosition = this.targetPosition.clone();
    this.finalPosition = new THREE.Vector3();
    this.targetCurl = 0.35;
    this.curl = 0.35;
    this.targetRoll = 0;
    this.roll = 0;
    this.targetPole = this.pole.clone();
    this.elbow = new THREE.Vector3();
    this.wrist = new THREE.Vector3();
    this.shoulderJoint.position.copy(this.shoulder);
    this.meshes = [this.upperArm, this.forearm, this.cuff, this.elbowJoint, this.shoulderJoint, this.hand.group];
  }

  apply(handPosition, curl, roll) {
    solveTwoBoneIk(this.shoulder, handPosition, UPPER_ARM_LENGTH, FOREARM_LENGTH, this.pole, this.elbow, this.wrist);
    stretchBetween(this.upperArm, this.shoulder, this.elbow);
    stretchBetween(this.forearm, this.elbow, this.wrist);
    scratchForearm.subVectors(this.wrist, this.elbow).normalize();
    scratchCuffStart.copy(this.wrist).addScaledVector(scratchForearm, -0.07);
    stretchBetween(this.cuff, scratchCuffStart, this.wrist);
    this.elbowJoint.position.copy(this.elbow);

    const pointingUp = clamp((scratchForearm.y - 0.55) / 0.35, 0, 1);
    scratchUpReference.set(0, 1 - pointingUp, pointingUp).normalize();
    scratchMatrix.lookAt(ORIGIN, scratchForearm, scratchUpReference);
    this.hand.group.quaternion.setFromRotationMatrix(scratchMatrix);
    scratchQuaternion.setFromAxisAngle(FORWARD_AXIS, roll);
    this.hand.group.quaternion.multiply(scratchQuaternion);
    this.hand.group.position.copy(this.wrist);
    this.hand.setCurl(curl);
  }
}

class Leg {
  constructor(side, pants) {
    this.side = side;
    this.thigh = createLimb(0.088, pants);
    this.shin = createLimb(0.064, pants);
    this.kneeJoint = new THREE.Mesh(new THREE.BoxGeometry(0.125, 0.125, 0.125), pants);
    this.shoe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.27), createMaterial(SHOE_COLOR));
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.104, 0.02, 0.274), createMaterial(ACCENT_COLOR));
    sole.position.y = -0.04;
    this.shoe.add(sole);
    this.hip = new THREE.Vector3(side * 0.1, 0.9, 0.04);
    this.pole = new THREE.Vector3(0, 0.1, -1);
    this.currentPosition = new THREE.Vector3(side * 0.11, 0, 0);
    this.targetPosition = this.currentPosition.clone();
    this.targetPole = this.pole.clone();
    this.tilt = 0;
    this.targetTilt = 0;
    this.knee = new THREE.Vector3();
    this.ankle = new THREE.Vector3();
    this.meshes = [this.thigh, this.shin, this.kneeJoint, this.shoe];
  }

  apply() {
    const ankleTarget = scratchAnkle.copy(this.currentPosition);
    ankleTarget.y += 0.075;
    solveTwoBoneIk(this.hip, ankleTarget, THIGH_LENGTH, SHIN_LENGTH, this.pole, this.knee, this.ankle);
    stretchBetween(this.thigh, this.hip, this.knee);
    stretchBetween(this.shin, this.knee, this.ankle);
    this.kneeJoint.position.copy(this.knee);
    this.shoe.position.set(this.ankle.x, this.ankle.y - 0.03, this.ankle.z - 0.06);
    this.shoe.rotation.x = this.tilt;
  }
}

export class FirstPersonRig {
  constructor({ body, armParent, sleeve, torsoOffsetZ = 0.14 }) {
    this.body = body;
    this.sleeve = sleeve;
    this.torsoOffsetZ = torsoOffsetZ;
    const accent = createMaterial(ACCENT_COLOR);
    const pants = createMaterial(PANTS_COLOR);

    this.arms = [new Arm(-1, sleeve, accent), new Arm(1, sleeve, accent)];
    for (const arm of this.arms) {
      for (const mesh of arm.meshes) {
        armParent.add(mesh);
      }
    }

    this.legs = [new Leg(-1, pants), new Leg(1, pants)];
    for (const leg of this.legs) {
      for (const mesh of leg.meshes) {
        body.add(mesh);
      }
    }
    this.torso = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.74, 0.24), sleeve);
    this.pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.17, 0.22), pants);
    body.add(this.torso, this.pelvis);

    this.elapsed = 0;
    this.punchTimes = [-1, -1];
    this.lookVelocityX = 0;
    this.lookVelocityY = 0;
    this.swayX = 0;
    this.swayY = 0;
    this.kick = { roll: 0, fov: 0 };
  }

  punch(side) {
    this.punchTimes[side] = 0;
  }

  update(deltaTime, motion) {
    this.elapsed += deltaTime;
    const elapsed = this.elapsed;
    const speedFactor = clamp(motion.speed / 9, 0, 1.3);
    const gaitPhase = motion.bobTime * 2;

    let wallRight = 0;
    let wallForward = 0;
    let wallSide = 1;
    if (motion.wall) {
      const sinYaw = Math.sin(motion.yaw);
      const cosYaw = Math.cos(motion.yaw);
      const towardWallX = -motion.wall.normalX;
      const towardWallZ = -motion.wall.normalZ;
      wallRight = towardWallX * cosYaw - towardWallZ * sinYaw;
      wallForward = -towardWallX * sinYaw - towardWallZ * cosYaw;
      wallSide = wallRight >= 0 ? 1 : -1;
    }

    const targetSwayX = clamp(-this.lookVelocityX * 0.0014, -0.07, 0.07);
    const targetSwayY = clamp(this.lookVelocityY * 0.0014, -0.05, 0.05);
    this.lookVelocityX = 0;
    this.lookVelocityY = 0;
    this.swayX += (targetSwayX - this.swayX) * dampingFactor(12, deltaTime);
    this.swayY += (targetSwayY - this.swayY) * dampingFactor(12, deltaTime);

    this.kick.roll = 0;
    this.kick.fov = 0;
    this.arms.forEach((arm, armIndex) => {
      this.animateArm(arm, armIndex, { deltaTime, elapsed, speedFactor, gaitPhase, wallSide, motion });
    });

    const hipHeight = clamp(motion.eyeHeight - 0.74, 0.3, 1.0);
    const shoulderHeight = motion.eyeHeight - 0.3;
    this.torso.position.set(0, (hipHeight + shoulderHeight) / 2, this.torsoOffsetZ);
    this.torso.scale.y = (shoulderHeight - hipHeight) / 0.74;
    this.pelvis.position.set(0, hipHeight, this.torsoOffsetZ - 0.04);

    for (const leg of this.legs) {
      this.animateLeg(leg, { deltaTime, elapsed, speedFactor, gaitPhase, hipHeight, wallRight, wallForward, motion });
    }
  }

  animateArm(arm, armIndex, { deltaTime, elapsed, speedFactor, gaitPhase, wallSide, motion }) {
    const side = arm.side;
    const armPhase = gaitPhase + (side > 0 ? 0 : Math.PI);
    let followRate = 20;

    arm.targetPosition.set(side * 0.2, -0.27 + Math.sin(elapsed * 1.6 + side) * 0.004, -0.42);
    arm.targetCurl = 0.35;
    arm.targetRoll = -side * 0.25;
    arm.targetPole.set(side * 0.6, -1, 0.3);

    if (motion.mantleProgress >= 0) {
      const progress = easeInOut(motion.mantleProgress);
      arm.targetPosition.set(side * 0.24, lerp(-0.02, -0.48, progress), lerp(-0.62, -0.5, progress));
      arm.targetCurl = 0;
      arm.targetRoll = 0;
      arm.targetPole.set(side * 0.8, -0.4, 0.4);
      followRate = 26;
    } else if (motion.state === PlayerState.CLIMBING) {
      const reach = Math.sin(elapsed * 7 + (side > 0 ? 0 : Math.PI));
      arm.targetPosition.set(side * 0.17, 0.07 + reach * 0.2, -0.5 - Math.max(0, reach) * 0.06);
      arm.targetCurl = reach > 0.7 ? 0.85 : 0.1;
      arm.targetRoll = 0;
      arm.targetPole.set(side * 0.8, -1, 0.2);
      followRate = 30;
    } else if (motion.state === PlayerState.WALL_RUNNING) {
      if (side === wallSide) {
        arm.targetPosition.set(side * 0.5, -0.1 + Math.sin(elapsed * 10) * 0.02, -0.36 + Math.sin(elapsed * 9) * 0.07);
        arm.targetCurl = 0;
        arm.targetRoll = side * Math.PI * 0.48;
        arm.targetPole.set(side * 0.3, -1, 0.5);
      } else {
        arm.targetPosition.set(side * 0.17, -0.3, -0.28);
        arm.targetCurl = 0.9;
        arm.targetRoll = -side * 0.2;
      }
      followRate = 24;
    } else if (motion.state === PlayerState.SLIDING) {
      arm.targetPosition.set(side * 0.25, -0.36 + Math.sin(elapsed * 5 + side) * 0.01, -0.3);
      arm.targetCurl = 0.6;
      arm.targetRoll = -side * 0.2;
      arm.targetPole.set(side * 0.8, -1, 0.1);
    } else if (motion.state === PlayerState.AIRBORNE) {
      const fall = clamp(-motion.verticalSpeed / 10, 0, 1);
      arm.targetPosition.set(
        side * lerp(0.22, 0.34, fall),
        lerp(-0.2, 0.0, fall) + Math.sin(elapsed * 3 + side) * 0.01,
        lerp(-0.5, -0.45, fall)
      );
      arm.targetCurl = lerp(0.8, 0.2, fall);
      arm.targetRoll = -side * lerp(0.2, 0.55, fall);
    } else if (speedFactor > 0.05) {
      const swingFactor = Math.min(1, speedFactor * 3);
      arm.targetPosition.set(
        side * (0.2 - 0.04 * speedFactor),
        -0.27 + Math.cos(armPhase) * 0.05 * speedFactor * swingFactor - 0.02 * speedFactor,
        -0.42 + Math.sin(armPhase) * 0.2 * speedFactor * swingFactor
      );
      arm.targetCurl = lerp(0.35, 0.95, Math.min(1, speedFactor));
    }

    arm.currentPosition.lerp(arm.targetPosition, dampingFactor(followRate, deltaTime));
    arm.curl += (arm.targetCurl - arm.curl) * dampingFactor(18, deltaTime);
    arm.roll += (arm.targetRoll - arm.roll) * dampingFactor(18, deltaTime);
    arm.pole.lerp(arm.targetPole, dampingFactor(14, deltaTime));

    arm.finalPosition.copy(arm.currentPosition);
    arm.finalPosition.x += this.swayX;
    arm.finalPosition.y += this.swayY;
    let curl = arm.curl;
    let roll = arm.roll;

    const punchTime = this.punchTimes[armIndex];
    if (punchTime >= 0) {
      const progress = punchTime / PUNCH_DURATION;
      const back = scratchPunchBack.set(side * 0.34, -0.36, -0.14);
      const front = scratchPunchFront.set(side * 0.05, -0.09, -0.7);
      if (progress < 0.2) {
        const blend = easeInOut(progress / 0.2);
        arm.finalPosition.lerp(back, blend);
        curl = lerp(curl, 0.95, blend);
        roll = lerp(roll, -side * 0.3, blend);
      } else if (progress < 0.45) {
        const blend = easeOut((progress - 0.2) / 0.25);
        arm.finalPosition.copy(back).lerp(front, blend);
        curl = lerp(0.95, 0, blend);
        roll = lerp(-side * 0.3, -side * 0.9, blend);
        this.addPunchKick(side, progress);
      } else if (progress < 0.6) {
        arm.finalPosition.copy(front);
        curl = 0.05;
        roll = -side * 0.9;
        this.addPunchKick(side, progress);
      } else {
        const blend = easeInOut((progress - 0.6) / 0.4);
        arm.finalPosition.copy(front).lerp(arm.currentPosition, blend);
        curl = lerp(0.05, arm.curl, blend);
        roll = lerp(-side * 0.9, arm.roll, blend);
      }
      this.punchTimes[armIndex] += deltaTime;
      if (this.punchTimes[armIndex] >= PUNCH_DURATION) {
        this.punchTimes[armIndex] = -1;
      }
    }

    arm.apply(arm.finalPosition, curl, roll);
  }

  addPunchKick(side, progress) {
    const envelope = Math.sin(clamp((progress - 0.2) / 0.4, 0, 1) * Math.PI);
    this.kick.roll += side * envelope * 0.04;
    this.kick.fov += envelope * 3.5;
  }

  animateLeg(leg, { deltaTime, elapsed, speedFactor, gaitPhase, hipHeight, wallRight, wallForward, motion }) {
    const side = leg.side;
    const legPhase = gaitPhase + (side > 0 ? 0 : Math.PI);
    let followRate = 40;
    leg.hip.set(side * 0.1, hipHeight, 0.05);

    leg.targetPosition.set(side * 0.11, 0, -0.02);
    leg.targetPole.set(0, 0.1, -1);
    leg.targetTilt = 0;

    if (motion.mantleProgress >= 0) {
      const progress = easeInOut(motion.mantleProgress);
      leg.targetPosition.set(side * 0.12, 0.2 + progress * 0.45 * (side > 0 ? 1 : 0.6), -0.35);
      leg.targetPole.set(0, 0.5, -1);
      leg.targetTilt = -0.3;
    } else if (motion.state === PlayerState.CLIMBING) {
      const reach = Math.sin(elapsed * 7 + (side > 0 ? Math.PI : 0));
      leg.targetPosition.set(side * 0.12, 0.28 + Math.max(0, reach) * 0.32, -0.38);
      leg.targetPole.set(0, 0.6, -1);
      leg.targetTilt = -0.3;
    } else if (motion.state === PlayerState.WALL_RUNNING) {
      const wallSide = wallRight >= 0 ? 1 : -1;
      const pedalPhase = elapsed * 12 + (side > 0 ? 0 : Math.PI);
      const pedalSwing = Math.sin(pedalPhase);
      const lift = Math.max(0, -Math.cos(pedalPhase));
      if (side === wallSide) {
        leg.targetPosition.set(wallRight * 0.42, 0.45 + lift * 0.12, -wallForward * 0.42 - 0.05 - pedalSwing * 0.14);
        leg.targetPole.set(-wallRight * 0.5, 0.3, -1);
      } else {
        leg.targetPosition.set(-wallRight * 0.1 + side * 0.05, 0.25 + lift * 0.12, 0.28 - pedalSwing * 0.14);
        leg.targetPole.set(0, 0.2, -1);
      }
      leg.targetTilt = -0.4 - lift * 0.2;
      followRate = 50;
    } else if (motion.state === PlayerState.SLIDING) {
      const leadingLeg = side > 0;
      leg.targetPosition.set(side * 0.12, 0.1 + (leadingLeg ? 0.06 : 0), -(leadingLeg ? 0.64 : 0.72));
      leg.targetPole.set(0, 1, 0);
      leg.targetTilt = 0.6;
      followRate = 20;
    } else if (motion.state === PlayerState.AIRBORNE) {
      const tuck = clamp(0.5 + motion.verticalSpeed / 10, 0.1, 1);
      leg.targetPosition.set(side * 0.12, lerp(0.08, 0.5, tuck), (side > 0 ? -1 : 1) * 0.25 * tuck - 0.05);
      leg.targetPole.set(0, 0.3, -1);
      leg.targetTilt = -0.7 * tuck;
      followRate = 18;
    } else if (speedFactor > 0.05) {
      const swingFactor = Math.min(1, speedFactor * 3);
      const stride = 0.55 * Math.min(1.2, speedFactor) * swingFactor;
      const lift = Math.max(0, -Math.cos(legPhase));
      leg.targetPosition.set(side * 0.11, lift * 0.28 * speedFactor, -Math.sin(legPhase) * stride * 0.5 - 0.02);
      leg.targetTilt = -lift * 0.5;
      followRate = 60;
    }

    leg.currentPosition.lerp(leg.targetPosition, dampingFactor(followRate, deltaTime));
    leg.pole.lerp(leg.targetPole, dampingFactor(14, deltaTime));
    leg.tilt += (leg.targetTilt - leg.tilt) * dampingFactor(20, deltaTime);
    leg.apply();
  }
}

export class ViewModel {
  constructor(camera) {
    this.scene = new THREE.Scene();
    this.scene.add(camera);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8892a0, 2.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.7);
    sun.position.set(2, 5, 3);
    this.scene.add(sun);
    this.sleeve = createMaterial(0x2d6cdf);
    this.body = new THREE.Group();
    this.scene.add(this.body);
    this.rig = new FirstPersonRig({ body: this.body, armParent: camera, sleeve: this.sleeve });
    this.kick = this.rig.kick;
  }

  setColor(hex) {
    this.sleeve.color.setHex(hex);
  }

  look(deltaX, deltaY) {
    this.rig.lookVelocityX += deltaX;
    this.rig.lookVelocityY += deltaY;
  }

  punch(side) {
    this.rig.punch(side);
  }

  update(deltaTime, motion) {
    this.body.position.set(motion.x, motion.cameraY, motion.z);
    this.body.rotation.y = motion.yaw;
    this.rig.update(deltaTime, motion);
  }

  dispose() {
    this.scene.traverse((object) => {
      if (object.geometry) {
        object.geometry.dispose();
      }
      if (object.material) {
        object.material.dispose();
      }
    });
    for (const arm of this.rig.arms) {
      for (const mesh of arm.meshes) {
        mesh.traverse((object) => {
          if (object.geometry) {
            object.geometry.dispose();
          }
        });
      }
    }
  }
}
