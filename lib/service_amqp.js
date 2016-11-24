"use strict";

const amqp = require("amqplib");

module.exports = function (config) {
    let {secure, user, password, host, port} = config.default("service.rabbit", { host: "localhost" });

    let protocol = (typeof secure === "boolean" && secure) ? "amqps" : "amqp";
    let connectionString;

    port = (protocol === "amqps") ? 5671 : 5672;

    if (user && password) {
        connectionString = `${protocol}://${user}:${password}@${host}:${port}`;
    }
    else {
        connectionString = `${protocol}://${host}:${port}`;
    }

    return amqp.connect(connectionString);
};