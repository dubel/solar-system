import { PLANETS, SUN } from './data/celestialBodies.js'

function textureUrl(file) {
  return `${import.meta.env.BASE_URL}textures/${file}`
}

function buildEntries() {
  const entries = [{ id: SUN.id, name: SUN.name, kind: 'Gwiazda', texture: SUN.texture }]

  for (const planet of PLANETS) {
    entries.push({
      id: planet.id,
      name: planet.name,
      kind: 'Planeta',
      texture: planet.texture,
    })

    for (const moon of planet.moons ?? []) {
      entries.push({
        id: moon.id,
        name: moon.name,
        kind: `Księżyc · ${planet.name}`,
        texture: moon.texture,
      })
    }
  }

  return entries
}

function createItem(entry, index, onSelect) {
  const li = document.createElement('li')

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'object-item'
  button.dataset.id = entry.id

  const thumb = document.createElement('span')
  thumb.className = 'object-thumb'
  thumb.style.setProperty('--tex', `url("${textureUrl(entry.texture)}")`)
  // Stagger the rotation so the thumbnails do not all spin in lockstep.
  thumb.style.setProperty('--delay', `-${(index % 6) * 1.3}s`)

  const info = document.createElement('span')
  info.className = 'object-info'

  const name = document.createElement('span')
  name.className = 'object-name'
  name.textContent = entry.name

  const kind = document.createElement('span')
  kind.className = 'object-kind'
  kind.textContent = entry.kind

  info.append(name, kind)
  button.append(thumb, info)
  button.addEventListener('click', () => onSelect?.(entry.id))
  li.append(button)

  return { li, button, id: entry.id }
}

export function bindExplorer({ onSelect } = {}) {
  const root = document.querySelector('#explorer')
  const toggle = document.querySelector('#explorer-toggle')
  const panel = document.querySelector('#explorer-panel')
  const closeButton = document.querySelector('#explorer-close')
  const list = document.querySelector('#object-list')

  const items = buildEntries().map((entry, index) =>
    createItem(entry, index, onSelect),
  )
  list.append(...items.map((item) => item.li))

  const setOpen = (open) => {
    root.classList.toggle('open', open)
    panel.hidden = !open
    toggle.setAttribute('aria-expanded', String(open))
    if (open) {
      closeButton.focus({ preventScroll: true })
    } else {
      toggle.focus({ preventScroll: true })
    }
  }

  toggle.addEventListener('click', () => setOpen(true))
  closeButton.addEventListener('click', () => setOpen(false))
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setOpen(false)
  })

  return {
    setActive(id) {
      for (const item of items) {
        item.button.classList.toggle('active', item.id === id)
      }
    },
    open() {
      setOpen(true)
    },
    close() {
      setOpen(false)
    },
  }
}
