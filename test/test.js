'use strict';

const test = require('tape');
const rpc = require('..')();
const rpcWithTimeout = require('..')({procedureCallTimeout: 100});

let processes = [];

function shutdownAllProcesses() {
    for (let p of processes) {
        p.shutdown();
    }
}

function TestError(message) {
    Error.captureStackTrace(this);
    this.name = "TestError";
    this.message = message;
}
TestError.prototype = Object.create(Error.prototype);

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

    t.test('should rethrow the same error object', st => {
        const client = rpc.client('testServiceF');
        const worker = rpc.worker('testServiceF', {
            explode: function() {
                throw new TestError('test error');
            }
        });

        client.explode()
            .catch(err => {
                st.equal(err.name, 'TestError');

                processes.push(client);
                processes.push(worker);
                st.end();
            });
    });

    t.test('should rethrow with stack trace', st => {
        const client = rpc.client('testServiceG');
        const worker = rpc.worker('testServiceG', {
            explode: function() {
                throw new TestError('test error');
            }
        });

        client.explode()
            .catch(err => {


                st.notEqual(err.stack.indexOf('at Function.rpc.worker.explode'), -1);

                processes.push(client);
                processes.push(worker);
                st.end();
            });
    });
});

test('generator functions', t => {
    t.test('should call', st => {
        const client = rpc.client('testServiceGA');
        const worker = rpc.worker('testServiceGA', {
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
        const client = rpc.client('testServiceGB');
        const worker = rpc.worker('testServiceGB', {
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
        const client = rpc.client('testServiceGC');
        const worker = rpc.worker('testServiceGC', {
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
        const client = rpc.client('testServiceGD');
        const worker = rpc.worker('testServiceGD', {
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
        const client = rpc.client('testServiceGE');
        const worker = rpc.worker('testServiceGE', {
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

    t.test('should rethrow the same error object', st => {
        const client = rpc.client('testServiceGF');
        const worker = rpc.worker('testServiceGF', {
            explode: function*() {
                throw new TestError('test error');
            }
        });

        client.explode()
            .catch(err => {
                st.equal(err.name, 'TestError');

                processes.push(client);
                processes.push(worker);
                st.end();
            });
    });

     t.test('should rethrow with stack trace', st => {
        const client = rpc.client('testServiceGG');
        const worker = rpc.worker('testServiceGG', {
            explode: function*() {
                throw new TestError('test error');
            }
        });

        client.explode()
            .catch(err => {
                st.notEqual(err.stack.indexOf('at Function.rpc.worker.explode'), -1);

                processes.push(client);
                processes.push(worker);
                st.end();
            });
    });
});

/*test('worker graceful shutdown', t => {
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
            worker.shutdown()
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

test('client graceful shutdown', t => {
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
            client.shutdown()
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
});*/

test('client RPC timeout', t => {
    const client = rpcWithTimeout.client('timeoutService');
    client.waitForReady()
        .catch(err => {
            t.equal(err.message, 'waitForReady RPC timeout on timeoutService');

            processes.push(client);
            t.end();

            shutdownAllProcesses();
        });
    client.waitForReady();
    client.waitForReady();

});
