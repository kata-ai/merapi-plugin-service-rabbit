"use strict";

module.exports = function () {
    return {
        dependencies: [
            "service"
        ],
        *onBeforeComponentsRegister(container) {
            container.register("servicePubRabbit", require("./lib/service_pub_rabbit"));
            container.register("serviceSubRabbit", require("./lib/service_sub_rabbit"));
            container.alias("serviceSub", "serviceSubRabbit");

            container.register("servicePubQueueRabbit", require("./lib/service_pub_queue_rabbit"));
            container.register("serviceSubQueueRabbit", require("./lib/service_sub_queue_rabbit"));
            container.alias("serviceSubQueue", "serviceSubQueueRabbit");

            container.register("amqp", require("./lib/service_amqp"));
        },
        *onInit(container) {
            let service = yield container.resolve("service");

            let servicePubRabbit = yield container.resolve("servicePubRabbit");
            let serviceSubRabbit = yield container.resolve("serviceSubRabbit");
            service.addModule("pub-rabbit", servicePubRabbit);
            service.addModule("sub-rabbit", serviceSubRabbit);

            let servicePubQueueRabbit = yield container.resolve("servicePubQueueRabbit");
            let serviceSubQueueRabbit = yield container.resolve("serviceSubQueueRabbit");
            service.addModule("pub-queue-rabbit", servicePubQueueRabbit);
            service.addModule("sub-queue-rabbit", serviceSubQueueRabbit);
        },
     
        *onStop(container) {
            let service = yield container.resolve("amqp");
            yield service.stop();
        }
    };
};
