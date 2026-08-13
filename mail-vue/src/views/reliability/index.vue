<template>
  <div class="reliability-page">
    <h2>{{ $t('mailReliability') }}</h2>
    <div class="summary">
      <el-card><span>{{ $t('suppressedRecipients') }}</span><strong>{{ dashboard.suppressed || 0 }}</strong></el-card>
      <el-card v-for="item in dashboard.events || []" :key="item.eventType"><span>{{ item.eventType }}</span><strong>{{ item.total }}</strong></el-card>
      <el-card v-for="item in dashboard.statuses || []" :key="`status-${item.status}`"><span>status: {{ item.status }}</span><strong>{{ item.total }}</strong></el-card>
    </div>
    <el-card class="deliverability">
      <template #header>{{ $t('deliverabilityCheck') }}</template>
      <div class="inline-form">
        <el-input v-model="domain" :placeholder="$t('domainName')" @keyup.enter="checkDomain"/>
        <el-button type="primary" :loading="checking" @click="checkDomain">{{ $t('check') }}</el-button>
      </div>
      <el-descriptions v-if="deliverability.domain" :column="4" border class="check-result">
        <el-descriptions-item :label="$t('domainName')">{{ deliverability.domain }}</el-descriptions-item>
        <el-descriptions-item label="SPF"><el-tag :type="deliverability.spf ? 'success' : 'danger'">{{ deliverability.spf ? 'PASS' : 'MISSING' }}</el-tag></el-descriptions-item>
        <el-descriptions-item label="DMARC"><el-tag :type="deliverability.dmarc ? 'success' : 'danger'">{{ deliverability.dmarc ? 'PASS' : 'MISSING' }}</el-tag></el-descriptions-item>
        <el-descriptions-item label="DKIM">{{ deliverability.dkim }}</el-descriptions-item>
      </el-descriptions>
    </el-card>
    <el-tabs>
      <el-tab-pane :label="$t('contacts')">
        <el-table :data="contacts"><el-table-column prop="email" :label="$t('emailAccount')"/><el-table-column prop="name" :label="$t('username')"/><el-table-column prop="tags" :label="$t('tags')"><template #default="scope">{{ displayTags(scope.row.tags) }}</template></el-table-column><el-table-column prop="nextFollowUpTime" :label="$t('nextFollowUp')"/><el-table-column prop="lastContactTime" :label="$t('latestEmail')"/><el-table-column><template #default="scope"><el-button link type="primary" @click="editContact(scope.row)">{{ $t('edit') }}</el-button></template></el-table-column></el-table>
      </el-tab-pane>
      <el-tab-pane :label="$t('suppressionList')">
        <el-table :data="suppressions"><el-table-column prop="email" :label="$t('emailAccount')"/><el-table-column prop="reason" :label="$t('reason')"/><el-table-column prop="source" label="Source"/><el-table-column><template #default="scope"><el-button link type="primary" @click="removeSuppression(scope.row)">{{ $t('restore') }}</el-button></template></el-table-column></el-table>
      </el-tab-pane>
      <el-tab-pane :label="$t('templatesAndSnippets')">
        <el-button type="primary" @click="editTemplate()">{{ $t('add') }}</el-button>
        <el-table :data="templates"><el-table-column prop="name" :label="$t('name')"/><el-table-column prop="type" :label="$t('type')"/><el-table-column prop="subject" :label="$t('subject')"/><el-table-column><template #default="scope"><el-button link @click="editTemplate(scope.row)">{{ $t('edit') }}</el-button><el-button link type="danger" @click="removeTemplate(scope.row)">{{ $t('delete') }}</el-button></template></el-table-column></el-table>
      </el-tab-pane>
      <el-tab-pane :label="$t('auditLog')">
        <el-table :data="audit"><el-table-column prop="createTime" :label="$t('time')"/><el-table-column prop="action" :label="$t('operation')"/><el-table-column prop="targetType" :label="$t('type')"/><el-table-column prop="ip" label="IP"/></el-table>
      </el-tab-pane>
      <el-tab-pane :label="$t('sendQueue')">
        <el-table :data="sendJobs"><el-table-column prop="recipientEmail" :label="$t('emailAccount')"/><el-table-column prop="status" :label="$t('status')"/><el-table-column prop="attempts" :label="$t('attempts')"/><el-table-column prop="nextAttemptTime" :label="$t('nextRetry')"/><el-table-column prop="lastError" :label="$t('reason')" show-overflow-tooltip/><el-table-column><template #default="scope"><el-button v-if="scope.row.status === 'failed'" link type="primary" @click="retryJob(scope.row)">{{ $t('retry') }}</el-button></template></el-table-column></el-table>
      </el-tab-pane>
    </el-tabs>
    <el-dialog v-model="templateShow" :title="$t('templatesAndSnippets')">
      <el-form label-position="top"><el-form-item :label="$t('name')"><el-input v-model="templateForm.name"/></el-form-item><el-form-item :label="$t('type')"><el-select v-model="templateForm.type"><el-option value="template" label="Template"/><el-option value="snippet" label="Snippet"/></el-select></el-form-item><el-form-item :label="$t('subject')"><el-input v-model="templateForm.subject"/></el-form-item><el-form-item :label="$t('content')"><el-input v-model="templateForm.content" type="textarea" :rows="8"/></el-form-item></el-form>
      <template #footer><el-button @click="templateShow=false">{{ $t('cancel') }}</el-button><el-button type="primary" @click="saveTemplate">{{ $t('save') }}</el-button></template>
    </el-dialog>
    <el-dialog v-model="contactShow" :title="$t('editContact')">
      <el-form label-position="top">
        <el-form-item :label="$t('emailAccount')"><el-input :model-value="contactForm.email" disabled/></el-form-item>
        <el-form-item :label="$t('username')"><el-input v-model="contactForm.name"/></el-form-item>
        <el-form-item :label="$t('tags')"><el-input v-model="contactForm.tagsText" :placeholder="$t('commaSeparated')"/></el-form-item>
        <el-form-item :label="$t('nextFollowUp')"><el-date-picker v-model="contactForm.nextFollowUpTime" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss.SSSZ"/></el-form-item>
        <el-form-item :label="$t('notes')"><el-input v-model="contactForm.notes" type="textarea" :rows="5"/></el-form-item>
      </el-form>
      <template #footer><el-button @click="contactShow=false">{{ $t('cancel') }}</el-button><el-button type="primary" @click="saveContact">{{ $t('save') }}</el-button></template>
    </el-dialog>
  </div>
