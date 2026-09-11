import { clampIsoDate } from './hud.js'

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const FOCUS_ID = /^[a-z][a-z0-9-]*$/i

function parseIsoDate(value) {
  const match = ISO_DATE.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const utc = new Date(Date.UTC(year, month - 1, day, 12))
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    return null
  }
  return clampIsoDate(value)
}

export function parseShareLink(search = window.location.search) {
  const params = new URLSearchParams(search)
  const date = parseIsoDate(params.get('date') ?? '')
  const focusRaw = params.get('focus')
  const focus = focusRaw && FOCUS_ID.test(focusRaw) ? focusRaw : null
  return { date, focus, isDeepLink: Boolean(date || focus) }
}

export function writeShareLink({ date, focus }) {
  const url = new URL(window.location.href)
  if (date) url.searchParams.set('date', date)
  else url.searchParams.delete('date')
  if (focus) url.searchParams.set('focus', focus)
  else url.searchParams.delete('focus')
  const next = `${url.pathname}${url.search}${url.hash}`
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`
  if (next === current) return
  history.replaceState(null, '', next)
}
