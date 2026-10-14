import * as THREE from 'three';

const SKIN_COLOR = 0xb98b52;
const SPOT_COLOR = 0x7a5530;
const LUMP_SEED = 7;
const SPOT_SEED = 21;

function createSeededRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function createLumpyGeometry() {
  const geometry = new THREE.IcosahedronGeometry(0.5, 2);
  const random = createSeededRandom(LUMP_SEED);
  const positions = geometry.attributes.position;
  const lumpByVertex = new Map();
  for (let vertexIndex = 0; vertexIndex < positions.count; vertexIndex++) {
    const vertexKey = [positions.getX(vertexIndex), positions.getY(vertexIndex), positions.getZ(vertexIndex)]
      .map((coordinate) => coordinate.toFixed(3))
      .join(',');
    if (!lumpByVertex.has(vertexKey)) {
      lumpByVertex.set(vertexKey, 0.9 + random() * 0.2);
    }
    const lump = lumpByVertex.get(vertexKey);
    positions.setXYZ(
      vertexIndex,
      positions.getX(vertexIndex) * lump,
      positions.getY(vertexIndex) * lump,
      positions.getZ(vertexIndex) * lump
    );
  }
  geometry.computeVertexNormals();
  return geometry;
}

let sharedBodyGeometry = null;

function addSpots(parent, material) {
  const random = createSeededRandom(SPOT_SEED);
  const surfaceRadius = 0.46;
  for (let spotIndex = 0; spotIndex < 7; spotIndex++) {
    const longitude = random() * Math.PI * 2;
    const latitude = (random() - 0.5) * 2.2;
    const spot = new THREE.Mesh(new THREE.SphereGeometry(0.035 + random() * 0.03, 6, 5), material);
    spot.position.set(
      Math.cos(longitude) * Math.cos(latitude) * surfaceRadius * 1.05,
      Math.sin(latitude) * surfaceRadius * 0.85,
      Math.sin(longitude) * Math.cos(latitude) * surfaceRadius * 0.9
    );
    spot.scale.set(1, 0.6, 1);
    parent.add(spot);
  }
}

function addFace(parent, browMaterial) {
  const eye = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 14, 10),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 })
  );
  eye.position.set(0, 0.06, 0.4);
  eye.scale.set(1, 1, 0.55);
  parent.add(eye);

  const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshBasicMaterial({ color: 0x111111 }));
  pupil.position.set(0, 0.06, 0.445);
  parent.add(pupil);

  const brow = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.035, 0.05), browMaterial);
  brow.position.set(0, 0.19, 0.42);
  brow.rotation.z = -0.15;
  parent.add(brow);
}

function addBombCap(parent) {
  const metal = new THREE.MeshStandardMaterial({ color: 0x1c2028, roughness: 0.35, metalness: 0.6 });
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.1, 14), metal);
  cap.position.set(0, 0.4, 0);
  parent.add(cap);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.14, 0.022, 8, 18),
    new THREE.MeshStandardMaterial({ color: 0xe8402b, roughness: 0.5 })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0, 0.36, 0);
  parent.add(ring);
}

function addFuse(parent) {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.45, 0),
    new THREE.Vector3(0.03, 0.58, 0.02),
    new THREE.Vector3(0.13, 0.66, 0),
    new THREE.Vector3(0.2, 0.62, -0.03),
  ]);
  const fuse = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 14, 0.018, 6, false),
    new THREE.MeshStandardMaterial({ color: 0xd9c9a0, roughness: 0.9 })
  );
  parent.add(fuse);
  return curve.getPoint(1);
}

export function makePotato({ withLight = false } = {}) {
  const group = new THREE.Group();
  const shaker = new THREE.Group();
  group.add(shaker);
  sharedBodyGeometry ||= createLumpyGeometry();

  const skinMaterial = new THREE.MeshStandardMaterial({
    color: SKIN_COLOR,
    roughness: 0.9,
    flatShading: true,
    emissive: 0x000000,
  });
  const body = new THREE.Mesh(sharedBodyGeometry, skinMaterial);
  body.scale.set(1.05, 0.85, 0.9);
  body.castShadow = true;
  shaker.add(body);

  const spotMaterial = new THREE.MeshStandardMaterial({ color: SPOT_COLOR, roughness: 1, flatShading: true });
  addSpots(shaker, spotMaterial);
  addFace(shaker, spotMaterial);
  addBombCap(shaker);
  const fuseTip = addFuse(shaker);

  const spark = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), new THREE.MeshBasicMaterial({ color: 0xffb02e }));
  spark.position.copy(fuseTip);
  shaker.add(spark);

  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xff6a1a, transparent: true, opacity: 0.45, depthWrite: false })
  );
  glow.position.copy(fuseTip);
  shaker.add(glow);

  let sparkLight = null;
  if (withLight) {
    sparkLight = new THREE.PointLight(0xff9a3a, 2, 3);
    sparkLight.position.copy(fuseTip);
    shaker.add(sparkLight);
  }

  const potato = {
    group,
    elapsed: Math.random() * 10,
    urgency: 0,
    setUrgency(urgency) {
      potato.urgency = urgency;
    },
    update(deltaTime) {
      potato.elapsed += deltaTime;
      const { elapsed, urgency } = potato;
      const flicker = 0.75 + 0.25 * Math.sin(elapsed * 38) + 0.15 * Math.sin(elapsed * 23);
      spark.scale.setScalar((0.8 + urgency * 0.9) * flicker);
      spark.rotation.y += deltaTime * 9;
      glow.scale.setScalar((0.9 + urgency * 1.6) * (0.85 + 0.3 * Math.sin(elapsed * 31)));
      if (sparkLight) {
        sparkLight.intensity = 1.5 + urgency * 3 * flicker;
      }
      const pulse = 0.5 + 0.5 * Math.sin(elapsed * (4 + urgency * 26));
      skinMaterial.emissive.setRGB(0.9 * urgency * pulse, 0.12 * urgency * pulse, 0.02 * urgency * pulse);
      shaker.scale.setScalar(1 + urgency * 0.07 * pulse);
      const shakeAmount = urgency * urgency * 0.035;
      shaker.position.set((Math.random() - 0.5) * shakeAmount, (Math.random() - 0.5) * shakeAmount, 0);
      shaker.rotation.z = (Math.random() - 0.5) * urgency * urgency * 0.18;
    },
    dispose() {
      shaker.traverse((object) => {
        if (object.geometry && object.geometry !== sharedBodyGeometry) {
          object.geometry.dispose();
        }
        if (object.material) {
          object.material.dispose();
        }
      });
    },
  };
  return potato;
}
