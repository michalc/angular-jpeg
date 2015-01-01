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
  ANGULAR_JPEG_COMPONENT_IDS,
  ANGULAR_JPEG_ERRORS) {
  'use strict';

  var ERRORS = ANGULAR_JPEG_ERRORS;
  var TYPES = ANGULAR_JPEG_SEGMENT_TYPES;
  var PREFIX = ANGULAR_JPEG_SEGMENT_PREFIX;
  var COMPONENT_IDS = ANGULAR_JPEG_COMPONENT_IDS;
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

  var COMPONENT_NAMES = {};
  (function() {
    for (var name in COMPONENT_IDS) {
      if (COMPONENT_IDS.hasOwnProperty(name)) {
        COMPONENT_NAMES[COMPONENT_IDS[name]] = name;
      }
    }
  })();

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
          dataContents: new $window.Uint8Array(0),
          buffer: new $window.ArrayBuffer()
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
      // Suspect both contents and buffer are not needed,
      // consider removing
      if (segment.segmentSize) {
        segment.segmentContents = new $window.Uint8Array(buffer, segment.segmentOffset, segment.segmentSize);
      }
      if (segment.dataSize) {
        segment.dataContents = new $window.Uint8Array(buffer, segment.dataOffset, segment.dataSize);
      }
      segment.buffer = buffer;
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

  function newNode(parent, bit) {
    return {
      children: {},
      parent: parent,
      full: false,
      codeLength: parent ? parent.codeLength + 1 : 0,
      bit: bit || null
    };
  }

  // Convert to simple structure
  function convertNode(node) {
    if (!angular.isObject(node)) {
      return node;
    }
    var converted = {
      0: convertNode(node.children[0])
    };
    if (node.children[1]) {
      converted[1] = convertNode(node.children[1]);
    }
    return converted;
  }

  self._huffmanTreeFromTable = function(table) {
    var root = newNode();
    var searchBelow = root;
    var node = root;
    var bit;

    var i, value;
    table.forEach(function(values, codeLengthMinus1) {
      for (i = 0; i < values.length; i++) {
        value = values[i];
        node = searchBelow;

        // Find parent node of codeLength
        while (node.codeLength < codeLengthMinus1) {
          if (angular.isObject(node.children[0]) && !node.children[0].full) {
            node = node.children[0];
          } else if (angular.isObject(node.children[1]) && !node.children[1].full) {
            node = node.children[1];
          } else {
            bit = Object.keys(node.children).length;
            node.children[bit] = newNode(node, bit);
            node = node.children[bit];
          }
        }

        // Set value in node child
        bit = Object.keys(node.children).length;
        node.children[bit] = value;

        // Mark this and parent nodes as full to avoid
        // looking down them in later iterations
        if (bit === 1) {
          node.full = true;
          while (node.parent && node.bit === 1) {
            node = node.parent;
            node.full = true;
          }
          searchBelow = node.parent;
        }
      }
    });

    return convertNode(root);
  };

  self._huffmanTableFromSegment = function(segment) {
    /*jshint bitwise: false*/
    var NUMBER_OF_LENGTHS = 16;
    var offset = segment.segmentOffset;

    var informationByte = (new $window.Uint8Array(segment.buffer, offset, 1))[0];
    var type = (informationByte >> 4) ? 'AC' : 'DC';
    var number = informationByte & ~16;
    offset += 1;

    var lengths = new $window.Uint8Array(segment.buffer, offset, NUMBER_OF_LENGTHS);
    var table = [];
    offset += NUMBER_OF_LENGTHS;
    for (var i = 0; i < lengths.length; i++) {
      table.push(new $window.Uint8Array(segment.buffer, offset, lengths[i]));
      offset += lengths[i];
    }

    return {
      type: type,
      number: number,
      table: table
    };
  };

  self._huffmanTreesFromSegments = function(segments) {
    var trees = {};
    segments.defineHuffmanTables.forEach(function(segment) {
      var table = self._huffmanTableFromSegment(segment);
      trees[table.type] = trees[table.type] || {};
      trees[table.type][table.number] = self._huffmanTreeFromTable(table.table);
    });
    return trees;
  };

  // Practical Fast 1-D DCT Algorithms with 11 Multiplications
  // Christoph Loeffler, Adriaan Lieenberg, and George S. Moschytz
  // Acoustics, Speech, and Signal Processing, 1989. ICASSP-89., 1989 International Conference on
  self._inverseDiscreteCosineTransform = function() {

  };


  self._decodeStartOfScanSegmentContents = function(segments) {
    /*jshint bitwise: false*/
    var offset = 0;
    var segment = segments.startOfScan[0];
    var contents = new $window.Uint8Array(segment.buffer, segment.segmentOffset, segment.segmentSize);
    var numberOfComponents = contents[offset];
    offset++;
    if (numberOfComponents > 4) {
      throw 'Too many scan components: ' + numberOfComponents;
    }
    if (numberOfComponents < 1) {
      throw 'Not enough scan components: ' + numberOfComponents;
    }
    var components = {};
    var componentId, huffmanTableByte, acNibble, dcNibble, huffmanTableNumber;
    for (var i = 0; i < numberOfComponents; i++) {
      componentId = contents[offset];
      offset++;
      // Byte connecting to huffman table seems unecessarily
      // inconsistent with one in define huffman table segment
      huffmanTableByte = contents[offset];
      offset++;
      acNibble = huffmanTableByte << 4 >> 4;
      dcNibble = huffmanTableByte >> 4;
      huffmanTableNumber = acNibble | dcNibble;
      components[COMPONENT_NAMES[componentId]] = {
        componentName: COMPONENT_NAMES[componentId],
        huffmanTableType: acNibble ? 'AC' : 'DC',
        huffmanTableNumber: huffmanTableNumber
      };
    }
    return components;
  };

  // The magic happens here
  self._decodeStartOfScanDataContents = function() {

  };

});