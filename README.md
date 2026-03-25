# rn-axios-inspector

`rn-axios-inspector` is a lightweight axios inspector for React Native apps.
It hooks one or more axios instances inside the app, sends structured request logs to a small local server, and shows them in a browser dashboard.

This package is meant for development use.
It is especially useful when you want browser-style visibility into app API calls without relying on a native proxy or a custom in-app debug screen.

## What It Does

- Hooks axios instances in React Native
- Captures request and response metadata
- Sends logs to a local dashboard server over HTTP
- Streams updates live to the browser
- Masks sensitive headers such as `Authorization`, tokens, cookies, and API keys
- Truncates large payloads to keep the dashboard responsive

## What It Does Not Do

- It does not inspect arbitrary `fetch` or raw `XMLHttpRequest` calls
- It does not inspect WebView traffic
- It does not inspect native SDK traffic outside axios
- It is not a low-level network proxy, so it does not provide DNS/TLS/socket timing

## How It Works

The package has 2 parts:

1. A React Native client entrypoint that attaches interceptors to axios
2. A Node server that receives events and serves a browser dashboard

Typical flow:

1. Start the dashboard server on your computer
2. Open the dashboard in your browser
3. Attach the inspector to your axios instance inside the app
4. Run the app and trigger API calls
5. Watch requests appear live in the browser

## Installation

If you are publishing this package:

```bash
npm install -D rn-axios-inspector
```

If you are consuming it directly from a local repository while iterating:

```bash
npm install -D ../rn-axios-inspector
```

or:

```bash
yarn add -D file:../rn-axios-inspector
```

## Quick Start

Start the dashboard server:

```bash
npx rn-axios-inspector-server
```

Then open:

```txt
http://localhost:5517
```

Attach the inspector to axios in your app:

```js
const axios = require('axios');
const {
  createAxiosInspector,
  attachAxiosInspector,
} = require('rn-axios-inspector/react-native');

const api = axios.create({
  baseURL: 'https://api.example.com',
});

const inspector = createAxiosInspector({
  appName: 'My App',
  serverUrl: 'http://127.0.0.1:5517',
});

attachAxiosInspector(api, inspector, {
  clientName: 'primary-api',
});
```

## React Native Usage

The recommended pattern is to create a single shared inspector and attach it to every axios instance you care about.

### Example With A Shared Helper

```js
// axiosInspector.js
const {
  createAxiosInspector,
  attachAxiosInspector,
} = require('rn-axios-inspector/react-native');

let sharedInspector;

function getInspector() {
  if (!__DEV__) {
    return null;
  }

  if (!sharedInspector) {
    sharedInspector = createAxiosInspector({
      appName: 'My App',
      serverUrl: process.env.EXPO_PUBLIC_AXIOS_INSPECTOR_URL,
    });
  }

  return sharedInspector;
}

function attachAppAxiosInspector(instance, clientName) {
  const inspector = getInspector();
  if (!inspector) {
    return;
  }

  attachAxiosInspector(instance, inspector, { clientName });
}

module.exports = {
  attachAppAxiosInspector,
};
```

Then wire it into your axios clients:

```js
const axios = require('axios');
const { attachAppAxiosInspector } = require('./axiosInspector');

const api = axios.create({
  baseURL: 'https://api.example.com',
});

attachAppAxiosInspector(api, 'primary-api');

module.exports = api;
```

### Multiple Axios Instances

You can attach the same inspector to multiple clients:

```js
attachAxiosInspector(authApi, inspector, { clientName: 'auth-api' });
attachAxiosInspector(mainApi, inspector, { clientName: 'main-api' });
attachAxiosInspector(uploadApi, inspector, { clientName: 'upload-api' });
```

Each request will appear in the dashboard with the corresponding `clientName`.

## Expo Go Vs Development Build

This package is pure JavaScript.
It does not depend on native modules by itself.

That means:

- if your app already runs in Expo Go, this inspector can run there too
- if your app already uses a development build for other reasons, this package works there as well

Unlike native proxy-based inspectors, this package does not require a custom development build just to inspect axios traffic.

## Server URL Resolution

The client uses the following order to determine the dashboard server URL:

1. `serverUrl` passed to `createAxiosInspector()`
2. Metro host inferred from the current bundle URL, using port `5517`
3. Android fallback: `http://10.0.2.2:5517`
4. Default fallback: `http://127.0.0.1:5517`

In practice, it is still best to pass `serverUrl` explicitly when you know the device setup.

## Device Setup Guide

### iOS Simulator

Use:

```txt
http://127.0.0.1:5517
```

Example:

```bash
EXPO_PUBLIC_AXIOS_INSPECTOR_URL=http://127.0.0.1:5517 expo start
```

