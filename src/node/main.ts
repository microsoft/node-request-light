/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as http from 'http';
import * as https from 'https';
import { format, parse as parseUrl, Url } from 'url';
import * as l10n from '@vscode/l10n';
import * as stream from 'stream/web'
import * as zlib from 'zlib';

import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';

import { StreamXHROptions, StreamXHRResponse, XHRConfigure, XHROptions, XHRRequest, XHRResponse } from '../../api';

let proxyUrl: string | undefined = undefined;
let strictSSL: boolean = true;

export const configure: XHRConfigure = (_proxyUrl: string | undefined, _strictSSL: boolean) => {
	proxyUrl = _proxyUrl;
	strictSSL = _strictSSL;
};

export function xhr(options: XHROptions): Promise<XHRResponse> 
export function xhr(options: StreamXHROptions): Promise<StreamXHRResponse> 
export function xhr(options: XHROptions | StreamXHROptions): Promise<XHRResponse | StreamXHRResponse> {
	options = { ...options };

	if (typeof options.strictSSL !== 'boolean') {
		options.strictSSL = strictSSL;
	}
	if (!options.agent) {
		options.agent = getProxyAgent(options.url, { proxyUrl, strictSSL });
	}
	if (typeof options.followRedirects !== 'number') {
		options.followRedirects = 5;
	}

	return request(options).then(result => new Promise<XHRResponse | StreamXHRResponse>((c, e) => {
		const res = result.res;
		let readable: import('stream').Readable = res;
		let isCompleted = false;

		const encoding = res.headers && res.headers['content-encoding'];
		if (encoding && !hasNoBody(options.type, result.res.statusCode)) {
			const zlibOptions = {
				flush: zlib.constants.Z_SYNC_FLUSH,
				finishFlush: zlib.constants.Z_SYNC_FLUSH
			};
			if (encoding === 'gzip') {
				const gunzip = zlib.createGunzip(zlibOptions);
				res.pipe(gunzip);
				readable = gunzip;
			} else if (encoding === 'deflate') {
				const inflate = zlib.createInflate(zlibOptions);
				res.pipe(inflate);
				readable = inflate;
			}
		}

		if (isStreamXHROptions(options)) {
			const body = new ReadableStream({
				start(controller) {
					readable.on('data', chunk => controller.enqueue(chunk));
					readable.on('end', () => controller.close());
					readable.on('error', err => controller.error(err));
				},
				cancel() {
					readable.destroy(new AbortError());
				}
			});
			if (options.token) {
				if (options.token.isCancellationRequested) {
					readable.destroy(new AbortError());
				}
				options.token.onCancellationRequested(() => {
					readable.destroy(new AbortError());
				});
			}
			const response: StreamXHRResponse = {
				responseText: '',
				body,
				status: res.statusCode,
				headers: res.headers || {}
			};
			c(response);
			return;
		}

		const data: any = [];
		readable.on('data', c => data.push(c));
		readable.on('end', () => {
			if (isCompleted) {
				return;
			}
			isCompleted = true;
			if (options.followRedirects > 0 && (res.statusCode >= 300 && res.statusCode <= 303 || res.statusCode === 307)) {
				let location = res.headers['location'];
				if (location.startsWith('/')) {
					const endpoint = parseUrl(options.url);
					location = format({
						protocol: endpoint.protocol,
						hostname: endpoint.hostname,
						port: endpoint.port,
						pathname: location
					});
				}
				if (location) {
					const newOptions: XHROptions = {
						type: options.type, url: location, user: options.user, password: options.password, headers: options.headers,
						timeout: options.timeout, followRedirects: options.followRedirects - 1, data: options.data, token: options.token
					};
					xhr(newOptions).then(c, e);
					return;
				}
			}

			const buffer = Buffer.concat(data);

			const response: XHRResponse = {
				responseText: buffer.toString(),
				body: buffer,
				status: res.statusCode,
				headers: res.headers || {}
			};

			if ((res.statusCode >= 200 && res.statusCode < 300) || res.statusCode === 1223) {
				c(response);
			} else {
				e(response);
			}
		});
		readable.on('error', (err) => {
			let response: XHRResponse | Error;
			if (AbortError.is(err)) {
				response = err;
			} else {
				response = {
					responseText: l10n.t('Unable to access {0}. Error: {1}', options.url, err.message),
					body: Buffer.concat(data),
					status: 500,
					headers: {}
				};
			}
			isCompleted = true;
			e(response);
		});

		if (options.token) {
			if (options.token.isCancellationRequested) {
				readable.destroy(new AbortError());
			}
			options.token.onCancellationRequested(() => {
				readable.destroy(new AbortError());
			});
		}
	}), err => {
		let response: XHRResponse | Error;
		if (AbortError.is(err)) {
			response = err;
		} else {
			let message: string;

			if (options.agent) {
				message = l10n.t('Unable to connect to {0} through a proxy. Error: {1}', options.url, err.message);
			} else {
				message = l10n.t('Unable to connect to {0}. Error: {1}', options.url, err.message);
			}

			response = {
				responseText: message,
				body: Buffer.concat([]),
				status: 404,
				headers: {}
			};
		}

		return Promise.reject(response);
	});
}

function assign(destination: any, ...sources: any[]): any {
	sources.forEach(source => Object.keys(source).forEach((key) => destination[key] = source[key]));
	return destination;
}

