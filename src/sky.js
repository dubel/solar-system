import * as THREE from 'three'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import { CONSTELLATIONS } from './data/constellations.js'
import { NOTABLE_STARS } from './data/notableStars.js'

const STAR_RADIUS = 860
const LINE_RADIUS = 840
const LABEL_RADIUS = 820
const ECLIPTIC_OBLIQUITY = THREE.MathUtils.degToRad(23.439281)
const STAR_KEEP_FRACTION = 0.7
const STAR_BRIGHTNESS = 0.75
const STAR_POINT_SIZE = 3.1
const STAR_FOCUS_DISTANCE = 640

export function equatorialToScene(raHours, decDeg, radius = 1) {
  const ra = THREE.MathUtils.degToRad(raHours * 15)
  const dec = THREE.MathUtils.degToRad(decDeg)
  const xEq = Math.cos(dec) * Math.cos(ra)
  const yEq = Math.cos(dec) * Math.sin(ra)
  const zEq = Math.sin(dec)
  const cosE = Math.cos(ECLIPTIC_OBLIQUITY)
  const sinE = Math.sin(ECLIPTIC_OBLIQUITY)
  const xEcl = xEq
  const yEcl = yEq * cosE + zEq * sinE
  const zEcl = -yEq * sinE + zEq * cosE
  return new THREE.Vector3(xEcl, zEcl, yEcl).multiplyScalar(radius)
}

export function createNotableStarMarkers() {
  const group = new THREE.Group()
  group.name = 'notable-stars'
  const pickables = []
  const geometry = new THREE.SphereGeometry(22, 8, 8)
  const material = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: false,
  })

  for (const star of NOTABLE_STARS) {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.copy(equatorialToScene(star.raHours, star.decDeg, STAR_RADIUS))
    mesh.userData = {
      id: star.id,
      name: star.name,
      kind: 'star',
      focusDistance: STAR_FOCUS_DISTANCE,
      color: star.color,
      mag: star.mag,
    }
    group.add(mesh)
    pickables.push(mesh)
  }

  const glow = createStarGlow()
  group.add(glow)

  return {
    group,
    pickables,
    highlight(mesh) {
      if (!mesh) {
        glow.visible = false
        return
      }
      glow.position.copy(mesh.position)
      const mag = mesh.userData.mag ?? 1
      const size = THREE.MathUtils.clamp(62 + (1.2 - mag) * 8, 52, 88)
      glow.scale.setScalar(size)
      glow.material.uniforms.uColor.value.set(mesh.userData.color ?? '#fff4d8')
      glow.visible = true
    },
    tick(elapsed) {
      if (glow.visible) glow.material.uniforms.uTime.value = elapsed
    },
    setBrightness(factor) {
      glow.material.uniforms.uIntensity.value = Math.max(0, factor)
    },
  }
}

function createStarGlow() {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color('#fff4d8') },
      uTime: { value: 0 },
      uIntensity: { value: 1 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform vec3 uColor;
      uniform float uTime;
      uniform float uIntensity;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        float ang = 0.3;
        float ca = cos(ang);
        float sa = sin(ang);
        vec2 q = vec2(ca * p.x - sa * p.y, sa * p.x + ca * p.y);

        float core = exp(-r * r * 28.0);
        float halo = exp(-r * r * 6.5) * 0.48;
        float bloom = exp(-r * r * 2.4) * 0.14;

        float ax = abs(q.x);
        float ay = abs(q.y);
        float spikeH = exp(-ay * 42.0) * exp(-ax * ax * 3.4) * smoothstep(0.82, 0.08, ax);
        float spikeV = exp(-ax * 42.0) * exp(-ay * ay * 3.4) * smoothstep(0.82, 0.08, ay);
        float spikes = max(spikeH, spikeV);

        float pulse = 0.9 + 0.1 * sin(uTime * 1.4);
        float edge = 1.0 - smoothstep(0.62, 0.92, r);
        float a = (core * 1.25 + halo + bloom + spikes * 0.9) * pulse * uIntensity * edge;
        if (a < 0.02) discard;
        gl_FragColor = vec4(uColor * (0.5 + 0.5 * core), a);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    side: THREE.DoubleSide,
  })
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material)
  glow.name = 'star-highlight'
  glow.visible = false
  glow.frustumCulled = false
  glow.renderOrder = 2
  glow.onBeforeRender = (_renderer, _scene, camera) => {
    glow.quaternion.copy(camera.quaternion)
  }
  return glow
}

