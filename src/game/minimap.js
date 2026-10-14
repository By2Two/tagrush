import { SOLIDS, WORLD } from './map.js';

const MINIMAP_SIZE = 200;
const PIXELS_PER_UNIT = MINIMAP_SIZE / WORLD.size;
const IT_COLOR_CSS = '#e8402b';

const toMinimapCoordinate = (worldCoordinate) => (worldCoordinate + WORLD.halfSize) * PIXELS_PER_UNIT;

function renderBackground() {
  const canvas = document.createElement('canvas');
  canvas.width = MINIMAP_SIZE;
  canvas.height = MINIMAP_SIZE;
  const context = canvas.getContext('2d');
  context.fillStyle = '#e9edf2';
  context.fillRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);
  const obstacles = SOLIDS.filter((box) => box.kind !== 'floor').sort((first, second) => first.max.y - second.max.y);
  for (const box of obstacles) {
    const shade = Math.round(236 - Math.min(1, box.max.y / 10) * 120);
    context.fillStyle = box.kind === 'accent' ? IT_COLOR_CSS : `rgb(${shade},${shade},${shade + 6})`;
    context.fillRect(
      toMinimapCoordinate(box.min.x),
      toMinimapCoordinate(box.min.z),
      (box.max.x - box.min.x) * PIXELS_PER_UNIT,
      (box.max.z - box.min.z) * PIXELS_PER_UNIT
    );
  }
  return canvas;
}

export class Minimap {
  constructor(canvas) {
    this.context = canvas ? canvas.getContext('2d') : null;
    this.background = renderBackground();
  }

  draw({ avatars, itPlayerId, localPosition, localYaw, localIsIt }) {
    const context = this.context;
    if (!context) {
      return;
    }
    context.clearRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);
    context.drawImage(this.background, 0, 0);

    for (const [playerId, avatar] of avatars) {
      const isIt = playerId === itPlayerId;
      context.beginPath();
      context.arc(
        toMinimapCoordinate(avatar.group.position.x),
        toMinimapCoordinate(avatar.group.position.z),
        isIt ? 5 : 3.5,
        0,
        Math.PI * 2
      );
      context.fillStyle = isIt ? IT_COLOR_CSS : '#12151a';
      context.fill();
      context.lineWidth = 1.5;
      context.strokeStyle = '#fff';
      context.stroke();
    }

    context.save();
    context.translate(toMinimapCoordinate(localPosition.x), toMinimapCoordinate(localPosition.z));
    context.rotate(-localYaw);
    context.beginPath();
    context.moveTo(0, -7);
    context.lineTo(5, 5);
    context.lineTo(0, 2);
    context.lineTo(-5, 5);
    context.closePath();
    context.fillStyle = localIsIt ? IT_COLOR_CSS : '#2d6cdf';
    context.fill();
    context.lineWidth = 1.5;
    context.strokeStyle = '#fff';
    context.stroke();
    context.restore();
  }

  clear() {
    this.context?.clearRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);
  }
}
