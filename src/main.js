import * as THREE from 'three'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import { bindExplorer } from './explorer.js'
import { bindFacts } from './facts.js'
import { FlyCamera } from './flyCamera.js'
import { bindHud, clampIsoDate, isoToSimDays, simDaysToIso } from './hud.js'
import { parseShareLink, writeShareLink } from './shareLink.js'
import { createSky, createNotableStarMarkers, loadStarCatalog, resizeSky, setConstellationLinesVisible, updateConstellationLabels } from './sky.js'
import { createSolarSystem, updateMoonLabels, updateSolarSystem } from './solarSystem.js'
import './style.css'

const TEXTURE_FILES = {
  sun: 'sun.jpg',
  mercury: 'mercury.jpg',
  venus: 'venus.jpg',
  earth: 'earth.jpg',
  earthClouds: 'earth_clouds.jpg',
  earthNight: 'earth_night.jpg',
  mars: 'mars.jpg',
  jupiter: 'jupiter.jpg',
  saturn: 'saturn.jpg',
  uranus: 'uranus.jpg',
  neptune: 'neptune.jpg',
  moon: 'moon.jpg',
  io: 'io.jpg',
  europa: 'europa.jpg',
  ganymede: 'ganymede.jpg',
  callisto: 'callisto.jpg',
  saturnRings: 'saturn_rings.png',
  milkyway: 'milkyway.jpg',
}

const loading = document.querySelector('#loading')
const share = parseShareLink()
let simTimeDays = share.date ? isoToSimDays(share.date) : 0
let shareReady = false
let focusedId = null

function currentShareDate() {
  return clampIsoDate(simDaysToIso(simTimeDays))
}

function syncShareLink() {
  if (!shareReady) return
  writeShareLink({ date: currentShareDate(), focus: focusedId })
}

const hud = bindHud({
  onJumpToDate(days) {
    simTimeDays = days
    syncShareLink()
  },
  onTimeScaleChange(daysPerSecond) {
    if (daysPerSecond === 0) syncShareLink()
  },
})

const isCompactLayout = () =>
  window.matchMedia('(pointer: coarse), (max-width: 720px)').matches

let meshById = new Map()
const explorer = bindExplorer({
  onSelect(id) {
    const mesh = meshById.get(id)
    if (!mesh) return
    setFocus(mesh)
    // ISS okrąża Ziemię ~15×/s przy 1 dobie/s — zwalniamy, by dało się ją obserwować.
    if (id === 'iss') hud.setTimeScale(0.001)
    // Na wąskich ekranach lista i panel faktów rywalizują o dół — zamykamy listę.
    if (isCompactLayout()) explorer.close()
  },
})
const facts = bindFacts({
  onClose() {
    if (lockFollow && focus) return
    clearFocus()
  },
})
const constellationToggle = document.querySelector('#constellation-toggle')
const lockToggle = document.querySelector('#lock-toggle')
document.querySelector('#view-toggle').addEventListener('click', cycleCameraView)
constellationToggle.addEventListener('click', () => {
  const lines = skyRoot?.getObjectByName('constellations')
  if (!lines) return
  syncConstellationToggle(setConstellationLinesVisible(skyRoot, !lines.visible))
})
lockToggle.addEventListener('click', () => setLockFollow(!lockFollow))

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 4000)
camera.position.set(0, 28, 78)
camera.lookAt(0, 0, 0)

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setClearColor(0x020309, 1)
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.25
document.body.appendChild(renderer.domElement)

const labelRenderer = new CSS2DRenderer()
labelRenderer.setSize(window.innerWidth, window.innerHeight)
labelRenderer.domElement.className = 'label-renderer'
document.body.appendChild(labelRenderer.domElement)

const fly = new FlyCamera(camera, renderer.domElement)
const clock = new THREE.Clock()
const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
const focusOffset = new THREE.Vector3()
const lookTarget = new THREE.Vector3()

let system = { bodies: [], pickables: [] }
let focus = null
let skyRoot = null
let notableStars = null
let lockFollow = false

// Toggle widoków kamery: start (domyślny) ↔ rzut z góry. Na starcie jesteśmy już
// w widoku domyślnym, więc pierwsze kliknięcie idzie od razu na rzut z góry.
let view = null
let showingOverview = false
const defaultView = {
  position: new THREE.Vector3(0, 28, 78),
  target: new THREE.Vector3(0, 0, 0),
}
const overviewView = {
  position: new THREE.Vector3(0, 660, 150),
  target: new THREE.Vector3(0, 0, 0),
}
const viewTargetTmp = new THREE.Vector3()
const origin = new THREE.Vector3()

function currentLookPoint() {
  return fly.lookPoint ?? fly.target
}

