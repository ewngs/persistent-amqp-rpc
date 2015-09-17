'use strict';

require('harmony-reflect');
const persistentAMQP = require('persistent-amqp');
const co = require('co');
const BSON = require("bson").BSONPure.BSON;
const VError = require('verror');
const merge = require('merge');
const rpcQueueOptions = {durable: false};

const debug = require('debug');
const logError = debug('rpc:error');
const logDebug = debug('rpc:debug');
logDebug.log = console.log.bind(console);

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
        amqpConnection.on('disconnect', () => {
            if (self.resolveShutdown) {
                self.resolveShutdown();
            }
        });

        logDebug('RPC-Worker', `Worker wrapper for ${self.serviceName} created`);
    }

    registerQueues() {
        const self = this;

        logDebug('RPC-Worker', `Registering queue "${this.queue}" with options:`, rpcQueueOptions);
        return this.channel.assertQueue(this.queue, rpcQueueOptions)
            .then(() => {
                self.queuesRegistered = true;
                self.channel.prefetch(5);
                logDebug('RPC-Worker', 'Consuming request messages');
                self.channel.consume(self.queue, self.processProcedure.bind(self));
            });
    }

    wrapError(error) {
        return merge({}, error, {
            message: error.message,
            stack: error.stack.toString()
        });
    }

    processProcedure(procedureMessage) {
        const self = this;
        let procedureObject;

        try {
            procedureObject = new BSON().deserialize(procedureMessage.content);
        } catch(err) {
            let msg = `RPC message parsing error on ${this.serviceName}!`;
            logError('RPC-Worker', msg);
            this.reply(procedureMessage, { error: self.wrapError(new VError(err, msg)) });
        }

        const procedure = this.procedures[procedureObject.name];

        if (procedure) {
            if (isGenerator(procedure)) {
                this.jobs++;
                co.apply(co, [procedure].concat(procedureObject.arguments))
                    .then(result => {
                        self.jobs--;
                        self.reply(procedureMessage, { result });
                    })
                    .catch(error => {
                        self.jobs--;
                        self.reply(procedureMessage, { error: self.wrapError(error) });
                    });
            } else {
                try {
                    const result = procedure.apply(procedure, procedureObject.arguments);
                    self.reply(procedureMessage, { result });
                } catch (error) {
                    logError('RPC-Client', error.toString());
                    self.reply(procedureMessage, { error: self.wrapError(error) });
                }
            }
        } else {
            let msg = `RPC procedure "${procedureObject.name}" of ${this.serviceName} was not found!`;
            logError('RPC-Worker', msg);
            this.reply(procedureMessage, { error: self.wrapError(new VError(msg)) });
        }
    }

    reply(procedureMessage, response) {
        let responseBuffer;

        try {
            responseBuffer = new BSON().serialize(response, false, true);
        } catch (err) {
            let msg = `RPC procedure response creation error on ${this.serviceName}!`;
            logError('RPC-Worker', msg);
            responseBuffer = new BSON().serialize({ error: this.wrapError(new VError(err, msg)) }, false, true);
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
            logError('RPC-Worker', err);
        }

        if (this.resolveShutdown && this.jobs === 0) {
            this.channel.close();
        }
    }

    shutdown() {
        const self = this;

        logDebug('RPC-Worker', 'Shutdown requested');
        return new Promise(resolve => {
            self.resolveShutdown = resolve;

            if (!self.channel.open || self.jobs === 0 && self.pendingReplies.length === 0) {
                self.channel.close();
                return;
            }

            self.channel.cancel(self.queue);
        });
    }
}


module.exports = function(options, serviceName, methods) {
    const amqpConnection = persistentAMQP.connection(options);
    const rpcWorker = new RPCWorker(amqpConnection, serviceName, methods);

    return {
        shutdown: rpcWorker.shutdown.bind(rpcWorker)
    };
};
