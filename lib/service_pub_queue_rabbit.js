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
        this._withExpire = true;
        this._channels = {};
        this._registry = {};
        this._namespace = config.default("service.rabbit.namespace", "default");
        this.expireTime = this.config.default("service.rabbit.expireTime", 1000 * 60 * 60 * 24); // 1 day

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

        const queueOpts = {
            durable: true,
        };

        if (this._withExpire) {
            Object.assign(queueOpts, { expires: this.expireTime });
        }

        // by default, assert queue with `expires` header. if queue is exists and
        // don't have `expires` header, rabbitMQ will throw an error and close channel.
        // we catch the error on `close` or `error` emit (amqp.node lib emit those error)
        // and re-init this class
        try {
            yield channel.assertQueue(queueName, queueOpts);
        } catch (e) {
            this._initializing = false;

            // dont use `expires` header on re-init
            this._withExpire = false;
            this._connection.on("close", this.init.bind(this));
            this._connection.on("error", this.init.bind(this));
        }
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