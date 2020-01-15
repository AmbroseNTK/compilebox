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

const formidableMiddleware = require('express-formidable');
const formidable = require('formidable');

var app = express();
var server = http.createServer(app);
var fs = require('fs');
const apiHelper = new(require('ambrosentk-api-helper').create)();

var port = 8989;

const privateKey = "" //fs.readFileSync('/etc/letsencrypt/live/pm.itsstraining.edu.vn/privkey.pem', 'utf8');
const certificate = "" //fs.readFileSync('/etc/letsencrypt/live/pm.itsstraining.edu.vn/cert.pem', 'utf8');
const ca = "" //fs.readFileSync('/etc/letsencrypt/live/pm.itsstraining.edu.vn/chain.pem', 'utf8');

const credentials = {
    key: privateKey,
    cert: certificate,
    ca: ca
};

/**
app.use(formidableMiddleware({
    uploadDir: 'temp/'
}));
*/

app.use(require('cors')());

var httpsServer = http.createServer(app);

var ExpressBrute = require('express-brute');
var store = new ExpressBrute.MemoryStore(); // stores state locally, don't use this in production
var bruteforce = new ExpressBrute(store, {
    freeRetries: 50,
    lifetime: 3600
});

var firebase = new firebaseApp();

//app.use(express.static(__dirname));
app.use(express.static(__dirname, {
    dotfiles: 'allow'
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded());

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
    var timeout_value = 300; //Timeout Value, In Seconds

    //details of this are present in DockerSandbox.js
    return new sandBox(timeout_value, path, folder, vm_name, arr.compilerArray[language][0], arr.compilerArray[language][1], code, arr.compilerArray[language][2], arr.compilerArray[language][3], arr.compilerArray[language][4], stdin);
}

app.post('/compile', function (req, res) {
    compile(req.body).run(function (data, exec_time, err) {
        //console.log("Data: received: "+ data)
        res.send({
            output: data,
            errors: err,
            time: exec_time
        });
    });
});

function onFinishTask(obj, res) {
    if (obj.finished == obj.testCases.length) {
        firebase.writeHistory(obj);
        res.send({
            type: "success",
            passed: obj.finished,
            time: obj.execTime
        });
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
            } else {
                if (!res.headersSent) {
                    res.send({
                        type: "failed",
                        id: i,
                        time: obj.execTime,
                        output: data
                    });
                }
            }
        } else {
            if (!res.headersSent) {
                res.send({
                    type: "error",
                    error: err
                });
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
            } else {
                res.send({
                    type: "error",
                    message: "No testcases"
                });
            }
        } else {
            res.send({
                type: "error",
                message: "Challenge not found"
            });
        }
    } else {
        res.send({
            type: "error",
            message: "Cannot get challenges"
        });
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

app.post('/people/search', async (req, res) => {
    let email = req.body.email;
    let result = await firebase.searchPeople(email);
    res.send(result);
})

app.get('/people/list', async (req, res) => {
    let listUser = await firebase.getListPeople();
    res.send(listUser);
});

function jsonToArray(json) {
    let keys = Object.keys(json);
    let array = [];
    for (let i = 0; i < keys.length; i++) {
        array.push(json[keys[i]]);
    }
    return array;
}


app.post('/competition/new', async (req, res) => {

    let form = new formidable.IncomingForm();
    form.uploadDir = "temp/";
    form.parse(req, async (err, fields, files) => {

        console.log(files["coverImage"]);

        let result = await apiHelper.validate(fields, [{
                link: "id",
                process: async (id) => {
                    let competitions = await firebase.getCompetitionIDList();
                    if (id != "" && !competitions.includes(id)) {
                        return {
                            status: true
                        };
                    }
                    return {
                        status: false,
                        failedMessage: id + " already existed"
                    }
                }
            },
            {
                link: "ownerId"
            },
            {
                link: "name"
            },
            {
                link: "shortDescription"
            },
            {
                link: "description"
            },
            {
                link: "duration"
            },
            {
                link: "challenges",
                process: (challengesText) => {
                    let challenges = jsonToArray(JSON.parse(challengesText));
                    fields.challenges = challenges;
                    let ownChallenges = firebase.getOwnChallenge(fields.ownerId);
                    for (let i = 0; i < challenges.length; i++) {
                        if (ownChallenges.findIndex((entry) => entry.challengeID == challenges[i].id) == -1) {
                            return {
                                status: false,
                                failedMessage: "Cannot assign " + challenges[i].id
                            };
                        }
                    }
                    return {
                        status: true
                    };
                }
            },
        ]);
        if (result.status) {
            firebase.createCompetition({
                ...fields,
                isPublished: false
            });
            try {
                await fs.mkdirSync("images/" + fields.id + "/");
                if (files['coverImage'] != null) {
                    await fs.renameSync(files['coverImage'].path, "images/" + fields.id + "/coverImage");
                }
                if (files['medalIcon'] != null) {
                    await fs.renameSync(files['medalIcon'].path, "images/" + fields.id + "/medalIcon");
                }

                res.send({
                    status: "success"
                });
            } catch (e) {
                res.send({
                    status: "failed",
                    message: "Cannot upload images"
                });
            }
        } else {
            res.send({
                status: "failed",
                message: result.message
            });
        }
    })

});


app.post('/competition/update', async (req, res) => {

    let form = new formidable.IncomingForm();
    form.uploadDir = "temp/";
    form.parse(req, async (err, fields, files) => {

        let result = await apiHelper.validate(fields, [{
                link: "id",
                process: async (competitionId) => {
                    competition = await firebase.getCompetitionById(competitionId);
                    return {
                        status: (competition != null),
                        failedMessage: "Competition does not exist"
                    }
                }
            },
            {
                link: "ownerId",
                process: async (ownerId) => {
                    return {
                        status: (competition.ownerId == ownerId),
                        failedMessage: "Permission denied"
                    }
                }
            },
            {
                link: "name"
            },
            {
                link: "shortDescription"
            },
            {
                link: "description"
            },
            {
                link: "duration"
            },
            {
                link: "challenges",
                process: (challengesText) => {
                    let challenges = jsonToArray(JSON.parse(challengesText));
                    fields.challenges = challenges;
                    let ownChallenges = firebase.getOwnChallenge(fields.ownerId);
                    for (let i = 0; i < challenges.length; i++) {
                        if (ownChallenges.findIndex((entry) => entry.challengeID == challenges[i].id) == -1) {
                            return {
                                status: false,
                                failedMessage: "Cannot assign " + challenges[i].id
                            };
                        }
                    }
                    return {
                        status: true
                    };
                }
            },
        ]);
        if (result.status) {
            if (fields.isPublished == 'false') {
                await firebase.updateCompetition(fields.id, fields);

                try {
                    if (!(await fs.existsSync("images/" + fields.id))) {
                        await fs.mkdirSync("images/" + fields.id + "/");
                    }
                    if (files['coverImage'] != null) {
                        let isExisted = await fs.existsSync("images/" + fields.id + "/coverImage");
                        if (isExisted) {
                            await fs.unlinkSync("images/" + fields.id + "/coverImage");
                        }
                        await fs.renameSync(files['coverImage'].path, "images/" + fields.id + "/coverImage");
                    }
                    if (files['medalIcon'] != null) {
                        let isExisted = await fs.existsSync("images/" + fields.id + "/medalIcon");
                        if (isExisted) {
                            await fs.unlinkSync("images/" + fields.id + "/medalIcon");
                        }
                        await fs.renameSync(files['medalIcon'].path, "images/" + fields.id + "/medalIcon");
                    }

                    res.send({
                        status: "success"
                    });
                } catch (e) {
                    res.send({
                        status: "failed",
                        message: e.message
                    });
                }
            } else {
                res.send({
                    status: "failed",
                    message: "Cannot update published competition"
                });
            }
        } else {
            res.send({
                status: "failed",
                message: result.message
            });
        }
    })

});

app.post('/competition/list', async (req, res) => {
    let result = await apiHelper.validate(req.body, [{
        link: "ownerId"
    }]);
    if (result.status) {
        let data = await firebase.getCompetitionList(req.body.ownerId)
        res.send({
            status: "success",
            data: data
        });
    } else {
        res.send({
            status: "failed",
            message: result.message
        });
    }
});

app.post('/competition/delete', async (req, res) => {
    let result = await apiHelper.validate(req.body, [{
            link: "id",
            process: (id) => {
                if (id != "" || id != undefined) {
                    return {
                        status: true
                    };
                }
                return {
                    status: false,
                    failedMessage: id + " is invalid"
                };
            }
        },
        {
            link: "ownerId",
            process: async (ownerId) => {
                let competition = await firebase.getCompetitionById(req.body.id);
                if (competition.ownerId == ownerId) {
                    return {
                        status: true
                    };
                }
                return {
                    status: false,
                    failedMessage: "Permission denied"
                };
            }
        }
    ]);
    if (result.status) {
        firebase.removeCompetition(req.body.id);
        res.send({
            status: "success"
        });
    } else {
        res.send({
            status: "failed",
            message: result.message
        });
    }
})

async function checkCompetitionPermission(req) {
    let result = await apiHelper.validate(req.body, [{
            link: "id",
            process: async (id) => {
                let competitionList = await firebase.getCompetitionIDList();
                if (competitionList.includes(id)) {
                    return {
                        status: true
                    };
                }
                return {
                    status: false,
                    failedMessage: id + " not found"
                };
            }
        },
        {
            link: "ownerId",
            process: async (ownerId) => {
                let competition = await firebase.getCompetitionById(req.body.id);
                if (competition.ownerId == ownerId) {
                    return {
                        status: true
                    };
                }
                return {
                    status: false,
                    failedMessage: "Permission denied"
                };
            }
        }, {
            link: "emailList",
            process: (emailList) => {
                if (emailList == undefined) {
                    return {
                        status: false,
                        failedMessage: "Email list is invalid"
                    };
                }
                return {
                    status: true
                };
            }
        }
    ]);
    return result;
}

app.post("/competition/invitation/invite", async (req, res) => {

    let result = await checkCompetitionPermission(req);
    if (result.status) {
        firebase.inviteToCompetition(req.body.id, req.body.emailList);
        res.send({
            status: "success"
        });
    } else {
        res.send({
            status: "failed",
            message: result.message
        });
    }
});

app.post("/competition/invitation/list", async (req, res) => {
    let result = await checkCompetitionPermission(req);
    if (result.status) {
        let data = await firebase.getCompetitionInviteList(req.body.id);
        res.send({
            status: "success",
            data: data
        });
    } else {
        res.send({
            status: "failed",
            message: result.message
        });
    }
});

app.get("/resources/images/competition/:competitionId/:fileName", (req, res) => {
    let competitionId = req.params.competitionId;
    let fileName = req.params.fileName;
    console.log(req.params);
    res.download(__dirname + "/.." + "/images/" + competitionId + "/" + fileName);
})

console.log("Listening at " + port);
//server.listen(port);
httpsServer.listen(port);