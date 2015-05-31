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
      trees[table.type][table.number] = self._huffmanTreeFromTable(table.table).data;
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

  self._decodeHuffmanValue = function(streamWithOffset, huffmanTree) {
    /*jshint bitwise: false*/

    var nodes = 0;
    var bitOffset = streamWithOffset.bitOffset % 8;
    var byteOffset = (streamWithOffset.bitOffset - bitOffset) >>> 3; // Division by 8

    var stream = streamWithOffset.stream;
    var bit, remainingNumberOfBitsInByte, byte, onesAfterBitOffset;
    var node = huffmanTree;

    // xFF00 are special in jpeg format and the 00 must be skipped
    // Should this be abstracted away to a zero-skipped stream function?
    // Could it happen when fetching other bits?
    var skipZeroes = false;

    for (; byteOffset < stream.length; byteOffset++) {
      byte = stream[byteOffset];

      skipZeroes = (byte == ANGULAR_JPEG_SEGMENT_PREFIX && stream[byteOffset + 1] == 0);

      for (; bitOffset < 8; bitOffset++) {
        nodes++;
        remainingNumberOfBitsInByte = 8 - bitOffset;
        onesAfterBitOffset = ~(~0 << remainingNumberOfBitsInByte);
        bit = (byte & onesAfterBitOffset) >>> (remainingNumberOfBitsInByte - 1);
        node = node[bit];
        if (!angular.isDefined(node)) {
          throw 'Invalid bit value of ' + bit + ' at ' + nodes;
        }
        if (!angular.isObject(node)) {
          streamWithOffset.bitOffset = byteOffset * 8 + bitOffset + 1;
          return node;
        }
      }
      if (skipZeroes) {
        byteOffset++;
        skipZeroes = false;
      }
      bitOffset = 0;
    }

    throw 'Unable to find decoded value';
  };

  // Encoded values can be negative,
  // using a form of 1s compliement where the highest
  // bit being 0 mean it's negative
  self._negativise = function(value, category) {
    var isNegative = value >>> (category - 1) === 0;
    if (isNegative) {
      var ones = ~(~0 << category);
      value = ~value & ones;
      value = -1 * value;
    }
    return value;
  }

  self._fetchNBits = function(streamWithOffset, n) {
    /*jshint bitwise: false*/

    // n is always a category, which if 0
    // means that a zero value has been encoded
    if (n === 0) {
      return 0;
    }

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
          streamWithOffset.bitOffset = streamWithOffset.bitOffset + n;
          return self._negativise(value, n);
        }
      }
      bitOffset = 0;
    }

    throw 'Unable to find n bits';
  };

  self._splitIntoNibbles = function(byte) {
     /*jshint bitwise: false*/
    return [byte >>> 4, ~(~0 << 4) & byte];
  };

  var ORDER = [
    [0,  1, 5, 6,14,15,27,28],
    [2,  4, 7,13,16,26,29,42],
    [3,  8,12,17,25,30,41,43],
    [9, 11,18,24,31,40,44,53],
    [10,19,23,32,39,45,52,54],
    [20,22,33,38,46,51,55,60],
    [21,34,37,47,50,56,59,61],
    [35,36,48,49,57,58,62,63]
  ];

  var COORDS = {};
  ORDER.forEach(function(row, j) {
    row.forEach(function(index, i) {
      COORDS[index] = [j, i];
    });
  });

  function getUintArray() {
    return [
      new Uint8Array(8),
      new Uint8Array(8),
      new Uint8Array(8),
      new Uint8Array(8),
      new Uint8Array(8),
      new Uint8Array(8),
      new Uint8Array(8),
      new Uint8Array(8)
    ];
  }

  self._inverseDiscreteCosineTransform = function(vector) {
    // Can probably do something nicer than array of arrays?
    var input = [
      new Int8Array(8),
      new Int8Array(8),
      new Int8Array(8),
      new Int8Array(8),
      new Int8Array(8),
      new Int8Array(8),
      new Int8Array(8),
      new Int8Array(8)
    ];
    var output = getUintArray();

    vector.forEach(function(val, i) {
      input[COORDS[i][0]][COORDS[i][1]] = val;
    });

    function c(u, v) {
      if (u == 0 && v == 0) {
        return 0.5;
      } else {
        return 1;
      }
    }

    // Crazy slow version, iterating loads and mixing
    // floating point arithmetic, has divisins, calling Math.cos...
    var x, y, u, v, sum;
    for (x = 0; x < 8; x++) {
      for (y = 0; y < 8; y++) {
        sum = 0;
        for (u = 0; u < 8; u++) {
          for (v = 0; v < 8; v++) {
            sum += c(u,v) * input[u][v] * Math.cos((2*x+1)*u*Math.PI/16) * Math.cos((2*y+1)*v*Math.PI/16) / 4;
          }
        }
        output[x][y] = sum + 128;
      }
    }

    return output;
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
    var componentOrder = [];
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
      // Assuming that the order here the order of the data
      // in the actual data. Also order of keys on objects
      // doesn't seem to survive JSONification
      componentOrder.push(COMPONENT_NAMES[componentId]);
      components[COMPONENT_NAMES[componentId]] = {
        componentName: COMPONENT_NAMES[componentId],
        huffmanTableACNumber: acNibble,
        huffmanTableDCNumber: dcNibble
      };
    }
    return {
      data: {
        componentOrder: componentOrder,
        components: components
      }
    };
  };

  self._skipAnyRestartMarkers = function(streamWithOffset) {
    var bitOffset = streamWithOffset.bitOffset % 8;
    var byteOffset = (streamWithOffset.bitOffset - bitOffset) >>> 3;
    var stream = streamWithOffset.stream;
    if (bitOffset) byteOffset++;

    var skipped = false;
    if (stream[byteOffset] == ANGULAR_JPEG_SEGMENT_PREFIX) {
    }
    while (stream[byteOffset] == ANGULAR_JPEG_SEGMENT_PREFIX && stream[byteOffset + 1] != 0) {
      var skipped = true;
      byteOffset += 2;
    };
    if (skipped) {
      stream.bitOffset = byteOffset * 8;
    }
  };

  self._decodeStartOfScanDataContents = function(decodedSegments, data) {
    /*jshint bitwise: false*/
    var streamWithOffset = {
      stream: data,
      bitOffset: 0
    };
    var END_OF_BLOCK = 0;
    var SIXTEEN_ZEROES = 15 << 4;

    var dcTrees = decodedSegments.trees.DC;
    var acTrees = decodedSegments.trees.AC;

    var componentOrder = decodedSegments.startOfScan.componentOrder;
    var components = decodedSegments.startOfScan.components;

    var dcDiffs = {};
    var cosineCoefficients = {};
    var width = decodedSegments.startOfFrameBaselineDCT.width;
    var height =  decodedSegments.startOfFrameBaselineDCT.height;
    var horizontalRemainder = width % 8;
    var verticalRemainder = height % 8;
    var numberOfHorizontalBlocks = (width - horizontalRemainder) / 8 + (horizontalRemainder ? 1 : 0);
    var numberOfVerticalBlocks = (width - verticalRemainder) / 8 + (verticalRemainder ? 1 : 0);

    // Assuming that there is a sampling factor == 1
    // and can divide each other (e.g. can't have 1,3 and)
    var samplingFactors = decodedSegments.startOfFrameBaselineDCT.components;
    var maxHorizontalFactor = 1;
    var maxVerticalFactor = 1;
    componentOrder.forEach(function(componentName) {
      maxHorizontalFactor = Math.max(samplingFactors[componentName].samplingFactorVertical);
      maxVerticalFactor = Math.max(samplingFactors[componentName].samplingFactorVertical);
    });
    var numberOfHorizontalIterations = numberOfHorizontalBlocks / maxHorizontalFactor;
    var numberOfVerticalIterations = numberOfVerticalBlocks / maxVerticalFactor;

    // Just a list of lists for now
    // Might need something more structured to access
    var imageData = {};
    var dcDiffs;
    // Can be more efficient allocating just 1 int array per component ahead of time?
    for (var y = 0; y < numberOfVerticalIterations; y++) {
      for (var x = 0; x < numberOfHorizontalIterations; x++) {
        componentOrder.forEach(function(componentName) {
          for (var y_s = 0; y_s < samplingFactors[componentName].samplingFactorVertical; y_s++) {
            for (var x_s = 0; x_s < samplingFactors[componentName].samplingFactorHorizontal; x_s++) {
              self._skipAnyRestartMarkers(streamWithOffset);
              dcDiffs[componentName] = dcDiffs[componentName] | 0;
              var cosineCoffForComponent = [];
              var component = components[componentName];
              var dcTree = dcTrees[component.huffmanTableDCNumber];

              var dcCoefficientCategory = self._decodeHuffmanValue(streamWithOffset, dcTree);
              var dcDiff = self._fetchNBits(streamWithOffset, dcCoefficientCategory);
              dcDiffs[componentName] += dcDiff;
              cosineCoffForComponent.push(dcDiffs[componentName]);
              var i = 1;

              var acTree = acTrees[component.huffmanTableACNumber];
              var upTo;
              while (i < 64) {
                var zeroesAndCategoryPair = self._decodeHuffmanValue(streamWithOffset, acTree);
                var zeroesAndCategoryNibbles = self._splitIntoNibbles(zeroesAndCategoryPair);
                var numberOfZeroes = zeroesAndCategoryNibbles[0];
                var categoryOfCofficient = zeroesAndCategoryNibbles[1];
                if (zeroesAndCategoryPair === END_OF_BLOCK || i + numberOfZeroes + 1 > 64) {
                  while (i < 64) {
                    cosineCoffForComponent.push(0);
                    i++;
                  }
                  break;
                } else if (zeroesAndCategoryPair === SIXTEEN_ZEROES) {
                  upTo = i + 16;
                  while (i < upTo) {
                    cosineCoffForComponent.push(0);
                    i++;
                  }
                } else {
                  var acCoefficient = self._fetchNBits(streamWithOffset, categoryOfCofficient);
                  upTo = i + numberOfZeroes;
                  while (i < upTo) {
                    cosineCoffForComponent.push(0);
                    i++;
                  }
                  cosineCoffForComponent.push(acCoefficient);
                  i++;
                }
              }
              if (cosineCoffForComponent.length != 64) {
                throw 'Cosine coefficients must be of length 64';
              }

              // No support for resampling if sampling factors are not zero
              imageData[x] = imageData[x] || {};
              imageData[x][y] = imageData[x][y] || {};
              imageData[x][y][componentName] = self._inverseDiscreteCosineTransform(cosineCoffForComponent);
            }
          }
        });
      }
    }

    // Transform to RGB
    for (var x in imageData) {
      var unitRow = imageData[x];
      for (y in unitRow) {
        var unit = unitRow[y];
        unit.red = getUintArray();
        unit.green = getUintArray();
        unit.blue = getUintArray();

        for (var i = 0; i < 8; i++) {
          for (var j = 0; j < 8; j ++) {
            unit.red[i][j]   = unit.luminance[i][j]                                                + 1.402   * (unit.chrominanceRed[i][j] - 128); 
            unit.green[i][j] = unit.luminance[i][j] - 0.34414 * (unit.chrominanceBlue[i][j] - 128) - 0.71414 * (unit.chrominanceRed[i][j] - 128); 
            unit.blue[i][j]  = unit.luminance[i][j] + 1.772   * (unit.chrominanceBlue[i][j] - 128);
          }
        }
        delete unit.luminance;
        delete unit.chrominanceBlue;
        delete unit.chrominanceRed;
      }
    }

    // Make into single imageData array
    var bytesPerPixel = 4;
    var allData = new Uint8ClampedArray(numberOfHorizontalIterations * numberOfVerticalIterations * 64 * bytesPerPixel);

    // Not worrying about parts beyond edges for now,
    // and as always, crazy innefficient
    var width = numberOfHorizontalIterations * 8;
    var height = numberOfVerticalIterations * 8;
    for (var x in imageData) {
      var unitRow = imageData[x];
      var unitXCoord = parseInt(x) * 8;
      for (y in unitRow) {
        var unitYCoord = parseInt(y) * 8;
        var unit = unitRow[y];
        for (var i = 0; i < 8; i++) {
          for (var j = 0; j < 8; j++) {
            var start = bytesPerPixel * ((unitYCoord + i) * width + unitXCoord + j);
            allData[start + 0] = unit.red[i][j];
            allData[start + 1] = unit.green[i][j];
            allData[start + 2] = unit.blue[i][j];
            allData[start + 3] = 255;
          }
        }
      }
    }

    return {
      data: allData
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