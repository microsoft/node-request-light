/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StreamXHROptions, StreamXHRResponse, XHRConfigure, XHROptions, XHRResponse } from '../../api';

export const configure: XHRConfigure = (_proxyUrl: string, _strictSSL: boolean) => { };

export function xhr(options: XHROptions): Promise<XHRResponse> 
export function xhr(options: StreamXHROptions): Promise<StreamXHRResponse> 
export async function xhr(options: XHROptions | StreamXHROptions): Promise<XHRResponse | StreamXHRResponse> {
	const requestHeaders = new Headers();
	if (options.headers) {
		for (const key in options.headers) {
			const value = options.headers[key];
			if (Array.isArray(value)) {
				value.forEach(v => requestHeaders.set(key, v))
			} else {
				requestHeaders.set(key, value);
			}
		}
	}
	if (options.user && options.password) {
		requestHeaders.set('Authorization', 'Basic ' + btoa(options.user + ":" + options.password));
	}
	const requestInit: RequestInit = {
		method: options.type,
		redirect: options.followRedirects > 0 ? 'follow' : 'manual',
		mode: 'cors',
		headers: requestHeaders
	};
	if (options.data) {
		requestInit.body = options.data;
	}
	if (options.token) {
		const controller = new AbortController();
		if (options.token.isCancellationRequested) {
			controller.abort();
		}
		options.token.onCancellationRequested(() => {
			controller.abort();
		});
		requestInit.signal = controller.signal;
	}

	const requestInfo = new Request(options.url, requestInit);
	const response = await fetch(requestInfo);
	const responseHeaders: any = {};
	response.headers.forEach((value, key) => {
		responseHeaders[key] = value;
	});

	if (isStreamXHROptions(options)) {
		return new class {
			get responseText() { return ''; };
			get body() { return response.body; };
			readonly status = response.status;
			readonly headers = responseHeaders;
		}
	} 

	const buffer = await response.arrayBuffer();

	return new class {
		get responseText() { return new TextDecoder().decode(buffer); };
		get body() { return new Uint8Array(buffer) };
		readonly status = response.status;
		readonly headers = responseHeaders;
	}
}

function isStreamXHROptions(options: XHROptions | StreamXHROptions): options is StreamXHROptions {
	return (options as StreamXHROptions).responseType === 'stream';
}

export function getErrorStatusDescription(status: number): string {
	return String(status);
}
