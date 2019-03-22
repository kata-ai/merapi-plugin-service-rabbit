const { execSync } = require("child_process");
const Rabbit = require("../lib/Rabbit.js");
const { rabbitConnection, rabbitUrl, startRabbitCommand, stopRabbitCommand } = require("../test/configuration.js");

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
        publisher: {
            someRegistryName : {
                pesanBakso: "alpha"
            }
        },
        sub: { 
            someRegistryName: {
                pesanBakso: (payload) => console.log("Pesan Bakso", payload) 
            },
        },
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

    // re use rabbitPub
    rabbitPub.publish({ pubPayload: {qty: 2, saos: "sambal"}});

    // only create publisher without publish
    const anotherRabbitPub = new Rabbit({
        connection: { connectionString: rabbitUrl },
        serviceName: "alpha",
        pub: { pesanBakso: "pesanBaksoTrigger" },
    });

    anotherRabbitPub.publish({pubPayload: {qty: 1, saos: "kecap"}});

}

main();

