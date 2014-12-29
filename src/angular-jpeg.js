/*global angular*/

angular.module('angular-jpeg', []);

angular.module('angular-jpeg').constant('ANGULAR_JPEG_ERRORS', {
  noFile: 'No file found',
  fileReadError: 'Unable to read file contents',
  unknown: 'Unknown',
  unrecognisedMarker: 'Unrecognised marker',
  unsupportedMarker: 'Unsupported marker',
  noSegments: 'No segments found',
  missingStartOfImageMarker: 'Missing start of image marker',
  missingEndOfImageMarker: 'Missing end of image marker'
});

angular.module('angular-jpeg').service('AngularJpeg', function($q, $window,
  ANGULAR_JPEG_SEGMENT_TYPES,
  ANGULAR_JPEG_SEGMENT_PREFIX,
  ANGULAR_JPEG_ERRORS) {
  'use strict';

  var ERRORS = ANGULAR_JPEG_ERRORS;
  var TYPES = ANGULAR_JPEG_SEGMENT_TYPES;
  var PREFIX = ANGULAR_JPEG_SEGMENT_PREFIX;
  var self = this;

  function readUInt16BigEndian(uInt8Array, offset) {
    /*jshint bitwise: false*/
    return (uInt8Array[offset] << 8) | uInt8Array[offset + 1];
  }

  // For convenience
  for (var name in TYPES) {
    /* istanbul ignore else */
    if (TYPES.hasOwnProperty(name)) {
      TYPES[name].name = name;
    }
  }

  function typeFromMarker(marker) {
    var type, key;
    for (key in TYPES) {
      /* istanbul ignore else */
      if (TYPES.hasOwnProperty(key)) {
        type = TYPES[key];
        if (marker === type.marker && !type.unsupported) {
          return TYPES[key];
        }
        if (marker === type.marker && type.unsupported) {
          throw ERRORS.unsupportedMarker + ': ' + marker;
        }
      }
    }
    throw ERRORS.unrecognisedMarker + ': ' + marker;
  }

  function getSegmentOffsets(uInt8Array) {
    var segments = [];
    var offset = 0;
    var hasData = false;
    var previousSegment;
    var segmentOffset, dataOffset;
    var possiblePrefix, possibleMarker, isMarker;
    var type, segmentSize;
    while (offset <= uInt8Array.length - 2) {
      possiblePrefix = uInt8Array[offset];
      possibleMarker = uInt8Array[offset + 1];
      isMarker = possiblePrefix === PREFIX && possibleMarker !== PREFIX && possibleMarker !== 0;
      if (isMarker) {
        if (hasData) {
          previousSegment = segments[segments.length - 1];
          previousSegment.dataSize = offset - previousSegment.dataOffset;
        }
        try {
          type = typeFromMarker(possibleMarker);
        } catch(e) {
          return $q.reject(e);
        }
        segmentSize = type.empty ? 0 : readUInt16BigEndian(uInt8Array, offset + 2) - 2;
        segmentOffset = offset + (type.empty ? 2 : 4);
        dataOffset = segmentOffset + segmentSize;
        hasData = !!type.hasData;
        segments.push({
          type: type,
          segmentOffset: segmentOffset,
          segmentSize: segmentSize,
          segmentContents: new $window.Uint8Array(0),
          dataOffset: dataOffset,
          dataSize: 0,
          dataContents: new $window.Uint8Array(0)
        });
        offset = dataOffset;
      } else {
        offset += 1;
      }
    }

    return validate(segments);
  }

  function validate(segments) {
    if (!segments.length) {
      return $q.reject(ERRORS.noSegments);
    }
    if (segments[0].type !== TYPES.startOfImage) {
      return $q.reject(ERRORS.missingStartOfImageMarker);
    }
    if (segments[segments.length - 1].type !== TYPES.endOfImage) {
      return $q.reject(ERRORS.missingEndOfImageMarker);
    }

    return $q.when(segments);
  }

  function attachContents(buffer, segments) {
    segments.forEach(function(segment) {
      if (segment.segmentSize) {
        segment.segmentContents = new $window.Uint8Array(buffer, segment.segmentOffset, segment.segmentSize);
      }
      if (segment.dataSize) {
        segment.dataContents = new $window.Uint8Array(buffer, segment.dataOffset, segment.dataSize);
      }
    });
    return segments;
  }

  function groupSegmentsByType(segments) {
    var grouped = {};
    segments.forEach(function(segment) {
      grouped[segment.type.name] = grouped[segment.type.name] || [];
      grouped[segment.type.name].push(segment);
    });
    return grouped;
  }

  self.loadSegmentsFromBuffer = function loadSegmentsFromBuffer(buffer) {
    return getSegmentOffsets(new $window.Uint8Array(buffer)).then(function(segments) {
      return validate(segments);
    }).then(function(segments) {
      return attachContents(buffer, segments);
    }).then(function(segments) {
      return groupSegmentsByType(segments);
    });
  };

  self.loadSegmentsFromFile = function loadFromFile(file) {
    if (!file) {
      return $q.reject(ERRORS.noFile);
    }
    var reader = new $window.FileReader();

    // Defer creation required to convert
    // onload to promise
    var deferred = $q.defer();

    reader.onload = function(e) {
      var buffer = e.target.result;
      self.loadSegmentsFromBuffer(buffer).then(function(segments) {
        deferred.resolve(segments);
      }, function(error) {
        deferred.reject(error);
      });
    };

    reader.onerror = function() {
      deferred.reject(ERRORS.fileReadError);
    };

    reader.readAsArrayBuffer(file);

    return deferred.promise;
  };

  self._huffmanTreeFromTable = function(table) {
    var newNode = function(parent, bit) {
      return {
        children: {},
        parent: parent,
        full: false,
        codeLength: parent ? parent.codeLength + 1 : 0,
        bit: bit || null
      };
    };

    //
    var root = newNode();
    var branchPoint = root;
    var node = root;
    var codeLength, i, value;
    var parent;

    for (codeLength in table) {
      codeLength = parseInt(codeLength);
      if (table.hasOwnProperty(codeLength)) {
        for (i = 0; i < table[codeLength].length; i++) {
          value = table[codeLength][i];

          // Find available descendent of branching point
          // of codeLength - 1
          node = branchPoint;
          while (node.codeLength < codeLength - 1) {
            if (!node.children[0]) {
              node.children[0] = newNode(node, 0);
              node = node.children[0];
            } else if (!node.children[1]) {
              node.children[1] = newNode(node, 1);
              node = node.children[1];
            } else if (angular.isObject(node.children[0]) && !node.children[0].full) {
              node = node.children[0];
            } else if (angular.isObject(node.children[1]) && !node.children[1].full) {
              node = node.children[1];
            } else {
              throw 'Error';
            }
          }
          if (!node.children[0]) {
            node.children[0] = value;
          } else if (!node.children[1]) {
            node.children[1] = value;

            // Mark parent node(s) as full
            node.full = true;
            while (node.parent && node.parent.bit == 1) {
              node.parent.full = true;
              node = node.parent;
            }
            if (node.parent) {
              branchPoint = node.parent;
            }
          }
        }
      }
    }

    // Convert to simple structure
    function convert(node) {
      if (!angular.isObject(node)) return node;
      delete node.full;
      delete node.parent;
      delete node.bit;
      delete node.codeLength;
      if (node.children[0]) node[0] = convert(node.children[0]);
      if (node.children[1]) node[1] = convert(node.children[1]);
      delete node.children;
      return node;
    }
    convert(root);
    return root;
  };
});