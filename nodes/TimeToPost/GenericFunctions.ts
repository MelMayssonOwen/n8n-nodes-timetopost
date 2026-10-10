import type { IDataObject, IHttpRequestOptions } from 'n8n-workflow';

export const DEFAULT_BASE_URL = 'https://api.timetopost.co';

export type PostStatus = 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed' | 'partial';

function splitList(value: string | string[] | undefined): string[] {
	if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
	if (!value) return [];
	return value
		.split(',')
		.map((v) => v.trim())
		.filter(Boolean);
}

export function buildRequest(
	baseUrl: string | undefined,
	method: 'GET' | 'POST',
	path: string,
	body?: IDataObject,
): IHttpRequestOptions {
	const options: IHttpRequestOptions = {
		method,
		url: `${(baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '')}${path}`,
		json: true,
	};
	if (body) options.body = body;
	return options;
}

export interface DraftInput {
	externalRef: string;
	platform: string;
	text: string;
	link?: string;
	mediaUrl?: string;
	accountIds?: string;
	scheduleHint?: string;
	brand?: string;
}

/** POST /api/drafts/batch. Drafts are always created pending approval. */
export function buildCreateDraftBody(input: DraftInput): IDataObject {
	const segments = input.text
		.split(/\n---\n/)
		.map((s) => s.trim())
		.filter(Boolean);
	const variant: IDataObject = { platform: input.platform, segments };
	if (input.link) variant.link = input.link;
	if (input.mediaUrl) variant.media = [{ url: input.mediaUrl }];
	const accountIds = splitList(input.accountIds);
	if (accountIds.length) variant.accountIds = accountIds;
	if (input.scheduleHint) variant.scheduleHint = input.scheduleHint;
	const body: IDataObject = {
		externalRef: input.externalRef,
		sourceKind: 'n8n',
		variants: [variant],
	};
	if (input.brand) body.brand = input.brand;
	return body;
}

export interface SchedulePostInput {
	content: string;
	platforms: string;
	scheduledAt: string;
	accountIds?: string;
	mediaUrls?: string;
	brand?: string;
}

/** POST /api/posts with scheduledAt set. Needs a token with the publish capability. */
export function buildSchedulePostBody(input: SchedulePostInput): IDataObject {
	const body: IDataObject = {
		content: input.content,
		platforms: splitList(input.platforms),
		scheduledAt: new Date(input.scheduledAt).toISOString(),
	};
	const accountIds = splitList(input.accountIds);
	if (accountIds.length) body.accountIds = accountIds;
	const mediaUrls = splitList(input.mediaUrls);
	if (mediaUrls.length) body.mediaUrls = mediaUrls;
	if (input.brand) body.brand = input.brand;
	return body;
}

/** GET /api/posts returns every post for the org, newest first; status is filtered here. */
export function filterPosts(posts: IDataObject[], status: string, limit?: number): IDataObject[] {
	let out = posts;
	if (status && status !== 'all') {
		out = out.filter((p) => String(p.status).toLowerCase() === status);
	}
	if (limit && limit > 0) out = out.slice(0, limit);
	return out;
}

/** GET /api/integrations returns providers with nested accounts; flatten to one item per account. */
export function flattenAccounts(
	integrations: IDataObject[],
	connectedOnly: boolean,
): IDataObject[] {
	const out: IDataObject[] = [];
	for (const provider of integrations) {
		const accounts = (provider.accounts as IDataObject[] | undefined) ?? [];
		for (const account of accounts) {
			if (connectedOnly && account.status !== 'connected') continue;
			out.push({ provider: provider.provider, ...account });
		}
	}
	return out;
}
