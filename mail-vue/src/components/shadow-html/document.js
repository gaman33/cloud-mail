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

function extractEmailParts(html) {
  const source = String(html || '')
  const headMatch = source.match(/<head\b[^>]*>([\s\S]*?)<\/head\s*>/i)
  const head = removeActiveContent(headMatch?.[1] || '')
  const bodyOpen = /<body\b([^>]*)>/i.exec(source)

  if (bodyOpen) {
    const contentStart = bodyOpen.index + bodyOpen[0].length
    const closingOffset = source.slice(contentStart).search(/<\/body\s*>/i)
    const contentEnd = closingOffset >= 0 ? contentStart + closingOffset : source.length
    return {
      attributes: safeBodyAttributes(bodyOpen[1]),
      body: removeActiveContent(source.slice(contentStart, contentEnd))
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
    html { background: transparent; overflow-x: auto; }
    body { box-sizing: border-box; max-width: 100%; overflow-wrap: anywhere; }
    img { max-width: 100%; }
    table { max-width: 100% !important; }
    pre { max-width: 100%; white-space: pre-wrap; word-break: break-word; }
  </style>
</head>
<body${bodyAttributes}>${parts.body}</body>
</html>`
}
