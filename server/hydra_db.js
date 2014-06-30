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
var dbLibrary = dbConfig.isMySql ? require('mysql') : require('sqlite3');
var mersenne = require('mersenne');
var async = require('async');

var connectionPool = null;

function HydraDatabase(db) {
    this.db = db;
}

HydraDatabase.prototype = {
    isMySql: dbConfig.isMySql,
    isSqlite: !dbConfig.isMySql,
    now: dbConfig.now,
    beginTransaction: function (handler) {
        if (dbConfig.isMySql) {
            this.db.query('START TRANSACTION', [], function (err, result) {
                handler(err);
            });
        } else {
            this.db.run('BEGIN TRANSACTION', handler);
        }
    },
    commit: function (handler) {
        if (dbConfig.isMySql) {
            this.db.query('COMMIT', [], function (err, result) {
                handler(err);
            });
        } else {
            this.db.run('COMMIT', handler);
        }
    },
    rollback: function (handler) {
        if (dbConfig.isMySql) {
            this.db.query('ROLLBACK', [], function (err, result) {
                handler(err);
            });
        } else {
            this.db.run('ROLLBACK', handler);
        }
    },
    //forAll(query, [parms,] handler) {
    forAll: function (query) {
        var parms = arguments.length == 3 ? arguments[1] : [];
        var handler = arguments[arguments.length - 1];

        if (dbConfig.isMySql) {
            this.db.query(query, parms, function (err, rows, others) {
                handler(err, rows);
            });
        } else {
            this.db.all(query, parms, handler);
        }
    },
    //execute(query, [parms,] handler) {
    execute: function (query) {
        var parms = arguments.length == 3 ? arguments[1] : null;
        var handler = arguments[arguments.length - 1];

        if (dbConfig.isMySql) {
            this.db.query(query, parms, function (err, rows, others) {
                handler(err);
            });
        } else {
            this.db.run(query, parms, handler);
        }
    },
    close: function () {
    },
    generateRandomUniqueInt: function (tableName, fieldName, onFound) {
        var dbObj = this;
        var candidates = [];
        for (var i = 0; i < 5; i += 1) {
            candidates.push(mersenne.rand(0x80000000));
        }

        async.waterfall([
            function (next) {
                dbObj.forAll('SELECT ' + fieldName + ' FROM ' + tableName
                    + ' WHERE ' + fieldName + ' IN (?, ?, ?, ?, ?)',
                    candidates, next);
            },
            function (found, next) {
                if (found.length === 0) {
                    next(null, candidates[0]);
                } else {
                    var lastCand = null;
                    var found = candidates.some(function (cand) {
                        var candFound = found.some(function (elt) {
                            return elt[fieldName] === cand;
                        });
                        lastCand = cand;
                        return !candFound;
                    });
                    if (found) {
                        next(null, lastCand);
                    } else {
                        next('No session ID is available.', null);
                    }
                }
            }
        ], onFound);
    }
};

function open(req, res, next) {
    if (dbConfig.isMySql) {
        if (connectionPool === null) {
            connectionPool = dbLibrary.createPool({
                host: dbConfig.mysqlHost,
                user: dbConfig.mysqlUser,
                password: dbConfig.mysqlPassword,
                database: dbConfig.mysqlDatabase
            });
        }

        connectionPool.getConnection(function (err, db) {
            if (err === null) {
                req.db = new HydraDatabase(db);
                res.on('finish', function () {
                    db.release();
                });
                next();
            } else {
                res.send({ ok: false,
                    message: 'internal error: could not find database' });
            }
        });
    } else {
        var sqliteDb = new dbLibrary.Database(dbConfig.sqliteFile);
        req.db = new HydraDatabase(sqliteDb);
        sqliteDb.on('error', function (err) {
            res.send({ ok: false, message: 'internal error: database lost!' });
            console.log('  database lost!', err); //OK
        });
        sqliteDb.on('open', next);
    }
}

exports.open = open;
