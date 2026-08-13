<template>
  <div class="reliability-page" v-loading="loading">
    <section class="hero">
      <div>
        <h2>{{ $t('mailReliability') }}</h2>
        <p>{{ $t('reliabilityIntro') }}</p>
      </div>
      <el-button :loading="loading" @click="load">
        <Icon icon="ion:reload" width="17" />
        {{ $t('refreshData') }}
      </el-button>
    </section>

    <section class="health-strip" :class="healthClass">
      <Icon :icon="healthIcon" width="28" />
      <div>
        <strong>{{ healthTitle }}</strong>
        <span>{{ healthDescription }}</span>
      </div>
    </section>

    <section class="metric-grid">
      <article class="metric metric-primary">
        <div class="metric-icon"><Icon icon="solar:letter-opened-outline" width="24" /></div>
        <div><span>{{ $t('acceptedMessages') }}</span><strong>{{ summary.accepted }}</strong><small>{{ $t('acceptedMessagesHint') }}</small></div>
      </article>
      <article class="metric">
        <div class="metric-icon"><Icon icon="material-symbols:mark-email-read-outline" width="24" /></div>
        <div><span>{{ $t('confirmedDelivered') }}</span><strong>{{ summary.delivered }}</strong><small>{{ $t('confirmedDeliveredHint') }}</small></div>
      </article>
      <article class="metric">
        <div class="metric-icon"><Icon icon="material-symbols:visibility-outline" width="24" /></div>
        <div><span>{{ $t('openEvents') }}</span><strong>{{ summary.openEvents }}</strong><small>{{ $t('openEventsHint') }}</small></div>
      </article>
      <article class="metric">
        <div class="metric-icon"><Icon icon="material-symbols:ads-click" width="24" /></div>
        <div><span>{{ $t('clickEvents') }}</span><strong>{{ summary.clickEvents }}</strong><small>{{ $t('clickEventsHint') }}</small></div>
      </article>
      <article class="metric" :class="{'metric-warning': summary.bounced > 0}">
        <div class="metric-icon"><Icon icon="material-symbols:cancel-outline" width="24" /></div>
        <div><span>{{ $t('failedOrBounced') }}</span><strong>{{ summary.bounced }}</strong><small>{{ $t('failedOrBouncedHint') }}</small></div>
      </article>
      <article class="metric" :class="{'metric-warning': summary.activeQueue + summary.failedQueue > 0}">
        <div class="metric-icon"><Icon icon="material-symbols:queue-mail-outline" width="24" /></div>
        <div><span>{{ $t('queueNeedsAttention') }}</span><strong>{{ summary.activeQueue + summary.failedQueue }}</strong><small>{{ $t('queueNeedsAttentionHint') }}</small></div>
      </article>
      <article class="metric" :class="{'metric-warning': dashboard.suppressed > 0}">
        <div class="metric-icon"><Icon icon="material-symbols:block" width="24" /></div>
        <div><span>{{ $t('suppressedRecipients') }}</span><strong>{{ dashboard.suppressed || 0 }}</strong><small>{{ $t('suppressedRecipientsHint') }}</small></div>
      </article>
    </section>

    <el-card class="deliverability" shadow="never">
      <template #header>
        <div class="card-heading">
          <div>
            <strong>{{ $t('deliverabilityCheck') }}</strong>
            <span>{{ $t('deliverabilityCheckHint') }}</span>
          </div>
        </div>
      </template>
      <div class="inline-form">
        <el-input v-model="domain" :placeholder="$t('domainExample')" @keyup.enter="checkDomain"/>
        <el-button type="primary" :loading="checking" @click="checkDomain">{{ $t('check') }}</el-button>
      </div>
      <el-descriptions v-if="deliverability.domain" :column="4" border class="check-result">
        <el-descriptions-item :label="$t('domainName')">{{ deliverability.domain }}</el-descriptions-item>
        <el-descriptions-item label="SPF"><el-tag :type="deliverability.spf ? 'success' : 'danger'">{{ deliverability.spf ? $t('configured') : $t('missing') }}</el-tag></el-descriptions-item>
        <el-descriptions-item label="DMARC"><el-tag :type="deliverability.dmarc ? 'success' : 'danger'">{{ deliverability.dmarc ? $t('configured') : $t('missing') }}</el-tag></el-descriptions-item>
        <el-descriptions-item label="DKIM">{{ $t('dkimProviderHint') }}</el-descriptions-item>
      </el-descriptions>
    </el-card>

    <el-tabs v-model="activeTab" class="reliability-tabs">
      <el-tab-pane name="contacts">
        <template #label><Icon icon="material-symbols:contacts-outline" width="17"/> {{ $t('contacts') }}</template>
        <p class="tab-description">{{ $t('contactsHint') }}</p>
        <el-table :data="contacts" empty-text="—">
          <el-table-column prop="email" :label="$t('emailAccount')" min-width="220"/>
          <el-table-column prop="name" :label="$t('username')" min-width="130"/>
          <el-table-column prop="tags" :label="$t('tags')" min-width="160"><template #default="scope">{{ displayTags(scope.row.tags) || '—' }}</template></el-table-column>
          <el-table-column prop="nextFollowUpTime" :label="$t('nextFollowUp')" min-width="180"><template #default="scope">{{ formatDate(scope.row.nextFollowUpTime) }}</template></el-table-column>
          <el-table-column prop="lastContactTime" :label="$t('latestEmail')" min-width="180"><template #default="scope">{{ formatDate(scope.row.lastContactTime) }}</template></el-table-column>
          <el-table-column width="80"><template #default="scope"><el-button link type="primary" @click="editContact(scope.row)">{{ $t('edit') }}</el-button></template></el-table-column>
        </el-table>
      </el-tab-pane>
      <el-tab-pane name="suppressions">
        <template #label><Icon icon="material-symbols:block" width="17"/> {{ $t('suppressionList') }} <el-badge v-if="activeSuppressions.length" :value="activeSuppressions.length" /></template>
        <p class="tab-description">{{ $t('suppressionListHint') }}</p>
        <el-table :data="activeSuppressions" empty-text="—">
          <el-table-column prop="email" :label="$t('emailAccount')" min-width="240"/>
          <el-table-column prop="reason" :label="$t('reason')" min-width="150"><template #default="scope">{{ reasonLabel(scope.row.reason) }}</template></el-table-column>
          <el-table-column prop="source" :label="$t('source')" min-width="130"/>
          <el-table-column prop="createTime" :label="$t('time')" min-width="180"><template #default="scope">{{ formatDate(scope.row.createTime) }}</template></el-table-column>
          <el-table-column width="100"><template #default="scope"><el-button link type="primary" @click="removeSuppression(scope.row)">{{ $t('allowSendingAgain') }}</el-button></template></el-table-column>
        </el-table>
      </el-tab-pane>
      <el-tab-pane name="templates">
        <template #label><Icon icon="material-symbols:description-outline" width="17"/> {{ $t('templatesAndSnippets') }}</template>
        <div class="tab-toolbar"><p class="tab-description">{{ $t('templatesHint') }}</p><el-button type="primary" @click="editTemplate()">{{ $t('add') }}</el-button></div>
        <el-table :data="templates" empty-text="—"><el-table-column prop="name" :label="$t('name')"/><el-table-column prop="type" :label="$t('type')"/><el-table-column prop="subject" :label="$t('subject')"/><el-table-column width="140"><template #default="scope"><el-button link @click="editTemplate(scope.row)">{{ $t('edit') }}</el-button><el-button link type="danger" @click="removeTemplate(scope.row)">{{ $t('delete') }}</el-button></template></el-table-column></el-table>
      </el-tab-pane>
      <el-tab-pane name="queue">
        <template #label><Icon icon="material-symbols:queue-mail-outline" width="17"/> {{ $t('sendQueue') }} <el-badge v-if="summary.activeQueue + summary.failedQueue" :value="summary.activeQueue + summary.failedQueue" /></template>
        <p class="tab-description">{{ $t('sendQueueHint') }}</p>
        <el-table :data="sendJobs" empty-text="—">
          <el-table-column prop="recipientEmail" :label="$t('emailAccount')" min-width="230"/>
          <el-table-column prop="status" :label="$t('status')" min-width="120"><template #default="scope"><el-tag :type="queueTagType(scope.row.status)">{{ queueStatusLabel(scope.row.status) }}</el-tag></template></el-table-column>
          <el-table-column prop="attempts" :label="$t('attempts')" width="90"/>
          <el-table-column prop="nextAttemptTime" :label="$t('nextRetry')" min-width="180"><template #default="scope">{{ formatDate(scope.row.nextAttemptTime) }}</template></el-table-column>
          <el-table-column prop="lastError" :label="$t('reason')" min-width="220" show-overflow-tooltip/>
          <el-table-column width="80"><template #default="scope"><el-button v-if="scope.row.status === 'failed'" link type="primary" @click="retryJob(scope.row)">{{ $t('retry') }}</el-button></template></el-table-column>
        </el-table>
      </el-tab-pane>
      <el-tab-pane name="audit">
        <template #label><Icon icon="material-symbols:history" width="17"/> {{ $t('auditLog') }}</template>
        <p class="tab-description">{{ $t('auditLogHint') }}</p>
        <el-table :data="audit" empty-text="—"><el-table-column prop="createTime" :label="$t('time')" min-width="180"><template #default="scope">{{ formatDate(scope.row.createTime) }}</template></el-table-column><el-table-column prop="action" :label="$t('operation')" min-width="200"><template #default="scope">{{ actionLabel(scope.row.action) }}</template></el-table-column><el-table-column prop="targetType" :label="$t('type')" min-width="120"/><el-table-column prop="ip" label="IP" min-width="150"/></el-table>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="templateShow" :title="$t('templatesAndSnippets')">
      <el-form label-position="top"><el-form-item :label="$t('name')"><el-input v-model="templateForm.name"/></el-form-item><el-form-item :label="$t('type')"><el-select v-model="templateForm.type"><el-option value="template" label="Template"/><el-option value="snippet" label="Snippet"/></el-select></el-form-item><el-form-item :label="$t('subject')"><el-input v-model="templateForm.subject"/></el-form-item><el-form-item :label="$t('content')"><el-input v-model="templateForm.content" type="textarea" :rows="8"/></el-form-item></el-form>
      <template #footer><el-button @click="templateShow=false">{{ $t('cancel') }}</el-button><el-button type="primary" @click="saveTemplate">{{ $t('save') }}</el-button></template>
    </el-dialog>
    <el-dialog v-model="contactShow" :title="$t('editContact')">
      <el-form label-position="top"><el-form-item :label="$t('emailAccount')"><el-input :model-value="contactForm.email" disabled/></el-form-item><el-form-item :label="$t('username')"><el-input v-model="contactForm.name"/></el-form-item><el-form-item :label="$t('tags')"><el-input v-model="contactForm.tagsText" :placeholder="$t('commaSeparated')"/></el-form-item><el-form-item :label="$t('nextFollowUp')"><el-date-picker v-model="contactForm.nextFollowUpTime" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss.SSSZ"/></el-form-item><el-form-item :label="$t('notes')"><el-input v-model="contactForm.notes" type="textarea" :rows="5"/></el-form-item></el-form>
      <template #footer><el-button @click="contactShow=false">{{ $t('cancel') }}</el-button><el-button type="primary" @click="saveContact">{{ $t('save') }}</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import {computed, reactive, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {Icon} from '@iconify/vue'
