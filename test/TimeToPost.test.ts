import type { IExecuteFunctions, IDataObject } from 'n8n-workflow';
import { TimeToPost } from '../nodes/TimeToPost/TimeToPost.node';
import { TimeToPostApi } from '../credentials/TimeToPostApi.credentials';
import {
	buildCreateDraftBody,
	buildRequest,
	buildSchedulePostBody,
	filterPosts,
	flattenAccounts,
} from '../nodes/TimeToPost/GenericFunctions';

function makeContext(params: Record<string, unknown>, response: unknown, baseUrl = '') {
	const httpRequestWithAuthentication = jest.fn().mockResolvedValue(response);
	const ctx = {
		getInputData: () => [{ json: {} }],
		getCredentials: async () => ({ apiToken: 'tok', baseUrl }),
		getNodeParameter: (name: string, _i: number, fallback?: unknown) =>
			name in params ? params[name] : fallback,
		getNode: () => ({ name: 'TimeToPost' }),
		continueOnFail: () => false,
		helpers: {
			httpRequestWithAuthentication,
			returnJsonArray: (d: IDataObject | IDataObject[]) =>
				(Array.isArray(d) ? d : [d]).map((json) => ({ json })),
			constructExecutionMetaData: (data: unknown[]) => data,
		},
	} as unknown as IExecuteFunctions;
	return { ctx, httpRequestWithAuthentication };
}

describe('request building', () => {
	it('uses the default base URL and trims trailing slashes', () => {
		expect(buildRequest(undefined, 'GET', '/api/posts').url).toBe('https://api.timetopost.co/api/posts');
		expect(buildRequest('https://x.test//', 'GET', '/a').url).toBe('https://x.test/a');
	});

	it('builds a draft body with thread segments, link, media and accounts', () => {
		const body = buildCreateDraftBody({
			externalRef: 'ref1',
			platform: 'twitter',
			text: 'one\n---\ntwo',
			link: 'https://a.test',
			mediaUrl: 'https://a.test/i.png',
			accountIds: 'a1, a2',
			scheduleHint: 'optimal',
			brand: 'b',
		});
		expect(body).toEqual({
			externalRef: 'ref1',
			sourceKind: 'n8n',
			brand: 'b',
			variants: [
				{
					platform: 'twitter',
					segments: ['one', 'two'],
					link: 'https://a.test',
					media: [{ url: 'https://a.test/i.png' }],
					accountIds: ['a1', 'a2'],
					scheduleHint: 'optimal',
				},
			],
		});
	});

	it('omits empty optional draft fields', () => {
		const body = buildCreateDraftBody({ externalRef: 'r', platform: 'bluesky', text: 'hi' });
		expect(body.variants).toEqual([{ platform: 'bluesky', segments: ['hi'] }]);
		expect(body.brand).toBeUndefined();
	});

	it('builds a schedule body with an ISO date', () => {
		const body = buildSchedulePostBody({
			content: 'hello',
			platforms: 'twitter, bluesky',
			scheduledAt: '2030-01-01T10:00:00Z',
			mediaUrls: 'https://a.test/1.png',
		});
		expect(body).toEqual({
			content: 'hello',
			platforms: ['twitter', 'bluesky'],
			scheduledAt: '2030-01-01T10:00:00.000Z',
			mediaUrls: ['https://a.test/1.png'],
		});
	});

	it('filters posts by status and limit', () => {
		const posts = [{ status: 'draft' }, { status: 'scheduled' }, { status: 'draft' }];
		expect(filterPosts(posts, 'draft')).toHaveLength(2);
		expect(filterPosts(posts, 'all', 1)).toHaveLength(1);
	});

	it('flattens accounts and can drop disconnected ones', () => {
		const data = [
			{ provider: 'twitter', accounts: [{ id: '1', status: 'connected' }, { id: '2', status: 'expired' }] },
			{ provider: 'bluesky', accounts: [] },
		];
		expect(flattenAccounts(data, false)).toHaveLength(2);
		expect(flattenAccounts(data, true)).toEqual([{ provider: 'twitter', id: '1', status: 'connected' }]);
	});
});

