# request-light

![Test Status Badge](https://github.com/microsoft/node-request-light/workflows/Tests/badge.svg)

A lightweight request library intended to be used by VSCode extensions.
- supports NodeJS and browser main entr points
- supports proxies: Use `configure` or `HTTP_PROXY` and `HTTPS_PROXY` env variables to set the proxy address.

```ts
import { xhr, XHRResponse, getErrorStatusDescription } from 'request-light';

const headers = { 'Accept-Encoding': 'gzip, deflate' };
return xhr({ url: url, followRedirects: 5, headers }).then(response => {
    return response.responseText;
}, (error: XHRResponse) => {
    throw new Error(error.responseText || getErrorStatusDescription(error.status) || error.toString());
});
```
