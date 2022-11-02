/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Url, parse as parseUrl, format } from 'url';
import * as https from 'https';
import * as http from 'http';
import * as zlib from 'zlib';
import * as nls from 'vscode-nls';

import * as createHttpsProxyAgent from 'https-proxy-agent';
import * as createHttpProxyAgent from 'http-proxy-agent';

import { XHRRequest, XHRConfigure, XHROptions, XHRResponse, HttpProxyAgent, HttpsProxyAgent } from '../../api';

if (process.env.VSCODE_NLS_CONFIG) {
    const VSCODE_NLS_CONFIG = process.env.VSCODE_NLS_CONFIG;
    nls.config(JSON.parse(VSCODE_NLS_CONFIG));
}
const localize = nls.loadMessageBundle();

let proxyUrl: string | undefined = undefined;
let strictSSL: boolean = true;

export const configure: XHRConfigure = (_proxyUrl: string | undefined, _strictSSL: boolean) => {
    proxyUrl = _proxyUrl;
    strictSSL = _strictSSL;
};

export const xhr: XHRRequest = (options: XHROptions): Promise<XHRResponse> => {
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

    return request(options).then(result => new Promise<XHRResponse>((c, e) => {
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
            if (isAbortError(err)) {
                response = err;
            } else {
                response = {
                    responseText: localize('error', 'Unable to access {0}. Error: {1}', options.url, err.message),
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
                readable.destroy(getAbortError());
            }
            options.token.onCancellationRequested(() => {
                readable.destroy(getAbortError());
            });
        }
    }), err => {
        let response: XHRResponse | Error;
        if (isAbortError(err)) {
            response = err;
        } else {
            let message: string;

            if (options.agent) {
                message = localize('error.cannot.connect.proxy', 'Unable to connect to {0} through a proxy. Error: {1}', options.url, err.message);
            } else {
                message = localize('error.cannot.connect', 'Unable to connect to {0}. Error: {1}', options.url, err.message);
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
                req.destroy(getAbortError());
            }
            options.token.onCancellationRequested(() => {
                req.destroy(getAbortError());
            });
        }
    });
}

export function getErrorStatusDescription(status: number): string {
    if (status < 400) {
        return void 0;
    }
    switch (status) {
        case 400: return localize('status.400', 'Bad request. The request cannot be fulfilled due to bad syntax.');
        case 401: return localize('status.401', 'Unauthorized. The server is refusing to respond.');
        case 403: return localize('status.403', 'Forbidden. The server is refusing to respond.');
        case 404: return localize('status.404', 'Not Found. The requested location could not be found.');
        case 405: return localize('status.405', 'Method not allowed. A request was made using a request method not supported by that location.');
        case 406: return localize('status.406', 'Not Acceptable. The server can only generate a response that is not accepted by the client.');
        case 407: return localize('status.407', 'Proxy Authentication Required. The client must first authenticate itself with the proxy.');
        case 408: return localize('status.408', 'Request Timeout. The server timed out waiting for the request.');
        case 409: return localize('status.409', 'Conflict. The request could not be completed because of a conflict in the request.');
        case 410: return localize('status.410', 'Gone. The requested page is no longer available.');
        case 411: return localize('status.411', 'Length Required. The "Content-Length" is not defined.');
        case 412: return localize('status.412', 'Precondition Failed. The precondition given in the request evaluated to false by the server.');
        case 413: return localize('status.413', 'Request Entity Too Large. The server will not accept the request, because the request entity is too large.');
        case 414: return localize('status.414', 'Request-URI Too Long. The server will not accept the request, because the URL is too long.');
        case 415: return localize('status.415', 'Unsupported Media Type. The server will not accept the request, because the media type is not supported.');
        case 500: return localize('status.500', 'Internal Server Error.');
        case 501: return localize('status.501', 'Not Implemented. The server either does not recognize the request method, or it lacks the ability to fulfill the request.');
        case 503: return localize('status.503', 'Service Unavailable. The server is currently unavailable (overloaded or down).');
        default: return localize('status.416', 'HTTP status code {0}', status);
    }
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

function getProxyAgent(rawRequestURL: string, options: ProxyOptions = {}): HttpProxyAgent | HttpsProxyAgent | undefined {
    const requestURL = parseUrl(rawRequestURL);
    const proxyURL = options.proxyUrl || getSystemProxyURI(requestURL);

    if (!proxyURL) {
        return null;
    }

    const proxyEndpoint = parseUrl(proxyURL);

    if (!/^https?:$/.test(proxyEndpoint.protocol)) {
        return null;
    }

    const opts = {
        host: proxyEndpoint.hostname,
        port: Number(proxyEndpoint.port),
        auth: proxyEndpoint.auth,
        rejectUnauthorized: (typeof options.strictSSL === 'boolean') ? options.strictSSL : true,
        protocol: proxyEndpoint.protocol
    };

    return requestURL.protocol === 'http:' ? createHttpProxyAgent(opts) : createHttpsProxyAgent(opts);
}

function getAbortError(): Error {
    const err: any = new Error('The user aborted a request');
    err.code = 20
    err.name = 'AbortError';
    return err;
}

function isAbortError(value: any): boolean {
    return value && value.code === 20 && value.name === 'AbortError';
}
