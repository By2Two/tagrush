import * as THREE from 'three';
import { MAP_BOXES, KIND_COLORS, WORLD } from './map.js';

export function buildWorld(scene) {
  scene.add(new THREE.HemisphereLight(0xffffff, 0xaab6c6, 1.7));

  const sun = new THREE.DirectionalLight(0xffffff, 2.0);
  sun.position.set(35, 70, 25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 10, far: 200 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.05;
  scene.add(sun);

  const materialsByKind = {};
  for (const kind of Object.keys(KIND_COLORS)) {
    materialsByKind[kind] = new THREE.MeshLambertMaterial({ color: KIND_COLORS[kind] });
  }
  const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x8a94a0, transparent: true, opacity: 0.5 });

  for (const box of MAP_BOXES) {
    const width = box.max.x - box.min.x;
    const height = box.max.y - box.min.y;
    const depth = box.max.z - box.min.z;
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const mesh = new THREE.Mesh(geometry, materialsByKind[box.kind]);
    mesh.position.set(box.min.x + width / 2, box.min.y + height / 2, box.min.z + depth / 2);
    const castsShadow = box.solid && box.kind !== 'floor';
    mesh.castShadow = castsShadow;
    mesh.receiveShadow = true;
    scene.add(mesh);
    if (castsShadow) {
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edgeMaterial);
      edges.position.copy(mesh.position);
      scene.add(edges);
    }
  }

  const grid = new THREE.GridHelper(WORLD.size, 50, 0xb4bdc8, 0xcdd4dc);
  grid.position.y = 0.02;
  scene.add(grid);
}
