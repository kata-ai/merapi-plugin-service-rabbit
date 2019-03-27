"use strict";

const { Component, AsyncEmitter } = require("merapi");
const pack = require("../package");

const Rabbit = require("./Rabbit");

class ServicePubQueueRabbit extends Component.mixin(AsyncEmitter) {

    constructor(config, logger, injector, servicePubQueue) {
        super();

        this.config = config;
        this.logger = logger;
        this.injector = injector;
        this.servicePubQueue = servicePubQueue;

        this.SERVICE_NAME = config.default("name", "unnamed-service");
        this.VERSION = pack.version;

        this._status = "ok";
        this._namespace = config.default("service.rabbit.namespace", "default");
        this._connectionConfig = config.default("service.rabbit", { host: "localhost", port: 5672 });
        this._reconnectDelay = config.default("service.rabbit.reconnectDelay", 100);

        const desc = this.config.default("service.queue.publish", {});
        const pubQueue = {};
        for (const service in desc) {
            pubQueue[service] = Object.keys(desc[service]);
        }

        this._rabbit = new Rabbit({
                namespace: this._namespace,
                connection: this._connectionConfig,
                serviceName: this.SERVICE_NAME,
                pubQueue,
                reconnectDelay: this._reconnectDelay,
            });
        this.servicePubQueue.on("triggerQueue", this.publishEvent.bind(this));
    }

    *initialize() {
    }

    *destroy() {
    }

    publishEvent(service, event, payload) {
        this._rabbit.publishQueue({
            pubQueue: {[service]: [event]},
            pubQueuePayload: payload
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
