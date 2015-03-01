#! /usr/bin/env node
"use strict";

/**
 * @module BrowserSync
 */
var pjson         = require("./package.json");
var BrowserSync   = require("./lib/browser-sync");
var utils         = require("./lib/utils");
var events        = require("events");
var logger        = require("eazy-logger").Logger({
    useLevelPrefixes: true
});

var singleton        = false;
var singletonPlugins = [];
var instances        = [];

/**
 * @type {boolean|EventEmitter}
 */
var singletonEmitter = false;

/**
 * @method browserSync
 * @param {Object} [config] This is the main configuration for your BrowserSync instance and can contain any of the [available options]({{site.links.options}})
 *  If you do not pass a config an argument for configuration, BrowserSync will still run; but it will be in the `snippet` mode
 * @param {Function} [cb] If you pass a callback function, it will be called when BrowserSync has completed all setup tasks and is ready to use. This
 * is useful when you need to wait for information (for example: urls, port etc) or perform other tasks synchronously.
 * @returns {BrowserSync}
 */
module.exports         = initSingleton;
module.exports.init    = initSingleton;

/**
 * Register a plugin. Must implement at least a 'plugin' method that returns a
 * callable function.
 *
 * @method use
 * @param {String} name The name of the plugin
 * @param {Object} module The object to be `required`.
 * @param {Function} [cb] A callback function that will return any errors.
 */
module.exports.use     = function () {
    var args = Array.prototype.slice.call(arguments);
    singletonPlugins.push({
        args: args
    });
};

/**
 * The `reload` method will inform all browsers about changed files and will either cause the browser to refresh, or inject the files where possible.
 *
 * @method reload
 * @param {String|Array|Object} [arg] The file or files to be reloaded. For
 * details and examples of Streams support, please see the [GulpJS]({{site.links.gulp}}) examples
 * @returns {*}
 */
module.exports.reload  = noop("reload");

/**
 * Helper method for browser notifications
 *
 * @method notify
 * @param {String|HTML} msg Can be a simple message such as 'Connected' or HTML
 * @param {Number} [timeout] How long the message will remain in the browser. @since 1.3.0
 */
module.exports.notify  = noop("notify");

/**
 * This method will close any running server, stop file watching & exit the current process.
 *
 * @method exit
 */
module.exports.exit    = noop("exit");

/**
 * Method to pause file change events
 *
 * @method pause
 */
module.exports.pause   = noop("pause");

/**
 * Method to resume paused watchers
 *
 * @method resume
 */
module.exports.resume  = noop("resume");

/**
 * Add properties fo
 */
Object.defineProperties(module.exports, {
    /**
     * The internal Event Emitter used by the running BrowserSync instance (if there is one).
     * You can use this to emit your own events, such as changed files, logging etc.
     *
     * @property emitter
     */
    "emitter": {
        get: function () {
            if (!singletonEmitter) {
                singletonEmitter = newEmitter();
                return singletonEmitter;
            }
            return singletonEmitter;
        }
    },
    /**
     * A simple true/false flag that you can use to determine if there's a currently-running BrowserSync instance.
     *
     * @property active
     */
    "active": {
        get: getSingletonValue.bind(null, "active")
    },
    /**
     * A simple true/false flag to determine if the current instance is paused
     *
     * @property paused
     */
    "paused": {
        get: getSingletonValue.bind(null, "paused")
    }
});

/**
 * Event emitter factory
 * @returns {EventEmitter}
 */
function newEmitter() {
    var emitter       = new events.EventEmitter();
    emitter.setMaxListeners(20);
    return emitter;
}

/**
 * Get the singleton's emitter, or a new one.
 * @returns {EventEmitter}
 */
function getSingletonEmitter() {
    if (singletonEmitter) {
        return singletonEmitter;
    }
    singletonEmitter = newEmitter();
    return singletonEmitter;
}