function setFocus(mesh) {
  view = null
  mesh.getWorldPosition(lookTarget)
  focusedId = mesh.userData.id
  hud.setFocus(mesh.userData.name)
  explorer.setActive(mesh.userData.id)
  facts.show(mesh.userData.id)
  syncShareLink()

  if (mesh.userData.kind === 'star') {
    focus = null
    notableStars?.highlight(mesh)
    view = {
      fromPosition: camera.position.clone(),
      toPosition: camera.position.clone(),
      fromTarget: currentLookPoint().clone(),
      toTarget: lookTarget.clone(),
      elapsed: 0,
      duration: 1.05,
      mode: 'star-aim',
    }
    return
  }

  fly.setLookPoint(null)
  notableStars?.highlight(null)
  focusOffset.copy(camera.position).sub(lookTarget)
  if (focusOffset.length() < 0.001) {
    focusOffset.set(0, mesh.userData.focusDistance * 0.35, mesh.userData.focusDistance)
  }
  focusOffset.setLength(mesh.userData.focusDistance)
  focus = {
    mesh,
    from: camera.position.clone(),
    elapsed: 0,
    duration: 1.15,
  }
}

function clearFocus() {
  const wasPlanetFocus = focus !== null
  focus = null
  focusedId = null
  explorer.setActive(null)
  facts.hide()
  if (wasPlanetFocus) fly.syncFromCamera()
  if (!fly.lookPoint) hud.setFocus(null)
  syncShareLink()
}

function finishStarAim(starPos) {
  fly.target.copy(origin)
  fly.setLookPoint(starPos)
  fly.syncFromCamera()
}

function updateFocus(delta) {
  if (!focus) return
  if (!lockFollow && fly.isMoving()) {
    clearFocus()
    return
  }

  focus.elapsed += delta
  const t = Math.min(1, focus.elapsed / focus.duration)
  focus.mesh.getWorldPosition(lookTarget)

  if (lockFollow && (t >= 1 || fly.isMoving())) {
    if (t < 1) {
      focus.elapsed = focus.duration
      fly.target.copy(lookTarget)
      fly.syncFromCamera()
    } else {
      fly.track(lookTarget)
    }
    return
  }

  const eased = 1 - (1 - t) ** 3
  const destination = lookTarget.clone().add(focusOffset)
  camera.position.lerpVectors(focus.from, destination, eased)
  fly.follow(lookTarget)
}

function startView(state) {
  if (!state) return
  const fromLook = currentLookPoint().clone()
  setLockFollow(false)
  clearFocus()
  fly.setLookPoint(null)
  notableStars?.highlight(null)
  hud.setFocus(null)
  view = {
    fromPosition: camera.position.clone(),
    toPosition: state.position.clone(),
    fromTarget: fromLook,
    toTarget: state.target.clone(),
    elapsed: 0,
    duration: 1.1,
  }
}

function updateView(delta) {
  if (!view) return
  // Chwyt myszą/klawiaturą przerywa animację i oddaje sterowanie użytkownikowi.
  if (fly.isMoving()) {
    if (view.mode === 'star-aim') finishStarAim(view.toTarget)
    else fly.syncFromCamera()
    view = null
    return
  }
  view.elapsed += delta
  const t = Math.min(1, view.elapsed / view.duration)
  const eased = 1 - (1 - t) ** 3
  camera.position.lerpVectors(view.fromPosition, view.toPosition, eased)
  viewTargetTmp.lerpVectors(view.fromTarget, view.toTarget, eased)
  camera.lookAt(viewTargetTmp)
  if (t >= 1) {
    if (view.mode === 'star-aim') finishStarAim(view.toTarget)
    else fly.setTarget(view.toTarget)
    view = null
  }
}

function loadTextures() {
  const loader = new THREE.TextureLoader()
  const entries = Object.entries(TEXTURE_FILES)
  return Promise.all(
    entries.map(
      ([key, file]) =>
        new Promise((resolve) => {
          loader.load(
            `${import.meta.env.BASE_URL}textures/${file}`,
            (texture) => {
              texture.colorSpace = THREE.SRGBColorSpace
              texture.anisotropy = 8
              resolve([key, texture])
            },
            undefined,
            () => resolve([key, null]),
          )
        }),
    ),
  ).then((pairs) => Object.fromEntries(pairs))
}

function loadISSModel() {
  const dracoLoader = new DRACOLoader()
  dracoLoader.setDecoderPath(`${import.meta.env.BASE_URL}draco/`)
  const loader = new GLTFLoader()
  loader.setDRACOLoader(dracoLoader)
  return new Promise((resolve) => {
    loader.load(
      `${import.meta.env.BASE_URL}models/iss.glb`,
      (gltf) => {
        dracoLoader.dispose()
        resolve(gltf.scene)
      },
      undefined,
      (error) => {
        // Brak modelu nie może wywrócić całej sceny — degradujemy się łagodnie.
        console.warn('Nie udało się wczytać modelu ISS:', error)
        dracoLoader.dispose()
        resolve(null)
      },
    )
  })
}

