"use strict";

const { async, utils } = require("merapi");
const ServiceSubQueue = require("merapi-plugin-service/lib/service_sub_queue");
const pack = require("../package");
const sleep = require("then-sleep");

class ServiceSubRabbit extends ServiceSubQueue {

    constructor(config, logger, injector, amqp) {
        super(config, logger, injector);

        this.config = config;
        this.logger = logger;
        this.injector = injector;
        this.amqp = amqp;
        this.amqp.serviceSubQueue = this;

        this.SERVICE_NAME = config.default("name", "unnamed-service");
        this.VERSION = pack.version;

        this._status = "ok";
        this._initializing = false;
        this._connection = null;
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
        this._queues = [];

        let desc = this.config.default("service.queue.subscribe", {});
        let prefetch = parseInt(this.config.default("service.rabbit.prefetch", 5));

        for (let event in desc) {
            let channel = yield this._connection.createChannel();
            yield channel.prefetch(prefetch);
            this._channels[event] = channel;

            let method = yield this.injector.resolveMethod(desc[event]);
            this.createQueue(event, method);
        }
    }

    *createQueue(event, method) {
        let channel = this._channels[event];

        if (channel) {
            channel.on("close", () => {
                console.dir(`${event} is closed`)
                this.reconnect(event)
            });
            
            let queueName = `${this._namespace}.queue.${this.SERVICE_NAME}.${event}`;

            yield channel.assertQueue(queueName, { durable: true });

            const consumerTag = process.env.HOSTNAME || "";
            channel.consume(queueName, async(function* (message) {
                try {
                    let payload = JSON.parse(message.content.toString());
                    let ret = yield this.runMethod(method, payload);

                    channel.ack(message);
                }
                catch (e) {
                    channel.nack(message);
                }
            }.bind(this)), { consumerTag });

        }
    }

    *reconnect(event) {
        try {
            let desc = this.config.default("service.queue.subscribe", {});
            let prefetch = parseInt(this.config.default("service.rabbit.prefetch", 5));

            let channel = yield this._connection.createChannel();
            yield channel.prefetch(prefetch);
            this._channels[event] = channel;
    
            let method = yield this.injector.resolveMethod(desc[event]);
            this.createQueue(event, method);    
        } catch (e) {
            this.logger.warn("Failed to connect channel " + event, e);
            yield sleep(3000);

            yield this.reconnect(event);
        }
    }

    *runMethod(method, payload) {
        let ret = method(payload);
        if (utils.isPromise(ret)) yield ret;

        return ret;
    }

    extension() {
        return {};
    }

    *mount() { }

    *unmount() { }
}

module.exports = ServiceSubRabbit;
