var iCloudDevice = require("./iCloudDevice.js");

function iCloudAccount(login, password) {
	var _login = login;
	var _password = password;
	var _devices = new Array();
	var _dayRefreshRate;
	var _nightRefreshRate;
	var _multiplier = 60 * 1000;
	var _self = this;
	var _smartUpdate;
	var _currentRefreshIntervalID = undefined;
	var _threshold = .0009;
	var _dayRefreshStartTime = 7;  // hour
	var _dayRefreshEndTime = 22;   // hour
	var _scheduledJobID = undefined;
	var _dateformat = "YYYY/MM/DD HH:mm:ss";
	var _moment = require('moment');
	var _buffer = require('buffer').Buffer;
	var _https  = require('https');
	var _schedule = require('node-schedule');

	this.getLogin = function() { 
		return _login;
	}

	this.setRefreshRates = function(day, night, geoChangeThreshold) {
		console.log("** (" + this._getCurrentTime() + ") " + this.getLogin() + " Account - Daytime refresh frequency being set to " + day);			
		console.log("** (" + this._getCurrentTime() + ") " + this.getLogin() + " Account - Nighttime refresh frequency being set to " + night);			

		this._dayRefreshRate = day;
		this._nightRefreshRate = night;
		this._threshold = geoChangeThreshold;
	}

	this.clearAccount = function () {
		this._clearInterval();
		this._clearScheduleChange();
	}

	this.processiCloudDevices = function (smartUpdate, callback) {
		_smartUpdate = smartUpdate;

		// uncomment to check iCloud once right away
		this._getiCloudInfo(callback);

		var sleepAmount = parseInt((Math.random() * this._getCurrentRefreshInterval()) + 1);

		var sleepTime = _moment();
		sleepTime.add('minutes', sleepAmount);

		console.log("** (" + this._getCurrentTime() + ") " + this.getLogin() + " Account - FIRST RUN ONLY, Going to wait for " + sleepAmount + " (RANDOMIZED) minute(s) before starting to schedule iCloud updates, scheduled for " + sleepTime.format(_dateformat));			

		// one time job, so don't bother saving the ID.
		_schedule.scheduleJob(sleepTime, function() {
			_self._setInterval(_self._getCurrentRefreshInterval(), callback);
			_self._scheduleIntervalChange(_self._getIntervalChangeTime(), callback);
		});		
	}

	this._getCurrentRefreshInterval = function () {
		var refreshInterval = this._nightRefreshRate; // only between the hours of midnight and 6am

		if (_moment().hour() > _dayRefreshStartTime || (_moment().hour() == _dayRefreshStartTime && _moment().minutes() >= 1))
		{
			console.log("** (" + this._getCurrentTime() + ") " + this.getLogin() + " Account - Determined that it is daytime.  Daytime refresh rate will be used: " + this._dayRefreshRate);			

			refreshInterval = this._dayRefreshRate;
		}
		else
		{
			console.log("** (" + this._getCurrentTime() + ") " + this.getLogin() + " Account - Determined that it is nighttime.  Nighttime refresh rate will be used: " + _nightRefreshRate);						
		}

//		console.log("** (" + this._getCurrentTime() + ") " + this.getLogin() + " Account - Going to refresh at " + refreshInterval + " minute intervals");

		return (refreshInterval);
	}

	this._getIntervalChangeTime = function () {
		var scheduledJobTime = _moment();

		// if it's daytime
		if (_moment().hour() > _dayRefreshStartTime || (_moment().hour() == _dayRefreshStartTime && _moment().minutes() >= 1))
		{
			scheduledJobTime.hour(_dayRefreshEndTime);
		}
		else
		{
			scheduledJobTime.add('days', 1);
			scheduledJobTime.hour(_dayRefreshStartTime);
		}

		scheduledJobTime.minutes(1);
		scheduledJobTime.seconds(0);

		return (scheduledJobTime);
	}

	this._scheduleIntervalChange = function (time, callback) {
		var scheduleDateTime = new Date(
			_moment(time, _dateformat).year(), 
			_moment(time, _dateformat).month(), 
			_moment(time, _dateformat).date(), 
			_moment(time, _dateformat).hour(), 
			_moment(time, _dateformat).minute(), 
			_moment(time, _dateformat).seconds()
		);

		console.log("** (" + this._getCurrentTime() + ") " + this.getLogin() + " Account - Scheduling a job to change the refresh at " + scheduleDateTime);			

		this._clearScheduleChange();

		// Schedule a change to the interval
		_scheduledJobID = _schedule.scheduleJob(scheduleDateTime, function() {
			console.log("** (" + _self._getCurrentTime() + ") " + _self.getLogin() + " Account - Scheduled job to change the interval is running...");
			_self._setInterval(_self._getCurrentRefreshInterval(), callback);
			_scheduledJobID = undefined;

			_schedule.scheduleJob(_moment().add('hours', 1), function() {
				_self._scheduleIntervalChange(_self._getIntervalChangeTime(), callback);
			});
		});		
	}

	this._clearScheduleChange = function() {
		if (typeof _scheduledJobID !== 'undefined')
		{
			console.log("** (" + this._getCurrentTime() + ") " + this.getLogin() + " Account - ODD: Clearing a previous scheduled job to change the refresh interval.");			
			_scheduledJobID.cancel();
			_scheduledJobID = undefined;
		}
	}

	this._clearInterval = function() {
		if (typeof _currentRefreshIntervalID !== 'undefined')
		{
			console.log("** (" + this._getCurrentTime() + ") " + this.getLogin() + " Account - Clearing a previous refresh Interval");
			clearInterval(_currentRefreshIntervalID);
			_currentRefreshIntervalID = undefined;
		}		
	}

	this._setInterval = function (refreshInterval, callback) {
		this._clearInterval();

		console.log("** (" + this._getCurrentTime() + ") " + this.getLogin() + " Account - Refresh will be scheduled to take place every " + refreshInterval + " minutes, next refresh time will be: " + _moment().add('minutes', refreshInterval).format(_dateformat));

		_currentRefreshIntervalID = setInterval(function() {
			console.log("** (" + _self._getCurrentTime() + ") " + _self.getLogin() + " Account - Scheduled check of iCloud devices about to begin...  ")
			if (typeof _devices !== 'undefined') {
				console.log("** (" + _self._getCurrentTime() + ") " + _self.getLogin() + " Account - Number of iDevices for this Account: " + _devices.length);
			}
			console.log("** (" + _self._getCurrentTime() + ") " + _self.getLogin() + " Account - Next refresh time will be: " + _moment().add('minutes', _self._getCurrentRefreshInterval()).format(_dateformat));
			_self._getiCloudInfo(callback);
		}, refreshInterval * _multiplier);
	}

	this._getCurrentTime = function () {
		return (_moment().format(_dateformat));
	}

	this._findAllDevices = function(callback) {
	    // Send a request to the find my iphone service for the partition host to use
		this._getPartitionHost(function(err, partitionHost) {
			if (err != null) {
				console.log("** (" + _self._getCurrentTime() + ") ERROR: " + err);
	    	}
	        // Now get the devices owned by the user
	        _self._getDeviceDetails(partitionHost, callback);
	    });		
	}

	this._getPartitionHost = function(callback) {
	    this._postRequest('fmipmobile.icloud.com', function(err, response) {
			if (err != null) {
				console.log("** (" + _self.getCurrentTime() + ") ERROR: " + err);
	    	}
	        // Return the partition host if available
	        return callback(null, response.headers['x-apple-mme-host']);
	    });		
	}

	this._getDeviceDetails = function(partitionHost, callback) {
	    this._postRequest(partitionHost, function(err, response) {
			if (err != null) {
				console.log("** (" + getCurrentTime() + ") ERROR: " + err);
	    	}

	        var allDevices = JSON.parse(response.body).content;
	        return callback(null, allDevices);
	    });
	}

	this._postRequest = function(host, callback) {
	    var apiRequest = _https.request({
	        host: host,
	        path: '/fmipservice/device/' + _login + '/initClient',
	        headers: {
	            Authorization: 'Basic ' + new Buffer(_login + ':' + _password).toString('base64')
	        },
	        method: 'POST'
	    }, function(response) {
	        var result = {headers: response.headers, body: ''};
	        response.on('data', function(chunk) {result.body = result.body + chunk; });
	        response.on('end', function() { return callback(null, result); });
	    });
	    apiRequest.end();
	};

	this._getDeviceIndex = function(deviceID)
	{
		if (typeof _devices !== 'undefined')
		{
			for (var counter = 0; counter < _devices.length; counter++) {
				if (_devices[counter].id.toUpperCase() == deviceID.toUpperCase()) {
					return (counter);
				}
			}
		}
		return (-1);
	}

	this._getiCloudInfo = function(callback) {
//		return;
		var message = "";

		// Find all devices the user owns
		this._findAllDevices(function(err, devices) {
			if (err != null) {
				console.log("** (" + getCurrentTime() + ") ERROR: " + err);
			}

			var theiCloudDevice;
			var locationChanged = false;

			devices.forEach(function(device) {
				if (device.modelDisplayName == "iPhone" || device.modelDisplayName == "iPad")
				{
//					console.log(JSON.stringify(device));

					iCloudDeviceIndex = _self._getDeviceIndex(device.id);

					if (iCloudDeviceIndex == -1)
					{
						theiCloudDevice = new iCloudDevice();
						iCloudDeviceIndex = _devices.length;

						theiCloudDevice.id = device.id;
						theiCloudDevice.name = device.name;
						theiCloudDevice.modelDisplayName = device.modelDisplayName;
						console.log("** (" + _self._getCurrentTime() + ") " + _self.getLogin() + " Account - New iDevice discovered: " + theiCloudDevice.name);
					}
					else
					{
						theiCloudDevice = _devices[iCloudDeviceIndex];
						console.log("** (" + _self._getCurrentTime() + ") " + _self.getLogin() + " Account - iDevice update being processed: " + theiCloudDevice.name);
					}

					theiCloudDevice.batteryLevel = device.batteryLevel;
					theiCloudDevice.batteryStatus = device.batteryStatus;

					if (device.location !== null)
					{
//						locationChanged = !_smartUpdate;

						// if the new latitute and longitude are within +/- X of the previous values, don't do anything
						if (device.location.longitude > theiCloudDevice.longitude + _threshold || device.location.longitude < theiCloudDevice.longitude - _threshold)
						{
							locationChanged = true;
						}

						if (device.location.latitude > theiCloudDevice.latitude + _threshold || device.location.latitude < theiCloudDevice.latitude - _threshold)
						{
							locationChanged = true;
						}

						if (locationChanged)
						{
							console.log("** (" + _self._getCurrentTime() + ") " + _self.getLogin() + " Account - The device " + device.name + " LOCATION CHANGED");
							console.log("** (" + _self._getCurrentTime() + ") " + device.name + " - Old location: " + theiCloudDevice.longitude + ", " + theiCloudDevice.latitude);
							console.log("** (" + _self._getCurrentTime() + ") " + device.name + " - New location: " + device.location.longitude + ", " + device.location.latitude);
						}
						else {
							console.log("** (" + _self._getCurrentTime() + ") " + _self.getLogin() + " Account - The device " + device.name + " LOCATION DID NOT CHANGE");
							console.log("** (" + _self._getCurrentTime() + ") " + device.name + " - Old location: " + theiCloudDevice.longitude + ", " + theiCloudDevice.latitude);
							console.log("** (" + _self._getCurrentTime() + ") " + device.name + " - New location: " + device.location.longitude + ", " + device.location.latitude);							
						}
	
						theiCloudDevice.latitude = device.location.latitude;
						theiCloudDevice.longitude = device.location.longitude;
						theiCloudDevice.timeStamp = device.location.timeStamp;
						theiCloudDevice.locationChanged = locationChanged;					
					}

					_devices[iCloudDeviceIndex] = theiCloudDevice;

					if (locationChanged || !_smartUpdate) {
						callback(theiCloudDevice);
					}
				}
			});
		});
	}
}
module.exports = iCloudAccount;
