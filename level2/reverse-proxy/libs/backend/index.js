const net = require('net');

class Backend {

    constructor(host = "127.0.0.1", port = 8080) {
        this.host = host;
        this.port = port;
        this.callback = null;
    }

    setCallback(callbackFnc) {
        this.callback = callbackFnc;
    }

    getConnection() {
        return net.createConnection(this.port, this.host, this.callback)
    }
}

module.exports = Backend;