import { describe, expect, it } from 'vitest';
import {
	buildRailRequest,
	railErrorFromResponse,
	RailError,
} from '../nodes/PayloadFlow/transport';

describe('buildRailRequest', () => {
	it('create POSTs the spec to /v1/graphs', () => {
		const spec = { id: 'g1', participants: [], rules: [] };
		expect(buildRailRequest('create', { spec })).toEqual({
			method: 'POST',
			path: '/v1/graphs',
			body: spec,
		});
	});

	it('activate POSTs to the activate endpoint', () => {
		expect(buildRailRequest('activate', { graphId: 'g1' })).toEqual({
			method: 'POST',
			path: '/v1/graphs/g1/activate',
		});
	});

	it('get fetches the graph', () => {
		expect(buildRailRequest('get', { graphId: 'g1' })).toEqual({
			method: 'GET',
			path: '/v1/graphs/g1',
		});
	});

	it('processEvent wraps the event in { event }', () => {
		const event = { eventId: 'e1', graphId: 'g1' };
		expect(buildRailRequest('processEvent', { graphId: 'g1', event })).toEqual({
			method: 'POST',
			path: '/v1/graphs/g1/events',
			body: { event },
		});
	});

	it('simulateEvent targets the simulate endpoint', () => {
		const event = { eventId: 'e1', graphId: 'g1' };
		const req = buildRailRequest('simulateEvent', { graphId: 'g1', event });
		expect(req.method).toBe('POST');
		expect(req.path).toBe('/v1/graphs/g1/simulate');
		expect(req.body).toEqual({ event });
	});

	it('readLedger passes filters as query params', () => {
		const req = buildRailRequest('readLedger', {
			graphId: 'g1',
			filters: { eventId: 'e1', type: 'FEE' },
		});
		expect(req).toEqual({
			method: 'GET',
			path: '/v1/graphs/g1/ledger',
			qs: { eventId: 'e1', type: 'FEE' },
		});
	});

	it('readLedger omits empty filters', () => {
		const req = buildRailRequest('readLedger', { graphId: 'g1', filters: {} });
		expect(req.qs).toEqual({});
	});

	it('URL-encodes graph ids', () => {
		expect(buildRailRequest('get', { graphId: 'g 1' }).path).toBe('/v1/graphs/g%201');
	});
});

describe('railErrorFromResponse', () => {
	it('maps the Rail error code and message', () => {
		const err = railErrorFromResponse(401, {
			error: { code: 'UNAUTHORIZED', message: 'bad key' },
		});
		expect(err).toBeInstanceOf(RailError);
		expect(err.status).toBe(401);
		expect(err.code).toBe('UNAUTHORIZED');
		expect(err.message).toContain('bad key');
	});

	it('falls back when the body has no error object', () => {
		const err = railErrorFromResponse(500, {});
		expect(err.code).toBe('HTTP_ERROR');
		expect(err.message).toContain('500');
	});
});
