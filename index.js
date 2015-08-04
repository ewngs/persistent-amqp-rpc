'use strict';

module.exports = function(amqpConnectString) {
    return {
        worker: require('./lib/rpc-worker').bind(undefined, amqpConnectString),
        client: require('./lib/rpc-client').bind(undefined, amqpConnectString)
    };
};
