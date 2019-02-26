const { execSync } = require("child_process");
const amqp = require("amqplib");

async function sleep(delay) {
    return new Promise((resolve, reject) => {
        setTimeout(resolve, delay);
    });
}

async function createChannel(config) {
    const { url, publishers, listeners } = Object.assign({url: "", publishers: {}, listeners: {}}, config);
    try {
        // create connection
        const connection = await amqp.connect(url);
        let channel = null;
        connection._channels = [];
        connection.on("error", (error) => {
            console.error("Connection error : ", config, error);
        });
        connection.on("close", async (error) => {
            if (channel) {
                channel.close();
            }
            console.error("Connection close : ", config, error);
            await sleep(1000);
            createChannel(config);
        });
        // create channel
        channel = await connection.createConfirmChannel();
        channel.on("error", (error) => {
            console.error("Channel error : ", config, error);
        });
        channel.on("close", (error) => {
            console.error("Channel close : ", config, error);
        });
        // register listeners
        for (queue in listeners) {
            const callback = listeners[queue];
            channel.assertQueue(queue, { durable: false });
            channel.consume(queue, callback);
        }
        // publish
        for (queue in publishers) {
            const message = publishers[queue];
            channel.assertQueue(queue, { durable: false });
            channel.sendToQueue(queue, message);
        }
        return channel;
    } catch (error) {
        console.error("Create connection error : ", error);
        await sleep(1000);
        createChannel(config);
    }
}

async function main() {
    const channelPublish = await createChannel({
        url: "amqp://root:toor@0.0.0.0:5672",
        publishers: {
            "queue": Buffer.from("hello"),
        }
    });

    execSync("docker stop rabbitmq");
    execSync("docker start rabbitmq");

    const channelConsume = await createChannel({
        url: "amqp://root:toor@0.0.0.0:5672",
        listeners: {
            "queue": (message) => {
                console.log("Receive message ", message.content.toString());
            },
        }
    });

    return true;
}

main().catch((error) => console.error(error));
