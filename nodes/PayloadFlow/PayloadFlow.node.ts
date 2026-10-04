import {
	NodeConnectionTypes,
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type IHttpRequestOptions,
	type IN8nHttpFullResponse,
	type INodeExecutionData,
	type INodeType,
	type INodeTypeDescription,
} from 'n8n-workflow';
import {
	buildRailRequest,
	railErrorFromResponse,
	type RailOperation,
} from './transport';

const EXAMPLE_GRAPH_SPEC = `{
  "id": "g_api_revshare",
  "projectId": "my_api",
  "ownerId": "operator",
  "participants": [
    {
      "id": "operator",
      "kind": "company",
      "roles": ["owner"],
      "payoutDestinations": [{ "rail": "stripe", "address": "acct_OPERATOR" }]
    },
    {
      "id": "contributor",
      "kind": "person",
      "roles": ["contributor"],
      "payoutDestinations": [{ "rail": "stripe", "address": "acct_CONTRIBUTOR" }]
    }
  ],
  "rules": [
    { "id": "r_payload_fee", "type": "payload_fee", "priority": 1, "params": { "licenseTier": "free" } },
    { "id": "r_contributor", "type": "percentage", "priority": 2, "params": { "rateBps": 2000, "subjectParticipantId": "contributor" } },
    { "id": "r_operator_remainder", "type": "remainder", "priority": 3, "params": { "subjectParticipantId": "operator" } }
  ]
}`;

const EXAMPLE_EVENT = `{
  "eventId": "evt_001",
  "graphId": "g_api_revshare",
  "type": "SALE_COMPLETED",
  "occurredAt": "2026-10-04T00:00:00.000Z",
  "amountMicros": 10000000,
  "currency": "USD",
  "rail": "stripe",
  "processingCostMicros": 330000,
  "raw": {}
}`;

const showForGraphOps = { resource: ['graph'] };
const showForIdOps = { resource: ['graph'], operation: ['activate', 'get', 'processEvent', 'simulateEvent', 'readLedger'] };

