import * as THREE from 'three'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js'

const STAR_RADIUS = 860
const LINE_RADIUS = 840
const ECLIPTIC_OBLIQUITY = THREE.MathUtils.degToRad(23.439281)

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
      uSize: { value: 3.1 },
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
      void main() {
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float d = dot(p, p);
        if (d > 1.0) discard;
        float a = exp(-d * 2.6);
        gl_FragColor = vec4(vColor, a);
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
  const count = catalog.count
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const sizes = new Float32Array(count)
  const color = new THREE.Color()

  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = catalog.x[i] * STAR_RADIUS
    positions[i * 3 + 1] = catalog.y[i] * STAR_RADIUS
    positions[i * 3 + 2] = catalog.z[i] * STAR_RADIUS
    color.copy(bvToColor(catalog.bv[i]))
    // Słabsze gwiazdy gasną, żeby Droga Mleczna rysowała się zagęszczeniem, nie szumem.
    const fade = THREE.MathUtils.clamp(1.28 - catalog.mag[i] * 0.1, 0.38, 1)
    colors[i * 3] = color.r * fade
    colors[i * 3 + 1] = color.g * fade
    colors[i * 3 + 2] = color.b * fade
    sizes[i] = magToSize(catalog.mag[i])
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

function createFallbackSky(texture) {
  const material = new THREE.MeshBasicMaterial({
    map: texture ?? null,
    color: texture ? 0xffffff : 0x070b16,
    side: THREE.BackSide,
    depthWrite: false,
  })
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 64, 32), material)
  sky.name = 'milkyway'
  sky.rotation.y = Math.PI
  return sky
}

export function createSky(texture, catalog) {
  const root = new THREE.Group()
  root.name = 'sky'

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
    wash.rotation.y = Math.PI
    // Lekki obrót o nachylenie ekliptyki, żeby pas MW nie kłócił się ostro z orbitami.
    wash.rotation.x = ECLIPTIC_OBLIQUITY * 0.35
    root.add(wash)
  }

  root.add(createStarPoints(catalog))
  const lines = createConstellationLines(catalog)
  root.add(lines)
  root.userData.lineMaterial = lines.material
  return root
}

export function resizeSky(sky, width, height) {
  sky?.userData.lineMaterial?.resolution.set(width, height)
}

export function setConstellationLinesVisible(sky, visible) {
  const lines = sky?.getObjectByName('constellations')
  if (!lines) return false
  lines.visible = visible
  return visible
}

export function loadStarCatalog() {
  return fetch(`${import.meta.env.BASE_URL}data/stars.json`)
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null)
}
