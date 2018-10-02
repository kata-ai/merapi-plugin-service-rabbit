"use strict";

const chai = require("chai");
const chaiAsPromised = require('chai-as-promised');
const expect = chai.expect;
const amqplib = require("amqplib");
const assert = require("assert")

chai.use(chaiAsPromised);

/* eslint-env mocha */

function throwNextTick(error) {
    process.nextTick(function () {
        throw error
    })
}

describe("Test", () => {

    it("test 1", async() => {
        const expectedError = "Operation failed: QueueDeclare; 406 (PRECONDITION-FAILED) with message \"PRECONDITION_FAILED - inequivalent arg 'x-expires' for queue 'test' in vhost '/': received the value '100' of type 'byte' but current is none\"";
            const connection = await amqplib.connect("amqp://localhost");
            const channel = await connection.createChannel();
            try {
                const asd = await channel.assertQueue("test", { expires: 100 });
            } catch (e) {
                console.error(e);


            }
            // expect(asd).to.be.rejectedWith(Error, expectedError);
    })

});
