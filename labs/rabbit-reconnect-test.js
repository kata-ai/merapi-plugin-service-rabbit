const { execSync } = require("child_process");
const Rabbit = require("../lib/Rabbit.js");
const { rabbitConnection, rabbitUrl, startRabbitCommand, stopRabbitCommand } = require("../test/configuration.js");

async function sleep(delay) {
    return new Promise((resolve, reject) => {
        setTimeout(resolve, delay);
    });
}

async function main() {

    // create subscribers

    const rabbitSubQueue = new Rabbit({
        connection: { connectionString: rabbitUrl },
        serviceName: "beta",
        subQueue: { pesanPizza: (payload) => console.log("Pesan Pizza", payload) },
    });

    const rabbitSub = new Rabbit({
        connection: { connectionString: rabbitUrl },
        serviceName: "beta",
        publisherName: "alpha",
        sub: { pesanBakso: (payload) => console.log("Pesan Bakso", payload) },
    });

    // restart rabbit
    execSync(stopRabbitCommand);
    execSync(startRabbitCommand);

    // create publisher

    const rabbitPubQueue = new Rabbit({
        connection: { connectionString: rabbitUrl },
        serviceName: "alpha",
        pubQueue: { beta: ["pesanPizza"] },
        pubPayload: { qty: 2, topping: "cheese" }
    });

    const rabbitPub = new Rabbit({
        connection: { connectionString: rabbitUrl },
        serviceName: "alpha",
        pub: { pesanBakso: "pesanBaksoTrigger" },
        pubPayload: { qty: 3, saos: "tomat" }
    });

}

main();

