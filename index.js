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

            container.register("servicePubQueueRabbit", require("./lib/service_pub_queue_rabbit"));
            container.register("serviceSuQueuebRabbit", require("./lib/service_sub_queue_rabbit"));
            container.alias("servicePubQueue", "servicePubQueueRabbit");

            container.register("amqp", require("./lib/service_amqp"));
        },
        *onInit(container) {
            let service = yield container.resolve("service");

            let servicePubRabbit = yield container.resolve("servicePubRabbit");
            service.addModule("pub-rabbit", servicePubRabbit);

            let serviceSubQueueRabbit = yield container.resolve("serviceSubQueueRabbit");
            service.addModule("sub-queue-rabbit", serviceSubQueueRabbit);
        }
    };
};