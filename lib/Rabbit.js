const amqp = require("amqplib");

const defaultConfig = {
    connection: {
        host: "localhost",
        port: "5627",
        user: "guest",
        password: "",
        secure: false,
        connectionString: "",
    },
    serviceName: "unnamed-service",
    namespace: "default",
    prefetch: 5,
    /*
     * pubPayload?: {}, // pub + pubQueue
     * pubQueue?: {
     *    [serviceName]: string[], // serviceName: array of events
     * },
     * publisherName?: string, // pub
     * pub?: {
     *    [eventName]: trigger,
     * },
     * subQueue?: {
     *    [eventName]: (payload) => void,
     * },
     * sub: {
     *    [eventName]: (payload) => void,
     * },
     * subNotification: {
     *    [eventName]: (payload) => void,
     * },
     */
};

function getCompleteConfig(config) {
    const completeConfig = Object.assign({}, defaultConfig, config);
    return completeConfig;
}

function getConnectionString(config) {
    const { secure, user, password, host, port, connectionString } = config.connection;
    if (connectionString) {
        return connectionString;
    } else {
        const protocol = (typeof secure === "boolean" && secure) ? "amqps" : "amqp";
        const protocolBasedPort = protocol === "amqps" ? 5671 : 5672;
        if (user && password) {
            return `${protocol}://${user}:${password}@${host}:${port}`;
        }
        return `${protocol}://${host}:${port}`;
    }
}

async function sleep(delay) {
    return new Promise((resolve, reject) => {
        setTimeout(resolve, delay);
    });
}

class Rabbit {

    constructor(config = {}, logger = console) {
        this.publishedQueueList = []; // queue name that has been published (to avoid redundant publication)
        this.config = getCompleteConfig(config);
        this.logger = logger;
        this.connectionString = getConnectionString(this.config);
        this._initialize();
    }

    async _initialize() {
        try {
            // create connection
            const connection = await amqp.connect(this.connectionString);
            this.logger.info("Connected to rmq.");
            connection.on("error", async (error) => {
                this.logger.error("Connection error : ", error);
                await sleep(1000);
                await this._initialize();
            });
            connection.on("close", async (error) => {
                this.logger.error("Connection close : ", error);
                await sleep(1000);
                await this._initialize();
            });
            // process pubSub handler
            await this._pubQueue(connection);
            await this._subQueue(connection);
            await this._pub(connection);
            await this._sub(connection);
            // add to channels
        } catch (error) {
            this.logger.warn("Failed to connect to rmq.", error);
            await sleep(1000);
            this.logger.info("Attempting to reconnect to rmq.");
            await this._initialize();
        }
    }

    async _pub(connection) {
        if (!this.config.pub) {
            return false;
        }
        // extract config
        const { namespace, pub, pubPayload, serviceName } = this.config;
        // create channel & publish payload
        for (const eventName in pub) {
            const triggerName = pub[eventName];
            const exchangeName = `${namespace}.${serviceName}.${eventName}`;
            // if queue is already used for publication, then skip it
            if (this.publishedQueueList.includes(exchangeName)) {
                continue;
            }
            const content = JSON.stringify(pubPayload);
            const channel = await connection.createChannel();
            await channel.assertExchange(exchangeName, "fanout", { durable: true });
            channel.publish(exchangeName, "", Buffer.from(content), { persistent: true });
            // note that the queue has already been used for publication
            this.publishedQueueList.push(exchangeName);
        }
        return true;
    }

    async _sub(connection) {
        if (!this.config.sub) {
            return false;
        }
        // extract config
        const { namespace, serviceName, sub, subNotification, publisherName } = this.config;
        // create channel & listen to event
        for (const eventName in sub) {
            const callback = sub[eventName];
            const exchangeName = `${namespace}.${publisherName}.${eventName}`;
            const queueName = `${namespace}.${publisherName}.${serviceName}.${eventName}`;
            const channel = await connection.createChannel();
            await channel.assertQueue(queueName, {durable: true});
            await channel.assertExchange(exchangeName, "fanout", {durable: true});
            await channel.bindQueue(queueName, exchangeName, "");
            channel.consume(queueName, (message) => {
                try {
                    const payload = JSON.parse(message.content.toString());
                    callback(payload);
                    channel.ack(message);
                } catch (error) {
                    channel.nack(message);
                }
            });
        }
        // create notification channel & listen to event
        for (const eventName in subNotification) {
            const callback = subNotification[eventName];
            const queueName = `${namespace}.${serviceName}.${eventName}`;
            const channel = await connection.createChannel();
            channel.assertQueue(queueName, {durable: true});
            channel.consume(queueName, (message) => {
                try {
                    const payload = JSON.parse(message.content.toString());
                    callback(payload);
                    channel.ack(message);
                } catch (error) {
                    channel.nack(message);
                }
            });
        }
        return true;
    }

    async _pubQueue(connection) {
        if (!this.config.pubQueue) {
            return false;
        }
        // extract config
        const { namespace, pubQueue, pubPayload } = this.config;
        // create channel & publish payload
        for (const serviceName in pubQueue) {
            const eventList = pubQueue[serviceName];
            for (const eventName of eventList) {
                const queueName = `${namespace}.queue.${serviceName}.${eventName}`;
                // if queue is already used for publication, then skip it
                if (this.publishedQueueList.includes(queueName)) {
                    continue;
                }
                const content = JSON.stringify(pubPayload);
                const channel = await connection.createChannel();
                channel.assertQueue(queueName, {durable: true});
                channel.sendToQueue(queueName, Buffer.from(content), { persistent: true });
                // note that the queue has already been used for publication
                this.publishedQueueList.push(queueName);
            }
        }
        return true;
    }

    async _subQueue(connection) {
        if (!this.config.subQueue) {
            return false;
        }
        // extract config
        const { namespace, serviceName, subQueue } = this.config;
        // create channel & listen to event
        for (const eventName in subQueue) {
            const callback = subQueue[eventName];
            const queueName = `${namespace}.queue.${serviceName}.${eventName}`;
            const channel = await connection.createChannel();
            channel.assertQueue(queueName, {durable: true});
            channel.consume(queueName, (message) => {
                try {
                    const payload = JSON.parse(message.content.toString());
                    callback(payload);
                    channel.ack(message);
                } catch (error) {
                    channel.nack(message);
                }
            });
        }
        return true;
    }

}
module.exports = Rabbit;
