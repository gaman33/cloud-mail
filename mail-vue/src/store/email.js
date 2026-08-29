import { defineStore } from 'pinia'
import { EmailUnreadEnum } from '@/enums/email-enum.js'

export const useEmailStore = defineStore('email', {
    state: () => ({
        deleteIds: 0,
        starScroll: null,
        emailScroll: null,
        cancelStarEmailId: 0,
        addStarEmailId: 0,
        contentData: {
            email: null,
            delType: null,
            showStar: true,
            showReply: true,
            showUnread: false
        },
        sendScroll: null,
    }),
    actions: {
        markListRead(emailId) {
            for (const scroll of [this.emailScroll, this.starScroll, this.sendScroll]) {
                const item = scroll?.emailList?.find(email => email.emailId === emailId)
                if (item) item.unread = EmailUnreadEnum.READ
            }
        }
    },
    persist: {
        pick: ['contentData'],
    },
})
