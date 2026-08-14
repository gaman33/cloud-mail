<template>
  <div class="box">
    <div class="header-actions">
      <Icon class="icon" icon="material-symbols-light:arrow-back-ios-new" width="20" height="20" @click="handleBack"/>
      <Icon v-perm="'email:delete'" class="icon" icon="uiw:delete" width="16" height="16" @click="handleDelete"/>
      <span class="star" v-if="emailStore.contentData.showStar">
        <Icon class="icon" @click="changeStar" v-if="email.isStar" icon="fluent-color:star-16" width="20" height="20"/>
        <Icon class="icon" @click="changeStar" v-else icon="solar:star-line-duotone" width="18" height="18"/>
      </span>
      <Icon class="icon" v-if="emailStore.contentData.showReply" v-perm="'email:send'"  @click="openReply" icon="la:reply" width="21" height="21" />
      <Icon class="icon" v-if="emailStore.contentData.showReply" v-perm="'email:send'"  @click="openForward" icon="iconoir:arrow-up-right" width="20" height="20" />
    </div>
    <div></div>
    <el-scrollbar class="scrollbar">
      <div class="container">
        <div class="email-title">
          {{ email.subject }}
        </div>
        <div class="content">
          <div class="email-info">
            <div>
              <div class="send"><span class="send-source">{{$t('from')}}</span>
                <div class="send-name">
                  <span class="send-name-title">{{ email.name }}</span>
                  <span><{{ email.sendEmail }}></span>
                </div>
              </div>
              <div class="receive"><span class="source">{{$t('recipient')}}</span><span class="receive-email">{{  formateReceive(email.recipient) }}</span></div>
              <div class="receive" v-if="formateReceive(email.cc)"><span class="source">{{$t('ccRecipient')}}</span><span class="receive-email">{{ formateReceive(email.cc) }}</span></div>
              <div class="date">
                <div>{{ formatDetailDate(email.createTime) }}</div>
              </div>
            </div>
            <el-alert v-if="email.status === 3" :closable="false" :title="toMessage(email.message)" class="email-msg" type="error" show-icon />
            <el-alert v-if="email.status === 4" :closable="false" :title="$t('complained')" class="email-msg" type="warning" show-icon />
            <el-alert v-if="email.status === 5" :closable="false" :title="$t('delayed')" class="email-msg" type="warning" show-icon />
          </div>
          <div class="tracking" v-if="email.type === 1">
            <div class="tracking-header">
              <div class="tracking-title">{{ $t('tracking') }}</div>
              <div class="tracking-status" v-if="trackingData.tracked">
                <el-tag v-if="hasTrackingEvent('delivered')" size="small" type="success" effect="light">{{ $t('trackingDelivered') }}</el-tag>
                <el-tag v-if="trackingData.openCount > 0" size="small" type="primary" effect="light">{{ $t('trackingOpened') }}</el-tag>
                <el-tag v-else size="small" type="info" effect="plain">{{ $t('trackingNoOpen') }}</el-tag>
                <el-tag v-if="hasTrackingEvent('read_receipt')" size="small" type="success" effect="dark">{{ $t('read_receipt') }}</el-tag>
              </div>
            </div>
            <div v-if="trackingLoading" class="tracking-empty">{{ $t('loading') }}</div>
            <template v-else-if="trackingData.tracked">
              <div class="tracking-summary">
                <div class="tracking-card tracking-count"><span>{{ $t('openCount') }}</span><strong>{{ trackingData.openCount }}</strong></div>
                <div class="tracking-card tracking-count"><span>{{ $t('clickCount') }}</span><strong>{{ trackingData.clickCount }}</strong></div>
                <div class="tracking-card" v-if="trackingData.firstOpenTime"><span>{{ $t('firstOpenedAt') }}</span><strong>{{ formatCompactDate(trackingData.firstOpenTime) }}</strong></div>
                <div class="tracking-card" v-if="trackingData.lastOpenTime"><span>{{ $t('lastOpenedAt') }}</span><strong>{{ formatCompactDate(trackingData.lastOpenTime) }}</strong></div>
                <div class="tracking-card tracking-location" v-if="latestOpenLocation"><span>{{ $t('trackingLocation') }}</span><strong>{{ latestOpenLocation }}</strong></div>
              </div>
              <button v-if="trackingData.events.length" type="button" class="tracking-toggle" @click="trackingExpanded = !trackingExpanded">
                <span>{{ trackingExpanded ? $t('hideTrackingEvents') : $t('showTrackingEvents', {count: trackingData.events.length}) }}</span>
                <Icon :icon="trackingExpanded ? 'mdi:chevron-up' : 'mdi:chevron-down'" width="18" height="18" />
              </button>
              <div v-if="trackingExpanded" class="tracking-events">
                <el-timeline class="tracking-timeline">
                  <el-timeline-item v-for="event in visibleTrackingEvents" :key="event.eventId" :timestamp="formatDetailDate(event.eventTime)" placement="top">
                    <div class="event-title">{{ trackingEventLabel(event.eventType) }}</div>
                    <div class="event-details">
                      <span v-if="event.ip">IP: {{ event.ip }}</span>
                      <span v-if="event.country || event.region || event.city">{{ [event.city, event.region, event.country].filter(Boolean).join(' / ') }}</span>
                      <span v-if="event.browser || event.os || event.device">{{ [event.browser, event.os, event.device].filter(Boolean).join(' · ') }}</span>
                    </div>
                    <div class="event-meta event-url" v-if="event.url">{{ event.url }}</div>
                  </el-timeline-item>
                </el-timeline>
                <button v-if="orderedTrackingEvents.length > collapsedEventLimit" type="button" class="tracking-more" @click="trackingShowAll = !trackingShowAll">
                  {{ trackingShowAll ? $t('showRecentTrackingEvents') : $t('showAllTrackingEvents', {count: orderedTrackingEvents.length}) }}
                </button>
              </div>
              <div v-else-if="!trackingData.events.length" class="tracking-empty">{{ $t('noTrackingEvents') }}</div>
              <div class="privacy-note">
                <Icon icon="material-symbols:info-outline" width="16" height="16" />
                <span>{{ $t('trackingPrivacyNote') }}</span>
              </div>
            </template>
            <div v-else class="tracking-empty">{{ $t('trackingNotAvailable') }}</div>
          </div>
          <el-scrollbar class="htm-scrollbar" :class="displayAttachments.length === 0 ? 'bottom-distance' : ''">
            <ShadowHtml class="shadow-html" :html="formatImage(email.content)" v-if="email.content" />
            <pre v-else class="email-text" >{{email.text}}</pre>
          </el-scrollbar>
          <div class="att" v-if="displayAttachments.length > 0">
            <div class="att-title">
              <span>{{$t('attachments')}}</span>
              <span>{{$t('attCount',{total: displayAttachments.length})}}</span>
            </div>
            <div class="att-box">

              <div class="att-item" v-for="att in displayAttachments" :key="att.attId">
                <div class="att-icon" @click="showImage(att.key)">
                  <Icon v-bind="getIconByName(att.filename)" />
                </div>
                <div class="att-name" @click="showImage(att.key)">
                  {{ att.filename }}
                </div>
                <div class="att-size">{{ formatBytes(att.size) }}</div>
                <div class="opt-icon att-icon">
                  <Icon v-if="isImage(att.filename)" icon="hugeicons:view" width="22" height="22" @click="showImage(att.key)"/>
                  <a :href="cvtR2Url(att.key)" download>
                    <Icon icon="system-uicons:push-down" width="22" height="22"/>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </el-scrollbar>
    <el-image-viewer
        v-if="showPreview"
        :url-list="srcList"
        show-progress
        @close="showPreview = false"
    />
  </div>
