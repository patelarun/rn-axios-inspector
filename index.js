const { createAxiosInspector, attachAxiosInspector } = require('./client');

module.exports = {
  createAxiosInspector,
  attachAxiosInspector,
  startInspectorServer(...args) {
    return require('./server').startInspectorServer(...args);
  },
};
