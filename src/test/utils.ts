/**
 * Originally from https://github.com/delvedor/hpagent/tree/master/test
 */

import * as proxy from 'proxy';
import * as http from 'http';
import * as https from 'https';

const sslKey =
  `-----BEGIN RSA PRIVATE KEY-----
MIIEpQIBAAKCAQEAq19fMMyZT6fcDuhVU6KqnpnlyC7W36qCPtNp3Bc4285Fm+45
wTwFmkz21AQMTlcQh1yzMPHS1YocdKhuBkDENoS4rU8yGH9FM2/DUrNgkWbYbfya
qCbXUlSeLzvGYgWqmAl94ICkedZS/7f+em5CeI6hVIvXeN1cSJ94UzyidCdHvdNU
PK8w6OWNO6UyjSf1XyliFVLM+eba7FO7Tenn4eixATZtTRAqPuTz/x3BFVcSqdO1
suhb5Z/tXZbdyv9Sd88fwlJoFZOpy3SmBepgio5JOJZCQ7ukTr2YY8etGWbv7CGn
hZGuJNpwHdSX4JvHbzAdT4Pze96vgDwsoZUNIQIDAQABAoIBAG278ys/R8he1yVg
lgqo9ZH7P8zwWTz9ZMsv+vAomor9SUtwvuDCO2AzejYGpY6gZ4AV1tQ3dOaxukjk
9Rbh8AJs+AhZ1t0i2b/3B95z6BkS/vFmt+2GeYhJkMT0BLMNp9AU+9p+5VLy71C5
k6T3525k/l8x8HZ/YDFMk/LQt8GhvM6A3J3BNElKraiDVO6ZIWgQQ5wiefJkApo1
BsptHNTx83FbnkEbAahmOR8PfKcRdKY/mZDM2WrlfoU2uwVzPV0/KdYucpsfg2et
jb5bdJzcvZDuDF4GsPi1asCSC1c403R0XGuPFW9TiBuOPxbfhYK2o60yTggX6H2X
39WBc/ECgYEA3KNGgXEWzDSLpGciUisP+MzulOdQPawBTUHNykpQklEppnZbNWCX
07dv6uasnp0pFHG4WlhZJ4+IQBpZH6xAVy9y68PvN7IDYdgMiEiYPSyqQu0rvJGa
2ZR79SHDokZ8K5oofocC839RzleNRqWqxIwhHt29sxVs73kvml6OQm0CgYEAxtbA
zbQwf6DXtFwutSgfOLgdXQK72beBdyeTcpUGbkonl5xHSbtz0CFmRpKiPnXfgg4W
GXlTrqlYF/o048B7dU9+jCKY5DXx1Yzg/EFisEIClad3WXMhNOz1vBYVH6xU3Zq1
YuYr5dcqiCWDv89e6Y6WJOhwIDZi6RqikD2EJQUCgYEAnWSAJFCnIa8OOo4z5oe/
kg2m2GQWUphEKXeatQbEaUwquQvPTsmEJUzDMr+xPkkAiAwDpbdGijkSyh/Bmh2H
nGpFwbf5CzMaxI6ZihK3P1SAdNO5koAQBcytjJW0eCtt4rDK2E+5pDgcBGVia5Y8
to78BYfLDlhnaIF7mtR/CRUCgYEAvGCuzvOcUv4F/eirk5NMaQb9QqYZZD2XWVTU
O2T2b7yvX9J+M1t1cESESe4X6cbwlp1T0JSCdGIZhLXWL8Om80/52zfX07VLxP6w
FCy6G7SeEDxVNRh+6E5qzOO65YP17vDoUacxBZJgyBWKiUkkaW9dzd+sgsgj0yYZ
xz+QlyUCgYEAxdNWQnz0pR5Rt2dbIedPs7wmiZ7eAe0VjCdhMa52IyJpejdeB6Bn
Es+3lkHr0Xzty8XlQZcpbswhM8UZRgPVoBvvwQdQbv5yV+LdUu69pLM7InsdZy8u
opPY/+q9lRdJt4Pbep3pOWYeLP7k5l4vei2vOEMHRjHnoqM5etSb6RU=
-----END RSA PRIVATE KEY-----`;

