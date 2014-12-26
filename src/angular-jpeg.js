/*global angular */

angular.module('angular-jpeg', []);

angular.module('angular-jpeg').constant('ANGULAR_JPEG_MARKERS', {
 startOfImage: 0xFFD8,
 endOfImage: 0xFFD9
});

angular.module('angular-jpeg').constant('ANGULAR_JPEG_ERRORS', {
  noFile: 'No file found',
  fileReadError: 'Unable to read file contents',
  unknown: 'Unknown',
  missingStartOfImageMarker: 'Missing start of image marker',
});

angular.module('angular-jpeg').service('AngularJpeg', function($q, $window, ANGULAR_JPEG_MARKERS, ANGULAR_JPEG_ERRORS) {
  'use strict';

  var ERRORS = ANGULAR_JPEG_ERRORS;
  var MARKERS = ANGULAR_JPEG_MARKERS;

  function readUInt16(uInt8Array, offset) {
    /*jshint bitwise: false*/
    return (uInt8Array[offset] << 8) | uInt8Array[offset + 1];
  }

  function validate(uInt8Array) {
    var validStart = readUInt16(uInt8Array, 0) === MARKERS.startOfImage;
    var validEnd = readUInt16(uInt8Array, uInt8Array.length - 2) === MARKERS.endOfImage;
    if (!validStart) {
      return $q.reject(ERRORS.missingStartOfImageMarker);
    }
    if (!validEnd) {
      return $q.reject(ERRORS.missingEndOfImageMarker);
    }
    return $q.when(uInt8Array);
  }

  function loadFromUInt8Array(uInt8Array) {
    return validate(uInt8Array);
  }

  function loadFromBuffer(buffer) {
    return loadFromUInt8Array(new $window.Uint8Array(buffer));
  }

  function loadFromFile(file) {
    if (!file) {
      return $q.reject(ERRORS.noFile);
    }
    var reader = new $window.FileReader();

    // Defer creation required to convert
    // onload to promise
    var deferred = $q.defer();

    reader.onload = function(e) {
      var buffer = e.target.result;

      loadFromBuffer(buffer).then(function(uInt8Array) {
        deferred.resolve(uInt8Array);
      }, function(error) {
        deferred.reject(error);
      });
    };

    reader.onerror = function() {
      deferred.reject(ERRORS.fileReadError);
    };

    reader.readAsArrayBuffer(file);

    return deferred.promise;
  }

  return {
    loadFromFile: loadFromFile,
    loadFromBuffer: loadFromBuffer,
    loadFromUInt8Array: loadFromUInt8Array
  };
});