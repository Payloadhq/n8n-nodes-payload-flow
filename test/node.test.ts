import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IExecuteFunctions, IN8nHttpFullResponse } from 'n8n-workflow';
import { PayloadFlow } from '../nodes/PayloadFlow/PayloadFlow.node';

const httpMock = vi.fn();

function fullResponse(statusCode: number, body: unknown): IN8nHttpFullResponse {
	return { statusCode, body: body as never, headers: {} };
}

function makeContext(
	params: Record<string, unknown>,
	opts: { continueOnFail?: boolean; baseUrl?: string } = {},
): IExecuteFunctions {
	return {
		getInputData: () => [{ json: {} }],
		getNodeParameter: (name: string, _itemIndex: number, fallback?: unknown) =>
			name in params ? params[name] : fallback,
		getCredentials: async () => ({ baseUrl: opts.baseUrl ?? 'https://rail.test', apiKey: 'k' }),
		getNode: () => ({
			name: 'Payload Flow',
			type: 'payloadFlow',
			typeVersion: 1,
			position: [0, 0] as [number, number],
			parameters: {},
		}),
		continueOnFail: () => opts.continueOnFail ?? false,
		helpers: {
			httpRequestWithAuthentication: httpMock,
		},
	} as unknown as IExecuteFunctions;
}

async function run(params: Record<string, unknown>, opts?: { continueOnFail?: boolean }) {
	const node = new PayloadFlow();
	return node.execute.call(makeContext(params, opts));
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe('parameter handling', () => {
	it('create parses the graphSpec JSON and POSTs it', async () => {
		const spec = { id: 'g1', projectId: 'p', ownerId: 'o', participants: [], rules: [] };
		httpMock.mockResolvedValue(fullResponse(201, { graph: spec }));
		const [rows] = await run({
			resource: 'graph',
			operation: 'create',
			graphSpec: JSON.stringify(spec),
		});
		expect(httpMock).toHaveBeenCalledWith(
			'payloadFlowApi',
			expect.objectContaining({
				baseURL: 'https://rail.test',
				url: '/v1/graphs',
				method: 'POST',
				body: spec,
			}),
		);
		expect(rows[0].json).toEqual({ graph: spec });
	});

	it('processEvent wraps the parsed event in { event }', async () => {
		const event = { eventId: 'e1', graphId: 'g1', amountMicros: 10000000 };
		httpMock.mockResolvedValue(fullResponse(200, { eventId: 'e1', entitlements: [] }));
		const [rows] = await run({
			resource: 'graph',
			operation: 'processEvent',
			graphId: 'g1',
			event: JSON.stringify(event),
		});
		expect(httpMock).toHaveBeenCalledWith(
			'payloadFlowApi',
			expect.objectContaining({
				url: '/v1/graphs/g1/events',
				method: 'POST',
				body: { event },
			}),
		);
		expect(rows[0].json).toEqual({ eventId: 'e1', entitlements: [] });
	});

	it('throws a clear error when graphSpec is not valid JSON', async () => {
		await expect(
			run({ resource: 'graph', operation: 'create', graphSpec: '{not json' }),
		).rejects.toThrow(/must be valid JSON/);
		expect(httpMock).not.toHaveBeenCalled();
	});

	it('throws a clear error when the event is a JSON array instead of an object', async () => {
		await expect(
			run({ resource: 'graph', operation: 'processEvent', graphId: 'g1', event: '[1,2]' }),
		).rejects.toThrow(/must be valid JSON/);
	});

	it('readLedger sends filters as query params', async () => {
		httpMock.mockResolvedValue(fullResponse(200, { entries: [], chainValid: true }));
		await run({
			resource: 'graph',
			operation: 'readLedger',
			graphId: 'g1',
			ledgerFilters: { eventId: 'e1', participantId: '', type: 'FEE' },
		});
		expect(httpMock).toHaveBeenCalledWith(
			'payloadFlowApi',
			expect.objectContaining({
				url: '/v1/graphs/g1/ledger',
				method: 'GET',
				qs: { eventId: 'e1', type: 'FEE' },
			}),
		);
	});
});

describe('error handling', () => {
	it('maps a Rail 404 to a node error naming the Rail code', async () => {
		httpMock.mockResolvedValue(
			fullResponse(404, { error: { code: 'GRAPH_NOT_FOUND', message: 'missing' } }),
		);
		await expect(
			run({ resource: 'graph', operation: 'get', graphId: 'nope' }),
		).rejects.toThrow(/GRAPH_NOT_FOUND/);
	});

	it('returns an error item when continue on fail is enabled', async () => {
		httpMock.mockResolvedValue(
			fullResponse(401, { error: { code: 'UNAUTHORIZED', message: 'bad key' } }),
		);
		const [rows] = await run(
			{ resource: 'graph', operation: 'processEvent', graphId: 'g1', event: '{}' },
			{ continueOnFail: true },
		);
		expect(rows[0].json).toMatchObject({ error: expect.stringContaining('UNAUTHORIZED') });
	});
});
