"use strict";

module.exports = function () {
    return {
        dependencies: [
            "service@yesboss"
        ],
        *onBeforeComponentsRegister(container) {
            container.register("servicePubRabbit", require("./lib/service_pub_rabbit"));
            container.register("serviceSubRabbit", require("./lib/service_sub_rabbit"));
            container.alias("serviceSub", "serviceSubRabbit");
            
            container.register("amqp", require("./lib/service_amqp"));
        },
        *onInit(container) {
            let service = yield container.resolve("service");
            let servicePubRabbit = yield container.resolve("servicePubRabbit");

            service.addModule("pub-rabbit", servicePubRabbit);
        }
    };
};