hydra
=====

This implements a Web site for Intro CS courses, where students can
solve wide variety of exercises composed by an instructor.  It is
written for a Python-based course.  The site itself is almost entirely
written in JavaScript, using Node.js and MySQL for storing student
submissions and grades (and jQuery and Dust in the browser); but an
instructor can manage a class, including the composition of exercises,
without dealing with the JavaScript code.

Lessons file structure
----------------------

The instructor develops problems in a set of text files, using
the following hierarchy:

* *course* is a directory found in the root directory, giving the name
  of the course. A student navigates to the site using
  `http://sitename.edu/`*course*/.

* *course*`/index.hy` is a file specifying the course attributes using the
  `.hy` format described below:

  - `course` (required): title of course

  - `lessons`: whitespace-separated list of lessons

* *course*`/`*lesson* is a subdirectory for an individual lesson.

* *course*`/`*lesson*`/index.hy` specifies the lesson attributes using the
  `.hy` format described below:

  - `lesson` (required): title of lesson

  - `expires`: ISO-formatted time (e.g., `1991-10-05T07:41:06+0200`)
     specifying when students cannot edit their solutions any further.

  - `problems`: whitespace-separated list of problem identifiers

* *course*`/`*lesson*`/`*problem*`.hy` specifies the problem attributes:
  using the `.hy` format described below:

  - `problem` (required): title of problem

  - `html`: description of problem, written in HTML

  - `initcode`: initial code shown to the student

  - `solution`: correct solution to problem

  - `numiters`: how many testing iterations to perform

  - `precode`: code to be executed before executing a test

  - `postcode`: code to be executed following execution of question

`.hy` file format
-----------------

All `.hy` files list a series of properties and their values. A line
beginning with a dollar sign signals the beginning of a new property
definition: The property name goes immediately after the dollar sign,
and all subsequent characters after the first whitespace character are
the property's value (including any subsequent lines that don't begin with
a dollar sign).

```
$problem Square

$html
<p>The variable <tt>num</tt> holds a number.
Set the variable <tt>num2</tt> to be that number's square.</p>

$initcode
num2 =

$solution
num2 = num ** 2

$numiters 4

$precode
import random
num = random.randrange(0, 100)

$postcode
print(num)
```
