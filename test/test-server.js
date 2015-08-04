'use strict';

const amqpConnectString = 'amqp://localhost';

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

require('..').server(amqpConnectString, 'someService', {
    testMethod: testMethod
});
