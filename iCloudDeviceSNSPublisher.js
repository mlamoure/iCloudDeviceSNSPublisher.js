/**
 * Simple library to Publish updates for iOS devices to SNS. Useful for logging and other home integration efforts.
 * Code credit to Thomas Henley on parts for locating iOS devices (iPhone, iPod and iPad)
 */
var Buffer = require('buffer').Buffer;
var https  = require('https');
var AWS = require('aws-sdk');
var util = require('util');
var moment = require('moment');
var fs = require('fs');
var AWS_SNS;

var dateformat = "YYYY/MM/DD HH:mm:ss";

var iCloudCheckFrequency;
var iCloudTopicARN;
var iCloudAccounts;

function main() {
	loadConfiguration(function() {
		
		// run once right away.
		runiCloudNotification();

		// schedule reoccuring check
		setInterval(function() {
			runiCloudNotification();
		}, iCloudCheckFrequency * 60 * 1000);

		// watch the configuration file for changes.  reload if anything changes
		fs.watchFile('devicewatch.conf', function (event, filename) {
			console.log("** (" + getCurrentTime() + ") RELOADING CONFIGURATION");

			loadConfiguration(function() {
				// nothing to do here yet.
			});
		});

	});

}

function runiCloudNotification() {
	var message;

	for (var iCloudAccount in iCloudAccounts)
	{
		getiCloudInfo(iCloudAccounts[iCloudAccount].login, iCloudAccounts[iCloudAccount].password, function(message) {
			console.log("** (" + getCurrentTime() + ") About to publish message: " + message);

			publish_sns(iCloudTopicARN, message)
		});
	}	
}

function loadConfiguration(callback) {

	fs.readFile("./configuration.json", 'utf8', function (err, data) {
		if (err) {
			console.log("** (" + getCurrentTime() + ") ERROR LOADING CONFIGURATION: " + err);
			return;
		}

		var configuration = JSON.parse(data);

		console.log("** (" + getCurrentTime() + ") CONFIGURATION: Adding AWS credentials");

		// configure AWS 
		AWS.config.update({
			'region': configuration.AWS.defaultRegion,
		    'accessKeyId': configuration.AWS.accessKeyId,
		    'secretAccessKey': configuration.AWS.secretAccessKey
		});

		iCloudAccounts = configuration.iCloudAccounts;

		for(var iCloudAccount in configuration.iCloudAccounts) {
			console.log("** (" + getCurrentTime() + ") CONFIGURATION: Adding iCloud Account " + iCloudAccounts[iCloudAccount].login);
//			iCloudAccounts[iCloudAccounts.length] = [configuration.iCloudAccounts[iCloudAccount].login, configuration.iCloudAccounts[iCloudAccount].password];
		}

		//configure the interval for iCloud check
		iCloudCheckFrequency = parseInt(configuration.iCloudCheckFrequency);
		console.log("** (" + getCurrentTime() + ") CONFIGURATION: Setting iCloud Refresh Frequency: " + iCloudCheckFrequency);

		iCloudTopicARN = configuration.AWSTopicARN;
		console.log("** (" + getCurrentTime() + ") CONFIGURATION: Setting SNS Topic to publish on: " + iCloudTopicARN);

		AWS_SNS = new AWS.SNS().client;		

		if (callback != null) callback();
	});
}

function buildiCloudSNSMessage(id, name, modelDisplayName, batteryLevel, batteryStatus) {
	var message = {
		'deviceID': id,
		'deviceName': name,
		'modelDisplayName': modelDisplayName,
		'batteryLevel': batteryLevel,
		'batteryStatus': batteryStatus
	}

	return message;
}

function findAllDevices(username, password, callback) {
    // Send a request to the find my iphone service for the partition host to use
    getPartitionHost(username, password, function(err, partitionHost) {
        // Now get the devices owned by the user
        getDeviceDetails(partitionHost, username, password, callback);
    });
};

function getPartitionHost(username, password, callback) {
    postRequest('fmipmobile.icloud.com', username, password, function(err, response) {
        // Return the partition host if available
        return callback(null, response.headers['x-apple-mme-host']);
    });
};

function getDeviceDetails(partitionHost, username, password, callback) {
    postRequest(partitionHost, username, password, function(err, response) {
        var allDevices = JSON.parse(response.body).content;
        return callback(null, allDevices);
    });
}

function postRequest(host, username, password, callback) {
    var apiRequest = https.request({
        host: host,
        path: '/fmipservice/device/' + username + '/initClient',
        headers: {
            Authorization: 'Basic ' + new Buffer(username + ':' + password).toString('base64')
        },
        method: 'POST'
    }, function(response) {
        var result = {headers: response.headers, body: ''};
        response.on('data', function(chunk) {result.body = result.body + chunk; });
        response.on('end', function() { return callback(null, result); });
    });
    apiRequest.end();
};

function publish_sns(topicARN, message) {
	AWS_SNS.publish({
	    'TopicArn': topicARN,
	    'Message': message,
	}, function (err, result) {
	 
	    if (err !== null) {
			console.log("** (" + getCurrentTime() + ") ERROR: ");
	        console.log(util.inspect(err));
			return;
	    }
			console.log("** (" + getCurrentTime() + ") Sent a message and Amazon responded with: ");
			console.log(result);
	});
}

function getCurrentTime() {
	return (moment().format(dateformat));
}

function getiCloudInfo(iCloudLogin, iCloudPassword, callback) {
	var message = "";

	// Find all devices the user owns
	findAllDevices(iCloudLogin, iCloudPassword, function(err, devices) {
	    // Got here? Great! Lets see some device information
	    devices.forEach(function(device) {
	    	if (device.modelDisplayName == "iPhone" || device.modelDisplayName == "iPad")
	    	{
				// Output device information
				console.log("** (" + getCurrentTime() + ") **************************************");
				
				console.log('\tDevice Name: ' + device.name);
				console.log('\tDevice ID: ' + device.id);
				console.log('\tDevice Type: ' + device.modelDisplayName);
				console.log('\tBattery Level: ' + device.batteryLevel);
				console.log('\tBattery Status: ' + device.batteryStatus);

				if (device.location !== null)
				{
			        // Output location (latitude and longitude)
					var lat = device.location.latitude;
					var lon = device.location.longitude;

					console.log('\tTimestamp: ' + device.location.timeStamp);
					console.log('\tLatitude: ' + lat);
					console.log('\tLongitude: ' + lon);
					console.log('\tisOld: ' + device.location.isOld);
					console.log('\tisInAccurate: ' + device.location.isInaccurate);


					// Output a url that shows the device location on google maps
					console.log('\tView on Map: http://maps.google.com/maps?z=15&t=m&q=loc:' + lat + '+' + lon);

					message = buildiCloudSNSMessage(device.id, device.name, device.modelDisplayName, device.batteryLevel, device.batteryStatus,
						device.location.timeStamp, lat, lon, device.location.isOld, device.location.isInaccurate);

				}
				else
				{
					message = buildiCloudSNSMessage(device.id, device.name, device.modelDisplayName, device.batteryLevel, device.batteryStatus);
				}

				callback(JSON.stringify(message));

				console.log("**************************************");
	    	}
	    });
	});
}

main()
