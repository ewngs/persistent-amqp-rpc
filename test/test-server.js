'use strict';

const rpc = require('..')('amqp://localhost');

function someAsyncOveration(param) {
    return new Promise(function (resolve) {
        setTimeout(function() {
            console.log(`some async operation finished! Params: ${param}`);
            resolve();
        }, 10);
    });
}

function* testMethod(param) {
    return yield someAsyncOveration(param);
}

rpc.server('someService', {
    testMethod: testMethod
});
