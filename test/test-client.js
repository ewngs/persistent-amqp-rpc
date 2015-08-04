'use strict';

const amqpConnectString = 'amqp://localhost';
const someService = require('..').client('someService');
const co = require('co');

co(function* () {
    let i = 0;
    while(isFinite(1)) {
        console.log(yield someService.testMethod(i++));
    }
});
