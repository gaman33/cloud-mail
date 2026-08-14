import orm from '../entity/orm';
import { att } from '../entity/att';
import { and, eq, isNull, inArray, desc } from 'drizzle-orm';
import r2Service from './r2-service';
import constant from '../const/constant';
import fileUtils from '../utils/file-utils';
import { attConst } from '../const/entity-const';
import { parseHTML } from 'linkedom';
import { v4 as uuidv4 } from 'uuid';
import domainUtils from '../utils/domain-uitls';
import settingService from "./setting-service";
import attachmentUpload from '../entity/attachment-upload';
import BizError from '../error/biz-error';

const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_SIZE = 25 * 1024 * 1024;

const attService = {
	async upload(c, file, userId) {
		if (!file || typeof file.arrayBuffer !== 'function') throw new BizError('Attachment file is required');
		if (!file.size || file.size > MAX_ATTACHMENT_SIZE) throw new BizError('Attachment exceeds the 20 MB limit');
		const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
		const filename = String(file.name || 'attachment').slice(0, 255);
		const mimeType = String(file.type || 'application/octet-stream').slice(0, 255);
		const key = `${constant.ATTACHMENT_PREFIX}uploads/${userId}/${token}${fileUtils.getExtFileName(filename)}`;
		const content = await file.arrayBuffer();
		await r2Service.putObj(c, key, content, {
			contentType: mimeType,
			contentDisposition: `attachment;filename=${encodeURIComponent(filename)}`
		});
		try {
			await orm(c).insert(attachmentUpload).values({userId, token, key, filename, mimeType, size: file.size}).run();
		} catch (error) {
			await r2Service.delete(c, key);
			throw error;
		}
		return {uploadToken: token, filename, size: file.size, contentType: mimeType};
	},

	async cancelUpload(c, token, userId) {
		const row = await orm(c).select().from(attachmentUpload).where(and(
			eq(attachmentUpload.token, token), eq(attachmentUpload.userId, userId), eq(attachmentUpload.consumed, 0)
		)).get();
		if (!row) return;
		await r2Service.delete(c, row.key);
		await orm(c).delete(attachmentUpload).where(eq(attachmentUpload.uploadId, row.uploadId)).run();
	},

	async resolveSendAttachments(c, attachments, userId, allowConsumed = false) {
		if (!Array.isArray(attachments) || attachments.length === 0) return [];
		if (attachments.length > 10) throw new BizError('A maximum of 10 attachments is allowed');
		let total = 0;
		const resolved = [];
		for (const item of attachments) {
			if (item.sourceAttachmentId) {
				const source = await this.selectOwnedAttachment(c, item.sourceAttachmentId, userId);
				if (!source) throw new BizError('Forwarded attachment is unavailable');
				const obj = await r2Service.getObj(c, source.key);
				if (!obj) throw new BizError('Forwarded attachment data is no longer available');
				const content = obj instanceof ArrayBuffer ? obj : await obj.arrayBuffer();
				total += Number(source.size || content.byteLength || 0);
				resolved.push({
					sourceAttachmentId: source.attId,
					filename: source.filename,
					size: source.size,
					contentType: source.mimeType,
					mimeType: source.mimeType,
					type: source.mimeType,
					content
				});
				continue;
			}
			if (!item.uploadToken) {
				const content = String(item.content || '').replace(/^data:[^,]*,/, '').replace(/\s+/g, '');
				const estimatedSize = content ? Math.floor(content.length * 3 / 4) : Number(item.size || 0);
				if (estimatedSize > MAX_ATTACHMENT_SIZE) throw new BizError('Attachment exceeds the 20 MB limit');
				total += estimatedSize;
				resolved.push(item);
				continue;
			}
			const filters = [eq(attachmentUpload.token, item.uploadToken), eq(attachmentUpload.userId, userId)];
			if (!allowConsumed) filters.push(eq(attachmentUpload.consumed, 0));
			const row = await orm(c).select().from(attachmentUpload).where(and(...filters)).get();
			if (!row) throw new BizError('Attachment upload is invalid or has already been used');
			const obj = await r2Service.getObj(c, row.key);
			if (!obj) throw new BizError('Attachment data is no longer available');
			const content = obj instanceof ArrayBuffer ? obj : await obj.arrayBuffer();
			total += row.size;
			resolved.push({
				uploadToken: row.token, filename: row.filename, size: row.size,
				contentType: row.mimeType, mimeType: row.mimeType, type: row.mimeType, content
			});
		}
		if (total > MAX_TOTAL_ATTACHMENT_SIZE) throw new BizError('Attachments exceed the 25 MB total limit');
		return resolved;
	},

	selectOwnedAttachment(c, attachmentId, userId) {
		return orm(c).select().from(att).where(and(
			eq(att.attId, Number(attachmentId)),
			eq(att.userId, userId),
			eq(att.type, attConst.type.ATT)
		)).get();
	},

	async addAtt(c, attachments) {

		for (let attachment of attachments) {

			let metadate = {
				contentType: attachment.mimeType,
			}

			if (!attachment.contentId) {
				metadate.contentDisposition = `attachment;filename=${attachment.filename}`
			} else {
				metadate.contentDisposition = `inline;filename=${attachment.filename}`
				metadate.cacheControl = `max-age=259200`
			}

			await r2Service.putObj(c, attachment.key, attachment.content, metadate);

		}

		await orm(c).insert(att).values(attachments).run();
	},

	list(c, params, userId) {
		const { emailId } = params;

		return orm(c).select().from(att).where(
			and(
				eq(att.emailId, emailId),
				eq(att.userId, userId),
				eq(att.type, attConst.type.ATT),
				isNull(att.contentId)
			)
		).all();
	},

	async toImageUrlHtml(c, content) {

		const { r2Domain } = await settingService.query(c);

		const { document } = parseHTML(content);

		const images = Array.from(document.querySelectorAll('img'));

		let imageDataList = [];

		for (const img of images) {

			//邮件正文base64图片转cid附件
			const src = img.getAttribute('src');
			if (src && src.startsWith('data:image')) {
				const file = fileUtils.base64ToFile(src);
				const buff = await file.arrayBuffer();
				const cid = uuidv4().replace(/-/g, '');
				const key = constant.ATTACHMENT_PREFIX + await fileUtils.getBuffHash(buff) + fileUtils.getExtFileName(file.name);

				img.setAttribute('src', 'cid:' + cid);

				const attData = {};
				attData.key = key;
				attData.filename = file.name;
				attData.mimeType = file.type;
				attData.size = file.size;
				attData.buff = buff;
				attData.content = fileUtils.base64ToDataStr(src);
				attData.contentId = cid;

				imageDataList.push(attData);
			}

			//邮件正文站内图片转cid附件
			if (src && (src.startsWith(domainUtils.toOssDomain(r2Domain)) || src.startsWith('attachments/'))) {

				const cid = uuidv4().replace(/-/g, '')
				img.setAttribute('src', 'cid:' + cid);

				const attData = {};

				if (src.startsWith(domainUtils.toOssDomain(r2Domain))) {
					attData.key = src.replace(domainUtils.toOssDomain(r2Domain) + '/','');
				}

				if (src.startsWith('attachments/')) {
					attData.key = src;
				}

				attData.contentId = cid;
				attData.type = attConst.type.EMBED;
				imageDataList.push(attData);

			}

			const hasInlineWidth = img.hasAttribute('width');
			const style = img.getAttribute('style') || '';
			const hasStyleWidth = /(^|\s)width\s*:\s*[^;]+/.test(style);

			if (!hasInlineWidth && !hasStyleWidth) {
				const newStyle = (style ? style.trim().replace(/;$/, '') + '; ' : '') + 'max-width: 100%;';
				img.setAttribute('style', newStyle);
			}
		}

		//查询已有内嵌url图片信息
		const keys = [...new Set(imageDataList.filter(item => !item.content).map(item => item.key))];
		const dbImageList  = await this.selectOneByKeys(c, keys);

		//设置给当前附件
		await Promise.all(imageDataList.map(async image => {
			if (image.content) {
				return;
			}

			const dbImage = dbImageList.find(dbImage => image.key === dbImage.key);
			if (!dbImage) {
				return;
			}

			image.size = dbImage.size;
			image.filename = dbImage.filename;
			image.mimeType = dbImage.mimeType;
			image.contentType = dbImage.mimeType;

			const obj = await r2Service.getObj(c, image.key);
			if (!obj) {
				return;
			}

			image.content = obj instanceof ArrayBuffer ? obj : await obj.arrayBuffer();
		}))

		imageDataList = imageDataList.filter(image => image.content);

		return { imageDataList, html: document.toString() };
	},

	async saveSendAtt(c, attList, userId, accountId, emailId, consumeUploads = true) {

		const attDataList = [];

		for (let att of attList) {
			if (att.sourceAttachmentId) {
				const source = await this.selectOwnedAttachment(c, att.sourceAttachmentId, userId);
				if (!source) throw new BizError('Forwarded attachment is unavailable');
				attDataList.push({
					userId,
					accountId,
					emailId,
					key: source.key,
					size: source.size,
					filename: source.filename,
					mimeType: source.mimeType,
					type: attConst.type.ATT
				});
				continue;
			}
			if (att.uploadToken) {
				const upload = await orm(c).select().from(attachmentUpload).where(and(
					eq(attachmentUpload.token, att.uploadToken), eq(attachmentUpload.userId, userId)
				)).get();
				if (!upload) throw new BizError('Attachment upload is invalid or has already been used');
				att.key = upload.key;
				const attData = {userId, accountId, emailId, key: upload.key, size: upload.size,
					filename: upload.filename, mimeType: upload.mimeType, type: attConst.type.ATT};
				attDataList.push(attData);
				continue;
			}
			att.buff = fileUtils.base64ToUint8Array(att.content);
			att.key = constant.ATTACHMENT_PREFIX + await fileUtils.getBuffHash(att.buff) + fileUtils.getExtFileName(att.filename);
			const attData = { userId, accountId, emailId };
			attData.key = att.key;
			attData.size = att.buff.length;
			attData.filename = att.filename;
			attData.mimeType = att.mimeType || att.contentType || att.type || 'application/octet-stream';
			attData.type = attConst.type.ATT;
			attDataList.push(attData);
		}

		await orm(c).insert(att).values(attDataList).run();

		for (let att of attList) {
			if (att.sourceAttachmentId) continue;
			if (att.uploadToken && consumeUploads) {
				await orm(c).update(attachmentUpload).set({consumed: 1}).where(and(
					eq(attachmentUpload.token, att.uploadToken), eq(attachmentUpload.userId, userId)
				)).run();
				continue;
			}
			await r2Service.putObj(c, att.key, att.buff, {
				contentType: att.mimeType || att.contentType || att.type || 'application/octet-stream',
				contentDisposition: `attachment;filename=${att.filename}`
			});
		}

	},

	async finalizeSendUploads(c, attList, userId) {
		for (const item of attList || []) {
			if (!item.uploadToken) continue;
			await orm(c).update(attachmentUpload).set({consumed: 1}).where(and(
				eq(attachmentUpload.token, item.uploadToken), eq(attachmentUpload.userId, userId)
			)).run();
		}
	},

	async saveArticleAtt(c, attDataList, userId, accountId, emailId) {

		for (let attData of attDataList) {
			attData.userId = userId;
			attData.emailId = emailId;
			attData.accountId = accountId;
			attData.type = attConst.type.EMBED;
			if (!attData.buff) {
				continue;
			}
			await r2Service.putObj(c, attData.key, attData.buff, {
				contentType: attData.mimeType,
				cacheControl: `max-age=259200`,
				contentDisposition: `inline;filename=${attData.filename}`
			});
			delete attData.buff;
		}

		await orm(c).insert(att).values(attDataList).run();

	},

	async removeByUserIds(c, userIds) {
		await this.removeAttByField(c, 'user_id', userIds);
	},

	async removeByEmailIds(c, emailIds) {
		await this.removeAttByField(c, 'email_id', emailIds);
	},

	selectByEmailIds(c, emailIds) {
		return orm(c).select().from(att).where(
			and(
				inArray(att.emailId, emailIds),
				eq(att.type, attConst.type.ATT)
			))
			.all();
	},

	async removeAttByField(c, fieldName, fieldValues) {

		const sqlList = [];

		fieldValues.forEach(value => {

			sqlList.push(

				c.env.db.prepare(
					`SELECT a.key, a.att_id
						FROM attachments a
							   JOIN (SELECT key
									 FROM attachments
									 GROUP BY key
									 HAVING COUNT (*) = 1) t
									ON a.key = t.key
						WHERE a.${fieldName} = ?;`
					).bind(value)
			)

			sqlList.push(c.env.db.prepare(`DELETE FROM attachments WHERE ${fieldName} = ?`).bind(value))

		});

		const attListResult = await c.env.db.batch(sqlList);

		const delKeyList = attListResult.flatMap(r => r.results ? r.results.map(row => row.key) : []);

		if (delKeyList.length > 0) {
			await this.batchDelete(c, delKeyList);
		}

	},

	async batchDelete(c, keys) {
		if (!keys.length) return;

		const BATCH_SIZE = 1000;

		for (let i = 0; i < keys.length; i += BATCH_SIZE) {
			const batch = keys.slice(i, i + BATCH_SIZE);
			await r2Service.delete(c, batch);
		}

	},

	async removeByAccountId(c, accountId) {
		await this.removeAttByField(c, "account_id", [accountId])
	},

	selectOneByKeys(c, keys) {
		if (!keys || keys.length === 0) {
			return []
		}
		return orm(c).select().from(att).where(inArray(att.key, keys)).orderBy(desc(att.attId)).groupBy(att.key).all();
	}
};

export default attService;
