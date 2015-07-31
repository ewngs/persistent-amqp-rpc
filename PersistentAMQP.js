'use strict';

const utils = require('utils');
const amqp = require('amqplib');

class PersistentAQMP {
    constructor() {

    }
}

let persistentConnections = {};

module.exports = function (connectString) {
    if (!persistentConnections[connectString]) {
        persistentConnections[connectString] = new PersistentAQMP(connectString);
    }

    return persistentConnections[connectString];
};
