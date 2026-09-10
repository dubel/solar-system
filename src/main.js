import * as THREE from 'three'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import { bindExplorer } from './explorer.js'
import { bindFacts } from './facts.js'
import { FlyCamera } from './flyCamera.js'
import { bindHud } from './hud.js'
import { createSky } from './sky.js'
import { createSolarSystem, updateSolarSystem } from './solarSystem.js'
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
  saturnRings: 'saturn_rings.png',
  milkyway: 'milkyway.jpg',
}

const loading = document.querySelector('#loading')
let simTimeDays = 0
const hud = bindHud({
  onJumpToDate(days) {
    simTimeDays = days
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
const facts = bindFacts({ onClose: clearFocus })
document.querySelector('#view-toggle').addEventListener('click', cycleCameraView)

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2500)
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

// Cykl widoków kamery (przycisk „kamera"): domyślny → rzut z góry → zapisany, w pętli.
let view = null
let cameraStep = 0
let defaultView = null
let savedView = null
const overviewView = {
  position: new THREE.Vector3(0, 660, 150),
  target: new THREE.Vector3(0, 0, 0),
}
const viewTargetTmp = new THREE.Vector3()

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

function setFocus(mesh) {
  view = null
  cameraStep = 0
  mesh.getWorldPosition(lookTarget)
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
  hud.setFocus(mesh.userData.name)
  explorer.setActive(mesh.userData.id)
  facts.show(mesh.userData.id)
}

function clearFocus() {
  const wasFocused = focus !== null
  focus = null
  hud.setFocus(null)
  explorer.setActive(null)
  facts.hide()
  if (wasFocused) fly.syncFromCamera()
}

function updateFocus(delta) {
  if (!focus) return
  if (fly.isMoving()) {
    cameraStep = 0
    clearFocus()
    return
  }

  focus.elapsed += delta
  const t = Math.min(1, focus.elapsed / focus.duration)
  const eased = 1 - (1 - t) ** 3
  focus.mesh.getWorldPosition(lookTarget)
  const destination = lookTarget.clone().add(focusOffset)
  camera.position.lerpVectors(focus.from, destination, eased)
  fly.follow(lookTarget)
}

function captureView() {
  return { position: camera.position.clone(), target: fly.target.clone() }
}

function startView(state) {
  if (!state) return
  clearFocus()
  view = {
    fromPosition: camera.position.clone(),
    toPosition: state.position.clone(),
    fromTarget: fly.target.clone(),
    toTarget: state.target.clone(),
    elapsed: 0,
    duration: 1.1,
  }
}

function updateView(delta) {
  if (!view) return
  // Chwyt myszą/klawiaturą przerywa animację i oddaje sterowanie użytkownikowi.
  if (fly.isMoving()) {
    view = null
    cameraStep = 0
    fly.syncFromCamera()
    return
  }
  view.elapsed += delta
  const t = Math.min(1, view.elapsed / view.duration)
  const eased = 1 - (1 - t) ** 3
  camera.position.lerpVectors(view.fromPosition, view.toPosition, eased)
  viewTargetTmp.lerpVectors(view.fromTarget, view.toTarget, eased)
  camera.lookAt(viewTargetTmp)
  if (t >= 1) {
    fly.setTarget(view.toTarget)
    view = null
  }
}

function cycleCameraView() {
  if (cameraStep === 0) {
    // Pierwszy klik: zapamiętaj bieżący widok, wróć do domyślnego.
    savedView = captureView()
    startView(defaultView)
  } else if (cameraStep === 1) {
    // Drugi klik: rzut z góry na cały układ.
    startView(overviewView)
  } else {
    // Trzeci klik: przywróć widok sprzed pierwszego kliknięcia.
    startView(savedView ?? defaultView)
  }
  cameraStep = (cameraStep + 1) % 3
}

function onResize() {
  const { width, height } = viewportSize()
  camera.aspect = width / height
  camera.updateProjectionMatrix()
  renderer.setSize(width, height)
  labelRenderer.setSize(width, height)
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
  hud.setDate(simTimeDays)
  renderer.render(scene, camera)
  labelRenderer.render(scene, camera)
}

async function start() {
  const [textures, issModel] = await Promise.all([loadTextures(), loadISSModel()])
  scene.add(createSky(textures.milkyway))
  system = createSolarSystem(scene, textures, { iss: issModel })
  meshById = new Map(system.pickables.map((mesh) => [mesh.userData.id, mesh]))
  explorer.setAvailable('iss', meshById.has('iss'))
  updateSolarSystem(system.bodies, simTimeDays)
  hud.setDate(simTimeDays)
  hud.setFocus(null)
  defaultView = captureView()
  loading.classList.add('hidden')
  window.addEventListener('resize', onResize)
  window.visualViewport?.addEventListener('resize', onResize)
  window.visualViewport?.addEventListener('scroll', onResize)
  renderer.domElement.addEventListener('click', onCanvasClick)
  clock.start()
  animate()
}

start()
