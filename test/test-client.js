'use strict';

const rpc = require('..')();
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
    console.log('HUP received. Shutdown...');
    someService.shutdown()
        .then(() => {
            clearInterval(interval);
        })
        .catch(function (err) {
            console.log(err);
        });
});
