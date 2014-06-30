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
var dbConfig = require('./db_config');
var fs = require('fs');
var path = require('path');
var async = require('async');
var memcached = require('memcached');

var mcServer = new memcached('localhost:11211');
var CHECK_MILLIS = 5000;
var RE_VALID_NAME = /^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/;

function doNothing() { }

function isPathValid(givenPath) {
    var depth = 0;
    givenPath.forEach(function (p) {
        if (p === '..') {
            if (depth > 0) {
                depth--;
            } else {
                return false;
            }
        } else if (p === '.' || p === '') {
            // ignore
        } else if (RE_VALID_NAME.test(p)) {
            depth++;
        } else {
            return false;
        }
    });
    return depth > 0;
}

function repairRelativePath(givenPath) {
    var newPath = [];
    givenPath.forEach(function (p) {
        if (p === '..') {
            if (newPath.length > 0) {
                newPath.splice(newPath.length - 1, 1);
            }
        } else if (p === '.' || p === '') {
            // ignore
        } else {
            newPath.push(p);
        }
    });
    return newPath;
}

function createKey(givenPath) {
    var result = '';
    repairRelativePath(givenPath).forEach(function (p) {
        if (result === '') {
            result = p;
        } else {
            result = result + ':' + p;
        }
    });
    return result;
}

function createPath(givenPath) {
    var result = dbConfig.webRootDirectory;
    repairRelativePath(givenPath).forEach(function (p) {
        result = path.join(result, p);
    });
    return result;
}

function createRelative(givenPath) {
    var result = ''
    repairRelativePath(givenPath).forEach(function (p) {
        result = (result === '' ? p : result + '/' + p);
    });
    return result;
}

function parseFileToObject(fileText, callback) {
    var contents = {};
    var curKey = null;
    var curValue = ''

    var lines = fileText.split('\n');
    lines.forEach(function (line) {
        if (line !== '' && line[0] == '$') {
            if (curKey !== null) {
                contents[curKey] = curValue;
            }

            var match = /^\$([a-zA-Z_0-9]*)(?: (.*))?$/.exec(line);
            curKey = match[1];
            curValue = match.length > 2 && match[2] !== undefined ? match[2] : '';
        } else {
            if (curKey === null) {
                ; // do nothing
            } else if (curValue === '') {
                curValue = line;
            } else {
                curValue += '\n' + line
            }
        }
    });
    if (curKey !== null) {
        contents[curKey] = curValue;
    }
    callback(null, contents);
}

function loadFile(pathArray, callback) {
    var relPath = createRelative(pathArray);
    console.log('load file:', relPath); //OK
    var filename = createPath(pathArray);
    var fin = fs.createReadStream(filename);
    var finText = '';
    var terminated = false;
    fin.on('data', function (chunk) {
        finText += chunk;
    });
    fin.on('close', function () {
        if (!terminated) {
            terminated = true;
            parseFileToObject(finText, callback);
        }
    });
    fin.on('error', function () {
        if (!terminated) {
            terminated = true;
            console.log('  ' + relPath + ': error while reading'); //OK
            callback('could not read file', null);
        }
    });
}

function saverFile(result, requested, mcKey, nowTime, callback) {
    return function (err, contents) {
        if (err || !contents) {
            var e = err || 'No data retrieved from file';
            mcServer.set(mcKey, JSON.stringify({
                lastCheck: nowTime,
                err: e,
                contents: {},
                otherAttrs: {}
            }), CHECK_MILLIS, doNothing);
            callback(e, null);
            return;
        }

        var shortVals = {};
        var longAttrs = {};
        var longVals = {};
        async.each(Object.getOwnPropertyNames(contents),
            function (attr, next) {
                var v = contents[attr];
                if (v.length <= 120) {
                    shortVals[attr] = v;
                    next(null);
                } else {
                    longVals[attr] = v;
                    longAttrs[attr] = 1;
                    mcServer.set(mcKey + '::' + attr,
                        JSON.stringify({ t: nowTime, v: v }),
                        CHECK_MILLIS,
                        next);
                }
            },
            function (err) {
                mcServer.set(mcKey, JSON.stringify({
                    lastCheck: nowTime,
                    err: err,
                    contents: shortVals,
                    otherAttrs: longAttrs
                }), CHECK_MILLIS, doNothing);
                requested.forEach(function (attr) {
                    if (contents.hasOwnProperty(attr)) {
                        result[attr] = contents[attr];
                    }
                });
                callback(null, result);
            });
    };
}

