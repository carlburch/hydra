/*
 * Copyright (c) 2014 Carl Burch
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the
 * "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:
 *
 * The above copyright notice and this permission notice shall be included
 * in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
 * OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
 * IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
 * CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
 * TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
var isDevelopment = true;

var express = require('express');
var app = express();

var path = require('path');
var hydra_db = require('./hydra_db');
var hydra_session = require('./hydra_session');
var hydra_user = require('./hydra_user');
var hydra_lesson = require('./hydra_lesson');
var hydra_item = require('./hydra_item');
var hydra_grade = require('./hydra_grade');
var file_cache = require('./file_cache');
var dyn_dust = require('./dyn_dust');

var static_dir = path.normalize(path.join(__dirname, '..', 'static'));
var templ_file = path.normalize(path.join(__dirname, '..', 'static/templates.html'));

console.log(isDevelopment ? 'development' : 'distribution'); //OK

if (isDevelopment) {
    app.use(express.logger());
}
app.use(express.urlencoded());
app.use('/static', express.static(static_dir));
app.use('/template', dyn_dust.middleware(templ_file, isDevelopment));
app.use('/', function (req, res, next) {
    var match = /^\/([^/]*)/.exec(req.url);
    if (match) {
        var subdir = match[1];
        file_cache.isDirectory([subdir], function (err, directoryPath) {
            if (directoryPath) {
                var filePath = req.url.substring(1).split('/');
                file_cache.isFile(filePath, function (err, filePath) {
                    if (filePath) {
                        res.sendfile(filePath);
                    } else {
                        res.sendfile(path.join(static_dir, 'index.html'));
                    }
                });
            } else {
                next();
            }
        });
    } else {
        next();
    }
});
app.use(express.cookieParser());
app.use(express.cookieSession({ secret: 'hydra_secret',
    cookie: { maxAge: 3 * 60 * 60 * 1000 }}));
app.use(hydra_db.open);
app.use('/user', function (req, res, next) {
    if (req.url == '/register') {
        hydra_session.register(req, res);
    } else if (req.url == '/login') {
        hydra_session.login(req, res);
    } else if (req.url == '/logout') {
        hydra_session.logout(req, res);
    } else {
        next();
    }
});
app.use(hydra_session.validateSession);
app.use(app.router);

app.get('/user/list', hydra_user.getList);
app.get('/user/profile', hydra_user.getProfile);
app.post('/user/update', hydra_user.updateProfile);
app.post('/user/toggle', hydra_user.toggleVisibility);

app.get('/lesson/list', hydra_lesson.getList);
app.get('/lesson/get', hydra_lesson.getLesson);
app.post('/lesson/setstarted', hydra_lesson.setStarted);

app.post('/item/execute', hydra_item.execute);
app.post('/item/save', hydra_item.save);
app.post('/item/history', hydra_item.getHistory);

app.get('/grade/list', hydra_grade.list);
app.get('/grade/get', hydra_grade.get);
app.post('/grade/save', hydra_grade.save);

if (isDevelopment) {
    app.listen(8888);
} else {
    app.listen(3000, '127.0.0.1');
}
