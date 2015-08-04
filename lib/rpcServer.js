'use strict';

require('harmony-reflect');
const co = require('co');
const VError = require('verror');
const rpcQueueOptions = {durable: false};
const amqpConnectString = 'amqp://localhost';
const amqpConnection = require('persistent-amqp').connection({host: amqpConnectString});

process.on('SIGINT', () => {
    console.warn(' ~ Got SIGINT, terminating');
    amqpConnection.close();
});

function isGenerator(fn) {
    return fn.constructor.name === 'GeneratorFunction';
}

class RPCServer {
    constructor(serviceName, procedures) {
        this.serviceName = serviceName;
        this.procedures = procedures;
        this.queue = `rpc.queue.${serviceName}`;
        this.queuesRegistered = false;
        this.pendingReplies = [];
        this.channel = amqpConnection.createChannel();
    }

    start() {
        const self = this;

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
                self.channel.prefetch(1);
                self.channel.consume(self.queue, self.processProcedure.bind(self));
            });
    }

    processProcedure(procedureMessage) {
        const self = this;
        let procedureObject;

        try {
            procedureObject = JSON.parse(procedureMessage.content.toString());
        } catch(err) {
            this.reply(procedureMessage, {err: new VError(err, `RPC message parsing error on ${this.serviceName}!`)});
        }

        const procedure = this.procedures[procedureObject.name];


        if (procedure) {
            if (isGenerator(procedure)) {
                co.apply(co, [procedure].concat(procedureObject.arguments))
                    .then(result => {
                        self.reply(procedureMessage, {result});
                    })
                    .catch(err => {
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
        if (this.channel.open) {

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
        }
    }
}


module.exports = function(serviceName, methods) {
    const server = new RPCServer(serviceName, methods);
    server.start();
};
