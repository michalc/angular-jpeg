 /*global angular */
(function() {
  'use strict';

  var app = angular.module('angular-jpeg-demo', ['angular-jpeg']);

  app.controller('DemoController', function($window, $q, $scope, AngularJpeg) {
    $scope.state = 'initial';

    $scope.$on('dropFile::dropped', function(e, files) {
      $scope.state = 'loading';
      var startOfScanData;

      AngularJpeg.loadSegmentsFromFile(files[0]).then(function(segments) {
        startOfScanData = segments.startOfScan[0].dataContents;
        return $q.all({
          trees: AngularJpeg._huffmanTreesFromSegments(segments.defineHuffmanTables),
          quantizationTables: AngularJpeg._decodeQuantizationTableSegments(segments.defineQuantizationTables),
          startOfScan: AngularJpeg._decodeStartOfScanSegmentContents(segments.startOfScan[0]),
          startOfFrameBaselineDCT: AngularJpeg._decodeStartOfFrameBaselineDCT(segments.startOfFrameBaselineDCT[0])
        });
      }).then(function(decodedSegments) {
        $scope.decodedSegments = decodedSegments;
        return AngularJpeg._decodeStartOfScanDataContents(decodedSegments, startOfScanData);
      }).then(function(data) {
        $scope.data = data;
        $scope.state = 'loaded';
      }, function(error) {
        $scope.state = 'error';
        $scope.error = error;
      });
    });
  });

  // Simple directive to emit a FileReader object
  app.directive('dropFile', function() {
    return {
      link: function(scope, element) {

        function onDrop(e) {
          prevent(e);
          element.removeClass('hover');
          scope.$emit('dropFile::dropped', e.dataTransfer.files);
          scope.$apply();
        }

        function prevent(e) {
          e.stopPropagation();
          e.preventDefault();
        }

        function onDragEnterOrOver(e) {
          prevent(e);
          element.addClass('hover');
        }

        function onDragLeave(e) {
          prevent(e);
          element.removeClass('hover');
        }

        element.on('dragover', onDragEnterOrOver);
        element.on('dragenter', onDragEnterOrOver);
        element.on('dragleave', onDragLeave);
        element.on('drop', onDrop);
      }
    };
  });
})();