function hasNoBody(method: string, code: number) {
	return method === 'HEAD' || /* Informational */ (code >= 100 && code < 200) || /* No Content */  code === 204 || /* Not Modified */ code === 304;
}

interface RequestResult {
	req: http.ClientRequest;
	res: http.IncomingMessage;
}

function request(options: XHROptions): Promise<RequestResult> {
	let req: http.ClientRequest;

	return new Promise<RequestResult>((c, e) => {
		const endpoint = parseUrl(options.url);

		const opts: https.RequestOptions = {
			hostname: endpoint.hostname,
			agent: options.agent ? options.agent : false,
			port: endpoint.port ? parseInt(endpoint.port) : (endpoint.protocol === 'https:' ? 443 : 80),
			path: endpoint.path,
			method: options.type || 'GET',
			headers: options.headers,
			rejectUnauthorized: (typeof options.strictSSL === 'boolean') ? options.strictSSL : true
		};

		if (options.user && options.password) {
			opts.auth = options.user + ':' + options.password;
		}

		const handler = (res: http.IncomingMessage) => {
			if (res.statusCode >= 300 && res.statusCode < 400 && options.followRedirects && options.followRedirects > 0 && res.headers['location']) {
				let location = res.headers['location'];
				if (location.startsWith('/')) {
					location = format({
						protocol: endpoint.protocol,
						hostname: endpoint.hostname,
						port: endpoint.port,
						pathname: location
					});
				}
				c(<any>request(assign({}, options, {
					url: location,
					followRedirects: options.followRedirects - 1
				})));
			} else {
				c({ req, res });
			}
		}
		if (endpoint.protocol === 'https:') {
			req = https.request(opts, handler);
		} else {
			req = http.request(opts, handler);
		}

		req.on('error', e);

		if (options.timeout) {
			req.setTimeout(options.timeout);
		}
		if (options.data) {
			req.write(options.data);
		}

		req.end();

		if (options.token) {
			if (options.token.isCancellationRequested) {
				req.destroy(new AbortError());
			}
			options.token.onCancellationRequested(() => {
				req.destroy(new AbortError());
			});
		}
	});
}

export function getErrorStatusDescription(status: number): string {
	if (status < 400) {
		return void 0;
	}
	switch (status) {
		case 400: return l10n.t('Bad request. The request cannot be fulfilled due to bad syntax.');
		case 401: return l10n.t('Unauthorized. The server is refusing to respond.');
		case 403: return l10n.t('Forbidden. The server is refusing to respond.');
		case 404: return l10n.t('Not Found. The requested location could not be found.');
		case 405: return l10n.t('Method not allowed. A request was made using a request method not supported by that location.');
		case 406: return l10n.t('Not Acceptable. The server can only generate a response that is not accepted by the client.');
		case 407: return l10n.t('Proxy Authentication Required. The client must first authenticate itself with the proxy.');
		case 408: return l10n.t('Request Timeout. The server timed out waiting for the request.');
		case 409: return l10n.t('Conflict. The request could not be completed because of a conflict in the request.');
		case 410: return l10n.t('Gone. The requested page is no longer available.');
		case 411: return l10n.t('Length Required. The "Content-Length" is not defined.');
		case 412: return l10n.t('Precondition Failed. The precondition given in the request evaluated to false by the server.');
		case 413: return l10n.t('Request Entity Too Large. The server will not accept the request, because the request entity is too large.');
		case 414: return l10n.t('Request-URI Too Long. The server will not accept the request, because the URL is too long.');
		case 415: return l10n.t('Unsupported Media Type. The server will not accept the request, because the media type is not supported.');
		case 500: return l10n.t('Internal Server Error.');
		case 501: return l10n.t('Not Implemented. The server either does not recognize the request method, or it lacks the ability to fulfill the request.');
		case 502: return l10n.t('Bad Gateway. The upstream server did not respond.');
		case 503: return l10n.t('Service Unavailable. The server is currently unavailable (overloaded or down).');
		default: return l10n.t('HTTP status code {0}', status);
	}
}

function isStreamXHROptions(options: XHROptions | StreamXHROptions): options is StreamXHROptions {
	return (options as StreamXHROptions).responseType === 'stream';
}

// proxy handling

function getSystemProxyURI(requestURL: Url): string {
	if (requestURL.protocol === 'http:') {
		return process.env.HTTP_PROXY || process.env.http_proxy || null;
	} else if (requestURL.protocol === 'https:') {
		return process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || null;
	}

	return null;
}

interface ProxyOptions {
	proxyUrl?: string;
	strictSSL?: boolean;
}

function getProxyAgent(rawRequestURL: string, options: ProxyOptions = {}): HttpProxyAgent<string> | HttpsProxyAgent<string> | undefined {
	const requestURL = parseUrl(rawRequestURL);
	const proxyURL = options.proxyUrl || getSystemProxyURI(requestURL);

	if (!proxyURL) {
		return null;
	}

	if (!/^https?:/.test(proxyURL)) {
		return null;
	}

	return requestURL.protocol === 'http:' ? new HttpProxyAgent(proxyURL) : new HttpsProxyAgent(proxyURL, { rejectUnauthorized: options.strictSSL ?? true });
}

class AbortError extends Error {
	constructor() {
		super('The user aborted a request');
		this.name = 'AbortError';

		// see https://github.com/microsoft/TypeScript/issues/13965
		Object.setPrototypeOf(this, AbortError.prototype);
	}

	static is(value: any): boolean {
		return value instanceof AbortError;
	}
}