import {tzDayjs} from '@/utils/day.js'
import {auditList, contactList, contactUpdate, deliverabilityCheck, reliabilityDashboard, sendJobList, sendJobRetry, suppressionList, suppressionRemove, templateDelete, templateList, templateSave} from '@/request/reliability.js'

const {t}=useI18n()
const dashboard=reactive({suppressed:0,summary:{}}); const contacts=ref([]); const suppressions=ref([]); const templates=ref([]); const audit=ref([]); const sendJobs=ref([])
const templateShow=ref(false); const contactShow=ref(false); const checking=ref(false); const loading=ref(false); const activeTab=ref('contacts')
const templateForm=reactive({templateId:null,name:'',type:'template',subject:'',content:'',text:''})
const contactForm=reactive({contactId:null,email:'',name:'',tagsText:'',notes:'',nextFollowUpTime:null})
const domain=ref(''); const deliverability=reactive({})
const summary=computed(()=>({accepted:0,delivered:0,bounced:0,complained:0,delayed:0,openEvents:0,clickEvents:0,activeQueue:0,failedQueue:0,...dashboard.summary}))
const activeSuppressions=computed(()=>suppressions.value.filter(item=>Number(item.active)!==0))
const healthClass=computed(()=>summary.value.bounced || summary.value.complained || summary.value.failedQueue ? 'health-warning' : 'health-ok')
const healthIcon=computed(()=>healthClass.value==='health-ok'?'material-symbols:verified-outline':'material-symbols:warning-outline')
const healthTitle=computed(()=>healthClass.value==='health-ok'?t('reliabilityHealthy'):t('reliabilityAttention'))
const healthDescription=computed(()=>healthClass.value==='health-ok'?t('reliabilityHealthyHint'):t('reliabilityAttentionHint',{failed:summary.value.bounced + summary.value.failedQueue,complained:summary.value.complained}))