</template>
<script setup>
import ShadowHtml from '@/components/shadow-html/index.vue'
import {computed, reactive, ref, watch, onMounted, onUnmounted} from "vue";
import {useRouter} from 'vue-router'
import {ElMessage, ElMessageBox} from 'element-plus'
import {emailDelete, emailRead, emailTracking} from "@/request/email.js";
import {Icon} from "@iconify/vue";
import {useEmailStore} from "@/store/email.js";
import {useAccountStore} from "@/store/account.js";
import {formatDetailDate, tzDayjs} from "@/utils/day.js";
import {starAdd, starCancel} from "@/request/star.js";
import {getExtName, formatBytes} from "@/utils/file-utils.js";
import {cvtR2Url,toOssDomain} from "@/utils/convert.js";
import {getIconByName} from "@/utils/icon-utils.js";
import {useSettingStore} from "@/store/setting.js";
import {allEmailDelete} from "@/request/all-email.js";
import {useUiStore} from "@/store/ui.js";
import {useI18n} from "vue-i18n";
import {EmailUnreadEnum} from "@/enums/email-enum.js";

const uiStore = useUiStore();
const settingStore = useSettingStore();
const accountStore = useAccountStore();
const emailStore = useEmailStore();
const router = useRouter()
const email = emailStore.contentData.email || {}
const showPreview = ref(false)
const srcList = reactive([])
const trackingLoading = ref(false)
const trackingData = reactive({tracked: false, recipientEmail: '', openCount: 0, clickCount: 0, events: []})
const trackingExpanded = ref(false)
const trackingShowAll = ref(false)
const collapsedEventLimit = 5
const displayAttachments = computed(() => (Array.isArray(email.attList) ? email.attList : [])
  .filter(att => att && typeof att.filename === 'string' && att.filename.trim()))

