import { ISS, PLANETS, SUN } from './data/celestialBodies.js'

const AU_KM = 149_597_870
const EARTH_RADIUS_KM = 6371

const nf = (value, digits = 0) =>
  new Intl.NumberFormat('pl-PL', { maximumFractionDigits: digits }).format(value)

function tempStr(celsius) {
  const rounded = Math.round(celsius)
  return `${rounded > 0 ? '+' : ''}${nf(rounded)} °C`
}

function radiusRow(radiusKm) {
  const relative = radiusKm / EARTH_RADIUS_KM
  const relText = relative < 10 ? nf(relative, 2) : nf(relative)
  return { label: 'Promień', value: `${nf(radiusKm)} km · ${relText} R⊕` }
}

function orbitalRow(days) {
  if (days >= 365) return { label: 'Rok (obieg)', value: `${nf(days / 365.25, 2)} lat` }
  return { label: 'Okres obiegu', value: `${nf(days, 1)} dni` }
}

function rotationRow(days) {
  const abs = Math.abs(days)
  const retro = days < 0 ? ' (wsteczny)' : ''
  const value = abs < 1 ? `${nf(abs * 24, 1)} godz.` : `${nf(abs, 1)} dni`
  return { label: 'Doba (obrót)', value: value + retro }
}

function planetStats(planet) {
  return [
    radiusRow(planet.radiusKm),
    {
      label: 'Odległość od Słońca',
      value: `${nf(planet.au, 2)} AU · ${nf((planet.au * AU_KM) / 1e6)} mln km`,
    },
    orbitalRow(planet.orbitalPeriodDays),
    rotationRow(planet.rotationPeriodDays),
    { label: 'Nachylenie osi', value: `${nf(planet.obliquityDeg, 1)}°` },
    { label: 'Grawitacja', value: `${nf(planet.info.gravity, 2)} m/s²` },
    { label: 'Śr. temperatura', value: tempStr(planet.info.tempC) },
    { label: 'Znane księżyce', value: nf(planet.info.moons) },
  ]
}

function sunStats(sun) {
  return [
    radiusRow(sun.radiusKm),
    rotationRow(sun.rotationPeriodDays),
    { label: 'Grawitacja', value: `${nf(sun.info.gravity)} m/s²` },
    { label: 'Temp. powierzchni', value: `~${nf(sun.info.tempC)} °C` },
    { label: 'Planety', value: nf(sun.info.planets) },
  ]
}

function moonStats(moon) {
  return [
    radiusRow(moon.radiusKm),
    { label: 'Odległość od Ziemi', value: `${nf(moon.info.distanceKm)} km` },
    orbitalRow(moon.orbitalPeriodDays),
    { label: 'Grawitacja', value: `${nf(moon.info.gravity, 2)} m/s²` },
    { label: 'Śr. temperatura', value: tempStr(moon.info.tempC) },
  ]
}

function issStats(iss) {
  return [
    { label: 'Wysokość orbity', value: `~${nf(iss.info.altitudeKm)} km` },
    { label: 'Okres obiegu', value: `~${nf(iss.info.periodMin, 1)} min` },
    { label: 'Prędkość', value: `~${nf(iss.info.speedKms, 2)} km/s` },
    { label: 'Nachylenie orbity', value: `${nf(iss.inclinationDeg, 1)}°` },
  ]
}

function buildRegistry() {
  const registry = new Map()
  registry.set(SUN.id, { name: SUN.name, kind: 'Gwiazda', stats: sunStats(SUN), fact: SUN.info.fact })

  for (const planet of PLANETS) {
    registry.set(planet.id, {
      name: planet.name,
      kind: 'Planeta',
      stats: planetStats(planet),
      fact: planet.info.fact,
    })

    for (const moon of planet.moons ?? []) {
      registry.set(moon.id, {
        name: moon.name,
        kind: `Księżyc · ${planet.name}`,
        stats: moonStats(moon),
        fact: moon.info.fact,
      })
    }

    if (planet.id === 'earth') {
      registry.set(ISS.id, {
        name: ISS.name,
        kind: `Stacja kosmiczna · ${planet.name}`,
        stats: issStats(ISS),
        fact: ISS.info.fact,
      })
    }
  }

  return registry
}

export function bindFacts({ onClose } = {}) {
  const panel = document.querySelector('#facts-panel')
  const nameEl = document.querySelector('#facts-name')
  const kindEl = document.querySelector('#facts-kind')
  const statsEl = document.querySelector('#facts-stats')
  const factEl = document.querySelector('#facts-fact')
  const closeButton = document.querySelector('#facts-close')
  const registry = buildRegistry()

  const hide = () => {
    panel.hidden = true
  }

  const render = (entry) => {
    nameEl.textContent = entry.name
    kindEl.textContent = entry.kind
    statsEl.replaceChildren(
      ...entry.stats.map((stat) => {
        const row = document.createElement('div')
        row.className = 'facts-row'
        const label = document.createElement('span')
        label.className = 'facts-label'
        label.textContent = stat.label
        const value = document.createElement('span')
        value.className = 'facts-value'
        value.textContent = stat.value
        row.append(label, value)
        return row
      }),
    )
    if (entry.fact) {
      factEl.textContent = entry.fact
      factEl.hidden = false
    } else {
      factEl.hidden = true
    }
  }

  closeButton.addEventListener('click', () => {
    hide()
    onClose?.()
  })

  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      hide()
      onClose?.()
    }
  })

  return {
    show(id) {
      const entry = registry.get(id)
      if (!entry) {
        hide()
        return
      }
      render(entry)
      panel.hidden = false
      panel.scrollTop = 0
    },
    hide,
  }
}
