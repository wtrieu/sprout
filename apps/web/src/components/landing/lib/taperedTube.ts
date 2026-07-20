import * as THREE from "three";

/**
 * A tube whose radius tapers from r0 to r1 along a Catmull-Rom path —
 * unlike THREE.TubeGeometry (constant radius), this lets branch joints stay
 * radius-continuous with their parent. UV layout matches TubeGeometry
 * (u along the length, v around the ring). Extra attributes:
 *   aBirth    — birth0..birth1 along the length (growth-clip in the shader)
 *   aCenter   — the ring's centerline point (lets the shader shrink the
 *               growth frontier to a point instead of leaving a cut edge)
 */
export function taperedTubeGeometry(
  points: THREE.Vector3[],
  r0: number,
  r1: number,
  birth0: number,
  birth1: number,
  tubularSegments = 24,
  radialSegments = 10,
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points);
  const frames = curve.computeFrenetFrames(tubularSegments, false);

  const vertexCount = (tubularSegments + 1) * (radialSegments + 1);
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const births = new Float32Array(vertexCount);
  const centers = new Float32Array(vertexCount * 3);
  const indices: number[] = [];

  const pos = new THREE.Vector3();
  const normal = new THREE.Vector3();

  let vi = 0;
  for (let i = 0; i <= tubularSegments; i++) {
    const t = i / tubularSegments;
    curve.getPointAt(t, pos);
    const N = frames.normals[Math.min(i, tubularSegments - 1)];
    const B = frames.binormals[Math.min(i, tubularSegments - 1)];
    // ease the taper slightly so tips feel organic, not conical
    const radius = THREE.MathUtils.lerp(r0, r1, Math.pow(t, 0.85));
    const birth = THREE.MathUtils.lerp(birth0, birth1, t);

    for (let j = 0; j <= radialSegments; j++) {
      const v = (j / radialSegments) * Math.PI * 2;
      const sin = Math.sin(v);
      const cos = -Math.cos(v);
      normal.set(
        cos * N.x + sin * B.x,
        cos * N.y + sin * B.y,
        cos * N.z + sin * B.z,
      );
      positions[vi * 3] = pos.x + radius * normal.x;
      positions[vi * 3 + 1] = pos.y + radius * normal.y;
      positions[vi * 3 + 2] = pos.z + radius * normal.z;
      normals[vi * 3] = normal.x;
      normals[vi * 3 + 1] = normal.y;
      normals[vi * 3 + 2] = normal.z;
      uvs[vi * 2] = t;
      uvs[vi * 2 + 1] = j / radialSegments;
      births[vi] = birth;
      centers[vi * 3] = pos.x;
      centers[vi * 3 + 1] = pos.y;
      centers[vi * 3 + 2] = pos.z;
      vi++;
    }
  }

  for (let i = 0; i < tubularSegments; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = (radialSegments + 1) * i + j;
      const b = (radialSegments + 1) * (i + 1) + j;
      const c = (radialSegments + 1) * (i + 1) + j + 1;
      const d = (radialSegments + 1) * i + j + 1;
      indices.push(a, b, d, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute("aBirth", new THREE.BufferAttribute(births, 1));
  geo.setAttribute("aCenter", new THREE.BufferAttribute(centers, 3));
  geo.setIndex(indices);
  return geo;
}

/** Minimal merge for same-attribute BufferGeometries (avoids examples/jsm). */
export function mergeGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const names = Object.keys(geos[0].attributes);
  const merged = new THREE.BufferGeometry();
  for (const name of names) {
    const itemSize = geos[0].attributes[name].itemSize;
    const total = geos.reduce((n, g) => n + g.attributes[name].count, 0);
    const arr = new Float32Array(total * itemSize);
    let offset = 0;
    for (const g of geos) {
      arr.set(g.attributes[name].array as Float32Array, offset);
      offset += g.attributes[name].count * itemSize;
    }
    merged.setAttribute(name, new THREE.BufferAttribute(arr, itemSize));
  }
  const indices: number[] = [];
  let vertexOffset = 0;
  for (const g of geos) {
    const idx = g.index!;
    for (let i = 0; i < idx.count; i++) indices.push(idx.getX(i) + vertexOffset);
    vertexOffset += g.attributes.position.count;
  }
  merged.setIndex(indices);
  return merged;
}
