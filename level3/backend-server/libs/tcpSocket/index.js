const net = require('net');
const RequestPool = require('../requestPool');

class TCPSocket {
    constructor() {
        this.server = net.createServer();
        this.connection = null;
        this.error = null;
        this.httpVersion = null;
        this.server.on('connection', (connection) => this.receivedConnection(connection, this));
        this.requestPool = new RequestPool();

        const handleLoop = setInterval(() => {
            console.log(this.requestPool.pool)
            if (!this.requestPool.isPoolEmpty()) this.handleRawData();
        }, 1000);
    }

    listen(port = 9000) {
        return this.server.listen(port);
    }

    receivedConnection(connection, thisObj) {
        const remoteAddress = connection.remoteAddress + ':' + connection.remotePort;  
        console.log('new client connection from %s', remoteAddress);
        this.connection = connection;
        connection.on('data', (rawData) => thisObj.requestPool.addToPool(rawData.toString())); 
    }

    handleRawData() {
        try {
            var reqLine = this.requestPool.readUntil("\r\n");
            var headers = this.requestPool.readUntil("\r\n\r\n");

            headers = this.headersToHeaderObj(headers.trim().split("\r\n"));

            this.handleHTTPRequest(reqLine, headers);

        } catch (error) {
            return; // request is malformed or just no request at all 
        }
    }

    handleHTTPRequest(reqLine, headers) {
        if (/^(GET|POST|GPOST)\x20\/([a-z0-9A-Z\?\=\#\/ ]+)?\x20HTTP\/1\.(1|0)$/i.test(reqLine)) {

            const httpMethod = reqLine.match(/^(\w+)/i)[0];
            const resource = reqLine.match(/\/([a-z0-9A-Z\?\=\#\/ ]+)?\x20/i)[0]; // filter here
            this.httpVersion = reqLine.match(/HTTP\/1\.(1|0)$/i)[0].replace(/http\//i, "");

            if (this.httpVersion !== "1.1") {
                this.error = "We only support http 1.1";
            }

            if (httpMethod.toUpperCase() === "POST") {
                if (headers["Content-Length"] && headers["Content-Type"] === "application/x-www-form-urlencoded") {

                    var body = this.requestPool.readBytes(headers["Content-Length"]);
                    body = body.split("&");
                    
                    const data = {};

                    body.map(pair => {
                        const [key, value] = pair.split("=");
                        data[key] = value;
                    }); // 

                    return this.giveRespond( 
                        {
                            httpCode: 200,
                            httpVersion: this.httpVersion
                        }, 
                        {
                            "X-Requested-UUID": headers["X-Requested-UUID"],
                            "Set-Cookie": "name=" + (data["name"] ? data["name"] : null)
                        }, 

                        `
                        Your method was: ${httpMethod}\r\n
                        Your requested resource was: ${resource}
                        Your request data was: \r\n\r\n${body}
                        `
                    );

                } else if ("Transfer-Encoding" in headers && headers["Transfer-Encoding"].trim() === "chunked") {

                    const data = this.requestPool.readUntil("\r\n\r\n")
                    const parsedFromChunks = this.parseChunkedRequest(data);

                    return this.giveRespond( 
                        {
                            httpCode: 200,
                            httpVersion: this.httpVersion
                        }, 
                        {
                            "X-Requested-UUID": headers["X-Requested-UUID"]
                        }, 

                        `
                        Your method was: ${httpMethod}\r\n
                        Your requested resource was: ${resource}
                        Your request data was: \r\n\r\n${parsedFromChunks}\r\n
                        This was parsed from chunks
                        `
                    );
                } else {
                    return this.giveRespond( 
                        {
                            httpCode: 400,
                            httpVersion: this.httpVersion
                        }, 
                        {
                            "X-Requested-UUID": headers["X-Requested-UUID"]
                        }, 
                        "Can't parse request"
                    );
                }
            } else {
                return this.giveRespond( 
                    {
                        httpCode: 200,
                        httpVersion: this.httpVersion
                    }, 
                    {
                        "X-Requested-UUID": headers["X-Requested-UUID"]
                    }, 

                    `
                    Your method was: ${httpMethod}\r\n
                    Your requested resource was: ${resource}
                    `
                ); 
            }

        } else {
            this.giveRespond( 
                {
                    httpCode: 200,
                    httpVersion: this.httpVersion
                }, 
                {
                    "X-Requested-UUID": headers["X-Requested-UUID"]
                }, 
                "Error parsing HTTP request\r\n"
            );
        }
    }

    parseChunkedRequest(chunkedData) {
        const chunkedArr = chunkedData.split("\r\n");
        // do something here
        return chunkedArr.join("\r\n");
    }

    headersToHeaderObj(headers) {
        const headerObj = {};

        headers.forEach(header => {
            const [key, value] = header.split(":");
            headerObj[key.trim()] = value.trim(); // doing some NORMALIZATION here, notice!
        });
        return headerObj;
    } 

    giveRespond(options = {}, headers = {}, body = "") {
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
        this.connection.write(finalResponse);

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