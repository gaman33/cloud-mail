import emailService from './email-service';
import trackingService from './tracking-service';
import { emailConst } from '../const/entity-const';
import reliabilityService from './reliability-service';

const STATUS_BY_EVENT = {
	'email.sent': emailConst.status.SENT,
	'email.delivered': emailConst.status.DELIVERED,
	'email.complained': emailConst.status.COMPLAINED,
	'email.bounced': emailConst.status.BOUNCED,
	'email.delivery_delayed': emailConst.status.DELAYED,
	'email.failed': emailConst.status.FAILED
};

function eventMessage(body) {
	if (body.type === 'email.bounced') return JSON.stringify(body.data?.bounce || {});
	if (body.type === 'email.failed') return body.data?.failed?.reason || '';
	return null;
}

const resendService = {
	async webhooks(c, body, providerEventId) {
		const emailRow = await trackingService.recordProviderEvent(c, body, providerEventId);
		if (emailRow && ['email.bounced', 'email.complained', 'email.suppressed'].includes(body.type)) {
			const addresses = Array.isArray(body.data?.to) ? body.data.to : [body.data?.to].filter(Boolean);
			for (const address of addresses) await reliabilityService.suppress(c, emailRow.userId, address, body.type.replace('email.', ''), 'resend');
		}
		const status = STATUS_BY_EVENT[body.type];
		if (status === undefined || !emailRow) return emailRow;

		return emailService.updateEmailStatus(c, {
			resendEmailId: body.data.email_id,
			provider: 'resend',
			status,
			message: eventMessage(body)
		});
	}
};

export default resendService;
