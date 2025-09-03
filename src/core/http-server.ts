import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { Logger } from '../utils/logger';

export type HttpHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void> | void;

export interface HttpRoute {
	method: string;
	path: string;
	handler: HttpHandler;
}

export class HttpServer {
	protected server: Server;
	protected routes: HttpRoute[] = [];
	protected logger: Logger;

	constructor(component = 'HTTP Server') {
		this.logger = new Logger({ component });
		this.server = createServer(this.handleRequest.bind(this));
	}

	/**
	 * Register a route handler
	 */
	addRoute(method: string, path: string, handler: HttpHandler): void {
		this.routes.push({ method: method.toUpperCase(), path, handler });
		this.logger.debug(`Registered ${method.toUpperCase()} ${path}`);
	}

	/**
	 * Parse JSON from HTTP request body
	 */
	static async parseRequestBody(req: IncomingMessage): Promise<unknown> {
		return new Promise((resolve, reject) => {
			let body = '';

			req.on('data', (chunk) => {
				body += chunk.toString();
			});

			req.on('end', () => {
				try {
					const parsed = body ? JSON.parse(body) : {};
					resolve(parsed);
				} catch (error) {
					reject(error);
				}
			});

			req.on('error', reject);
		});
	}

	/**
	 * Send JSON response with CORS headers
	 */
	static sendJsonResponse(res: ServerResponse, statusCode: number, data: unknown): void {
		res.writeHead(statusCode, {
			'Content-Type': 'application/json',
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type',
		});
		res.end(JSON.stringify(data));
	}

	/**
	 * Send CORS preflight response
	 */
	static sendCorsResponse(res: ServerResponse): void {
		res.writeHead(200, {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type',
		});
		res.end();
	}

	/**
	 * Handle incoming HTTP requests
	 */
	protected async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
		const url = new URL(req.url || '/', 'http://localhost');

		// Handle CORS preflight
		if (req.method === 'OPTIONS') {
			HttpServer.sendCorsResponse(res);

			return;
		}

		// Find matching route
		const route = this.routes.find((r) => r.method === req.method?.toUpperCase() && r.path === url.pathname);

		if (!route) {
			HttpServer.sendJsonResponse(res, 404, {
				jsonrpc: '2.0',
				error: {
					code: -32601,
					message: 'Method not found',
				},
				id: null,
			});

			return;
		}

		try {
			await route.handler(req, res);
		} catch (error) {
			this.logger.error(`Request handling error: ${error instanceof Error ? error.message : JSON.stringify(error)}`);

			if (!res.headersSent) {
				HttpServer.sendJsonResponse(res, 500, {
					jsonrpc: '2.0',
					error: {
						code: -32603,
						message: 'Internal server error',
					},
					id: null,
				});
			}
		}
	}

	/**
	 * Start the HTTP server
	 */
	async listen(port = 0, hostname = '127.0.0.1'): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			this.server.listen(port, hostname, () => {
				const address = this.server.address();

				if (address && typeof address === 'object') {
					this.logger.info(`HTTP server listening on ${hostname}:${address.port}`);
				}

				resolve();
			});

			this.server.on('error', reject);
		});
	}

	/**
	 * Get the server instance
	 */
	getServer(): Server {
		return this.server;
	}

	/**
	 * Close the server
	 */
	async close(): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			this.server.close((error) => {
				if (error) {
					reject(error);
				} else {
					this.logger.info('HTTP server closed');
					resolve();
				}
			});
		});
	}
}
