"use strict";

const amqp = require("amqplib");

module.exports = function (config) {
    let {host, port} = config.default("service.rabbit", { host: "localhost", port: "5672" });
    return amqp.connect(`amqp://${host}:${port}`);
};