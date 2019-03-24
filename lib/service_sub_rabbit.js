"use strict";

const { async, utils } = require("merapi");
const ServiceSub = require("merapi-plugin-service/lib/service_sub");
const pack = require("../package");
const request = require("requestretry");

const Rabbit = require("./Rabbit");

class ServiceSubRabbit extends ServiceSub {

    constructor(config, logger, injector, servicePubRabbit) {
        super(config, logger, injector);

        this.config = config;
        this.logger = logger;
        this.injector = injector;
        this.servicePubRabbit = servicePubRabbit;

        this.SERVICE_NAME = config.default("name", "unnamed-service");
        this.VERSION = pack.version;

        this.maxAttempts = this.config.default("service.rabbit.maxAttempts", 5);
        this.retryDelay = this.config.default("service.rabbit.retryDelay", 5000);
        this.remainingAttempts = this.maxAttempts - 1;

        this._status = "ok";
        this._rabbit = null;
        this._initialized = false;
        this._secret = this.config.default("service.secret", null);
        this._namespace = config.default("service.rabbit.namespace", "default");

        this._prefetch = parseInt(this.config.default("service.rabbit.prefetch", 5));
        this._reconnectDelay = config.default("service.rabbit.reconnectDelay", 100);
        this._connectionConfig = config.default("service.rabbit", { host: "localhost", port: 5672 });

        // rawSubscribeConfig's structure:
        // {
        //     [registryName: string]: {
        //         [eventName: string]: string
        //     }
        // }
        this._rawSubscribeConfig = this.config.default("service.subscribe", {});
        // rawNotificationConfig's structure: {[eventName: string]: string}
        this._rawNotificationConfig = this.config.default("service.notification.subscribe", {});
        // expected structure of `this._subscribeConfig`:
        // {
        //     [registryName: string]: {
        //         [eventName: string]: Function
        //     }
        // }
        this._subscribeConfig = {};
        // expected structure of `this._notificationConfig`: {[eventName: string]: Function}
        this._notificationConfig = {};

        this.init();

    }

    *initialize() {
    }

    *destroy() {
    }

    *init() {
        if (this._initialized) {
            return true;
        }
        this._initialized = true;

        Object.assign(this._registry, this.config.default("service.registry", {}));

        const publisher = {};
        this._queues = [];
        this._subscriptions = {};
        this._hooks = [];

        // fill `this._subscribeConfig` by resolving the methods. This operation is promise based.
        let subscribeAndNotificationConfigPromise = Promise.resolve(true);
        for (const registryName in this._rawSubscribeConfig) {
            const info = yield this.getServiceInfo(registryName);
            const rabbitAvailable = info ? Object.keys(info.modules).some(key => key == "pub-rabbit") : false;
            publisher[registryName] = {};
            this._subscriptions[registryName] = {};
            this._subscribeConfig[registryName] = {};
            for (const eventName in this._rawSubscribeConfig[registryName]) {
                const methodName = this._rawSubscribeConfig[registryName][eventName];
                const hook = registryName + "." + eventName;
                publisher[registryName][eventName] = info.name || "publisher";
                this._queues.push(`${this._namespace}.${publisher[registryName][eventName]}.${this.SERVICE_NAME}.${eventName}`);
                subscribeAndNotificationConfigPromise = subscribeAndNotificationConfigPromise
                    .then(() => {
                        return this.injector.resolveMethod(methodName);
                    })
                    .then((callback) => {
                        this._subscriptions[registryName][eventName] = { hook, callback };
                        this._hooks.push(hook);
                        this._subscribeConfig[registryName][eventName] = callback;
                    });
            }
        }

        // fill `this._notificationConfig` by resolving the methods. This operation is promise based.
        for (const eventName in this._rawNotificationConfig) {
            const methodName = this._rawnotificationConfig[eventName];
            subscribeAndNotificationConfigPromise = subscribeAndNotificationConfigPromise
                .then(() => {
                    return this.injector.resolveMethod(methodName);
                })
                .then((callback) => {
                    this._notificationConfig[eventName] = callback;
                });
        }

        subscribeAndNotificationConfigPromise.then(() => {
            if (!this._rabbit) {
                this._rabbit = new Rabbit({
                    namespace: this._namespace,
                    connection: this._connectionConfig,
                    serviceName: this.SERVICE_NAME,
                    sub: this._subscribeConfig,
                    subNotification: this._notificationConfig,
                    reconnectDelay: this._reconnectDelay,
                    publisher
                });
            }
        });

    }

    retryStrategy(err, response) {
        if (this.remainingAttempts < this.maxAttempts - 1) {
            this.logger.warn(`Retrying request to publisher's /info, will request ${this.remainingAttempts} more time(s) in ${this.retryDelay}ms`);
        }

        this.remainingAttempts--;

        return request.RetryStrategies.HTTPOrNetworkError(err, response);
    }

    *getServiceInfo(service) {
        let response;

        try {
            let jsonBody = {
                url: this.resolve(service) + "/info",
                method: "GET",
                json: true,
                maxAttempts: this.maxAttempts,
                retryDelay: this.retryDelay,
                retryStrategy: this.retryStrategy.bind(this),
                fullResponse: false
            }

            if (this._secret != null) {
                jsonBody["headers"] = {
                    "Authorization": `Bearer ${this._secret}`
                }
            }

            response = yield request(jsonBody);
        }
        catch (e) {
            this.logger.warn("Giving up...");
            this.logger.warn(e.stack);
            return null;
        }

        return response;
    }

    extension() {
        return Object.assign(super.extension(), {
            queues: this._queues
        });
    }

    *mount(service) {
        service;
    }

    *unmount(service) {
        service;
    }
}

module.exports = ServiceSubRabbit;
