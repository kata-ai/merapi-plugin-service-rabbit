const { exec } = require("child_process");

const rabbitConnection = {
    host: process.env.RABBIT_HOST || "localhost",
    port: process.env.RABBIT_PORT || 5672,
    user: process.env.RABBIT_USERNAME || 'guest',
    password: process.env.RABBIT_PASSWORD || 'guest',
    consumerPrefetch: 1,
    maxAttemtps: 5,
    retryDelay: 50,
};

const rabbitUrl = `amqp://${rabbitConnection.user}:${rabbitConnection.password}@${rabbitConnection.host}:${rabbitConnection.port}`;
const startRabbitCommand = process.env.START_RABBIT_COMMAND;
const stopRabbitCommand = process.env.STOP_RABBIT_COMMAND;

module.exports = {
    rabbitConnection,
    rabbitUrl,
    startRabbitCommand,
    stopRabbitCommand,
};
