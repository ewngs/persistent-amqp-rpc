'use strict';

require('harmony-reflect');
const amqp = require('amqplib');

const queueOptions = {durable: false};
let amqpChannel;
let localClients = {};

amqp
  .connect('amqp://localhost')
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

    if (amqpChannel && !this.channelsRegistered) {
      this.registerQueues();
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

  registerQueues() {
    this.channelsRegistered = true;
  }

}

module.exports = function (serviceName) {
  if (!localClients[serviceName]) {
    localClients[serviceName] = new RPCClient(serviceName);
  }
  return localClients[serviceName].proxy;
};
