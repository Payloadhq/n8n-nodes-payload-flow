/**
 * Pure request-building and error-mapping for the Payload Rail API.
 * No HTTP client here: the node executes calls through n8n's own
 * request helpers, so this module stays dependency-free and unit-testable.
 */

export interface RailRequest {
	method: 'GET' | 'POST';
	path: string;
	body?: unknown;
	qs?: Record<string, string>;
}

export interface LedgerFilters {
	eventId?: string;
	participantId?: string;
	type?: string;
}

export class RailError extends Error {
	readonly status: number;
	readonly code: string;

	constructor(status: number, code: string, message: string) {
		super(`[${status} ${code}] ${message}`);
		this.name = 'RailError';
		this.status = status;
		this.code = code;
	}
}

function graphPath(graphId: string, suffix = ''): string {
	return `/v1/graphs/${encodeURIComponent(graphId)}${suffix}`;
}

export type RailOperation =
	| 'create'
	| 'activate'
	| 'get'
	| 'processEvent'
	| 'simulateEvent'
	| 'readLedger';

export interface RailOperationParams {
	graphId?: string;
	spec?: Record<string, unknown>;
	event?: Record<string, unknown>;
	filters?: LedgerFilters;
}

export function buildRailRequest(operation: RailOperation, params: RailOperationParams): RailRequest {
	switch (operation) {
		case 'create':
			return { method: 'POST', path: '/v1/graphs', body: params.spec };
		case 'activate':
			return { method: 'POST', path: graphPath(params.graphId as string, '/activate') };
		case 'get':
			return { method: 'GET', path: graphPath(params.graphId as string) };
		case 'processEvent':
			return {
				method: 'POST',
				path: graphPath(params.graphId as string, '/events'),
				body: { event: params.event },
			};
		case 'simulateEvent':
			return {
				method: 'POST',
				path: graphPath(params.graphId as string, '/simulate'),
				body: { event: params.event },
			};
		case 'readLedger': {
			const qs: Record<string, string> = {};
			if (params.filters?.eventId) qs.eventId = params.filters.eventId;
			if (params.filters?.participantId) qs.participantId = params.filters.participantId;
			if (params.filters?.type) qs.type = params.filters.type;
			return { method: 'GET', path: graphPath(params.graphId as string, '/ledger'), qs };
		}
		default:
			throw new RailError(0, 'UNKNOWN_OPERATION', `Unknown operation: ${String(operation)}`);
	}
}

export function railErrorFromResponse(statusCode: number, body: unknown): RailError {
	const parsed = body as { error?: { code?: string; message?: string } } | undefined;
	const code = parsed?.error?.code ?? 'HTTP_ERROR';
	const message = parsed?.error?.message ?? `Request failed with status ${statusCode}`;
	return new RailError(statusCode, code, message);
}
