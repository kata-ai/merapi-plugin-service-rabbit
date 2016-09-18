"use strict";

const chai = require("chai");
const expect = chai.expect;
const request = require("supertest");
const sleep = require("then-sleep");
const amqplib = require("amqplib");

const merapi = require("@yesboss/merapi");
const component = require("@yesboss/merapi/component");
const async = require("@yesboss/merapi/async");

/* eslint-env mocha */

describe("Merapi Plugin Service: Subscriber", function () {
    let container = {};
    let service = {};
    let serviceSubRabbit = {};
    let connection = {};
    let channel = {};

    before(async(function* () {

        container = merapi({
            basepath: __dirname,
            config: {
                name: "subscriber",
                version: "1.0.0",
                main: "mainCom",
                plugins: [
                    "service@yesboss"
                ],
                service: {
                    "rabbit": {
                        "host": "localhost",
                        "port": 5672
                    },
                    "subscribe": {
                        "yb-core": {
                            "incoming_message": "mainCom.handleIncomingMessage"
                        }
                    },
                    "registry": {
                        "yb-core": "http://localhost:5000"
                    },
                    "notify_interval": 10,
                    "port": 5002
                }
            }
        });

        container.registerPlugin("service-rabbit@yesboss", require("../index.js")(container));
        container.register("mainCom", class MainCom extends component {
            start() { }
            handleIncomingMessage() { }
        });

        container.start();

        this.timeout(5000);

        service = yield container.resolve("service");
        serviceSubRabbit = yield container.resolve("serviceSubRabbit");
        
        connection = yield amqplib.connect("amqp://localhost");
        channel = yield connection.createChannel();
        
        yield sleep(100);
    }));

    after(function () {
        container.stop();
    });

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
            it("should create a queue", async(function* () {
                expect(async(function* () {
                    channel.assertQueue("publisher.subscriber.incoming_message");
                })).to.not.throw(Error);
            }));

            it("should save queue list", async(function* () {
                expect(serviceSubRabbit._queues).to.include("publisher.subscriber.incoming_message");
            }));
        });

    });

});




