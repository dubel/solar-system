const EPOCH_MS = Date.UTC(2000, 0, 1, 12)
const MS_PER_DAY = 86400000
const DATE_MIN = '1800-01-01'
const DATE_MAX = '2200-12-31'
const dateFormatter = new Intl.DateTimeFormat('pl-PL', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

function clampIsoDate(iso) {
  if (iso < DATE_MIN) return DATE_MIN
  if (iso > DATE_MAX) return DATE_MAX
  return iso
}

function simDaysToIso(simTimeDays) {
  const date = new Date(EPOCH_MS + simTimeDays * MS_PER_DAY)
  return date.toISOString().slice(0, 10)
}

function isoToSimDays(iso) {
  const [year, month, day] = iso.split('-').map(Number)
  if (!year || !month || !day) return 0
  return (Date.UTC(year, month - 1, day, 12) - EPOCH_MS) / MS_PER_DAY
}

export function bindHud({ onJumpToDate } = {}) {
  const panel = document.querySelector('#hud-panel')
  const timeScale = document.querySelector('#time-scale')
  const timeValue = document.querySelector('#time-value')
  const dateValue = document.querySelector('#sim-date')
  const dateInput = document.querySelector('#sim-date-input')
  const distanceValue = document.querySelector('#view-distance')
  const focusValue = document.querySelector('#focus-name')
  let pickerOpen = false

  if (window.matchMedia('(max-width: 720px), (pointer: coarse)').matches) {
    panel.open = false
  }

  const formatScale = (daysPerSecond) => {
    if (Number(daysPerSecond) === 0) return 'pauza'
    if (daysPerSecond < 1) return `${daysPerSecond.toFixed(2)} dnia / s`
    if (daysPerSecond === 1) return '1 dzień / s'
    return `${daysPerSecond} dni / s`
  }

  const syncScaleLabel = () => {
    timeValue.textContent = formatScale(Number(timeScale.value))
  }

  const jumpFromInput = () => {
    if (!dateInput.value) return
    onJumpToDate?.(isoToSimDays(dateInput.value))
  }

  timeScale.addEventListener('input', syncScaleLabel)
  syncScaleLabel()

  dateInput.addEventListener('focus', () => {
    pickerOpen = true
  })
  dateInput.addEventListener('blur', () => {
    pickerOpen = false
  })
  dateInput.addEventListener('change', jumpFromInput)

  return {
    getTimeScale() {
      return Number(timeScale.value)
    },
    setDate(simTimeDays) {
      const date = new Date(EPOCH_MS + simTimeDays * MS_PER_DAY)
      dateValue.textContent = dateFormatter.format(date)
      if (!pickerOpen && document.activeElement !== dateInput) {
        dateInput.value = clampIsoDate(simDaysToIso(simTimeDays))
      }
    },
    setDistance(distance) {
      distanceValue.textContent = distance.toFixed(0)
    },
    setFocus(name) {
      focusValue.textContent = name ?? 'swobodny lot'
    },
  }
}
