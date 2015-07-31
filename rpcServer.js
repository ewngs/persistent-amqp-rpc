'use strict';
require('harmony-reflect');
const amqp = require('amqplib');
const co = require('co');
const VError = require('verror');
const queueOptions = {durable: false};
const mqServerUrl = 'amqp://localhost';

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
        return amqp
            .connect(mqServerUrl)
            .then(conn => {
                process.once('SIGINT', () => {
                    conn.close();
                });
                return conn.createChannel();
            })
            .then(channel => {
                this.channel = channel;
                console.log('RabbitMQ Channel Opened');
                return this.channel.assertQueue(this.queue, queueOptions);
            })
            .then(() => {
                this.channel.prefetch(1);
                return this.channel.consume(this.queue, this.process.bind(this));
            })
            .then(() => {
                console.log(`${this.serviceName} service started. Awaiting RPC requests`);
            });

    }

    process(message) {
        let data;

        try {
            data = JSON.parse(message.content.toString());
        } catch(err) {
            this.reply(message, {err: new VError(err, `RPC message parsing error on "${this.serviceName}" service!`)});
        }

        const method = this.methods[data.method];

        if(method) {
            if(isGenerator(method)) {
                co.apply(co, [method].concat(data.arguments))
                    .then(result => {
                        this.reply(message, {result});
                    })
                    .catch(err => {
                        this.reply(message, {err: new VError(err, `RPC method execution error on "${data.method}" method of "${this.serviceName}" service!`)});
                    });
                } else {
                    try {
                        method.apply(method, data.arguments);
                    } catch (err) {
                        this.reply(message, {err: new VError(err, `RPC method execution error on "${data.method}" method of "${this.serviceName}" service!`)});
                    }
                }
        } else {
            this.reply(message, {err: new VError(`RPC method "${data.method}" of "${this.serviceName}" service not found!`)});
        }
    }

    reply(message, data) {
        let response;

        try {
            response = new Buffer(JSON.stringify(data));
        } catch (err) {
            response = new Buffer(JSON.stringify({err: new VError(err, `RPC method response creating error on "${this.serviceName}" service!`)}));
        }

        this.channel.sendToQueue(message.properties.replyTo, response, {correlationId: message.properties.correlationId});
        this.channel.ack(message);
    }
}


module.exports = function(serviceName, methods) {
    const server = new RPCServer(serviceName, methods);
    server.start()
        .catch(console.warn);
};
