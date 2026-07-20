import * as THREE from "three";
import { BEATS } from "../../chapters/chapterConfig";
import type { BeatLayer } from "../../chapters/layerManifest";

const UP = new THREE.Vector3(0, 1, 0);
/** must match the CanvasRoot camera */
const FOV_DEG = 45;

export type Placement = {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  /** world height of the plane; width = height × image aspect */
  height: number;
};

/**
 * Stage a card on its beat's view axis: position = beat camera + viewDir ·
 * distance (+ right/up offsets), oriented facing the beat camera ONCE at
 * placement. As the live camera travels away from the station, perspective
 * shear on the flat card is exactly the 2.5D parallax we want — no per-frame
 * re-billboarding.
 */
export function placeLayer(beatIndex: number, layer: BeatLayer): Placement {
  const beat = BEATS[beatIndex];
  const cam = new THREE.Vector3(...beat.camera);
  const look = new THREE.Vector3(...beat.lookAt);
  const dir = look.clone().sub(cam).normalize();
  const right = new THREE.Vector3().crossVectors(dir, UP).normalize();
  const up = new THREE.Vector3().crossVectors(right, dir).normalize();

  const distance = layer.distance ?? 30;
  const [ox, oy] = layer.offset ?? [0, 0];
  const position = cam
    .clone()
    .addScaledVector(dir, distance)
    .addScaledVector(right, ox)
    .addScaledVector(up, oy);

  const quaternion = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().lookAt(position, cam, UP),
  );

  // frustum-height coverage at this distance; ≥1.3 keeps full-bleed cards
  // from exposing an edge under mouse parallax and transit angles
  const coverage = layer.coverage ?? 1.3;
  const height = 2 * distance * Math.tan(THREE.MathUtils.degToRad(FOV_DEG / 2)) * coverage;

  return { position, quaternion, height };
}
