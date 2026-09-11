import { ISS, PLANETS, SUN } from './data/celestialBodies.js'
import { NOTABLE_STARS } from './data/notableStars.js'

const SATELLITE_ICON = `
<svg viewBox="0 0 24 24" aria-hidden="true">
  <rect x="10.4" y="9.4" width="3.2" height="5.2" rx="0.6" />
  <rect x="3.2" y="9.8" width="5.4" height="4.4" rx="0.5" />
  <rect x="15.4" y="9.8" width="5.4" height="4.4" rx="0.5" />
  <line x1="8.6" y1="12" x2="10.4" y2="12" />
  <line x1="13.6" y1="12" x2="15.4" y2="12" />
  <line x1="5.9" y1="9.8" x2="5.9" y2="14.2" />
  <line x1="18.1" y1="9.8" x2="18.1" y2="14.2" />
  <line x1="12" y1="9.4" x2="12" y2="6.4" />
  <circle cx="12" cy="5.6" r="0.9" />
</svg>`

const STAR_ICON = `
<svg viewBox="0 0 24 24" aria-hidden="true">
  <path
    d="M12 3.1 L14.5 9.2 L21.1 9.7 L16.2 13.9 L17.8 20.4 L12 16.9 L6.2 20.4 L7.8 13.9 L2.9 9.7 L9.5 9.2 Z"
  />
</svg>`

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

    if (planet.id === 'earth') {
      entries.push({
        id: ISS.id,
        name: ISS.name,
        fullName: ISS.fullName,
        kind: `Stacja kosmiczna · ${planet.name}`,
        icon: SATELLITE_ICON,
      })
    }
  }

  for (const star of NOTABLE_STARS) {
    entries.push({
      id: star.id,
      name: star.name,
      fullName: star.fullName,
      kind: `Gwiazda · ${star.constellation}`,
      starColor: star.color,
    })
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
  if (entry.icon) {
    thumb.classList.add('object-thumb--icon')
    thumb.innerHTML = entry.icon
  } else if (entry.starColor) {
    thumb.classList.add('object-thumb--star')
    thumb.style.setProperty('--star-color', entry.starColor)
    thumb.innerHTML = STAR_ICON
  } else {
    thumb.style.setProperty('--tex', `url("${textureUrl(entry.texture)}")`)
    // Stagger the rotation so the thumbnails do not all spin in lockstep.
    thumb.style.setProperty('--delay', `-${(index % 6) * 1.3}s`)
  }

  const info = document.createElement('span')
  info.className = 'object-info'

  const name = document.createElement('span')
  name.className = 'object-name'
  name.textContent = entry.name

  const kind = document.createElement('span')
  kind.className = 'object-kind'
  kind.textContent = entry.kind

  info.append(name, kind)
  if (entry.fullName) button.title = entry.fullName
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
    setAvailable(id, available) {
      const item = items.find((entry) => entry.id === id)
      if (!item) return
      item.button.classList.toggle('unavailable', !available)
      item.button.disabled = !available
    },
    open() {
      setOpen(true)
    },
    close() {
      setOpen(false)
    },
  }
}
