/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface XHROptions {
	type?: string;
	url?: string;
	user?: string;
	password?: string;
	headers?: any;
	timeout?: number;
	data?: any;
	agent?: any;
	strictSSL?: boolean;
	responseType?: string;
	followRedirects?: number;
}

export interface XHRResponse {
	responseText: string;
	status: number;
	headers: any;
}

export interface XHRRequest {
	(options: XHROptions): Promise<XHRResponse>
}


export function configure(_proxyUrl: string, _strictSSL: boolean): void {
}

export async function xhr(options: XHROptions): Promise<XHRResponse> {
	const requestHeaders = new Headers(options.headers || {});
	if (options.user && options.password) {
		requestHeaders.set('Authorization', 'Basic ' + btoa(options.user + ":" + options.password));
	}
	const requestInit: RequestInit = {
		method: options.type,
		redirect: options.followRedirects > 0 ? 'follow' : 'manual',
		mode: 'cors',
		headers: requestHeaders
	};
	
	const requestInfo = new Request(options.url, requestInit);
	const response = await fetch(requestInfo);
	const resposeHeaders: any = {};
	for (let name in response.headers) {
		resposeHeaders[name] = response.headers.get(name);
	}

	return {
		responseText: await response.text(),
		status: response.status,
		headers: resposeHeaders
	}
}
