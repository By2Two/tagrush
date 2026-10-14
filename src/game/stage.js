import * as THREE from 'three';
import { BlockRig } from './blockrig.js';
import { PlayerState } from './physics.js';

const ROTATION_PER_DRAG_PIXEL = 0.012;
const IDLE_SPIN_SPEED = 0.25;
const FIRST_PUNCH_DELAY_SECONDS = 3;

export class MenuStage {
  constructor(canvas, color = 0x2d6cdf) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    this.camera.position.set(0, 1.25, 6.2);
    this.camera.lookAt(0, 0.95, 0);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa4b2, 1.9));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(3, 6, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 1, far: 20 });
    this.scene.add(sun);

    const floor = new THREE.Mesh(new THREE.CircleGeometry(1.4, 40), new THREE.ShadowMaterial({ opacity: 0.28 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    this.rig = new BlockRig(color);
    this.turntable = new THREE.Group();
    this.turntable.add(this.rig.root);
    this.turntable.rotation.y = Math.PI - 0.5;
    this.scene.add(this.turntable);

    this.dragging = false;
    this.spinVelocity = 0;
    this.secondsUntilPunch = FIRST_PUNCH_DELAY_SECONDS;
    this.nextPunchSide = 0;
    this.lastFrameSeconds = performance.now() / 1000;
    this.handleResize = this.handleResize.bind(this);
    this.loop = this.loop.bind(this);
    window.addEventListener('resize', this.handleResize);
    this.handleResize();
    this.animationFrame = requestAnimationFrame(this.loop);
  }

  setColor(hex) {
    this.rig.setColor(hex);
  }

  rotate(dragDeltaX) {
    if (dragDeltaX === null) {
      this.dragging = false;
      return;
    }
    this.dragging = true;
    this.turntable.rotation.y += dragDeltaX * ROTATION_PER_DRAG_PIXEL;
    this.spinVelocity = dragDeltaX * ROTATION_PER_DRAG_PIXEL;
  }

  punch() {
    this.rig.punch(this.nextPunchSide);
    this.nextPunchSide ^= 1;
  }

  handleResize() {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  loop(timestampMs) {
    this.animationFrame = requestAnimationFrame(this.loop);
    const nowSeconds = timestampMs / 1000;
    const deltaTime = Math.min(0.05, nowSeconds - this.lastFrameSeconds);
    this.lastFrameSeconds = nowSeconds;
    if (!this.dragging) {
      this.spinVelocity *= Math.exp(-4 * deltaTime);
      this.turntable.rotation.y += this.spinVelocity + IDLE_SPIN_SPEED * deltaTime;
    }
    this.secondsUntilPunch -= deltaTime;
    if (this.secondsUntilPunch <= 0) {
      this.punch();
      this.secondsUntilPunch = 3.5 + Math.random() * 2;
    }
    this.rig.update(deltaTime, { state: PlayerState.RUNNING, speed: 0, pitch: 0 });
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    cancelAnimationFrame(this.animationFrame);
    window.removeEventListener('resize', this.handleResize);
    this.rig.dispose();
    this.renderer.dispose();
  }
}
