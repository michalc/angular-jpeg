angular-jpeg [![Build Status](https://travis-ci.org/michalc/angular-jpeg.svg?branch=master)](https://travis-ci.org/michalc/angular-jpeg) [![Coverage Status](https://img.shields.io/coveralls/michalc/angular-jpeg.svg?style=flat)](https://coveralls.io/r/michalc/angular-jpeg?branch=master) [![Code Climate](https://img.shields.io/codeclimate/github/michalc/angular-jpeg.svg?style=flat)](https://codeclimate.com/github/michalc/angular-jpeg) [![Codacy Badge](https://www.codacy.com/project/badge/880657ac0a9c4d178de727cfe12a2718)](https://www.codacy.com/public/michalcharemza/angular-jpeg)
============

AngularJS service to read JPEG files locally using pure Javascript. Decoding is done in a web worker to prevent the UI from hanging.

Thanks to

CRYX's note about the JPEG decoding algorithm.
Cristi Cuturicu
http://www.opennet.ru/docs/formats/jpeg.txt

Plan to use 

Christoph Loeffler, Adriaan Lieenberg, and George S. Moschytz
Practical Fast 1-D DCT Algorithms with 11 Multiplications
Acoustics, Speech, and Signal Processing, 1989. ICASSP-89., 1989 International Conference on, 988-991.