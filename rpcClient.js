'use strict';

require('harmony-reflect');
const amqp = require('amqplib');
const Hashids = require('hashids');
const VError = require('verror');

const rpcQueueOptions = {durable: false};
const replyToQueueOptions = {durable: false, exclusive: true};
const amqpConnectString = 'amqp://localhost';
let amqpConnection, amqpChannel;
let localClients = {};
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

function connect() {
    amqp.connect(amqpConnectString)
        .then(connection => {
            amqpConnection = connection;
            return connection.createChannel();
        })
        .then(channel => {
            amqpChannel = channel;
            channel.on('error', onChannelError);
            channel.on('close', onChannelClose);
            console.log('RabbitMQ Channel Opened');
            registerClientQueues();
        });
}

function registerClientQueues() {
    Object.keys(localClients).forEach(serviceName => {
        localClients[serviceName].registerQueues();
    });
}

connect();

// TODO: replace with better signal handling
process.on('SIGINT', function () {
    shutDown = true;
    let cleanupJobs = Object.keys(localClients).map(serviceName => localClients[serviceName].cleanupQueues());
    Promise.all(cleanupJobs).then(() => {
        amqpConnection.close();
    });
});

class RPCClient {

    constructor(serviceName) {
        const self = this;
        this.serviceName = serviceName;
        this.rpcQueueName = `rpc.queue.${serviceName}`;
        this.pendingProcedures = {};

        if (amqpChannel && !this.queuesRegistered) {
            this.registerQueues();
        }

        this.proxy = new Proxy({}, {
            get(targetObj, method) {
                return function () {
                    const args = Array.prototype.slice.call(arguments);
                    return new Promise(function (resolve, reject) {
                        let uid = self.generateUID();
                        self.pendingProcedures[uid] = {
                            uid,
                            method,
                            arguments: args,
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
        const self = this;
        amqpChannel
            .assertQueue(this.rpcQueueName, rpcQueueOptions)
            .then(() => amqpChannel.assertQueue(null, replyToQueueOptions))
            .then(replyToQueueData => {
                self.replyToQueueName = replyToQueueData.queue;
                amqpChannel
                    .consume(self.replyToQueueName, self.processReply.bind(self), {noAck: true})
                    .then(() => {
                        self.queuesRegistered = true;
                        self.processFunctionQueue();
                    });
            });
    }

    processReply(message) {
        if (!message) {
            return;
        }

        const uid = message.properties.correlationId;
        const def = this.pendingProcedures[uid];
        if (def) {
            let data;
            delete this.pendingProcedures[uid];

            try {
                data = JSON.parse(message.content.toString());
            } catch(err) {
                def.resolve(new VError(err, `RPC message parsing error on ${this.serviceName}!`));
                return;
            }

            console.log('Got response in', (Date.now() - def.sent.getTime()) / 1000, 'sec');

            if (data.err) {
                def.reject(data.err);
            }
            else {
                def.resolve(data.result);
            }
        }
    }

    cleanupQueues() {
        if (!this.queuesRegistered) {
            return undefined;
        }
        const self = this;
        return amqpChannel
            .deleteQueue(this.replyToQueueName)
            .then(() => self.queuesRegistered = false);
    }

    processFunctionQueue() {
        const self = this;
        Object.keys(this.pendingProcedures).forEach(uid => {
            let def = self.pendingProcedures[uid];
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
