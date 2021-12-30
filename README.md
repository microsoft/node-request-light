# request-light

![Test Status Badge](https://github.com/microsoft/node-request-light/workflows/Tests/badge.svg)

A lightweight request library intended to be used by VSCode extensions.
- NodeJS and browser main entry points
- proxy support: Use `configure` or `HTTP_PROXY` and `HTTPS_PROXY` env variables to configure the HTTP proxy addresses.

```ts
import { xhr, XHRResponse, getErrorStatusDescription } from 'request-light';

const headers = { 'Accept-Encoding': 'gzip, deflate' };
return xhr({ url: url, followRedirects: 5, headers }).then(response => {
    return response.responseText;
}, (error: XHRResponse) => {
    throw new Error(error.responseText || getErrorStatusDescription(error.status) || error.toString());
});
```
