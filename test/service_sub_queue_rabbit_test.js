"use strict";

const chai = require("chai");
const expect = chai.expect;
const request = require("supertest");
const sleep = require("then-sleep");
const amqplib = require("amqplib");

const merapi = require("merapi");
const { async, Component } = require("merapi");

/* eslint-env mocha */

describe("Merapi Plugin Service: Queue Subscriber", function() {
    let publisherContainer, subscriberAContainer, subscriberBContainer;
    let service = {};
    let connection = {};
    let channel = {};
    let messageA = [];
    let messageB = [];
    let currentIteration = 1;

    beforeEach(async(function*() {
        this.timeout(5000);

        let publisherConfig = {
            name: "publisher",
            version: "1.0.0",
            main: "mainCom",
            plugins: ["service"],
            service: {
                rabbit: {
                    host: "localhost",
                    port: 5672,
                },
                queue: {
                    publish: {
                        subscriber: {
                            sub_queue_publisher_test: "inQueuePublisherTest",
                        },
                    },
                },
                port: 5130 + currentIteration,
            },
        };

        let subscriberConfig = {
            name: "subscriber",
            version: "1.0.0",
            main: "mainCom",
            plugins: ["service"],
            service: {
                rabbit: {
                    host: "localhost",
                    port: 5672,
                    prefetch: 1,
                },
                queue: {
                    subscribe: {
                        sub_queue_publisher_test: "mainCom.handleIncomingMessage",
                    },
                },
            },
        };

        publisherContainer = merapi({
            basepath: __dirname,
            config: publisherConfig,
        });

        publisherContainer.registerPlugin(
            "service-rabbit",
            require("../index.js")(publisherContainer)
        );
        publisherContainer.register(
            "mainCom",
            class MainCom extends Component {
                start() {}
            }
        );
        yield publisherContainer.start();

        subscriberConfig.service.port = 5210 + currentIteration;
        subscriberAContainer = merapi({
            basepath: __dirname,
            config: subscriberConfig,
        });

        subscriberAContainer.registerPlugin(
            "service-rabbit",
            require("../index.js")(subscriberAContainer)
        );
        subscriberAContainer.register(
            "mainCom",
            class MainCom extends Component {
                start() {}
                *handleIncomingMessage(payload) {
                    messageA.push(payload);
                }
            }
        );
        yield subscriberAContainer.start();

        subscriberConfig.service.port = 5310 + currentIteration;
        subscriberBContainer = merapi({
            basepath: __dirname,
            config: subscriberConfig,
        });

        subscriberBContainer.registerPlugin(
            "service-rabbit",
            require("../index.js")(subscriberBContainer)
        );
        subscriberBContainer.register(
            "mainCom",
            class MainCom extends Component {
                start() {}
                *handleIncomingMessage(payload) {
                    messageB.push(payload);
                }
            }
        );
        yield subscriberBContainer.start();

        service = yield subscriberAContainer.resolve("service");
        connection = yield amqplib.connect("amqp://localhost");
        channel = yield connection.createChannel();

        yield sleep(100);
    }));

    afterEach(function() {
        subscriberAContainer.stop();
        subscriberBContainer.stop();
        currentIteration++;
    });

    describe("Subscriber service", function() {
        describe("getServiceInfo", function() {
            it("should list sub-queue-rabbit", async(function*() {
                yield request(service._express)
                    .get("/info")
                    .expect(function(res) {
                        expect(
                            Object.keys(res.body.modules).some(
                                key => key == "sub-queue-rabbit"
                            )
                        ).to.be.true;
                    });
            }));
        });

        describe("when initializing", function() {
            it("should resolve handleIncomingMessage", async(function*() {
                expect(
                    (yield subscriberAContainer.resolve("mainCom")).handleIncomingMessage
                ).to.not.be.null;
                expect(
                    (yield subscriberBContainer.resolve("mainCom")).handleIncomingMessage
                ).to.not.be.null;
            }));

            it("should create a queue", function() {
                expect(
                    async(function*() {
                        yield channel.assertQueue(
                            "default.queue.subscriber.sub_queue_publisher_test",
                            { durable: true }
                        );
                    })
                ).to.not.throw(Error);
            });
        });

        describe("when subscribing event", function() {
            it("should distribute accross all subscribers using round robin method", async(function*() {
                let trigger = yield publisherContainer.resolve("inQueuePublisherTest");

                for (let i = 0; i < 5; i++) {
                    yield sleep(100);
                    yield trigger(i);
                }

                yield sleep(1000);
                expect(messageA).to.deep.equal([0, 2, 4]);
                expect(messageB).to.deep.equal([1, 3]);
            }));
        });
    });
});
