import * as THREE from 'three';
import { PlayerState } from './physics.js';
import { Hand } from './viewmodel.js';

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const FORWARD_AXIS = new THREE.Vector3(0, 0, 1);
const SHOULDER_OFFSETS = [new THREE.Vector3(-0.27, 0.48, 0), new THREE.Vector3(0.27, 0.48, 0)];
const ARM_REACH = 0.7;
const PUNCH_DURATION = 0.4;
const SLIDE_TORSO_LEAN = 0.55;

const createMaterial = (color, roughness = 0.8, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const lerp = (from, target, progress) => from + (target - from) * progress;
const easeInOut = (progress) => progress * progress * (3 - 2 * progress);
const easeOut = (progress) => 1 - (1 - progress) ** 3;

function createBlock(width, height, depth, material, offsetX, offsetY, offsetZ) {
  const mesh = new THREE.Mesh(UNIT_BOX, material);
  mesh.scale.set(width, height, depth);
  mesh.position.set(offsetX, offsetY, offsetZ);
  mesh.castShadow = true;
  return mesh;
}

const scratchDelta = new THREE.Vector3();
const scratchMatrix = new THREE.Matrix4();
const ORIGIN = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);

function stretchBetween(mesh, start, end, thickness) {
  scratchDelta.subVectors(end, start);
  const length = scratchDelta.length() || 1e-4;
  mesh.position.copy(start).addScaledVector(scratchDelta, 0.5);
  mesh.scale.set(thickness, thickness, length + thickness * 0.4);
  mesh.quaternion.setFromUnitVectors(FORWARD_AXIS, scratchDelta.multiplyScalar(1 / length));
}

export class BlockRig {
  constructor(color = 0x2d6cdf) {
    this.baseColor = color;
    this.shirt = createMaterial(color, 0.75);
    const pants = createMaterial(0x1d2433);
    const boots = createMaterial(0xf2f2f2, 0.6);
    const skin = createMaterial(0xe3b08a, 0.85);
    const accent = createMaterial(0xe8402b, 0.6);
    const dark = createMaterial(0x0d0f12, 0.3, 0.4);
    this.materials = [this.shirt, pants, boots, skin, accent, dark];

    this.root = new THREE.Group();
    this.tiltGroup = new THREE.Group();
    this.root.add(this.tiltGroup);

    this.pelvis = new THREE.Group();
    this.pelvis.position.y = 0.95;
    this.pelvis.add(createBlock(0.42, 0.2, 0.24, pants, 0, -0.03, 0));
    this.pelvis.add(createBlock(0.44, 0.05, 0.26, accent, 0, 0.03, 0));
    this.legs = [-1, 1].map((side) => {
      const thigh = new THREE.Group();
      thigh.position.set(side * 0.12, -0.05, 0);
      thigh.add(createBlock(0.17, 0.47, 0.2, pants, 0, -0.22, 0));
      const knee = new THREE.Group();
      knee.position.y = -0.45;
      knee.add(createBlock(0.16, 0.42, 0.19, pants, 0, -0.2, 0));
      knee.add(createBlock(0.19, 0.13, 0.29, boots, 0, -0.4, -0.04));
      knee.add(createBlock(0.195, 0.03, 0.295, accent, 0, -0.455, -0.04));
      thigh.add(knee);
      this.pelvis.add(thigh);
      return { thigh, knee };
    });

    this.torso = new THREE.Group();
    this.torso.add(createBlock(0.44, 0.5, 0.24, this.shirt, 0, 0.3, 0));
    this.torso.add(createBlock(0.46, 0.07, 0.26, accent, 0, 0.42, 0));
    this.torso.add(createBlock(0.12, 0.08, 0.12, skin, 0, 0.58, 0));
    this.head = new THREE.Group();
    this.head.position.y = 0.6;
    this.head.add(createBlock(0.22, 0.25, 0.24, skin, 0, 0.13, 0));
    for (const side of [-1, 1]) {
      this.head.add(createBlock(0.04, 0.05, 0.02, dark, side * 0.05, 0.15, -0.125));
    }
    this.head.add(createBlock(0.24, 0.07, 0.26, accent, 0, 0.27, 0.0));
    this.head.add(createBlock(0.22, 0.03, 0.1, accent, 0, 0.24, -0.16));
    this.torso.add(this.head);
    this.armSegments = [0, 1, 2, 3].map((segmentIndex) => {
      const mesh = new THREE.Mesh(UNIT_BOX, this.shirt);
      mesh.castShadow = true;
      mesh.userData.thickness = segmentIndex % 2 === 0 ? 0.12 : 0.1;
      this.torso.add(mesh);
      return mesh;
    });
    this.hands = [-1, 1].map((side) => {
      const hand = new Hand(side, skin);
      hand.group.scale.setScalar(1.05);
      hand.group.traverse((object) => {
        if (object.isMesh) {
          object.castShadow = true;
        }
      });
      this.torso.add(hand.group);
      return hand;
    });
    this.pelvis.add(this.torso);
    this.tiltGroup.add(this.pelvis);

    this.elapsed = Math.random() * 10;
    this.stridePhase = 0;
    this.slideBlend = 0;
    this.airBlend = 0;
    this.wallBlend = 0;
    this.climbBlend = 0;
    this.punchTimes = [-1, -1];
    this.handTargets = [new THREE.Vector3(-0.3, 0.1, -0.05), new THREE.Vector3(0.3, 0.1, -0.05)];
    this.scratchTarget = new THREE.Vector3();
    this.scratchElbow = new THREE.Vector3();
  }

