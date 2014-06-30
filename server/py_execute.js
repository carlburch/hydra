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
var async = require('async');
var fs = require('fs');
var mersenne = require('mersenne');
var path = require('path');
var child_process = require('child_process');

var pathSafeExec = '/usr/bin/safeexec'
var pathJail = '/hydra/jail'
var cpuLimit = 5;

var pyTemplate = '';

(function () {
    var filename = 'py_template.py';
    var fin = fs.createReadStream(filename);
    var finText = '';
    fin.on('data', function (chunk) {
        finText += chunk;
    });
    fin.on('end', function () {
        pyTemplate = finText;
    });
})();

function randHex(max) {
    return Number(mersenne.rand(max)).toString(16);
}

function createFile(pyCode, callback) {
    var dirName = 'scratch' + randHex(0x80000000);
    var fileName = 'main' + randHex(0x1000000) + '.py';
    var dirPath = path.join(pathJail, dirName);
    var filePath = path.join(pathJail, dirName, fileName);

    var onDone = function () {
        callback(null, dirName, fileName);
    };

    fs.exists(dirPath, function (exists) {
        if (exists) {
            fs.createWriteStream(filePath).end(pyCode, 'utf-8', onDone);
        } else {
            fs.mkdir(dirPath, 0711, function (err) {
                if (err !== null) {
                    callback(err, null, null);
                } else {
                    fs.createWriteStream(filePath).end(pyCode, 'utf-8', onDone);
                }
            });
        }
    });
}

function run(context, callback) {
    var pyCode = pyTemplate.replace(/{{([a-zA-Z]+)}}/g,
        function (match, key, offset, string) {
            var result = context[key];
            if (typeof result === 'string') {
                return result.replace(/[\\"]/g, "\\$&");
            } else {
                return result;
            }
        });

    async.waterfall([
        function (next) {
            createFile(pyCode, next);
        },
        function (dirName, fileName, next) {
            var args = [
                pathSafeExec,
                '--fsize 100',
                '--env_vars PY',
                '--gid 1000',
                '--uidplus 10000',
                '--cpu ' + cpuLimit,
                '--mem 100000',
                '--clock ' + (2 * cpuLimit + 5),
                '--report_file xxx',
                '--chroot_dir ' + pathJail,
                '--nfile 20',
                '--exec_dir /' + dirName,
                '--exec /bin/python3 -u -S ' + fileName
            ];
            child_process.exec(args.join(' '),
                { cwd: pathJail, timeout: cpuLimit * 1000 }, next);
        },
        function (stdout, stderr, next) {
            callback(null, stdout);
        }
    ], function (err) {
        if (err !== null) {
            callback({ ok: false, message: 'Unknown problem' });
        }
    });
}

exports.run = run;
