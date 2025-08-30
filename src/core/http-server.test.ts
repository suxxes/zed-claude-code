import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type HttpHandler, HttpServer } from './http-server';

// Mock the Logger
vi.mock('../utils/logger', () => ({
	Logger: vi.fn().mockImplementation(() => ({
		debug: vi.fn(),
		info: vi.fn(),
		error: vi.fn(),
	})),
}));

describe('HttpServer', () => {
	let server: HttpServer;

	beforeEach(() => {
		server = new HttpServer('Test Server');
	});

	afterEach(async () => {
		if (server.getServer().listening) {
			await server.close();
		}
	});

	describe('constructor', () => {
		it('should create a new HttpServer instance', () => {
			expect(server).toBeInstanceOf(HttpServer);
		});

		it('should initialize with empty routes', () => {
			expect(server.routes).toEqual([]);
		});

		it('should create server instance', () => {
			expect(server.getServer()).toBeDefined();
		});
	});

	describe('addRoute', () => {
		it('should register a route with uppercase method', () => {
			const handler: HttpHandler = vi.fn();

			server.addRoute('get', '/test', handler);

			expect(server.routes).toHaveLength(1);
			expect(server.routes[0]).toEqual({
				method: 'GET',
				path: '/test',
				handler,
			});
		});

		it('should register multiple routes', () => {
			const handler1: HttpHandler = vi.fn();
			const handler2: HttpHandler = vi.fn();

			server.addRoute('get', '/test1', handler1);
			server.addRoute('post', '/test2', handler2);

			expect(server.routes).toHaveLength(2);
			expect(server.routes[0].method).toBe('GET');
			expect(server.routes[1].method).toBe('POST');
		});
	});

	describe('parseRequestBody', () => {
		it('should parse valid JSON request body', async () => {
			const mockReq = {
				on: vi.fn((event, callback) => {
					if (event === 'data') {
						callback('{"test": "data"}');
					} else if (event === 'end') {
						callback();
					}
				}),
			} as unknown as IncomingMessage;

			const result = await HttpServer.parseRequestBody(mockReq);

			expect(result).toEqual({ test: 'data' });
		});

		it('should handle empty request body', async () => {
			const mockReq = {
				on: vi.fn((event, callback) => {
					if (event === 'data') {
						// No data chunks
					} else if (event === 'end') {
						callback();
					}
				}),
			} as unknown as IncomingMessage;

			const result = await HttpServer.parseRequestBody(mockReq);

			expect(result).toEqual({});
		});

		it('should reject on invalid JSON', async () => {
			const mockReq = {
				on: vi.fn((event, callback) => {
					if (event === 'data') {
						callback('invalid json');
					} else if (event === 'end') {
						callback();
					}
				}),
			} as unknown as IncomingMessage;

			await expect(HttpServer.parseRequestBody(mockReq)).rejects.toThrow();
		});

		it('should reject on request error', async () => {
			const mockReq = {
				on: vi.fn((event, callback) => {
					if (event === 'error') {
						callback(new Error('Request error'));
					}
				}),
			} as unknown as IncomingMessage;

			await expect(HttpServer.parseRequestBody(mockReq)).rejects.toThrow('Request error');
		});

		it('should handle multiple data chunks', async () => {
			let dataCallback: (chunk: string) => void;
			let endCallback: () => void;

			const mockReq = {
				on: vi.fn((event, callback) => {
					if (event === 'data') {
						dataCallback = callback;
					} else if (event === 'end') {
						endCallback = callback;
					}
				}),
			} as unknown as IncomingMessage;

			const resultPromise = HttpServer.parseRequestBody(mockReq);

			// Simulate multiple data chunks
			dataCallback('{"test"');
			dataCallback(': "data"}');
			endCallback();

			const result = await resultPromise;
			expect(result).toEqual({ test: 'data' });
		});
	});

	describe('sendJsonResponse', () => {
		it('should send JSON response with CORS headers', () => {
			const mockRes = {
				writeHead: vi.fn(),
				end: vi.fn(),
			} as unknown as ServerResponse;

			const data = { test: 'response' };
			HttpServer.sendJsonResponse(mockRes, 200, data);

			expect(mockRes.writeHead).toHaveBeenCalledWith(200, {
				'Content-Type': 'application/json',
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Methods': 'POST, OPTIONS',
				'Access-Control-Allow-Headers': 'Content-Type',
			});
			expect(mockRes.end).toHaveBeenCalledWith(JSON.stringify(data));
		});

		it('should handle null data', () => {
			const mockRes = {
				writeHead: vi.fn(),
				end: vi.fn(),
			} as unknown as ServerResponse;

			HttpServer.sendJsonResponse(mockRes, 404, null);

			expect(mockRes.end).toHaveBeenCalledWith('null');
		});
	});

	describe('sendCorsResponse', () => {
		it('should send CORS preflight response', () => {
			const mockRes = {
				writeHead: vi.fn(),
				end: vi.fn(),
			} as unknown as ServerResponse;

			HttpServer.sendCorsResponse(mockRes);

			expect(mockRes.writeHead).toHaveBeenCalledWith(200, {
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Methods': 'POST, OPTIONS',
				'Access-Control-Allow-Headers': 'Content-Type',
			});
			expect(mockRes.end).toHaveBeenCalledWith();
		});
	});

	describe('server lifecycle', () => {
		it('should start server on specified port', async () => {
			await server.listen(0, '127.0.0.1');

			expect(server.getServer().listening).toBe(true);

			const address = server.getServer().address();
			expect(address).toBeDefined();
			expect(typeof address === 'object' && address !== null).toBe(true);
		});

		it('should close server properly', async () => {
			await server.listen(0, '127.0.0.1');
			expect(server.getServer().listening).toBe(true);

			await server.close();
			expect(server.getServer().listening).toBe(false);
		});

		it('should reject when server fails to start', async () => {
			// Try to bind to an invalid port to force an error
			await expect(server.listen(-1)).rejects.toThrow();
		});
	});

	describe('request handling', () => {
		beforeEach(async () => {
			await server.listen(0, '127.0.0.1');
		});

		it('should handle OPTIONS requests (CORS preflight)', async () => {
			const mockReq = {
				method: 'OPTIONS',
				url: '/test',
			} as IncomingMessage;

			const mockRes = {
				writeHead: vi.fn(),
				end: vi.fn(),
			} as unknown as ServerResponse;

			await server.handleRequest(mockReq, mockRes);

			expect(mockRes.writeHead).toHaveBeenCalledWith(200, {
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Methods': 'POST, OPTIONS',
				'Access-Control-Allow-Headers': 'Content-Type',
			});
			expect(mockRes.end).toHaveBeenCalledWith();
		});

		it('should return 404 for unknown routes', async () => {
			const mockReq = {
				method: 'GET',
				url: '/unknown',
			} as IncomingMessage;

			const mockRes = {
				writeHead: vi.fn(),
				end: vi.fn(),
			} as unknown as ServerResponse;

			await server.handleRequest(mockReq, mockRes);

			expect(mockRes.writeHead).toHaveBeenCalledWith(404, expect.any(Object));
			expect(mockRes.end).toHaveBeenCalledWith(
				JSON.stringify({
					jsonrpc: '2.0',
					error: {
						code: -32601,
						message: 'Method not found',
					},
					id: null,
				}),
			);
		});

		it('should call registered route handler', async () => {
			const mockHandler = vi.fn().mockResolvedValue(undefined);
			server.addRoute('GET', '/test', mockHandler);

			const mockReq = {
				method: 'GET',
				url: '/test',
			} as IncomingMessage;

			const mockRes = {
				writeHead: vi.fn(),
				end: vi.fn(),
			} as unknown as ServerResponse;

			await server.handleRequest(mockReq, mockRes);

			expect(mockHandler).toHaveBeenCalledWith(mockReq, mockRes);
		});

		it('should handle route handler errors', async () => {
			const error = new Error('Handler error');
			const mockHandler = vi.fn().mockRejectedValue(error);
			server.addRoute('GET', '/test', mockHandler);

			const mockRes = {
				writeHead: vi.fn(),
				end: vi.fn(),
				headersSent: false,
			} as unknown as ServerResponse;

			const mockReq = {
				method: 'GET',
				url: '/test',
			} as IncomingMessage;

			await server.handleRequest(mockReq, mockRes);

			expect(mockRes.writeHead).toHaveBeenCalledWith(500, expect.any(Object));
			expect(mockRes.end).toHaveBeenCalledWith(
				JSON.stringify({
					jsonrpc: '2.0',
					error: {
						code: -32603,
						message: 'Internal server error',
					},
					id: null,
				}),
			);
		});

		it('should not send error response if headers already sent', async () => {
			const error = new Error('Handler error');
			const mockHandler = vi.fn().mockRejectedValue(error);
			server.addRoute('GET', '/test', mockHandler);

			const mockRes = {
				writeHead: vi.fn(),
				end: vi.fn(),
				headersSent: true,
			} as unknown as ServerResponse;

			const mockReq = {
				method: 'GET',
				url: '/test',
			} as IncomingMessage;

			await server.handleRequest(mockReq, mockRes);

			expect(mockRes.writeHead).not.toHaveBeenCalled();
			expect(mockRes.end).not.toHaveBeenCalled();
		});

		it('should handle requests with query parameters', async () => {
			const mockHandler = vi.fn().mockResolvedValue(undefined);
			server.addRoute('GET', '/test', mockHandler);

			const mockReq = {
				method: 'GET',
				url: '/test?param=value',
			} as IncomingMessage;

			const mockRes = {
				writeHead: vi.fn(),
				end: vi.fn(),
			} as unknown as ServerResponse;

			await server.handleRequest(mockReq, mockRes);

			expect(mockHandler).toHaveBeenCalledWith(mockReq, mockRes);
		});

		it('should handle requests without URL', async () => {
			const mockReq = {
				method: 'GET',
				url: undefined,
			} as IncomingMessage;

			const mockRes = {
				writeHead: vi.fn(),
				end: vi.fn(),
			} as unknown as ServerResponse;

			await server.handleRequest(mockReq, mockRes);

			expect(mockRes.writeHead).toHaveBeenCalledWith(404, expect.any(Object));
		});

		it('should match routes case-insensitively for method', async () => {
			const mockHandler = vi.fn().mockResolvedValue(undefined);
			server.addRoute('GET', '/test', mockHandler);

			const mockReq = {
				method: 'get', // lowercase
				url: '/test',
			} as IncomingMessage;

			const mockRes = {
				writeHead: vi.fn(),
				end: vi.fn(),
			} as unknown as ServerResponse;

			await server.handleRequest(mockReq, mockRes);

			// Should match because request method is converted to uppercase
			expect(mockHandler).toHaveBeenCalledWith(mockReq, mockRes);
		});

		it('should handle synchronous route handlers', async () => {
			const mockHandler = vi.fn(); // synchronous handler
			server.addRoute('GET', '/test', mockHandler);

			const mockReq = {
				method: 'GET',
				url: '/test',
			} as IncomingMessage;

			const mockRes = {
				writeHead: vi.fn(),
				end: vi.fn(),
			} as unknown as ServerResponse;

			await server.handleRequest(mockReq, mockRes);

			expect(mockHandler).toHaveBeenCalledWith(mockReq, mockRes);
		});
	});

	describe('getServer', () => {
		it('should return the server instance', () => {
			const serverInstance = server.getServer();
			expect(serverInstance).toBeDefined();
			expect(typeof serverInstance.listen).toBe('function');
			expect(typeof serverInstance.close).toBe('function');
		});
	});
});