  setColor(hex, glowing = false) {
    this.shirt.color.setHex(hex);
    this.shirt.emissive.setHex(glowing ? 0x5a0d05 : 0x000000);
  }

  punch(side) {
    this.punchTimes[side] = 0;
  }

  update(deltaTime, motion = {}) {
    this.elapsed += deltaTime;
    const elapsed = this.elapsed;
    const blendRate = (rate) => Math.min(1, deltaTime * rate);
    const state = motion.state ?? PlayerState.RUNNING;
    const sliding = state === PlayerState.SLIDING;
    const airborne = state === PlayerState.AIRBORNE;
    const wallRunning = state === PlayerState.WALL_RUNNING;
    const mantleProgress = motion.mantleProgress ?? -1;
    const mantling = mantleProgress >= 0;
    const climbing = state === PlayerState.CLIMBING || mantling;
    const wallSide = motion.wallSide ?? 1;
    this.slideBlend += ((sliding ? 1 : 0) - this.slideBlend) * blendRate(12);
    this.airBlend += ((airborne ? 1 : 0) - this.airBlend) * blendRate(8);
    this.wallBlend += ((wallRunning ? 1 : 0) - this.wallBlend) * blendRate(10);
    this.climbBlend += ((climbing ? 1 : 0) - this.climbBlend) * blendRate(10);
    const { slideBlend, wallBlend, climbBlend, airBlend } = this;

    const speed = wallRunning ? 8 : motion.speed || 0;
    const strideAmplitude = Math.min(1, speed / 6) * 0.8 * (1 - airBlend) * (1 - climbBlend);
    this.stridePhase += speed * deltaTime * 2.1;

    this.legs.forEach(({ thigh, knee }, legIndex) => {
      const legPhase = this.stridePhase + (legIndex ? Math.PI : 0);
      const climbPhase = Math.sin(elapsed * 7 + (legIndex ? Math.PI : 0));
      thigh.rotation.x =
        lerp(0, 1.45, slideBlend) +
        Math.sin(legPhase) * strideAmplitude * (1 - slideBlend * 0.8) +
        airBlend * (legIndex ? 0.7 : 0.2) +
        climbBlend * (0.45 + Math.max(0, climbPhase) * 0.9);
      knee.rotation.x =
        lerp(0, -0.35, slideBlend) -
        Math.max(0, -Math.cos(legPhase)) * strideAmplitude * 1.3 -
        airBlend * 1.0 -
        climbBlend * (0.9 + Math.max(0, climbPhase) * 0.6);
    });
    this.pelvis.position.y = lerp(0.95, 0.42, slideBlend) - Math.abs(Math.sin(this.stridePhase)) * 0.06 * strideAmplitude;
    this.tiltGroup.rotation.z = wallSide * 0.28 * wallBlend;

    const pitch = clamp(motion.pitch || 0, -1.3, 1.3);
    const lean = Math.min(1, (motion.speed || 0) / 10) * 0.16 * (1 - slideBlend);
    this.torso.rotation.x = pitch * 0.2 + lean - slideBlend * SLIDE_TORSO_LEAN + Math.sin(elapsed * 1.6) * 0.01;
    this.head.rotation.x = clamp((pitch - this.torso.rotation.x) * 0.8, -0.8, 0.8);

    for (let handIndex = 0; handIndex < 2; handIndex++) {
      const side = handIndex ? 1 : -1;
      const target = this.scratchTarget;
      const armPhase = this.stridePhase + (side > 0 ? 0 : Math.PI);
      let followRate = 16;
      target.set(side * 0.3, 0.02 + Math.sin(elapsed * 1.6) * 0.004, -0.04);
      if (mantling) {
        target.set(side * 0.25, lerp(0.75, 0.15, easeInOut(mantleProgress)), -0.42);
        followRate = 22;
      } else if (state === PlayerState.CLIMBING) {
        const reach = Math.sin(elapsed * 7 + (side > 0 ? 0 : Math.PI));
        target.set(side * 0.18, 0.78 + reach * 0.28, -0.36);
        followRate = 24;
      } else if (wallRunning) {
        if (side === wallSide) {
          target.set(side * 0.58, 0.34, -0.22 + Math.sin(elapsed * 9) * 0.07);
        } else {
          target.set(side * 0.28, 0.1, 0.02 + Math.sin(armPhase) * 0.1);
        }
        followRate = 20;
      } else if (sliding) {
        target.set(side * 0.32, 0.0, -0.3);
      } else if (airborne) {
        const fall = clamp(-(motion.verticalSpeed || 0) / 10, 0, 1);
        target.set(side * lerp(0.36, 0.5, fall), lerp(0.1, 0.5, fall), -0.18);
      } else if (strideAmplitude > 0.02) {
        target.set(
          side * (0.3 - 0.04 * strideAmplitude),
          0.08 + Math.max(0, Math.sin(armPhase)) * 0.2 * strideAmplitude,
          -0.06 + Math.sin(armPhase) * 0.3 * strideAmplitude
        );
      }
      this.handTargets[handIndex].lerp(target, blendRate(followRate));
    }

    for (let handIndex = 0; handIndex < 2; handIndex++) {
      this.animatePunchAndArm(handIndex, deltaTime);
    }
  }

