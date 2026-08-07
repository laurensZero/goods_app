export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export function componentToHex(value) {
  return clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0')
}

export function hexToRgb(hexColor) {
  const value = String(hexColor || '').replace('#', '')
  if (value.length !== 6) {
    return { r: 255, g: 255, b: 255 }
  }

  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16)
  }
}

export function hexToHsl(hexColor) {
  const { r, g, b } = hexToRgb(hexColor)
  const red = r / 255
  const green = g / 255
  const blue = b / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const lightness = (max + min) / 2
  const delta = max - min

  if (delta === 0) {
    return { h: 0, s: 0, l: Math.round(lightness * 100) }
  }

  const saturation = delta / (1 - Math.abs(2 * lightness - 1))
  let hue = 0

  switch (max) {
    case red:
      hue = ((green - blue) / delta) % 6
      break
    case green:
      hue = (blue - red) / delta + 2
      break
    default:
      hue = (red - green) / delta + 4
      break
  }

  return {
    h: Math.round(((hue * 60) + 360) % 360),
    s: Math.round(saturation * 100),
    l: Math.round(lightness * 100)
  }
}

export function hslToHex(h, s, l) {
  const hue = ((Number(h) % 360) + 360) % 360
  const saturation = clamp(Number(s), 0, 100) / 100
  const lightness = clamp(Number(l), 0, 100) / 100
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const segment = hue / 60
  const x = chroma * (1 - Math.abs((segment % 2) - 1))
  const match = lightness - chroma / 2

  let red = 0
  let green = 0
  let blue = 0

  if (segment >= 0 && segment < 1) {
    red = chroma
    green = x
  } else if (segment < 2) {
    red = x
    green = chroma
  } else if (segment < 3) {
    green = chroma
    blue = x
  } else if (segment < 4) {
    green = x
    blue = chroma
  } else if (segment < 5) {
    red = x
    blue = chroma
  } else {
    red = chroma
    blue = x
  }

  return `#${componentToHex((red + match) * 255)}${componentToHex((green + match) * 255)}${componentToHex((blue + match) * 255)}`
}

export function isHexColor(value) {
  return typeof value === 'string' && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value)
}