async function load(){loading.value=true;try{const [dash,contactRows,suppressionRows,templateRows,auditRows,jobRows]=await Promise.all([reliabilityDashboard(),contactList(),suppressionList(),templateList(),auditList(),sendJobList()]);Object.assign(dashboard,dash);contacts.value=contactRows;suppressions.value=suppressionRows;templates.value=templateRows;audit.value=auditRows;sendJobs.value=jobRows}finally{loading.value=false}}
function editTemplate(row={}){Object.assign(templateForm,{templateId:null,name:'',type:'template',subject:'',content:'',text:''},row);templateShow.value=true}
async function saveTemplate(){await templateSave(templateForm);templateShow.value=false;templates.value=await templateList();audit.value=await auditList()}
async function removeTemplate(row){await templateDelete(row.templateId);templates.value=await templateList();audit.value=await auditList()}
async function removeSuppression(row){await suppressionRemove(row.email);suppressions.value=await suppressionList();Object.assign(dashboard,await reliabilityDashboard());audit.value=await auditList()}
function displayTags(value){try{return JSON.parse(value||'[]').join(', ')}catch{return value||''}}
function editContact(row){Object.assign(contactForm,{contactId:row.contactId,email:row.email,name:row.name||'',tagsText:displayTags(row.tags),notes:row.notes||'',nextFollowUpTime:row.nextFollowUpTime||null});contactShow.value=true}
async function saveContact(){await contactUpdate(contactForm.contactId,{name:contactForm.name,tags:contactForm.tagsText,notes:contactForm.notes,nextFollowUpTime:contactForm.nextFollowUpTime});contactShow.value=false;contacts.value=await contactList();audit.value=await auditList()}
async function checkDomain(){if(!domain.value.trim())return;checking.value=true;try{Object.assign(deliverability,await deliverabilityCheck(domain.value.trim()))}finally{checking.value=false}}
async function retryJob(row){await sendJobRetry(row.jobId);sendJobs.value=await sendJobList();Object.assign(dashboard,await reliabilityDashboard());audit.value=await auditList()}
function formatDate(value){return value?tzDayjs(value).format('YYYY-MM-DD HH:mm'):'—'}
function translatedOrFallback(key,fallback){const value=t(key);return value===key?fallback:value}
function queueStatusLabel(status){return translatedOrFallback(`queueStatus_${status}`,status||'—')}
function queueTagType(status){return({sent:'success',failed:'danger',retry:'warning',processing:'primary',pending:'info'})[status]||'info'}
function reasonLabel(reason){return translatedOrFallback(`suppressionReason_${reason}`,reason||'—')}
function actionLabel(action){return translatedOrFallback(`auditAction_${String(action||'').replaceAll('.','_')}`,action||'—')}
load()
</script>

