"use strict";

const amqp = require("amqplib");
const sleep = require("then-sleep");

module.exports = function (config, logger) {

    function connect() {
        return amqp.connect(connectionString)
            .then(function (conn) {
                conn.on("error", process.exit);

                return conn.createChannel().then(function (ch) {
                    return ch;
                });
            }, function (err) {
                logger.warn("Failed to connect", err);
                return reconnect();
            });
    }

    function reconnect() {
        return sleep(3000).then(function () {
            logger.info("Attempting to reconnect");
            return connect();
        });
    }

    let {secure, user, password, host, port} = config.default("service.rabbit", {host: "localhost"});

    let protocol = (typeof secure === "boolean" && secure) ? "amqps" : "amqp";
    let connectionString;

    port = (protocol === "amqps") ? 5671 : 5672;

    if (user && password) {
        connectionString = `${protocol}://${user}:${password}@${host}:${port}`;
    }
    else {
        connectionString = `${protocol}://${host}:${port}`;
    }

    return connect();
};