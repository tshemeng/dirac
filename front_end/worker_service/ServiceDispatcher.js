// Copyright 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @interface
 */
function Service() { }

Service.prototype = {
    /**
     * @return {!Promise}
     */
    dispose: function() { },

    /**
     * @return {function(string)}
     */
    setNotify: function(notify) { }
};

/**
 * @constructor
 * @param {!ServicePort} port
 */
function ServiceDispatcher(port)
{
    /** @type {!Map<string, !Object>} */
    this._objects = new Map();
    this._lastObjectId = 1;
    this._port = port;
    this._port.setHandlers(this._dispatchMessageWrapped.bind(this), this._connectionClosed.bind(this));
}

ServiceDispatcher.prototype = {
    /**
     * @param {string} data
     */
    _dispatchMessageWrapped: function(data)
    {
        try {
            var message = JSON.parse(data);
            if (!(message instanceof Object)) {
                this._sendErrorResponse(message["id"], "Malformed message");
                return;
            }
            this._dispatchMessage(message);
        } catch (e) {
            this._sendErrorResponse(message["id"], e.toString());
        }
    },

    /**
     * @param {!Object} message
     */
    _dispatchMessage: function(message)
    {
        var domainAndMethod = message["method"].split(".");
        var serviceName = domainAndMethod[0];
        var method = domainAndMethod[1];

        if (method === "create") {
            var extensions = self.runtime.extensions(Service).filter(extension => extension.descriptor()["name"] === serviceName);
            if (!extensions.length) {
                this._sendErrorResponse(message["id"], "Could not resolve service '" + serviceName + "'");
                return;
            }
            extensions[0].instance().then(object => {
                var id = String(this._lastObjectId++);
                object.setNotify(this._notify.bind(this, id, serviceName));
                this._objects.set(id, object);
                this._sendResponse(message["id"], { id: id });
            });
        } else if (method === "dispose") {
            var object = this._objects.get(message["params"]["id"]);
            if (!object) {
                console.error("Could not look up object with id for " + JSON.stringify(message));
                return;
            }
            this._objects.delete(message["params"]["id"]);
            object.dispose().then(() => this._sendResponse(message["id"], {}));
        } else {
            if (!message["params"]) {
                console.error("No params in the message: " + JSON.stringify(message));
                return;
            }
            var object = this._objects.get(message["params"]["id"]);
            if (!object) {
                console.error("Could not look up object with id for " + JSON.stringify(message));
                return;
            }
            var handler = object[method];
            if (!(handler instanceof Function)) {
                console.error("Handler for '" + method + "' is missing.");
                return;
            }
            object[method](message["params"]).then(result => this._sendResponse(message["id"], result));
        }
    },

    _connectionClosed: function()
    {
        for (var object of this._objects.values())
            object.dispose();
        this._objects.clear();
    },

    /**
     * @param {string} objectId
     * @param {string} serviceName
     * @param {string} method
     * @param {!Object} params
     */
    _notify: function(objectId, serviceName, method, params)
    {
        params["id"] = objectId;
        var message = { method: serviceName + "." + method, params: params };
        this._port.send(JSON.stringify(message));
    },

    /**
     * @param {string} messageId
     * @param {!Object} result
     */
    _sendResponse: function(messageId, result)
    {
        var message = { id: messageId, result: result };
        this._port.send(JSON.stringify(message));
    },

    /**
     * @param {string} messageId
     * @param {string} error
     */
    _sendErrorResponse: function(messageId, error)
    {
        var message = { id: messageId, error: error };
        this._port.send(JSON.stringify(message));
    }
};

/**
 * @constructor
 * @param {!Port|!Worker} port
 * @implements {ServicePort}
 */
function WorkerServicePort(port)
{
    this._port = port;
    this._port.onmessage = this._onMessage.bind(this);
    this._port.onerror = console.error;
}

WorkerServicePort.prototype = {
    /**
     * @override
     * @param {function(string)} messageHandler
     * @param {function(string)} closeHandler
     */
    setHandlers: function(messageHandler, closeHandler)
    {
        this._messageHandler = messageHandler;
        this._closeHandler = closeHandler;
    },

    /**
     * @override
     * @param {string} data
     * @return {!Promise}
     */
    send: function(data)
    {
        this._port.postMessage(data);
        return Promise.resolve();
    },

    /**
     * @override
     * @return {!Promise}
     */
    close: function()
    {
        return Promise.resolve();
    },

    /**
     * @param {!MessageEvent} event
     */
    _onMessage: function(event)
    {
        this._messageHandler(event.data);
    }
};

var dispatchers = [];

if (self instanceof SharedWorkerGlobalScope) {
    function onNewPort(port)
    {
        var dispatcher = new ServiceDispatcher(new WorkerServicePort(port));
        dispatchers.push(dispatcher);
    }
    Runtime.setSharedWorkerNewPortCallback(onNewPort);
} else {
    var worker = /** @type {!Object} */(self);
    var servicePort = new WorkerServicePort(/** @type {!Worker} */(worker));
    dispatchers.push(new ServiceDispatcher(servicePort));
}
