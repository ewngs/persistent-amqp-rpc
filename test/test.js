'use strict';
const test = require('tape');
const rpc = require('..');

let i = 1;

function shutdown() {
    setTimeout(() => {
        process.emit('SIGINT');
    }, 10);
}

test('simple functions', t => {
    t.test('should call', st => {
        st.plan(1);

        rpc.server('testService' + i, {
            testCall: function() {
                st.pass('It should call the RPC function');
            }
        });

        rpc.client('testService' + i++).testCall();
    });

    t.test('should pass parameters', st => {
        st.plan(3);

        rpc.server('testService' + i, {
            testParams: function(a, b, c) {
                st.equal(a, 1);
                st.equal(b, 'two');
                st.deepEqual(c, [3]);
            }
        });

        rpc.client('testService' + i++).testParams(1, 'two', [3]);
    });

    t.test('should return result', st => {
        st.plan(1);

        rpc.server('testService' + i, {
            add: function(a, b) {
                return a + b;
            }
        });

        rpc.client('testService' + i++).add(1, 2)
            .then(result => {
                st.equal(result, 3);
            });
    });

    t.test('should return result object', st => {
        st.plan(2);

        rpc.server('testService' + i, {
            calculate: function(a, b) {
                return {add: a + b, multiply: a * b};
            }
        });

        rpc.client('testService' + i++).calculate(1, 2)
            .then(result => {
                st.equal(result.add, 3);
                st.equal(result.multiply, 2);
            });
    });
});

test('generator functions', t => {
    t.test('should call', st => {
        st.plan(1);

        rpc.server('testService' + i, {
            testCall: function*() {
                st.pass('It should call the RPC function');
            }
        });

        rpc.client('testService' + i++).testCall();
    });

    t.test('should pass parameters', st => {
        st.plan(3);

        rpc.server('testService' + i, {
            testParams: function*(a, b, c) {
                st.equal(a, 1);
                st.equal(b, 'two');
                st.deepEqual(c, [3]);
            }
        });

        rpc.client('testService' + i++).testParams(1, 'two', [3]);
    });

    t.test('should return result', st => {
        st.plan(1);

        rpc.server('testService' + i, {
            add: function*(a, b) {
                return a + b;
            }
        });

        rpc.client('testService' + i++).add(1, 2)
            .then(result => {
                st.equal(result, 3);
            });
    });

    t.test('should return result object', st => {
        st.plan(2);

        rpc.server('testService' + i, {
            calculate: function*(a, b) {
                return {add: a + b, multiply: a * b};
            }
        });

        rpc.client('testService' + i++).calculate(1, 2)
            .then(result => {
                st.equal(result.add, 3);
                st.equal(result.multiply, 2);
                shutdown();
            });
    });
});
