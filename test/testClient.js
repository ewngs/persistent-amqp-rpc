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
const someService = require('..').client('someService');
const co = require('co');

co(function* () {
    let i = 0;
    while(isFinite(1)) {
        console.log(yield someService.testMethod(i++));
    }
});
