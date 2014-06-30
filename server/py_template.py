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
import sys
import json
from io import StringIO

class MyMap():
    pass
_g = MyMap()
_g.sys = sys
_g.json = json
_g.StringIO = StringIO
_g.stdout = _g.sys.stdout
del sys
del json
del StringIO
del MyMap

# parameters from database/user
def _g_compile(code, name, isUser=False):
    try:
        return compile(code, name, 'exec')
    except SyntaxError as e:
        result = { 'ok': True, 'verdict': 0 if isUser else -2,
            'file': name, 'line': e.lineno, 'offset': e.offset }
        if isUser:
            result['message'] = str(e)
        else:
            result['message'] = 'Error in {0}: {1}'.format(name, str(e))
        _g.json.dump(result, _g.stdout)
        _g.sys.exit(0)
_g.userCode = _g_compile("""{{userCode}}""", 'usercode', True)
_g.canSave = """{{usedVars}}""" != ''
if _g.canSave:
    _g.saveCode = _g_compile("""_g.savedVars = {{usedVars}}""", 'vars')
    _g.restoreCode = _g_compile("""{{usedVars}} = _g.savedVars""", 'vars')
_g.preCode = _g_compile("""{{preCode}}""", 'precode')
_g.solutionCode = _g_compile("""{{solutionCode}}""", 'solution')
_g.postCode = _g_compile("""{{postCode}}""", 'postcode')
del _g_compile

def _g_safeexec(code, name, isUser=False):
    try:
        exec(code, globals())
        return None
    except Exception as e:
        test = getattr(_g, 'testInput', '???')
        if isUser:
            msg = '{0}: {1}'.format(type(e).__name__, str(e))
            return { 'verdict': 1, 'test': test, 'message': msg }
        else:
            msg = '{0}: {1}: {2}'.format(name, type(e).__name__, str(e))
            return { 'verdict': -1, 'test': test, 'message': msg }

_g.allVerdict = 10
_g.numCorrect = 0;
_g.tests = []
for testIter in range({{numIters}}):
    _g.testIter = testIter
    _g.result = None
    try:
        _g.sys.stdout = _g.StringIO()
        _g.result = _g_safeexec(_g.preCode, 'precode')
        if _g.result is not None:
            continue
        _g.testInput = _g.sys.stdout.getvalue()

        # execute user code first (so it doesn't access solution variables)
        if _g.canSave:
            _g.result = _g_safeexec(_g.saveCode, 'vars')
            if _g.result is not None:
                continue
        _g.sys.stdin = _g.StringIO(_g.testInput)
        _g.sys.stdout = _g.StringIO()
        _g.result = _g_safeexec(_g.userCode, 'usercode', True)
        if _g.result is not None:
            continue
        _g.result = _g_safeexec(_g.postCode, 'postcode')
        if _g.result is not None:
            continue
        _g.userOutput = _g.sys.stdout.getvalue()

        # now execute solution answer to determine desired output
        if _g.canSave:
            _g.result = _g_safeexec(_g.restoreCode, 'vars')
            if _g.result is not None:
                continue
        _g.sys.stdin = _g.StringIO(_g.testInput)
        _g.sys.stdout = _g.StringIO()
        _g.result = _g_safeexec(_g.solutionCode, 'solution')
        if _g.result is not None:
            continue
        _g.result = _g_safeexec(_g.postCode, 'postcode')
        if _g.result is not None:
            continue
        _g.solutionOutput = _g.sys.stdout.getvalue()

        _g.thisMatch = _g.solutionOutput == _g.userOutput
        if not _g.thisMatch:
            solnLines = _g.solutionOutput.splitlines()
            userLines = _g.userOutput.splitlines()
            for i in range(min(len(solnLines), len(userLines))):
                if solnLines[i] != userLines[i]:
                    _g.mismatchError = ('First mismatch on line {0}'
                        .format(i + 1))
                    break
            else:
                if len(solnLines) > len(userLines):
                    _g.mismatchError = ('Output is missing lines at end')
                elif len(userLines) > len(solnLines):
                    _g.mismatchError = ('Output has extra lines at end')
                else:
                    _g.thisMatch = True
            del solnLines, userLines
        if _g.thisMatch:
            _g.numCorrect += 1
            _g.result = { 'verdict': 3, 'test': _g.testInput,
                'result': _g.userOutput, 'solution': _g.solutionOutput }
        else:
            _g.result = { 'verdict': 2, 'test': _g.testInput,
                'result': _g.userOutput, 'solution': _g.solutionOutput,
                'message': _g.mismatchError }
    finally:
        _g.tests.append(_g.result)
        _g.allVerdict = min(_g.allVerdict, _g.result['verdict'])
        testIter = _g.testIter

_g.json.dump({ 'ok': True, 'verdict': _g.allVerdict,
        'correct': _g.numCorrect, 'tests': _g.tests },
    _g.stdout)
