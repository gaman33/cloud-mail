import assert from 'node:assert/strict'
import test from 'node:test'
import { addUniqueAddresses, toForwardAttachments } from '../src/layout/write/compose-utils.js'

test('keeps To and Cc addresses unique without losing display casing', () => {
  const result = addUniqueAddresses(
    ['Customer@example.com'],
    'sales@example.com, CUSTOMER@example.com; invalid',
    ['manager@example.com']
  )

  assert.deepEqual(result.addresses, ['Customer@example.com', 'sales@example.com'])
  assert.deepEqual(result.invalid, ['invalid'])
})

test('creates safe references for forwarding existing attachments', () => {
  const result = toForwardAttachments([
    {attId: 42, filename: 'proposal.pdf', size: 2048, mimeType: 'application/pdf'},
    {attId: 0, filename: 'ignored.txt', size: 10}
  ])

  assert.deepEqual(result, [{
    sourceAttachmentId: 42,
    filename: 'proposal.pdf',
    size: 2048,
    contentType: 'application/pdf',
    forwarded: true,
    uploading: false
  }])
})
