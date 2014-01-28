var iCloudDevice = require("./iCloudDevice.js");


function iCloudAccount(login, password) {
	var _login = login;
	var _password = password;
	var _devices;
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

	this.setRefreshRates = function(day, night) {
		console.log("** (" + this._getCurrentTime() + ") " + this.getLogin() + " Account - Daytime refresh frequency being set to " + day);			
		console.log("** (" + this._getCurrentTime() + ") " + this.getLogin() + " Account - Nighttime refresh frequency being set to " + night);			

		this._dayRefreshRate = day;
		this._nightRefreshRate = night;
	}

	this.processiCloudDevices = function (smartUpdate, callback) {
		this._smartUpdate = smartUpdate;

		// check iCloud once right away
//		this._getiCloudInfo(callback);

		var sleepAmount = parseInt((Math.random() * 10) + 1);

		var sleepTime = _moment();
		sleepTime.add('minutes', sleepAmount);

		console.log("** (" + this._getCurrentTime() + ") " + this.getLogin() + " Account - going to wait for " + sleepAmount + " minute(s) before starting to schedule iCloud updates, scheduled for " + sleepTime.format(_dateformat));			

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

		if (typeof _scheduledJobID !== 'undefined')
		{
			console.log("** (" + this._getCurrentTime() + ") " + this.getLogin() + " Account - ODD: Clearing a previous scheduled job to change the refresh interval.");			
			_scheduledJobID.cancel();
			_scheduledJobID = undefined;
		}

		// Schedule a change to the interval
		this._scheduledJobID = _schedule.scheduleJob(scheduleDateTime, function() {
			console.log("** (" + _self._getCurrentTime() + ") " + _self.getLogin() + " Account - Scheduled job to change the interval is running...");
			_self._setInterval(_self._getCurrentRefreshInterval(), callback);
			_scheduledJobID = undefined;
			_self._scheduleIntervalChange(_self._getIntervalChangeTime(), callback);
		});		
	}

	this._setInterval = function (refreshInterval, callback) {
		if (typeof _currentRefreshIntervalID !== 'undefined')
		{
			console.log("** (" + this._getCurrentTime() + ") " + this.getLogin() + " Account - Clearing a previous refresh Interval");
			clearInterval(this._currentRefreshIntervalID);
			_currentRefreshIntervalID = undefined;
		}

		console.log("** (" + this._getCurrentTime() + ") " + this.getLogin() + " Account - Refresh will be scheduled to take place every " + refreshInterval + " minutes, multiplier of " + _multiplier + ", total of " + refreshInterval * _multiplier);

		this._currentRefreshIntervalID = setInterval(function() {
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
		if (typeof this._devices !== 'undefined')
		{
			for (var counter = 0; counter < this._devices.length; counter++) {
				if (this._devices[counter].id == deviceID) {
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

			if (typeof _devices === 'undefined')
			{
				_devices = new Array();
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
						console.log("** (" + _self._getCurrentTime() + ") New device discovered: " + theiCloudDevice.name);
						console.log(theiCloudDevice.longitude);
					}
					else
					{
						theiCloudDevice = _self._devices[iCloudDeviceIndex];
					}

					theiCloudDevice.batteryLevel = device.batteryLevel;
					theiCloudDevice.batteryStatus = device.batteryStatus;

					if (device.location !== null)
					{
						locationChanged = false;

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
							console.log("** (" + _self._getCurrentTime() + ") The device changed locations, so going to announce the new location: " + device.location.longitude + ", " + device.location.latitude);							
						}
						else {
							console.log("** (" + _self._getCurrentTime() + ") The device " + device.name + " old location: " + theiCloudDevice.longitude + ", " + theiCloudDevice.latitude + " new location: " + device.location.longitude + ", " + device.location.latitude + ") did not move outside of the threshold amounts, so no update necessary.");							
						}
	
						theiCloudDevice.latitude = device.location.latitude;
						theiCloudDevice.longitude = device.location.longitude;
						theiCloudDevice.timeStamp = device.location.timeStamp;						
					}

					_devices[iCloudDeviceIndex] = theiCloudDevice;

					if (locationChanged) {
						callback(theiCloudDevice);
					}
				}
			});
		});
	}
}
module.exports = iCloudAccount;