  animatePunchAndArm(handIndex, deltaTime) {
    const side = handIndex ? 1 : -1;
    const punchTime = this.punchTimes[handIndex];
    const restingHand = this.handTargets[handIndex];
    let handPosition = restingHand;
    if (punchTime >= 0) {
      const progress = punchTime / PUNCH_DURATION;
      const back = new THREE.Vector3(side * 0.34, 0.3, 0.12);
      const front = new THREE.Vector3(side * 0.1, 0.5, -0.78);
      handPosition = new THREE.Vector3();
      if (progress < 0.2) {
        handPosition.copy(restingHand).lerp(back, easeInOut(progress / 0.2));
      } else if (progress < 0.45) {
        handPosition.copy(back).lerp(front, easeOut((progress - 0.2) / 0.25));
      } else if (progress < 0.6) {
        handPosition.copy(front);
      } else {
        handPosition.copy(front).lerp(restingHand, easeInOut((progress - 0.6) / 0.4));
      }
      this.punchTimes[handIndex] += deltaTime;
      if (this.punchTimes[handIndex] >= PUNCH_DURATION) {
        this.punchTimes[handIndex] = -1;
      }
    }

    const shoulder = SHOULDER_OFFSETS[handIndex];
    const reachVector = handPosition.clone().sub(shoulder);
    if (reachVector.length() > ARM_REACH) {
      handPosition = shoulder.clone().addScaledVector(reachVector.normalize(), ARM_REACH);
    }
    const elbow = this.scratchElbow.copy(shoulder).lerp(handPosition, 0.5).add(scratchDelta.set(side * 0.1, -0.1, 0.08));
    const upperArm = this.armSegments[handIndex * 2];
    const forearm = this.armSegments[handIndex * 2 + 1];
    stretchBetween(upperArm, shoulder, elbow, upperArm.userData.thickness);
    stretchBetween(forearm, elbow, handPosition, forearm.userData.thickness);
    scratchDelta.subVectors(handPosition, elbow).normalize();
    scratchMatrix.lookAt(ORIGIN, scratchDelta, WORLD_UP);
    this.hands[handIndex].group.quaternion.setFromRotationMatrix(scratchMatrix);
    this.hands[handIndex].group.position.copy(handPosition);
    this.hands[handIndex].setCurl(punchTime >= 0 ? 0.05 : 0.45);
  }

  dispose() {
    for (const material of this.materials) {
      material.dispose();
    }
  }
}
