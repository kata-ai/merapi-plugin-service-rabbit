"use strict";

const {async, utils} = require("@yesboss/merapi");
const ServiceSub = require("@yesboss/merapi-plugin-service/lib/service_sub");
const pack = require("../package");
const request = require("request-promise-native");

class ServiceSubRabbit extends ServiceSub {

    constructor(config, logger, injector, amqp) {
        super(config, logger, injector);

        this.config = config;
        this.logger = logger;
        this.injector = injector;
        this.amqp = amqp;

        this.SERVICE_NAME = config.default("name", "unnamed-service");
        this.VERSION = pack.version;

        this._status = "ok";
        this._subscribers = {};
        this._channels = {};
        this._queues = [];
    }

    *initialize() {
        let desc = this.config.default("service.subscribe", {});

        for (let i in desc) {
            this._subscriptions[i] = {};

            let info = yield this.getServiceInfo(i);
            let rabbitAvailable = Object.keys(info.modules).some(key => key == "pub-rabbit");

            for (let event in desc[i]) {
                let channel = yield this.amqp.createChannel();
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

        Object.assign(this._registry, this.config.default("service.registry", {}));
    }

    *createQueue(publisherName, event, method) {
        let channel = this._channels[event];

        if (channel) {
            let queueName = publisherName + "." + this.SERVICE_NAME + "." + event;
            let exchangeName = publisherName + "." + event;
            
            yield channel.assertQueue(queueName, { durable: true });
            yield channel.bindQueue(queueName, exchangeName, "");
            this._queues.push(queueName);

            yield channel.consume(queueName, async(function* (message) {
                try {
                    let payload = JSON.parse(message.content.toString());
                    let ret = method(payload);

                    if (utils.isPromise(ret))
                        yield ret;
                    yield channel.ack(message);
                }
                catch (e) {
                    yield channel.nack(message);
                }
            }));

        }
    }

    getServiceInfo(service) {
        return request({
            uri: this.resolve(service) + "/info",
            method: "GET",
            json: true
        });
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