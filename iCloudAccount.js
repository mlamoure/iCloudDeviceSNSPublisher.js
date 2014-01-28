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
	var _currentRefreshIntervalID;
	var _threshold = .0009;
	var _scheduledJobID;
	var _dateformat = "YYYY/MM/DD HH:mm:ss";
	var _moment = require('moment');
	var _buffer = require('buffer').Buffer;
	var _https  = require('https');
	var _schedule = require('node-schedule');

	this.getLogin = function() { 
		return _login;
	}

	this.setRefreshRates = function(day, night) {
		this._dayRefreshRate = day;
		this._nightRefreshRate = night;
	}

	this.processiCloudDevices = function (smartUpdate, callback) {
		var refreshInterval = _nightRefreshRate; // only between the hours of midnight and 6am
		var scheduledJobTime = _moment();

		this._smartUpdate = smartUpdate;
		this._getiCloudInfo(callback);

		if (_moment().hour() >= 6 && _moment().minutes() >= 1)
		{
			console.log("** (" + this._getCurrentTime() + ") It's currently between the hours of 6am and midnight, so daytime refresh will take place (every " + this._dayRefreshRate + " minutes)");

			refreshInterval = this._dayRefreshRate;
			scheduledJobTime.add('days', 1);
			scheduledJobTime.hour(0);
			scheduledJobTime.minutes(0);
			scheduledJobTime.seconds(0);
		}
		else
		{
			console.log("** (" + this._getCurrentTime() + ") It's currently between the hours of midnight and 6am, so daytime refresh will take place (every " + refreshInterval + " minutes)");			
			scheduledJobTime.hour(6);
			scheduledJobTime.minutes(1);
			scheduledJobTime.seconds(0);
		}

		if (typeof this._currentRefreshIntervalID !== 'undefined')
		{
			clearInterval(this._currentRefreshIntervalID)
		}

		this._currentRefreshIntervalID = setInterval(function() {
			_self._getiCloudInfo(callback);
		}, refreshInterval * _multiplier);			

		console.log("** (" + this._getCurrentTime() + ") Scheduling a job to change the refresh at " + scheduledJobTime.format(_dateformat));			

		if (typeof this._scheduledJobID !== 'undefined')
		{
			this._scheduledJobID.cancel();
		}

		// Schedule a refresh for when it's day and night.
		this._scheduledJobID = _schedule.scheduleJob(scheduledJobTime, function() {
			_self.processiCloudDevices(smartUpdate, callback);
		});
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
						// if the new latitute and longitude are within +/- X of the previous values, don't do anything
						if (device.location.latitude > theiCloudDevice.latitude + _threshold || device.location.latitude < theiCloudDevice.latitude - _threshold)
						{
							if (device.location.longitude > theiCloudDevice.longitude + _threshold || device.location.longitude < theiCloudDevice.longitude - _threshold)
							{
								locationChanged = true;
							}
							else {
								console.log("** (" + _self._getCurrentTime() + ") The device " + device.name + " location " + device.location.longitude + ", " + device.location.latitude + ") was not within the threshold, so no update necessary.");
							}
						}
						else {
							console.log("** (" + _self._getCurrentTime() + ") The device " + device.name + " location " + device.location.longitude + ", " + device.location.latitude + ") was not within the threshold, so no update necessary.");
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