<style scoped lang="scss">
.reliability-page{padding:18px 22px 32px;overflow:auto;width:100%;box-sizing:border-box;background:var(--light-ill);min-height:100%}.hero{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:14px}.hero h2{margin:0 0 5px;font-size:22px}.hero p,.tab-description,.card-heading span{margin:0;color:var(--secondary-text-color);line-height:1.6}.health-strip{display:flex;align-items:center;gap:12px;border-radius:10px;padding:14px 16px;margin-bottom:14px;border:1px solid}.health-strip div{display:flex;flex-direction:column;gap:3px}.health-strip span{font-size:13px}.health-ok{color:#237a4b;background:#f0f9f4;border-color:#b9e5ca}.health-warning{color:#a25a00;background:#fff8e8;border-color:#f1d493}.metric-grid{display:grid;grid-template-columns:repeat(7,minmax(138px,1fr));gap:10px;margin-bottom:14px}.metric{background:var(--el-bg-color);border:1px solid var(--light-border-color);border-radius:10px;padding:14px;display:flex;gap:10px;min-width:0}.metric-icon{height:38px;width:38px;border-radius:9px;display:flex;align-items:center;justify-content:center;background:var(--light-ill);color:var(--el-color-primary);flex:none}.metric div:last-child{display:flex;flex-direction:column;min-width:0}.metric span{font-size:13px;color:var(--secondary-text-color)}.metric strong{font-size:25px;line-height:1.25;margin:2px 0}.metric small{font-size:11px;color:var(--secondary-text-color);line-height:1.3}.metric-warning{border-color:#e6a23c}.metric-warning .metric-icon{color:#e6a23c}.deliverability{margin-bottom:14px;border-radius:10px}.card-heading div{display:flex;flex-direction:column;gap:3px}.inline-form{display:flex;gap:10px;max-width:620px}.check-result{margin-top:14px}.reliability-tabs{background:var(--el-bg-color);border:1px solid var(--light-border-color);border-radius:10px;padding:0 12px 12px}.reliability-tabs :deep(.el-tabs__item){display:flex;gap:5px;align-items:center}.tab-description{font-size:13px;margin:0 0 12px}.tab-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px}.tab-toolbar .tab-description{margin:0}@media(max-width:1450px){.metric-grid{grid-template-columns:repeat(4,minmax(150px,1fr))}}@media(max-width:900px){.metric-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.reliability-page{padding:14px}.hero{align-items:center}.inline-form{flex-direction:column}.reliability-tabs{overflow:hidden}}@media(max-width:520px){.metric-grid{grid-template-columns:1fr}.hero p{display:none}}
</style>
