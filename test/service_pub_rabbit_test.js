"use strict";

const chai = require("chai");
const expect = chai.expect;
const request = require("supertest");
const amqplib = require("amqplib");
const sleep = require("then-sleep");

const merapi = require("@yesboss/merapi");
const component = require("@yesboss/merapi/component");
const async = require("@yesboss/merapi/async");

/* eslint-env mocha */

describe("Merapi Plugin Service: Publisher", function () {
    let publisherAContainer, publisherBContainer;
    let service = {};
    let connection = {};
    let channel = {};

    before(async(function* () {

        let publisherConfig = {
            name: "publisher",
            version: "1.0.0",
            main: "mainCom",
            secret: "abc123",
            plugins: [
                "service@yesboss"
            ],
            service: {
                "rabbit": {
                    "host": "localhost",
                    "port": 5672
                },
                "publish": {
                    "incoming_message_publisher_test": "triggerIncomingMessagePublisherTest",
                    "outgoing_message_publisher_test": "triggerOutgoingMessagePublisherTest"
                }
            }
        };

        publisherConfig.service.port = 5001;
        publisherAContainer = merapi({
            basepath: __dirname,
            config: publisherConfig
        });

        publisherAContainer.registerPlugin("service-rabbit@yesboss", require("../index.js")(publisherAContainer));
        publisherAContainer.register("mainCom", class MainCom extends component { start() { } });
        publisherAContainer.start();

        publisherConfig.service.port = 5002;
        publisherBContainer = merapi({
            basepath: __dirname,
            config: publisherConfig
        });

        publisherBContainer.registerPlugin("service-rabbit@yesboss", require("../index.js")(publisherBContainer));
        publisherBContainer.register("mainCom", class MainCom extends component { start() { } });
        publisherBContainer.start();

        this.timeout(5000);

        service = yield publisherAContainer.resolve("service");
        connection = yield amqplib.connect("amqp://localhost");
        channel = yield connection.createChannel();
    }));

    after(function () {
        publisherAContainer.stop();
    });

    describe("Publisher service", function () {

        describe("info", function () {
            it("should list pub-rabbit", async(function* () {
                yield request(service._express)
                    .get("/info")
                    .expect(function (res) {
                        expect(Object.keys(res.body.modules).some(key => key == "pub-rabbit")).to.be.true;
                    });
            }));
        });

        describe("when initializing", function () {
            it("should resolve triggerIncomingMessagePublisherTest", async(function* () {
                let trigger = yield publisherAContainer.resolve("triggerIncomingMessagePublisherTest");
                expect(trigger).to.not.be.null;
            }));

            it("should save event list", function () {
                let servicePubRabbit = service.getModule("pub-rabbit");
                let expectedPubRabbit = ["incoming_message_publisher_test", "outgoing_message_publisher_test"];
                expect(servicePubRabbit.getEventList()).to.deep.equal(expectedPubRabbit);
            });

            it("should create exchanges", function () {
                expect(async(function* () {
                    yield channel.checkExchange("publisher.incoming_message_publisher_test");
                    yield channel.checkExchange("publisher.outgoing_message_publisher_test");
                })).to.not.throw(Error);
            });
        });

        describe("when publishing event", function () {
            let q, exchangeName, payload, triggerA, triggerB;

            it("should publish event to exchange", async(function* () {
                q = yield channel.assertQueue("queue1");
                payload = { key: "value" };
                triggerA = yield publisherAContainer.resolve("triggerIncomingMessagePublisherTest");
                exchangeName = "publisher.incoming_message_publisher_test";
                yield triggerA(payload);

                yield channel.bindQueue(q.queue, exchangeName, "");
                channel.consume(q.queue, function (msg) {
                    expect(msg.content.toString()).to.equal(JSON.stringify(payload));
                    channel.ack(msg);
                });
            }));

            it("should publish events to the same exchange for same service", async(function* () {
                q = yield channel.assertQueue("queue2");
                triggerA = yield publisherAContainer.resolve("triggerOutgoingMessagePublisherTest");
                triggerB = yield publisherBContainer.resolve("triggerOutgoingMessagePublisherTest");
                exchangeName = "publisher.outgoing_message_publisher_test";

                for (let i = 0; i < 5; i++) {
                    if (i % 2 == 0) yield triggerA(i); else yield triggerB(i);
                    yield sleep(50);
                }

                let message = [];
                yield channel.bindQueue(q.queue, exchangeName, "");
                channel.consume(q.queue, function (msg) {
                    message.push(msg.content.toString());
                    channel.ack(msg);
                });

                yield sleep(50);
                expect(message).to.deep.equal(["0", "1", "2", "3", "4"]);
            }));
        });
    });

});




