export function bindHud() {
  const timeScale = document.querySelector('#time-scale')
  const timeValue = document.querySelector('#time-value')
  const dateValue = document.querySelector('#sim-date')
  const speedValue = document.querySelector('#fly-speed')
  const focusValue = document.querySelector('#focus-name')
  const epoch = Date.UTC(2000, 0, 1, 12)

  const formatScale = (daysPerSecond) => {
    if (Number(daysPerSecond) === 0) return 'pauza'
    if (daysPerSecond < 1) return `${daysPerSecond.toFixed(2)} dnia / s`
    if (daysPerSecond === 1) return '1 dzień / s'
    return `${daysPerSecond} dni / s`
  }

  const syncScaleLabel = () => {
    timeValue.textContent = formatScale(Number(timeScale.value))
  }

  timeScale.addEventListener('input', syncScaleLabel)
  syncScaleLabel()

  return {
    getTimeScale() {
      return Number(timeScale.value)
    },
    setDate(simTimeDays) {
      const date = new Date(epoch + simTimeDays * 86400000)
      dateValue.textContent = new Intl.DateTimeFormat('pl-PL', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).format(date)
    },
    setSpeed(speed) {
      speedValue.textContent = `${speed.toFixed(0)} j/s`
    },
    setFocus(name) {
      focusValue.textContent = name ?? 'swobodny lot'
    },
  }
}
