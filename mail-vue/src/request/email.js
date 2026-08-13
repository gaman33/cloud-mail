import http from '@/axios/index.js';

export function emailList(accountId, allReceive, emailId, timeSort, size, type) {
    return http.get('/email/list', {params: {accountId, allReceive, emailId, timeSort, size, type}})
}

export function emailDelete(emailIds) {
    return http.delete('/email/delete?emailIds=' + emailIds)
}

export function emailLatest(emailId, accountId, allReceive) {
    return http.get('/email/latest', {params: {emailId, accountId, allReceive}, noMsg: true, timeout: 35 * 1000})
}

export function emailRead(emailIds) {
    return http.put('/email/read', {emailIds})
}

export function emailTracking(emailId) {
    return http.get(`/email/tracking/${emailId}`, {noMsg: true})
}

export function emailSend(form,progress) {
    return http.post('/email/send', form,{
        onUploadProgress: (e) => {
            progress(e)
        },
        noMsg: true
    })
}

export function attachmentUpload(file, progress) {
    const data = new FormData()
    data.append('file', file)
    return http.post('/attachment/upload', data, {noMsg: true, onUploadProgress: progress})
}

export function attachmentCancel(token) {
    return http.delete(`/attachment/upload/${token}`, {noMsg: true})
}
