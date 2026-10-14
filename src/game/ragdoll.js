import * as THREE from 'three';
import { SOLIDS } from './map.js';

const GRAVITY = 28;
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const scratchVector = new THREE.Vector3();
const scratchQuaternion = new THREE.Quaternion();
const RAGDOLL_LIFETIME_SECONDS = 7;
const BLAST_LIFETIME_SECONDS = 2.4;
const BLAST_CENTER_HEIGHT = 1.1;

const createMaterial = (color, roughness = 0.8) => new THREE.MeshStandardMaterial({ color, roughness });

function collideWithMap(part, restitution, friction) {
  let collided = false;
  for (const box of SOLIDS) {
    const closestX = Math.max(box.min.x, Math.min(part.position.x, box.max.x));
    const closestY = Math.max(box.min.y, Math.min(part.position.y, box.max.y));
    const closestZ = Math.max(box.min.z, Math.min(part.position.z, box.max.z));
    const offsetX = part.position.x - closestX;
    const offsetY = part.position.y - closestY;
    const offsetZ = part.position.z - closestZ;
    const squaredDistance = offsetX * offsetX + offsetY * offsetY + offsetZ * offsetZ;
    if (squaredDistance >= part.radius * part.radius) {
      continue;
    }
    let normalX;
    let normalY;
    let normalZ;
    let penetration;
    if (squaredDistance > 1e-8) {
      const distance = Math.sqrt(squaredDistance);
      normalX = offsetX / distance;
      normalY = offsetY / distance;
      normalZ = offsetZ / distance;
      penetration = part.radius - distance;
    } else {
      const nearestFace = [
        { depth: part.position.x - box.min.x, normal: [-1, 0, 0] },
        { depth: box.max.x - part.position.x, normal: [1, 0, 0] },
        { depth: part.position.y - box.min.y, normal: [0, -1, 0] },
        { depth: box.max.y - part.position.y, normal: [0, 1, 0] },
        { depth: part.position.z - box.min.z, normal: [0, 0, -1] },
        { depth: box.max.z - part.position.z, normal: [0, 0, 1] },
      ].sort((faceA, faceB) => faceA.depth - faceB.depth)[0];
      penetration = nearestFace.depth + part.radius;
      [normalX, normalY, normalZ] = nearestFace.normal;
    }
    part.position.x += normalX * penetration;
    part.position.y += normalY * penetration;
    part.position.z += normalZ * penetration;
    const speedIntoSurface = part.velocity.x * normalX + part.velocity.y * normalY + part.velocity.z * normalZ;
    if (speedIntoSurface < 0) {
      part.velocity.x -= (1 + restitution) * speedIntoSurface * normalX;
      part.velocity.y -= (1 + restitution) * speedIntoSurface * normalY;
      part.velocity.z -= (1 + restitution) * speedIntoSurface * normalZ;
      const grip = Math.max(0, 1 - friction);
      part.velocity.x *= grip;
      part.velocity.z *= grip;
      if (Math.abs(normalY) < 0.5) {
        part.velocity.y *= grip;
      }
    }
    collided = true;
  }
  return collided;
}

class RigidPart {
  constructor(mesh, radius, position) {
    this.mesh = mesh;
    this.radius = radius;
    this.position = position.clone();
    this.previousPosition = position.clone();
    this.velocity = new THREE.Vector3();
  }
}

const LIMB_LAYOUT = [
  { size: [0.3, 0.3, 0.3], skin: true, radius: 0.2, anchor: [0, 0.34, 0], length: 0.24, hangs: 1 },
  { size: [0.14, 0.5, 0.14], skin: true, radius: 0.13, anchor: [-0.3, 0.26, 0], length: 0.25, hangs: -1 },
  { size: [0.14, 0.5, 0.14], skin: true, radius: 0.13, anchor: [0.3, 0.26, 0], length: 0.25, hangs: -1 },
  { size: [0.18, 0.62, 0.2], skin: false, radius: 0.17, anchor: [-0.12, -0.32, 0], length: 0.3, hangs: -1 },
  { size: [0.18, 0.62, 0.2], skin: false, radius: 0.17, anchor: [0.12, -0.32, 0], length: 0.3, hangs: -1 },
];

