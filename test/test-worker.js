'use strict';

const rpc = require('..')();

function someAsyncOveration(param) {
    return new Promise(function (resolve) {
        setTimeout(function() {
            console.log(`some async operation finished! Params: ${param}`);
            resolve();
        }, 1000);
    });
}

function* testMethod(param) {
    return yield someAsyncOveration(param);
}

const worker = rpc.worker('someService', {
    testMethod: testMethod
});


process.on('SIGHUP', () => {
    console.log('HUP received. Shutdown...');
    worker.shutdown()
        .catch(function (err) {
            console.log(err);
        });
});
