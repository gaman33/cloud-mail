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
      @load="handleLoad"
    />
  </div>
</template>

<script setup>
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
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

function cleanupObserver() {
  resizeObserver?.disconnect()
  resizeObserver = null
  if (resizeFrame) cancelAnimationFrame(resizeFrame)
  resizeFrame = 0
}

function syncHeight() {
  if (resizeFrame) cancelAnimationFrame(resizeFrame)
  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = 0
    const doc = frame.value?.contentDocument
    if (!doc) return

    const height = Math.max(
      doc.documentElement?.scrollHeight || 0,
      doc.documentElement?.offsetHeight || 0,
      doc.body?.scrollHeight || 0,
      doc.body?.offsetHeight || 0,
      180
    )
    const nextHeight = Math.min(Math.ceil(height), 120000)
    if (Math.abs(frameHeight.value - nextHeight) > 1) frameHeight.value = nextHeight
  })
}

function handleLoad() {
  cleanupObserver()
  const doc = frame.value?.contentDocument
  if (!doc) return

  doc.querySelectorAll('a[href]').forEach(link => {
    link.setAttribute('target', '_blank')
    link.setAttribute('rel', 'noopener noreferrer')
  })

  syncHeight()
  resizeObserver = new ResizeObserver(syncHeight)
  if (doc.documentElement) resizeObserver.observe(doc.documentElement)
  if (doc.body) resizeObserver.observe(doc.body)
  doc.querySelectorAll('img').forEach(image => {
    if (!image.complete) image.addEventListener('load', syncHeight, { once: true })
  })
}

watch(() => props.html, async () => {
  cleanupObserver()
  frameHeight.value = 180
  await nextTick()
})

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
}
</style>
