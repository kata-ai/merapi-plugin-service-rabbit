# Merapi Plugin: Service RabbitMQ

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

### Service Publisher

```
name: publisher
version: 1.0.0
plugins:
    - service
    - service-rabbit
service:
    rabbit:
        host: localhost
        port: 5672
    publish:
        converse_event:
            broker:
                - kafka
                - rabbit
            component: triggerConverseEvent
```

### Service Subscriber

```
name: publisher
version: 1.0.0
plugins:
    - service
    - service-rabbit
service:
    rabbit:
        host: localhost
        port: 5672
    subscribe:
        kanal-platform:
            incoming_message:
                broker: rabbit
                method: conversationManager.handleIncomingMessage
    registry:
        kanal-platform: http://localhost:5000
```

`consumerPrefetch` - *default to 5*
The maximum number of messages sent to the consumer that can be awaiting acknowledgement; once there are `<consumerPrefetch>` messages outstanding, the server will not send more messages to this consumer until one or more have been acknowledged.

`maxAttempts` - *default to 5*
The maximum number of request attempts.

`retryDelay` - *default to 5000*
The delay time between retries in milliseconds.

### Queue Publisher

```
name: publisher
version: 1.0.0
plugins:
    - service
    - service-rabbit
service:
    rabbit:
        host: localhost
        port: 5672
    queue:
        publish:
            kanal-platform:
                outgoing_message: publishOutgoingMessage
    registry:
        kanal-platform: http://localhost:5000
```

### Queue Subscriber

```
name: publisher
version: 1.0.0
plugins:
    - service
    - service-rabbit
service:
    rabbit:
        host: localhost
        port: 5672
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

### non merapi component

* PUBLISH
    * Create an exchange with this format `<publisher>.<event>`
    * Publish messages to that exchange

* SUBSCRIBE
    * Create a RabbitMQ queue
    * Bind the queue to an exchange (exchange's name: `<publisher>.<event>`)
    * Consume its messages
