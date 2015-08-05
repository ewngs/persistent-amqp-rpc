'use strict';

module.exports = function(options) {
    options = options || {};
    options.host = options.host || 'amqp://localhost';
    options.procedureCallTimeout = options.procedureCallTimeout || 5000;

    return {
        worker: require('./lib/rpc-worker').bind(undefined, options),
        client: require('./lib/rpc-client').bind(undefined, options)
    };
};
