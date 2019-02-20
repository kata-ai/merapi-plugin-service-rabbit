const amqp = require('amqp-connection-manager');

const QUEUE_NAME = 'amqp-connection-manager-sample2'
const EXCHANGE_NAME = 'amqp-connection-manager-sample2-ex';

// Create a connetion manager
const connection = amqp.connect(["amqp://root:toor@0.0.0.0:5672/"], {json: true});
connection.on('connect', () => console.log('Connected!'));
connection.on('disconnect', params => console.log('Disconnected.', params.err.stack));

// Create a channel wrapper
const channelWrapper = connection.createChannel({
    json: true,
    setup: channel => channel.assertExchange(EXCHANGE_NAME, 'topic')
});

// Send messages until someone hits CTRL-C or something goes wrong...
function sendMessage() {
    const msg = {time: Date.now()};
    channelWrapper.publish(EXCHANGE_NAME, "test", msg, { contentType: 'application/json', persistent: true })
    .then(function() {
        console.log("Message sent", msg);
    })
    .then(() => {
        return new Promise((resolve, reject) => {
            setTimeout(() => resolve(), 1000);
        });
    })
    .then(() => sendMessage())
    .catch(err => {
        console.log("Message was rejected:", err.stack);
        channelWrapper.close();
        connection.close();
    });
};

console.log("Sending messages...");
sendMessage();
