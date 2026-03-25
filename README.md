# rn-axios-inspector

Local reusable axios inspector for React Native projects.

## What It Includes

- A React Native client hook for axios instances
- A local Node server that receives request logs
- A browser dashboard at `http://localhost:5517`

## App Usage

```js
const { createAxiosInspector, attachAxiosInspector } = require('./packages/rn-axios-inspector/react-native');
```

Create one inspector instance and attach it to one or more axios clients in development.

## Server Usage

```bash
node ./packages/rn-axios-inspector/bin/rn-axios-inspector-server.js
```

Optional environment variables:

- `AXIOS_INSPECTOR_PORT`
- `AXIOS_INSPECTOR_HOST`
- `AXIOS_INSPECTOR_MAX_LOGS`