function selectStarIndices(catalog) {
  const target = Math.round(catalog.count * STAR_KEEP_FRACTION)
  const required = new Set()
  for (const [ia, ib] of catalog.lines ?? []) {
    required.add(ia)
    required.add(ib)
  }
  const kept = []
  for (let i = 0; i < catalog.count; i += 1) {
    if (required.has(i)) kept.push(i)
  }
  // Katalog jest posortowany od najjaśniejszych — dobieramy resztę od góry.
  for (let i = 0; i < catalog.count && kept.length < target; i += 1) {
    if (!required.has(i)) kept.push(i)
  }
  return kept
}

function bvToColor(bv) {
  const t = THREE.MathUtils.clamp(bv, -0.4, 2.0)
  const color = new THREE.Color()
  if (t < 0) {
    const u = (t + 0.4) / 0.4
    color.setRGB(0.72 + 0.28 * u, 0.82 + 0.18 * u, 1)
  } else if (t < 0.45) {
    const u = t / 0.45
    color.setRGB(1, 1, 1 - 0.22 * u)
  } else if (t < 1.6) {
    const u = (t - 0.45) / 1.15
    color.setRGB(1, 1 - 0.38 * u, 0.78 - 0.58 * u)
  } else {
    const u = (t - 1.6) / 0.4
    color.setRGB(1, 0.62 - 0.18 * u, 0.2)
  }
  return color
}

function magToSize(mag) {
  const flux = 10 ** (-0.2 * (mag + 1.2))
  return THREE.MathUtils.clamp(1.15 + 14 * flux, 1.1, 8.5)
}

function createStarMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSize: { value: STAR_POINT_SIZE },
      uBrightness: { value: 1 },
    },
    vertexShader: `
      attribute float aSize;
      attribute vec3 aColor;
      varying vec3 vColor;
      uniform float uSize;
      void main() {
        vColor = aColor;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = max(1.4, aSize * uSize);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      uniform float uBrightness;
      void main() {
        if (uBrightness < 0.002) discard;
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float d = dot(p, p);
        if (d > 1.0) discard;
        float a = exp(-d * 2.6);
        gl_FragColor = vec4(vColor * uBrightness, a);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })
}

function createStarPoints(catalog) {
  const kept = selectStarIndices(catalog)
  const count = kept.length
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const sizes = new Float32Array(count)
  const color = new THREE.Color()

  for (let n = 0; n < count; n += 1) {
    const i = kept[n]
    positions[n * 3] = catalog.x[i] * STAR_RADIUS
    positions[n * 3 + 1] = catalog.y[i] * STAR_RADIUS
    positions[n * 3 + 2] = catalog.z[i] * STAR_RADIUS
    color.copy(bvToColor(catalog.bv[i]))
    // Słabsze gwiazdy gasną, żeby Droga Mleczna rysowała się zagęszczeniem, nie szumem.
    const fade = THREE.MathUtils.clamp(1.28 - catalog.mag[i] * 0.1, 0.38, 1) * STAR_BRIGHTNESS
    colors[n * 3] = color.r * fade
    colors[n * 3 + 1] = color.g * fade
    colors[n * 3 + 2] = color.b * fade
    sizes[n] = magToSize(catalog.mag[i])
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))

  const points = new THREE.Points(geometry, createStarMaterial())
  points.frustumCulled = false
  points.name = 'catalog-stars'
  return points
}

function createConstellationLines(catalog) {
  const positions = []
  for (const [ia, ib] of catalog.lines) {
    positions.push(
      catalog.x[ia] * LINE_RADIUS,
      catalog.y[ia] * LINE_RADIUS,
      catalog.z[ia] * LINE_RADIUS,
      catalog.x[ib] * LINE_RADIUS,
      catalog.y[ib] * LINE_RADIUS,
      catalog.z[ib] * LINE_RADIUS,
    )
  }
  const geometry = new LineSegmentsGeometry()
  geometry.setPositions(positions)
  const material = new LineMaterial({
    color: 0x8fa4c8,
    linewidth: 1.05,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
    toneMapped: false,
    worldUnits: false,
  })
  const lines = new LineSegments2(geometry, material)
  lines.frustumCulled = false
  lines.name = 'constellations'
  lines.visible = false
  lines.computeLineDistances()
  return lines
}

function createConstellationLabels() {
  const group = new THREE.Group()
  group.name = 'constellation-labels'
  group.visible = false
  for (const constellation of CONSTELLATIONS) {
    const el = document.createElement('div')
    el.className = 'label label--constellation'
    el.textContent = constellation.name
    const label = new CSS2DObject(el)
    label.position.copy(
      equatorialToScene(constellation.raHours, constellation.decDeg, LABEL_RADIUS),
    )
    group.add(label)
  }
  return group
}

function createFallbackSky(texture) {
  const material = new THREE.MeshBasicMaterial({
    map: texture ?? null,
    color: texture ? 0xffffff : 0x070b16,
    side: THREE.BackSide,
    depthWrite: false,
    transparent: true,
    opacity: 1,
  })
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 64, 32), material)
  sky.name = 'milkyway'
  sky.rotation.y = Math.PI
  return sky
}

export function createSky(texture, catalog) {
  const root = new THREE.Group()
  root.name = 'sky'
  root.userData.baseWashOpacity = 1
  root.userData.baseLineOpacity = 0.4
  root.userData.baseLabelOpacity = 0.86

  if (!catalog?.count) {
    root.add(createFallbackSky(texture))
    return root
  }

  // Delikatna, niewspółrzędna poświata — tylko żeby czerń nie była płaska.
  // Gwiazdy i linie są w ekliptyce J2000; tej mapy nie traktujemy astrometrycznie.
  if (texture) {
    const wash = new THREE.Mesh(
      new THREE.SphereGeometry(900, 48, 32),
      new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.BackSide,
        depthWrite: false,
        transparent: true,
        opacity: 0.18,
        toneMapped: false,
      }),
    )
    wash.name = 'milkyway'
    wash.rotation.y = Math.PI
    // Lekki obrót o nachylenie ekliptyki, żeby pas MW nie kłócił się ostro z orbitami.
    wash.rotation.x = ECLIPTIC_OBLIQUITY * 0.35
    root.add(wash)
    root.userData.baseWashOpacity = 0.18
  }

  root.add(createStarPoints(catalog))
  const lines = createConstellationLines(catalog)
  root.add(lines)
  root.add(createConstellationLabels())
  root.userData.lineMaterial = lines.material
  return root
}

export function setSkyBrightness(sky, factor) {
  if (!sky) return
  const gain = Math.max(0, factor)
  const stars = sky.getObjectByName('catalog-stars')
  if (stars) {
    if (stars.material?.uniforms?.uBrightness) {
      stars.material.uniforms.uBrightness.value = gain
    }
    // Po ~0.85 RGB gwiazd zaczyna się nasycać — dalej rosną rozmiarem, nie mgłą tła.
    if (stars.material?.uniforms?.uSize) {
      const extra = Math.max(0, gain - 0.85) / (2.2 - 0.85)
      stars.material.uniforms.uSize.value = STAR_POINT_SIZE * (1 + 0.55 * extra)
    }
    stars.visible = gain > 0.002
  }
  const wash = sky.getObjectByName('milkyway')
  if (wash?.material) {
    // Poświata MW nie idzie powyżej oryginału — inaczej przy 100% zagłusza gwiazdy.
    const opacity = (sky.userData.baseWashOpacity ?? 0.18) * Math.min(gain, 1)
    wash.material.opacity = opacity
    wash.visible = opacity > 0.002
  }
  const lines = sky.getObjectByName('constellations')
  if (lines?.material) {
    lines.material.opacity = (sky.userData.baseLineOpacity ?? 0.4) * Math.min(gain, 1)
  }
  const labels = sky.getObjectByName('constellation-labels')
  if (labels) {
    const labelOpacity = (sky.userData.baseLabelOpacity ?? 0.86) * Math.min(gain, 1)
    for (const label of labels.children) {
      label.element.style.opacity = String(labelOpacity)
    }
  }
}

export function resizeSky(sky, width, height) {
  sky?.userData.lineMaterial?.resolution.set(width, height)
}

export function setConstellationLinesVisible(sky, visible) {
  const lines = sky?.getObjectByName('constellations')
  const labels = sky?.getObjectByName('constellation-labels')
  if (!lines) return false
  lines.visible = visible
  if (labels) {
    labels.visible = visible
    if (!visible) {
      for (const label of labels.children) {
        label.element.style.display = 'none'
      }
    }
  }
  return visible
}

const _labelCamDir = new THREE.Vector3()
const _labelOffset = new THREE.Vector3()

export function updateConstellationLabels(sky, camera) {
  const labels = sky?.getObjectByName('constellation-labels')
  if (!labels?.visible) return
  camera.getWorldDirection(_labelCamDir)
  for (const label of labels.children) {
    _labelOffset.copy(label.position).sub(camera.position)
    label.element.style.display = _labelOffset.dot(_labelCamDir) > 0 ? '' : 'none'
  }
}

export function loadStarCatalog() {
  return fetch(`${import.meta.env.BASE_URL}data/stars.json`)
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null)
}
