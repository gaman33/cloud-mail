const EMAIL_PATTERN = /^[a-zA-Z0-9!#$%&'*+/=?^_`{|}~.-]+@([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/

export function addUniqueAddresses(current = [], raw = '', blocked = []) {
  const result = [...current]
  const occupied = new Set([...current, ...blocked].map(item => String(item || '').trim().toLowerCase()).filter(Boolean))
  const invalid = []
  const candidates = String(raw || '').split(/[,，;]/).map(item => item.trim()).filter(Boolean)

  for (const address of candidates) {
    if (!EMAIL_PATTERN.test(address)) {
      invalid.push(address)
      continue
    }
    const key = address.toLowerCase()
    if (occupied.has(key)) continue
    occupied.add(key)
    result.push(address)
  }

  return {addresses: result, invalid}
}

export function toForwardAttachments(attachments = []) {
  return attachments
    .filter(item => item && Number(item.attId) > 0 && item.filename)
    .map(item => ({
      sourceAttachmentId: Number(item.attId),
      filename: item.filename,
      size: Number(item.size || 0),
      contentType: item.mimeType || item.contentType || 'application/octet-stream',
      forwarded: true,
      uploading: false
    }))
}
