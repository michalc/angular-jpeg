/*global angular*/

angular.module('angular-jpeg').constant('ANGULAR_JPEG_SEGMENT_PREFIX', 0xFF);

angular.module('angular-jpeg').constant('ANGULAR_JPEG_SEGMENT_TYPES', {
  startOfFrameBaselineDCT: {
    marker: 0xC0
  },
  startOfFrameExtendedSequentialDCT: {
    marker: 0xC1,
    unsupported: true
  },
  startOfFrameProgressiveDCT: {
    marker: 0xC2,
    unsupported: true
  },
  startOfFrameLosslessSequential: {
    marker: 0xC3,
    unsupported: true
  },
  startOfFrameDifferentialSequentialDCT: {
    marker: 0xC5,
    unsupported: true
  },
  startOfFrameDifferentialProgressiveDCT: {
    marker: 0xC6,
    unsupported: true
  },
  startOfFrameDifferentialLosslessSequential: {
    marker: 0xC7,
    unsupported: true
  },
  jpegExtensions: {
    marker: 0xC8,
    unsupported: true
  },
  startOfFrameArithmeticExtendedSequentialDCT: {
    marker: 0xC9,
    unsupported: true
  },
  startOfFrameArithmeticProgressiveDCT: {
    marker: 0xCA,
    unsupported: true
  },
  startOfFrameArithmeticLosslessSequential: {
    marker: 0xCB,
    unsupported: true
  },
  startOfFrameDifferentialArithmeticSequentialDCT: {
    marker: 0xCD,
    unsupported: true
  },
  startOfFrameDifferentialArithmeticProgressiveDCT: {
    marker: 0xCE,
    unsupported: true
  },
  startOfFrameDifferentialArithmeticLosslessSequential: {
    marker: 0xCF,
    unsupported: true
  },
  defineHuffmanTables: {
    marker: 0xC4,
  },
  defineArithmeticCodingConditions: {
    marker: 0xCC,
    unsupported: true
  },
  restart0: {
    marker: 0xD0,
    unsupported: true,
    empty: true
  },
  restart1: {
    marker: 0xD1,
    unsupported: true,
    empty: true
  },
  restart2: {
    marker: 0xD2,
    unsupported: true,
    empty: true
  },
  restart3: {
    marker: 0xD3,
    unsupported: true,
    empty: true
  },
  restart4: {
    marker: 0xD4,
    unsupported: true,
    empty: true
  },
  restart5: {
    marker: 0xD5,
    unsupported: true,
    empty: true
  },
  restart6: {
    marker: 0xD6,
    unsupported: true,
    empty: true
  },
  restart7: {
    marker: 0xD7,
    unsupported: true,
    empty: true
  },
  startOfImage: {
    marker: 0xD8,
    empty: true
  },
  endOfImage: {
    marker: 0xD9,
    empty: true
  },
  startOfScan: {
    marker: 0xDA,
    hasData: true
  },
  defineQuantizationTables: {
    marker: 0xDB
  },
  defineNumberOfLines: {
    marker: 0xDC
  },
  defineRestartInterval: {
    marker: 0xDD
  },
  defineHierachicalProgression: {
    marker: 0xDE
  },
  defineReferenceComponents: {
    marker: 0xDF
  },
  application0: {
    marker: 0xE0
  },
  application1: {
    marker: 0xE1
  },
  application2: {
    marker: 0xE2
  },
  application3: {
    marker: 0xE3
  },
  application4: {
    marker: 0xE4
  },
  application5: {
    marker: 0xE5
  },
  application6: {
    marker: 0xE6
  },
  application7: {
    marker: 0xE7
  },
  application8: {
    marker: 0xE8
  },
  application9: {
    marker: 0xE9
  },
  applicationA: {
    marker: 0xEA
  },
  applicationB: {
    marker: 0xEB
  },
  applicationC: {
    marker: 0xEC
  },
  applicationD: {
    marker: 0xED
  },
  applicationE: {
    marker: 0xEE
  },
  applicationF: {
    marker: 0xEF
  },
  comment: {
    marker: 0xFE
  },
  temporary: {
    marker: 0x01,
    empty: true
  }
});