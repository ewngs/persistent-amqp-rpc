//
// const amqp = require('amqplib');
//
// const queueName = 'testQueue';
// const queueOptions = {durable: false};
//
// const link = amqp.connect('amqp://localhost');
//
// link.then(function (connection) {
//   return connection.createChannel();
// }).then(function (channel) {
//   return channel.assertQueue(queueName, queueOptions).then(function () {
//     channel.sendToQueue(queueName, new Buffer('this is a message'));
//   });
// });
'use strict';

function someAsyncOveration(param) {
    return new Promise(function (resolve) {
      setTimeout(function() {
          resolve(`some async operation finished! Params: ${param}`);
      }, 1000);
    });
}

function* testMethod(param) {
    return yield someAsyncOveration(param);
}

require('./rpcServer')('someService', {
    testMethod: testMethod
});
