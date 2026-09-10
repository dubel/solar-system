import * as THREE from 'three'

const LOOK_SPEED = 0.0022
const MIN_PITCH = -Math.PI / 2 + 0.05
const MAX_PITCH = Math.PI / 2 - 0.05
const MIN_SPEED = 4
const MAX_SPEED = 180
const MOVE_KEYS = new Set([
  'Space',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
])

export class FlyCamera {
  constructor(camera, domElement) {
    this.camera = camera
    this.domElement = domElement
    this.speed = 28
    this.keys = new Set()
    this.dragging = false
    this.moved = false
    this.euler = new THREE.Euler(0, 0, 0, 'YXZ')
    this.forward = new THREE.Vector3()
    this.right = new THREE.Vector3()
    this.worldUp = new THREE.Vector3(0, 1, 0)

    this.euler.setFromQuaternion(camera.quaternion)
    this.#bind()
  }

  #bind() {
    this.onMouseDown = (event) => {
      if (event.button !== 0) return
      if (event.target.closest('.hud')) return
      this.dragging = true
      this.moved = false
      this.domElement.style.cursor = 'grabbing'
    }

    this.onMouseMove = (event) => {
      if (!this.dragging) return
      this.moved = this.moved || Math.abs(event.movementX) + Math.abs(event.movementY) > 3
      this.euler.setFromQuaternion(this.camera.quaternion)
      this.euler.y -= event.movementX * LOOK_SPEED
      this.euler.x -= event.movementY * LOOK_SPEED
      this.euler.x = Math.max(MIN_PITCH, Math.min(MAX_PITCH, this.euler.x))
      this.camera.quaternion.setFromEuler(this.euler)
    }

    this.onMouseUp = () => {
      this.dragging = false
      this.domElement.style.cursor = 'grab'
    }

    this.onWheel = (event) => {
      event.preventDefault()
      const factor = event.deltaY > 0 ? 0.9 : 1.1
      this.speed = THREE.MathUtils.clamp(this.speed * factor, MIN_SPEED, MAX_SPEED)
    }

    this.onKeyDown = (event) => {
      if (event.target instanceof Element && event.target.closest('input, textarea, select')) return
      if (MOVE_KEYS.has(event.code)) event.preventDefault()
      this.keys.add(event.code)
    }

    this.onKeyUp = (event) => {
      this.keys.delete(event.code)
    }

    this.onContextMenu = (event) => event.preventDefault()

    this.domElement.addEventListener('mousedown', this.onMouseDown)
    window.addEventListener('mousemove', this.onMouseMove)
    window.addEventListener('mouseup', this.onMouseUp)
    this.domElement.addEventListener('wheel', this.onWheel, { passive: false })
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    this.domElement.addEventListener('contextmenu', this.onContextMenu)
    this.domElement.style.cursor = 'grab'
  }

  isMoving() {
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

    this.camera.getWorldDirection(this.forward)
    this.right.crossVectors(this.forward, this.worldUp).normalize()

    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) {
      this.camera.position.addScaledVector(this.forward, distance)
    }
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) {
      this.camera.position.addScaledVector(this.forward, -distance)
    }
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) {
      this.camera.position.addScaledVector(this.right, distance)
    }
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) {
      this.camera.position.addScaledVector(this.right, -distance)
    }
    if (this.keys.has('KeyE') || this.keys.has('Space')) {
      this.camera.position.y += distance
    }
    if (this.keys.has('KeyQ') || this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) {
      this.camera.position.y -= distance
    }
  }
}
