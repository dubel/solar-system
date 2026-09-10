import * as THREE from 'three'

const MIN_PITCH = 0.08
const MAX_PITCH = Math.PI - 0.08
const MIN_DISTANCE = 2.5
const MAX_DISTANCE = 420
const MOVE_THRESHOLD = 8
const MOVE_KEYS = new Set([
  'Space',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
])

function pointerDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function pointerMidpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

export class FlyCamera {
  constructor(camera, domElement) {
    this.camera = camera
    this.domElement = domElement
    this.target = new THREE.Vector3()
    this.speed = 28
    this.keys = new Set()
    this.pointers = new Map()
    this.moved = false
    this.dragDistance = 0
    this.gesturing = false
    this.spherical = new THREE.Spherical()
    this.euler = new THREE.Euler(0, 0, 0, 'YXZ')
    this.forward = new THREE.Vector3()
    this.right = new THREE.Vector3()
    this.up = new THREE.Vector3()
    this.offset = new THREE.Vector3()
    this.move = new THREE.Vector3()
    this.worldUp = new THREE.Vector3(0, 1, 0)
    this.prevPinchDist = 0
    this.prevMid = null
    this.prevSingle = null

    this.syncFromCamera()
    this.#bind()
  }

  syncFromCamera() {
    this.offset.copy(this.camera.position).sub(this.target)
    if (this.offset.lengthSq() < 0.0001) {
      this.offset.set(0, 8, 24)
    }
    this.spherical.setFromVector3(this.offset)
    this.spherical.makeSafe()
    this.spherical.phi = THREE.MathUtils.clamp(this.spherical.phi, MIN_PITCH, MAX_PITCH)
    this.spherical.radius = THREE.MathUtils.clamp(this.spherical.radius, MIN_DISTANCE, MAX_DISTANCE)
    this.#apply()
  }

  setTarget(point) {
    this.target.copy(point)
    this.syncFromCamera()
  }

  follow(point) {
    this.target.copy(point)
    this.offset.copy(this.camera.position).sub(this.target)
    if (this.offset.lengthSq() < 0.0001) {
      this.offset.set(0, 8, 24)
    }
    this.spherical.setFromVector3(this.offset)
    this.spherical.makeSafe()
    this.spherical.phi = THREE.MathUtils.clamp(this.spherical.phi, MIN_PITCH, MAX_PITCH)
    this.spherical.radius = THREE.MathUtils.clamp(this.spherical.radius, MIN_DISTANCE, MAX_DISTANCE)
    this.camera.lookAt(this.target)
    this.euler.setFromQuaternion(this.camera.quaternion)
  }

