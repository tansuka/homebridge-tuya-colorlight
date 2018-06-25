const tuya = require('homebridge-tuyapi-extended');

var Accessory,
    Service,
    Characteristic,
    UUIDGen;

module.exports = function(homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  homebridge.registerAccessory("homebridge-tuya-dimmer", "TuyaDimmer", TuyaDimmer);
}

function TuyaDimmer(log, config) {
  // Setup this up.
  this.log = log;
  this.name = config.name;
  this.config = config;
  this.log.prefix = 'Tuya Dimmer - ' + this.name;

  const debug = require('debug')('[Tuya Dimmer - '  + this.name + ' ]  ');

  this.debugging = config.debug || false;
  this.debugPrefix = config.debugPrefix || '~~~  '

  this.deviceEnabled = (typeof config.deviceEnabled === 'undefined') ? true : config.deviceEnabled;

  this.devId = config.devId;
  this.powerState = true;

  this.brightness = 100; // percentage value use _convertValToPercentage functions below.

  this.dps = {};

  this.powerState = false;
  this.noUpdate = false;

  this.refreshInterval = (config.refreshInterval !== undefined) ? config.refreshInterval : 60;  // Seconds

  // API timeout settings, tweak via config.
  this.apiMinTimeout = (typeof config.apiMinTimeout === undefined) ? 100 : config.apiMinTimeout;
  this.apiMaxTimeout = (typeof config.apiMaxTimeout  === undefined) ? 2000 : config.apiMaxTimeout;
  this.apiRetries = (typeof config.apiRetries === undefined) ? 1 : config.apiRetries;
  this.apiDebug = config.apiDebug || false;

  // this.tuyaDebug(JSON.stringify(config));

  // Setup Tuya Dimmer
  if (config.ip != undefined && this.deviceEnabled === true) {
    this.tuyaDebug('Tuya Dimmer ' + this.name + ' Ip is defined as ' + config.ip);
    this.tuyaDimmer = new tuya({type: 'color-lightbulb', ip: config.ip, id: config.devId, key: config.localKey, name: this.name, apiRetries: this.apiRetries, apiMinTimeout: this.apiMinTimeout, apiMaxTimeout: this.apiMaxTimeout, apiDebug: this.apiDebug, apiDebugPrefix: this.debugPrefix});
  } else if(this.deviceEnabled === true) {
    this.tuyaDebug('Tuya Dimmer ' + this.name + ' IP is undefined, resolving Ids and this usually does not work, so set a static IP for your powerstrip and add it to the config...');
    this.tuyaDimmer = new tuya({type: 'color-lightbulb', id: config.devId, key: config.localKey, name: this.name, apiRetries: this.apiRetries, apiMinTimeout: this.apiMinTimeout, apiMaxTimeout: this.apiMaxTimeout, apiDebug: this.apiDebug, apiDebugPrefix: this.debugPrefix});
    this.tuyaDimmer.resolveIds(); // This method sucks... it hangs, it doesn't resolve properly. Fix it.
  }

  if(this.debugging === true && this.apiDebug === true && this.deviceEnabled === true) {
    this.tuyaDebug('Tuya API Settings - Retries: ' + this.apiRetries + ' Debug: ' + this.apiDebug + ' Min Timeout: ' + this.apiMinTimeout + ' Max Timeout: ' + this.apiMaxTimeout);
  }

  //this.devicePolling();
  setInterval(this.devicePolling.bind(this), this.refreshInterval * 1000);


};

TuyaDimmer.prototype.getLightStatus = function(callback) {
  if(this.deviceEnabled === false) {
    this.log.warn('Device is disabled... Bailing out...');
    return callback('Disabled');
  }

  this.tuyaDimmer.get(this, {schema: true}).then(status => {
    this.tuyaDebug('BEGIN TUYA Dimmer STATUS ' + this.debugPrefix);
    var powerState = this.powerState;
    var brightness = this.brightness;

    var converted = [];
    var converted2 = [];

    if(status !== undefined) {
      if(status.dps['1'] !== undefined) {
        powerState = status.dps['1'];
        this.powerState = status.dps['1'];
      }

      if(status.dps['2'] !== undefined) {
        brightness = this._convertValToPercentage(status.dps['2']);
      }

      if(!this.debugging) {
        this.log.info('Received update for Tuya Dimmer');
      } else {
        this.tuyaDebug("dps[1]: " + status.dps['1']);
        this.tuyaDebug("dps[2]: " + status.dps['2']);
        this.tuyaDebug("dps[3]: " + status.dps['3']);
        this.tuyaDebug("dps[4]: " + status.dps['4']);
        this.tuyaDebug("dps[5]: " + status.dps['5']);
        this.tuyaDebug("dps[6]: " + status.dps['6']);
        this.tuyaDebug("dps[7]: " + status.dps['7']);
        this.tuyaDebug("dps[8]: " + status.dps['8']);
        this.tuyaDebug("dps[9]: " + status.dps['9']);
        this.tuyaDebug("dps[10]: " + status.dps['10']);

        this.tuyaDebug('Factored Results ' + this.name + ' device properties...');
        this.tuyaDebug('TUYA Light [1] Power: ' + powerState);
        this.tuyaDebug('TUYA Light [2] Brigness: ' + brightness);
      }
      // this.brightness = status.dps['3'] / 255 * 100;
    }

    this.tuyaDebug('END TUYA Dimmer STATUS ' + this.debugPrefix);

    this.brightness = brightness;
    this.powerState = powerState;

    callback();

  }).catch(error => {
    if(error) {
      this.tuyaDebug('BEGIN TUYA GET Dimmer STATUS ERROR ' + this.debugPrefix);
      this.tuyaDebug('Got Tuya Dimmer device ERROR for ' + this.name);
      this.tuyaDebug(error);
      this.tuyaDebug('END TUYA GET COLOR POWER STATUS ERROR ' + this.debugPrefix);
      if(!this.debugging) {
        this.log.warn(error.message);
      }
      callback(error, null);
    }
  });
};