const orderedTrackingEvents = computed(() => [...trackingData.events].reverse())
const visibleTrackingEvents = computed(() => trackingShowAll.value ? orderedTrackingEvents.value : orderedTrackingEvents.value.slice(0, collapsedEventLimit))
const latestOpenEvent = computed(() => orderedTrackingEvents.value.find(event => event.eventType === 'opened'))
const latestOpenLocation = computed(() => {
  const event = latestOpenEvent.value
  return event ? [event.city, event.region, event.country].filter(Boolean).join(' / ') : ''
})

const { t } = useI18n()
watch(() => accountStore.currentAccountId, () => {
  handleBack()
})

onMounted(() => {
  if (emailStore.contentData.showUnread && email.unread === EmailUnreadEnum.UNREAD) {
    email.unread = EmailUnreadEnum.READ;
    emailRead([email.emailId]);
  }
  if (email.type === 1) loadTracking();
})

onUnmounted(() => {
  emailStore.contentData.showUnread = false;
})

function openReply() {
  uiStore.writerRef.openReply(email)
}

function openForward() {
  uiStore.writerRef.openForward(email)
}

function toMessage(message) {
  return  message ? JSON.parse(message).message : '';
}

function formatImage(content) {
  content = content || '';
  const domain = settingStore.settings.r2Domain;
  return  content.replace(/{{domain}}/g, toOssDomain(domain) + '/');
}

function showImage(key) {
  if (!isImage(key)) return;
  const url = cvtR2Url(key)
  srcList.length = 0
  srcList.push(url)
  showPreview.value = true
}

function isImage(filename) {
  return ['png', 'jpg', 'jpeg', 'bmp', 'gif','jfif'].includes(getExtName(filename))
}

function formateReceive(recipient) {
  if (Array.isArray(recipient)) return recipient.map(item => item?.address || item).filter(Boolean).join(', ')
  try {
    const parsed = JSON.parse(recipient || '[]')
    return Array.isArray(parsed) ? parsed.map(item => item?.address || item).filter(Boolean).join(', ') : String(recipient || '')
  } catch {
    return String(recipient || '')
  }
}

function loadTracking() {
  trackingLoading.value = true
  emailTracking(email.emailId).then(data => Object.assign(trackingData, data)).finally(() => trackingLoading.value = false)
}

function trackingEventLabel(type) {
  return ({sent: t('sent'), delivered: t('delivered'), opened: t('opened'), clicked: t('clicked'), read_receipt: t('read_receipt'), bounced: t('bounced'), complained: t('complained'), delivery_delayed: t('delayed'), failed: t('sendFailMsg'), suppressed: t('suppressed')})[type] || type
}

