import * as THREE from 'three'

const _ray = new THREE.Ray()
const _dir = new THREE.Vector3()
const _origin = new THREE.Vector3()

/**
 * Raycast from camera forward onto y=0 plane (ground).
 * If the camera is looking too parallel to the plane, returns a fallback point ahead.
 * @param {THREE.Camera} camera
 * @param {number} fallbackDist
 */
export function raycastGround(camera, fallbackDist = 4.0) {
  camera.getWorldDirection(_dir)
  camera.getWorldPosition(_origin)

  _ray.origin.copy(_origin)
  _ray.direction.copy(_dir)

  // Plane y=0: origin + t*dir => y=0
  const dy = _ray.direction.y

  if (Math.abs(dy) < 1e-5) {
    // Fallback: a point in front of camera, projected to ground.
    const p = _origin.clone().addScaledVector(_dir, fallbackDist)
    p.y = 0
    return p
  }

  const t = -_ray.origin.y / dy
  if (t < 0) {
    const p = _origin.clone().addScaledVector(_dir, fallbackDist)
    p.y = 0
    return p
  }

  const p = _ray.at(t, new THREE.Vector3())
  p.y = 0
  return p
}
