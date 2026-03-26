# rn-axios-inspector

Lightweight axios inspector for React Native.

It attaches to one or more axios instances in the app, sends request logs to a small local server, and shows them in a browser dashboard.

## Install

```bash
npm install -D rn-axios-inspector
```

or:

```bash
yarn add -D rn-axios-inspector
```

## Start The Dashboard

```bash
npx rn-axios-inspector-server
```

Open:

```txt
http://localhost:5517
```

## Use In The App

Create one shared inspector and attach it to your axios clients.

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

Then attach it to your axios instance:

```js
const axios = require('axios');
const { attachAppAxiosInspector } = require('./axiosInspector');

const api = axios.create({
  baseURL: 'https://api.example.com',
});

attachAppAxiosInspector(api, 'primary-api');

module.exports = api;
```

If you use multiple axios instances:

```js
attachAppAxiosInspector(authApi, 'auth-api');
attachAppAxiosInspector(mainApi, 'main-api');
attachAppAxiosInspector(uploadApi, 'upload-api');
```

## Device URLs

Use `serverUrl` explicitly whenever possible.

- iOS simulator: `http://127.0.0.1:5517`
- Android emulator: `http://10.0.2.2:5517`
- Android USB device: run `adb reverse tcp:5517 tcp:5517` and use `http://127.0.0.1:5517`
- Real device on Wi-Fi: `http://<your-computer-lan-ip>:5517`

## Expo Go

This package works with Expo Go because it is pure JavaScript and only hooks axios.

### Expo Go On A Real Phone

Use your computer LAN IP, not `localhost`.

Typical flow:

1. Start the dashboard server on your computer
2. Start Expo with `EXPO_PUBLIC_AXIOS_INSPECTOR_URL` pointing at your computer LAN IP
3. Open the app in Expo Go
4. Trigger an axios request
5. Watch the request appear in the browser dashboard

Start the server:

```bash
npx rn-axios-inspector-server
```

Example:

```bash
EXPO_PUBLIC_AXIOS_INSPECTOR_URL=http://192.168.1.10:5517 expo start
```

If you use PowerShell:

```powershell
$env:EXPO_PUBLIC_AXIOS_INSPECTOR_URL="http://192.168.1.10:5517"
expo start
```

Before testing the app, confirm this works on the phone browser:

```txt
http://192.168.1.10:5517/api/health
```

Expected response:

```json
{"ok":true}
```

If that URL does not load on the phone, the app will not be able to send inspector logs either.

### Finding Your LAN IP

On macOS or Linux:

```bash
ifconfig
```

On Windows:

```powershell
ipconfig
```

Use the IPv4 address from your active network adapter.
Do not use Docker, WSL, Hyper-V, or other virtual adapter addresses.

### Important Notes For Expo Go

- `localhost` and `127.0.0.1` point to the phone itself, not your computer
- your phone and computer must be on the same Wi-Fi network
- if you change `EXPO_PUBLIC_AXIOS_INSPECTOR_URL`, fully restart Expo and reload the app
- if your firewall blocks the Node process on port `5517`, Expo Go will not reach the dashboard server
- if possible, test `http://<your-lan-ip>:5517/api/health` in the phone browser before debugging the app

## API

### `createAxiosInspector(options)`

Options:

- `appName`
- `serverUrl`
- `enabled`
- `timeoutMs`

Example:

```js
const inspector = createAxiosInspector({
  appName: 'My App',
  serverUrl: 'http://127.0.0.1:5517',
});
```

### `attachAxiosInspector(axiosInstance, inspector, options)`

Options:

- `clientName`

Returns a detach function.

## Notes

- This package is meant for development use
- It is pure JavaScript, so it works in Expo Go as long as the app can reach the server
- It captures axios traffic only, not arbitrary `fetch`, WebView, or native SDK traffic
- Sensitive headers like auth tokens and cookies are masked before being shown in the dashboard

## Troubleshooting

If the dashboard opens but no requests appear:

- make sure the app uses the axios instance you attached
- make sure the app can reach the server URL
- on a real phone, use your computer LAN IP
- on Android emulator, use `10.0.2.2` instead of `127.0.0.1`
- on Android USB, run `adb reverse tcp:5517 tcp:5517`
- reload the app after the server is already running
