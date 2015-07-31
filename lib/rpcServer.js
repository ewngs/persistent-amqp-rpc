'use strict';
require('harmony-reflect');
const amqp = require('amqplib');
const co = require('co');
const VError = require('verror');
const rpcQueueOptions = {durable: false};
const amqpConnectString = 'amqp://localhost';
let shutDown = false;

function onChannelError(err) {
    console.error('RabbitMQ Channel Error:', err);
}

function onChannelClose() {
    console.log('RabbitMQ Channel Closed');
    if (!shutDown) {
        console.log('...restart');
    }
}

function isGenerator(fn) {
    return fn.constructor.name === 'GeneratorFunction';
}

class RPCServer {
    constructor(serviceName, methods) {
        this.serviceName = serviceName;
        this.methods = methods;
        this.queue = `rpc.queue.${serviceName}`;
    }

    start() {
        const self = this;

        return amqp
            .connect(amqpConnectString)
            .then(conn => {
                process.once('SIGINT', () => {
                    shutDown = true;
                    conn.close();
                });
                return conn.createChannel();
            })
            .then(channel => {
                self.channel = channel;
                channel.on('error', onChannelError);
                channel.on('close', onChannelClose);
                console.log('RabbitMQ Channel Opened');
                return self.channel.assertQueue(self.queue, rpcQueueOptions);
            })
            .then(() => {
                self.channel.prefetch(1);
                return self.channel.consume(self.queue, self.process.bind(self));
            })
            .then(() => {
                console.log(`${self.serviceName} started. Awaiting RPC requests`);
            });
    }

    process(message) {
        const self = this;
        let data;

        try {
            data = JSON.parse(message.content.toString());
        } catch(err) {
            this.reply(message, {err: new VError(err, `RPC message parsing error on ${this.serviceName}!`)});
        }

        const method = this.methods[data.method];

        if(method) {
            if(isGenerator(method)) {
                co.apply(co, [method].concat(data.arguments))
                    .then(result => {
                        console.log(result);
                        self.reply(message, {result});
                    })
                    .catch(err => {
                        self.reply(message, {err: new VError(err, `RPC method execution error on "${data.method}" method of ${self.serviceName}!`)});
                    });
                } else {
                    try {
                        const result = method.apply(method, data.arguments);
                        self.reply(message, {result});
                    } catch (err) {
                        this.reply(message, {err: new VError(err, `RPC method execution error on "${data.method}" method of ${this.serviceName}!`)});
                    }
                }
        } else {
            this.reply(message, {err: new VError(`RPC method "${data.method}" of ${this.serviceName} not found!`)});
        }
    }

    reply(message, data) {
        let response;

        try {
            response = new Buffer(JSON.stringify(data));
        } catch (err) {
            response = new Buffer(JSON.stringify({err: new VError(err, `RPC method response creating error on ${this.serviceName}!`)}));
        }

        try {
            this.channel.sendToQueue(message.properties.replyTo, response, {correlationId: message.properties.correlationId});
            this.channel.ack(message);
        } catch (err) {
            console.error(err);
        }
    }
}


module.exports = function(serviceName, methods) {
    const server = new RPCServer(serviceName, methods);
    server.start()
        .catch(console.warn);
};
