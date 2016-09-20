"use strict";

const chai = require("chai");
const expect = chai.expect;
const request = require("supertest");
const amqplib = require("amqplib");

const merapi = require("@yesboss/merapi");
const component = require("@yesboss/merapi/component");
const async = require("@yesboss/merapi/async");

/* eslint-env mocha */

describe("Merapi Plugin Service: Publisher", function () {
    let container = {};
    let service = {};
    let connection = {};
    let channel = {};

    before(async(function* () {
        container = merapi({
            basepath: __dirname,
            config: {
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
                        "message_incoming": "triggerMessageIncoming",
                        "message_outgoing": "triggerMessageOutgoing"
                    },
                    "port": 5000
                }
            }
        });

        container.registerPlugin("service-rabbit@yesboss", require("../index.js")(container));
        container.register("mainCom", class MainCom extends component {
            start() { }
        });

        container.start();
        this.timeout(5000);

        service = yield container.resolve("service");
        connection = yield amqplib.connect("amqp://localhost");
        channel = yield connection.createChannel();
    }));

    after(function () {
        container.stop();
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
            it("should resolve triggerMessageIncoming", async(function* () {
                let trigger = yield container.resolve("triggerMessageIncoming");
                expect(trigger).to.not.be.null;
            }));

            it("should save event list", function () {
                let servicePubRabbit = service.getModule("pub-rabbit");
                let expectedPubRabbit = ["message_incoming", "message_outgoing"];
                expect(servicePubRabbit.getEventList()).to.deep.equal(expectedPubRabbit);
            });

            it("should create exchanges", function () {
                expect(async(function* () {
                    yield channel.checkExchange("publisher.message_incoming");
                    yield channel.checkExchange("publisher.message_outgoing");
                })).to.not.throw(Error);
            });
        });

        describe("when publishing event", function () {
            it("should publish event to exchange", async(function* () {
                let q = yield channel.assertQueue("queue");
                let event = "message_incoming";
                let exchangeName = "publisher." + event;
                let payload = { key: "value" };
                let trigger = yield container.resolve("triggerMessageIncoming");

                yield channel.bindQueue(q.queue, exchangeName, "");
                yield trigger(payload);
                yield channel.consume(q.queue, function (msg) {
                    expect(msg.content.toString()).to.equal(JSON.stringify(payload));
                });
            }));
        });
    });

});




