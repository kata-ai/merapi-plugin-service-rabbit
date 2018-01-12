"use strict";

const { async, utils } = require("merapi");
const ServiceSubQueue = require("merapi-plugin-service/lib/service_sub_queue");
const pack = require("../package");

class ServiceSubRabbit extends ServiceSubQueue {

    constructor(config, logger, injector, amqp) {
        super(config, logger, injector);

        this.config = config;
        this.logger = logger;
        this.injector = injector;
        this.amqp = amqp;

        this.SERVICE_NAME = config.default("name", "unnamed-service");
        this.VERSION = pack.version;

        this._status = "ok";
        this._initializing = false;
        this._connection = null;
        this._withExpire = true;
        this._namespace = config.default("service.rabbit.namespace", "default");
        this.expireTime = this.config.default("service.rabbit.expireTime", 1000 * 60 * 30); // 30 mins

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
            let queueName = `${this._namespace}.queue.${this.SERVICE_NAME}.${event}`;

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
                this.logger.error("Error service_sub_queue_rabbit createQueue", e);

                this._initializing = false;

                // dont use `expires` header on re-init
                this._withExpire = false;
                this._connection.on("close", this.init.bind(this));
                this._connection.on("error", this.init.bind(this));
            }

            channel.consume(queueName, async(function* (message) {
                try {
                    let payload = JSON.parse(message.content.toString());
                    let ret = yield this.runMethod(method, payload);

                    channel.ack(message);
                }
                catch (e) {
                    channel.nack(message);
                }
            }.bind(this)));

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