function hasTrackingEvent(type) {
  return trackingData.events.some(event => event.eventType === type)
}

function formatCompactDate(value) {
  if (!value) return '-'
  return tzDayjs(value).format(settingStore.lang === 'en' ? 'MM/DD h:mm A' : 'M月D日 HH:mm')
}

function changeStar() {
  if (email.isStar) {
    email.isStar = 0;
    starCancel(email.emailId).then(() => {
      email.isStar = 0;
      emailStore.cancelStarEmailId = email.emailId
      setTimeout(() => emailStore.cancelStarEmailId = 0)
      emailStore.starScroll?.deleteEmail([email.emailId])
    }).catch((e) => {
      console.error(e)
      email.isStar = 1;
    })
  } else {
    email.isStar = 1;
    starAdd(email.emailId).then(() => {
      email.isStar = 1;
      emailStore.addStarEmailId = email.emailId
      setTimeout(() => emailStore.addStarEmailId = 0)
      emailStore.starScroll?.addItem(email)
    }).catch((e) => {
      console.error(e)
      email.isStar = 0;
    })
  }
}

const handleBack = () => {
  router.back()
}

const handleDelete = () => {
  ElMessageBox.confirm(t('delEmailConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    if (emailStore.contentData.delType === 'logic') {
      emailDelete(email.emailId).then(() => {
        ElMessage({
          message: t('delSuccessMsg'),
          type: 'success',
          plain: true,
        })
        emailStore.deleteIds = [email.emailId]
      })
    } else  {

      allEmailDelete(email.emailId).then(() => {
        ElMessage({
          message: t('delSuccessMsg'),
          type: 'success',
          plain: true,
        })
        emailStore.deleteIds = [email.emailId]
      })
    }

    router.back()
  })
}
</script>
<style scoped lang="scss">
.box {
  height: 100%;
  overflow: hidden;
}

.header-actions {
  padding: 9px 15px 8px;
  display: flex;
  align-items: center;
  gap: 20px;
  box-shadow: var(--header-actions-border);
  font-size: 18px;
  .star {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 21px;
  }
  .icon {
    cursor: pointer;
  }
}


.scrollbar {
  height: calc(100% - 38px);
  width: 100%;
}

