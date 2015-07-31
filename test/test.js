'use strict';
const test = require('tape');
const rpc = require('..');

let i = 1;

function shutdown() {
    setTimeout(() => {
        process.emit('SIGINT');
    }, 10);
}

test('should handle simple functions', t => {
    t.plan(1);

    rpc.server('testService' + i, {
        testCall: function() {
            t.pass('It should call the RPC function');
        }
    });

    rpc.client('testService' + i++).testCall();
});

test('should pass parameters to simple functions', t => {
    t.plan(3);

    rpc.server('testService' + i, {
        testParams: function(a, b, c) {
            t.equal(a, 1);
            t.equal(b, 'two');
            t.deepEqual(c, [3]);
        }
    });

    rpc.client('testService' + i++).testParams(1, 'two', [3]);
});

test('should return result of a simple functions', t => {
    t.plan(1);

    rpc.server('testService' + i, {
        add: function(a, b) {
            return a + b;
        }
    });

    rpc.client('testService' + i++).add(1, 2)
        .then(result => {
            t.equal(result, 3);
            shutdown();
        });
});
