import * as THREE from 'three'
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
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
const hud = bindHud()

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

let simTimeDays = 0
let system = { bodies: [], pickables: [] }
let focus = null

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

function setFocus(mesh) {
  mesh.getWorldPosition(lookTarget)
  focusOffset.copy(camera.position).sub(lookTarget)
  if (focusOffset.length() < 0.001) {
    focusOffset.set(0, mesh.userData.focusDistance * 0.35, mesh.userData.focusDistance)
  }
  focusOffset.setLength(mesh.userData.focusDistance)
  focus = {
    mesh,
    from: camera.position.clone(),
    to: lookTarget.clone().add(focusOffset),
    lookFrom: lookTarget.clone(),
    elapsed: 0,
    duration: 1.15,
  }
  hud.setFocus(mesh.userData.name)
}

function updateFocus(delta) {
  if (!focus) return
  if (fly.isMoving()) {
    focus = null
    hud.setFocus(null)
    return
  }

  focus.elapsed += delta
  const t = Math.min(1, focus.elapsed / focus.duration)
  const eased = 1 - (1 - t) ** 3
  focus.mesh.getWorldPosition(lookTarget)
  const destination = lookTarget.clone().add(focusOffset)
  camera.position.lerpVectors(focus.from, destination, eased)
  const currentLook = lookTarget.clone()
  camera.lookAt(currentLook)
  fly.euler.setFromQuaternion(camera.quaternion)
  if (t >= 1) {
    hud.setFocus(focus.mesh.userData.name)
  }
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
  labelRenderer.setSize(window.innerWidth, window.innerHeight)
}

function onCanvasClick(event) {
  if (!fly.wasClick()) return
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1
  raycaster.setFromCamera(pointer, camera)
  const hits = raycaster.intersectObjects(system.pickables, false)
  if (hits.length > 0) {
    setFocus(hits[0].object)
  }
}

function animate() {
  requestAnimationFrame(animate)
  const delta = Math.min(clock.getDelta(), 0.05)
  simTimeDays += delta * hud.getTimeScale()
  updateSolarSystem(system.bodies, simTimeDays)
  if (focus) {
    updateFocus(delta)
  } else {
    fly.update(delta)
  }
  hud.setDate(simTimeDays)
  hud.setSpeed(fly.speed)
  renderer.render(scene, camera)
  labelRenderer.render(scene, camera)
}

async function start() {
  const textures = await loadTextures()
  scene.add(createSky(textures.milkyway))
  system = createSolarSystem(scene, textures)
  updateSolarSystem(system.bodies, simTimeDays)
  hud.setDate(simTimeDays)
  hud.setSpeed(fly.speed)
  hud.setFocus(null)
  loading.classList.add('hidden')
  window.addEventListener('resize', onResize)
  renderer.domElement.addEventListener('click', onCanvasClick)
  clock.start()
  animate()
}

start()
