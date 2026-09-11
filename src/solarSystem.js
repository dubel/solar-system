import * as THREE from 'three'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import {
  ISS,
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

// SphereGeometry: u=0 jest na lokalnym −X (szew), u=0.5 (środek mapy = morza, strona widoczna
// z Ziemi) na lokalnym +X. Yaw tak, by +X patrzyło na rodzica (Ziemię).
function faceParentYaw(position, phaseDeg = 0) {
  return Math.atan2(position.z, -position.x) + THREE.MathUtils.degToRad(phaseDeg)
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

const EARTH_CLOUD_PERIOD = 0.9 // doby — trochę szybciej niż obrót Ziemi, by chmury dryfowały
const sunDirection = new THREE.Vector3()

// Światła miast: mapa nocna widoczna tylko po nieoświetlonej stronie.
// Wstrzykujemy to w MeshStandardMaterial (zachowując oświetlenie i tonemapping sceny);
// kierunek do Słońca podajemy uniformem, aktualizowanym co klatkę.
function applyNightLights(material, nightTexture) {
  material.emissiveMap = nightTexture
  material.emissive = new THREE.Color(0xffffff)
  material.emissiveIntensity = 1.5
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSunDirection = { value: new THREE.Vector3(1, 0, 0) }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSurfaceNormalW;')
      .replace(
        '#include <beginnormal_vertex>',
        '#include <beginnormal_vertex>\n  vSurfaceNormalW = mat3(modelMatrix) * objectNormal;',
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vSurfaceNormalW;\nuniform vec3 uSunDirection;',
      )
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n  float sunDot = dot(normalize(vSurfaceNormalW), normalize(uSunDirection));\n  totalEmissiveRadiance *= 1.0 - smoothstep(-0.08, 0.15, sunDot);',
      )
    material.userData.shader = shader
  }
  material.needsUpdate = true
}

function createClouds(radius, texture) {
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    alphaMap: texture,
    transparent: true,
    depthWrite: false,
    roughness: 1,
    metalness: 0,
  })
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.012, 48, 32), material)
  clouds.renderOrder = 1
  return clouds
}

// W modelu NASA "ISS (B)" jest 7 zbłąkanych, płaskich siatek-dysków
// (bendedtru*/pCylinder*) odczepionych od stacji (~40 j. w osi Y od reszty).
// To one dają "artefakt / dysk" obok stacji — usuwamy je przy wczytaniu.
const ISS_ARTIFACT_MESHES = new Set([
  'bendedtru1',
  'bendedtru2',
  'bendedtru3',
  'bendedtrus',
  'pCylinder1',
  'pCylinder2',
  'pCylinder8',
])

function stripArtifactMeshes(model, names) {
  const toRemove = []
  model.traverse((object) => {
    if (!object.isMesh) return
    const base = object.name.replace(/_\d+$/, '')
    if (names.has(object.name) || names.has(base)) toRemove.push(object)
  })
  for (const mesh of toRemove) {
    mesh.removeFromParent()
    mesh.geometry?.dispose()
  }
}

// Normalizuje wczytany model glTF (centruje i skaluje do umownego rozmiaru sceny)
// oraz opakowuje go w grupy: anchor (orbita) -> spin (obrót własny) -> model.
function createSatellite(model, data) {
  stripArtifactMeshes(model, ISS_ARTIFACT_MESHES)

  const box = new THREE.Box3().setFromObject(model)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z) || 1
  const scale = data.targetSize / maxDim

  model.position.sub(center) // pivot w środku modelu

  const spin = new THREE.Group()
  spin.add(model)
  spin.scale.setScalar(scale)
  spin.userData = {
    id: data.id,
    name: data.name,
    focusDistance: data.focusDistance,
  }

  const anchor = new THREE.Group()
  anchor.add(spin)

  return { data, anchor, spin }
}

export function createSolarSystem(scene, textures, models = {}) {
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
      focusDistance: planet.focusDistance ?? radius * 5.5,
    }
    tilt.add(mesh)
    pickables.push(mesh)

    let clouds = null
    let dayNightMaterial = null
    if (planet.nightMap && textures.earthNight) {
      applyNightLights(mesh.material, textures.earthNight)
      dayNightMaterial = mesh.material
    }
    if (planet.clouds && textures.earthClouds) {
      clouds = createClouds(radius, textures.earthClouds)
      tilt.add(clouds)
    }

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
        const moonTexture = textures[moon.id] ?? textures.moon
        const moonMesh = new THREE.Mesh(
          new THREE.SphereGeometry(moon.visualRadius, 32, 24),
          planetMaterial(moonTexture, moon.color),
        )
        moonMesh.userData = {
          id: moon.id,
          name: moon.name,
          focusDistance: moon.focusDistance ?? 3.4,
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
          label: moonLabel,
        })
      }
    }

    const satellites = []
    if (planet.id === 'earth' && models.iss) {
      const iss = createSatellite(models.iss, ISS)
      anchor.add(iss.anchor)
      pickables.push(iss.spin)
      satellites.push(iss)
    }

    bodies.push({
      kind: 'planet',
      data: planet,
      orbitRadius,
      anchor,
      spin: mesh,
      moons,
      satellites,
      clouds,
      dayNightMaterial,
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

    if (body.clouds) {
      body.clouds.rotation.y = (simTimeDays / EARTH_CLOUD_PERIOD) * Math.PI * 2
    }
    if (body.dayNightMaterial?.userData?.shader) {
      sunDirection.copy(body.anchor.position).negate().normalize()
      body.dayNightMaterial.userData.shader.uniforms.uSunDirection.value.copy(sunDirection)
    }

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
      moon.spin.rotation.y = moon.data.tidalLock
        ? faceParentYaw(moon.anchor.position, moon.data.lockPhaseDeg)
        : (simTimeDays / moon.data.rotationPeriodDays) * Math.PI * 2
    }

    for (const sat of body.satellites ?? []) {
      sat.anchor.position.copy(
        orbitalPosition(
          sat.data.visualOrbitRadius,
          sat.data.inclinationDeg,
          sat.data.orbitalPeriodDays,
          sat.data.meanLongitudeDeg,
          simTimeDays,
        ),
      )
      sat.spin.rotation.y = (simTimeDays / sat.data.rotationPeriodDays) * Math.PI * 2
    }
  }
}

const planetWorld = new THREE.Vector3()

// Przy wielu księżycach etykiety zlewają się z planetą w widoku całego układu.
export function updateMoonLabels(bodies, camera) {
  for (const body of bodies) {
    if (body.kind !== 'planet' || body.moons.length <= 1) continue
    body.anchor.getWorldPosition(planetWorld)
    const dist = camera.position.distanceTo(planetWorld)
    const outermost = body.moons.reduce(
      (max, moon) => Math.max(max, moon.data.visualOrbitRadius),
      0,
    )
    const visible = dist < outermost * 2.2 + 14
    for (const moon of body.moons) {
      if (moon.label) moon.label.visible = visible
    }
  }
}