function copyAttrs(pathArray, fileData, result, requested, mcKey, callback) {
    var longValues = {};
    async.each(requested,
        function (attr, next) {
            if (fileData.otherAttrs.hasOwnProperty(attr)) {
                mcServer.get(mcKey + '::' + attr, function (err, data) {
                    if (err || !data) {
                        next('reload needed: missing ' + attr);
                    } else {
                        data = JSON.parse(data);
                        if (data.t !== fileData.lastCheck) {
                            next('reload needed: stale ' + attr);
                        } else {
                            longValues[attr] = data.v;
                            next(null);
                        }
                    }
                });
            } else {
                next(null);
            }
        },
        function (err) {
            if (err) {
                loadFile(pathArray,
                    saverFile(result, requested, mcKey, Date.now(), callback));
            } else {
                requested.forEach(function (attr) {
                    if (fileData.contents.hasOwnProperty(attr)) {
                        result[attr] = fileData.contents[attr];
                    } else if (fileData.otherAttrs.hasOwnProperty(attr)) {
                        result[attr] = longValues[attr];
                    }
                });
                callback(null, result);
            }
        });
}

function getProperties(pathArray, attrs, callback) {
    if (!isPathValid(pathArray)) {
        callback('file path is invalid', null);
        return;
    }

    var result = {};
    var requested = attrs ? Object.getOwnPropertyNames(attrs) : [];
    requested.forEach(function (attr) {
        result[attr] = attrs[attr];
    });

    var mcKey = 'file-' + createKey(pathArray);
    mcServer.get(mcKey, function (err, data) {
        var nowTime = Date.now();
        if (data) {
            data = JSON.parse(data);
        }
        if (!data || nowTime - data.lastCheck >= CHECK_MILLIS) {
            loadFile(pathArray,
                saverFile(result, requested, mcKey, nowTime, callback));
        } else {
            copyAttrs(pathArray, data, result, requested, mcKey, callback);
        }
    });
}

function getProperty(pathArray, attr, dflt, callback) {
    if (!isPathValid(pathArray)) {
        callback('file path is invalid', null);
        return;
    }

    var attrs = {};
    attrs[attr] = dflt;
    getProperties(pathArray, attrs, function (err, values) {
        callback(err, values[attr]);
    });
}

function getPropertiesEach(pathArrays, toKey, attrs, complete) {
    if (!pathArrays.every(isPathValid)) {
        callback('file path is invalid', null);
        return;
    }

    var results = {};
    async.each(pathArrays,
        function (pathArray, callback) {
            getProperties(pathArray, attrs, function (err, result) {
                results[toKey(pathArray)] = result;
                callback(err);
            });
        },
        function (err) {
            complete(err, results);
        });
}

function fetchStats(pathArray, callback) {
    var mcKey = 'stat-' + createKey(pathArray);
    mcServer.get(mcKey, function (err, data) {
        var nowTime = Date.now();
        if (data) {
            data = JSON.parse(data);
        }
        var relPath = createRelative(pathArray);
        if (!data || nowTime - data.lastCheck >= CHECK_MILLIS) {
            var pathName = createPath(pathArray);
            console.log('get statistics:', relPath); //OK
            fs.stat(pathName, function (err, stats) {
                var e = err || (stats ? null : 'file statistics unavailable');
                var value = {
                    lastCheck: nowTime,
                    err: e,
                    path: pathName,
                    isFile: stats ? !stats.isDirectory() : false,
                    isDirectory: stats ? stats.isDirectory() : false
                };
                mcServer.set(mcKey, JSON.stringify(value), CHECK_MILLIS,
                    doNothing);
                callback(e, value);
            });
        } else {
            callback(data.err, data);
        }
    });
}

function isDirectory(pathArray, callback) {
    if (isPathValid(pathArray)) {
        fetchStats(pathArray, function (err, record) {
            callback(err, record.isDirectory ? record.path : null);
        });
    } else {
        callback('file path is invalid', null);
    }
}

function isFile(pathArray, callback) {
    if (isPathValid(pathArray)) {
        fetchStats(pathArray, function (err, record) {
            callback(err, record.isFile ? record.path : null);
        });
    } else {
        callback('file path is invalid', null);
    }
}

exports.getProperty = getProperty;
exports.getProperties = getProperties;
exports.getPropertiesEach = getPropertiesEach;
exports.isDirectory = isDirectory;
exports.isFile = isFile;
