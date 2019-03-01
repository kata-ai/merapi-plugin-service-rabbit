"use strict";

const { async, utils } = require("merapi");
const ServiceSub = require("merapi-plugin-service/lib/service_sub");
const pack = require("../package");
const request = require("requestretry");

class ServiceSubRabbit extends ServiceSub {

    constructor(config, logger, injector, amqp, servicePubRabbit) {
        super(config, logger, injector);

        this.config = config;
        this.logger = logger;
        this.injector = injector;
        this.amqp = amqp;
        this.servicePubRabbit = servicePubRabbit;

        this.SERVICE_NAME = config.default("name", "unnamed-service");
        this.VERSION = pack.version;

        this.maxAttempts = this.config.default("service.rabbit.maxAttempts", 5);
        this.retryDelay = this.config.default("service.rabbit.retryDelay", 5000);
        this.remainingAttempts = this.maxAttempts - 1;

        this._status = "ok";
        this._initializing = false;
        this._connection = null;
        this._secret = this.config.default("service.secret", null);
        this._namespace = config.default("service.rabbit.namespace", "default");

        this.amqp.on("connected", () => {
            this.init();
        });
    }

    *initialize() {
        if (this.amqp.getConnection())
            this.init();
    }

    *init() {
        if (this._initializing) return;
        this._initializing = true;

        this._connection = this.amqp.getConnection();

        this._subscribers = {};
        this._channels = {};
        this._notificationChannels = {};
        this._queues = [];

        let desc = this.config.default("service.subscribe", {});
        let prefetch = parseInt(this.config.default("service.rabbit.prefetch", 5));
        Object.assign(this._registry, this.config.default("service.registry", {}));

        for (let i in desc) {
            this._subscriptions[i] = {};

            let info = yield this.getServiceInfo(i);
            let rabbitAvailable = info ? Object.keys(info.modules).some(key => key == "pub-rabbit") : false;

            for (let event in desc[i]) {
                let channel = yield this._connection.createChannel();
                yield channel.prefetch(prefetch);
                this._channels[event] = channel;

                let hook = i + "." + event;
                let method = yield this.injector.resolveMethod(desc[i][event]);
                this._subscriptions[i][event] = { hook, method };
                this._hooks.push(hook);

                if (rabbitAvailable) {
                    let publisherName = info.name || "publisher";
                    yield this.createQueue(publisherName, event, method);
                }
                else {
                    this.createHook(hook, method);
                }
            }
        }

        let notification = this.config.default("service.notification.subscribe", {});
        for (let event in notification) {
            let channel = yield this._connection.createChannel();
            yield channel.prefetch(prefetch);
            this._notificationChannels[event] = channel;

            let method = yield this.injector.resolveMethod(notification[event]);
            yield this.createNotificationQueue(event, method);
        }
    }

    *createNotificationQueue(event, method) {
        let channel = this._channels[event];
        let queueName = `${this._namespace}.${this.SERVICE_NAME}.${event}`;

        yield channel.assertQueue(queueName, { durable: true });

        channel.consume(queueName, async(function* (message) {
            try {
                let payload = JSON.parse(message.content.toString());
                let ret = method(payload);

                if (utils.isPromise(ret))
                    yield ret;

                channel.ack(message);
            }
            catch (e) {
                channel.nack(message);
            }
        }));
    }

    *createQueue(publisherName, event, method) {
        let channel = this._channels[event];

        if (channel) {
            let queueName = this._namespace + "." + publisherName + "." + this.SERVICE_NAME + "." + event;
            let exchangeName = this._namespace + "." + publisherName + "." + event;

            yield channel.assertQueue(queueName, { durable: true });
            yield channel.assertExchange(exchangeName, "fanout", { durable: true });
            yield channel.bindQueue(queueName, exchangeName, "");
            this._queues.push(queueName);

            channel.consume(queueName, async(function* (message) {
                try {
                    let payload = JSON.parse(message.content.toString());
                    let ret = yield this.runMethod(method, payload);

                    channel.ack(message);
                }
                catch (e) {
                    channel.nack(message);
                }
            }.bind(this)));

        }
    }

    *runMethod(method, payload) {
        let ret = method(payload);
        if (utils.isPromise(ret)) yield ret;

        return ret;
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
