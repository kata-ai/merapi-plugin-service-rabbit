# Merapi Plugin: Service RabbitMQ

[![Build Status](https://travis-ci.org/kata-ai/merapi-plugin-service-rabbit.svg?branch=master)](https://travis-ci.org/kata-ai/merapi-plugin-service-rabbit)
[![Codacy Badge](https://api.codacy.com/project/badge/Grade/3bb4ada1e0aa452c92d2878dc4cfad33)](https://www.codacy.com/app/kata-ai/merapi-plugin-service-rabbit?utm_source=github.com&amp;utm_medium=referral&amp;utm_content=kata-ai/merapi-plugin-service-rabbit&amp;utm_campaign=Badge_Grade)
[![Codacy Badge](https://api.codacy.com/project/badge/Coverage/3bb4ada1e0aa452c92d2878dc4cfad33)](https://www.codacy.com/app/kata-ai/merapi-plugin-service-rabbit?utm_source=github.com&utm_medium=referral&utm_content=kata-ai/merapi-plugin-service-rabbit&utm_campaign=Badge_Coverage)

## Introduction

This plugin use RabbitMQ for messaging. When subscribing to an event, it will first check if the publisher is RabbitMQ compatible. If so, it will subscribe to that event's queue, otherwise it will create hook that will be called by the publisher.


## Installation

Add plugin to dependency list in `package.json`

```
{
    "name": "application",
    "version": "1.0.0",
    "dependencies": {
        "merapi-plugin-service-rabbit": "^0.2.0"
    }
}
```

## Configuration

### Merapi Application

```
name: application
version: 0.4.0
plugins:
    - service
    - service-rabbit
```

### RabbitMQ

```
service:
    rabbit:
        host: localhost
        port: 5672
        prefetch: 5
        maxAttempts: 5
        retryDelay: 5
        namespace: default
```
`prefetch` - *default to 5*

The maximum number of messages sent to the consumer that can be awaiting acknowledgement; once there are `prefetch` messages outstanding, the server will not send more messages to this consumer until one or more have been acknowledged.

`maxAttempts` - *default to 5*

The maximum number of attempts to get target's info.

`retryDelay` - *default to 5000*

The delay time between attempts in milliseconds.

`namespace` - *default to default*

Kubernetes namespace where the application resides.

### Topic Publisher

```
service:
    publish:
        converse_event: triggerConverseEvent
```

### Topic Subscriber

```
service:
    subscribe:
        kanal-platform:
            incoming_message: conversationManager.handleIncomingMessage
    registry:
        kanal-platform: http://localhost:5000
```

### Queue Publisher

```
service:
    queue:
        publish:
            kanal-platform:
                outgoing_message: publishOutgoingMessage
    registry:
        kanal-platform: http://localhost:5000
```

### Queue Subscriber

```
service:
    queue:
        subscribe:
            dummy_event: dummyManager.handleDummyEvent
```

## Service Info

```
GET /info
```

Result:

```
{
    name: '<name>',
    version: '<version>',
    status: 'ok',
    modules: {
        api: {
            version: '0.2.0',
            status: 'ok'
        },
        pub: {
            version: '0.2.0',
            status: 'ok'
        },
        sub: {
            version: '0.1.0',
            status: 'ok'
        },
        'pub-rabbit': {
            version: '0.1.0',
            status: 'ok'
        }
    },
    api: {},
    events: [
        'incoming_message',
        'outgoing_message'
    ],
    hooks: [
        'yb-core.incoming_message'
    ],
    queues: [
        'publisher.subscriber.incoming_message'
    ],
    exchanges: [
        'publisher.incoming_message',
        'publisher.outgoing_message'
    ]
}
```

## Usage

### Merapi Component

* PUBLISH

```
class MainCom extends component {
    constructor(triggerOutgoingMessage) {
        super();
        this.triggerOutgoingMessage = triggerOutgoingMessage;
    }
    
    *sendMessage(message) {
        this.triggerOutgoingMessage(message);
    }
}
```

* SUBSCRIBE

```
class MainCom extends component {
    *handleIncomingMessage(message) {
        process(message);
    }
}
```

### Non-merapi component

* PUBLISH
    * Create an exchange with this format `<namespace>.<publisher>.<event>`
    * Publish messages to that exchange

* SUBSCRIBE
    * Create a RabbitMQ queue
    * Bind the queue to an exchange (exchange's name: `<namespace>.<publisher>.<event>`)
    * Consume its messages


# TESTING

In case of you are using custom rabbitmq connection, you can provide an env file as follow:

```bash
# filename: ./test/test.env
export RABBIT_HOST=0.0.0.0
export RABBIT_PORT=5672
export RABBIT_USERNAME=root
export RABBIT_PASSWORD=toor
```

and perform:

`source ./test/test.env && npm test`
