"use strict";

const { Component, AsyncEmitter } = require("merapi");
const pack = require("../package");

const Rabbit = require("./Rabbit");

class ServicePubRabbit extends Component.mixin(AsyncEmitter) {

    constructor(config, logger, injector, servicePub) {
        super();

        this.config = config;
        this.logger = logger;
        this.injector = injector;
        this.servicePub = servicePub;

        this.SERVICE_NAME = config.default("name", "unnamed-service");
        this.VERSION = pack.version;

        this._status = "ok";
        this._rabbit = null;
        this._initializing = false;
        this._connection = null;
        this._namespace = config.default("service.rabbit.namespace", "default");
        this._connectionConfig = config.default("service.rabbit", { host: "localhost", port: 5672 });
        this._reconnectDelay = config.default("service.rabbit.reconnectDelay", 100);

        this._eventList = [];
        const publishedEvent = this.config.default("service.publish", {});
        for (const eventName in publishedEvent) {
            this._eventList.push(eventName);
        }
        this._publishedEvent = publishedEvent;

        this._rabbit = new Rabbit({
            namespace: this._namespace,
            connection: this._connectionConfig,
            serviceName: this.SERVICE_NAME,
            pub: this._publishedEvent,
            reconnectDelay: this._reconnectDelay,
        });

        this.servicePub.on("trigger", this.publishEvent.bind(this));
    }

    *initialize() {
    }

    *destroy() {
    }

    publishEvent(event, payload) {
        this._rabbit.publish({
            pub: {[event]: event ? this._publishedEvent[event] : ""},
            pubPayload: payload,
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
