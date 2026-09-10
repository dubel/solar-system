const EARTH_RADIUS_KM = 6371

export function visualPlanetRadius(radiusKm) {
  const relative = radiusKm / EARTH_RADIUS_KM
  return Math.max(0.42, Math.pow(relative, 0.5) * 1.15)
}

export function visualOrbitRadius(au) {
  return 18 + Math.pow(au, 0.6) * 42
}

export const SUN = {
  id: 'sun',
  name: 'Słońce',
  radiusKm: 695700,
  rotationPeriodDays: 25.05,
  obliquityDeg: 7.25,
  visualRadius: 10.5,
  texture: 'sun.jpg',
  color: 0xffcc66,
}

export const MOON = {
  id: 'moon',
  name: 'Księżyc',
  radiusKm: 1737.4,
  orbitalPeriodDays: 27.321661,
  rotationPeriodDays: 27.321661,
  obliquityDeg: 6.68,
  inclinationDeg: 5.145,
  meanLongitudeDeg: 125.08,
  texture: 'moon.jpg',
  color: 0xc2c2c2,
  visualRadius: 0.32,
  visualOrbitRadius: 2.8,
}

export const ISS = {
  id: 'iss',
  name: 'ISS',
  fullName: 'Międzynarodowa Stacja Kosmiczna',
  model: 'iss.glb',
  orbitalPeriodDays: 0.06452, // ~92.9 min
  rotationPeriodDays: 0.35, // powolny obrót własny (efekt wizualny)
  inclinationDeg: 51.64,
  meanLongitudeDeg: 0,
  visualOrbitRadius: 1.7,
  targetSize: 0.6, // znormalizowany największy wymiar modelu w jednostkach sceny
  focusDistance: 2.8,
}

export const PLANETS = [
  {
    id: 'mercury',
    name: 'Merkury',
    radiusKm: 2439.7,
    au: 0.387098,
    orbitalPeriodDays: 87.969,
    rotationPeriodDays: 58.646,
    obliquityDeg: 0.034,
    inclinationDeg: 7.005,
    meanLongitudeDeg: 252.251,
    texture: 'mercury.jpg',
    color: 0x8c7a63,
  },
  {
    id: 'venus',
    name: 'Wenus',
    radiusKm: 6051.8,
    au: 0.723332,
    orbitalPeriodDays: 224.701,
    rotationPeriodDays: -243.025,
    obliquityDeg: 177.36,
    inclinationDeg: 3.3947,
    meanLongitudeDeg: 181.979,
    texture: 'venus.jpg',
    color: 0xe6c87a,
  },
  {
    id: 'earth',
    name: 'Ziemia',
    radiusKm: 6371,
    au: 1,
    orbitalPeriodDays: 365.256,
    rotationPeriodDays: 0.997269,
    obliquityDeg: 23.439,
    inclinationDeg: 0.00005,
    meanLongitudeDeg: 100.464,
    texture: 'earth.jpg',
    color: 0x2b6cb0,
    clouds: true,
    nightMap: true,
    atmosphere: 0x6bb4ff,
    moons: [MOON],
  },
  {
    id: 'mars',
    name: 'Mars',
    radiusKm: 3389.5,
    au: 1.523679,
    orbitalPeriodDays: 686.98,
    rotationPeriodDays: 1.025957,
    obliquityDeg: 25.19,
    inclinationDeg: 1.85,
    meanLongitudeDeg: 355.453,
    texture: 'mars.jpg',
    color: 0xc1440e,
  },
  {
    id: 'jupiter',
    name: 'Jowisz',
    radiusKm: 69911,
    au: 5.2044,
    orbitalPeriodDays: 4332.589,
    rotationPeriodDays: 0.41354,
    obliquityDeg: 3.13,
    inclinationDeg: 1.303,
    meanLongitudeDeg: 34.351,
    texture: 'jupiter.jpg',
    color: 0xd4a373,
  },
  {
    id: 'saturn',
    name: 'Saturn',
    radiusKm: 58232,
    au: 9.5826,
    orbitalPeriodDays: 10759.22,
    rotationPeriodDays: 0.44401,
    obliquityDeg: 26.73,
    inclinationDeg: 2.485,
    meanLongitudeDeg: 50.077,
    texture: 'saturn.jpg',
    color: 0xf0d9a0,
    rings: {
      innerScale: 1.2,
      outerScale: 2.27,
      texture: 'saturn_rings.png',
    },
  },
  {
    id: 'uranus',
    name: 'Uran',
    radiusKm: 25362,
    au: 19.2184,
    orbitalPeriodDays: 30688.5,
    rotationPeriodDays: -0.71833,
    obliquityDeg: 97.77,
    inclinationDeg: 0.773,
    meanLongitudeDeg: 314.055,
    texture: 'uranus.jpg',
    color: 0x7de3e3,
  },
  {
    id: 'neptune',
    name: 'Neptun',
    radiusKm: 24622,
    au: 30.1104,
    orbitalPeriodDays: 60195,
    rotationPeriodDays: 0.67125,
    obliquityDeg: 28.32,
    inclinationDeg: 1.769,
    meanLongitudeDeg: 304.349,
    texture: 'neptune.jpg',
    color: 0x3b6cff,
  },
]
