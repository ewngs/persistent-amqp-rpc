'use strict';
require('harmony-reflect');
const amqp = require('amqplib');
const co = require('co');
const queueOptions = {durable: false};

class RPCServer {
  constructor(serviceName, methods) {
    this.serviceName = serviceName;
    this.methods = methods;
    this.queue = `rpc.queue.${this.serviceName}`;
  }

  *start() {
      const conn = yield amqp.connect('amqp://localhost');

      process.once('SIGINT', function() { conn.close(); });
      this.channel = yield conn.createChannel();
      console.log('RabbitMQ Channel Opened');
      yield this.channel.assertQueue(this.queue, queueOptions);
      this.channel.prefetch(1);
      yield this.channel.consume(this.queue, this.process);
      console.log(`${this.serviceName} service started. Awaiting RPC requests`);
  }

  process(message) {
      let response;
      try {
          const data = JSON.parse(message.content.toString());
          response = new Buffer(JSON.stringify(this.methods[data.method].apply(undefined, data.arguments)));
      } catch (error) {
          response = new Buffer(JSON.stringify({error: error}));
      }
      this.sendToQueue(message.properties.replyTo, response, {correlationId: message.properties.correlationId});
      this.channel.ack(message);
  }
}

module.exports = function (serviceName, methods) {
    const server = new RPCServer(serviceName, methods);
    co(server.start())
        .catch(console.warn);
};
