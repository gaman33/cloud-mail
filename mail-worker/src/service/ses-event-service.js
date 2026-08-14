import trackingService from './tracking-service';
import reliabilityService from './reliability-service';
import emailService from './email-service';
import { emailConst } from '../const/entity-const';

const STATUS_BY_EVENT = {
	SEND: emailConst.status.SENT,
	DELIVERY: emailConst.status.DELIVERED,
	BOUNCE: emailConst.status.BOUNCED,
	COMPLAINT: emailConst.status.COMPLAINED,
	DELIVERY_DELAY: emailConst.status.DELAYED,
	REJECT: emailConst.status.FAILED,
	RENDERING_FAILURE: emailConst.status.FAILED
};

const CLOUD_MAIL_EVENT_BY_SES = {
	SEND: 'sent',
	DELIVERY: 'delivered',
	BOUNCE: 'bounced',
	COMPLAINT: 'complained',
	DELIVERY_DELAY: 'delivery_delayed',
	REJECT: 'failed',
	RENDERING_FAILURE: 'failed',
	SUBSCRIPTION: 'subscribed'
};

function normalizeType(value) {
	return String(value || '').trim().replace(/([a-z])([A-Z])/g, '$1_$2').replace(/[\s.-]+/g, '_').toUpperCase();
}

function recipientAddresses(payload) {
	const type = normalizeType(payload.eventType || payload.notificationType);
	if (type === 'BOUNCE') return (payload.bounce?.bouncedRecipients || []).map(item => item.emailAddress).filter(Boolean);
	if (type === 'COMPLAINT') return (payload.complaint?.complainedRecipients || []).map(item => item.emailAddress).filter(Boolean);
	return payload.delivery?.recipients || payload.mail?.destination || [];
}

function eventTime(payload) {
	return payload.delivery?.timestamp || payload.bounce?.timestamp || payload.complaint?.timestamp
		|| payload.delay?.timestamp || payload.mail?.timestamp || new Date().toISOString();
}

const sesEventService = {
	async handle(c, snsEnvelope) {
		const payload = JSON.parse(snsEnvelope.Message || '{}');
		const type = normalizeType(payload.eventType || payload.notificationType);
		const messageId = payload.mail?.messageId;
		if (!messageId || !type) return null;
		const addresses = recipientAddresses(payload);
		const body = {
			type: `email.${CLOUD_MAIL_EVENT_BY_SES[type] || type.toLowerCase()}`,
			created_at: eventTime(payload),
			data: {
				email_id: messageId,
				to: addresses,
				bounce: payload.bounce,
				failed: payload.reject || payload.failure || payload.renderingFailure
			}
		};
		const emailRow = await trackingService.recordProviderEvent(c, body, snsEnvelope.MessageId, 'ses');
		if (!emailRow) return null;

		if (['BOUNCE', 'COMPLAINT'].includes(type)) {
			for (const address of addresses) await reliabilityService.suppress(c, emailRow.userId, address, type.toLowerCase(), 'ses');
		}
		const status = STATUS_BY_EVENT[type];
		if (status !== undefined) {
			await emailService.updateEmailStatus(c, {
				resendEmailId: messageId,
				provider: 'ses',
				status,
				message: type === 'BOUNCE' ? JSON.stringify(payload.bounce || {}) : (payload.reject?.reason || payload.failure?.errorMessage || '')
			});
		}
		return emailRow;
	}
};

export { normalizeType, recipientAddresses };
export default sesEventService;
