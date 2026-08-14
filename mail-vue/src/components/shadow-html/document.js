const BODY_ATTRIBUTE_PATTERN = /\s+(dir|lang|bgcolor|class|style)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi

function escapeAttribute(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
}

function safeBodyAttributes(rawAttributes = '') {
  const attributes = []
  for (const match of rawAttributes.matchAll(BODY_ATTRIBUTE_PATTERN)) {
    const name = match[1].toLowerCase()
    const value = match[2] ?? match[3] ?? match[4] ?? ''
    attributes.push(`${name}="${escapeAttribute(value)}"`)
  }
  return attributes.join(' ')
}

function removeActiveContent(value) {
  return String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<(iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(iframe|object|embed)\b[^>]*\/?>/gi, '')
    .replace(/<meta\b[^>]*http-equiv\s*=\s*(?:"refresh"|'refresh'|refresh)[^>]*>/gi, '')
    .replace(/<base\b[^>]*>/gi, '')
    .replace(/<\/?form\b[^>]*>/gi, '')
}

function bodyMaxWidth(rawAttributes = '') {
  const styleMatch = rawAttributes.match(/\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i)
  const style = styleMatch?.[1] ?? styleMatch?.[2] ?? ''
  const widthMatch = style.match(/\bmax-width\s*:\s*(\d{3,4})px/i)
  return widthMatch ? Number(widthMatch[1]) : 0
}

function normalizeMalformedShell(value, rawBodyAttributes = '') {
  const intendedWidth = bodyMaxWidth(rawBodyAttributes)
  if (!intendedWidth) return String(value || '')

  // Meta/Facebook messages sometimes place a body constrained to 602px
  // inside an invalid 1204px table cell. Browsers ignore the nested body tag
  // and use the doubled cell width, which splits the message across the page.
  // Only collapse a dimension that is exactly twice the declared body width;
  // leave legitimate wide newsletters and banners untouched.
  return String(value || '').replace(
    /\swidth\s*=\s*(?:"(\d{3,4})(?:px)?"|'(\d{3,4})(?:px)?'|(\d{3,4})(?:px)?)/gi,
    (match, doubleQuoted, singleQuoted, unquoted) => {
      const width = Number(doubleQuoted || singleQuoted || unquoted)
      return Math.abs(width - intendedWidth * 2) <= 2
        ? ` width="${intendedWidth}"`
        : match
    }
  )
}

function stripDocumentWrappers(value) {
  return String(value || '')
    .replace(/<!doctype[^>]*>/gi, '')
    .replace(/<\/?html\b[^>]*>/gi, '')
    .replace(/<\/?body\b[^>]*>/gi, '')
}

function extractEmailParts(html) {
  const source = String(html || '')
  const headMatch = source.match(/<head\b[^>]*>([\s\S]*?)<\/head\s*>/i)
  const head = removeActiveContent(headMatch?.[1] || '')
  const bodyOpen = /<body\b([^>]*)>/i.exec(source)

  if (bodyOpen) {
    const shellStart = headMatch ? (headMatch.index || 0) + headMatch[0].length : 0
    const prefix = source.slice(shellStart, bodyOpen.index)
      .replace(/<!doctype[^>]*>/gi, '')
      .replace(/<\/?html\b[^>]*>/gi, '')
      .trim()

    // Some providers emit <body> inside an outer table and then continue the
    // actual message after </body>. Preserve that table shell while removing
    // the invalid nested body tags, otherwise most of the message is lost.
    if (/<[a-z][^>]*>/i.test(prefix)) {
      let shellEnd = source.length
      for (const match of source.matchAll(/<\/html\s*>/gi)) shellEnd = match.index
      const shell = source.slice(shellStart, shellEnd)
      return {
        attributes: safeBodyAttributes(bodyOpen[1]),
        body: normalizeMalformedShell(removeActiveContent(stripDocumentWrappers(shell)), bodyOpen[1]),
        head
      }
    }

    const contentStart = bodyOpen.index + bodyOpen[0].length
    const closingOffset = source.slice(contentStart).search(/<\/body\s*>/i)
    const contentEnd = closingOffset >= 0 ? contentStart + closingOffset : source.length
    return {
      attributes: safeBodyAttributes(bodyOpen[1]),
      body: removeActiveContent(source.slice(contentStart, contentEnd)),
      head
    }
  }

  const body = source
    .replace(/<!doctype[^>]*>/gi, '')
    .replace(/<head\b[^>]*>[\s\S]*?<\/head\s*>/gi, '')
    .replace(/<\/?html\b[^>]*>/gi, '')

  return {attributes: '', body: removeActiveContent(body), head}
}

export function buildEmailDocument(html) {
  const source = String(html || '')
  const headMatch = source.match(/<head\b[^>]*>([\s\S]*?)<\/head\s*>/i)
  const head = removeActiveContent(headMatch?.[1] || '')
  const parts = extractEmailParts(source)
  const bodyAttributes = parts.attributes ? ` ${parts.attributes}` : ''

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <base target="_blank">
  ${head}
  <style>
    html { width: 100%; min-width: 0 !important; background: transparent; overflow-x: hidden; }
    body { box-sizing: border-box; min-width: 0 !important; max-width: 100% !important; overflow-wrap: anywhere; }
    body > table { margin-left: auto; margin-right: auto; }
    img { max-width: 100%; height: auto; }
    table { max-width: 100%; }
    table, td, th, div { box-sizing: border-box; }
    td, th { overflow-wrap: anywhere; }
    pre { max-width: 100%; white-space: pre-wrap; word-break: break-word; }
  </style>
</head>
<body${bodyAttributes}>${parts.body}</body>
</html>`
}
