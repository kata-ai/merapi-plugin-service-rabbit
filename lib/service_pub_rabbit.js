"use strict";

const {AsyncEmitter} = require("@yesboss/merapi");
const pack = require("../package");

class ServicePubRabbit extends AsyncEmitter {

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
    }

    *initialize() {
        let desc = this.config.default("service.publish", {});
        for (let i in desc) {
            this._eventList.push(i);
            yield this.createPublisher(i, desc[i]);
        }
        this.servicePub.on("trigger", this.publishEvent.bind(this));
    }

    publishEvent(event, payload) {
        let channel = this._channels[event];
        if (channel && event in this._eventList) {
            let exchangeName = this.SERVICE_NAME + "." + event;
            let content = JSON.stringify(payload);
            channel.publish(exchangeName, "", Buffer.from(content));
        }
    }

    *createPublisher(event) {
        let channel = yield this.amqp.createChannel();
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