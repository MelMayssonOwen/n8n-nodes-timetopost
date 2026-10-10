import {
	NodeApiError,
	NodeConnectionTypes,
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeType,
	type INodeTypeDescription,
	type JsonObject,
} from 'n8n-workflow';
import {
	buildCreateDraftBody,
	buildRequest,
	buildSchedulePostBody,
	filterPosts,
	flattenAccounts,
} from './GenericFunctions';

export class TimeToPost implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'TimeToPost',
		name: 'timeToPost',
		icon: {
			light: 'file:../../icons/timetopost.svg',
			dark: 'file:../../icons/timetopost.dark.svg',
		},
		group: ['output'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Create drafts, schedule posts and list accounts in TimeToPost',
		defaults: {
			name: 'TimeToPost',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'timeToPostApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Account', value: 'account' },
					{ name: 'Draft', value: 'draft' },
					{ name: 'Post', value: 'post' },
				],
				default: 'draft',
			},

			// Draft
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['draft'] } },
				options: [
					{
						name: 'Create',
						value: 'create',
						action: 'Create a draft',
						description: 'Create a draft that waits for human approval. It never publishes on its own.',
					},
				],
				default: 'create',
			},
			{
				displayName: 'Platform',
				name: 'platform',
				type: 'string',
				required: true,
				default: 'twitter',
				placeholder: 'twitter',
				description: 'Provider key such as twitter, instagram, bluesky or mastodon',
				displayOptions: { show: { resource: ['draft'], operation: ['create'] } },
			},
			{
				displayName: 'Text',
				name: 'text',
				type: 'string',
				typeOptions: { rows: 4 },
				required: true,
				default: '',
				description:
					'Post text. For an X thread, separate tweets with a line that contains only three dashes.',
				displayOptions: { show: { resource: ['draft'], operation: ['create'] } },
			},
			{
				displayName: 'External Reference',
				name: 'externalRef',
				type: 'string',
				required: true,
				default: "={{ 'n8n-' + $workflow.id + '-' + $execution.id + '-' + $itemIndex }}",
				description:
					'Idempotency key. Sending the same value again updates the pending draft instead of duplicating it.',
				displayOptions: { show: { resource: ['draft'], operation: ['create'] } },
			},
			{
				displayName: 'Additional Fields',
				name: 'additionalFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: { show: { resource: ['draft'], operation: ['create'] } },
				options: [
					{
						displayName: 'Account IDs',
						name: 'accountIds',
						type: 'string',
						default: '',
						description:
							'Comma-separated account IDs from Account > Get Many. Required if you have several accounts on the platform.',
					},
					{
						displayName: 'Brand Tag',
						name: 'brand',
						type: 'string',
						default: '',
						description: 'Tag used for per-brand engagement rollups',
					},
					{
						displayName: 'Image or Video URL',
						name: 'mediaUrl',
						type: 'string',
						default: '',
					},
					{
						displayName: 'Link',
						name: 'link',
						type: 'string',
						default: '',
						description: 'Appended to the last segment when the draft is approved',
					},
					{
						displayName: 'Schedule Hint',
						name: 'scheduleHint',
						type: 'string',
						default: '',
						description:
							'The word "optimal" or a future ISO date. Only a suggestion: a human still approves it.',
					},
				],
			},

			// Post
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['post'] } },
				options: [
					{
						name: 'Get Many',
						value: 'getAll',
						action: 'Get many posts',
						description: 'List posts in your active workspace',
					},
					{
						name: 'Schedule',
						value: 'schedule',
						action: 'Schedule a post',
						description: 'Queue a post for a future time. Needs a token with publish permission.',
					},
				],
				default: 'getAll',
			},
			{
				displayName: 'Content',
				name: 'content',
				type: 'string',
				typeOptions: { rows: 4 },
				required: true,
				default: '',
				displayOptions: { show: { resource: ['post'], operation: ['schedule'] } },
			},
			{
				displayName: 'Platforms',
				name: 'platforms',
				type: 'string',
				required: true,
				default: 'twitter',
				description: 'Comma-separated provider keys, for example twitter,bluesky',
				displayOptions: { show: { resource: ['post'], operation: ['schedule'] } },
			},
			{
				displayName: 'Scheduled At',
				name: 'scheduledAt',
				type: 'dateTime',
				required: true,
				default: '',
				description: 'Must be in the future',
				displayOptions: { show: { resource: ['post'], operation: ['schedule'] } },
			},
			{
				displayName: 'Additional Fields',
				name: 'additionalFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: { show: { resource: ['post'], operation: ['schedule'] } },
				options: [
					{
						displayName: 'Account IDs',
						name: 'accountIds',
						type: 'string',
						default: '',
						description: 'Comma-separated account IDs from Account > Get Many',
					},
					{
						displayName: 'Brand Tag',
						name: 'brand',
						type: 'string',
						default: '',
					},
					{
						displayName: 'Media URLs',
						name: 'mediaUrls',
						type: 'string',
						default: '',
						description: 'Comma-separated image or video URLs',
					},
				],
			},
			{
				displayName: 'Status',
				name: 'status',
				type: 'options',
				default: 'all',
				displayOptions: { show: { resource: ['post'], operation: ['getAll'] } },
				options: [
					{ name: 'All', value: 'all' },
					{ name: 'Draft', value: 'draft' },
					{ name: 'Failed', value: 'failed' },
					{ name: 'Partial', value: 'partial' },
					{ name: 'Published', value: 'published' },
					{ name: 'Publishing', value: 'publishing' },
					{ name: 'Scheduled', value: 'scheduled' },
				],
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				typeOptions: { minValue: 1 },
				default: 50,
				description: 'Max number of results to return',
				displayOptions: { show: { resource: ['post'], operation: ['getAll'] } },
			},

			// Account
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['account'] } },
				options: [
					{
						name: 'Get Many',
						value: 'getAll',
						action: 'Get many accounts',
						description: 'List connected accounts and their IDs',
					},
				],
				default: 'getAll',
			},
			{
				displayName: 'Connected Only',
				name: 'connectedOnly',
				type: 'boolean',
				default: true,
				description: 'Whether to skip accounts that need to be reconnected',
				displayOptions: { show: { resource: ['account'], operation: ['getAll'] } },
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const credentials = await this.getCredentials('timeToPostApi');
		const baseUrl = credentials.baseUrl as string | undefined;

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;
				let responseData: IDataObject | IDataObject[];

				const call = async (options: ReturnType<typeof buildRequest>) =>
					(await this.helpers.httpRequestWithAuthentication.call(
						this,
						'timeToPostApi',
						options,
					)) as IDataObject;

				if (resource === 'draft' && operation === 'create') {
					const extra = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
					const body = buildCreateDraftBody({
						externalRef: this.getNodeParameter('externalRef', i) as string,
						platform: this.getNodeParameter('platform', i) as string,
						text: this.getNodeParameter('text', i) as string,
						link: extra.link as string | undefined,
						mediaUrl: extra.mediaUrl as string | undefined,
						accountIds: extra.accountIds as string | undefined,
						scheduleHint: extra.scheduleHint as string | undefined,
						brand: extra.brand as string | undefined,
					});
					responseData = await call(buildRequest(baseUrl, 'POST', '/api/drafts/batch', body));
				} else if (resource === 'post' && operation === 'schedule') {
					const extra = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
					const scheduledAt = this.getNodeParameter('scheduledAt', i) as string;
					if (!scheduledAt || Number.isNaN(Date.parse(scheduledAt))) {
						throw new NodeOperationError(this.getNode(), 'Scheduled At must be a valid date', {
							itemIndex: i,
						});
					}
					const body = buildSchedulePostBody({
						content: this.getNodeParameter('content', i) as string,
						platforms: this.getNodeParameter('platforms', i) as string,
						scheduledAt,
						accountIds: extra.accountIds as string | undefined,
						mediaUrls: extra.mediaUrls as string | undefined,
						brand: extra.brand as string | undefined,
					});
					responseData = await call(buildRequest(baseUrl, 'POST', '/api/posts', body));
				} else if (resource === 'post' && operation === 'getAll') {
					const res = await call(buildRequest(baseUrl, 'GET', '/api/posts'));
					responseData = filterPosts(
						(res.posts as IDataObject[] | undefined) ?? [],
						this.getNodeParameter('status', i) as string,
						this.getNodeParameter('limit', i) as number,
					);
				} else if (resource === 'account' && operation === 'getAll') {
					const res = await call(buildRequest(baseUrl, 'GET', '/api/integrations'));
					responseData = flattenAccounts(
						(res.integrations as IDataObject[] | undefined) ?? [],
						this.getNodeParameter('connectedOnly', i) as boolean,
					);
				} else {
					throw new NodeOperationError(
						this.getNode(),
						`Unsupported operation ${resource}:${operation}`,
						{ itemIndex: i },
					);
				}

				const executionData = this.helpers.constructExecutionMetaData(
					this.helpers.returnJsonArray(responseData),
					{ itemData: { item: i } },
				);
				returnData.push(...executionData);
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				throw error instanceof NodeOperationError || error instanceof NodeApiError
					? error
					: new NodeApiError(this.getNode(), error as JsonObject, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
