import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	Icon,
	INodeProperties,
} from 'n8n-workflow';

export class PayloadFlowApi implements ICredentialType {
	name = 'payloadFlowApi';

	displayName = 'Payload Flow API';

	icon: Icon = {
		light: 'file:../nodes/PayloadFlow/payloadflow.svg',
		dark: 'file:../nodes/PayloadFlow/payloadflow.dark.svg',
	};

	documentationUrl = 'https://payloadhq.github.io/flow-rail.html';

	properties: INodeProperties[] = [
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://payload-rail.fly.dev',
			required: true,
			description:
				'The Payload Rail API base URL. Keep the default for the hosted Rail, or point it at your own self-hosted Rail.',
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Your Rail API key. Get a free one with: curl -X POST https://payload-rail.fly.dev/v1/access-keys -H "Content-Type: application/json" -d "{}"',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=<redacted>',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/health',
			method: 'GET',
		},
	};
}
