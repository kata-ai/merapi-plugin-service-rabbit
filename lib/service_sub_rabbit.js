"use strict";

const {async, utils} = require("@yesboss/merapi");
const ServiceSub = require("@yesboss/merapi-plugin-service/lib/service_sub");
const pack = require("../package");
const request = require("requestretry");

class ServiceSubRabbit extends ServiceSub {

    constructor(config, logger, injector, amqp) {
        super(config, logger, injector);

        this.config = config;
        this.logger = logger;
        this.injector = injector;
        this.amqp = amqp;

        this.SERVICE_NAME = config.default("name", "unnamed-service");
        this.VERSION = pack.version;

        this.maxAttempts = this.config.default("service.rabbit.maxAttempts", 5);
        this.retryDelay = this.config.default("service.rabbit.retryDelay", 5000);
        this.remainingAttempts = this.maxAttempts - 1;

        this._status = "ok";
        this._subscribers = {};
        this._channels = {};
        this._queues = [];
    }

    *initialize() {
        let desc = this.config.default("service.subscribe", {});
        let prefetch = this.config.default("service.rabbit.consumer_prefetch", 5);
        let consumerPrefetch = this.config.default("service.rabbit.consumerPrefetch", prefetch);
        Object.assign(this._registry, this.config.default("service.registry", {}));

        for (let i in desc) {
            this._subscriptions[i] = {};

            let info = yield this.getServiceInfo(i);
            let rabbitAvailable = info ? Object.keys(info.modules).some(key => key == "pub-rabbit") : false;

            for (let event in desc[i]) {
                let channel = yield this.amqp.createChannel();
                yield channel.prefetch(consumerPrefetch);
                this._channels[event] = channel;

                let hook = i + "." + event;
                let method = yield this.injector.resolveMethod(desc[i][event]);
                this._subscriptions[i][event] = { hook, method };
                this._hooks.push(hook);

                if (rabbitAvailable) {
                    let publisherName = info.name || "publisher";
                    this.createQueue(publisherName, event, method);
                }
                else {
                    this.createHook(hook, method);
                }
            }
        }
    }

    *createQueue(publisherName, event, method) {
        let channel = this._channels[event];

        if (channel) {
            let queueName = publisherName + "." + this.SERVICE_NAME + "." + event;
            let exchangeName = publisherName + "." + event;

            yield channel.assertQueue(queueName, { durable: true });
            yield channel.assertExchange(exchangeName, "fanout", { durable: true });
            yield channel.bindQueue(queueName, exchangeName, "");
            this._queues.push(queueName);

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
    }

    retryStrategy(err, response, body) {
        if (this.remainingAttempts < this.maxAttempts - 1) {
            this.logger.warn(`Retrying request to publisher's /info, will request ${this.remainingAttempts} more time(s) in ${this.retryDelay}ms`);
        }

        this.remainingAttempts--;

        return request.RetryStrategies.HTTPOrNetworkError(err, response);
    }

    *getServiceInfo(service) {
        let response;

        try {
            response = yield request({
                url: this.resolve(service) + "/info",
                method: "GET",
                json: true,
                maxAttempts: this.maxAttempts,
                retryDelay: this.retryDelay,
                retryStrategy: this.retryStrategy.bind(this),
                fullResponse: false
            });
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