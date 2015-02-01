/*global angular*/

angular.module('angular-jpeg-worker', []);

angular.module('angular-jpeg-worker').constant('ANGULAR_JPEG_ERRORS', {
  noFile: 'No file found',
  fileReadError: 'Unable to read file contents',
  unknown: 'Unknown',
  unrecognisedMarker: 'Unrecognised marker',
  unsupportedMarker: 'Unsupported marker',
  noSegments: 'No segments found',
  missingStartOfImageMarker: 'Missing start of image marker',
  missingEndOfImageMarker: 'Missing end of image marker'
});


angular.module('angular-jpeg-worker').service('AngularJpeg', function($q, $window,
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

  var FIRST_NIBBLE = 1 + 2 + 4 + 8;

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
      return {
        data: groupSegmentsByType(segments)
      };
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
      self.loadSegmentsFromBuffer(buffer).then(function(results) {
        deferred.resolve(results);
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

    return {
      data: convertNode(root)
    };
  };

  self._huffmanTableFromSegment = function(segment) {
    /*jshint bitwise: false*/
    var NUMBER_OF_LENGTHS = 16;
    var offset = segment.segmentOffset;

    var informationByte = (new $window.Uint8Array(segment.buffer, offset, 1))[0];
    var type = (informationByte >> 4) ? 'AC' : 'DC';
    var number = informationByte & FIRST_NIBBLE;
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
    segments.forEach(function(segment) {
      var table = self._huffmanTableFromSegment(segment);
      trees[table.type] = trees[table.type] || {};
      trees[table.type][table.number] = self._huffmanTreeFromTable(table.table);
    });

    return {
      data: trees
    };
  };

  self._decodeHuffmanStream = function(huffmanTree, stream) {
    /*jshint bitwise: false*/

    var readingByteIndex = 0;
    var readingBitIndex = 0;
    var bit, byte, allOnes;

    var node = huffmanTree;

    var decoded = [];
    for (readingByteIndex = 0; readingByteIndex < stream.length; readingByteIndex++) {
      byte = stream[readingByteIndex];
      allOnes = 0;

      for (readingBitIndex = 7; readingBitIndex >= 0; readingBitIndex--) {
        bit = (byte & ~allOnes) >> readingBitIndex;
        node = node[bit];
        if (!angular.isObject(node)) {
          decoded.push(node);
          node = huffmanTree;
        }
        allOnes = allOnes | (1 << readingBitIndex);
      }
    }
    return decoded;
  };

  self._decodeHuffmanValue = function(huffmanTree, streamWithOffset) {
    /*jshint bitwise: false*/

    var bitOffset = streamWithOffset.bitOffset % 8;
    var byteOffset = (streamWithOffset.bitOffset - bitOffset) >>> 3; // Division by 8

    var stream = streamWithOffset.stream;
    var bit, remainingNumberOfBitsInByte, byte, onesAfterBitOffset;
    var node = huffmanTree;

    for (; byteOffset < stream.length; byteOffset++) {
      byte = stream[byteOffset];

      for (; bitOffset < 8; bitOffset++) {
        remainingNumberOfBitsInByte = 8 - bitOffset;
        onesAfterBitOffset = ~(~0 << remainingNumberOfBitsInByte);
        bit = (byte & onesAfterBitOffset) >>> (remainingNumberOfBitsInByte - 1);
        node = node[bit];
        if (!angular.isObject(node)) {
          return {
            value: node,
            stream: stream,
            bitOffset: byteOffset * 8 + bitOffset + 1
          };
        }
      }
      bitOffset = 0;
    }

    throw 'Unable to find decoded value';
  };

  self._fetchNBits = function(streamWithOffset, n) {
    /*jshint bitwise: false*/

    var bitOffset = streamWithOffset.bitOffset % 8;
    var byteOffset = (streamWithOffset.bitOffset - bitOffset) >>> 3; // Division by 8
    var stream = streamWithOffset.stream;
    var bit, remainingNumberOfBitsInByte, byte, onesAfterBitOffset;
    var length = 0;
    var value = 0;

    for (; byteOffset < stream.length; byteOffset++) {
      byte = stream[byteOffset];

      for (; bitOffset < 8; bitOffset++) {
        remainingNumberOfBitsInByte = 8 - bitOffset;
        onesAfterBitOffset = ~(~0 << remainingNumberOfBitsInByte);
        bit = (byte & onesAfterBitOffset) >>> (remainingNumberOfBitsInByte - 1);
        value = (value << 1) + bit;
        length++;
        if (length === n) {
          return {
            value: value,
            stream: stream,
            bitOffset: streamWithOffset.bitOffset + n
          };
        }
      }
      bitOffset = 0;
    }

    throw 'Unable to find n bits';
  };

  // Practical Fast 1-D DCT Algorithms with 11 Multiplications
  // Christoph Loeffler, Adriaan Lieenberg, and George S. Moschytz
  // Acoustics, Speech, and Signal Processing, 1989. ICASSP-89., 1989 International Conference on
  self._inverseDiscreteCosineTransform = function() {

  };


  self._decodeStartOfFrameBaselineDCT = function(segment) {
    /*jshint bitwise: false*/
    var contents = new $window.Uint8Array(segment.buffer, segment.segmentOffset, segment.segmentSize);
    var offset = 0;
    offset += 1;
    var height = readUInt16BigEndian(contents, offset);
    offset += 2;
    var width = readUInt16BigEndian(contents, offset);
    offset += 2;
    var numberOfComponents = contents[offset];
    offset += 1;
    if (numberOfComponents > 4) {
      throw 'Too many frame components: ' + numberOfComponents;
    }
    if (numberOfComponents < 1) {
      throw 'Not enough frame components: ' + numberOfComponents;
    }
    var components = {};
    var componentId, samplingFactorByte, samplingFactorVertical, samplingFactorHorizontal, quantizationTableNumber;
    for (var i = 0; i < numberOfComponents; i++) {
      componentId = contents[offset];
      offset += 1;
      samplingFactorByte = contents[offset];

      samplingFactorVertical = samplingFactorByte & FIRST_NIBBLE;
      samplingFactorHorizontal = samplingFactorByte >> 4;
      offset += 1;
      quantizationTableNumber = contents[offset];
      offset += 1;
      components[COMPONENT_NAMES[componentId]] = {
        componentName: COMPONENT_NAMES[componentId],
        samplingFactorVertical: samplingFactorVertical,
        samplingFactorHorizontal: samplingFactorHorizontal,
        quantizationTableNumber: quantizationTableNumber
      };
    }

    return {
      data: {
        width: width,
        height: height,
        components: components
      }
    };
  };

  self._decodeQuantizationTableSegments = function(segments) {
    /*jshint bitwise: false*/
    var contents, offset, precision, quantizationTableNumber, informationByte;
    var quantizationTables = {};
    var buffers = [];

    segments.forEach(function(segment) {
      offset = 0;
      buffers.push(buffers);

      contents = new $window.Uint8Array(segment.buffer, segment.segmentOffset, segment.segmentSize);
      // Each segment can contain more than one table
      while (offset < segment.segmentSize) {
        informationByte = contents[offset];
        offset += 1;
        quantizationTableNumber = informationByte & FIRST_NIBBLE;
        precision = informationByte >> 4 ? 2 : 1;

        // Multi-byte values are stored in big endian layout
        // so have to manually convert each value to local endian-ness
        var table = new $window.Uint16Array(64 * precision);
        for (var i = 0; i < 64; i++) {
          table[i] = readUInt16BigEndian(contents, offset);
          offset += precision;
        }
        quantizationTables[quantizationTableNumber] = {
          quantizationTableNumber: quantizationTableNumber,
          precision: precision,
          contents: table
        };
      }
    });

    return {
      type: 'resolve',
      data: quantizationTables,
      transferable: buffers
    };
  };

  self._decodeStartOfScanSegmentContents = function(segment) {
    /*jshint bitwise: false*/
    var offset = 0;
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
    var componentId, huffmanTableByte, acNibble, dcNibble;
    for (var i = 0; i < numberOfComponents; i++) {
      componentId = contents[offset];
      offset++;
      // Byte connecting to huffman table seems unecessarily
      // inconsistent with one in define huffman table segment
      huffmanTableByte = contents[offset];
      offset++;
      acNibble = huffmanTableByte & FIRST_NIBBLE;
      dcNibble = huffmanTableByte >> 4;
      components[COMPONENT_NAMES[componentId]] = {
        componentName: COMPONENT_NAMES[componentId],
        huffmanTableACNumber: acNibble,
        huffmanTableDCNumber: dcNibble
      };
    }
    return components;
  };

  self._decodeStartOfScanDataContents = function() {
    //var width = decodedSegments.startOfFrameBaselineDCT.width;
    //var height = decodedSegments.startOfFrameBaselineDCT.height;

    //var huffmanDecoded = self._decodeHuffmanStream(startOfScanData);
    //console.log(huffmanDecoded);
    return {
      data: 'something'
    };
  };
});

angular.module('angular-jpeg-worker').run(function($window, $q, AngularJpeg) {
  'use strict';

  $window.onmessage = function(e) {
    var command = e.data.command;
    var args = e.data.args;
    var id = e.data.id;

    // If transferable works, the arraybuffer byteLength should be 0
    // after the transfer
    function ret(type, results) {
      $window.postMessage({
        id: id,
        type: type,
        data: results.data
        // Not transferable for now while developing,
        // as want buffer data available everywhere
      }/*, results.transferable || []*/);
    }

    $q.when(AngularJpeg[command].apply(AngularJpeg, args)).then(function(results) {
      ret('resolve', results);
    }, function(error) {
      ret('reject', error);
    }, function(notification) {
      ret('notify', notification);
    });
  };
});