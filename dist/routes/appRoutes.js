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
const express = require("express");
const path = require("path");
const gdrive_1 = require("../services/gdrive");
// ===== UTILS =====
const Logger_1 = require("../utils/Logger");
const TAG = 'AppRoutes';
const router = express.Router();
const fakeUser_1 = require("../db/repository/fakeUser"); //just for example , instead of using a DB we just saving user details here
let dbUser = fakeUser_1.user;
router.get('/', (req, res) => {
    res.send('welcome to server api');
});
/**1.Oauth
 * a.redirect to google consent page */
router.get('/gdrive/auth', (req, res) => {
    let url = gdrive_1.GdriveService.authPageUrl();
    res.redirect(url);
});
/*1.Oauth - b.exchange code with access token
    and get user email
  2. Webhook - registering to webhook in order to get user Gdrive activities
  NOTE - IN google You need to verify domain ownership (in the console.developers.google.com ) to allow webhook
  NOTE - local server cannot register to webhook

  */
router.get('/gdrive/code', (req, res) => __awaiter(this, void 0, void 0, function* () {
    try {
        let code = req.query.code;
        //1. Oauth - b.exchange code with access token and get user email
        Logger_1.Logger.d(TAG, '========== 1. b.exchange code with access token and get email ==========' + code, 'green');
        Logger_1.Logger.d(TAG, 'code >' + code, 'gray');
        let token = yield gdrive_1.GdriveService.getToken(code);
        Logger_1.Logger.d(TAG, 'token >' + token, 'green');
        let email = yield gdrive_1.GdriveService.getUserEmail(token.id_token);
        Logger_1.Logger.d(TAG, 'user email >' + email, 'gray');
        //2. Webhook - registering to webhook in order to get user Gdrive activities
        Logger_1.Logger.d(TAG, '========== 2. Webhook - registering to webhook in order to get user Gdrive activities ==========' + code, 'green');
        let subscription = yield gdrive_1.GdriveService.registerWebhook(token.access_token, email);
        //*saving to db
        dbUser = {
            gdrive: {
                email: email,
                tokens: {
                    access_token: token.access_token,
                    id_token: token.id_token,
                    refresh_token: token.refresh_token,
                    token_type: token.token_type,
                    expiry_date: token.expiry_date
                },
                webhook: {
                    id: subscription.id,
                    resourceId: subscription.resourceId,
                    resourceUri: subscription.resourceUri,
                    token: subscription.token,
                    expiration: subscription.expiration,
                }
            }
        };
        Logger_1.Logger.d(TAG, 'server is hooked to user ' + email + 'Activities', 'green');
    }
    catch (e) {
        Logger_1.Logger.d(TAG, 'Err >>>>>>>>>>>>' + e, 'red');
    }
}));
/*Domain Verification -IN google in order to use webhook we should verify domain ownership
by specifing a route that will return an html downloaded from google*/
router.get('/google6415f016f1a68134.html', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/google6415f016f1a68134.html'));
});
/**3.hook to user activities - google will inform to this route all the activities of the user */
router.post('/webhook/gdrive', (req, res) => __awaiter(this, void 0, void 0, function* () {
    Logger_1.Logger.d(TAG, '=================== User Gdrive Acitivity ===================', 'cyan');
    console.log(req.body);
    const channelId = req.headers['x-goog-channel-id'];
    const channelToken = req.headers['x-goog-channel-token'];
    const channelExpTime = req.headers['x-goog-channel-expiration'];
    const channelMsgNum = req.headers['x-goog-message-number'];
    // vals : sync, add , remove , update , trash , untrash ,change
    const channelResState = req.headers['x-goog-resource-state'];
    Logger_1.Logger.d(TAG, 'channelId = ' + channelId);
    Logger_1.Logger.d(TAG, '=== gdrive webhook notification == : ' + JSON.stringify(req.headers));
    if (channelResState == 'sync') {
        /* After creating a new notification channel to watch a resource, the Drive API sends a sync message to indicate that
           notifications are starting */
        Logger_1.Logger.d(TAG, '** Sending 200 to Google sync call **');
        res.status(200).end();
    }
    else {
        /**
         * process change - this route get notification push every time user does an activity
         * without the activity details
         * in order to get activity details send request to google that contains:
         * 1..the channelId (that indicate on which user we want to get activity details)
           2.the moment (the begin point) from which we want to get the activities that happend (=pageToken)
             a.if we dont have pageToken (first time ) we'll send request to get one
           3.when we'll recive the changes~activities we'll also get:
             a.nextPageToken - optional - that indicates that not all activites has been recivied and to get the next chunk of activities
             we should use this 'nextPageToken'.
             if nextPageToken doesnt exist it means we got all activities.
             b.newStartPageToken - indicates the moment (the begin point) from which we want to get the activities next time a push notification happends
             (/webhook/gdrive)
                                                  */
        Logger_1.Logger.d(TAG, '** Proccessing Activities **');
        let pageToken = dbUser.gdrive.webhook.pageToken;
        if (!pageToken) {
            Logger_1.Logger.d(TAG, '** doesnt have pageToken for that user - creating StartpageToken ');
            let pageToken = yield gdrive_1.GdriveService.getStartPageToken(dbUser.gdrive.tokens.access_token); //in real app we should pull access token by channel id  - but here we just doing it on one user
            pageToken = pageToken;
        }
        let nextPageToken = yield gdrive_1.GdriveService.getChanges(channelId, dbUser.gdrive.tokens.access_token, pageToken); //in real app we should pull access token by channel id  - but here we just doing it on one user,
        dbUser.gdrive.webhook.pageToken = nextPageToken;
        // res.status(httpCodes.OK).end();
    }
    Logger_1.Logger.d(TAG, '=================== / User Gdrive Acitivity ===================', 'cyan');
}));
exports.default = router;
//-------------------------------------SNIPPETS-------------------------
//CONVERTING NODE FS callback to REACTIVE
// fs.readdir('./dist/routes',(err,items)=>{
//     if(err){
//         console.log(err);
//     }
//     else{
//         console.log(items);
//     }
// })
// //converting node callback function to reactive version:
// const readdir$ = Rx.Observable.bindNodeCallback(fs.readdir); //save it as a function
// readdir$('./dist/routes').subscribe(items=>{console.log(items)}); 
