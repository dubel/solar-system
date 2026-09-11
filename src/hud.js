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

export function clampIsoDate(iso) {
  if (iso < DATE_MIN) return DATE_MIN
  if (iso > DATE_MAX) return DATE_MAX
  return iso
}

export function simDaysToIso(simTimeDays) {
  const date = new Date(EPOCH_MS + simTimeDays * MS_PER_DAY)
  return date.toISOString().slice(0, 10)
}

export function isoToSimDays(iso) {
  const [year, month, day] = iso.split('-').map(Number)
  if (!year || !month || !day) return 0
  return (Date.UTC(year, month - 1, day, 12) - EPOCH_MS) / MS_PER_DAY
}

// Nieliniowe „nastawy" tempa (doby / s). Indeks 0 = pauza; drobne kroki na starcie
// pozwalają wygodnie obserwować szybkie obiekty (np. ISS), a końcówka — szybki przegląd.
const TIME_SCALES = [0, 0.001, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 40]
const DEFAULT_INDEX = 6 // 0.5 dnia / s

function indexFromScale(days) {
  let best = 0
  let bestDiff = Infinity
  for (let i = 0; i < TIME_SCALES.length; i += 1) {
    const diff = Math.abs(TIME_SCALES[i] - days)
    if (diff < bestDiff) {
      bestDiff = diff
      best = i
    }
  }
  return best
}

export function bindHud({ onJumpToDate, onTimeScaleChange } = {}) {
  const panel = document.querySelector('#hud-panel')
  const timeScale = document.querySelector('#time-scale')
  const timeValue = document.querySelector('#time-value')
  const timeToggle = document.querySelector('#time-toggle')
  const timeState = document.querySelector('#time-state')
  const dateValue = document.querySelector('#sim-date')
  const dateInput = document.querySelector('#sim-date-input')
  const dateOverlay = document.querySelector('.date-overlay')
  const focusValue = document.querySelector('#focus-name')
  let pickerOpen = false
  let lastRunningIndex = DEFAULT_INDEX

  if (window.matchMedia('(max-width: 720px), (pointer: coarse)').matches) {
    panel.open = false
  }

  const currentScale = () => TIME_SCALES[Number(timeScale.value)] ?? 0

  const formatScale = (daysPerSecond) => {
    if (daysPerSecond === 0) return 'pauza'
    const value = parseFloat(daysPerSecond.toFixed(3))
    if (daysPerSecond === 1) return '1 dzień / s'
    if (daysPerSecond < 1) return `${value} dnia / s`
    return `${value} dni / s`
  }

  const updateToggle = () => {
    const paused = currentScale() === 0
    timeToggle.classList.toggle('is-paused', paused)
    timeToggle.setAttribute('aria-pressed', String(paused))
    timeState.textContent = paused ? 'Pauza' : 'Odtwarzanie'
  }

  const syncScaleLabel = () => {
    timeValue.textContent = formatScale(currentScale())
    if (currentScale() > 0) lastRunningIndex = Number(timeScale.value)
    updateToggle()
    onTimeScaleChange?.(currentScale())
  }

  const togglePlay = () => {
    if (currentScale() > 0) {
      lastRunningIndex = Number(timeScale.value)
      timeScale.value = '0'
    } else {
      timeScale.value = String(lastRunningIndex || DEFAULT_INDEX)
    }
    syncScaleLabel()
  }

  const jumpFromInput = () => {
    if (!dateInput.value) return
    onJumpToDate?.(isoToSimDays(dateInput.value))
  }

  const openPicker = (event) => {
    event.preventDefault()
    dateInput.focus({ preventScroll: true })
    if (typeof dateInput.showPicker === 'function') {
      try {
        dateInput.showPicker()
      } catch {
        dateInput.click()
      }
    }
  }

  timeScale.addEventListener('input', syncScaleLabel)
  timeToggle.addEventListener('click', togglePlay)
  syncScaleLabel()

  dateInput.addEventListener('focus', () => {
    pickerOpen = true
  })
  dateInput.addEventListener('blur', () => {
    pickerOpen = false
  })
  dateInput.addEventListener('change', jumpFromInput)
  dateOverlay?.addEventListener('click', openPicker)
  dateOverlay?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') openPicker(event)
  })

  return {
    getTimeScale() {
      return currentScale()
    },
    setTimeScale(days) {
      timeScale.value = String(indexFromScale(days))
      syncScaleLabel()
    },
    setDate(simTimeDays) {
      const date = new Date(EPOCH_MS + simTimeDays * MS_PER_DAY)
      dateValue.textContent = dateFormatter.format(date)
      if (!pickerOpen && document.activeElement !== dateInput) {
        dateInput.value = clampIsoDate(simDaysToIso(simTimeDays))
      }
    },
    setFocus(name) {
      focusValue.textContent = name ?? 'swobodny lot'
    },
  }
}
