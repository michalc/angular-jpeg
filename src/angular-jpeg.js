/*global angular*/

angular.module('angular-jpeg', []);

// Constant, but properties can be overriden in config block
angular.module('angular-jpeg').constant('ANGULAR_JPEG_CONFIG', {
  ANGULAR_SRC: '/bower_components/angular/angular.js',
  ANGULAR_JPEG_PATH: '/src/'
});

// Wraps calls to functions in worker script in a standard promise interface
angular.module('angular-jpeg').factory('Worker', function($q, $window, ANGULAR_JPEG_CONFIG) {
  'use strict';

  var worker = new $window.Worker(ANGULAR_JPEG_CONFIG.ANGULAR_JPEG_PATH + '/angular-jpeg-worker.js');

  // Load app in worker
  worker.postMessage(ANGULAR_JPEG_CONFIG);
  var id = 0;
  var inProgress = {};

  worker.onmessage = function(e) {
    var id = e.data.id;
    var type = e.data.type; // resolve, reject, or notify
    var data = e.data.data;
    inProgress[e.data.id][type](data);
    if (e.data.type === 'resolve' || e.data.type === 'reject') {
      delete inProgress[id];
    }
  };

  return function(options) {
    var deferred = $q.defer();
    id++;
    inProgress[id] = deferred;
    worker.postMessage({
      id: id,
      command: options.command,
      args: options.args
    });
    return deferred.promise;
  };
});

angular.module('angular-jpeg').service('AngularJpeg', function($window, Worker) {
  'use strict';

  var self = this;

  var COMMANDS = [
    'loadSegmentsFromFile',
    '_huffmanTreesFromSegments',
    '_decodeQuantizationTableSegments',
    '_decodeStartOfScanSegmentContents',
    '_decodeStartOfFrameBaselineDCT'
  ];

  COMMANDS.forEach(function(command) {
    self[command] = function() {
      return Worker({
        command: command,
        args: $window.Array.prototype.slice.call(arguments)
      });
    };
  });
});