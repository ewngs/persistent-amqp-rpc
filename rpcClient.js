'use strict';

require('harmony-reflect');
const amqp = require('amqplib');
const Hashids = require('hashids');

const rpcQueueOptions = {durable: false};
const replyToQueueOptions = {durable: false};
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
        let self = this;
        this.serviceName = serviceName;
        this.rpcQueueName = `rpc.queue.${serviceName}`;
        this.functionQueue = {};

        if (amqpChannel && !this.queuesRegistered) {
            this.registerQueues();
        }

        this.proxy = new Proxy({}, {
            get(targetObj, method) {
                return function () {
                    return new Promise(function (resolve, reject) {
                        let uid = self.generateUID();
                        self.functionQueue[uid] = {
                            uid,
                            method,
                            arguments: Array.prototype.slice.call(arguments),
                            sent: false,
                            resolve,
                            reject
                        };

                        if (self.queuesRegistered) {
                            self.processFunctionQueue();
                        }
                    });
                };
            }
        });
    }

    generateUID() {
        if (!this.hasher) {
            this.hasher = new Hashids(this.rpcQueueName);
            this.hashCounter = 0;
        }
        return this.hasher.encode(this.hashCounter++, Date.now(), Math.round(Math.random() * 10000));
    }

    registerQueues() {
        let self = this;
        amqpChannel
            .assertQueue(this.rpcQueueName, rpcQueueOptions)
            .then(() => amqpChannel.assertQueue(null, replyToQueueOptions))
            .then(replyToQueueData => {
                self.replyToQueueName = replyToQueueData.queue;
                self.queuesRegistered = true;
                self.processFunctionQueue();
            });
    }

    cleanupQueues() {
        if (this.queuesRegistered) {
            let self = this;
            amqpChannel
                .deleteQueue(this.replyToQueueName)
                .then(() => self.queuesRegistered = false);
        }
    }

    processFunctionQueue() {
        let self = this;
        Object.keys(this.functionQueue).forEach(uid => {
            let def = self.functionQueue[uid];
            if (!def.sent) {
                def.sent = new Date();
                amqpChannel.publish('', self.rpcQueueName, new Buffer(JSON.stringify({
                    method: def.method,
                    arguments: def.arguments
                })), {
                    correlationId: uid,
                    replyTo: self.replyToQueueName
                });
                console.log('sent > ', uid);
            }
        });
    }

}

module.exports = function (serviceName) {
  if (!localClients[serviceName]) {
    localClients[serviceName] = new RPCClient(serviceName);
  }
  return localClients[serviceName].proxy;
};
