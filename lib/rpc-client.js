'use strict';

require('harmony-reflect');
const persistentAMQP = require('persistent-amqp');
const bson = require('bson');
const BSON = bson.BSONPure.BSON;
const Hashids = require('hashids');
const VError = require('verror');

const rpcQueueOptions = {durable: false};
const replyToQueueOptions = {durable: false, exclusive: true};

let localClients = {};

class RPCClient {

    constructor(amqpConnection, serviceName) {
        const self = this;

        this.serviceName = serviceName;
        this.rpcQueueName = `rpc.queue.${serviceName}`;
        this.pendingProcedures = {};

        this.channel = amqpConnection.createChannel();
        this.channel.addOpenHook(this.registerQueues.bind(this));
        this.channel.addCloseHook(this.cleanupQueues.bind(this));
        this.channel.on('close', this.rejectPendingProcedures.bind(this));
        this.channel.on('open', this.processPendingProcedures.bind(this));

        this.proxy = new Proxy({}, {
            get(targetObj, name) {
                if (self.resolveTermination) {
                    throw new VError(`Cannot execute RPC procedure ${name} in termination phase of ${self.serviceName}`);
                }

                if (name === 'terminate') {
                    return self.terminate.bind(self);
                }

                return function () {
                    const args = Array.prototype.slice.call(arguments);

                    return new Promise(function (resolve, reject) {
                        let uid = self.generateUID();
                        self.pendingProcedures[uid] = {
                            uid,
                            name,
                            arguments: args,
                            sent: false,
                            resolve,
                            reject
                        };

                        self.processPendingProcedures();
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

        return this.channel.assertQueue(this.rpcQueueName, rpcQueueOptions)
            .then(() => self.channel.assertQueue(null, replyToQueueOptions))
            .then(replyToQueueData => {
                self.replyToQueueName = replyToQueueData.queue;
                self.channel.consume(self.replyToQueueName, self.processReply.bind(self), {noAck: true});
            });
    }

    cleanupQueues() {
        return this.channel.deleteQueue(this.replyToQueueName);
    }

    processPendingProcedures() {
        if (!this.channel.open) {
            return;
        }

        const self = this;

        Object.keys(this.pendingProcedures).forEach(uid => {
            let def = self.pendingProcedures[uid];

            if (def.sent) {
                return;
            }

            let procedureMessage;

            try {
                procedureMessage = new BSON().serialize({
                    name: def.name,
                    arguments: def.arguments
                }, false, true);
            } catch (err) {
                def.reject(new VError(err, 'RPC message preparation error.'));
            }

            try {
                self.channel.publish('', self.rpcQueueName, procedureMessage, {
                    correlationId: uid,
                    replyTo: self.replyToQueueName
                });
                def.sent = new Date();
            } catch (err) {
                def.reject(new VError(err, 'RPC message cannot be delivered.'));
            }
        });
    }

    rejectPendingProcedures() {
        const self = this;

        Object.keys(this.pendingProcedures).forEach(uid => {
            let def = self.pendingProcedures[uid];

            if (def.sent) {
                def.reject(new VError('Connection closed cannot fulfill request.'));

                delete self.pendingProcedures[uid];
            }
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
                data = new BSON().deserialize(message.content);
            } catch(err) {
                def.reject(new VError(err, `RPC message parsing error on ${this.serviceName}!`));
                if (this.resolveTermination && Object.keys(this.pendingProcedures).length === 0) {
                    this.channel.close();
                    this.resolveTermination();
                }
                return;
            }

            console.log('Got response in', (Date.now() - def.sent.getTime()) / 1000, 'sec');

            if (data.err) {
                def.reject(data.err);
            }
            else {
                def.resolve(data.result);
            }

            if (this.resolveTermination && Object.keys(this.pendingProcedures).length === 0) {
                this.channel.close();
                this.resolveTermination();
            }
        }
    }

    terminate() {
        const self = this;

        return new Promise(resolve => {
            if (!self.channel.open || Object.keys(self.pendingProcedures).length === 0) {
                self.channel.close();
                resolve();
                return;
            }

            self.resolveTermination = resolve;
        });
    }
 }

module.exports = function (amqpConnectString, serviceName) {
    if (!localClients[serviceName]) {
        const amqpConnection = persistentAMQP.connection({host: amqpConnectString});

        localClients[serviceName] = new RPCClient(amqpConnection, serviceName);
    }
    return localClients[serviceName].proxy;
};
