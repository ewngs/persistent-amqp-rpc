'use strict';

const rpc = require('..')('amqp://localhost');
const someService = rpc.client('someService');
const co = require('co');

let i = 0;

const interval = setInterval(function() {
    co(function* () {
        try {
            yield someService.testMethod(i);
        } catch (err) {
            console.log(err.message);
        }
    }).catch(function (err) {
        console.log(err.message);
    });

    i++;
}, 500);

process.on('SIGHUP', () => {
    console.log('HUP received. Terminating...');
    someService.terminate()
        .then(() => {
            clearInterval(interval);
        })
        .catch(function (err) {
            console.log(err);
        });
});
