<template>
  <div class="content-box">
    <iframe
      ref="frame"
      class="email-frame"
      :style="{ height: `${frameHeight}px` }"
      :srcdoc="documentHtml"
      title="Email content"
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      referrerpolicy="no-referrer"
      scrolling="no"
      @load="handleLoad"
    />
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { buildEmailDocument } from './document.js'

const props = defineProps({
  html: {
    type: String,
    required: true
  }
})

const frame = ref(null)
const frameHeight = ref(180)
const documentHtml = computed(() => buildEmailDocument(props.html))
let resizeObserver = null
let resizeFrame = 0
let readyTimer = 0
let observedDocument = null
let imageListeners = []

function cleanupObserver() {
  resizeObserver?.disconnect()
  resizeObserver = null
  observedDocument = null
  if (resizeFrame) cancelAnimationFrame(resizeFrame)
  resizeFrame = 0
  if (readyTimer) clearTimeout(readyTimer)
  readyTimer = 0
  imageListeners.forEach(({ image, listener }) => {
    image.removeEventListener('load', listener)
    image.removeEventListener('error', listener)
  })
  imageListeners = []
}

function measuredHeight(doc) {
  const baseHeight = Math.max(
    doc.documentElement?.scrollHeight || 0,
    doc.documentElement?.offsetHeight || 0,
    doc.body?.scrollHeight || 0,
    doc.body?.offsetHeight || 0,
    180
  )
  const viewportTop = doc.defaultView?.scrollY || 0
  const childHeight = [...(doc.body?.children || [])].reduce((height, element) => {
    const rect = element.getBoundingClientRect()
    return Math.max(height, rect.bottom + viewportTop, rect.top + viewportTop + element.scrollHeight)
  }, 0)
  return Math.max(baseHeight, childHeight)
}

function syncHeight() {
  if (resizeFrame) cancelAnimationFrame(resizeFrame)
  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = 0
    const doc = frame.value?.contentDocument
    if (!doc) return

    const height = measuredHeight(doc)
    const nextHeight = Math.min(Math.ceil(height), 120000)
    if (Math.abs(frameHeight.value - nextHeight) > 1) frameHeight.value = nextHeight
  })
}

function observeImage(image) {
  if (image.complete) return
  const listener = () => syncHeight()
  image.addEventListener('load', listener, { once: true })
  image.addEventListener('error', listener, { once: true })
  imageListeners.push({ image, listener })
}

function connectDocument() {
  const doc = frame.value?.contentDocument
  if (!doc?.body) {
    if (!readyTimer) {
      readyTimer = setTimeout(() => {
        readyTimer = 0
        connectDocument()
      }, 16)
    }
    return
  }

  if (observedDocument === doc) {
    syncHeight()
    return
  }

  cleanupObserver()
  observedDocument = doc

  doc.documentElement.style.overflowY = 'hidden'
  doc.body.style.overflowY = 'visible'

  doc.querySelectorAll('a[href]').forEach(link => {
    link.setAttribute('target', '_blank')
    link.setAttribute('rel', 'noopener noreferrer')
  })

  syncHeight()
  resizeObserver = new ResizeObserver(syncHeight)
  resizeObserver.observe(doc.body)
  doc.querySelectorAll('img').forEach(observeImage)

  doc.fonts?.ready.then(() => {
    if (observedDocument === doc) syncHeight()
  }).catch(() => {})
}

function handleLoad() {
  connectDocument()
}

watch(() => props.html, async () => {
  cleanupObserver()
  frameHeight.value = 180
  await nextTick()
  connectDocument()
})

onMounted(connectDocument)
onUnmounted(cleanupObserver)
</script>

<style scoped>
.content-box {
  width: 100%;
  max-width: 100%;
  overflow: hidden;
  background: #fff;
}

.email-frame {
  display: block;
  width: 100%;
  min-height: 180px;
  border: 0;
  background: #fff;
  overflow: hidden;
}
</style>
