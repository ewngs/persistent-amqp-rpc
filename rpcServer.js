'use strict';

require('harmony-reflect');
const amqp = require('amqplib');

const queueOptions = {durable: false};

class RPCServer {

  constructor(serviceName, modul) {
    this.serviceName = serviceName;
    this.modul = modul;
    this.queue = `rpc.queue.${this.serviceName}`;

    if (amqpChannel && !this.queueRegistered) {
      this.registerQueue();
    }

    this.proxy = new Proxy({}, {
      get(targetObj, propKey) {
        return function () {
          return new Promise(function (resolve) {
            setTimeout(resolve, 1000);
          });
        };
      }
    });
  }

  start() {
      amqp
        .connect('amqp://localhost')
        .then(connection => connection.createChannel())
        .then(function(channel){
            console.log('RabbitMQ Channel Opened');
            channel.assertQueue(this.queue, queueOptions);
        });
  }

}

module.exports = function (serviceName, modul) {
  let server = new RPCServer(serviceName, modul);
  server.start();
};
