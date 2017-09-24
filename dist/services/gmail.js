"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const config = require("config");
const google = require("googleapis");
const plus = google.plus('v1');
const request = require("request");
// import * as httpCodes from 'http-status-codes';
const uuid = require("uuid");
// === UTILS ===
const Logger_1 = require("../utils/Logger");
const TAG = 'GMAIL';
//import { user as UserDb } from '../db/user';
const ENV = process.env.NODE_ENV || 'local';
const envConfig = config.get(ENV);
const creds = envConfig.gdrive;
const BASE_URL = envConfig.base_url;
//================ google api lib initalization ===================:
const urlshortener = google.urlshortener('v1');
const OAuth2 = google.auth.OAuth2;
const oauth2Client = new OAuth2(creds.client_id, creds.client_secret, creds.redirect_url_gmail);
const drive = google.drive({
    version: 'v2',
    auth: oauth2Client
});
//================ / google api lib initalization ===================:
//const REFRESH_TIME_GAP: number = 10 * 60 * 1000;
//const auth = new googleAuth();
//const oauth2Client = new auth.OAuth2(creds.client_id, creds.client_secret, creds.redirect_uri);
class GmailService {
    /**return the google authentication page url for the app */
    static authPageUrl() {
        const url = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            response_type: 'code',
            scope: ['https://mail.google.com/', 'https://www.googleapis.com/auth/userinfo.email',
                'https://www.googleapis.com/auth/gmail.modify',
                'https://www.googleapis.com/auth/pubsub',
                'https://www.googleapis.com/auth/gmail.readonly',
                'https://www.googleapis.com/auth/gmail.metadata'] //['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/userinfo.email'],
            //prompt: 'consent'
        });
        Logger_1.Logger.d(TAG, 'url generated >' + url);
        return url;
    }
    /*exchange code with token*/
    static getToken(code) {
        return new Promise((resolve, reject) => {
            oauth2Client.getToken(code, (err, token, response) => {
                if (err) {
                    Logger_1.Logger.d(TAG, 'Error while trying to retrieve access token: ' + err, 'red');
                    return reject(err);
                }
                Logger_1.Logger.d(TAG, 'token > ' + JSON.stringify(token), 'green');
                oauth2Client.setCredentials(token);
                resolve(token);
            });
        });
    }
    /*get user email*/
    static getUserEmail(token_id) {
        return new Promise((resolve, reject) => {
            oauth2Client.verifyIdToken(token_id, creds.client_id, (err, login) => {
                if (err) {
                    reject(err);
                }
                else {
                    var payload = login.getPayload();
                    const userid = payload['sub'];
                    const email = payload['email'];
                    console.log('userid : ' + userid);
                    console.log('email : ' + email);
                    resolve(email);
                }
            });
        });
    }
    /**hook to user activities - get user push notifications
   * https://developers.google.com/gmail/api/v1/reference/users/watch
   *   NOTE - if you are getting an 403 it maybe because of the following:
    * you didnt enable the gmail + pub/sub api for the project in the google console https://console.developers.google.com/apis/library
    * you didnt provided the scope premissions when authorazing with Oauth2.0: 'https://www.googleapis.com/auth/pubsub' , .... (look in :https://developers.google.com/gmail/api/v1/reference/users/watch)
    *you didnt grant publish priviliges to serviceAccount:gmail-api-push@system.gserviceaccount.com in the  IAM:
        https://developers.google.com/gmail/api/guides/push#grant_publish_rights_on_your_topic , https://console.cloud.google.com/iam-admin/iam
  */
    static registerWebhook(access_token, user_email) {
        return new Promise((resolve, reject) => {
            const exp_date = generateExpDate();
            Logger_1.Logger.d(TAG, '*** REGISTRETING WEB HOOK FOR GMAIL  === user_email : ' + user_email + ' exp_date : ' + exp_date + ' access_Token :' + access_token + '***');
            // this uniqueId  
            const uniqueId = uuid(); //generate random string
            const req_body = {
                topicName: "projects/webhooks-179808/topics/mytopic",
                labelIds: ["INBOX"],
            };
            request.post(`https://www.googleapis.com/gmail/v1/users/${user_email}/watch`, {
                json: true,
                headers: {
                    Authorization: 'Bearer ' + access_token
                },
                body: req_body
            }, (err, res, subscription) => {
                if (!res) {
                    Logger_1.Logger.d(TAG, 'Response is empty - maybe you are not connected to the internet', 'red');
                    return reject();
                }
                if (err) {
                    Logger_1.Logger.d(TAG, 'Err >>>>>>>>>>>' + err, 'red');
                    return reject(err);
                }
                if (res.statusCode != 200) {
                    reject(JSON.stringify(subscription));
                }
                else {
                    Logger_1.Logger.d(TAG, 'Webhook Gmail Registeration succeded', 'green');
                    Logger_1.Logger.d(TAG, JSON.stringify(subscription), 'green');
                    resolve(subscription);
                }
            });
        });
    }
    /**https://developers.google.com/gmail/api/v1/reference/users/messages/list - NOT RELEVANT TO WEBHOOK - JUST CHECKING THE Oauth scope permissions is correct */
    static getUserMessages(access_token, user_email) {
        return new Promise((resolve, reject) => {
            const exp_date = generateExpDate();
            Logger_1.Logger.d(TAG, '*** GETTING USER GMAIL MESSAGES  LIST === user_email : ' + user_email + ' exp_date : ' + exp_date + ' access_Token :' + access_token + '***');
            request.get(`https://www.googleapis.com/gmail/v1/users/${user_email}/messages`, {
                json: true,
                headers: {
                    Authorization: 'Bearer ' + access_token
                },
            }, (err, res, subscription) => {
                if (!res) {
                    Logger_1.Logger.d(TAG, 'Response is empty - maybe you are not connected to the internet', 'red');
                    return reject();
                }
                if (err) {
                    Logger_1.Logger.d(TAG, 'Err >>>>>>>>>>>' + err, 'red');
                    return reject(err);
                }
                if (res.statusCode != 200) {
                    reject(JSON.stringify(subscription));
                }
                else {
                    Logger_1.Logger.d(TAG, 'GET gmail messages list succeded', 'green');
                    Logger_1.Logger.d(TAG, subscription, 'green');
                }
            });
        });
    }
    /**https://developers.google.com/gmail/api/v1/reference/users/messages/attachments/get */
    static getMessageAttachments() {
    }
    static getStartPageToken(access_token) {
        return new Promise((resolve, reject) => {
        });
    }
    /**https://developers.google.com/gmail/api/v1/reference/users/history/list */
    static getChanges(access_token, user_email, historyId, pageToken) {
        return new Promise((resolve, reject) => {
            const exp_date = generateExpDate();
            Logger_1.Logger.d(TAG, '*** GETTING USER GMAIL ACTIVITIES DETAILS  === user_email : ' + user_email + ' access_Token :' + access_token + ' historyId :' + historyId + '***');
            request.get(`https://www.googleapis.com/gmail/v1/users/${user_email}/history?` + 'startHistoryId=' + historyId, {
                json: true,
                headers: {
                    Authorization: 'Bearer ' + access_token
                },
            }, (err, res, changes) => __awaiter(this, void 0, void 0, function* () {
                if (!res) {
                    Logger_1.Logger.d(TAG, 'Response is empty - maybe you are not connected to the internet', 'red');
                    return reject();
                }
                if (err) {
                    Logger_1.Logger.d(TAG, 'Err >>>>>>>>>>>' + err, 'red');
                    return reject(err);
                }
                if (res.statusCode != 200) {
                    Logger_1.Logger.d(TAG, 'Err >>>>>>>>>>>' + res.statusCode, 'red');
                    reject(res.statusCode);
                }
                else {
                    Logger_1.Logger.d(TAG, 'GET Gmail Changes Details  succeded', 'green');
                    Logger_1.Logger.d(TAG, JSON.stringify(changes), 'green');
                    Logger_1.Logger.d(TAG, `GETTING MESSAGE DETAILS for each change >`, 'green');
                    //changes.history.messages //TODO
                    if (changes.nextPageToken) {
                        Logger_1.Logger.d(TAG, '**Page Token exist in response -GETTING NEXT PAGE OF Gmail Changes Details ', 'green');
                        let nextChanges = yield this.getChanges(access_token, user_email, historyId, changes.nextPageToken);
                        resolve(changes);
                    }
                    else {
                        resolve(changes);
                    }
                    // Logger.d(TAG, changes, 'green');
                }
            }));
        });
    }
    /*if we wont to shut down a notification channel
     https://developers.google.com/drive/v2/web/push#stopping-notifications */
    static stopNotifications(channelId, access_token, resourceId) {
        return new Promise((resolve, reject) => {
        });
    }
}
exports.GmailService = GmailService;
function generateExpDate() {
    const THREE_DAYS = 1000 * 60 * 60 * 24 * 3;
    const exp_date = Date.now() + THREE_DAYS;
    return exp_date;
}
