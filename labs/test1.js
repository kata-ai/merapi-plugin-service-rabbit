const q = 'tasks';

const { execSync } = require("child_process");
const amqplib = require("amqplib");

async function createConnection() {
    const id = Math.round(Math.random() * 1000);
    console.log(`* connect ${id}`);
    const pconn = amqplib.connect("amqp://root:toor@0.0.0.0:5672/").then((conn) => {
        conn.on("close", (error) => {
            console.log(`* connection closed ${id}:`, error);
        });
        conn.on("error", (error) => {
            console.log(`* connection error ${id}:`, error);
        });
        return conn;
    });
    console.log(`* connected ${id}`);
    return pconn;
}

async function createChannel(conn) {
    const id = Math.round(Math.random() * 1000);
    console.log(`* create channel ${id}`);
    const channel = conn.createChannel({durable: false});
    console.log(`* channel created ${id}`);
    return channel;
}

async function createConnectionAndChannel() {
    const conn = await createConnection();
    const channel = await createChannel(conn);
    return channel;
}

async function main(channels) {

    if (!channels) {
        channels = await Promise.all([createConnectionAndChannel(), createConnectionAndChannel()]);
    }
    const [publisherChannel, consumerChannel] = channels;

    // publisher
    console.log("publish");
    await publisherChannel.assertQueue(q).then(function(ok) {
        console.log("published");
        return publisherChannel.sendToQueue(q, Buffer.from("something to do"));
    });

    // consumer
    console.log("consume");
    await consumerChannel.assertQueue(q).then(function(ok) {
        console.log("consumed");
        return consumerChannel.consume(q, function(msg) {
            if (msg !== null) {
                console.log(msg.content.toString());
                consumerChannel.ack(msg);
            }
        });
    });

    await new Promise((resolve, reject) => {
        setTimeout(resolve, 1000);
    });

    await main(channels);
}

main();
