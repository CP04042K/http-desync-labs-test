class RequestPool {

    constructor() {
        this.pool = "";
    }

    addToPool(buffer) {
        this.pool += buffer;
    }

    readUntil(char) {
        var result = "";
        while(this.pool.length) {
            if (this.pool.substr(0, char.length) === char) {
                this.pool = this.pool.substr(char.length);
                return result;
            }
            result += this.pool.substr(0,1); 
            this.pool = this.pool.substr(1);
        }
        return result;
    }

    isPoolEmpty() {
        return !this.pool.length;
    }

    readBytes(byteToRead) {
        const result = this.pool.substr(0, byteToRead);
        this.pool = this.pool.substr(byteToRead);
        return result;
    }
}

module.exports = RequestPool;