const sslCert = `-----BEGIN CERTIFICATE-----
MIIDBzCCAe+gAwIBAgIJALbQMeb7k/WqMA0GCSqGSIb3DQEBBQUAMBoxGDAWBgNV
BAMMD3d3dy5mYXN0aWZ5Lm9yZzAeFw0xNzAyMDcyMDE5NDJaFw0yNzAyMDUyMDE5
NDJaMBoxGDAWBgNVBAMMD3d3dy5mYXN0aWZ5Lm9yZzCCASIwDQYJKoZIhvcNAQEB
BQADggEPADCCAQoCggEBAKtfXzDMmU+n3A7oVVOiqp6Z5cgu1t+qgj7TadwXONvO
RZvuOcE8BZpM9tQEDE5XEIdcszDx0tWKHHSobgZAxDaEuK1PMhh/RTNvw1KzYJFm
2G38mqgm11JUni87xmIFqpgJfeCApHnWUv+3/npuQniOoVSL13jdXEifeFM8onQn
R73TVDyvMOjljTulMo0n9V8pYhVSzPnm2uxTu03p5+HosQE2bU0QKj7k8/8dwRVX
EqnTtbLoW+Wf7V2W3cr/UnfPH8JSaBWTqct0pgXqYIqOSTiWQkO7pE69mGPHrRlm
7+whp4WRriTacB3Ul+Cbx28wHU+D83ver4A8LKGVDSECAwEAAaNQME4wHQYDVR0O
BBYEFHVzTr/tNziIUrR75UHXXA84yqmgMB8GA1UdIwQYMBaAFHVzTr/tNziIUrR7
5UHXXA84yqmgMAwGA1UdEwQFMAMBAf8wDQYJKoZIhvcNAQEFBQADggEBAKVSdGeF
vYcZOi0TG2WX7O3tSmu4G4nGxTldFiEVF89G0AU+HhNy9iwKXQLjDB7zMe/ZKbtJ
cQgc6s8eZWxBk/OoPD1WNFGstx2EO2kRkSUBKhwnOct7CIS5X+NPXyHx2Yi03JHX
unMA4WaHyo0dK4vAuali4OYdQqajNwL74avkRIxXFnZQeHzaq6tc6gX+ryB4dDSr
tYn46Lo14D5jH6PtZ8DlGK+jIzM4IE7TEp2iv0CgaTU4ryt/SHPnLxfwZUpl7gSO
EqkMAy3TlRMpv0oXM2Vh/CsyJzq2P/nY/O3bolsashSPWo9WsQTH4giYVA51ZVDK
lGksQD+oWpfa3X0=
-----END CERTIFICATE-----`;

export const ssl = {
  key: sslKey,
  cert: sslCert
};

export function createProxy(): Promise<http.Server> {
  return new Promise((resolve, _reject) => {
    const server = proxy.createProxy(http.createServer());
    server.listen(0, '127.0.0.1', () => {
      resolve(server)
    });
  });
}

export function createSecureProxy(): Promise<http.Server> {
  return new Promise((resolve, _reject) => {
    const server = proxy.createProxy(https.createServer(ssl));
    server.listen(0, '127.0.0.1', () => {
      resolve(server)
    });
  });
}

export function createServer(): Promise<http.Server> {
  return new Promise((resolve, _reject) => {
    const server = http.createServer();
    server.listen(0, '127.0.0.1', () => {
      resolve(server)
    });
  });
}

export function createSecureServer(): Promise<https.Server> {
  return new Promise((resolve, _reject) => {
    const server = https.createServer(ssl);
    server.listen(0, '127.0.0.1', () => {
      resolve(server)
    });
  });
}