export class Ragdoll {
  constructor(scene, { color, position, yaw, impulse }) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.age = 0;
    this.asleep = false;

    const shirt = createMaterial(color, 0.75);
    const pants = createMaterial(0x1d2433);
    const skin = createMaterial(0xe3b08a, 0.85);
    this.materials = [shirt, pants, skin];

    const createPart = ([width, height, depth], material) => {
      const mesh = new THREE.Mesh(UNIT_BOX, material);
      mesh.scale.set(width, height, depth);
      mesh.castShadow = true;
      this.group.add(mesh);
      return mesh;
    };

    const torsoStart = new THREE.Vector3(position.x, position.y + 1.25, position.z);
    this.torso = new RigidPart(createPart([0.44, 0.62, 0.26], shirt), 0.28, torsoStart);
    this.torso.orientation = new THREE.Quaternion().setFromAxisAngle(WORLD_UP, yaw || 0);
    this.torso.angularVelocity = new THREE.Vector3(
      (Math.random() - 0.5) * 14,
      (Math.random() - 0.5) * 8,
      (Math.random() - 0.5) * 14
    );

    this.limbs = LIMB_LAYOUT.map((layout) => {
      const anchor = new THREE.Vector3(...layout.anchor);
      const anchorInWorld = this.toWorld(anchor, new THREE.Vector3());
      const hangingOffset = new THREE.Vector3(0, layout.hangs * layout.length, 0);
      const limb = new RigidPart(
        createPart(layout.size, layout.skin ? skin : pants),
        layout.radius,
        anchorInWorld.add(hangingOffset)
      );
      limb.anchor = anchor;
      limb.length = layout.length;
      return limb;
    });

    const launch = new THREE.Vector3(impulse.x, impulse.y, impulse.z);
    this.torso.velocity.copy(launch);
    for (const limb of this.limbs) {
      limb.velocity.copy(launch).multiplyScalar(0.8 + Math.random() * 0.5);
      limb.velocity.x += (Math.random() - 0.5) * 6;
      limb.velocity.y += (Math.random() - 0.5) * 6;
      limb.velocity.z += (Math.random() - 0.5) * 6;
    }
    this.syncMeshes();
  }

  toWorld(localPoint, output) {
    return output.copy(localPoint).applyQuaternion(this.torso.orientation).add(this.torso.position);
  }

  get center() {
    return this.torso.position;
  }

  update(deltaTime) {
    if (this.asleep) {
      return;
    }
    this.age += deltaTime;
    const subStepCount = Math.max(1, Math.ceil(deltaTime / 0.008));
    const subStep = deltaTime / subStepCount;
    for (let stepIndex = 0; stepIndex < subStepCount; stepIndex++) {
      this.simulate(subStep);
    }
    if (this.age > RAGDOLL_LIFETIME_SECONDS) {
      this.asleep = true;
    }
    this.syncMeshes();
  }

  simulate(step) {
    const torso = this.torso;
    const parts = [torso, ...this.limbs];
    for (const part of parts) {
      part.previousPosition.copy(part.position);
      part.velocity.y -= GRAVITY * step;
      part.velocity.multiplyScalar(1 - 0.12 * step);
      part.position.addScaledVector(part.velocity, step);
    }

    const spin = torso.angularVelocity;
    scratchQuaternion.set(spin.x * step * 0.5, spin.y * step * 0.5, spin.z * step * 0.5, 0).multiply(torso.orientation);
    torso.orientation
      .set(
        torso.orientation.x + scratchQuaternion.x,
        torso.orientation.y + scratchQuaternion.y,
        torso.orientation.z + scratchQuaternion.z,
        torso.orientation.w + scratchQuaternion.w
      )
      .normalize();
    spin.multiplyScalar(1 - 0.9 * step);

    for (const limb of this.limbs) {
      const anchorInWorld = this.toWorld(limb.anchor, new THREE.Vector3());
      const separation = scratchVector.copy(limb.position).sub(anchorInWorld);
      const distance = separation.length();
      if (distance < 1e-6) {
        continue;
      }
      const stretch = (distance - limb.length) / distance;
      limb.position.addScaledVector(separation, -stretch * 0.85);
      torso.position.addScaledVector(separation, stretch * 0.15);
    }

    for (const part of parts) {
      part.velocity.copy(part.position).sub(part.previousPosition).multiplyScalar(1 / step);
    }
    for (const part of parts) {
      const collided = collideWithMap(part, 0.38, 0.1);
      if (collided && part === torso) {
        spin.multiplyScalar(0.9);
      }
    }
  }

  syncMeshes() {
    const torso = this.torso;
    torso.mesh.position.copy(torso.position);
    torso.mesh.quaternion.copy(torso.orientation);
    for (const limb of this.limbs) {
      limb.mesh.position.copy(limb.position);
      const anchorInWorld = this.toWorld(limb.anchor, scratchVector);
      const direction = new THREE.Vector3().copy(limb.position).sub(anchorInWorld);
      if (direction.lengthSq() > 1e-8) {
        limb.mesh.quaternion.setFromUnitVectors(WORLD_UP, direction.normalize());
      }
    }
  }

  dispose() {
    this.scene.remove(this.group);
    for (const material of this.materials) {
      material.dispose();
    }
  }
}

