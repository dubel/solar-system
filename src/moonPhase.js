import * as THREE from 'three'

const earthPos = new THREE.Vector3()
const moonPos = new THREE.Vector3()
const moonToSun = new THREE.Vector3()
const moonToEarth = new THREE.Vector3()
const earthToSun = new THREE.Vector3()
const earthToMoon = new THREE.Vector3()
const origin = new THREE.Vector3()

function phaseName(illumination, waxing) {
  if (illumination < 0.03) return 'nów'
  if (illumination > 0.97) return 'pełnia'
  if (illumination < 0.36) return waxing ? 'przybywający sierp' : 'ubywający sierp'
  if (illumination < 0.66) return waxing ? 'pierwsza kwadra' : 'ostatnia kwadra'
  return waxing ? 'przybywający garb' : 'ubywający garb'
}

export function computeMoonPhase(earth, moon, sun = origin) {
  moonToSun.subVectors(sun, moon)
  moonToEarth.subVectors(earth, moon)
  if (moonToSun.lengthSq() < 1e-12 || moonToEarth.lengthSq() < 1e-12) {
    return { angle: Math.PI / 2, illumination: 0.5, waxing: true, name: 'pierwsza kwadra' }
  }
  moonToSun.normalize()
  moonToEarth.normalize()
  const cosAngle = THREE.MathUtils.clamp(moonToSun.dot(moonToEarth), -1, 1)
  const angle = Math.acos(cosAngle)
  const illumination = (1 + cosAngle) / 2

  earthToSun.subVectors(sun, earth)
  earthToMoon.subVectors(moon, earth)
  const signed = earthToSun.x * earthToMoon.z - earthToSun.z * earthToMoon.x
  const waxing = signed > 0

  return { angle, illumination, waxing, name: phaseName(illumination, waxing) }
}

export function moonPhaseFromBodies(bodies) {
  const earth = bodies.find((body) => body.data?.id === 'earth')
  const moon = earth?.moons?.[0]
  if (!earth || !moon) return null
  earth.anchor.getWorldPosition(earthPos)
  moon.anchor.getWorldPosition(moonPos)
  return computeMoonPhase(earthPos, moonPos)
}

export function drawMoonPhase(canvas, phase) {
  const ctx = canvas.getContext('2d')
  const size = canvas.width
  const cx = size / 2
  const cy = size / 2
  const radius = size / 2 - 1.5
  const lightX = (phase.waxing ? 1 : -1) * Math.sin(phase.angle)
  const lightZ = Math.cos(phase.angle)

  ctx.clearRect(0, 0, size, size)
  const image = ctx.createImageData(size, size)
  const data = image.data

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      const x = (px + 0.5 - cx) / radius
      const y = (py + 0.5 - cy) / radius
      const rho = x * x + y * y
      const i = (py * size + px) * 4
      if (rho > 1) continue
      const z = Math.sqrt(1 - rho)
      const lit = x * lightX + z * lightZ > 0
      const shade = lit ? 1 : 0.16
      const edge = Math.min(1, (1 - Math.sqrt(rho)) * 8)
      data[i] = Math.round((lit ? 240 : 42) * shade * edge)
      data[i + 1] = Math.round((lit ? 230 : 48) * shade * edge)
      data[i + 2] = Math.round((lit ? 196 : 62) * shade * edge)
      data[i + 3] = Math.round(255 * Math.min(1, edge + 0.15))
    }
  }

  ctx.putImageData(image, 0, 0)
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(240, 195, 106, 0.45)'
  ctx.lineWidth = 1
  ctx.stroke()
}
