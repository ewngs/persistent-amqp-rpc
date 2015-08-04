'use strict';

const rpc = require('..')('amqp://localhost');
const someService = rpc.client('someService');
const co = require('co');

let i = 0;

setInterval(function() {
    co(function* () {
        try {
            console.log(yield someService.testMethod(i++));
        } catch (err) {
            console.log(err.message);
        }
    }).catch(function (err) {
        console.log(err.message);
    });
}, 500);
