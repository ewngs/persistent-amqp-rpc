'use strict';

module.exports = function(amqpConnectString) {
    return {
        server: require('./lib/rpc-server').bind(undefined, amqpConnectString),
        client: require('./lib/rpc-client').bind(undefined, amqpConnectString)
    };
};
