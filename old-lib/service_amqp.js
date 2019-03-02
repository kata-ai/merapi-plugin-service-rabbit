"use strict";

const amqp = require("amqplib");
const sleep = require("then-sleep");
const { Component, AsyncEmitter } = require("merapi");

module.exports = class Amqp extends Component.mixin(AsyncEmitter) {

    constructor(config, logger) {
        super();
        this.config = config;
        this.logger = logger;
        this._connection;
        this._initializing = false;
    }

    initialize() {
        return this.doConnect();
    }

    getConnection() {
        return this._connection;
    }

    *doConnect() {
        if (this._initializing) return;
        this._initializing = true;
        let { secure, user, password, host, port, connectionString } = this.config.default("service.rabbit", { host: "localhost", port: 5672 });

        let protocol = (typeof secure === "boolean" && secure) ? "amqps" : "amqp";

        port = (protocol === "amqps") ? 5671 : 5672;

        if (!connectionString) {
            if (user && password) {
                connectionString = `${protocol}://${user}:${password}@${host}:${port}`;
            }
            else {
                connectionString = `${protocol}://${host}:${port}`;
            }
        }

        try {
            this._connection = yield amqp.connect(connectionString);

            this.logger.info("Connected to rmq.");

            this._connection.on("close", this.doConnect.bind(this));
            this._connection.on("error", this.doConnect.bind(this));

            this.emit("connected");

            this._initializing = false;
        } catch (e) {
            this._initializing = false;

            this.logger.warn("Failed to connect to rmq.", e);
            yield sleep(3000);
            this.logger.info("Attempting to reconnect to rmq.");

            yield this.doConnect();
        }
    }
};