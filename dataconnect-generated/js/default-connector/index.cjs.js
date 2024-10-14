const { getDataConnect, validateArgs } = require('firebase/data-connect');

const connectorConfig = {
  connector: 'default',
  service: '전화기 버전',
  location: 'us-central1'
};
exports.connectorConfig = connectorConfig;

