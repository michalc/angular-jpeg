angular.module('angular-jpeg', []);

angular.module('angular-jpeg').service('AngularJpeg', function($q, $window) {
	
	var ERRORS = {
		'NO_FILE': 'No file found',
		'UNKNOWN': 'Unknown error'
	};

	var MARKERS = {
		startOfImage: 0xFFD8,
		endOfImage: 0xFFD9
	};

	function view(buffer) {
		return new $window.Int8Array(buffer);
	}

	function validateFile(int8View) {
		new $window.Int8Array(buffer);
	}


	function loadFromFile(file) {
		if (!file) return $q.reject(ERRORS.NO_FILE);
		var reader = new $window.FileReader();
		var deferred = $q.defer();
		
		reader.onload = function(e) {
			var buffer = e.target.result;
			var view = view(buffer);
			deferred.resolve(buffer);
		};


		reader.readAsArrayBuffer(file);
		return deferred.promise;
	}

	return {
		loadFromFile: loadFromFile
	};
});