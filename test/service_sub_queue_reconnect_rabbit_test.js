"use strict";

const chai = require("chai");
const expect = chai.expect;
const request = require("supertest");
const sleep = require("then-sleep");
const amqplib = require("amqplib");

const merapi = require("merapi");
const { async, Component } = require("merapi");

const { rabbitConnection, rabbitUrl } = require("./configuration.js");

/* eslint-env mocha */

describe("Merapi Plugin Service: Queue Subscriber", function() {
    let publisherContainer, subscriberAContainer, subscriberBContainer;
    let service = {};
    let connection = {};
    let channel = {};
    let messageA = [];

    beforeEach(async(function*() {
        this.timeout(5000);

        let publisherConfig = {
            name: "publisher",
            version: "1.0.0",
            main: "mainCom",
            plugins: ["service"],
            service: {
                rabbit: rabbitConnection,
                queue: {
                    publish: {
                        subscriber: {
                            sub_queue_reconnect_publisher_test: "inQueuePublisherTest",
                        },
                    },
                },
                port: 5135,
            },
        };

        let subscriberConfig = {
            name: "subscriber",
            version: "1.0.0",
            main: "mainCom",
            plugins: ["service"],
            service: {
                rabbit: rabbitConnection,
                queue: {
                    subscribe: {
                        sub_queue_reconnect_publisher_test: "mainCom.handleIncomingMessage",
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

        subscriberConfig.service.port = 5212;
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

        service = yield subscriberAContainer.resolve("service");
        connection = yield amqplib.connect(rabbitUrl);
        channel = yield connection.createChannel();

        yield sleep(100);
    }));

    afterEach(async(function*() {
        yield subscriberAContainer.stop();
        yield channel.close();
        yield connection.close();
    }));

    describe("Subscriber service", function() {

        describe("when subscribing event", function() {
            it("published event should be caught", async(function*() {
                this.timeout(5000);
                let trigger = yield publisherContainer.resolve("inQueuePublisherTest");

                // send "0"
                yield sleep(100);
                yield trigger(0);
                yield sleep(1000);
                // messageA should be [0]
                expect(messageA).to.deep.equal([0]);

                // emulate broken connection
                yield channel.close();
                yield connection.close();
                // reconnect
                connection = yield amqplib.connect(rabbitUrl);
                channel = yield connection.createChannel();

                // send "1"
                yield sleep(100);
                yield trigger(1);
                yield sleep(1000);
                // messageA should be [1]
                expect(messageA).to.deep.equal([0, 1]);

            }));
        });

    });
});
