"use strict";

const { Component, AsyncEmitter } = require("merapi");
const pack = require("../package");

class ServicePubRabbit extends Component.mixin(AsyncEmitter) {

    constructor(config, logger, injector, amqp, servicePub) {
        super();

        this.config = config;
        this.logger = logger;
        this.injector = injector;
        this.amqp = amqp;
        this.servicePub = servicePub;

        this.SERVICE_NAME = config.default("name", "unnamed-service");
        this.VERSION = pack.version;

        this._status = "ok";
        this._initializing = false;
        this._connection = null;
        this._namespace = config.default("service.rabbit.namespace", "default");

        this.servicePub.on("trigger", this.publishEvent.bind(this));
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
        this._eventList = [];
        this._channels = {};

        let desc = this.config.default("service.publish", {});
        for (let i in desc) {
            this._eventList.push(i);
            yield this.createPublisher(i, desc[i]);
        }

        this._initializing = false;
    }

    publishEvent(event, payload) {
        let channel = this._channels[event];
        if (channel && this._eventList.includes(event)) {
            let exchangeName = this._namespace + "." + this.SERVICE_NAME + "." + event;
            let content = JSON.stringify(payload);
            channel.publish(exchangeName, "", Buffer.from(content), { persistent: true });
        }
    }

    *createPublisher(event) {
        let channel = yield this._connection.createChannel();
        let exchangeName = this._namespace + "." + this.SERVICE_NAME + "." + event;
        this._channels[event] = channel;

        yield channel.assertExchange(exchangeName, "fanout", { durable: true });
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
        return {
            exchanges: this._eventList.map((event) => this.SERVICE_NAME + "." + event)
        };
    }

    *mount(service) {
        service;
    }

    *unmount(service) {
        service;
    }

    getEventList() {
        return this._eventList;
    }
}

module.exports = ServicePubRabbit;
