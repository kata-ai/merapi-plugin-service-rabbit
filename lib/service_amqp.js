"use strict";

const amqp = require("amqplib");
const sleep = require("then-sleep");

module.exports = function (config, logger) {

    function connect() {
        let {secure, user, password, host, port} = config.default("service.rabbit", { host: "localhost" });
        let connectionString;

        let protocol = (typeof secure === "boolean" && secure) ? "amqps" : "amqp";

        port = (protocol === "amqps") ? 5671 : 5672;

        if (user && password) {
            connectionString = `${protocol}://${user}:${password}@${host}:${port}`;
        }
        else {
            connectionString = `${protocol}://${host}:${port}`;
        }

        return amqp.connect(connectionString)
            .then(function (conn) {
                conn.on("close", () => {
                    logger.warn("Lost connection to rmq.");
                    return connect();
                });

                logger.info("Connected to rmq.");
                return conn.createChannel().then(function (ch) {
                    return ch;
                });
            }, function (err) {
                logger.warn("Failed to connect to rmq.", err);
                return reconnect();
            });
    }

    function reconnect() {
        return sleep(3000).then(function () {
            logger.info("Attempting to reconnect to rmq.");
            return connect();
        });
    }

    return connect();
};