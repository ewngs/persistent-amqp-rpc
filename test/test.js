'use strict';

const test = require('tape');
const rpc = require('..')();
const rpcWithTimeout = require('..')({procedureCallTimeout: 100});

let processes = [];

function terminateAllProcesses() {
    for (let p of processes) {
        p.terminate();
    }
}

test('simple functions', t => {
    t.test('should call', st => {
        const client = rpc.client('testServiceA');
        const worker = rpc.worker('testServiceA', {
            testCall: function() {
                st.pass('It should call the RPC function');

                processes.push(client);
                processes.push(worker);
                st.end();
            }
        });

        client.testCall();
    });

    t.test('should pass parameters', st => {
        const client = rpc.client('testServiceB');
        const worker = rpc.worker('testServiceB', {
            testParams: function(a, b, c) {
                st.equal(a, 1);
                st.equal(b, 'two');
                st.deepEqual(c, [3]);

                processes.push(client);
                processes.push(worker);
                st.end();
            }
        });

        client.testParams(1, 'two', [3]);
    });

    t.test('should return result', st => {
        const client = rpc.client('testServiceC');
        const worker = rpc.worker('testServiceC', {
            add: function(a, b) {
                return a + b;
            }
        });

        client.add(1, 2)
            .then(result => {
                st.equal(result, 3);

                processes.push(client);
                processes.push(worker);
                st.end();
            });
    });

    t.test('should return result object', st => {
        const client = rpc.client('testServiceD');
        const worker = rpc.worker('testServiceD', {
            calculate: function(a, b) {
                return {add: a + b, multiply: a * b};
            }
        });

        client.calculate(1, 2)
            .then(result => {
                st.equal(result.add, 3);
                st.equal(result.multiply, 2);

                processes.push(client);
                processes.push(worker);
                st.end();
            });
    });

    t.test('should rethrow exceptions', st => {
        const client = rpc.client('testServiceE');
        const worker = rpc.worker('testServiceE', {
            explode: function() {
                throw new Error('test error');
            }
        });

        client.explode()
            .catch(err => {
                st.equal(err.message, 'test error');

                processes.push(client);
                processes.push(worker);
                st.end();
            });
    });
});

test('generator functions', t => {
    t.test('should call', st => {
        const client = rpc.client('testServiceF');
        const worker = rpc.worker('testServiceF', {
            testCall: function*() {
                st.pass('It should call the RPC function');

                processes.push(client);
                processes.push(worker);
                st.end();
            }
        });

        client.testCall();
    });

    t.test('should pass parameters', st => {
        const client = rpc.client('testServiceG');
        const worker = rpc.worker('testServiceG', {
            testParams: function*(a, b, c) {
                st.equal(a, 1);
                st.equal(b, 'two');
                st.deepEqual(c, [3]);

                processes.push(client);
                processes.push(worker);
                st.end();
            }
        });

        client.testParams(1, 'two', [3]);
    });

    t.test('should return result', st => {
        const client = rpc.client('testServiceH');
        const worker = rpc.worker('testServiceH', {
            add: function*(a, b) {
                return a + b;
            }
        });

        client.add(1, 2)
            .then(result => {
                st.equal(result, 3);

                processes.push(client);
                processes.push(worker);
                st.end();
            });
    });

    t.test('should return result object', st => {
        const client = rpc.client('testServiceI');
        const worker = rpc.worker('testServiceI', {
            calculate: function*(a, b) {
                return {add: a + b, multiply: a * b};
            }
        });

        client.calculate(1, 2)
            .then(result => {
                st.equal(result.add, 3);
                st.equal(result.multiply, 2);

                processes.push(client);
                processes.push(worker);
                st.end();
            });
    });

    t.test('should rethrow exceptions', st => {
        const client = rpc.client('testServiceJ');
        const worker = rpc.worker('testServiceJ', {
            explode: function*() {
                throw new Error('test error');
            }
        });

        client.explode()
            .catch(err => {
                st.equal(err.message, 'test error');

                processes.push(client);
                processes.push(worker);
                st.end();
            });
    });
});

test('worker graceful termination', t => {
    let ready;
    let done = 0;
    let cleanupWorker;
    const promise = new Promise(resolve => {
        ready = resolve;
    });

    const client = rpc.client('testServiceK');
    const worker = rpc.worker('testServiceK', {
        waitForReady: function*() {
            yield promise;
            done++;
        }
    });

    client.waitForReady()
        .then(() => {
            worker.terminate()
                .then(() => {
                    t.equal(done, 5);

                    cleanupWorker = rpc.worker('testServiceK', {
                        waitForReady: function*() {
                            yield promise;
                            done++;
                        }
                    });

                    return client.waitForReady();
                })
                .then(() => {
                    processes.push(client);
                    processes.push(cleanupWorker);
                    t.end();
                });

            client.waitForReady();
            client.waitForReady();
            client.waitForReady();
        });
    client.waitForReady();
    client.waitForReady();
    client.waitForReady();
    client.waitForReady();

    t.equal(done, 0);
    ready();
});

test('client graceful termination', t => {
    let ready;
    let done = 0;

    const promise = new Promise(resolve => {
        ready = resolve;
    });

    const client = rpc.client('testServiceL');
    const worker = rpc.worker('testServiceL', {
        waitForReady: function*() {
            yield promise;
            done++;
        }
    });

    client.waitForReady()
        .then(() => {
            client.terminate()
                .then(() => {
                    t.equal(done, 6);

                    processes.push(worker);
                    t.end();
                });
            client.waitForReady();
            client.waitForReady();
            client.waitForReady();
        });
    client.waitForReady();
    client.waitForReady();
    client.waitForReady();
    client.waitForReady();
    client.waitForReady();

    t.equal(done, 0);
    ready();
});

test('client RPC timeout', t => {
    const client = rpcWithTimeout.client('testServiceM');
    client.waitForReady()
        .catch(err => {
            t.equal(err.message, 'waitForReady RPC timeout on testServiceM');

            processes.push(client);
            t.end();

            terminateAllProcesses();
        });
    client.waitForReady();
    client.waitForReady();

});
