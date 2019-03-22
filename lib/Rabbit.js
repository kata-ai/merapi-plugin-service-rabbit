const amqp = require("amqplib");

/*
 * This class support some action defined by configuration:
 * - pubQueue --> publish to a queue
 * - pub --> publish to exchange that will be fanned-out to multiple queue
 * - subQueue --> subscribe to a queue
 * - sub --> subscribe to exchange
 */

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
     * pubPayload?: {},                 // Necessary for: pub + pubQueue
     * pubQueue?: {                     // Necessary for: pubQueue
     *    [serviceName]: string[],      // `eventName`
     * },
     * pub?: {                          // Necessary for: pub
     *    [eventName]: string,          // `triggerName`
     * },
     * subQueue?: {                     // Necessary for: subQueue
     *    [eventName]: (payload) => void,
     * },
     * publisher?: {                    // Necessary for: sub
     *    [registryName: string {
     *        [eventName]: string,
     *    }
     * },
     * sub: {                           // Necessary for: sub
     *    [registryName: string {
     *        [eventName]: (payload) => void,
     *    }
     * },
     * subNotification: {               // Necessary for: sub
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
        this._publishedQueueList = []; // queue name that has been published (to avoid redundant publication)
        this._connection = null;
        this._config = getCompleteConfig(config);
        this._logger = logger;
        this._connectionString = getConnectionString(this._config);
        this._run();
    }

    async publish(config) {
        if (this._connection) {
            delete this._config.pubPayload;
            if ("pub" in config) {
                this._config.pub = config.pub;
            }
            if ("pubQueue" in config) {
                this._config.pubQueue = config.pubQueue;
            }
            if ("pubPayload" in config) {
                this._config.pubPayload = config.pubPayload;
            }
            this._publishedQueueList = [];
            await this._pubQueue(this._connection);
            await this._pub(this._connection);
        } else {
            await sleep(1000);
            await this.publish(config);
        }
    }

    async _run() {
        try {
            // create connection
            this._connection = await amqp.connect(this._connectionString);
            this._logger.info("Connected to rmq.");
            this._connection.on("error", async (error) => {
                this._connection = null;
                this._logger.error("Connection error : ", error);
                await sleep(1000);
                await this._run();
            });
            this._connection.on("close", async (error) => {
                this._connection = null;
                this._logger.error("Connection close : ", error);
                await sleep(1000);
                await this._run();
            });
            // process pubSub handler
            await this._subQueue(this._connection);
            await this._sub(this._connection);
            await this._pubQueue(this._connection);
            await this._pub(this._connection);
            // add to channels
        } catch (error) {
            this._connection = null;
            this._logger.warn("Failed to connect to rmq.", error);
            await sleep(1000);
            this._logger.info("Attempting to reconnect to rmq.");
            await this._run();
        }
    }

    async _pub() {
        // "pubPayLoad" might contains "false" or "null"
        if (!this._config.pub || !this._connection) {
            return false;
        }
        // extract config
        const { namespace, pub, pubPayload, serviceName } = this._config;
        // create channel & publish payload
        for (const eventName in pub) {
            const triggerName = pub[eventName];
            const exchangeName = `${namespace}.${serviceName}.${eventName}`;
            const channel = await this._connection.createChannel();
            await channel.assertExchange(exchangeName, "fanout", { durable: true });
            // if queue is already used for publication, then skip it
            if (this._publishedQueueList.includes(exchangeName)) {
                continue;
            }
            if ("pubPayload" in this._config) {
                const content = JSON.stringify(pubPayload);
                channel.publish(exchangeName, "", Buffer.from(content), { persistent: true });
                // note that the queue has already been used for publication
                this._publishedQueueList.push(exchangeName);
            }
        }
        return true;
    }

    async _sub() {
        if (!this._config.sub || !this._connection) {
            return false;
        }
        // extract config
        const { namespace, serviceName, sub, subNotification, publisher } = this._config;
        // create channel & listen to event
        for (const registryName in sub) {
            for (const eventName in sub[registryName]) {
                const publisherName = registryName in publisher && eventName in publisher[registryName] ? publisher[registryName][eventName] : "publisher";
                const callback = sub[registryName][eventName];
                const exchangeName = `${namespace}.${publisherName}.${eventName}`;
                const queueName = `${namespace}.${publisherName}.${serviceName}.${eventName}`;
                const channel = await this._connection.createChannel();
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
        }
        // create notification channel & listen to event
        for (const eventName in subNotification) {
            const callback = subNotification[eventName];
            const queueName = `${namespace}.${serviceName}.${eventName}`;
            const channel = await this._connection.createChannel();
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

    async _pubQueue() {
        if (!this._config.pubQueue || !this._connection) {
            return false;
        }
        // extract config
        const { namespace, prefetch, pubQueue, pubPayload } = this._config;
        // create channel & publish payload
        for (const serviceName in pubQueue) {
            const eventList = pubQueue[serviceName];
            for (const eventName of eventList) {
                const queueName = `${namespace}.queue.${serviceName}.${eventName}`;
                const channel = await this._connection.createChannel();
                await channel.prefetch(prefetch);
                channel.assertQueue(queueName, {durable: true});
                // if queue is already used for publication, then skip it
                if (this._publishedQueueList.includes(queueName)) {
                    continue;
                }
                if ("pubPayload" in this._config) {
                    const content = JSON.stringify(pubPayload);
                    channel.sendToQueue(queueName, Buffer.from(content), { persistent: true });
                    // note that the queue has already been used for publication
                    this._publishedQueueList.push(queueName);
                }
            }
        }
        return true;
    }

    async _subQueue() {
        if (!this._config.subQueue || !this._connection) {
            return false;
        }
        // extract config
        const { namespace, prefetch, serviceName, subQueue } = this._config;
        // create channel & listen to event
        for (const eventName in subQueue) {
            const callback = subQueue[eventName];
            const queueName = `${namespace}.queue.${serviceName}.${eventName}`;
            const channel = await this._connection.createChannel();
            await channel.prefetch(prefetch);
            channel.assertQueue(queueName, {durable: true});
            channel.consume(queueName, (message) => {
                try {
                    const payload = JSON.parse(message.content.toString());
                    // console.error("RECEIVE", payload);
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
