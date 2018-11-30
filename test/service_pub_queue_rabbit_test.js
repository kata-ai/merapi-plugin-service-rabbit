"use strict";

const chai = require("chai");
const expect = chai.expect;
const request = require("supertest");
const amqplib = require("amqplib");
const sleep = require("then-sleep");

const merapi = require("merapi");
const { Component, async } = require("merapi");

/* eslint-env mocha */

describe("Merapi Plugin Service: Queue Publisher", function() {
    let publisherAContainer, publisherBContainer;
    let service = {};
    let connection = {};
    let channel = {};
    let currentIteration = 1;

    beforeEach(async(function*() {
        this.timeout(5000);

        let publisherConfig = {
            name: "publisher",
            version: "1.0.0",
            main: "mainCom",
            secret: "abc123",
            plugins: ["service"],
            service: {
                rabbit: {
                    host: "localhost",
                    port: 5672,
                },
                queue: {
                    publish: {
                        subscriber: {
                            in_queue_publisher_test: "inQueuePublisherTest",
                            out_queue_publisher_test: "outQueuePublisherTest",
                        },
                    },
                },
            },
        };

        publisherConfig.service.port = 5300 + currentIteration;
        publisherAContainer = merapi({
            basepath: __dirname,
            config: publisherConfig,
        });

        publisherAContainer.registerPlugin(
            "service-rabbit",
            require("../index.js")(publisherAContainer)
        );
        publisherAContainer.register(
            "mainCom",
            class MainCom extends Component {
                start() {}
            }
        );
        yield publisherAContainer.start();

        publisherConfig.service.port = 5400 + currentIteration;
        publisherBContainer = merapi({
            basepath: __dirname,
            config: publisherConfig,
        });

        publisherBContainer.registerPlugin(
            "service-rabbit",
            require("../index.js")(publisherBContainer)
        );
        publisherBContainer.register(
            "mainCom",
            class MainCom extends Component {
                start() {}
            }
        );
        yield publisherBContainer.start();

        service = yield publisherAContainer.resolve("service");
        connection = yield amqplib.connect("amqp://localhost");
        channel = yield connection.createChannel();

        yield sleep(100);
    }));

    afterEach(async(function*() {
        yield publisherAContainer.stop();
        yield publisherBContainer.stop();
        yield channel.close();
        yield connection.close();

        currentIteration++;
    }));

    describe("Publisher Queue service", function() {
        describe("info", function() {
            it("should list pub-queue-rabbit", async(function*() {
                yield request(service._express)
                    .get("/info")
                    .expect(function(res) {
                        expect(
                            Object.keys(res.body.modules).some(
                                key => key == "pub-queue-rabbit"
                            )
                        ).to.be.true;
                    });
            }));
        });

        describe("when initializing", function() {
            it("should resolve trigger components", async(function*() {
                let triggerA = yield publisherAContainer.resolve(
                    "inQueuePublisherTest"
                );
                let triggerB = yield publisherAContainer.resolve(
                    "outQueuePublisherTest"
                );
                expect(triggerA).to.not.be.null;
                expect(triggerB).to.not.be.null;
            }));

            it("should create queue", async(function*() {
                const inQueueResult = yield channel.checkQueue("default.queue.subscriber.in_queue_publisher_test");
                const outQueueResult = yield channel.checkQueue("default.queue.subscriber.out_queue_publisher_test");
                expect(inQueueResult.queue).to.equal("default.queue.subscriber.in_queue_publisher_test");
                expect(outQueueResult.queue).to.equal("default.queue.subscriber.out_queue_publisher_test");
            }));
        });

        describe("when publishing event", function() {
            let q, payload, triggerA, triggerB;

            it("should publish event to queue", async(function*() {
                q = yield channel.assertQueue(
                    "default.queue.subscriber.in_queue_publisher_test"
                );

                triggerA = yield publisherAContainer.resolve("inQueuePublisherTest");
                payload = { key: "value" };
                yield triggerA(payload);

                yield channel.consume(q.queue, function(msg) {
                    expect(msg.content.toString()).to.equal(JSON.stringify(payload));
                    channel.ack(msg);
                });
            }));

            it("should publish events to the same queue for same service", async(function*() {
                this.timeout(5000);
                q = yield channel.assertQueue(
                    "default.queue.subscriber.out_queue_publisher_test"
                );

                triggerA = yield publisherAContainer.resolve("outQueuePublisherTest");
                triggerB = yield publisherBContainer.resolve("outQueuePublisherTest");

                for (let i = 0; i < 5; i++) {
                    if (i % 2 == 0) yield triggerA(i);
                    else yield triggerB(i);
                    yield sleep(150);
                }

                let message = [];
                channel.consume(q.queue, function(msg) {
                    message.push(msg.content.toString());
                    channel.ack(msg);
                });

                yield sleep(3000);
                expect(message).to.deep.equal(["0", "1", "2", "3", "4"]);
            }));
        });
    });
});
