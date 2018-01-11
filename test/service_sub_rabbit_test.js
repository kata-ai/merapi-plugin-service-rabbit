"use strict";

const chai = require("chai");
const expect = chai.expect;
const request = require("supertest");
const sleep = require("then-sleep");
const amqplib = require("amqplib");
const chaiAsPromised = require("chai-as-promised");

const merapi = require("merapi");
const { async, Component } = require("merapi");

chai.use(chaiAsPromised);

/* eslint-env mocha */

describe("Merapi Plugin Service: Subscriber", function () {
    let publisherContainer, subscriberAContainer, subscriberBContainer;
    let service = {};
    let serviceSubRabbit = {};
    let connection = {};
    let channel = {};
    let messageA = [];
    let messageB = [];
    let currentIteration = 1;

    beforeEach(async(function* () {

        this.timeout(5000);

        let publisherConfig = {
            name: "publisher",
            version: "1.0.0",
            main: "mainCom",
            plugins: [
                "service"
            ],
            service: {
                "rabbit": {
                    "host": "localhost",
                    "port": 5672,
                    "expireTime": 1000 * 30,
                },
                "publish": {
                    "incoming_message_subscriber_test": "triggerIncomingMessageSubscriberTest"
                },
                "port": 5030 + currentIteration
            }
        };

        let subscriberConfig = {
            name: "subscriber",
            version: "1.0.0",
            main: "mainCom",
            plugins: [
                "service"
            ],
            service: {
                "rabbit": {
                    "host": "localhost",
                    "port": 5672,
                    "consumerPrefetch": 1,
                    "maxAttemtps": 5,
                    "retryDelay": 50,
                    "expireTime": 1000 * 30,
                },
                "subscribe": {
                    "yb-core": {
                        "incoming_message_subscriber_test": "mainCom.handleIncomingMessage"
                    }
                },
                "registry": {
                    "yb-core": `http://localhost:${5030 + currentIteration}`
                }
            }
        };

        publisherContainer = merapi({
            basepath: __dirname,
            config: publisherConfig
        });

        publisherContainer.registerPlugin("service-rabbit", require("../index.js")(publisherContainer));
        publisherContainer.register("mainCom", class MainCom extends Component {
            start() { }
        });
        yield publisherContainer.start();

        subscriberConfig.service.port = 5010;
        subscriberAContainer = merapi({
            basepath: __dirname,
            config: subscriberConfig
        });

        subscriberAContainer.registerPlugin("service-rabbit", require("../index.js")(subscriberAContainer));
        subscriberAContainer.register("mainCom", class MainCom extends Component {
            start() { }
            *handleIncomingMessage(payload) { messageA.push(payload); }
        });
        yield subscriberAContainer.start();

        subscriberConfig.service.port = 5011;
        subscriberBContainer = merapi({
            basepath: __dirname,
            config: subscriberConfig
        });

        subscriberBContainer.registerPlugin("service-rabbit", require("../index.js")(subscriberBContainer));
        subscriberBContainer.register("mainCom", class MainCom extends Component {
            start() { }
            *handleIncomingMessage(payload) { messageB.push(payload); }
        });
        yield subscriberBContainer.start();


        service = yield subscriberAContainer.resolve("service");
        serviceSubRabbit = yield subscriberAContainer.resolve("serviceSubRabbit");
        connection = yield amqplib.connect("amqp://localhost");
        channel = yield connection.createChannel();

        yield sleep(100);
    }));

    afterEach(async(function* () {
        yield subscriberAContainer.stop();
        yield subscriberBContainer.stop();
        yield channel.close();
        yield connection.close();

        currentIteration++;
    }));

    describe("Subscriber service", function () {
        describe("getServiceInfo", function () {
            it("should list pub-rabbit", async(function* () {
                yield request(service._express)
                    .get("/info")
                    .expect(function (res) {
                        expect(Object.keys(res.body.modules).some(key => key == "pub-rabbit")).to.be.true;
                    });
            }));
        });

        describe("when initializing", function () {
            it("should resolve handleIncomingMessage", async(function* () {
                expect((yield subscriberAContainer.resolve("mainCom")).handleIncomingMessage).to.not.be.null;
                expect((yield subscriberBContainer.resolve("mainCom")).handleIncomingMessage).to.not.be.null;
            }));

            it("should create a queue", function () {
                expect(async(function* () {
                    yield channel.assertQueue("default.publisher.subscriber.incoming_message_subscriber_test");
                })).to.not.throw(Error);
            });

            it("should save queue list", function () {
                expect(serviceSubRabbit._queues).to.include("default.publisher.subscriber.incoming_message_subscriber_test");
            });
        });

        describe("when subscribing event", function () {
            it("should distribute accross all subscribers using round robin method", async(function* () {
                let trigger = yield publisherContainer.resolve("triggerIncomingMessageSubscriberTest");

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
