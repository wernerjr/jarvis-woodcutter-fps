import * as THREE from 'three'

const _ray = new THREE.Ray()
const _dir = new THREE.Vector3()

/**
 * Raycast from camera through center of screen onto y=0 plane.
 * @param {THREE.Camera} camera
 */
export function raycastGround(camera) {
  camera.getWorldDirection(_dir)
  _ray.origin.copy(camera.position)
  _ray.direction.copy(_dir)

  // Plane y=0: origin + t*dir => y=0
  const dy = _ray.direction.y
  if (Math.abs(dy) < 1e-5) return null

  const t = -_ray.origin.y / dy
  if (t < 0) return null

  const p = _ray.at(t, new THREE.Vector3())
  return p
}