/**
 * Helper to allow methods to be called on the module export
 * before there's a running instance
 * @param {String} name
 * @returns {Function}
 */
function noop(name) {
    return function () {
        var args = Array.prototype.slice.call(arguments);
        if (singleton) {
            return singleton[name].apply(singleton, args);
        } else {
            if (name === "reload" && args[0] && args[0].stream) {
                return utils.noopStream();
            }
        }
    };
}

/**
 * Create a single instance when module export is used directly via browserSync({});
 * This is mostly for back-compatibility, for also for the nicer api.
 * This will never be removed to ensure we never break user-land, but
 * we should discourage it's use.
 * @returns {*}
 */
function initSingleton() {
    var instance;
    if (instances.length) {
        instance = instances.filter(function (item) {
            return item.name === "singleton";
        });
        if (instance.length) {
            logger.error("{yellow:You tried to start BrowserSync twice!} To create multiple instances, use {cyan:browserSync.create().init()");
            return instance;
        }
    }
    var args = Array.prototype.slice.call(arguments);
    singleton = create("singleton", getSingletonEmitter());

    if (singletonPlugins.length) {
        singletonPlugins.forEach(function (obj) {
            singleton.instance.registerPlugin.apply(singleton.instance, obj.args);
        });
    }

    singleton.init.apply(null, args);
    return singleton;
}

/**
 * @param {String} prop
 * @returns {Object|Boolean}
 */
function getSingletonValue(prop) {
    var single = getSingle("singleton");
    if (single) {
        return single[prop];
    }
    return false;
}

/**
 * Get a single instance by name
 * @param {String} name
 * @returns {Object|Boolean}
 */
function getSingle(name) {
    if (instances.length) {
        var match = instances.filter(function (item) {
            return item.name === name;
        });
        if (match.length) {
            return match[0];
        }
    }
    return false;
}

/**
 * Create an instance of BrowserSync
 * @param {String} [name]
 * @param {EventEmitter} [emitter]
 * @returns {{init: *, exit: (exit|exports), notify: *, reload: *, cleanup: *, emitter: (BrowserSync.events|*), use: *}}
 */
function create(name, emitter) {

    name = name || new Date().getTime();
    var browserSync = new BrowserSync(emitter || newEmitter(), name);

    var instance = {
        name:      name,
        instance:  browserSync,
        init:      require("./lib/public/init")(browserSync, name, pjson),
        exit:      require("./lib/public/exit")(browserSync),
        notify:    require("./lib/public/notify")(browserSync),
        pause:     require("./lib/public/pause")(browserSync),
        resume:    require("./lib/public/resume")(browserSync),
        reload:    require("./lib/public/reload")(emitter),
        cleanup:   browserSync.cleanup.bind(browserSync),
        use:       browserSync.registerPlugin.bind(browserSync),
        getOption: browserSync.getOption.bind(browserSync),
        emitter:   browserSync.events
    };

    Object.defineProperty(instance, "active", {
        get: function () {
            return browserSync.active;
        }
    });

    Object.defineProperty(instance, "paused", {
        get: function () {
            return browserSync.paused;
        }
    });

    instances.push(instance);

    return instance;
}

/**
 * Reset the state of the module.
 * (should only be needed for test environments)
 */
module.exports.reset = function () {
    instances.forEach(function (item) {
        item.cleanup();
    });
    instances        = [];
    singletonPlugins = [];
    singletonEmitter = false;
    singleton        = false;
    process.removeAllListeners("SIGINT");
};

/**
 * Get a single instance by name
 * @param {String} name
 * @returns {Object|Boolean}
 */
module.exports.get = function (name) {
    var instance = getSingle(name);
    if (instance) {
        return instance;
    }
    throw new Error("An instance with the name `%s` was not found.".replace("%s", name));
};

/**
 * @type {Array}
 */
module.exports.instances = instances;

/**
 * Create an instance of BrowserSync
 * @type {create}
 */
module.exports.create    = create;
