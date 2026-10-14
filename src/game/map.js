export const WORLD = { halfSize: 50, size: 100 };

export const KIND_COLORS = {
  floor: 0xdfe4ea,
  wall: 0xf6f7f9,
  accent: 0xe8402b,
  crate: 0x2d6cdf,
};

export const PLAYER_COLORS = [
  0x2d6cdf, 0x1fa67a, 0xf2b134, 0x8a5cf5, 0x0fb5c7, 0xf06fa6,
  0x6b7b8c, 0x9bcf3f, 0xff8a3d, 0x3dd6a3, 0xb06bff, 0x4aa3ff,
];

const boxes = [];

function addBox(kind, centerX, bottomY, centerZ, width, height, depth, solid = true) {
  boxes.push({
    kind,
    solid,
    min: { x: centerX - width / 2, y: bottomY, z: centerZ - depth / 2 },
    max: { x: centerX + width / 2, y: bottomY + height, z: centerZ + depth / 2 },
  });
}

function addBand(centerX, topY, centerZ, width, depth, thickness = 0.4) {
  addBox('accent', centerX, topY - thickness, centerZ, width + 0.06, thickness, depth + 0.06, false);
}

const PERIMETER_HEIGHT = 40;
addBox('floor', 0, -1, 0, 104, 1, 104);
addBox('wall', 0, 0, -46, 96, PERIMETER_HEIGHT, 2);
addBox('wall', 0, 0, 46, 96, PERIMETER_HEIGHT, 2);
addBox('wall', -46, 0, 0, 2, PERIMETER_HEIGHT, 92);
addBox('wall', 46, 0, 0, 2, PERIMETER_HEIGHT, 92);
addBand(0, 3.2, -46, 96, 2);
addBand(0, 3.2, 46, 96, 2);
addBand(-46, 3.2, 0, 2, 92);
addBand(46, 3.2, 0, 2, 92);

addBox('wall', 0, 0, 0, 12, 6, 12);
addBand(0, 4.6, 0, 12, 12, 0.5);
addBox('crate', 0, 6, 0, 3, 1.4, 3);
for (let stepIndex = 0; stepIndex <= 10; stepIndex++) {
  const stepHeight = 0.5 * (stepIndex + 1);
  const stepCenterZ = 6 + 1.2 * (10 - stepIndex) + 0.6;
  addBox('wall', 0, 0, stepCenterZ, 4, stepHeight, 1.2);
  addBand(0, stepHeight, stepCenterZ, 4, 1.2, 0.12);
}

addBox('wall', -29, 0, -12, 1, 9, 34);
addBox('wall', -24, 0, -12, 1, 9, 34);
addBand(-29, 4.4, -12, 1, 34);
addBand(-24, 4.4, -12, 1, 34);

[
  [30, -36, 6, 2],
  [38, -30, 5, 3.4],
  [30, -24, 5, 4.8],
  [38, -18, 5, 6.2],
  [30, -12, 5, 7.6],
].forEach(([centerX, centerZ, size, height]) => {
  addBox('wall', centerX, 0, centerZ, size, height, size);
  addBand(centerX, height - 0.02, centerZ, size, size, 0.4);
});

addBox('wall', -14, 0, -32, 3, 5.5, 3);
addBox('wall', 14, 0, -32, 3, 5.5, 3);
addBox('wall', 0, 5.5, -32, 31, 0.5, 3);
addBand(-14, 3.0, -32, 3, 3);
addBand(14, 3.0, -32, 3, 3);

for (let pillarX = -30; pillarX <= 30; pillarX += 10) {
  addBox('wall', pillarX, 0, 28, 2.5, 8, 2.5);
  addBand(pillarX, 5, 28, 2.5, 2.5);
}

[
  [-12, 20, 3, 1.2],
  [14, 18, 2.5, 1.5],
  [-36, 18, 3, 1.2],
  [38, 14, 3, 2.0],
  [22, -2, 4, 1.0],
  [-14, -4, 2, 2.2],
  [12, -10, 3, 0.9],
  [30, 10, 4, 1.6],
  [-38, -4, 3, 1.0],
  [8, 36, 3, 1.4],
  [-8, 38, 3, 1.0],
].forEach(([centerX, centerZ, size, height]) => addBox('crate', centerX, 0, centerZ, size, height, size));

addBox('accent', 18, 0, 10, 10, 2.6, 3);
addBox('crate', 16, 2.6, 10, 4, 2.4, 3);
addBox('accent', -16, 0, 10, 3, 2.6, 10);
addBox('wall', 0, 0, -16, 14, 1.2, 0.8);
addBox('wall', -10, 0, -18, 0.8, 4.5, 10);
addBand(-10, 3.5, -18, 0.8, 10, 0.4);

export const MAP_BOXES = boxes;
export const SOLIDS = boxes.filter((box) => box.solid);

export const SPAWNS = [
  { x: -40, y: 0.05, z: 40 },
  { x: 40, y: 0.05, z: 40 },
  { x: 0, y: 0.05, z: 40 },
  { x: -40, y: 0.05, z: -40 },
  { x: 40, y: 0.05, z: -42 },
  { x: 0, y: 0.05, z: -40 },
  { x: -38, y: 0.05, z: 0 },
  { x: 38, y: 0.05, z: 2 },
  { x: 20, y: 0.05, z: 36 },
  { x: -20, y: 0.05, z: 36 },
];