TuyaDimmer.prototype.setToCurrentColor = function(callback) {
  if(this.deviceEnabled === false) {
    this.log.warn('Device is disabled... Bailing out...');
    callback('Disabled');
    return;
  }

  var brightness = this.brightness;
  var apiBrightness = this._convertPercentageToVal(brightness);

  // var ww = Math.round((this.brightness * 255) / 100);

  var dpsTmp = {
                '1' : true,
                '2' : apiBrightness
              };

  this.tuyaDimmer.set(this, {'id': this.devId, 'dps' : dpsTmp}).then(result => {

    if(this.debugging === true) {
      this.tuyaDebug('BEGIN TUYA SET Dimmer ' + this.debugPrefix);

      this.tuyaDebug('HEX COLOR 1 at ' + brightness + '% Brightness: ');

      this.tuyaDebug('SETTING ' + this.name + " device to ");
      this.tuyaDebug('SETTING BRIGHTNESS: ' + this.brightness + '% or ' + dpsTmp['2'] + ' of 255');

      this.tuyaDebug('SENT DPS VALUES: ');

      this.tuyaDebug("SENT dps[1]: " + dpsTmp['1']);
      this.tuyaDebug("SENT dps[2]: " + dpsTmp['2']);
      // this.tuyaDebug("Sent dps[6]: " + dpsTmp['6']);
      // this.tuyaDebug("Sent dps[7]: " + dpsTmp['7']);
      // this.tuyaDebug("Sent dps[8]: " + dpsTmp['8']);
      // this.tuyaDebug("Sent dps[9]: " + dpsTmp['9']);
      // this.tuyaDebug("Sent dps[10]: " + dpsTmp['10']);
      this.tuyaDebug('END TUYA SET Dimmer ' + this.debugPrefix);
    }
    callback();
  }).catch(error => {
    this.tuyaDebug('BEGIN TUYA SET Dimmer ERROR ' + this.debugPrefix);
    this.tuyaDebug('Got Tuya device error for Setting ' + this.name + ' device to: ');
    this.tuyaDebug(dpsTmp.toString());
    this.tuyaDebug(error.message);
    this.tuyaDebug('END TUYA SET Dimmer ERROR ' + this.debugPrefix);
    callback(error);
  });
};


// MARK: - ON / OFF

TuyaDimmer.prototype.getOnStatus = function(callback) {

  if(this.deviceEnabled === true) {
    this.tuyaDimmer.get(this, ["dps['1']"]).then(status => {
      this.tuyaDebug('TUYA GET Dimmer POWER for ' + this.name + ' dps: 1'  + this.debugPrefix);
      this.tuyaDebug('Returned Status: ' + status);
      this.tuyaDebug('END TUYA GET Dimmer POWER ' + this.debugPrefix);
      callback(null, status);
    }).catch(error => {
        this.tuyaDebug('TUYA GET Dimmer POWER ERROR for ' + this.name + ' dps: 1');
        this.tuyaDebug(error.message);
        this.tuyaDebug('END TUYA GET Dimmer POWER ERROR ' + this.debugPrefix);
        return callback(error);
    });
  } else {
    this.log.warn('Device is disabled... Bailing out...');
    return callback('Device is disabled...');
  }
}

