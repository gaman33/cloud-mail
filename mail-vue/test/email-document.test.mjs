import assert from 'node:assert/strict'
import test from 'node:test'
import { buildEmailDocument } from '../src/components/shadow-html/document.js'

test('collapses only the doubled wrapper around a malformed nested body', () => {
  const html = `<html><head><style>.message{color:#111}</style></head>
    <table width="100%"><tr><td width="1204">
    <body style="max-width:602px;margin:0 auto" dir="ltr">
      <table id="email_table" style="max-width:602px"><tr><td>WhatsApp content</td></tr></table>
    </body></td></tr><tr><td>WhatsApp tail content</td></tr></table></html>`

  const document = buildEmailDocument(html)
  assert.match(document, /WhatsApp content/)
  assert.match(document, /WhatsApp tail content/)
  assert.match(document, /body style="max-width:602px;margin:0 auto" dir="ltr"/)
  assert.doesNotMatch(document, /width="1204"/)
  assert.match(document, /width="602"/)
  assert.match(document, /table \{ max-width: 100%; \}/)
  assert.doesNotMatch(document, /body > table \{ width: 100% !important/)
})

test('does not rewrite legitimate newsletter dimensions', () => {
  const document = buildEmailDocument(`<table role="presentation" width="100%"><tr><td width="640"><table width="600"><tr><td>WorldFirst content</td></tr></table></td></tr></table>`)
  assert.match(document, /width="640"/)
  assert.match(document, /width="600"/)
})

test('keeps a normal body isolated from trailing document garbage', () => {
  const document = buildEmailDocument('<html><head></head><body><p>Message</p></body><p>Ignore me</p></html>')
  assert.match(document, /<body><p>Message<\/p><\/body>/)
  assert.doesNotMatch(document, /Ignore me/)
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
