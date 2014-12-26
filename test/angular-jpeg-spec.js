/*global describe, module, beforeEach, it, expect, inject, jasmine, spyOn*/

describe('AngularJpeg', function () {
  'use strict';
  var $rootScope, $q;
  var AngularJpeg, MARKERS, ERRORS, FIXTURES;

  var readAsArrayBuffer, fileReader, uInt8Array;
  var FileReaderMock = function() {
    fileReader = this;
    this.readAsArrayBuffer = readAsArrayBuffer;
  };
  var FileMock = function() {};
  var BufferMock = function() {};
  var Uint8ArrayMock = function(buffer) {
    uInt8Array = this;
    this.buffer = buffer;
  };

  beforeEach(module('angular-jpeg', function($provide) {
    $provide.value('$window', {
      FileReader: FileReaderMock,
      Uint8Array: Uint8ArrayMock
    });
  }));

  function toUInt8(value) {
    /*jshint bitwise: false*/
    return [value >> 8, value << 8 >> 8];
  }

  beforeEach(inject(function(_$rootScope_, _$q_, _AngularJpeg_, _ANGULAR_JPEG_MARKERS_, _ANGULAR_JPEG_ERRORS_) {
    $rootScope = _$rootScope_;
    $q = _$q_;
    AngularJpeg = _AngularJpeg_;
    MARKERS = _ANGULAR_JPEG_MARKERS_;
    ERRORS = _ANGULAR_JPEG_ERRORS_;
    FIXTURES = {
      withoutStartMarker: toUInt8(MARKERS.endOfImage),
      withoutEndMarker: toUInt8(MARKERS.startOfImage),
      withStartAndEndMarker: toUInt8(MARKERS.startOfImage).concat(toUInt8(MARKERS.endOfImage))
    };
  }));

  describe('loadFromUInt8Array', function() {
    it('should reject data without a start marker', function() {
      var error;
      AngularJpeg.loadFromUInt8Array(FIXTURES.withoutStartMarker).catch(function(_error_) {
        error = _error_;
      });
      $rootScope.$digest();
      expect(error).toBe(ERRORS.missingStartOfImageMarker);
    });

    it('should reject data without an end marker', function() {
      var error;
      AngularJpeg.loadFromUInt8Array(FIXTURES.withoutEndMarker).catch(function(_error_) {
        error = _error_;
      });
      $rootScope.$digest();
      expect(error).toBe(ERRORS.missingEndOfImageMarker);
    });

    it('should load data with start and end markers', function() {
      var results;
      AngularJpeg.loadFromUInt8Array(FIXTURES.withStartAndEndMarker).then(function(_results_) {
        results = _results_;
      });
      $rootScope.$digest();
      expect(results).toBe(FIXTURES.withStartAndEndMarker);
    });
  });

  describe('loadFromBuffer', function() {
    it('should pass a new Uint8Array to loadFromUInt8Array', function() {
      spyOn(AngularJpeg, 'loadFromUInt8Array');
      var buffer = new BufferMock();
      AngularJpeg.loadFromBuffer(buffer);
      expect(AngularJpeg.loadFromUInt8Array).toHaveBeenCalledWith(uInt8Array);
      expect(uInt8Array.buffer).toBe(buffer);
    });
  });

  describe('loadFromFile', function() {
    var loadFromBufferDeferred;
    var readAsArrayBufferResults;
    var loadFromBufferResults;
    var loadFromBufferError;
    var loadFromFileResults;
    var loadFromFileError;

    beforeEach(function() {
      loadFromBufferDeferred = $q.defer();
      spyOn(AngularJpeg, 'loadFromBuffer').and.returnValue(loadFromBufferDeferred.promise);
      readAsArrayBufferResults = {};
      loadFromBufferResults = {};
      loadFromBufferError = {};
      loadFromFileResults = null;
      loadFromFileError = null;
    });

    it('should reject if no file passed', function() {
      AngularJpeg.loadFromFile(null).catch(function(_loadFromFileError_) {
        loadFromFileError = _loadFromFileError_;
      });
      $rootScope.$digest();
      expect(loadFromFileError).toBe(ERRORS.noFile);
    });


    it('should pass the file to readAsArrayBuffer', function() {
      readAsArrayBuffer = jasmine.createSpy('readAsArrayBuffer');
      var file = new FileMock();
      AngularJpeg.loadFromFile(file);
      expect(readAsArrayBuffer).toHaveBeenCalledWith(file);
    });

    describe('on file read error', function() {
      it('should reject the promise on readFromBuffer error', function() {
        readAsArrayBuffer = function() {
          fileReader.onerror();
        };
        AngularJpeg.loadFromFile(new FileMock()).catch(function(_loadFromFileError_) {
          loadFromFileError = _loadFromFileError_;
        });
        $rootScope.$digest();
        expect(loadFromFileError).toBe(ERRORS.fileReadError);
      });
    });

    describe('on file read success', function() {
      beforeEach(function() {
        readAsArrayBuffer = function() {
          fileReader.onload({
            target: {
              result: readAsArrayBufferResults
            }
          });
        };
        AngularJpeg.loadFromFile(new FileMock()).then(function(_loadFromFileResults_) {
          loadFromFileResults = _loadFromFileResults_;
        }, function(_loadFromFileError_) {
          loadFromFileError = _loadFromFileError_;
        });
      });

      it('should pass the results of readAsArrayBuffer to loadFromBuffer', function() {
        expect(AngularJpeg.loadFromBuffer).toHaveBeenCalledWith(readAsArrayBufferResults);
      });

      describe('and on validation error', function() {
        it('should reject with the error from loadFromBuffer', function() {
          loadFromBufferDeferred.reject(loadFromBufferError);
          $rootScope.$digest();
          expect(loadFromFileError).toBe(loadFromBufferError);
        });
      });

      describe('and on loadFromBufferSuccess', function() {
        it('should resolve with the results from loadFromBuffer', function() {
          loadFromBufferDeferred.resolve(loadFromBufferResults);
          $rootScope.$digest();
          expect(loadFromFileResults).toBe(loadFromBufferResults);
        });
      });
    });
  });
});