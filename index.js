"use strict";

module.exports = function () {
    return {
        dependencies: [
            "service@yesboss"
        ],
        *onBeforeComponentsRegister(container) {
            container.register("servicePubRabbit", require("./lib/service_pub_rabbit"));
            container.register("serviceSub", require("./lib/service_sub_rabbit"));
        },
        *onInit(container) {
            let service = yield container.resolve("service");
            let servicePubRabbit = yield container.resolve("servicePubRabbit");

            service.addModule("pubRabbit", servicePubRabbit);
        }
    };
};