### Android Emulator

Android emulator cannot use your computer's `127.0.0.1`.
Use:

```txt
http://10.0.2.2:5517
```

Example:

```bash
EXPO_PUBLIC_AXIOS_INSPECTOR_URL=http://10.0.2.2:5517 expo start
```

### Android Device Over USB

Use `adb reverse` and loopback:

```bash
adb reverse tcp:5517 tcp:5517
adb reverse tcp:8081 tcp:8081
```

Then use:

```txt
http://127.0.0.1:5517
```

### Real Device Over Wi-Fi

Use your computer's LAN IP:

```txt
http://192.168.1.10:5517
```

Example:

```bash
EXPO_PUBLIC_AXIOS_INSPECTOR_URL=http://192.168.1.10:5517 expo start --host lan
```

## API

## `createAxiosInspector(options)`

Creates a reusable inspector client.

### Options

- `appName`
  Label shown in the dashboard for requests from this app
- `serverUrl`
  Full base URL of the dashboard server, for example `http://127.0.0.1:5517`
- `enabled`
  Set to `false` to disable the inspector without changing app wiring
- `timeoutMs`
  Timeout used when sending events to the dashboard server

### Example

```js
const inspector = createAxiosInspector({
  appName: 'My App',
  serverUrl: 'http://127.0.0.1:5517',
  timeoutMs: 1500,
});
```

## `attachAxiosInspector(axiosInstance, inspector, options)`

Attaches request and response interceptors to an axios instance.

### Options

- `clientName`
  Name shown in the dashboard for that axios instance

### Return Value

Returns a detach function that ejects the installed interceptors.

### Example

```js
const detach = attachAxiosInspector(api, inspector, {
  clientName: 'primary-api',
});
```

If you no longer want to inspect that client:

```js
detach();
```

## Dashboard Server

The package ships with a small local Node server and browser dashboard.

Start it with:

```bash
npx rn-axios-inspector-server
```

### Server Environment Variables

- `AXIOS_INSPECTOR_PORT`
- `AXIOS_INSPECTOR_HOST`
- `AXIOS_INSPECTOR_MAX_LOGS`

Example:

```bash
AXIOS_INSPECTOR_PORT=6600 AXIOS_INSPECTOR_MAX_LOGS=500 npx rn-axios-inspector-server
```

### Browser Dashboard

The dashboard is served at:

```txt
http://localhost:5517
```

It currently provides:

- a live-updating request list
- search/filter by app, method, URL, status, and error text
- request detail view
- response detail view
- error detail view

## Captured Data

Each logged request includes:

- app name
- client name
- platform
- method
- full URL
- request headers
- request params
- request body
- timeout
- response status and status text
- response headers
- response body
- duration
- error message, code, and stack when applicable

## Header Redaction And Payload Safety

The inspector masks common sensitive keys, including:

- `authorization`
- `token`
- `cookie`
- `secret`
- `password`
- `apiKey`

Large strings are truncated before being sent to the dashboard.
Objects and arrays are also depth-limited so the browser UI stays usable during development.

## HTTP Endpoints

The server exposes:

- `GET /`
  Browser dashboard
- `GET /api/health`
  Health check
- `GET /api/logs`
  Current in-memory log buffer
- `GET /api/stream`
  Server-sent events stream for live browser updates
- `POST /api/events`
  Event ingest endpoint used by the React Native client

## Troubleshooting

### The Browser Dashboard Opens But No Requests Appear

- make sure the app is using the same server URL that the server is listening on
- confirm your app actually uses the axios instance you attached
- reload the app after the dashboard server is already running
- check the app console for the warning about being unable to reach the server

### Android Emulator Cannot Connect

Do not use `127.0.0.1` from the Android emulator.
Use:

```txt
http://10.0.2.2:5517
```

### Android USB Device Cannot Connect

Run:

```bash
adb reverse tcp:5517 tcp:5517
```

If Metro also needs USB routing:

```bash
adb reverse tcp:8081 tcp:8081
```

### Real Device On Wi-Fi Cannot Connect

- make sure the phone and computer are on the same Wi-Fi network
- use your computer's LAN IP, not `localhost`
- make sure your firewall allows the local Node process
- confirm the phone can reach the server URL in a browser when possible

### The Package Is Imported In React Native But Metro Fails On Node Modules

Use the React Native entrypoint:

```js
require('rn-axios-inspector/react-native');
```

Do not import the server entrypoint inside the app runtime.

## Notes

- This package is intended for development and debugging, not production telemetry
- It is best used behind `__DEV__`
- For app-wide coverage, attach it to every shared axios instance in your project
