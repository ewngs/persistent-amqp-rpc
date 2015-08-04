'use strict';

require('harmony-reflect');
const persistentAMQP = require('persistent-amqp');
const co = require('co');
const BSON = require("bson").BSONPure.BSON;
const VError = require('verror');
const rpcQueueOptions = {durable: false};

function isGenerator(fn) {
    return fn.constructor.name === 'GeneratorFunction';
}

class RPCWorker {
    constructor(amqpConnection, serviceName, procedures) {
        const self = this;

        this.serviceName = serviceName;
        this.procedures = procedures;
        this.jobs = 0;
        this.queue = `rpc.queue.${serviceName}`;
        this.pendingReplies = [];

        this.channel = amqpConnection.createChannel();
        this.channel.addOpenHook(this.registerQueues.bind(this));
        this.channel.on('open', () => {
            self.processPendingReplies();
        });

        console.log(`${self.serviceName} started. Awaiting RPC requests`);
    }

    registerQueues() {
        const self = this;

        return this.channel.assertQueue(this.queue, rpcQueueOptions)
            .then(() => {
                self.queuesRegistered = true;
                self.channel.prefetch(5);
                self.channel.consume(self.queue, self.processProcedure.bind(self));
            });
    }

    processProcedure(procedureMessage) {
        const self = this;
        let procedureObject;

        try {
            procedureObject = new BSON().deserialize(procedureMessage.content);
        } catch(err) {
            this.reply(procedureMessage, {err: new VError(err, `RPC message parsing error on ${this.serviceName}!`)});
        }

        const procedure = this.procedures[procedureObject.name];


        if (procedure) {
            if (isGenerator(procedure)) {
                this.jobs++;
                co.apply(co, [procedure].concat(procedureObject.arguments))
                    .then(result => {
                        self.jobs--;
                        self.reply(procedureMessage, {result});
                    })
                    .catch(err => {
                        self.jobs--;
                        self.reply(procedureMessage, {err: {message: err.message}});
                    });
            } else {
                try {
                    const result = procedure.apply(procedure, procedureObject.arguments);
                    self.reply(procedureMessage, {result});
                } catch (err) {
                    this.reply(procedureMessage, {err: {message: err.message}});
                }
            }
        } else {
            this.reply(procedureMessage, {err: new VError(`RPC procedure "${procedureObject.name}" of ${this.serviceName} not found!`)});
        }
    }

    reply(procedureMessage, response) {
        let responseBuffer;

        try {
            responseBuffer = new Buffer(JSON.stringify(response));
        } catch (err) {
            responseBuffer = new Buffer(JSON.stringify({err: new VError(err, `RPC procedure response creation error on ${this.serviceName}!`)}));
        }

        this.pendingReplies.push({
            message: procedureMessage,
            response: responseBuffer
        });

        this.processPendingReplies();
    }

    processPendingReplies() {
        if (!this.channel.open) {
            return;
        }

        try {
            while(this.pendingReplies.length > 0) {
                const pendingReply = this.pendingReplies[0];
                this.channel.sendToQueue(pendingReply.message.properties.replyTo, pendingReply.response, {correlationId: pendingReply.message.properties.correlationId});
                this.channel.ack(pendingReply.message);
                this.pendingReplies.shift();
            }
        } catch (err) {
            console.error(err);
        }

        if (this.resolveTermination && this.jobs === 0) {
            this.channel.close();
            this.resolveTermination();
        }
    }

    terminate() {
        const self = this;

        return new Promise(resolve => {
            if (!self.channel.open || self.jobs === 0 && self.pendingReplies.length === 0) {
                self.channel.close();
                resolve();
                return;
            }

            self.channel.cancel(self.queue);
            self.resolveTermination = resolve;
        });
    }
}


module.exports = function(amqpConnectString, serviceName, methods) {
    const amqpConnection = persistentAMQP.connection({host: amqpConnectString});
    const rpcWorker = new RPCWorker(amqpConnection, serviceName, methods);

    return {
        terminate: rpcWorker.terminate.bind(rpcWorker)
    };
};
