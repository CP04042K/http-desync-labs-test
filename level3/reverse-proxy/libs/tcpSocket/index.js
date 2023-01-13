const net = require('net');

const backend = require('../backend');
const { getRandomId } = require('./utils.js');

const backendServer = new backend("127.0.0.1", 8081);

class TCPSocket {
    constructor() {
        backendServer.setCallback(() => {
            this.isBackendConnected = true;
        })

        this.backendConnection = backendServer.getConnection();
        this.isBackendConnected = false;
        this.backendConnection.on("data", (rawData) => this.handleRawData(rawData, this, null, true));
        this.connections = {};
        
        this.server = net.createServer();
        this.server.on('connection', (connection) => {
            const randomUUID = getRandomId();
            this.connections[randomUUID] = connection;
            this.receivedConnection(this, randomUUID)
        });
        

        this.error = null;
        this.httpVersion = null;
    }

    listen(port = 9000) {
        return this.server.listen(port);
    }

    receivedConnection(thisObj, randomUUID) {
        const remoteAddress = this.connections[randomUUID].remoteAddress + ':' + this.connections[randomUUID].remotePort;  
        console.log('new client connection from %s', remoteAddress);
        this.connections[randomUUID].on('data', (rawData) => thisObj.handleRawData(rawData, thisObj, randomUUID));  
    }

    readUntil(stream, char) {
        var result = "";
        while(stream.length) {
            if (stream.substr(0, char.length) === char) {
                stream = stream.substr(char.length);
                return {result, left: stream};
            }
            result += stream.substr(0,1); 
            stream = stream.substr(1);
        }
        return {result, left: stream};
    }

    handleRawData(rawData, thisObj, randomUUID = null, isFromBackend = false) {
        try {
            var data = rawData.toString();

            if (isFromBackend) {
                const originalData = data;

                var {result, left: data} = thisObj.readUntil(data, "\r\n");
                var {result: headers, left: data} = thisObj.readUntil(data, "\r\n\r\n");
                headers = thisObj.headersToHeaderObj(headers.trim().split("\r\n"));

                this.connections[headers["X-Requested-UUID"]].write(originalData);
            } else {
                var {result: reqLine, left: data} = thisObj.readUntil(data, "\r\n");
                var {result: headers, left: data} = thisObj.readUntil(data, "\r\n\r\n");

                headers = thisObj.headersToHeaderObj(headers.trim().split("\r\n"));

                var stream = thisObj.handleHTTPRequest(reqLine, headers, data, thisObj, randomUUID);
            }
            
        } catch (error) {
            console.log(error);
            return; // request is malformed or just no request at all 
        }
    }

    handleHTTPRequest(reqLine, headers, stream, thisObj, randomUUID) {
        if (/^(GET|POST)\x20\/([a-z0-9A-Z\?\=\#\/ ]+)?\x20HTTP\/1\.(1|0)$/i.test(reqLine)) {

            const httpMethod = reqLine.match(/^(\w+)/i)[0];
            const resource = reqLine.match(/\/([a-z0-9A-Z\?\=\#\/ ]+)?\x20/i)[0]; // filter here
            thisObj.httpVersion = reqLine.match(/HTTP\/1\.(1|0)$/i)[0].replace(/http\//i, "");

            if (thisObj.httpVersion !== "1.1") {
                thisObj.error = "We only support http 1.1";
            }

            if (httpMethod.toUpperCase() === "POST") {
                if ("Transfer-Encoding" in headers && headers["Transfer-Encoding"].trim() === "chunked") {
                    var body = this.parseChunkedRequest(stream);
                } else if (headers["Content-Length"]) {
                    var {result: body, left: stream} = thisObj.readBytes(stream, headers["Content-Length"]);
                } else {
                    var body = "Can't parse request without Content-Length or Transfer-Encoding";
                }
            } else {
                var body = "";
            }

            

            // do some filter in query string and body, then forward the request to backend-server

            thisObj.forwardToBackend(reqLine, headers, body, randomUUID);

            return stream;

        } else {
            thisObj.error = "Unexpected error";
        }
        return stream;
    }

    readBytes(stream, byteToRead) {
        return {result: stream.substr(0, byteToRead), left: stream.substr(byteToRead)}
    }

    headersToHeaderObj(headers) {
        const headerObj = {};

        headers.forEach(header => {
            const [key, value] = header.split(":");
            headerObj[key.trim()] = value.trim(); // doing some NORMALIZATION here, notice!
        });
        return headerObj;
    } 

    parseChunkedRequest(chunkedData) {
        const chunkedArr = chunkedData.split("\r\n");
        // do something here
        return chunkedArr.join("\r\n");
    }

    giveRespond(options = {}, headers = {}, body = "", randomUUID) {
        // init 3 parts of response
        var responseStatusLine = "";
        var responseHeaders = {...headers};
        var responseBody = body;
        // create status line
        responseStatusLine += "HTTP/" + options.httpVersion + " ";
        responseStatusLine += options.httpCode + " ";
        responseStatusLine += this.getResponseMessage(options.httpCode);
        // create some essential headers
        responseHeaders["Date"] = new Date().toUTCString();
        responseHeaders["Content-Type"] = "text/html";
        // create respond's message
        
        var finalResponse = responseStatusLine + "\r\n";

        Object.entries(responseHeaders).forEach(([headerName, headerValue]) => 
            finalResponse += `${headerName}: ${headerValue}\r\n`
        );
        finalResponse += `Content-Length: ${responseBody.length}\r\n\r\n`;

        finalResponse += responseBody;
        this.connections[randomUUID].write(finalResponse);

    }

    forwardToBackend(reqLine, headers = {}, body = "", randomUUID) {
        if (!this.isBackendConnected) {
            this.giveRespond(
                {
                    httpCode: 503,
                    httpVersion: this.httpVersion
                },
                {"X-Requested-UUID": randomUUID},
                "Can't connect to the backend server\r\n",
                randomUUID
            )
        }

        var request = "";

        request += reqLine + "\r\n";

        Object.entries(
            {
                ...headers, 
                "X-Forwarded-For": this.connections[randomUUID].remoteAddress,
                "X-Requested-UUID": randomUUID
            }
        )
            .forEach(([headerName, headerValue]) => 
                request += `${headerName}: ${headerValue}\r\n`
            );

        if (!("Content-Length" in headers || "Transfer-Encoding" in headers)) 
            request += `Content-Length: ${body.length}\r\n`;
        
        request += "\r\n" + body;

        this.backendConnection.write(request);

    }

    getResponseMessage(httpCode) {
        return {
            "200": "OK",
            "404": "Not found",
            "403": "Forbiden",
            "400": "Bad request",
            "503": "Internal server error"
        }[httpCode.toString()]
    }

}

module.exports = TCPSocket;