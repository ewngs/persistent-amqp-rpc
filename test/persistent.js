'use strict';

const mq = require('../lib/PersistentAMQP')('amqp://localhost');

process.on('SIGINT', () => {
    console.warn(' ~ Got SIGINT, terminating');
    if (mq.isOpen()) {
        mq.terminate();
    }
});

mq.on('open', () => {
    console.log('> opened');
    mq.assertQueue('test1').then(queue => {
        console.log('> queue exists/created:', queue);
    });
});

mq.on('close', () => {
    console.log('> closed');
});
