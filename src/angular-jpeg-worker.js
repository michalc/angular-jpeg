/*global self, importScripts*/

// Angular needs a global window object
self.window = self;

// Skeleton properties to get Angular to load and bootstrap.
self.history = {};
self.document = {
  readyState: 'complete',
  querySelector: function() {'use strict';},
  createElement: function() {
    'use strict';
    return {
      pathname: '',
      setAttribute: function() {}
    };
  }
};

// Does this introduce a race condition?
self.onmessage = function(e) {
  'use strict';

  // Load Angular: must be on same domain as this script
  importScripts(e.data.ANGULAR_SRC);

  // Put angular on global scope
  self.angular = self.window.angular;

  // Standard angular module definition
  importScripts(e.data.ANGULAR_JPEG_PATH + '/angular-jpeg-worker-app.js');
  importScripts(e.data.ANGULAR_JPEG_PATH + '/angular-jpeg-worker-segments.js');

  // No root element seems to work fine
  self.angular.bootstrap(null, ['angular-jpeg-worker']);
};
