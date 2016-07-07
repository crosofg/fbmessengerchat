/**
 * Created by gaurav on 08-07-2016.
 */
//heroku logs --source app -t

'use strict';

const
    bodyParser = require('body-parser'),
    config = require('config'),
    crypto = require('crypto'),
    express = require('express'),
    https = require('https'),
    request = require('request'),
    wiki = require("wtf_wikipedia")

var app = express();

app.set('port', process.env.PORT || 5000);
app.use(bodyParser.json({verify: verifyRequestSignature}));
app.use(express.static('public'));

const APP_SECRET = config.get('appSecret');
const VALIDATION_TOKEN = config.get('validationToken');
const PAGE_ACCESS_TOKEN = config.get('pageAccessToken');

if (!(APP_SECRET && VALIDATION_TOKEN && PAGE_ACCESS_TOKEN)) {
    console.error("Missing config values");
    process.exit(1);
}


app.get('/webhook', function (req, res) {
    if (req.query['hub.mode'] === 'subscribe' &&
        req.query['hub.verify_token'] === VALIDATION_TOKEN) {
        console.log("Validating webhook");
        res.status(200).send(req.query['hub.challenge']);
    } else {
        console.error("Failed validation. Make sure the validation tokens match.");
        res.sendStatus(403);
    }
});


//callbacks from messenger are posted here
app.post('/webhook', function (req, res) {
    var data = req.body;

    // Make sure this is a page subscription
    if (data.object == 'page') {
        // Iterate over each entry
        // There may be multiple if batched
        data.entry.forEach(function (pageEntry) {
            var pageID = pageEntry.id;
            var timeOfEvent = pageEntry.time;

            // Iterate over each messaging event
            pageEntry.messaging.forEach(function (messagingEvent) {
                if (messagingEvent.message) {
                    receivedMessage(messagingEvent);
                } else if (messagingEvent.postback) {
                    receivedPostback(messagingEvent);
                } else {
                    console.log("Webhook received unknown messagingEvent: ", messagingEvent);
                }
            });
        });

        // Assume all went well.
        //
        // You must send back a 200, within 20 seconds, to let us know you've
        // successfully received the callback. Otherwise, the request will time out.
        res.sendStatus(200);
    }
});

//verify that callbacks came from facebook
//https://developers.facebook.com/docs/messenger-platform/webhook-reference#security
function verifyRequestSignature(req, res, buf) {
    var signature = req.headers["x-hub-signature"];

    if (!signature) {
        // For testing, let's log an error. In production, you should throw an
        // error.
        console.error("Couldn't validate the signature.");
    } else {
        var elements = signature.split('=');
        var method = elements[0];
        var signatureHash = elements[1];

        var expectedHash = crypto.createHmac('sha1', APP_SECRET)
            .update(buf)
            .digest('hex');

        if (signatureHash != expectedHash) {
            throw new Error("Couldn't validate the request signature.");
        }
    }
}


//Messaging Event--Called when the page receives any text message
function receivedMessage(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var timeOfMessage = event.timestamp;
    var message = event.message;

    console.log("Received message for user %d and page %d at %d with message:",
        senderID, recipientID, timeOfMessage);
    console.log(JSON.stringify(message));

    var messageId = message.mid;

    // You may get a text or attachment but not both
    var messageText = message.text;
    var messageAttachments = message.attachments;


    if (messageText) {
        //sendTextMessage(senderID, "Good Luck");
        wiki.from_api(messageText.toLowerCase().split(" ")[0], "en", function (markup) {
            var str = (wiki.plaintext(markup))
            //console.log("Result received " + str)
            var sendTxt = "";
            if (str != "") {
                var result = str.match(/[^\.!\?]+[\.!\?]+/g)
                sendTxt = result[0]
                console.log("Result received " + sendTxt)
            } else {
                sendTxt = "Not Today :)"
            }
            sendTextMessage(senderID, sendTxt);
        });

    } else if (messageAttachments) {
        sendTextMessage(senderID, "Message with attachment received");
    }
}


function receivedPostback(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var timeOfPostback = event.timestamp;

    // The 'payload' param is a developer-defined field which is set in a postback
    // button for Structured Messages.
    var payload = event.postback.payload;

    console.log("Inside receivePostback", payload);
    if (payload == "example") {
        sendTextMessage(senderID, "Type a word to get its short meaning");
        sendTextMessage(senderID, "Type cat");
    }else if (payload=="start"){
        sendTextMessage(senderID, "Lets get Started");
        sendTextMessage(senderID, "Type a word to get its meaning");
    }
}


/*
 * Send a text message using the Send API.
 *
 */
function sendTextMessage(recipientId, messageText) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            text: messageText
        }
    };

    callSendAPI(messageData);
}


function callSendAPI(messageData) {
    request({
        uri: 'https://graph.facebook.com/v2.6/me/messages',
        qs: {access_token: PAGE_ACCESS_TOKEN},
        method: 'POST',
        json: messageData

    }, function (error, response, body) {
        //if (!error && response.statusCode == 200) {
        if (!error) {
            var recipientId = body.recipient_id;
            var messageId = body.message_id;

            console.log("Successfully sent generic message with id %s to recipient %s",
                messageId, recipientId);
        } else {
            console.error("Unable to send message.");
            //console.error(response);
            console.log(response.statusCode)
            console.error(error);
        }
    });
}


function callThreadSettings(messageData) {
    request({
        uri: 'https://graph.facebook.com/v2.6/me/thread_settings',
        qs: {access_token: PAGE_ACCESS_TOKEN},
        method: 'POST',
        json: messageData

    }, function (error, response, body) {
        //if (!error && response.statusCode == 200) {
        if (!error) {

            console.log("Successfully set the persistent Menu");
        } else {
            console.error("Unable to send message.");
            //console.error(response);
            console.log(response.statusCode)
            console.error(error);
        }
    });
}


function callQuickReply(senderID, messageData) {
    request({
        uri: 'https://graph.intern.facebook.com/v2.6/me/messages',
        qs: {access_token: PAGE_ACCESS_TOKEN},
        method: 'POST',
        json: {
            recipient: {id: senderID},
            message: messageData
        }

    }, function (error, response, body) {
        //if (!error && response.statusCode == 200) {
        if (!error) {

            console.log("Successfully set the persistent Menu");
        } else {
            console.error("Unable to send message.");
            //console.error(response);
            console.log(response.statusCode)
            console.error(error);
        }
    });
}


var persistentMenuObj = {
    setting_type: "call_to_actions",
    thread_state: "existing_thread",
    call_to_actions: [
        {
            type: "postback",
            title: "Start",
            payload: "start"
        },
        {
            type: "postback",
            title: "Example",
            payload: "example"
        }

    ]
}

callThreadSettings(persistentMenuObj);


app.listen(app.get('port'), function () {
    console.log('Node app is running on port', app.get('port'));
});