export class Blast {
  constructor(scene, position) {
    this.scene = scene;
    this.age = 0;
    this.group = new THREE.Group();
    this.group.position.set(position.x, position.y, position.z);
    scene.add(this.group);
    this.disposables = [];

    const addMesh = (geometry, material) => {
      const mesh = new THREE.Mesh(geometry, material);
      this.group.add(mesh);
      this.disposables.push(geometry, material);
      return mesh;
    };
    this.fireball = addMesh(
      new THREE.IcosahedronGeometry(1, 2),
      new THREE.MeshBasicMaterial({ color: 0xff8a1f, transparent: true, depthWrite: false })
    );
    this.core = addMesh(
      new THREE.IcosahedronGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: 0xfff1b0, transparent: true, depthWrite: false })
    );
    this.shockwave = addMesh(
      new THREE.SphereGeometry(1, 20, 12),
      new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide })
    );
    this.groundRing = addMesh(
      new THREE.RingGeometry(0.85, 1, 40),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, side: THREE.DoubleSide })
    );
    this.groundRing.rotation.x = -Math.PI / 2;
    this.groundRing.position.y = -BLAST_CENTER_HEIGHT + 0.05;
    this.light = new THREE.PointLight(0xffa040, 40, 30);
    this.group.add(this.light);

    this.debris = this.createDebris();
    this.smoke = this.createSmoke();
  }

  createDebris() {
    const geometry = new THREE.BoxGeometry(0.16, 0.16, 0.16);
    this.disposables.push(geometry);
    const debris = [];
    for (let debrisIndex = 0; debrisIndex < 46; debrisIndex++) {
      const isHot = debrisIndex % 3 !== 0;
      let color = 0x40362c;
      if (isHot) {
        color = debrisIndex % 2 ? 0xffc040 : 0xff5a1a;
      }
      const material = new THREE.MeshBasicMaterial({ color, transparent: true });
      this.disposables.push(material);
      const mesh = new THREE.Mesh(geometry, material);
      this.group.add(mesh);
      const heading = Math.random() * Math.PI * 2;
      const elevation = Math.random() * 1.2 + 0.1;
      const speed = 8 + Math.random() * 16;
      debris.push({
        mesh,
        velocity: new THREE.Vector3(
          Math.cos(heading) * Math.cos(elevation) * speed,
          Math.sin(elevation) * speed,
          Math.sin(heading) * Math.cos(elevation) * speed
        ),
        spin: new THREE.Vector3(Math.random() * 12, Math.random() * 12, Math.random() * 12),
        lifetime: 0.9 + Math.random() * 0.8,
      });
    }
    return debris;
  }

  createSmoke() {
    const puffs = [];
    for (let puffIndex = 0; puffIndex < 9; puffIndex++) {
      const material = new THREE.MeshBasicMaterial({ color: 0x5a5a62, transparent: true, depthWrite: false, opacity: 0 });
      const geometry = new THREE.IcosahedronGeometry(1, 1);
      this.disposables.push(material, geometry);
      const mesh = new THREE.Mesh(geometry, material);
      const heading = Math.random() * Math.PI * 2;
      const radius = Math.random() * 1.4;
      mesh.position.set(Math.cos(heading) * radius, Math.random() * 0.8, Math.sin(heading) * radius);
      this.group.add(mesh);
      puffs.push({
        mesh,
        velocity: new THREE.Vector3((Math.random() - 0.5) * 1.5, 1.2 + Math.random() * 1.5, (Math.random() - 0.5) * 1.5),
        delay: Math.random() * 0.25,
      });
    }
    return puffs;
  }

  update(deltaTime) {
    this.age += deltaTime;
    const age = this.age;
    const fireProgress = Math.min(1, age / 0.55);
    const fireEase = 1 - (1 - fireProgress) ** 3;
    this.fireball.scale.setScalar(0.4 + fireEase * 4.4);
    this.fireball.material.opacity = Math.max(0, 1 - fireProgress ** 1.5);
    this.core.scale.setScalar(0.3 + fireEase * 2.2);
    this.core.material.opacity = Math.max(0, 1 - fireProgress * 1.6);

    const waveProgress = Math.min(1, age / 0.7);
    const waveEase = 1 - (1 - waveProgress) ** 2;
    this.shockwave.scale.setScalar(0.5 + waveEase * 11);
    this.shockwave.material.opacity = 0.35 * (1 - waveProgress);
    this.groundRing.scale.setScalar(0.6 + waveEase * 12);
    this.groundRing.material.opacity = 0.9 * (1 - waveProgress);
    this.light.intensity = Math.max(0, 40 * (1 - age / 0.5));

    const groundLevel = -BLAST_CENTER_HEIGHT + 0.1;
    for (const piece of this.debris) {
      piece.velocity.y -= 22 * deltaTime;
      piece.mesh.position.addScaledVector(piece.velocity, deltaTime);
      if (piece.mesh.position.y < groundLevel) {
        piece.mesh.position.y = groundLevel;
        piece.velocity.multiplyScalar(0.4);
        piece.velocity.y = Math.abs(piece.velocity.y) * 0.3;
      }
      piece.mesh.rotation.x += piece.spin.x * deltaTime;
      piece.mesh.rotation.y += piece.spin.y * deltaTime;
      piece.mesh.material.opacity = Math.max(0, 1 - age / piece.lifetime);
      piece.mesh.scale.setScalar(Math.max(0.01, 1 - age / (piece.lifetime * 1.4)));
    }

    for (const puff of this.smoke) {
      const puffAge = age - puff.delay;
      if (puffAge < 0) {
        continue;
      }
      puff.mesh.position.addScaledVector(puff.velocity, deltaTime);
      puff.mesh.scale.setScalar(0.5 + puffAge * 1.1);
      puff.mesh.material.opacity = Math.max(0, 0.3 * Math.min(1, puffAge * 4) * (1 - puffAge / 2.2));
    }
    return age < BLAST_LIFETIME_SECONDS;
  }

  dispose() {
    this.scene.remove(this.group);
    for (const resource of this.disposables) {
      resource.dispose();
    }
  }
}
