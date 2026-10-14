import * as THREE from 'three';
import { BlockRig } from './blockrig.js';
import { PlayerState } from './physics.js';
import { makePotato } from './potato.js';

export const IT_COLOR = 0xe8402b;

const LABEL_CANVAS_WIDTH = 256;
const LABEL_CANVAS_HEIGHT = 64;
const LABEL_HEIGHT_STANDING = 2.3;
const LABEL_HEIGHT_SLIDING = 1.5;
const LABEL_HEIGHT_WITH_POTATO = 2.85;
const IT_MARKER_HEIGHT = 2.75;
const POSITION_SMOOTHING_RATE = 16;
const MANTLE_DURATION = 0.5;
const MAX_PLAUSIBLE_HORIZONTAL_SPEED = 40;
const MAX_PLAUSIBLE_VERTICAL_SPEED = 60;

function createNameLabel(text) {
  const canvas = document.createElement('canvas');
  canvas.width = LABEL_CANVAS_WIDTH;
  canvas.height = LABEL_CANVAS_HEIGHT;
  const context = canvas.getContext('2d');
  context.font = '800 34px "Barlow Condensed", system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.lineWidth = 7;
  context.strokeStyle = 'rgba(0,0,0,.7)';
  context.strokeText(text, LABEL_CANVAS_WIDTH / 2, 34);
  context.fillStyle = '#fff';
  context.fillText(text, LABEL_CANVAS_WIDTH / 2, 34);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(2.4, 0.6, 1);
  return sprite;
}

function shortestAngleDifference(from, target) {
  let difference = target - from;
  while (difference > Math.PI) {
    difference -= Math.PI * 2;
  }
  while (difference < -Math.PI) {
    difference += Math.PI * 2;
  }
  return difference;
}

export class Avatar {
  constructor({ name, color }) {
    this.baseColor = color;
    this.group = new THREE.Group();
    this.rig = new BlockRig(color);
    this.group.add(this.rig.root);

    this.label = createNameLabel(name);
    this.label.position.y = LABEL_HEIGHT_STANDING;
    this.group.add(this.label);

    this.itMarker = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.45, 12), new THREE.MeshBasicMaterial({ color: IT_COLOR }));
    this.itMarker.rotation.x = Math.PI;
    this.itMarker.position.y = IT_MARKER_HEIGHT;
    this.itMarker.visible = false;
    this.group.add(this.itMarker);

    this.potato = null;
    this.urgency = 0;
    this.target = null;
    this.yaw = 0;
    this.pitch = 0;
    this.movementState = 0;
    this.wall = null;
    this.verticalSpeed = 0;
    this.horizontalSpeed = 0;
    this.mantleTime = 0;
    this.lastPosition = null;
    this.snapToTarget = true;
  }

  punch(side) {
    this.rig.punch(side);
  }

  markAsIt(isIt, holdsPotato = false) {
    if (holdsPotato) {
      this.itMarker.visible = false;
      this.rig.setColor(this.baseColor, false);
      this.showPotato(isIt);
      return;
    }
    this.showPotato(false);
    this.itMarker.visible = isIt;
    this.rig.setColor(isIt ? IT_COLOR : this.baseColor, isIt);
  }

  showPotato(visible) {
    if (visible && !this.potato) {
      this.potato = makePotato();
      this.potato.group.scale.setScalar(0.62);
      this.potato.group.position.y = 2.05;
      this.group.add(this.potato.group);
    } else if (!visible && this.potato) {
      this.group.remove(this.potato.group);
      this.potato.dispose();
      this.potato = null;
    }
  }

  followTarget(deltaTime) {
    if (!this.target) {
      return;
    }
    const smoothing = this.snapToTarget ? 1 : 1 - Math.exp(-POSITION_SMOOTHING_RATE * deltaTime);
    this.snapToTarget = false;
    this.group.position.x += (this.target.x - this.group.position.x) * smoothing;
    this.group.position.y += (this.target.y - this.group.position.y) * smoothing;
    this.group.position.z += (this.target.z - this.group.position.z) * smoothing;
    this.yaw += shortestAngleDifference(this.yaw, this.target.yaw) * smoothing;
    this.group.rotation.y = this.yaw;
  }

  estimateVelocity(deltaTime) {
    const position = this.group.position;
    if (this.lastPosition && deltaTime > 0) {
      const horizontalSpeed = Math.hypot(position.x - this.lastPosition.x, position.z - this.lastPosition.z) / deltaTime;
      const verticalSpeed = (position.y - this.lastPosition.y) / deltaTime;
      const isTeleport =
        horizontalSpeed >= MAX_PLAUSIBLE_HORIZONTAL_SPEED || Math.abs(verticalSpeed) >= MAX_PLAUSIBLE_VERTICAL_SPEED;
      if (!isTeleport) {
        const blend = Math.min(1, 10 * deltaTime);
        this.horizontalSpeed += (horizontalSpeed - this.horizontalSpeed) * blend;
        this.verticalSpeed += (verticalSpeed - this.verticalSpeed) * blend;
      }
    }
    this.lastPosition = { x: position.x, y: position.y, z: position.z };
  }

  wallSideRelativeToBody() {
    if (!this.wall) {
      return 1;
    }
    const side = -this.wall.normalX * Math.cos(this.yaw) + this.wall.normalZ * Math.sin(this.yaw);
    return side >= 0 ? 1 : -1;
  }

  update(deltaTime, elapsedSeconds) {
    this.followTarget(deltaTime);
    this.estimateVelocity(deltaTime);

    const mantling = this.movementState === PlayerState.MANTLING;
    this.mantleTime = mantling ? this.mantleTime + deltaTime : 0;
    this.rig.update(deltaTime, {
      state: this.movementState,
      speed: this.horizontalSpeed,
      verticalSpeed: this.verticalSpeed,
      pitch: this.pitch,
      wallSide: this.wallSideRelativeToBody(),
      mantleProgress: mantling ? Math.min(1, this.mantleTime / MANTLE_DURATION) : -1,
    });

    if (this.potato) {
      this.potato.setUrgency(this.urgency);
      this.potato.update(deltaTime);
      this.potato.group.rotation.y = Math.sin(elapsedSeconds * 1.5) * 0.5;
    }

    if (this.movementState === PlayerState.SLIDING) {
      this.label.position.y = LABEL_HEIGHT_SLIDING;
    } else {
      this.label.position.y = this.potato ? LABEL_HEIGHT_WITH_POTATO : LABEL_HEIGHT_STANDING;
    }
    if (this.itMarker.visible) {
      this.itMarker.position.y = IT_MARKER_HEIGHT + Math.sin(elapsedSeconds * 4) * 0.08;
    }
  }

  dispose() {
    this.showPotato(false);
    this.rig.dispose();
    this.label.material.map?.dispose();
    this.label.material.dispose();
    this.itMarker.geometry.dispose();
    this.itMarker.material.dispose();
  }
}