describe('TimeToPost node execute', () => {
	it('Draft > Create posts to /api/drafts/batch', async () => {
		const { ctx, httpRequestWithAuthentication } = makeContext(
			{
				resource: 'draft',
				operation: 'create',
				platform: 'twitter',
				text: 'hi',
				externalRef: 'n8n-1',
				additionalFields: {},
			},
			{ success: true, draftIds: ['d1'] },
		);
		const out = await new TimeToPost().execute.call(ctx);
		const [credName, options] = httpRequestWithAuthentication.mock.calls[0];
		expect(credName).toBe('timeToPostApi');
		expect(options.method).toBe('POST');
		expect(options.url).toBe('https://api.timetopost.co/api/drafts/batch');
		expect(options.body.externalRef).toBe('n8n-1');
		expect(out[0][0].json).toEqual({ success: true, draftIds: ['d1'] });
	});

	it('Post > Schedule posts to /api/posts with scheduledAt', async () => {
		const { ctx, httpRequestWithAuthentication } = makeContext(
			{
				resource: 'post',
				operation: 'schedule',
				content: 'hi',
				platforms: 'twitter',
				scheduledAt: '2030-01-01T10:00:00Z',
				additionalFields: {},
			},
			{ success: true },
			'https://api.example.test',
		);
		await new TimeToPost().execute.call(ctx);
		const options = httpRequestWithAuthentication.mock.calls[0][1];
		expect(options.url).toBe('https://api.example.test/api/posts');
		expect(options.body.scheduledAt).toBe('2030-01-01T10:00:00.000Z');
	});

	it('Post > Schedule rejects an invalid date before any request', async () => {
		const { ctx, httpRequestWithAuthentication } = makeContext(
			{ resource: 'post', operation: 'schedule', content: 'x', platforms: 'twitter', scheduledAt: 'nope' },
			{},
		);
		await expect(new TimeToPost().execute.call(ctx)).rejects.toThrow('valid date');
		expect(httpRequestWithAuthentication).not.toHaveBeenCalled();
	});

	it('Post > Get Many lists and filters', async () => {
		const { ctx, httpRequestWithAuthentication } = makeContext(
			{ resource: 'post', operation: 'getAll', status: 'draft', limit: 10 },
			{ posts: [{ id: 'a', status: 'draft' }, { id: 'b', status: 'published' }] },
		);
		const out = await new TimeToPost().execute.call(ctx);
		expect(httpRequestWithAuthentication.mock.calls[0][1].url).toBe('https://api.timetopost.co/api/posts');
		expect(out[0].map((o) => o.json.id)).toEqual(['a']);
	});

	it('Account > Get Many flattens /api/integrations', async () => {
		const { ctx, httpRequestWithAuthentication } = makeContext(
			{ resource: 'account', operation: 'getAll', connectedOnly: true },
			{ integrations: [{ provider: 'twitter', accounts: [{ id: '1', status: 'connected' }] }] },
		);
		const out = await new TimeToPost().execute.call(ctx);
		expect(httpRequestWithAuthentication.mock.calls[0][1].url).toBe('https://api.timetopost.co/api/integrations');
		expect(out[0][0].json).toMatchObject({ provider: 'twitter', id: '1' });
	});
});

describe('credentials', () => {
	it('sends a Bearer token and tests against /api/auth/me', () => {
		const c = new TimeToPostApi();
		expect(JSON.stringify(c.authenticate)).toContain('Bearer {{$credentials.apiToken}}');
		expect(c.test.request.url).toBe('/api/auth/me');
		expect(c.properties.find((p) => p.name === 'baseUrl')?.default).toBe('https://api.timetopost.co');
	});
});
