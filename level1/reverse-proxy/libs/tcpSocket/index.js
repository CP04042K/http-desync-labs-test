const net = require('net');

// NOTE: Code bang nodejs rat kho vi CRLF "\r\n" no tinh la 2 bytes
// NOTE: Chua smuggling duoc do ham readBytes(), do van de ben tren
// NOTE: phai xem cach cai lib axios no code the nao
class TCPSocket {
    constructor(mode) {
        if (mode === 'server') {
            this.server = net.createServer();
            this.server.on('connection', (connection) => this.receivedHTTP(connection, this));
        }
        this.error = null;
        this.httpVersion = null;
    }

    listen(port = 9000) {
        return this.server.listen(port);
    }

    receivedHTTP(connection, thisObj) {
        const remoteAddress = connection.remoteAddress + ':' + connection.remotePort;  
        console.log('new client connection from %s', remoteAddress);
        connection.on('data', (rawData) => thisObj.handleRawData(connection, rawData, thisObj));  
    }

    readUntil(stream, char) {
        var result = "";
        while(stream.length) {
            if (stream.substr(0, char.length) === char) {
                return {result, left: stream};
            }
            result += stream.substr(0,1); 
            stream = stream.substr(1);
        }
        return {result, left: stream};
    }

    handleRawData(connection, rawData, thisObj) {
        try {
            var data = rawData.toString();
            var {result: reqLine, left: data} = thisObj.readUntil(data, "\r\n");
            var {result: headers, left: data} = thisObj.readUntil(data, "\r\n\r\n");

            headers = thisObj.headersToHeaderObj(headers.trim().split("\r\n"));

            var stream = thisObj.handleHTTPRequest(connection, reqLine, headers, data, thisObj);

            if (stream) return thisObj.handleRawData(connection, stream, thisObj); // if more than one request then parse the next one
        } catch (error) {
            console.log(error);
            return; // request is malformed or just no request at all 
        }
        

        // console.log('connection data from %s: %j', remoteAddress, rawData.toString());  
        // connection.write(rawData);  
    }

    handleHTTPRequest(connection, reqLine, headers, stream, thisObj) {
        if (/^(GET|POST)\x20\/([a-z0-9A-Z]+)?\x20HTTP\/1\.(1|0)$/i.test(reqLine)) {

            const httpMethod = reqLine.match(/^(\w+)/i)[0];
            const resource = reqLine.match(/\/([0-9a-zA-Z\?#=]+)?/i)[0]; // filter here
            thisObj.httpVersion = reqLine.match(/HTTP\/1\.(1|0)$/i)[0].replace(/http\//i, "");

            if (thisObj.httpVersion !== "1.1") {
                thisObj.error = "We only support http 1.1";
            }

            if (headers["Content-Length"]) 
                var {result: body, left: stream} = thisObj.readBytes(stream, headers["Content-Length"]);

            // do some filter in query string and body, then forward the request to backend-server

            thisObj.giveRespond(
                connection, 
                {
                    httpCode: 200,
                    httpVersion: thisObj.httpVersion
                }, 
                {}, 
                "alooo\r\n"
            );

            return stream;

        } else {
            thisObj.error = "Unexpected error";
        }
        return stream;
    }

    readBytes(stream, byteToRead) {
        var goal = byteToRead;
        var result = "";
        while (goal) {
            var temp = stream.substr(0,1);
            result += temp;
            stream = stream.substr(1);
            if (temp === "\r") 
                continue;
            --goal;
        }
        return {result, left: stream}
    }

    headersToHeaderObj(headers) {
        const headerObj = {};

        headers.forEach(header => {
            const [key, value] = header.split(":");
            headerObj[key.trim()] = value.trim(); // doing some NORMALIZATION here, notice!
        });
        return headerObj;
    } 

    giveRespond(connection, options = {}, headers = {}, body = "") {
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
        finalResponse += `Content-Length: ${this.getActualLength(responseBody)}\r\n\r\n`;

        finalResponse += responseBody;
        connection.write(finalResponse);

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

    getActualLength(rawStr) {
        return rawStr.replace(/\r\n/, " ").length;
    }

}

module.exports = TCPSocket;