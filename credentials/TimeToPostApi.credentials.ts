import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class TimeToPostApi implements ICredentialType {
	name = 'timeToPostApi';

	displayName = 'TimeToPost API';

	icon: Icon = {
		light: 'file:../icons/timetopost.svg',
		dark: 'file:../icons/timetopost.dark.svg',
	};

	documentationUrl = 'https://timetopost.co/integrations/n8n';

	properties: INodeProperties[] = [
		{
			displayName: 'API Token',
			name: 'apiToken',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Token created in TimeToPost under Settings. A draft-only token can create drafts but cannot schedule posts.',
		},
		{
			displayName: 'API URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://api.timetopost.co',
			description: 'Only change this if you run your own TimeToPost backend',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiToken}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/api/auth/me',
			method: 'GET',
		},
	};
}
