import * as THREE from 'three'

export function createSky(texture) {
  const geometry = new THREE.SphereGeometry(900, 64, 32)
  const material = new THREE.MeshBasicMaterial({
    map: texture ?? null,
    color: texture ? 0xffffff : 0x070b16,
    side: THREE.BackSide,
    depthWrite: false,
  })
  const sky = new THREE.Mesh(geometry, material)
  sky.name = 'milkyway'
  sky.rotation.y = Math.PI
  return sky
}