export class PayloadFlow implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Payload Flow',
		name: 'payloadFlow',
		icon: { light: 'file:payloadflow.svg', dark: 'file:payloadflow.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description:
			'Compute auditable revenue entitlements with Payload Flow. The Rail only proposes distributions; it never holds or moves money.',
		defaults: {
			name: 'Payload Flow',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'payloadFlowApi',
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
					{
						name: 'Revenue Graph',
						value: 'graph',
					},
				],
				default: 'graph',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: showForGraphOps },
				options: [
					{
						name: 'Activate',
						value: 'activate',
						action: 'Activate a revenue graph',
						description: 'Move a draft graph to active so it can evaluate events',
					},
					{
						name: 'Create',
						value: 'create',
						action: 'Create a revenue graph',
						description: 'Define a new Revenue Graph from a JSON spec (starts as draft)',
					},
					{
						name: 'Get',
						value: 'get',
						action: 'Get a revenue graph',
						description: 'Fetch a Revenue Graph by ID',
					},
					{
						name: 'Process Event',
						value: 'processEvent',
						action: 'Process an economic event',
						description: 'Evaluate one economic event against a graph and get entitlements back',
					},
					{
						name: 'Read Ledger',
						value: 'readLedger',
						action: 'Read the ledger',
						description: 'Read ledger entries for a graph, with hash-chain verification',
					},
					{
						name: 'Simulate Event',
						value: 'simulateEvent',
						action: 'Simulate an economic event',
						description: 'Dry-run an event with zero side effects',
					},
				],
				default: 'processEvent',
			},
			{
				displayName: 'Graph Spec (JSON)',
				name: 'graphSpec',
				type: 'json',
				default: EXAMPLE_GRAPH_SPEC,
				required: true,
				displayOptions: { show: { resource: ['graph'], operation: ['create'] } },
				description: 'The Revenue Graph spec: participants, payout destinations, and rules. See the Revenue Blueprints for ready-made specs: https://github.com/Payloadhq/payload-flow/tree/main/blueprints.',
			},
			{
				displayName: 'Graph ID',
				name: 'graphId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: { show: showForIdOps },
				description: 'The ID of the Revenue Graph',
			},
			{
				displayName: 'Event (JSON)',
				name: 'event',
				type: 'json',
				default: EXAMPLE_EVENT,
				required: true,
				displayOptions: {
					show: { resource: ['graph'], operation: ['processEvent', 'simulateEvent'] },
				},
				description:
					'The economic event to evaluate. Amounts are integer micro-units (USD 1.00 = 1000000). eventId must be unique per graph; replays are idempotent.',
			},
			{
				displayName: 'Ledger Filters',
				name: 'ledgerFilters',
				type: 'collection',
				placeholder: 'Add Filter',
				default: {},
				displayOptions: { show: { resource: ['graph'], operation: ['readLedger'] } },
				options: [
					{
						displayName: 'Event ID',
						name: 'eventId',
						type: 'string',
						default: '',
						description: 'Only entries for this event',
					},
					{
						displayName: 'Participant ID',
						name: 'participantId',
						type: 'string',
						default: '',
						description: 'Only entries for this participant',
					},
					{
						displayName: 'Entry Type',
						name: 'type',
						type: 'options',
						options: [
							{ name: 'Contribution', value: 'CONTRIBUTION' },
							{ name: 'Entitlement', value: 'ENTITLEMENT' },
							{ name: 'Fee', value: 'FEE' },
							{ name: 'Reversal', value: 'REVERSAL' },
							{ name: 'Skipped', value: 'SKIPPED' },
							{ name: 'Version', value: 'VERSION' },
						],
						default: 'ENTITLEMENT',
						description: 'Only entries of this type',
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const credentials = (await this.getCredentials('payloadFlowApi')) as unknown as {
			baseUrl?: string;
		};
		const baseUrl = credentials.baseUrl?.trim() || 'https://payload-rail.fly.dev';

		const parseJsonParam = (name: string, itemIndex: number): Record<string, unknown> => {
			const raw = this.getNodeParameter(name, itemIndex) as string;
			let parsed: unknown;
			let detail = 'must be a JSON object';
			try {
				parsed = JSON.parse(raw);
			} catch (e) {
				detail = (e as Error).message;
				parsed = undefined;
			}
			if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
				throw new NodeOperationError(
					this.getNode(),
					`Parameter "${name}" must be valid JSON: ${detail}`,
					{ itemIndex },
				);
			}
			return parsed as Record<string, unknown>;
		};

		for (let i = 0; i < items.length; i++) {
			try {
				const operation = this.getNodeParameter('operation', i) as RailOperation;
				let railRequest;
				if (operation === 'create') {
					railRequest = buildRailRequest(operation, { spec: parseJsonParam('graphSpec', i) });
				} else if (operation === 'processEvent' || operation === 'simulateEvent') {
					railRequest = buildRailRequest(operation, {
						graphId: this.getNodeParameter('graphId', i) as string,
						event: parseJsonParam('event', i),
					});
				} else if (operation === 'readLedger') {
					const filters = this.getNodeParameter('ledgerFilters', i, {}) as {
						eventId?: string;
						participantId?: string;
						type?: string;
					};
					railRequest = buildRailRequest(operation, {
						graphId: this.getNodeParameter('graphId', i) as string,
						filters: {
							eventId: filters.eventId || undefined,
							participantId: filters.participantId || undefined,
							type: filters.type || undefined,
						},
					});
				} else {
					railRequest = buildRailRequest(operation, {
						graphId: this.getNodeParameter('graphId', i) as string,
					});
				}

				const options: IHttpRequestOptions = {
					baseURL: baseUrl,
					url: railRequest.path,
					method: railRequest.method,
					headers: { Accept: 'application/json' },
					qs: railRequest.qs as IDataObject | undefined,
					body: railRequest.body as IDataObject | undefined,
					json: true,
					timeout: 30000,
					returnFullResponse: true,
					ignoreHttpStatusErrors: true,
				};
				const response = (await this.helpers.httpRequestWithAuthentication.call(
					this,
					'payloadFlowApi',
					options,
				)) as IN8nHttpFullResponse;

				if (response.statusCode >= 200 && response.statusCode < 300) {
					returnData.push({
						json: response.body as IDataObject,
						pairedItem: { item: i },
					});
				} else {
					const railError = railErrorFromResponse(response.statusCode, response.body);
					throw new NodeOperationError(
						this.getNode(),
						`Payload Rail error: ${railError.message}`,
						{ itemIndex: i },
					);
				}
			} catch (error) {
				let nodeError: NodeOperationError;
				if (error instanceof NodeOperationError) {
					nodeError = error;
				} else {
					nodeError = new NodeOperationError(this.getNode(), (error as Error).message, {
						itemIndex: i,
					});
				}
				if (this.continueOnFail()) {
					returnData.push({ json: { error: nodeError.message }, pairedItem: { item: i } });
					continue;
				}
				throw nodeError;
			}
		}

		return [returnData];
	}
}
