"use strict";

const { Component, AsyncEmitter } = require("merapi");
const pack = require("../package");

class ServicePubQueueRabbit extends Component.mixin(AsyncEmitter) {

    constructor(config, logger, injector, amqp, servicePubQueue) {
        super();

        this.config = config;
        this.logger = logger;
        this.injector = injector;
        this.amqp = amqp;
        this.servicePubQueue = servicePubQueue;

        this.SERVICE_NAME = config.default("name", "unnamed-service");
        this.VERSION = pack.version;

        this._status = "ok";
        this._initializing = false;
        this._connection = null;
        this._channels = {};
        this._registry = {};
        this._namespace = config.default("service.rabbit.namespace", "default");
        this.expireTime = this.config.default("service.rabbit.expireTime", 1000 * 60 * 30); // 30 mins

        this.servicePubQueue.on("triggerQueue", this.publishEvent.bind(this));
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

        let desc = this.config.default("service.queue.publish", {});

        for (let service in desc) {
            for (let event in desc[service]) {
                this.createPublisher(service, event);
            }
        }

        Object.assign(this._registry, this.config.default("service.registry", {}));

        this._initializing = false;
    }

    publishEvent(service, event, payload) {
        let channel = this._channels[service] && this._channels[service][event];
        if (channel) {
            let queueName = `${this._namespace}.queue.${service}.${event}`;
            let content = JSON.stringify(payload);
            channel.sendToQueue(queueName, Buffer.from(content), { persistent: true });
        }
    }

    *createPublisher(service, event) {
        let channel = yield this._connection.createChannel();
        let queueName = `${this._namespace}.queue.${service}.${event}`;

        if (!this._channels[service])
            this._channels[service] = {};

        this._channels[service][event] = channel;

        yield channel.assertQueue(queueName, {
            durable: true,
            expires: this.expireTime,
        });
    }

    info() {
        return {
            version: this.VERSION,
            status: this._status
        };
    }

    status() {
        return this._status;
    }

    extension() {
        return {};
    }

    *mount() { }

    *unmount() { }
}

module.exports = ServicePubQueueRabbit;