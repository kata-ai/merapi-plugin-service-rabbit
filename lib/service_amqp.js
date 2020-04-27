//@ts-check
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
    this.serviceSub = null;
    this.serviceSubQueue = null;
    this.signals = ["SIGINT", "SIGTERM", "SIGQUIT"];
    this.isShuttingDown = false;
  }

  initialize() {
    return this.doConnect();
  }

  getConnection() {
    return this._connection;
  }

  *doConnect() {
    if (this._initializing) return;

    // we don't need to reconnect if there's any shutting down process
    if (this.isShuttingDown) return;

    this._initializing = true;
    let {
      secure,
      user,
      password,
      host,
      port,
      connectionString,
      heartbeat = 20,
    } = this.config.default("service.rabbit", {
      host: "localhost",
      port: 5672,
      heartbeat: 20,
    });

    let protocol = typeof secure === "boolean" && secure ? "amqps" : "amqp";

    port = protocol === "amqps" ? 5671 : 5672;

    if (!connectionString) {
      if (user && password) {
        connectionString = `${protocol}://${user}:${password}@${host}:${port}`;
      } else {
        connectionString = `${protocol}://${host}:${port}`;
      }
    }

    let connectionStringOpts = `${connectionString}?heartbeat=${heartbeat}`;

    try {
      this._connection = yield amqp.connect(connectionStringOpts);

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
      this.serviceSub._initializing = false;
      this.serviceSubQueue._initializing = false;

      yield this.doConnect();
    }
  }

  handleShutdown() {
    this.signals.forEach((signal) =>
      process.addListener(signal, () => {
        console.log("Received signal", signal);
        this.cleanup(signal);

        console.log("Exiting process in 3sec...");
        setTimeout(() => {
          process.exit(0);
        }, 3000);
      })
    );
  }

  cleanup(signal) {
    if (!this.isShuttingDown) {
      try {
        console.log("Shutting down rabbitmq plugin...");

        this.isShuttingDown = true;

        this._connection.close();
      } catch (e) {
        console.error("Error while shutting down gracefully", e);

        process.exit(1);
      }
    }
  }
};