TuyaDimmer.prototype.setOnStatus = function(on, callback) {

  this.tuyaDebug('Current Powerstate: ' + this.powerState + ' Changing to: ' + on);

  if(this.deviceEnabled === true) {
    var dpsTmp = {'1' : on}
    // TODO: Skip if the light is already on...
    this.tuyaDimmer.set(this, {'id': this.devId, 'dps' : dpsTmp}).then(result => {
        if(result) {
          this.tuyaDebug('TUYA SET Dimmer POWER ' + this.debugPrefix);
          this.tuyaDebug('Setting ' + this.name + ' dps: ' + '1' + ' device to: ' + on);
          this.tuyaDebug('Setting ' + this.name + ' Result: ' + result);

          this.tuyaDebug('END TUYA SET Dimmer POWER ' + this.debugPrefix);
          this.powerState = on;
          callback();
        }
      }).catch(error => {
          this.tuyaDebug('BEGIN TUYA GET Dimmer STATUS ERROR ' + this.debugPrefix);
          this.tuyaDebug('Got Tuya Dimmer device ERROR for ' + this.name);
          this.tuyaDebug(error);
          this.tuyaDebug('END TUYA GET COLOR POWER STATUS ERROR ' + this.debugPrefix);
          if(!this.debugging) {
            this.log.warn(error.message);
          }
          callback(error);
    });
  } else {
    this.log.warn('Device is disabled... Bailing out...');
    return callback('Disabled');
  }
}

// MARK: - BRIGHTNESS
TuyaDimmer.prototype.getBrightness = function(callback) {
  var brightness = this.brightness;
  this.brightness = brightness;

  this.tuyaDebug('getBrightness: ' + brightness);

  callback(null, brightness);
};

TuyaDimmer.prototype.setBrightness = function(value, callback) {
  this.brightness = value;
  var newValue = this._convertPercentageToVal(value);
  this.tuyaDebug(this.debugPrefix + " BRIGHTNESS from UI: " + value + ' Converted from 100 to 255 scale: ' +  newValue);
  this.setToCurrentColor(function() {
    this.tuyaDebug('Finished setCurrentColor callback');
    callback();
  }.bind(this));
}


TuyaDimmer.prototype._getAlphaHex = function(brightness) {
  // for (var i = 1; i >= 0; i -= 0.01) {
  var i = brightness  / 100;
  this.tuyaDebug('input brightness: ' + brightness + ' and i is ' + i);
  var alpha = Math.round(i * 255);
  var hex = (alpha + 0x10000).toString(16).substr(-2);
  var perc = Math.round(i * 100);

  this.tuyaDebug('alpha percent: ' + perc + '% hex: ' + hex + ' alpha: ' + alpha);
  return hex;
};


// MARK: - Polling

TuyaDimmer.prototype.devicePolling = function() {

  this.log('Polling at interval... ' + this.refreshInterval + ' seconds');

  this.getLightStatus(function(error, result) {
    if(error) {
      this.tuyaDebug('Error getting light status');
    } else {
      // this.tuyaDebug(JSON.stringify(result, null, 8));
      // this.tuyaDebug(JSON.stringify(this, null, 8));
    }
      // this.tuyaDebug(JSON.stringify(this, null, 8));
  }.bind(this));

  if(this.config.superDebug) {
    this.tuyaDebug(JSON.stringify(this, null, 8));
  }
};

// MARK: - Helper Functions

TuyaDimmer.prototype._convertPercentageToVal = function(percentage) {
  var tmp = Math.round(255 * (percentage / 100));
  this.tuyaDebug('Converted ' + percentage + ' to: ' + tmp);
  return tmp;
};

TuyaDimmer.prototype._convertValToPercentage = function(val) {
  var tmp = Math.round((val / 255) * 100);
  this.tuyaDebug('Converted ' + val + ' to: ' + tmp);
  return tmp;
};

TuyaDimmer.prototype.tuyaDebug = function(args) {
  if(this.debugging === true) {
    this.log.debug(this.debugPrefix, args);
  }
};

TuyaDimmer.prototype.identify = function (callback) {
  this.tuyaDebug(this.name + ' was identified.');
  callback();
};

TuyaDimmer.prototype.getServices = function() {
  this.devicePolling();

  // Setup the HAP services
  informationService = new Service.AccessoryInformation();

  informationService
        .setCharacteristic(Characteristic.Manufacturer, 'Tuya')
        .setCharacteristic(Characteristic.Model, 'Dimmer')
        .setCharacteristic(Characteristic.SerialNumber, this.devId);

  var lightbulbService = new Service.Lightbulb(this.name);

  lightbulbService.getCharacteristic(Characteristic.On)
        .on('get', this.getOnStatus.bind(this))
        .on('set', this.setOnStatus.bind(this));

  lightbulbService.getCharacteristic(Characteristic.Brightness)
        .on('get', this.getBrightness.bind(this))
        .on('set', this.setBrightness.bind(this));

    return  [informationService, lightbulbService];
};

