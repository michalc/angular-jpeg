/*global angular, describe, module, beforeEach, it, expect, inject, jasmine*/

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

describe('Worker', function () {
  'use strict';
  var Worker;
  var ANGULAR_JPEG_CONFIG;
  var workerInstance;
  var WorkerMock;
  var $rootScope;
  beforeEach(module('angular-jpeg'));

  beforeEach(module(function($provide) {
    WorkerMock = function(args) {
      this.args = args;
      this.postMessage = jasmine.createSpy('postMessage');
      workerInstance = this;
    };
    workerInstance = null;
    $provide.value('$window', {
      Worker: WorkerMock
    });
  }));

  beforeEach(inject(function(_Worker_, _ANGULAR_JPEG_CONFIG_, _$rootScope_) {
    Worker = _Worker_;
    ANGULAR_JPEG_CONFIG = _ANGULAR_JPEG_CONFIG_;
    $rootScope = _$rootScope_;
  }));

  it('creates a Worker instance', function() {
    expect(workerInstance instanceof WorkerMock).toBe(true);
  });

  it('passes the correct path to the Worker instance', function() {
    expect(workerInstance.args).toBe(ANGULAR_JPEG_CONFIG.ANGULAR_JPEG_PATH + '/angular-jpeg-worker.js');
  });

  it('passes config to the instance', function() {
    expect(workerInstance.postMessage).toHaveBeenCalledWith(ANGULAR_JPEG_CONFIG);
    workerInstance.postMessage.calls.reset();
  });

  describe('sending a command', function() {
    var options = {
      command: 'test-command',
      args: ['arg1', 'arg2']
    };

    it('passes the options to postMessage with id of 1', function() {
      var options = {
        command: 'test-command',
        args: ['arg1', 'arg2']
      };

      Worker(options);
      expect(workerInstance.postMessage).toHaveBeenCalledWith({
        id: 1,
        command: options.command,
        args: options.args
      });
    });

    it('passes a second call with id of 2', function() {
      Worker(options);
      Worker(options);
      expect(workerInstance.postMessage).toHaveBeenCalledWith(jasmine.objectContaining({
        id: 2
      }));
    });
  });

  describe('resolving a command', function() {
    it('done by posting a message with type "resolve"', function() {
      var correctResults = {};
      var returnedResults;
      Worker({command: 'dummy'}).then(function(_returnedResults_) {
        returnedResults = _returnedResults_;
      });
      workerInstance.onmessage({
        data: {
          id: 1,
          type: 'resolve',
          data: correctResults
        }
      });
      $rootScope.$apply();
      expect(returnedResults).toBe(correctResults);
    });
  });

  describe('multiple in-progress commands', function() {
    it('resolved correctly', function() {
      var correctResults1 = {};
      var correctResults2 = {};
      var returnedResults1;
      var returnedResults2;
      Worker({command: 'dummy'}).then(function(_returnedResults1_) {
        returnedResults1 = _returnedResults1_;
      });
      Worker({command: 'dummy'}).then(function(_returnedResults2_) {
        returnedResults2 = _returnedResults2_;
      });
      workerInstance.onmessage({
        data: {
          id: 2,
          type: 'resolve',
          data: correctResults2
        }
      });
      workerInstance.onmessage({
        data: {
          id: 1,
          type: 'resolve',
          data: correctResults1
        }
      });
      $rootScope.$apply();
      expect(returnedResults1).toBe(correctResults1);
      expect(returnedResults2).toBe(correctResults2);
    });
  });

  describe('rejecting a command', function() {
    it('done by posting a message with type "reject"', function() {
      var correctError = {};
      var returnedError;
      Worker({command: 'dummy'}).catch(function(_returnedError_) {
        returnedError = _returnedError_;
      });
      workerInstance.onmessage({
        data: {
          id: 1,
          type: 'reject',
          data: correctError
        }
      });
      $rootScope.$apply();
      expect(returnedError).toBe(correctError);
    });
  });

  describe('notifying a command', function() {
    it('done by posting a message with type "notify"', function() {
      var correctNotification = {};
      var returnedNotification;
      Worker({command: 'dummy'}).then(null, null, function(_returnedNotification_) {
        returnedNotification = _returnedNotification_;
      });
      workerInstance.onmessage({
        data: {
          id: 1,
          type: 'notify',
          data: correctNotification
        }
      });
      $rootScope.$apply();
      expect(correctNotification).toBe(correctNotification);
    });
  });
});
