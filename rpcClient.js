'use strict';

require('harmony-reflect');
const amqp = require('amqplib');

const rpcQueueOptions = {durable: false};
const callbackQueueOptions = {durable: false};
let amqpChannel;
let localClients = {};

amqp.connect('amqp://localhost')
    .then(connection => connection.createChannel())
    .then(channel => {
        amqpChannel = channel;
        console.log('RabbitMQ Channel Opened');
        Object.keys(localClients).forEach(serviceName => {
            localClients[serviceName].registerQueues();
        });
    });

class RPCClient {

    constructor(serviceName) {
        this.serviceName = serviceName;
        this.queue = `rpc.queue.${serviceName}`;

        if (amqpChannel && !this.queuesRegistered) {
            this.registerQueues();
        }

        this.proxy = new Proxy({}, {
            get(targetObj, propKey) {
                return function () {
                    return new Promise(function (resolve) {
                        amqpChannel.consume(this.queue);
                        resolve();
                    });
                };
            }
        });
    }

    registerQueues() {
        let self = this;
        amqpChannel
            .assertQueue(this.queue, rpcQueueOptions)
            .then(() => amqpChannel.assertQueue(null, callbackQueueOptions))
            .then(callbackQueueData => {
                self.callbackQueueName = callbackQueueData.queue;
                self.queuesRegistered = true;
            });
    }

    cleanupQueues() {
        if (this.queuesRegistered) {
            let self = this;
            amqpChannel
                .deleteQueue(this.callbackQueueName)
                .then(() => self.queuesRegistered = false);
        }
    }

}

module.exports = function (serviceName) {
  if (!localClients[serviceName]) {
    localClients[serviceName] = new RPCClient(serviceName);
  }
  return localClients[serviceName].proxy;
};
