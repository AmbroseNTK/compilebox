/*
        *File: app.js
        *Author: Asad Memon / Osman Ali Mian / Nguyen Tuan Kiet
        *Last Modified: 5th June 2014
        *Revised on: 30th June 2014 (Introduced Express-Brute for Bruteforce protection)
*/




var express = require('express');
var http = require('http');
var https = require('https');
var arr = require('./compilers');
var sandBox = require('./DockerSandbox');
var bodyParser = require('body-parser');
var firebaseApp = require('./firebase');
var app = express();
var server = http.createServer(app);
var fs = require('fs');

var port = 8889;

const privateKey = fs.readFileSync('/etc/letsencrypt/live/pm.itsstraining.edu.vn/privkey.pem', 'utf8');
const certificate = fs.readFileSync('/etc/letsencrypt/live/pm.itsstraining.edu.vn/cert.pem', 'utf8');
const ca = fs.readFileSync('/etc/letsencrypt/live/pm.itsstraining.edu.vn/chain.pem', 'utf8');

const credentials = {
    key: privateKey,
    cert: certificate,
    ca: ca
};

var httpsServer = https.createServer(credentials, app);

var ExpressBrute = require('express-brute');
var store = new ExpressBrute.MemoryStore(); // stores state locally, don't use this in production
var bruteforce = new ExpressBrute(store, {
    freeRetries: 50,
    lifetime: 3600
});

var firebase = new firebaseApp();

//app.use(express.static(__dirname));
app.use(express.static(__dirname, { dotfiles: 'allow' }));
app.use(bodyParser());

app.all('*', function (req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'PUT, GET, POST, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');

    next();
});

function random(size) {
    //returns a crypto-safe random
    return require("crypto").randomBytes(size).toString('hex');
}

function compile(obj) {
    var language = obj.language;
    var code = obj.code;
    var stdin = obj.stdin;

    var folder = 'temp/' + random(10); //folder in which the temporary folder will be saved
    var path = __dirname + "/"; //current working path
    var vm_name = 'virtual_machine'; //name of virtual machine that we want to execute
    var timeout_value = 300;//Timeout Value, In Seconds

    //details of this are present in DockerSandbox.js
    return new sandBox(timeout_value, path, folder, vm_name, arr.compilerArray[language][0], arr.compilerArray[language][1], code, arr.compilerArray[language][2], arr.compilerArray[language][3], arr.compilerArray[language][4], stdin);
}

app.post('/compile', bruteforce.prevent, function (req, res) {
    compile(req.body).run(function (data, exec_time, err) {
        //console.log("Data: received: "+ data)
        res.send({ output: data, errors: err, time: exec_time });
    });
});

function onFinishTask(obj, res) {
    if (obj.finished == obj.testCases.length) {
        firebase.writeHistory(obj);
        res.send({ type: "success", passed: obj.finished, time: obj.execTime });
    }
}

function runWithTests(obj, res) {
    let i = obj.index;
    let input = obj.testCases[i].input;
    let output = obj.testCases[i].output;
    console.log("Testcase #" + i + ": IN: " + input + "; OUT: " + output);
    compile({
        language: obj.languageID,
        code: obj.code,
        stdin: input
    }).run((data, exec_time, err) => {
        if (!err) {
            console.log("actual = " + data + "; expected = " + output);
            if (data.toString().trim() == output.toString().trim()) {
                obj.execTime += parseFloat(exec_time.trim());
                obj.finished++;
                onFinishTask(obj, res);
            }
            else {
                if (!res.headersSent) {
                    res.send({ type: "failed", id: i, time: obj.execTime, output: data });
                }
            }
        }
        else {
            if (!res.headersSent) {
                res.send({ type: "error", error: err });
            }
        }
    });
}

app.post('/submit', bruteforce.prevent, async function (req, res) {
    let challengeID = req.body.challengeID;
    let uid = req.body.uid;
    let code = req.body.code;
    let languageID = req.body.languageID;

    let obj = {
        code: code,
        languageID: languageID,
        challengeID: challengeID,
        uid: uid
    };

    // Get challenge from db
    if (firebase.challenges != undefined) {
        let challenge = firebase.challenges[challengeID];
        if (challenge != undefined) {
            if (challenge.testCases) {
                obj['testCases'] = challenge.testCases;
                console.log(JSON.stringify(obj['testCase']));
                obj['execTime'] = 0;
                obj['index'] = 0;
                obj['finished'] = 0;
                let testKey = Object.keys(challenge.testCases);
                for (let i = 0; i < testKey.length; i++) {
                    obj['index'] = i;
                    runWithTests(obj, res);
                }
            }
            else {
                res.send({ type: "error", message: "No testcases" });
            }
        }
        else {
            res.send({ type: "error", message: "Challenge not found" });
        }
    }
    else {
        res.send({ type: "error", message: "Cannot get challenges" });
    }
});

app.get('/', function (req, res) {
    res.sendfile("./index.html");
});

app.get('/userlist', (req, res) => {
    firebase.getUserList((data) => {
        res.send(data);
    });
});

app.post('/team/create', bruteforce.prevent, (req, res) => {
    let ownerID = req.body.ownerID;
    let data = req.body.data;
    firebase.createTeam(ownerID, data, (result) => {
        res.send(result);
    })
});

app.post('/team/get', bruteforce.prevent, (req, res) => {
    let ownerID = req.body.ownerID;
    firebase.getYourTeam(ownerID, (result) => {
        res.send(result);
    })
});

app.post('/team/getjoined', bruteforce.prevent, (req, res) => {
    let uid = req.body.uid;
    firebase.getJoinedTeam(uid, (result) => {
        res.send(result);
    })
});

app.post('/team/invite', bruteforce.prevent, (req, res) => {
    let teamID = req.body.teamID;
    let teamName = req.body.teamName;
    let ownerName = req.body.ownerName;
    let email = req.body.email;
    firebase.invite(teamID, teamName, ownerName, email);
    res.send('invited');
});

app.post('/team/invitation/reply', bruteforce.prevent, (req, res) => {
    let isAccepted = req.body.isAccepted;
    let uid = req.body.uid;
    let teamID = req.body.teamID;
    firebase.replyInvitation(isAccepted, uid, teamID);
    res.send('replied');
})

app.post('/categories/create', bruteforce.prevent, (req, res) => {
    let category = req.body.category;
    let uid = req.body.uid;

    if (firebase.challenges != undefined) {
        if (category.uid == uid) {
            for (let challengeID of category.challengeList) {
                if (firebase.challenges[challengeID] != undefined &&
                    firebase.challenges[challengeID].ownerID != uid) {
                    res.send("Permission denied");
                }
            }
            firebase.createCategory(category);
            res.send(category.name + " is created");
        }
        res.send("Permission denied");
    }
    res.send("Permission denied");

});

app.get('/people/search', bruteforce.prevent, (req, res) => {
    let email = req.body.email;

})

app.get('/people/list', bruteforce.prevent, async (req, res) => {
    await firebase.getListPeople();
    res.send({ "status": "success" });
});

console.log("Listening at " + port);
//server.listen(port);
httpsServer.listen(port);
