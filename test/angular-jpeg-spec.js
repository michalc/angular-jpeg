/*global describe, module, beforeEach, afterEach, it, expect, inject, jasmine, spyOn*/

describe('AngularJpeg', function () {
  'use strict';
  var $window, $rootScope, $q;
  var AngularJpeg, TYPES, ERRORS, FIXTURES, PREFIX;

  var readAsArrayBuffer, fileReader;
  var FileReaderMock = function() {
    fileReader = this;
    this.readAsArrayBuffer = readAsArrayBuffer;
  };
  var FileMock = function() {};

  function toBuffer(array) {
    var buffer = new $window.ArrayBuffer(array.length);
    var view = new $window.Uint8Array(buffer);
    view.set(array);
    return buffer;
  }

  beforeEach(module('angular-jpeg'));

  beforeEach(inject(function(_$window_, _$rootScope_, _$q_, _AngularJpeg_,
    _ANGULAR_JPEG_SEGMENT_TYPES_,
    _ANGULAR_JPEG_SEGMENT_PREFIX_,
    _ANGULAR_JPEG_ERRORS_) {
    $window = _$window_;
    $rootScope = _$rootScope_;
    $q = _$q_;
    AngularJpeg = _AngularJpeg_;
    ERRORS = _ANGULAR_JPEG_ERRORS_;
    TYPES = _ANGULAR_JPEG_SEGMENT_TYPES_;
    PREFIX = _ANGULAR_JPEG_SEGMENT_PREFIX_;

    FIXTURES = {
      withoutSegments: [PREFIX, PREFIX],
      withoutStartMarker: [PREFIX, TYPES.endOfImage.marker],
      withoutEndMarker: [PREFIX, TYPES.startOfImage.marker],
      withStartAndEndMarker: [PREFIX, TYPES.startOfImage.marker, PREFIX, TYPES.endOfImage.marker],
      withUnsupportedMarker: [
        PREFIX, TYPES.startOfImage.marker,
        PREFIX, TYPES.startOfFrameExtendedSequentialDCT.marker, 0x0, 0x2,
        PREFIX, TYPES.endOfImage.marker
      ],
      withUnrecognisedMarker: [
        PREFIX, TYPES.startOfImage.marker,
        PREFIX, 0x02,
        PREFIX, TYPES.endOfImage.marker
      ],
      withSegmentData: [
        PREFIX, TYPES.startOfImage.marker,
        PREFIX, TYPES.comment.marker, 0x0, 0x3, 0x0,
        PREFIX, TYPES.endOfImage.marker
      ],
      withScanData: [
        PREFIX, TYPES.startOfImage.marker,
        PREFIX, TYPES.startOfScan.marker, 0x0, 0x2, 0x0,
        PREFIX, TYPES.endOfImage.marker
      ]
    };
  }));

  describe('loadFromBuffer', function() {
    it('should reject data without a start marker', function() {
      var error;
      AngularJpeg.loadFromBuffer(toBuffer(FIXTURES.withoutStartMarker)).catch(function(_error_) {
        error = _error_;
      });
      $rootScope.$digest();
      expect(error).toBe(ERRORS.missingStartOfImageMarker);
    });

    it('should reject data without an end marker', function() {
      var error;
      AngularJpeg.loadFromBuffer(toBuffer(FIXTURES.withoutEndMarker)).catch(function(_error_) {
        error = _error_;
      });
      $rootScope.$digest();
      expect(error).toBe(ERRORS.missingEndOfImageMarker);
    });

    it('reject data without any segments', function() {
      var error;
      AngularJpeg.loadFromBuffer(toBuffer(FIXTURES.withoutSegments)).catch(function(_error_) {
        error = _error_;
      });
      $rootScope.$digest();
      expect(error).toBe(ERRORS.noSegments);
    });

    it('reject data with unsupported marker', function() {
      var error;
      AngularJpeg.loadFromBuffer(toBuffer(FIXTURES.withUnsupportedMarker)).catch(function(_error_) {
        error = _error_;
      });
      $rootScope.$digest();
      expect(error).toBe(ERRORS.unsupportedMarker + ': ' + TYPES.startOfFrameExtendedSequentialDCT.marker);
    });

    it('reject data with unrecogised marker', function() {
      var error;
      AngularJpeg.loadFromBuffer(toBuffer(FIXTURES.withUnrecognisedMarker)).catch(function(_error_) {
        error = _error_;
      });
      $rootScope.$digest();
      expect(error).toBe(ERRORS.unrecognisedMarker + ': ' + 0x02);
    });

    it('should load data with start and end markers', function() {
      var results;
      AngularJpeg.loadFromBuffer(toBuffer(FIXTURES.withStartAndEndMarker)).then(function(_results_) {
        results = _results_;
      });
      $rootScope.$digest();
      expect(results.length).toBe(2);
      expect(results).toEqual([{
        type: TYPES.startOfImage,
        segmentOffset: 2,
        segmentSize: 0,
        segmentContents: new $window.Uint8Array(),
        dataOffset: 2,
        dataSize: 0,
        dataContents: new $window.Uint8Array()
      }, {
        type: TYPES.endOfImage,
        segmentOffset: 4,
        segmentSize: 0,
        segmentContents: new $window.Uint8Array(),
        dataOffset: 4,
        dataSize: 0,
        dataContents: new $window.Uint8Array()
      }]);
    });

    it('should load data with non empty segment', function() {
      var results;
      var buffer = toBuffer(FIXTURES.withSegmentData);
      AngularJpeg.loadFromBuffer(buffer).then(function(_results_) {
        results = _results_;
      });
      $rootScope.$digest();
      expect(results).toEqual([{
        type: TYPES.startOfImage,
        segmentOffset: 2,
        segmentSize: 0,
        segmentContents: new $window.Uint8Array(),
        dataOffset: 2,
        dataSize: 0,
        dataContents: new $window.Uint8Array()
      }, {
        type: TYPES.comment,
        segmentOffset: 6,
        segmentSize: 1,
        segmentContents: new $window.Uint8Array(buffer, 6, 1),
        dataOffset: 7,
        dataSize: 0,
        dataContents: new $window.Uint8Array()
      }, {
        type: TYPES.endOfImage,
        segmentOffset: 9,
        segmentSize: 0,
        segmentContents: new $window.Uint8Array(),
        dataOffset: 9,
        dataSize: 0,
        dataContents: new $window.Uint8Array()
      }]);
    });

    it('should load data with scan data', function() {
      var results;
      var buffer = toBuffer(FIXTURES.withScanData);
      AngularJpeg.loadFromBuffer(toBuffer(FIXTURES.withScanData)).then(function(_results_) {
        results = _results_;
      });
      $rootScope.$digest();
      expect(results).toEqual([{
        type: TYPES.startOfImage,
        segmentOffset: 2,
        segmentSize: 0,
        segmentContents: new $window.Uint8Array(),
        dataOffset: 2,
        dataSize: 0,
        dataContents: new $window.Uint8Array()
      }, {
        type: TYPES.startOfScan,
        segmentOffset: 6,
        segmentSize: 0,
        segmentContents: new $window.Uint8Array(),
        dataOffset: 6,
        dataSize: 1,
        dataContents: new $window.Uint8Array(buffer, 6, 1)
      }, {
        type: TYPES.endOfImage,
        segmentOffset: 9,
        segmentSize: 0,
        segmentContents: new $window.Uint8Array(),
        dataOffset: 9,
        dataSize: 0,
        dataContents: new $window.Uint8Array()
      }]);
    });
  });

  describe('loadFromFile', function() {
    var loadFromBufferDeferred;
    var readAsArrayBufferResults;
    var loadFromBufferResults;
    var loadFromBufferError;
    var loadFromFileResults;
    var loadFromFileError;
    var originalFileReader;

    beforeEach(function() {
      originalFileReader = $window.FileReader;
      $window.FileReader = FileReaderMock;
    });

    afterEach(function() {
      $window.FileReader = originalFileReader;
      originalFileReader = null;
    });

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