.container {
  font-size: 14px;
  padding-left: 20px;
  padding-right: 20px;
  padding-top: 10px;
  @media (max-width: 1023px) {
    padding-left: 15px;
    padding-right: 15px;
  }

  .email-title {
    font-size: 20px;
    font-weight: bold;
    margin-bottom: 10px;
  }

  .htm-scrollbar {
  }

  .content {
    display: flex;
    flex-direction: column;

    .tracking {
      border: 1px solid var(--light-border-color);
      border-radius: 8px;
      padding: 12px 14px;
      margin-bottom: 14px;
      width: min(900px, 100%);
      box-sizing: border-box;
      .tracking-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
      .tracking-title { font-weight: 600; font-size: 15px; }
      .tracking-status { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; }
      .tracking-summary { display: grid; grid-template-columns: repeat(2, minmax(84px, max-content)) repeat(2, minmax(140px, max-content)) minmax(180px, 1fr); gap: 8px; }
      .tracking-card { background: var(--light-ill); padding: 8px 10px; border-radius: 6px; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
      .tracking-card span { color: var(--secondary-text-color); font-size: 12px; }
      .tracking-card strong { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .tracking-count { min-width: 74px; }
      .tracking-count strong { font-size: 18px; line-height: 20px; }
      .tracking-location { min-width: 0; }
      .tracking-toggle { border: 0; background: transparent; color: var(--el-color-primary); cursor: pointer; display: flex; align-items: center; gap: 3px; padding: 8px 0 2px; font: inherit; }
      .tracking-events { border-top: 1px solid var(--light-border-color); margin-top: 6px; padding-top: 12px; }
      .tracking-timeline { padding-left: 4px; margin: 0; }
      .event-title { font-weight: 600; }
      .event-details { color: var(--secondary-text-color); margin-top: 4px; display: flex; flex-wrap: wrap; gap: 4px 14px; }
      .event-meta { color: var(--secondary-text-color); margin-top: 4px; word-break: break-word; }
      .event-url { max-width: 650px; }
      .tracking-empty { color: var(--secondary-text-color); margin-bottom: 8px; }
      .tracking-more { border: 0; background: transparent; color: var(--el-color-primary); cursor: pointer; padding: 0 0 5px 28px; font: inherit; }
      .privacy-note { display: flex; align-items: flex-start; gap: 6px; margin-top: 8px; color: var(--secondary-text-color); font-size: 12px; line-height: 18px; }
      .privacy-note svg { flex: 0 0 auto; margin-top: 1px; }
      @media (max-width: 1100px) {
        .tracking-summary { grid-template-columns: repeat(2, minmax(100px, 1fr)); }
        .tracking-location { grid-column: 1 / -1; }
      }
      @media (max-width: 600px) {
        padding: 11px;
        .tracking-header { align-items: flex-start; }
        .tracking-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .tracking-card:not(.tracking-count) { grid-column: 1 / -1; }
      }
    }

    .att {
      margin-top: 30px;
      margin-bottom: 30px;
      border: 1px solid var(--light-border-color);
      padding: 14px;
      border-radius: 6px;
      width: fit-content;
      .att-box {
        min-width: min(410px,calc(100vw - 60px));
        max-width: 600px;
        display: grid;
        gap: 12px;
        grid-template-rows: 1fr;
      }

      .att-title {
        margin-bottom: 8px;
        display: flex;
        justify-content: space-between;
        span:first-child {
          font-weight: bold;
        }
      }

      .att-item {
        cursor: pointer;
        div {
          align-self: center;
        }
        background: var(--light-ill);
        padding: 5px 7px;
        border-radius: 4px;
        align-self: start;
        display: grid;
        grid-template-columns: auto 1fr auto auto;
        .att-icon {
          display: grid;
        }

        .att-size {
          color: var(--secondary-text-color);
        }

        .att-name {
          margin-left: 8px;
          margin-right: 8px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          word-break: break-all;
        }

        .att-image {
          width: 60px;
          height: 60px;
          object-fit: contain;
        }

        .opt-icon {
          padding-left: 10px;
          color: var(--secondary-text-color);
          align-items: center;
          display: flex;
          gap: 8px;
          cursor: pointer;
          a {
            color: var(--secondary-text-color);
            align-items: center;
            display: flex;
          }
        }
      }
    }

    .email-info {

      border-bottom: 1px solid var(--light-border-color);
      margin-bottom: 20px;
      padding-bottom: 8px;
      @media (max-width: 1024px) {
        margin-bottom: 15px;
      }
      .date {
        color: var(--regular-text-color);
        margin-bottom: 6px;
      }

      .email-msg {
        max-width: 400px;
        width: fit-content;
        margin-bottom: 15px;
      }

      .send {
        display: flex;
        margin-bottom: 6px;

        .send-name {
          color: var(--regular-text-color);
          display: flex;
          flex-wrap: wrap;
        }

        .send-name-title {
          padding-right: 5px;
        }
      }

      .receive {
        margin-bottom: 6px;
        display: flex;
        .receive-email {
          max-width: 700px;
          word-break: break-word;
        }
        span:nth-child(2) {
          color: var(--regular-text-color);
        }
      }

      .send-source {
        white-space: nowrap;
        font-weight: bold;
        padding-right: 10px;
      }

      .source {
        white-space: nowrap;
        font-weight: bold;
        padding-right: 10px;
      }
    }
  }
}

.shadow-html::after  {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--message-block-color); /* 半透明黑色蒙层 */
  pointer-events: none; /* 不影响点击 */
}

.email-text {
  font-family: inherit;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
}

.bottom-distance {
  margin-bottom: 30px;
}


</style>
