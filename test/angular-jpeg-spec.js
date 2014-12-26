/*global describe, module, beforeEach, it, expect, inject*/

describe('AngularJpeg', function () {
  'use strict';
  var $rootScope;
  var AngularJpeg, MARKERS, ERRORS, FIXTURES;

  beforeEach(module('angular-jpeg'));

  function toUInt8(value) {
    /*jshint bitwise: false*/
    return [value >> 8, value << 8 >> 8];
  }

  beforeEach(inject(function(_$rootScope_, _AngularJpeg_, _ANGULAR_JPEG_MARKERS_, _ANGULAR_JPEG_ERRORS_) {
    $rootScope = _$rootScope_;
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
});