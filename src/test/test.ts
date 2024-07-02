'use strict'

import test from 'ava';

import { xhr, configure, XHRResponse } from '../..';
import { createServer, createSecureServer, createProxy, createSecureProxy } from './utils';
import { AddressInfo } from 'net';
import { promises as fs } from 'fs';
import { join } from 'path';
import { IncomingMessage, Server, ServerResponse } from 'http';
import { CancellationTokenSource } from 'vscode-jsonrpc'

function getUrl(server: Server<any, any>, protocol: string = 'http') {
	const address = server.address() as AddressInfo;
	return `${protocol}://${address.address}:${address.port}`;
}

test('text content', async t => {
	const testContent = JSON.stringify({ hello: 1, world: true })

	const server = await createServer();
	try {
		server.on('request', (req, res) => res.end(testContent));

		configure(undefined, false);
		const response = await xhr({ url: getUrl(server) });

		t.is(response.responseText, testContent);
		t.is(response.body.toString(), testContent);
		t.is(response.status, 200);
	} finally {
		server.close();
	}
});

test('binary content', async t => {
	const binary = await fs.readFile(join(__dirname, '..', '..', 'src', 'test', 'test.png'));

	const server = await createServer();
	try {
		server.on('request', (req, res) => res.end(binary));

		configure(undefined, false);
		const response = await xhr({ url: getUrl(server) });

		t.deepEqual(response.body, binary);
		t.is(response.status, 200);
	} finally {
		server.close();
	}
});

test('304 reply with gzip', async t => {
	const server = await createServer();
	try {

		server.on('request', (req, res) => {
			res.writeHead(304, { 'Content-Encoding': 'gzip' });
			res.end();
		});

		configure(undefined, false);
		const respose = await xhr({ url: getUrl(server), headers: { 'If-None-Match': '0x8D97ED13C9F75E1', 'Accept-Encoding': 'gzip' } });
		t.fail('should throw is ' + respose.status);
	} catch (errorResponse: any) {
		t.is(errorResponse.responseText, '');
		t.is(errorResponse.status, 304);
	} finally {
		server.close();
	}
});

test('empty reply with gzip', async t => {
	const server = await createServer();
	try {
		server.on('request', (req, res) => {
			res.writeHead(200, { 'Content-Encoding': 'gzip' });
			res.end();
		});
		configure(undefined, false);
		const respose = await xhr({ url: getUrl(server), headers: { 'Accept-Encoding': 'gzip' } });

		t.is(respose.responseText, '');
		t.is(respose.status, 200);
	} finally {
		server.close();
	}
});


test('proxy http to http', async t => {
	let proxyUsed = false;
	const server = await createServer();
	const proxy = await createProxy();
	try {
		server.on('request', (req, res) => res.end('ok'));
		proxy.on('request', () => proxyUsed = true);

		configure(getUrl(proxy), false);
		const response = await xhr({ url: getUrl(server) });

		t.is(response.responseText, 'ok');
		t.is(response.status, 200);
		t.is(proxyUsed, true);

	} finally {
		server.close();
		proxy.close();
	}
});

test('proxy https to https', async t => {
	let proxyUsed = false;
	const server = await createSecureServer();

	const proxy = await createSecureProxy();
	try {
		server.on('request', (req, res) => {
			res.end('ok')
		});
		proxy.on('connect', () => {
			proxyUsed = true
		});

		configure(getUrl(proxy, 'https'), false);
		const response = await xhr({ url: getUrl(server, 'https') });

		t.is(response.responseText, 'ok');
		t.is(response.status, 200);
		t.is(proxyUsed, true);


	} finally {
		server.close();
		proxy.close();
	}
});

test('relative redirect', async t => {
	const server = await createServer();
	try {
		server.on('request', (req: IncomingMessage, res: ServerResponse) => {
			if (req.url.includes('/foo')) {
				res.setHeader('Location', '/bar');
				res.statusCode = 301;
				res.end();
			}
			if (req.url.includes('/bar')) {
				res.end('Bar');
			}
		});
		configure(undefined, false);
		const response = await xhr({ url: `${getUrl(server)}/foo` });

		t.deepEqual(response.body.toString(), 'Bar');
		t.is(response.status, 200);
	} finally {
		server.close();
	}

});

test('cancellation token', async t => {
	const server = await createServer();

	try {
		server.on('request', (req, res) => {
			res.writeHead(200, { 'Content-Encoding': 'gzip' });
			res.end();
		});

		const cancellationTokenSource = new CancellationTokenSource();
		cancellationTokenSource.cancel();
		try {
			configure(undefined, false);

			await xhr({ url: getUrl(server), token: cancellationTokenSource.token });
			t.fail('not aborted')
		} catch (e) {
			t.is(e.name, 'AbortError');
		}
	} finally {
		server.close();
	}
})
