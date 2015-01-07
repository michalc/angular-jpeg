/*global angular, describe, module, beforeEach, it, expect, inject*/

describe('AngularJpeg', function () {
  'use strict';
  var AngularJpeg;
  var workerArgs;
  var workerReturnValue;

  beforeEach(module('angular-jpeg'));

  beforeEach(module(function($provide) {
    workerArgs = null;
    $provide.value('Worker', function(args) {
      workerArgs = args;
      return workerReturnValue;
    });
  }));

  beforeEach(inject(function(_AngularJpeg_) {
    AngularJpeg = _AngularJpeg_;
  }));

  var COMMANDS = [
    'loadSegmentsFromFile',
    '_huffmanTreesFromSegments',
    '_decodeQuantizationTableSegments',
    '_decodeStartOfScanSegmentContents',
    '_decodeStartOfFrameBaselineDCT'
  ];

  it('has not other exposed values than those tested', function() {
    expect(Object.keys(AngularJpeg)).toEqual(COMMANDS);
  });

  // Is there better way than this? Seems too many tests...
  angular.forEach(COMMANDS, function(command) {
    describe(command, function() {
      var args, func, returned;

      beforeEach(function() {
        workerReturnValue = {};
        args = {};
        func = AngularJpeg[command];
        returned = func(args);
      });

      it('returns the result of a call to Worker()', function() {
        expect(returned).toBe(workerReturnValue);
      });

      it('passes a true array to Worker as the args terms', function() {
        expect(angular.isArray(workerArgs.args)).toBe(true);
      });

      it('passes the correct structure to Worker', function() {
        expect(workerArgs).toEqual({
          command: command,
          args: [args]
        });
      });
    });
  });
});