'use strict'

import test from 'ava';

import { xhr, configure, XHRResponse } from '../..';
import { createServer, createSecureServer, createProxy, createSecureProxy } from './utils';
import { AddressInfo } from 'net';
import { promises as fs } from 'fs';
import { join } from 'path';
import { IncomingMessage, ServerResponse } from 'http';
import { CancellationTokenSource } from 'vscode-jsonrpc'

test('text content', async t => {
    const testContent = JSON.stringify({ hello: 1, world: true })

    const server = await createServer();
    server.on('request', (req, res) => res.end(testContent));

    const serverAddress = server.address() as AddressInfo;

    const response = await xhr({ url: `http://${serverAddress.address}:${serverAddress.port}` });

    t.is(response.responseText, testContent);
    t.is(response.body.toString(), testContent);
    t.is(response.status, 200);

    server.close();
});

test('binary content', async t => {
    const server = await createServer();

    const binary = await fs.readFile(join(__dirname, '..', '..', 'src', 'test', 'test.png'));

    server.on('request', (req, res) => res.end(binary));

    const serverAddress = server.address() as AddressInfo;

    const response = await xhr({ url: `http://${serverAddress.address}:${serverAddress.port}` });

    t.deepEqual(response.body, binary);
    t.is(response.status, 200);

    server.close();
});

test('304 reply with gzip', async t => {
    const server = await createServer();

    server.on('request', (req, res) => {
        res.writeHead(304, { 'Content-Encoding': 'gzip' });
        res.end();
    });

    const serverAddress = server.address() as AddressInfo;
    try {
        const respose = await xhr({ url: `http://${serverAddress.address}:${serverAddress.port}`, headers: { 'If-None-Match': '0x8D97ED13C9F75E1', 'Accept-Encoding': 'gzip' } });
        t.fail('should throw is ' + respose.status);
    } catch (errorResponse: any) {
        t.is(errorResponse.responseText, '');
        t.is(errorResponse.status, 304);
    }

    server.close();
});

test('empty reply with gzip', async t => {
    const server = await createServer();

    server.on('request', (req, res) => {
        res.writeHead(200, { 'Content-Encoding': 'gzip' });
        res.end();
    });

    const serverAddress = server.address() as AddressInfo;
    const respose = await xhr({ url: `http://${serverAddress.address}:${serverAddress.port}`, headers: { 'Accept-Encoding': 'gzip' } });
    t.is(respose.responseText, '');
    t.is(respose.status, 200);

    server.close();
});


test('proxy http to http', async t => {
    let proxyUsed = false;
    const server = await createServer();
    const proxy = await createProxy();
    server.on('request', (req, res) => res.end('ok'));
    proxy.on('request', () => proxyUsed = true);

    const proxyAddress = proxy.address() as AddressInfo;

    configure(`http://${proxyAddress.address}:${proxyAddress.port}`, false);

    const serverAddress = server.address() as AddressInfo;

    const response = await xhr({ url: `http://${serverAddress.address}:${serverAddress.port}` });

    t.is(response.responseText, 'ok');
    t.is(response.status, 200);
    t.is(proxyUsed, true);

    server.close();
    proxy.close();
});

test.only('proxy https to https', async t => {
    let proxyUsed = false;
    const server = await createSecureServer();
    
    const proxy = await createSecureProxy();
    console.log('proxy', proxy.address() as AddressInfo);
    try {
        server.on('request', (req, res) => {
            res.end('ok')
        });
        proxy.on('request', () => {
            proxyUsed = true
        });

        const proxyAddress = proxy.address() as AddressInfo;
        console.log('proxy', proxyAddress.port);

        configure(`https://${proxyAddress.address}:${proxyAddress.port}`, false);

        const serverAddress = server.address() as AddressInfo;
        console.log('server', server.address() as AddressInfo);

        const response = await xhr({ url: `https://${serverAddress.address}:${serverAddress.port}` });

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

    const serverAddress = server.address() as AddressInfo;

    const response = await xhr({ url: `http://${serverAddress.address}:${serverAddress.port}/foo` });

    t.deepEqual(response.body.toString(), 'Bar');
    t.is(response.status, 200);

    server.close();
});

test('cancellation token', async t => {
    const server = await createServer();

    server.on('request', (req, res) => {
        res.writeHead(200, { 'Content-Encoding': 'gzip' });
        res.end();
    });

    const serverAddress = server.address() as AddressInfo;
    const cancellationTokenSource = new CancellationTokenSource();
    cancellationTokenSource.cancel();
    try {
        await xhr({ url: `http://${serverAddress.address}:${serverAddress.port}`, token: cancellationTokenSource.token });
        t.fail('not aborted')
    } catch (e) {
        t.is(e.name, 'AbortError');
    }

    server.close();
})
