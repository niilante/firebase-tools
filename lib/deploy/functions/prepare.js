'use strict';

var _ = require('lodash');
var cjson = require('cjson');
var chalk = require('chalk');
var path = require('path');
var RSVP = require('rsvp');

var ensureApiEnabled = require('../../ensureApiEnabled');
var ensureBillingEnabled = require('./ensureBillingEnabled');
var env = require('../../env');
var fsutils = require('../../fsutils');
var resolveProjectPath = require('../../resolveProjectPath');
var utils = require('../../utils');

var VALID_FUNCTION_NAME_REGEX = /^[a-z][a-zA-Z0-9_-]{1,62}$/i;

module.exports = function(context, options, payload) {
  if (!options.config.has('functions')) {
    return RSVP.resolve();
  }

  var sourceDirName = options.config.get('functions.source');

  if (!fsutils.dirExistsSync(resolveProjectPath(options.cwd, sourceDirName))) {
    var msg = 'could not deploy functions because the ' + chalk.bold('"' + sourceDirName + '"') +
      ' directory was not found. Please create it or specify a different source directory in firebase.json';

    return utils.reject(msg, {exit: 1});
  }

  // Function name validation
  var invalidNames = _.reject(_.keys(payload.functions), function(name) {
    return _.startsWith(name, '.') || VALID_FUNCTION_NAME_REGEX.test(name);
  });
  if (!_.isEmpty(invalidNames)) {
    return utils.reject(invalidNames.join(', ') + ' function name(s) must be a valid subdomain (lowercase letters, numbers and dashes)', {exit: 1});
  }

  // Check main file specified in package.json is present
  var sourceDir = options.config.path(sourceDirName);
  var packageJsonFile = path.join(sourceDir, 'package.json');
  if (fsutils.fileExistsSync(packageJsonFile)) {
    try {
      var data = cjson.load(packageJsonFile);
      var indexJsFile = path.join(sourceDir, data.main || 'index.js');
      if (!fsutils.fileExistsSync(indexJsFile)) {
        return utils.reject(path.relative(options.config.projectDir, indexJsFile) + ' does not exist, can\'t deploy Firebase Functions', {exit: 1});
      }
    } catch (e) {
      return utils.reject('There was an error reading ' + sourceDirName + path.sep + 'package.json:\n\n' + e.message, {exit: 1});
    }
  } else if (!fsutils.fileExistsSync(path.join(sourceDir, 'function.js'))) {
    return utils.reject('No npm package found in functions source directory. Please run \'npm init\' inside ' + sourceDirName, {exit: 1});
  }

  return ensureBillingEnabled(options.project).then(function() {
    return RSVP.all([
      ensureApiEnabled(options.project, 'cloudfunctions', 'functions'),
      env.ensureSetup(options)
    ]).then(function(results) {
      _.set(context, 'firebaseConfig', results[1].reserved.firebase);
    });
  });
};
