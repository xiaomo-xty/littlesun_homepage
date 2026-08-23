import * as THREE from "three/webgpu";

export function createDolphinBodyShape() {
  const shape = new THREE.Shape();
  shape.moveTo(0.43, 0.025);
  shape.bezierCurveTo(0.35, 0.055, 0.23, 0.075, 0.08, 0.105);
  shape.bezierCurveTo(0.09, 0.31, -0.06, 0.49, -0.31, 0.56);
  shape.bezierCurveTo(-0.86, 0.72, -1.62, 0.61, -2.19, 0.39);
  shape.bezierCurveTo(-2.5, 0.27, -2.77, 0.17, -3.02, 0.09);
  shape.lineTo(-3.04, -0.075);
  shape.bezierCurveTo(-2.76, -0.13, -2.49, -0.2, -2.2, -0.31);
  shape.bezierCurveTo(-1.61, -0.52, -0.9, -0.53, -0.39, -0.37);
  shape.bezierCurveTo(-0.11, -0.28, 0.09, -0.17, 0.29, -0.135);
  shape.bezierCurveTo(0.37, -0.115, 0.44, -0.055, 0.43, 0.025);
  shape.closePath();
  return shape;
}

export function createDolphinBellyShape() {
  const shape = new THREE.Shape();
  shape.moveTo(0.38, -0.045);
  shape.bezierCurveTo(0.21, -0.08, 0.04, -0.17, -0.2, -0.25);
  shape.bezierCurveTo(-0.72, -0.44, -1.42, -0.46, -2.18, -0.3);
  shape.bezierCurveTo(-1.55, -0.53, -0.86, -0.53, -0.38, -0.37);
  shape.bezierCurveTo(-0.1, -0.28, 0.1, -0.17, 0.29, -0.135);
  shape.bezierCurveTo(0.35, -0.11, 0.39, -0.075, 0.38, -0.045);
  shape.closePath();
  return shape;
}

export function createDolphinDorsalFinShape() {
  const shape = new THREE.Shape();
  shape.moveTo(-1.12, 0.58);
  shape.bezierCurveTo(-1.38, 0.95, -1.69, 1.02, -1.91, 0.46);
  shape.bezierCurveTo(-1.62, 0.53, -1.36, 0.57, -1.12, 0.58);
  shape.closePath();
  return shape;
}

export function createDolphinPectoralFinShape() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.68, -0.23);
  shape.bezierCurveTo(-0.88, -0.52, -1.12, -0.91, -1.42, -0.93);
  shape.bezierCurveTo(-1.33, -0.53, -1.14, -0.24, -0.77, -0.12);
  shape.bezierCurveTo(-0.71, -0.14, -0.68, -0.18, -0.68, -0.23);
  shape.closePath();
  return shape;
}

export function createDolphinTailShape() {
  const shape = new THREE.Shape();
  shape.moveTo(-2.93, 0.08);
  shape.bezierCurveTo(-3.19, 0.14, -3.39, 0.4, -3.76, 0.49);
  shape.bezierCurveTo(-3.67, 0.24, -3.52, 0.08, -3.21, 0.005);
  shape.bezierCurveTo(-3.52, -0.04, -3.72, -0.18, -3.86, -0.42);
  shape.bezierCurveTo(-3.43, -0.37, -3.2, -0.16, -2.95, -0.07);
  shape.closePath();
  return shape;
}
