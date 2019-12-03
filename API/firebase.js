var admin = require('firebase-admin');

var FirebaseApp = function () {
    var serviceAccount = require("./codeathon-itss-firebase-adminsdk-1u6qj-681741e792.json");

    let app = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://codeathon-itss.firebaseio.com"
    });

    let db = app.database();


    db.ref("challenges/").on("value", (snapshot) => {
        this.challenges = snapshot.val();
        console.log("Reloaded challenges");
    });

    db.ref("categories/").on("value", (snapshot) => {
        this.categories = snapshot.val();
        console.log("Reloaded categories");
    })

    this.instance = app;
    this.db = db;

}

FirebaseApp.prototype.getUserName = function (uid) {
    let name = "";
    this.instance.auth().getUser(uid).then(value => {
        name = value.displayName;
    });
    return name;
}

FirebaseApp.prototype.writeHistory = function (obj) {
    if (obj.uid != undefined || obj.uid != "") {
        this.instance.auth().getUser(obj.uid).then(value => {
            obj.email = value.email;
            obj.displayName = value.displayName;
            obj.date = Date.now();
            this.db.ref("challenges/" + obj.challengeID + "/history/" + obj.uid).set(obj);
            this.db.ref("users/" + obj.uid + "/history/" + obj.challengeID).set(obj);
        });

    }
}

FirebaseApp.prototype.createCategory = function (category) {
    this.db.ref("categories/" + category.id).set(category);
}

FirebaseApp.prototype.getUserList = async function (onFinish) {
    this.db.ref("users/").on('value', async (snapshot) => {
        let data = snapshot.val();
        let uids = Object.keys(data);
        let emailList = [];
        for (let i = 0; i < uids.length; i++) {
            let usr = await this.instance.auth().getUser(uids[i])
            emailList.push(usr.email)
        }
        console.log(emailList);
        onFinish(emailList);
    })
}

FirebaseApp.prototype.createTeam = function (ownerID, obj, onFinish) {
    this.db.ref('team/').push({ ownerID: ownerID, ...obj, invitation: 0 }, (error) => {
        if (error) {
            onFinish({ status: 'error', error: error });
        }
        else {
            onFinish({ status: 'success' });
        }
    })
}

FirebaseApp.prototype.getYourTeam = function (ownerID, onFinish) {
    this.db.ref('team/').on('value', (snapshot) => {
        let data = snapshot.val();
        let keys = Object.keys(data);
        let result = [];

        for (let i = 0; i < keys.length; i++) {
            if (data[keys[i]]['ownerID'] == ownerID) {
                result.push(keys[i]);
            }
        }

        onFinish(result);
    })
}

FirebaseApp.prototype.getJoinedTeam = function (uid, onFinish) {
    this.db.ref('team/').on('value', (snapshot) => {
        let data = snapshot.val();
        let keys = Object.keys(data);
        let result = [];
        for (let i = 0; i < keys.length; i++) {
            if (data[keys[i]]['members'] != undefined) {
                let listOfMember = Object.keys(data[keys[i]]['members']);
                if (listOfMember.indexOf(uid) != -1) {
                    result.push(keys[i]);
                }
            }
        }
        onFinish(result);
    })
}

FirebaseApp.prototype.invite = async function (teamID, teamName, ownerName, email) {
    let uid = (await this.instance.auth().getUserByEmail(email));
    if (uid != undefined) {
        uid = uid.uid;
        this.db.ref('users/' + uid + '/invitation/' + teamID).set({ teamName: teamName, ownerName: ownerName });
        this.db.ref('team/' + teamID + '/invitation/' + uid).set({ status: 0 });
    }
}

FirebaseApp.prototype.replyInvitation = function (isAccepted, uid, teamID) {
    if (isAccepted) {
        this.db.ref('team/' + teamID + '/members/' + uid).set({ status: 1 });
    }
    this.db.ref('team/' + teamID + '/invitation/' + uid).remove();
    this.db.ref('users/' + uid + '/invitation/' + teamID).remove();
}

FirebaseApp.prototype.searchPeople = async function (email) {
    let user;
    let data;
    try {
        user = await this.instance.auth().getUserByEmail(email);
        data = (await this.db.ref("/users/" + user.uid).once("value")).val();
    }
    catch (e) {
        return null;
    }
    let result = { challenges: [], history: [], profile: {} };
    // Get own challenges
    let challengeID = Object.keys(this.challenges);
    for (let i = 0; i < challengeID.length; i++) {
        let challenge = this.challenges[challengeID[i]];
        if (challenge.ownerID == user.uid) {
            result.challenges.push({
                id: challengeID[i],
                title: challenge.title,
                description: challenge.shortDescription
            });
        }
    }

    //Get history
    let historyID = Object.keys(data.history);
    for (let i = 0; i < historyID.length; i++) {
        if (historyID[i] != "dummy") {
            let current = data.history[historyID[i]];
            let challenge = this.challenges[historyID[i]];
            let solution = "";
            if (challenge != undefined) {
                if (challenge.canViewSolution == undefined || challenge.canViewSolution == true) {
                    solution = current.code;
                }
            }
            result.history.push({
                challengeID: current.challengeID,
                execTime: current.execTime,
                languageID: current.languageID,
                date: current.date,
                solution: solution
            });
        }
    }

    result.profile = {
        email: user.email,
        name: user.displayName,
        photoURL: user.photoURL
    }

    return result;
}

FirebaseApp.prototype.getListPeople = async function () {
    let listUsers = await this.instance.auth().listUsers();
    return listUsers.users.map((user) => ({
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL
    }));
}

FirebaseApp.prototype.createCompetition = async function (data) {
    console.log(data);
    await this.db.ref("competition/" + data.id).set(data);
}

FirebaseApp.prototype.getCompetitionList = async function (ownerId) {
    let snapshot = (await this.db.ref("competition/").once("value")).val();
    let result = [];
    try {
        let keys = Object.keys(snapshot);
        for (let i = 0; i < keys.length; i++) {
            console.log(ownerId)
            if (snapshot[keys[i]].ownerId === ownerId) {
                result.push(snapshot[keys[i]]);
            }
        }
    }

    catch (e) { }
    return result;
}

FirebaseApp.prototype.getCompetitionIDList = async function () {
    let snapshot = (await this.db.ref("competition/").once("value")).val();
    if (snapshot == undefined || snapshot == null) {
        return [];
    }
    return Object.keys(snapshot);
}

FirebaseApp.prototype.getCompetitionById = async function (competitionId) {
    let data = (await this.db.ref("competition/" + competitionId).once("value")).val();
    if (data != undefined) {
        return data;
    }
    return null;
}

FirebaseApp.prototype.updateCompetition = async function (competitionId, data) {
    await this.db.ref("competition/" + competitionId).update(data);
}

FirebaseApp.prototype.removeCompetition = async function (competitionId) {
    await this.db.ref("competition/" + competitionId).remove();
}

FirebaseApp.prototype.getOwnChallenge = function (ownerId) {
    let result = [];
    let keys = Object.keys(this.challenges);
    for (let i = 0; i < keys.length; i++) {
        if (this.challenges[keys[i]].ownerID == ownerId) {
            result.push(this.challenges[keys[i]]);
        }
    }
    return result;
}

FirebaseApp.prototype.inviteToCompetition = async function (id, emailList) {
    await this.db.ref("competition/" + id + "/invitation/").set(emailList);
}

FirebaseApp.prototype.getCompetitionInviteList = async function (id) {
    return (await this.db.ref("competition/" + id + "/invitation").once("value"));
}

FirebaseApp.prototype.uploadFile = function (file) {

}

module.exports = FirebaseApp;