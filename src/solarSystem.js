import * as THREE from 'three'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import {
  PLANETS,
  SUN,
  visualOrbitRadius,
  visualPlanetRadius,
} from './data/celestialBodies.js'

function orbitalPosition(radius, inclinationDeg, periodDays, meanLongitudeDeg, simTimeDays) {
  const angle =
    THREE.MathUtils.degToRad(meanLongitudeDeg) + (simTimeDays / periodDays) * Math.PI * 2
  const inclination = THREE.MathUtils.degToRad(inclinationDeg)
  return new THREE.Vector3(
    Math.cos(angle) * radius,
    Math.sin(inclination) * Math.sin(angle) * radius,
    Math.sin(angle) * Math.cos(inclination) * radius,
  )
}

function createOrbitLine(radius, inclinationDeg) {
  const points = []
  const segments = 256
  for (let i = 0; i <= segments; i += 1) {
    const simDays = (i / segments) * 1
    points.push(orbitalPosition(radius, inclinationDeg, 1, 0, simDays))
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points)
  const material = new THREE.LineBasicMaterial({
    color: 0x8aa0c4,
    transparent: true,
    opacity: 0.32,
  })
  return new THREE.Line(geometry, material)
}

function remapRingUVs(geometry, inner, outer) {
  const { position, uv } = geometry.attributes
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i)
    const y = position.getY(i)
    const radius = Math.hypot(x, y)
    uv.setXY(i, (radius - inner) / (outer - inner), 0.5)
  }
  uv.needsUpdate = true
}

function makeLabel(name) {
  const el = document.createElement('div')
  el.className = 'label'
  el.textContent = name
  const label = new CSS2DObject(el)
  label.position.set(0, 0, 0)
  return label
}

function planetMaterial(texture, color) {
  return new THREE.MeshStandardMaterial({
    map: texture ?? null,
    color: texture ? 0xffffff : color,
    roughness: 0.92,
    metalness: 0.02,
  })
}

export function createSolarSystem(scene, textures) {
  const pickables = []
  const bodies = []

  const sunTilt = new THREE.Group()
  sunTilt.rotation.z = THREE.MathUtils.degToRad(SUN.obliquityDeg)
  const sunMesh = new THREE.Mesh(
    new THREE.SphereGeometry(SUN.visualRadius, 64, 48),
    new THREE.MeshBasicMaterial({
      map: textures.sun ?? null,
      color: textures.sun ? 0xffffff : SUN.color,
    }),
  )
  sunMesh.userData = {
    id: SUN.id,
    name: SUN.name,
    focusDistance: SUN.visualRadius * 4.2,
  }
  sunTilt.add(sunMesh)
  const sunLabel = makeLabel(SUN.name)
  sunLabel.position.set(0, SUN.visualRadius + 1.4, 0)
  sunTilt.add(sunLabel)
  scene.add(sunTilt)
  pickables.push(sunMesh)
  bodies.push({
    kind: 'sun',
    spin: sunMesh,
    period: SUN.rotationPeriodDays,
  })

  const sunLight = new THREE.PointLight(0xfff1d0, 900, 0, 1.15)
  scene.add(sunLight)
  scene.add(new THREE.AmbientLight(0x9aa8c8, 0.12))

  for (const planet of PLANETS) {
    const orbitRadius = visualOrbitRadius(planet.au)
    const radius = visualPlanetRadius(planet.radiusKm)
    scene.add(createOrbitLine(orbitRadius, planet.inclinationDeg))

    const anchor = new THREE.Group()
    const tilt = new THREE.Group()
    tilt.rotation.z = THREE.MathUtils.degToRad(planet.obliquityDeg)

    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 48, 32),
      planetMaterial(textures[planet.id], planet.color),
    )
    mesh.userData = {
      id: planet.id,
      name: planet.name,
      focusDistance: radius * 5.5,
    }
    tilt.add(mesh)
    pickables.push(mesh)

    if (planet.rings) {
      const inner = radius * planet.rings.innerScale
      const outer = radius * planet.rings.outerScale
      const ringGeometry = new THREE.RingGeometry(inner, outer, 128)
      remapRingUVs(ringGeometry, inner, outer)
      const ringTexture = textures.saturnRings
      const rings = new THREE.Mesh(
        ringGeometry,
        new THREE.MeshBasicMaterial({
          map: ringTexture ?? null,
          color: ringTexture ? 0xffffff : 0xc9b48a,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: ringTexture ? 1 : 0.7,
          depthWrite: false,
        }),
      )
      rings.rotation.x = Math.PI / 2
      tilt.add(rings)
    }

    const label = makeLabel(planet.name)
    label.position.set(0, radius + 0.85, 0)
    anchor.add(tilt)
    anchor.add(label)
    scene.add(anchor)

    const moons = []
    if (planet.moons) {
      for (const moon of planet.moons) {
        const moonOrbit = createOrbitLine(moon.visualOrbitRadius, moon.inclinationDeg)
        anchor.add(moonOrbit)

        const moonAnchor = new THREE.Group()
        const moonTilt = new THREE.Group()
        moonTilt.rotation.z = THREE.MathUtils.degToRad(moon.obliquityDeg)
        const moonMesh = new THREE.Mesh(
          new THREE.SphereGeometry(moon.visualRadius, 32, 24),
          planetMaterial(textures.moon, moon.color),
        )
        moonMesh.userData = {
          id: moon.id,
          name: moon.name,
          focusDistance: 3.4,
        }
        moonTilt.add(moonMesh)
        const moonLabel = makeLabel(moon.name)
        moonLabel.position.set(0, moon.visualRadius + 0.35, 0)
        moonAnchor.add(moonTilt)
        moonAnchor.add(moonLabel)
        anchor.add(moonAnchor)
        pickables.push(moonMesh)
        moons.push({
          data: moon,
          anchor: moonAnchor,
          spin: moonMesh,
        })
      }
    }

    bodies.push({
      kind: 'planet',
      data: planet,
      orbitRadius,
      anchor,
      spin: mesh,
      moons,
    })
  }

  return { bodies, pickables }
}

export function updateSolarSystem(bodies, simTimeDays) {
  for (const body of bodies) {
    if (body.kind === 'sun') {
      body.spin.rotation.y = (simTimeDays / body.period) * Math.PI * 2
      continue
    }

    body.anchor.position.copy(
      orbitalPosition(
        body.orbitRadius,
        body.data.inclinationDeg,
        body.data.orbitalPeriodDays,
        body.data.meanLongitudeDeg,
        simTimeDays,
      ),
    )
    body.spin.rotation.y = (simTimeDays / body.data.rotationPeriodDays) * Math.PI * 2

    for (const moon of body.moons) {
      moon.anchor.position.copy(
        orbitalPosition(
          moon.data.visualOrbitRadius,
          moon.data.inclinationDeg,
          moon.data.orbitalPeriodDays,
          moon.data.meanLongitudeDeg,
          simTimeDays,
        ),
      )
      moon.spin.rotation.y = (simTimeDays / moon.data.rotationPeriodDays) * Math.PI * 2
    }
  }
}
