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
/* This module deals with dynamically compiling a file of Dust.js
 * templates into JavaScript code, ready to be sent to a browser.
 * It continuously monitors when the file of templates has been
 * updated, so that when the file is modified, any later request
 * by the browser for the templates should re-compile the file.
 *
 * The template file can have a number of templates, each given
 * a different label. Templates are marked starting with {@LABEL}
 * and ending with {/LABEL}, where LABEL is the label to be
 * associated with the template.
 */
var dust = require('dustjs-linkedin');
var fs = require('fs');

function compileDustFile(filename, receiver) {
    var fin = fs.createReadStream(filename);
    var finText = '';
    fin.on('data', function (chunk) {
        finText += chunk;
    });
    fin.on('end', function () {
        finText = finText.trim();
        var fullResult = '';

        function addTemplate(tempName, tempStart, tempEnd) {
            console.log('  compiling "' + tempName + '"'); //OK
            var tempDefnText = finText.substring(tempStart, tempEnd);
            try {
                var compiled = dust.compile(tempDefnText, tempName);
                if (fullResult.length === 0) {
                    fullResult = compiled;
                } else {
                    fullResult += '\n' + compiled;
                }
            } catch (e) {
                console.log('    ' + e.message); //OK
            }
        }

        var reTag = /\s*\{(\W)(\w+)}\s*/g;
        var tempName = '';
        var tempStart = 0;
        var tempEnd = 0;
        var curPos = 0;
        var curDepth = 0;

        var match = reTag.exec(finText);
        while (match !== null) {
            if (match[1] === '&') {
                if (curDepth > 0) {
                    console.log('  template "' + tempName + '" not terminated before "' + match[2] + '" starts'); //OK
                    tempEnd = match.index;
                    addTemplate(tempName, tempStart, tempEnd);
                } else if (tempEnd !== match.index) {
                    console.log('  unrecognized characters at', tempEnd); //OK
                }
                tempName = match[2];
                tempStart = match.index + match[0].length;
                curDepth = 1;
            } else if (match[2] === tempName) {
                if (match[1] === '/') {
                    curDepth--;
                    if (curDepth === 0) {
                        addTemplate(tempName, tempStart, match.index);
                        tempEnd = match.index + match[0].length;
                        tempName = '';
                    }
                } else {
                    curDepth++;
                }
            }

            reTag.lastIndex = match.index + match[0].length;
            match = reTag.exec(finText);
        }

        if (tempName !== '') {
            console.log('  template "' + tempName + '" not terminated before end of file'); //OK
            tempEnd = finText.length;
            addTemplate(tempName, tempStart, tempEnd);
        }
            
        receiver(fullResult);
    });
}


function middleware(filename, isModifiable) {
    var contents = '';

    var lastCheck = new Date();
    var lastModify = null;

    return function (req, res, next) {
        if (!isModifiable && lastModify !== null) {
            res.send(contents);
            return;
        }
        var now = new Date();
        var elapse = now - lastCheck;
        if (elapse < 1000 && lastModify !== null) {
            res.send(contents);
            return;
        }
        lastCheck = now;
        fs.stat(filename, function (err, stats) {
            if (err !== null) {
                console.log('could not find dust template', filename); //OK
                res.send('');
                return;
            }
            var oldContents = contents;
            if (lastModify === null || stats.mtime > lastModify) {
                lastModify = stats.mtime;
                compileDustFile(filename, function (compiled) {
                    contents = compiled;
                    res.send(contents);
                });
            } else {
                res.send(oldContents);
            }
        });
    }
};

exports.middleware = middleware;
