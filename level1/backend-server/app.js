const TCPSocket = require('./libs/tcpSocket');

tcpServer = new TCPSocket('server');

tcpServer.listen(8081);