'use strict';

const client = require('./lib/rpc-client');

module.exports = function(options) {
    options = options || {};
    options.host = options.host || 'amqp://localhost';
    options.procedureCallTimeout = options.procedureCallTimeout || 5000;

    return {
        worker: require('./lib/rpc-worker').bind(undefined, options),
        client: client.create.bind(undefined, options),
        shutdownClients: client.shutdownClients
    };
};
