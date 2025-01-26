'use strict'

import test from 'ava';

import { xhr, configure } from '../node/main';
import { xhr as browserXhr } from '../browser/main';
import { createServer, createSecureServer, createProxy, createSecureProxy } from './utils';
import { AddressInfo } from 'net';
import { promises as fs } from 'fs';
import { join } from 'path';
import { PassThrough, Readable } from 'stream';
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
	const binary = await fs.readFile(join(__dirname, '..', '..', '..', 'src', 'test', 'test.png'));

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
		const response = await xhr({ url: getUrl(server), headers: { 'If-None-Match': '0x8D97ED13C9F75E1', 'Accept-Encoding': 'gzip' } });
		t.fail('should throw is ' + response.status);
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
		const response = await xhr({ url: getUrl(server), headers: { 'Accept-Encoding': 'gzip' } });

		t.is(response.responseText, '');
		t.is(response.status, 200);
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

test('stream responseType', async t => {
	const testContent = JSON.stringify({ hello: 1, world: true });

	const server = await createServer();
	try {
		server.on('request', (req, res) => {
			const stream = new PassThrough();
			stream.end(testContent);
			stream.pipe(res);
		});

		configure(undefined, false);
		const response = await xhr({ url: getUrl(server), responseType: 'stream' });
		const readable = Readable.fromWeb(response.body)

		let data = '';
		readable.on('data', chunk => {
			data += chunk;
		});

		await new Promise(resolve => readable.on('end', resolve));

		t.is(data, testContent);
		t.is(response.status, 200);
	} finally {
		server.close();
	}
});

test('stream responseType (for await)', async t => {
	const testContent = 'Hello World'

	const server = await createServer();
	try {
		server.on('request', (req, res) => {
			Readable.from(testContent).pipe(res);
		});

		configure(undefined, false);
		const response = await xhr({ url: getUrl(server), responseType: 'stream' });
		const readable = Readable.fromWeb(response.body)

		let data = '';
		for await (const chunk of readable) {
			data += chunk;
		}

		t.is(data, testContent);
		t.is(response.status, 200);
	} finally {
		server.close();
	}
});

test('stream responseType with redirect', async t => {
	const testContent = JSON.stringify({ hello: 1, world: true });

	const server = await createServer();
	try {
		server.on('request', (req, res) => {
			if (req.url.includes('/foo')) {
				res.setHeader('Location', '/bar');
				res.statusCode = 301;
				res.end();
			}
			if (req.url.includes('/bar')) {
				const stream = new PassThrough();
				stream.end(testContent);
				stream.pipe(res);
			}
		});

		configure(undefined, false);
		const url = new URL(getUrl(server));
		url.pathname = '/foo';
		const response = await xhr({ url: url.toString(), responseType: 'stream' });
		const readable = Readable.fromWeb(response.body);

		let data = '';
		readable.on('data', chunk => {
			data += chunk;
		});

		await new Promise(resolve => readable.on('end', resolve));

		t.is(data, testContent);
		t.is(response.status, 200);
	} finally {
		server.close();
	}
});

test('stream responseType cancellation closes readable body', async t => {
	const testContent = JSON.stringify({ hello: 1, world: true });

	const server = await createServer();
	try {
		server.on('request', (req, res) => {
			const stream = new PassThrough();
			stream.end(testContent);
			stream.pipe(res);
		});

		const cancellationTokenSource = new CancellationTokenSource();
		configure(undefined, false);
		const response = await xhr({ url: getUrl(server), responseType: 'stream', token: cancellationTokenSource.token });

		const readable = Readable.fromWeb(response.body);

		cancellationTokenSource.cancel();

		readable.read();

		await t.throwsAsync(new Promise((_, e) => {
			readable.on('error', e);
		}), { name: 'AbortError' });
	} finally {
		server.close();
	}
});

test('stream responseType in browser', async t => {
	const testContent = JSON.stringify({ hello: 1, world: true });

	const server = await createServer();
	try {
		server.on('request', (req, res) => {
			const stream = new PassThrough();
			stream.end(testContent);
			stream.pipe(res);
		});

		configure(undefined, false);
		const response = await browserXhr({ url: getUrl(server), responseType: 'stream' });

		const reader = response.body.getReader();
		let data = '';
		let done: boolean, value: Uint8Array | undefined;
		while (!done) {
			({ done, value } = await reader.read());
			if (value) {
				data += new TextDecoder().decode(value);
			}
		}

		t.is(data, testContent);
		t.is(response.status, 200);
	} finally {
		server.close();
	}
});

test('stream responseType cancellation in browser', async t => {
	const testContent = JSON.stringify({ hello: 1, world: true });

	const server = await createServer();
	try {
		server.on('request', (req, res) => {
			const stream = new PassThrough();
			stream.end(testContent);
			stream.pipe(res);
		});

		const cancellationTokenSource = new CancellationTokenSource();
		configure(undefined, false);
		const response = await browserXhr({ url: getUrl(server), responseType: 'stream', token: cancellationTokenSource.token });

		const reader = response.body.getReader();
		let data = '';
		let errorCaught = false;
		const readStream = async () => {
			try {
				let done: boolean, value: Uint8Array | undefined;
				while (!done) {
					({ done, value } = await reader.read());
					if (value) {
						data += new TextDecoder().decode(value);
					}
				}
			} catch (err) {
				if (err.name === 'AbortError') {
					errorCaught = true;
				}
			}
		};

		const readPromise = readStream();
		cancellationTokenSource.cancel();

		await readPromise;

		t.true(errorCaught);
	} finally {
		server.close();
	}
});

test('stream responseType in browser with non-ASCII text', async t => {
	const testContent = '¡¢£¤¥¦§¨©ª«¬®¯°±²³´µ¶·¸¹º»¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛ';
	const buffer = Buffer.from(testContent, 'utf8');

	const server = await createServer();
	try {
		server.on('request', (req, res) => {
			const stream = new PassThrough();
			let index = 0;

			const writeByte = () => {
				if (index < buffer.length) {
					stream.write(buffer.subarray(index, index + 1));
					index++;
					setTimeout(writeByte, 1);
				} else {
					stream.end();
				}
			};

			writeByte();
			stream.pipe(res);
		});

		configure(undefined, false);
		const response = await browserXhr({ url: getUrl(server), responseType: 'stream' });

		const reader = response.body.getReader();
		let data = '';
		let done: boolean, value: Uint8Array | undefined;
		const decoder = new TextDecoder('utf-8');
		while (!done) {
			({ done, value } = await reader.read());
			if (value) {
				data += decoder.decode(value, { stream: true });
			}
		}

		t.is(data, testContent);
		t.is(response.status, 200);
	} finally {
		server.close();
	}
});