function viewportSize() {
  const viewport = window.visualViewport
  return {
    width: Math.round(viewport?.width ?? window.innerWidth),
    height: Math.round(viewport?.height ?? window.innerHeight),
    offsetLeft: viewport?.offsetLeft ?? 0,
    offsetTop: viewport?.offsetTop ?? 0,
  }
}

function cycleCameraView() {
  showingOverview = !showingOverview
  startView(showingOverview ? overviewView : defaultView)
}

function syncLockToggle() {
  lockToggle.setAttribute('aria-pressed', String(lockFollow))
  const label = lockFollow ? 'Wyłącz śledzenie obiektu' : 'Śledź wybrany obiekt'
  lockToggle.setAttribute('aria-label', label)
  lockToggle.title = label
}

function setLockFollow(on) {
  lockFollow = on
  syncLockToggle()
  if (on && focus?.mesh) {
    focus.elapsed = focus.duration
    focus.mesh.getWorldPosition(lookTarget)
    fly.target.copy(lookTarget)
    fly.syncFromCamera()
    return
  }
  if (!on && focus) {
    fly.syncFromCamera()
    focus = null
  }
}

function syncConstellationToggle(visible) {
  constellationToggle.hidden = false
  constellationToggle.setAttribute('aria-pressed', String(visible))
  const label = visible ? 'Ukryj linie gwiazdozbiorów' : 'Pokaż linie gwiazdozbiorów'
  constellationToggle.setAttribute('aria-label', label)
  constellationToggle.title = label
}

function onResize() {
  const { width, height } = viewportSize()
  camera.aspect = width / height
  camera.updateProjectionMatrix()
  renderer.setSize(width, height)
  labelRenderer.setSize(width, height)
  resizeSky(skyRoot, renderer.domElement.width, renderer.domElement.height)
}

function onCanvasClick(event) {
  if (!fly.wasClick()) return
  const { width, height, offsetLeft, offsetTop } = viewportSize()
  pointer.x = ((event.clientX - offsetLeft) / width) * 2 - 1
  pointer.y = -((event.clientY - offsetTop) / height) * 2 + 1
  raycaster.setFromCamera(pointer, camera)
  const hits = raycaster.intersectObjects(system.pickables, false)
  if (hits.length > 0) {
    setFocus(hits[0].object)
  }
}

function animate() {
  requestAnimationFrame(animate)
  const delta = Math.min(clock.getDelta(), 0.05)
  const timeScale = hud.getTimeScale()
  simTimeDays += delta * timeScale
  updateSolarSystem(system.bodies, simTimeDays)
  // ISS wygląda źle przy szybkim upływie czasu — pokazujemy ją tylko na pauzie i 0.001 doby/s.
  const issMesh = meshById.get('iss')
  if (issMesh) issMesh.visible = timeScale <= 0.001
  if (view) {
    updateView(delta)
  } else if (focus) {
    updateFocus(delta)
  } else {
    fly.update(delta)
  }
  notableStars?.tick(clock.elapsedTime)
  updateConstellationLabels(skyRoot, camera)
  updateMoonLabels(system.bodies, camera)
  facts.update(system.bodies)
  hud.setDate(simTimeDays)
  renderer.render(scene, camera)
  labelRenderer.render(scene, camera)
}

async function start() {
  const [textures, issModel, starCatalog] = await Promise.all([
    loadTextures(),
    loadISSModel(),
    loadStarCatalog(),
  ])
  skyRoot = createSky(textures.milkyway, starCatalog)
  scene.add(skyRoot)
  resizeSky(skyRoot, renderer.domElement.width, renderer.domElement.height)
  if (skyRoot.getObjectByName('constellations')) {
    syncConstellationToggle(false)
  }
  notableStars = createNotableStarMarkers()
  scene.add(notableStars.group)
  system = createSolarSystem(scene, textures, { iss: issModel })
  system.pickables.push(...notableStars.pickables)
  meshById = new Map(system.pickables.map((mesh) => [mesh.userData.id, mesh]))
  explorer.setAvailable('iss', meshById.has('iss'))
  updateSolarSystem(system.bodies, simTimeDays)
  if (share.isDeepLink) hud.setTimeScale(0)
  hud.setDate(simTimeDays)
  shareReady = true
  const target = share.focus ? meshById.get(share.focus) : null
  if (target) {
    setFocus(target)
  } else {
    hud.setFocus(null)
    if (share.isDeepLink) syncShareLink()
  }
  loading.classList.add('hidden')
  window.addEventListener('resize', onResize)
  window.visualViewport?.addEventListener('resize', onResize)
  window.visualViewport?.addEventListener('scroll', onResize)
  renderer.domElement.addEventListener('click', onCanvasClick)
  clock.start()
  animate()
}

start()
