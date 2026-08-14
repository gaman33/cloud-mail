import assert from 'node:assert/strict'
import test from 'node:test'
import { buildEmailDocument } from '../src/components/shadow-html/document.js'

test('extracts a malformed nested body without the oversized outer wrapper', () => {
  const html = `<html><head><style>.message{color:#111}</style></head>
    <table width="100%"><tr><td width="1204">
    <body style="max-width:602px;margin:0 auto" dir="ltr">
      <table id="email_table" style="max-width:602px"><tr><td>WhatsApp content</td></tr></table>
    </body></td></tr></table></html>`

  const document = buildEmailDocument(html)
  assert.match(document, /WhatsApp content/)
  assert.match(document, /body style="max-width:602px;margin:0 auto" dir="ltr"/)
  assert.doesNotMatch(document, /width="1204"/)
  assert.match(document, /table \{ max-width: 100% !important; \}/)
})

test('keeps fragments that do not contain a body element', () => {
  const document = buildEmailDocument('<div><p>Plain fragment</p></div>')
  assert.match(document, /<body><div><p>Plain fragment<\/p><\/div><\/body>/)
})

test('removes active content and prevents form submission', () => {
  const document = buildEmailDocument(`<html><head><meta http-equiv="refresh" content="0;url=https://bad.example"><script>alert(1)</script></head>
    <body><form action="https://bad.example"><a href="https://safe.example">Open</a><button>Submit</button></form><iframe src="https://bad.example"></iframe></body></html>`)

  assert.doesNotMatch(document, /<script/i)
  assert.doesNotMatch(document, /http-equiv="refresh"/i)
  assert.doesNotMatch(document, /<\/?form/i)
  assert.doesNotMatch(document, /<iframe/i)
  assert.match(document, /href="https:\/\/safe\.example"/)
  assert.match(document, /<button>Submit<\/button>/)
})
