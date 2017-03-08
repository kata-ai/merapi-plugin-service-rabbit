"use strict";

const { Component, AsyncEmitter } = require("@yesboss/merapi");
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
        this._eventList = [];
        this._channels = {};
        this._listenerId;
        this._reInitialized = false;
    }

    *initialize() {
        let desc = this.config.default("service.publish", {});
        for (let i in desc) {
            this._eventList.push(i);
            yield this.createPublisher(i, desc[i]);
        }

        this._listenerId = this.servicePub.on("trigger", this.publishEvent.bind(this));
        this.amqp.on("close", this.reInitialize.bind(this));
        this.amqp.on("error", this.reInitialize.bind(this));
    }

    *reInitialize() {
        if (this._reInitialized) return;
        this._reInitialized = true;

        this.logger.warn("Lost connection to rmq.");

        this.amqp = yield require("./service_amqp")(this.config, this.logger);
        this.emit("changeConnection", this.amqp);

        this._eventList = [];
        this._channels = {};

        this.servicePub.removeListener("trigger", this._listenerId);
        yield this.initialize();
        this._reInitialized = false;
    }

    publishEvent(event, payload) {
        let channel = this._channels[event];
        if (channel && this._eventList.includes(event)) {
            let exchangeName = this.SERVICE_NAME + "." + event;
            let content = JSON.stringify(payload);
            channel.publish(exchangeName, "", Buffer.from(content), { persistent: true });
        }
    }

    *createPublisher(event) {
        let conn = this.amqp;
        let channel = yield conn.createChannel();
        let exchangeName = this.SERVICE_NAME + "." + event;
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