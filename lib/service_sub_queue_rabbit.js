"use strict";

const { async, utils } = require("merapi");
const ServiceSubQueue = require("merapi-plugin-service/lib/service_sub_queue");
const pack = require("../package");

const Rabbit = require("./Rabbit");

class ServiceSubRabbit extends ServiceSubQueue {

    constructor(config, logger, injector) {
        super(config, logger, injector);

        this.config = config;
        this.logger = logger;
        this.injector = injector;

        this.SERVICE_NAME = config.default("name", "unnamed-service");
        this.VERSION = pack.version;

        this._initialized = false;
        this._rabbit = null;
        this._status = "ok";
        this._namespace = config.default("service.rabbit.namespace", "default");
        this._connectionConfig = config.default("service.rabbit", { host: "localhost", port: 5672 });
        this._prefetch = parseInt(this.config.default("service.rabbit.prefetch", 5));
        this._reconnectDelay = config.default("service.rabbit.reconnectDelay", 1000);

        // rawSubscribeConfig's structure: {[eventName: string]: string}
        const rawSubscribeConfig = this.config.default("service.queue.subscribe", {});
        // expected structure of `this._subscribeConfig: {[eventName: string]: Function}
        this._subscribeConfig = {};

        // fill `this._subscribeConfig` by resolving the methods. This operation is promise based.
        let subscribeConfigPromise = Promise.resolve(true);
        for (const event in rawSubscribeConfig) {
            const methodName = rawSubscribeConfig[event];
            subscribeConfigPromise = subscribeConfigPromise
                .then(() => {
                    return this.injector.resolveMethod(methodName);
                })
                .then((callback) => {
                    this._subscribeConfig[event] = callback;
                });
        }

        // resolve the promise and init
        subscribeConfigPromise.then(() => {
            this.init();
        });
    }

    *initialize() {
    }

    *destroy() {
    }

    init() {
        if (this._initialized) {
            return true;
        }
        this._initialized = true;
        if (!this._rabbit) {
            this._rabbit = new Rabbit({
                namespace: this._namespace,
                connection: this._connectionConfig,
                serviceName: this.SERVICE_NAME,
                subQueue: this._subscribeConfig,
                reconnectDelay: this._reconnectDelay,
            });
        }
    }

    extension() {
        return {};
    }

    *mount() { }

    *unmount() { }
}

module.exports = ServiceSubRabbit;
