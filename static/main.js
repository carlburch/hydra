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
var hydra = (function () {
    "use strict";

    var exports = {};

    (function () {
        var url = window.location.pathname;
        var i0 = url[0] === '/' ? 1 : 0;
        var i1 = url.indexOf('/', i0);
        if (i1 < 0) i1 = url.length;
        exports.course = url.substring(i0, i1);
    }());

    //
    /// Configuring functions for showing different "pages"
    //

    var page = {};

    exports.doNothing = function () { };

    exports.addPage = function (id, properties) {
        page[id] = properties;
        if (properties.hasOwnProperty('configure')) {
            properties.configure();
        }
    };

    exports.showPage = function (showId, suppressPrepare, next) {
        // sequence: beforeHide, hide, afterHide, beforeShow, show, afterShow
        var toShow = $('#' + showId);
        var toHide = $('.page:visible');
        var hideId = toHide.length === 0 ? null : toHide.attr('id');
        if (showId !== hideId) {
            var afterHide = function () {
                if (toShow.length === 0) {
                    next();
                } else {
                    callPageFunction(showId, suppressPrepare ? null : 'beforeShow', function () {
                        toShow.fadeIn(100, function () {
                            callPageFunction(showId, 'afterShow', next);
                        });
                    });
                }
            };
            if (toHide.length === 0) {
                afterHide();
            } else {
                callPageFunction(hideId, 'beforeHide', function () {
                    toHide.fadeOut(100, function () {
                        callPageFunction(hideId, 'afterHide', afterHide);
                    });
                });
            }
        }
    };

    function callPageFunction(id, propertyName
            /*, [argument0], [argument1], ..., next */) {
        if (id !== null && page.hasOwnProperty(id)) {
            var p = page[id];
            if (propertyName !== null && p.hasOwnProperty(propertyName)) {
                p[propertyName].apply(p, Array.prototype.slice.call(arguments, 2));
                return;
            }
        }
        var f = arguments[arguments.length - 1];
        if (f) {
            f();
        }
    }

    function pageShower(pageId) {
        return function (evnt) {
            evnt.preventDefault();
            exports.showPage(pageId, false, exports.doNothing);
        };
    }

    //
    /// Configuring pseudo-navigation, including support of Back button
    //

    function goToUrl(url, title, data) {
        var fullUrl = '/' + hydra.course;
        if (url) {
            if (url[0] === '/') {
                fullUrl += url;
            } else {
                fullUrl += '/' + url;
            }
        }
        History.pushState(data, title, fullUrl);
    }

    exports.goToUrl = goToUrl;

    function loadUrl() {
        var rawPath = window.location.pathname;
        var state = History.getState();
        var path = rawPath;
        if (path[0] === '/') {
            path = path.substring(1);
        }
        path = path.split('/');
        if (path[path.length - 1] === '') {
            path.splice(path.length - 1, 1);
        }
        var handled = true;
        if (path.length === 1) {
            // sss                    Show list of all lessons
            if (rawPath[rawPath.length - 1] !== '/') {
                window.location.pathname = rawPath + '/';
            }
            exports.showPage('lessons', false, exports.doNothing);
        } else if (path.length === 2) {
            if (path[1] === 'users') {
                // sss/users          Show list of users
                hydra.showPage('users');
            } else if (path[1] === 'grades') {
                // sss/grades         Show grades for logged-in user
                hydraUser.loadGrades(null);
            } else {
                // sss/xxx            Show lesson xxx
                if (rawPath[rawPath.length - 1] !== '/') {
                    window.location.pathname = rawPath + '/';
                }
                hydraLesson.loadLesson(path[1], state.data.title);
            }
        } else if (path.length === 3) {
            if (path[1] === 'grades') {
                // sss/grades/uuu     Show grades for user uuu
                hydraUser.loadGrades(path[2]);
            } else {
                handled = false;
            }
        } else if (path.length === 4) {
            if (path[1] === 'grade') {
                // sss/grade/xxx/yyy  Grade item yyy from lesson xxx
                hydraGrade.loadProblemGrades(path[2], path[3], state.data.title);
            } else {
                handled = false;
            }
        } else {
            handled = false;
        }
        if (!handled) {
            exports.showPage('lessons', false, exports.doNothing);
        }
    }

    History.Adapter.bind(window, 'statechange', loadUrl);

    //
    /// Dust configuration
    //

    $(document).ready(function () {
        dust.filters.nlbr = function (value) {
            var escaped = dust.filters.h(value);
            var added = escaped.replace(/\n/g, '<br>');
            return added;
        };
        dust.filters.nbsp = function (value) {
            return value.replace(/ /g, '&nbsp;');
        };
    });

    exports.renderDust = function (jquerySet, dustId, data, next) {
        dust.render(dustId, data, function (err, out) {
            if (err !== null) {
                jquerySet.text('template error: ' + err);
            } else {
                jquerySet.html(out);
            }
            if (next !== null && next !== undefined) {
                next();
            }
        });
    };

    //
    /// Other configuration
    //

    function setLoggedIn(value, isEditor) {
        if (value) {
            $('#tab_list').show();
            if (isEditor) {
                $('.show_for_editor').show();
            } else {
                $('.show_for_editor').hide();
            }
            loadUrl();
        } else {
            exports.showPage('login', true, exports.doNothing);
            $('.show_for_editor').hide();
            $('#tab_list').hide();
        }
    }

    exports.processResponse = function (data) {
        if (!data.ok && data.login) {
            $('#login_err').text(data.message);
            setLoggedIn(false);
            return false;
        } else {
            if (data.hasOwnProperty('editor')) {
                if (data.editor) {
                    $('.show_for_editor').show();
                } else {
                    $('.show_for_editor').hide();
                }
            }
            return true;
        }
    };

    $('#tab_register').click(pageShower('register'));
    $('#tab_login').click(pageShower('login'));
    $('#tab_lessons').click(function (evnt) {
        evnt.preventDefault();
        goToUrl('/', 'Lessons', {});
    });
    $('#tab_gradelist').click(function (evnt) {
        evnt.preventDefault();
        goToUrl('grades', 'Grades', {});
    });
    $('#tab_users').click(function (evnt) {
        evnt.preventDefault();
        goToUrl('users', 'Users', {});
    });
    $('#tab_profile').click(pageShower('profile'));
    $('#tab_logout').click(pageShower('logout'));

    //
    /// Login and Register pages
    //

    exports.addPage('register', {
        configure: function () {
            $('#register').submit(function (evnt) {
                evnt.preventDefault();

                var login = $('#register_login').val();
                var password = $('#register_password').val();
                var password2 = $('#register_password2').val();
                var first = $('#register_first').val();
                var last = $('#register_last').val();
                var email = $('#register_email').val();

                if (password !== password2) {
                    $('#register_err').text('Passwords do not match.');
                    return;
                }

                $.ajax({
                    url: '/user/register',
                    method: 'post',
                    data: { course: hydra.course, login: login, password: password,
                            first: first, last: last, email: email },
                    error: function (jqXHR, textStatus, errorThrown) {
                        $('#register_err').text('Server not available');
                    },
                    success: function (data, textStatus, jqXHR) {
                        if (data.ok) {
                            $('#register_password').val('');
                            $('#register_password2').val('');
                            setLoggedIn(true, data.editor);
                        } else {
                            $('#register_err').text(data.message);
                        }
                    }
                });
            });
        },
        beforeShow: function (next) {
            $('#register_password').val('');
            $('#register_password2').val('');
            $('#register_err').text('');
            next(function (subnext) {
                $('#register_login').focus().select();
                subnext();
            });
        }
    });

    exports.addPage('login', {
        configure: function () {
            $('#login').submit(function (evnt) {
                evnt.preventDefault();

                var login = $('#login_login').val();
                var password = $('#login_password').val();

                $.ajax({
                    url: '/user/login',
                    method: 'post',
                    data: { course: hydra.course, login: login, password: password },
                    error: function (jqXHR, textStatus, errorThrown) {
                        $('#login_err').text('Server not available');
                    },
                    success: function (data, textStatus, jqXHR) {
                        if (data.ok) {
                            $('#login_password').val('');
                            setLoggedIn(true, data.editor);
                        } else {
                            $('#login_err').text(data.message);
                        }
                    }
                });
            });
        },
        beforeShow: function (next) {
            $('#login_password').val('');
            $('#login_err').text('');
            next(function (subnext) {
                $('#login_login').focus().select();
                subnext();
            });
        }
    });

    exports.addPage('logout', {
        afterShow: function (next) {
            $.post('/user/logout', {}, function (data, textStatus) {
                $('#login_err').text('You are now logged out.');
                setLoggedIn(false);
                goToUrl('/', 'Lessons', null);
            });
        }
    });

    //
    /// Lessons page
    //

    exports.addPage('lessons', {
        beforeShow: function (next) {
            $('#lessons').html('<h1>Lessons</h1>\n'
                + '<p>Loading list of lessons&hellip;</p>');
            $.ajax({
                method: 'get',
                url: '/lesson/list',
                data: {},
                cache: false,
                success: function (data, textStatus) {
                    if (exports.processResponse(data)) {
                        exports.renderDust($('#lessons'), 'lessons', data, next);
                    }
                }
            });
        }
    });

    $(document).on('click', '.lesson_href', function (evnt) {
        evnt.preventDefault();
        var id = $(this).attr('lesson');
        var title = $(this).text();
        goToUrl(id + '/', title, { title: title });
    });

    //
    /// On load
    //

    $(document).ready(function () {
        setLoggedIn(true);
        loadUrl();
    });

    return exports;
}());