  #apply() {
    this.offset.setFromSpherical(this.spherical)
    this.camera.position.copy(this.target).add(this.offset)
    this.camera.lookAt(this.target)
    this.euler.setFromQuaternion(this.camera.quaternion)
  }

  #bind() {
    this.onPointerDown = (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return
      if (event.target instanceof Element && event.target.closest('.hud')) return
      this.domElement.setPointerCapture(event.pointerId)
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      this.gesturing = true
      if (this.pointers.size === 1) {
        this.moved = false
        this.dragDistance = 0
        this.prevSingle = { x: event.clientX, y: event.clientY }
        this.domElement.style.cursor = 'grabbing'
      } else {
        this.moved = true
        this.dragDistance = MOVE_THRESHOLD + 1
        this.#resetPinchState()
      }
    }

    this.onPointerMove = (event) => {
      if (!this.pointers.has(event.pointerId)) return
      event.preventDefault()
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (this.pointers.size === 1) {
        this.#orbitFromSingle(event.clientX, event.clientY)
      } else if (this.pointers.size >= 2) {
        this.#pinchAndPan()
      }
    }

    this.onPointerUp = (event) => {
      if (!this.pointers.has(event.pointerId)) return
      this.pointers.delete(event.pointerId)
      if (this.pointers.size === 0) {
        this.gesturing = false
        this.prevSingle = null
        this.prevPinchDist = 0
        this.prevMid = null
        this.domElement.style.cursor = 'grab'
      } else if (this.pointers.size === 1) {
        const remaining = this.pointers.values().next().value
        this.prevSingle = { x: remaining.x, y: remaining.y }
        this.prevPinchDist = 0
        this.prevMid = null
      }
    }

    this.onWheel = (event) => {
      event.preventDefault()
      const factor = event.deltaY > 0 ? 1.08 : 0.92
      this.#dolly(factor)
      this.moved = true
    }

    this.onKeyDown = (event) => {
      if (event.target instanceof Element && event.target.closest('input, textarea, select, summary')) return
      if (MOVE_KEYS.has(event.code)) event.preventDefault()
      this.keys.add(event.code)
    }

    this.onKeyUp = (event) => {
      this.keys.delete(event.code)
    }

    this.onContextMenu = (event) => event.preventDefault()

    this.domElement.addEventListener('pointerdown', this.onPointerDown)
    this.domElement.addEventListener('pointermove', this.onPointerMove, { passive: false })
    this.domElement.addEventListener('pointerup', this.onPointerUp)
    this.domElement.addEventListener('pointercancel', this.onPointerUp)
    this.domElement.addEventListener('wheel', this.onWheel, { passive: false })
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    this.domElement.addEventListener('contextmenu', this.onContextMenu)
    this.domElement.style.cursor = 'grab'
    this.domElement.style.touchAction = 'none'
  }

  #resetPinchState() {
    const [a, b] = [...this.pointers.values()]
    this.prevPinchDist = pointerDistance(a, b)
    this.prevMid = pointerMidpoint(a, b)
  }

  #orbitFromSingle(x, y) {
    if (!this.prevSingle) {
      this.prevSingle = { x, y }
      return
    }
    const dx = x - this.prevSingle.x
    const dy = y - this.prevSingle.y
    this.prevSingle = { x, y }
    this.dragDistance += Math.abs(dx) + Math.abs(dy)
    if (this.dragDistance > MOVE_THRESHOLD) this.moved = true
    const rotateScale = (2 * Math.PI) / Math.max(this.domElement.clientHeight, 1)
    this.spherical.theta -= dx * rotateScale
    this.spherical.phi -= dy * rotateScale
    this.spherical.phi = THREE.MathUtils.clamp(this.spherical.phi, MIN_PITCH, MAX_PITCH)
    this.#apply()
  }

  #pinchAndPan() {
    const [a, b] = [...this.pointers.values()]
    const dist = pointerDistance(a, b)
    const mid = pointerMidpoint(a, b)
    if (this.prevPinchDist > 0) {
      this.#dolly(this.prevPinchDist / dist)
    }
    if (this.prevMid) {
      this.#pan(mid.x - this.prevMid.x, mid.y - this.prevMid.y)
    }
    this.prevPinchDist = dist
    this.prevMid = mid
    this.moved = true
  }

  #dolly(factor) {
    this.spherical.radius = THREE.MathUtils.clamp(
      this.spherical.radius * factor,
      MIN_DISTANCE,
      MAX_DISTANCE,
    )
    this.#apply()
  }

  #pan(dx, dy) {
    const height = Math.max(this.domElement.clientHeight, 1)
    const fov = THREE.MathUtils.degToRad(this.camera.fov)
    const panScale = (2 * this.spherical.radius * Math.tan(fov / 2)) / height
    this.camera.getWorldDirection(this.forward)
    this.right.crossVectors(this.forward, this.worldUp).normalize()
    this.up.crossVectors(this.right, this.forward).normalize()
    this.target.addScaledVector(this.right, -dx * panScale)
    this.target.addScaledVector(this.up, dy * panScale)
    this.#apply()
  }

  isMoving() {
    if (this.gesturing) return true
    return (
      this.keys.has('KeyW') ||
      this.keys.has('KeyA') ||
      this.keys.has('KeyS') ||
      this.keys.has('KeyD') ||
      this.keys.has('ArrowUp') ||
      this.keys.has('ArrowDown') ||
      this.keys.has('ArrowLeft') ||
      this.keys.has('ArrowRight') ||
      this.keys.has('KeyQ') ||
      this.keys.has('KeyE') ||
      this.keys.has('Space') ||
      this.keys.has('ShiftLeft') ||
      this.keys.has('ShiftRight')
    )
  }

  wasClick() {
    return !this.moved
  }

  update(delta) {
    const distance = this.speed * delta
    this.move.set(0, 0, 0)

    this.camera.getWorldDirection(this.forward)
    this.right.crossVectors(this.forward, this.worldUp).normalize()

    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) this.move.add(this.forward)
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) this.move.sub(this.forward)
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) this.move.add(this.right)
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) this.move.sub(this.right)
    if (this.keys.has('KeyE') || this.keys.has('Space')) this.move.add(this.worldUp)
    if (this.keys.has('KeyQ') || this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) {
      this.move.sub(this.worldUp)
    }

    if (this.move.lengthSq() === 0) return
    this.move.normalize().multiplyScalar(distance)
    this.camera.position.add(this.move)
    this.target.add(this.move)
    this.syncFromCamera()
  }
}