</template>
<script setup>
import {onMounted, reactive, ref} from 'vue'
import {auditList, contactList, contactUpdate, deliverabilityCheck, reliabilityDashboard, sendJobList, sendJobRetry, suppressionList, suppressionRemove, templateDelete, templateList, templateSave} from '@/request/reliability.js'
const dashboard=reactive({}); const contacts=ref([]); const suppressions=ref([]); const templates=ref([]); const audit=ref([]); const sendJobs=ref([]); const templateShow=ref(false)
const templateForm=reactive({templateId:null,name:'',type:'template',subject:'',content:'',text:''})
const domain=ref(''); const checking=ref(false); const deliverability=reactive({}); const contactShow=ref(false)
const contactForm=reactive({contactId:null,email:'',name:'',tagsText:'',notes:'',nextFollowUpTime:null})
async function load(){Object.assign(dashboard,await reliabilityDashboard()); contacts.value=await contactList(); suppressions.value=await suppressionList(); templates.value=await templateList(); audit.value=await auditList(); sendJobs.value=await sendJobList()}
function editTemplate(row={}){Object.assign(templateForm,{templateId:null,name:'',type:'template',subject:'',content:'',text:''},row);templateShow.value=true}
async function saveTemplate(){await templateSave(templateForm);templateShow.value=false;templates.value=await templateList();audit.value=await auditList()}
async function removeTemplate(row){await templateDelete(row.templateId);templates.value=await templateList();audit.value=await auditList()}
async function removeSuppression(row){await suppressionRemove(row.email);suppressions.value=await suppressionList();Object.assign(dashboard,await reliabilityDashboard());audit.value=await auditList()}
function displayTags(value){try{return JSON.parse(value || '[]').join(', ')}catch{return value || ''}}
function editContact(row){Object.assign(contactForm,{contactId:row.contactId,email:row.email,name:row.name || '',tagsText:displayTags(row.tags),notes:row.notes || '',nextFollowUpTime:row.nextFollowUpTime || null});contactShow.value=true}
async function saveContact(){await contactUpdate(contactForm.contactId,{name:contactForm.name,tags:contactForm.tagsText,notes:contactForm.notes,nextFollowUpTime:contactForm.nextFollowUpTime});contactShow.value=false;contacts.value=await contactList();audit.value=await auditList()}
async function checkDomain(){if(!domain.value.trim())return;checking.value=true;try{Object.assign(deliverability,await deliverabilityCheck(domain.value.trim()))}finally{checking.value=false}}
async function retryJob(row){await sendJobRetry(row.jobId);sendJobs.value=await sendJobList();audit.value=await auditList()}
onMounted(load)
</script>
<style scoped>.reliability-page{padding:20px;overflow:auto;width:100%}.summary{display:flex;gap:12px;flex-wrap:wrap;margin:16px 0}.summary .el-card{min-width:140px}.summary span,.summary strong{display:block}.summary strong{font-size:24px;margin-top:8px}.deliverability{margin-bottom:16px}.inline-form{display:flex;gap:10px;max-width:560px}.check-result{margin-top:14px}</style>
